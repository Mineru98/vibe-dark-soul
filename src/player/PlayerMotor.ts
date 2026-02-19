/**
 * Player Motor
 *
 * Handles player movement physics:
 * - Horizontal movement with state-based speed
 * - Gravity and vertical velocity
 * - Jump impulses
 * - Roll/dodge movement
 * - Rotation (yaw) management
 *
 * IMPORTANT: Rapier KCC does not support rotation.
 * The collider stays upright; only the mesh rotates.
 */

import * as THREE from 'three';
import { CharacterControllerAdapter, MovementResult } from '../physics/CharacterControllerAdapter';
import { CollisionGroups } from '../physics/CollisionGroups';
import { PlayerStateType, MOVEMENT_STATES } from './PlayerState';

/**
 * Motor configuration
 */
export interface PlayerMotorConfig {
  // Initial position
  position: THREE.Vector3;

  // Capsule dimensions
  radius?: number;
  halfHeight?: number;

  // Movement speeds (m/s)
  walkSpeed?: number;
  runSpeed?: number;
  sprintSpeed?: number;
  rollSpeed?: number;
  backstepSpeed?: number;

  // Physics
  gravity?: number;
  jumpVelocity?: number;
  terminalVelocity?: number;

  // Rotation
  rotationSpeed?: number; // rad/s

  // Entity ID for collision mapping
  entityId?: string;
}

/**
 * Default motor configuration
 */
const DEFAULT_CONFIG: Partial<PlayerMotorConfig> = {
  radius: 0.3,
  halfHeight: 0.7,
  walkSpeed: 3.5,
  runSpeed: 5.0,
  sprintSpeed: 7.0,
  rollSpeed: 8.0,
  backstepSpeed: 5.0,
  gravity: -20.0,
  jumpVelocity: 8.0,
  terminalVelocity: -30.0,
  rotationSpeed: 10.0,
};

/**
 * Player Motor class
 */
export class PlayerMotor {
  // Character controller
  private kcc: CharacterControllerAdapter;

  // Configuration
  private config: Required<PlayerMotorConfig>;

  // Current state
  private _currentState: PlayerStateType = PlayerStateType.Idle;

  // Rotation (yaw angle in radians)
  private _yaw: number = 0;
  private _targetYaw: number = 0;

  // Movement input (normalized direction in world space)
  private _inputDirection: THREE.Vector3 = new THREE.Vector3();

  // Cached values
  private _forward: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
  private _right: THREE.Vector3 = new THREE.Vector3(1, 0, 0);

  // Roll state
  private _rollDirection: THREE.Vector3 = new THREE.Vector3();
  private _isRolling: boolean = false;

  // 뒤로 이동 상태
  private _isMovingBackward: boolean = false;

  constructor(config: PlayerMotorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<PlayerMotorConfig>;

    // Create character controller
    this.kcc = new CharacterControllerAdapter({
      position: config.position,
      radius: this.config.radius,
      halfHeight: this.config.halfHeight,
      collisionGroups: CollisionGroups.PLAYER,
      entityId: this.config.entityId,
    });
  }

  /**
   * Update motor state
   *
   * @param state Current player state
   * @param movementMultiplier Speed multiplier from FSM
   */
  setState(state: PlayerStateType, movementMultiplier: number = 1.0): void {
    const prevState = this._currentState;
    this._currentState = state;

    // Handle state transitions
    if (state === PlayerStateType.Roll && prevState !== PlayerStateType.Roll) {
      this.startRoll();
    } else if (state === PlayerStateType.Backstep && prevState !== PlayerStateType.Backstep) {
      this.startBackstep();
    } else if (state !== PlayerStateType.Roll && state !== PlayerStateType.Backstep) {
      this._isRolling = false;
    }
  }

  /**
   * Set movement input direction (world space, normalized)
   */
  setInputDirection(direction: THREE.Vector3): void {
    this._inputDirection.copy(direction);

    // Update target yaw if moving
    if (direction.lengthSq() > 0.01) {
      this._targetYaw = Math.atan2(direction.x, direction.z);
    }
  }

  /**
   * Set input direction from camera-relative input
   *
   * @param inputX Horizontal input (-1 to 1)
   * @param inputY Vertical input (-1 to 1)
   * @param cameraYaw Camera yaw angle in radians
   */
  setInputFromCamera(inputX: number, inputY: number, cameraYaw: number): void {
    if (Math.abs(inputX) < 0.01 && Math.abs(inputY) < 0.01) {
      this._inputDirection.set(0, 0, 0);
      this._isMovingBackward = false;
      return;
    }

    // Transform input to world space based on camera yaw
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);

    // Forward is -Z, right is +X
    // inputY > 0 = forward, inputX > 0 = right
    const worldX = inputX * cos - inputY * sin;
    const worldZ = inputX * sin + inputY * cos;

    this._inputDirection.set(worldX, 0, worldZ).normalize();

    // S키만 눌렀을 때 (뒤로만 이동) - 캐릭터가 회전하지 않고 뒤로 이동
    if (inputY < -0.1 && Math.abs(inputX) < 0.1) {
      this._isMovingBackward = true;
      // 카메라 방향을 바라보며 뒤로 이동 (회전하지 않음)
      this._targetYaw = cameraYaw + Math.PI; // 카메라 반대 방향 (카메라를 바라봄)
    } else {
      this._isMovingBackward = false;
      this._targetYaw = Math.atan2(worldX, worldZ);
    }
  }

  /**
   * Apply jump impulse
   */
  jump(): void {
    this.kcc.setVerticalVelocity(this.config.jumpVelocity);
    // Disable snap to ground while jumping
    this.kcc.disableSnapToGround();
  }

  /**
   * Start roll in current facing or input direction
   */
  private startRoll(): void {
    this._isRolling = true;

    // Roll in input direction if available, otherwise forward
    if (this._inputDirection.lengthSq() > 0.01) {
      this._rollDirection.copy(this._inputDirection).normalize();
      // Snap yaw to roll direction
      this._yaw = Math.atan2(this._rollDirection.x, this._rollDirection.z);
      this._targetYaw = this._yaw;
    } else {
      // Roll forward
      this._rollDirection.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    }
  }

  /**
   * Start backstep (always backward relative to facing)
   */
  private startBackstep(): void {
    this._isRolling = true;
    // Backstep is opposite of facing direction
    this._rollDirection.set(-Math.sin(this._yaw), 0, -Math.cos(this._yaw));
  }

  /**
   * Compute and apply movement for this frame
   *
   * @param dt Delta time
   * @param movementMultiplier Speed multiplier from FSM
   * @returns Movement result
   */
  update(dt: number, movementMultiplier: number = 1.0): MovementResult {
    // Calculate horizontal movement
    const horizontalMove = this.computeHorizontalMovement(dt, movementMultiplier);

    // Update rotation
    this.updateRotation(dt);

    // Re-enable snap to ground when grounded
    if (this.kcc.grounded && this.kcc.verticalVelocity <= 0) {
      this.kcc.setSnapToGround(this.config.radius);
    }

    // Apply movement with gravity
    return this.kcc.moveWithGravity(horizontalMove, dt, this.config.gravity);
  }

  /**
   * Compute horizontal movement vector
   */
  private computeHorizontalMovement(dt: number, movementMultiplier: number): THREE.Vector3 {
    const movement = new THREE.Vector3();

    // During roll/backstep, use roll direction
    if (this._isRolling) {
      const speed =
        this._currentState === PlayerStateType.Backstep
          ? this.config.backstepSpeed
          : this.config.rollSpeed;
      movement.copy(this._rollDirection).multiplyScalar(speed * dt);
      return movement;
    }

    // Check if current state allows movement
    if (!MOVEMENT_STATES.has(this._currentState)) {
      return movement;
    }

    // No input = no movement
    if (this._inputDirection.lengthSq() < 0.01) {
      return movement;
    }

    // Determine speed based on state
    let baseSpeed: number;
    switch (this._currentState) {
      case PlayerStateType.Sprint:
        baseSpeed = this.config.sprintSpeed;
        break;
      case PlayerStateType.Run:
        baseSpeed = this.config.runSpeed;
        break;
      case PlayerStateType.Walk:
      case PlayerStateType.Idle:
      default:
        baseSpeed = this.config.walkSpeed;
        break;
    }

    // Apply movement multiplier and delta time
    const speed = baseSpeed * movementMultiplier;
    movement.copy(this._inputDirection).multiplyScalar(speed * dt);

    return movement;
  }

  /**
   * Update rotation smoothly towards target yaw
   */
  private updateRotation(dt: number): void {
    // Don't rotate during certain states
    if (
      this._currentState === PlayerStateType.Roll ||
      this._currentState === PlayerStateType.Backstep ||
      this._currentState === PlayerStateType.HitStun
    ) {
      return;
    }

    // Calculate shortest angle difference
    let diff = this._targetYaw - this._yaw;

    // Normalize to -PI to PI
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Apply rotation
    const maxRotation = this.config.rotationSpeed * dt;
    if (Math.abs(diff) < maxRotation) {
      this._yaw = this._targetYaw;
    } else {
      this._yaw += Math.sign(diff) * maxRotation;
    }

    // Normalize yaw
    while (this._yaw > Math.PI) this._yaw -= Math.PI * 2;
    while (this._yaw < -Math.PI) this._yaw += Math.PI * 2;
  }

  /**
   * Teleport to position
   */
  teleport(position: THREE.Vector3): void {
    this.kcc.teleport(position);
  }

  /**
   * Set facing direction (yaw)
   */
  setYaw(yaw: number): void {
    this._yaw = yaw;
    this._targetYaw = yaw;
  }

  /**
   * Look at a target position
   */
  lookAt(target: THREE.Vector3): void {
    const pos = this.kcc.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    this._targetYaw = Math.atan2(dx, dz);
  }

  /**
   * Instantly face a target
   */
  faceTarget(target: THREE.Vector3): void {
    const pos = this.kcc.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    this._yaw = Math.atan2(dx, dz);
    this._targetYaw = this._yaw;
  }

  // ========== Getters ==========

  /**
   * Get current position
   */
  get position(): THREE.Vector3 {
    return this.kcc.position;
  }

  /**
   * Get position reference (for performance)
   */
  getPositionRef(): THREE.Vector3 {
    return this.kcc.getPositionRef();
  }

  /**
   * Get current yaw (rotation around Y axis)
   */
  get yaw(): number {
    return this._yaw;
  }

  /**
   * Get quaternion for mesh rotation
   */
  getRotation(): THREE.Quaternion {
    return new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this._yaw
    );
  }

  /**
   * Get forward direction (world space)
   */
  get forward(): THREE.Vector3 {
    this._forward.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    return this._forward;
  }

  /**
   * Get right direction (world space)
   */
  get right(): THREE.Vector3 {
    this._right.set(Math.cos(this._yaw), 0, -Math.sin(this._yaw));
    return this._right;
  }

  /**
   * Check if grounded
   */
  get grounded(): boolean {
    return this.kcc.grounded;
  }

  /**
   * Check if moving backward (S키만 눌렀을 때)
   */
  get isMovingBackward(): boolean {
    return this._isMovingBackward;
  }

  /**
   * Get vertical velocity
   */
  get verticalVelocity(): number {
    return this.kcc.verticalVelocity;
  }

  /**
   * Get capsule height
   */
  get height(): number {
    return this.kcc.height;
  }

  /**
   * Get the underlying character controller
   */
  getKCC(): CharacterControllerAdapter {
    return this.kcc;
  }

  // ========== Cleanup ==========

  /**
   * Destroy the motor
   */
  destroy(): void {
    this.kcc.destroy();
  }
}
