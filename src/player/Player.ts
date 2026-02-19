/**
 * Player Entity
 *
 * Main player class that integrates all subsystems:
 * - Motor: Movement physics
 * - FSM: State machine
 * - Stats: HP/Stamina
 * - Mesh/Animation: Visual representation
 *
 * This is the primary interface for player-related operations.
 */

import * as THREE from 'three';
import { PlayerMotor, PlayerMotorConfig } from './PlayerMotor';
import { PlayerFSM, PlayerFSMCallbacks } from './PlayerFSM';
import { PlayerStats, PlayerStatsConfig, DamageInfo } from './PlayerStats';
import { PlayerStateType, IFRAME_STATES, STATE_ANIMATIONS } from './PlayerState';
import { InputManager } from '../input/InputManager';
import { Action } from '../input/Action';
import { EventBus } from '../core/EventBus';

/**
 * Player configuration
 */
export interface PlayerConfig {
  // Initial position
  position: THREE.Vector3;

  // Motor config overrides
  motor?: Partial<PlayerMotorConfig>;

  // Stats config overrides
  stats?: PlayerStatsConfig;

  // Visual
  mesh?: THREE.Object3D;

  // Entity ID
  entityId?: string;
}

/**
 * Animation callback type
 */
export type AnimationCallback = (
  name: string,
  options?: { loop?: boolean; speed?: number }
) => void;

/**
 * Player class
 */
export class Player {
  // Entity ID
  readonly entityId: string;

  // Subsystems
  private motor: PlayerMotor;
  private fsm: PlayerFSM;
  private stats: PlayerStats;

  // Visual
  private mesh: THREE.Object3D | null = null;
  private animationCallback: AnimationCallback | null = null;

  // Lock-on target
  private lockOnTarget: THREE.Vector3 | null = null;

  // Camera yaw for input transformation
  private cameraYaw: number = 0;

  constructor(config: PlayerConfig) {
    this.entityId = config.entityId ?? `player_${Date.now()}`;

    // Initialize motor
    this.motor = new PlayerMotor({
      position: config.position,
      entityId: this.entityId,
      ...config.motor,
    });

    // Initialize stats
    this.stats = new PlayerStats(config.stats);

    // Initialize FSM with callbacks
    const fsmCallbacks: PlayerFSMCallbacks = {
      onStateEnter: this.handleStateEnter.bind(this),
      onStateExit: this.handleStateExit.bind(this),
      onAnimationTrigger: this.handleAnimationTrigger.bind(this),
      onConsumeStamina: this.handleConsumeStamina.bind(this),
      getStamina: () => this.stats.currentStamina,
    };
    this.fsm = new PlayerFSM(fsmCallbacks);

    // Set mesh if provided
    if (config.mesh) {
      this.setMesh(config.mesh);
    }

    // Register entity
    EventBus.emit('player:spawned', {
      entityId: this.entityId,
      position: config.position.clone(),
    });
  }

  /**
   * Set the player mesh
   */
  setMesh(mesh: THREE.Object3D): void {
    this.mesh = mesh;
    this.syncMeshTransform();
  }

  /**
   * Set animation callback
   */
  setAnimationCallback(callback: AnimationCallback): void {
    this.animationCallback = callback;
  }

  /**
   * Set camera yaw for input transformation
   */
  setCameraYaw(yaw: number): void {
    this.cameraYaw = yaw;
  }

  /**
   * Set lock-on target
   */
  setLockOnTarget(target: THREE.Vector3 | null): void {
    this.lockOnTarget = target;
  }

  /**
   * Main update loop
   *
   * @param dt Delta time
   */
  update(dt: number): void {
    // Skip if dead
    if (this.stats.isDead) return;

    // Process input
    this.processInput();

    // Update FSM (handles state transitions)
    this.fsm.preUpdate();
    this.fsm.update(dt);

    // Update motor state from FSM
    this.motor.setState(this.fsm.currentState, this.fsm.movementMultiplier);

    // Apply lock-on rotation if active
    if (this.lockOnTarget) {
      this.motor.lookAt(this.lockOnTarget);
    }

    // Update physics
    this.motor.update(dt, this.fsm.movementMultiplier);

    // Update stats (stamina regen, etc.)
    this.stats.update(dt);

    // Sync mesh transform
    this.syncMeshTransform();

    // Check fall state
    this.checkAirborneState();
  }

  /**
   * Process input and feed to FSM
   */
  private processInput(): void {
    // Movement input
    const moveInput = InputManager.getMovementVector();

    if (moveInput.x !== 0 || moveInput.y !== 0) {
      this.motor.setInputFromCamera(moveInput.x, moveInput.y, this.cameraYaw);
    } else {
      this.motor.setInputDirection(new THREE.Vector3(0, 0, 0));
    }

    // Sprint state (hold to sprint)
    const isSprinting = InputManager.isPressed(Action.Sprint);

    // Feed movement to FSM
    this.fsm.setMovementInput(moveInput.x, moveInput.y, isSprinting);

    // 뒤로 이동 상태 전달
    this.fsm.setMovingBackward(this.motor.isMovingBackward);

    // Guard state
    this.fsm.setGuardHeld(InputManager.isPressed(Action.Block));
  }

  /**
   * Check and handle airborne state
   */
  private checkAirborneState(): void {
    const grounded = this.motor.grounded;

    if (!grounded && this.fsm.currentState !== PlayerStateType.Falling) {
      // Transition to falling if airborne
      const verticalVel = this.motor.verticalVelocity;
      if (verticalVel < -1) {
        // Significant downward velocity
        this.fsm.setAirborne(true);
      }
    } else if (grounded) {
      this.fsm.setAirborne(false);
    }
  }

  /**
   * Sync mesh transform to motor position/rotation
   */
  private syncMeshTransform(): void {
    if (!this.mesh) return;

    const pos = this.motor.getPositionRef();
    this.mesh.position.copy(pos);

    // Apply rotation (yaw only)
    this.mesh.quaternion.copy(this.motor.getRotation());
  }

  // ========== FSM Callbacks ==========

  private handleStateEnter(state: PlayerStateType, prevState: PlayerStateType): void {
    // Handle jump on entering falling state from ground
    if (state === PlayerStateType.Falling && prevState !== PlayerStateType.Landing) {
      // Disable snap to ground
      this.motor.getKCC().disableSnapToGround();
    }

    // Emit event
    EventBus.emit('player:stateChanged', {
      newState: state,
      prevState,
    });
  }

  private handleStateExit(state: PlayerStateType, nextState: PlayerStateType): void {
    // Re-enable snap to ground when landing
    if (state === PlayerStateType.Falling || state === PlayerStateType.Landing) {
      this.motor.getKCC().setSnapToGround(0.3);
    }
  }

  private handleAnimationTrigger(
    name: string,
    options?: { loop?: boolean; speed?: number }
  ): void {
    if (this.animationCallback) {
      this.animationCallback(name, options);
    }
  }

  private handleConsumeStamina(amount: number): boolean {
    return this.stats.tryConsumeStamina(amount);
  }

  // ========== Combat Interface ==========

  /**
   * Take damage (checks i-frames)
   *
   * @returns true if damage was applied
   */
  takeDamage(info: DamageInfo): boolean {
    // Check i-frames
    if (this.fsm.hasIFrames) {
      EventBus.emit('combat:dodged', {
        entityId: this.entityId,
        damageType: info.type,
      });
      return false;
    }

    // Apply damage
    const result = this.stats.takeDamage(info);

    // Trigger hit stun if not dead and poise broken
    if (result && !this.stats.isDead) {
      if (this.stats.isStaggered) {
        this.fsm.forceState(PlayerStateType.HitStun);
      }
    }

    return result;
  }

  /**
   * Check if player is in attack hit window
   */
  get inHitWindow(): boolean {
    return this.fsm.inHitWindow;
  }

  /**
   * Check if player has i-frames
   */
  get hasIFrames(): boolean {
    return this.fsm.hasIFrames;
  }

  /**
   * Heal player
   */
  heal(amount: number): void {
    this.stats.heal(amount);
  }

  /**
   * Use item (triggers animation and state)
   */
  useItem(): boolean {
    return this.fsm.tryUseItem();
  }

  // ========== Action Triggers ==========

  /**
   * Trigger jump
   */
  jump(): void {
    if (this.motor.grounded && this.stats.canAct) {
      this.motor.jump();
      this.fsm.setAirborne(true);
    }
  }

  /**
   * Interact with nearby object
   */
  interact(): boolean {
    return this.fsm.tryInteract();
  }

  // ========== Getters ==========

  get position(): THREE.Vector3 {
    return this.motor.position;
  }

  get forward(): THREE.Vector3 {
    return this.motor.forward;
  }

  get yaw(): number {
    return this.motor.yaw;
  }

  get currentState(): PlayerStateType {
    return this.fsm.currentState;
  }

  get grounded(): boolean {
    return this.motor.grounded;
  }

  // Stats getters
  get currentHP(): number {
    return this.stats.currentHP;
  }
  get maxHP(): number {
    return this.stats.maxHP;
  }
  get hpPercent(): number {
    return this.stats.hpPercent;
  }

  get currentStamina(): number {
    return this.stats.currentStamina;
  }
  get maxStamina(): number {
    return this.stats.maxStamina;
  }
  get staminaPercent(): number {
    return this.stats.staminaPercent;
  }

  get isDead(): boolean {
    return this.stats.isDead;
  }

  // Subsystem access (for advanced use)
  getMotor(): PlayerMotor {
    return this.motor;
  }

  getFSM(): PlayerFSM {
    return this.fsm;
  }

  getStats(): PlayerStats {
    return this.stats;
  }

  getMesh(): THREE.Object3D | null {
    return this.mesh;
  }

  // ========== Lifecycle ==========

  /**
   * Teleport player to position
   */
  teleport(position: THREE.Vector3): void {
    this.motor.teleport(position);
    this.syncMeshTransform();
  }

  /**
   * Respawn player
   */
  respawn(position: THREE.Vector3): void {
    this.motor.teleport(position);
    this.stats.respawn();
    this.fsm.reset();
    this.syncMeshTransform();

    EventBus.emit('player:spawned', {
      entityId: this.entityId,
      position: position.clone(),
    });
  }

  /**
   * Destroy player entity
   */
  destroy(): void {
    this.motor.destroy();

    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
