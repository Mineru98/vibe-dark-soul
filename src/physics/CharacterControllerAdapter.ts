/**
 * Character Controller Adapter
 *
 * Wraps Rapier's KinematicCharacterController with game-specific logic.
 * Handles:
 * - Movement with collision response
 * - Grounding detection
 * - Slope handling
 * - Gravity application
 *
 * IMPORTANT: Rapier KCC does NOT handle rotation.
 * The collider stays upright; mesh rotation is handled separately.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { CollisionGroups } from './CollisionGroups';

/**
 * Configuration for the character controller
 */
export interface CharacterConfig {
  // Capsule dimensions
  radius: number;
  halfHeight: number;

  // Initial position
  position: THREE.Vector3;

  // Physics settings
  collisionGroups?: number;
  skinWidth?: number; // Offset for numerical stability

  // Movement settings
  maxSlopeClimbAngle?: number; // radians
  minSlopeSlideAngle?: number; // radians

  // Autostep (for stairs/small obstacles)
  autostepMaxHeight?: number;
  autostepMinWidth?: number;
  autostepIncludeDynamic?: boolean;

  // Ground snapping
  snapToGroundDistance?: number;

  // Entity reference
  entityId?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<CharacterConfig> = {
  collisionGroups: CollisionGroups.PLAYER,
  skinWidth: 0.01,
  maxSlopeClimbAngle: Math.PI / 4, // 45 degrees
  minSlopeSlideAngle: Math.PI / 6, // 30 degrees
  autostepMaxHeight: 0.3,
  autostepMinWidth: 0.2,
  autostepIncludeDynamic: true,
  snapToGroundDistance: 0.3,
};

/**
 * Movement result from the character controller
 */
export interface MovementResult {
  // Final position after movement
  position: THREE.Vector3;

  // Whether the character is grounded
  grounded: boolean;

  // Computed movement (may differ from desired due to collisions)
  movement: THREE.Vector3;

  // Number of collisions encountered
  collisionCount: number;
}

/**
 * Character Controller Adapter
 */
export class CharacterControllerAdapter {
  // Rapier components
  private rigidBody: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;
  private world: RAPIER.World;

  // Configuration
  private config: CharacterConfig;

  // Cached values
  private _position: THREE.Vector3 = new THREE.Vector3();
  private _grounded: boolean = false;
  private _lastMovement: THREE.Vector3 = new THREE.Vector3();

  // Vertical velocity (managed externally, but stored here for convenience)
  private _verticalVelocity: number = 0;

  constructor(config: CharacterConfig) {
    // Merge with defaults
    this.config = { ...DEFAULT_CONFIG, ...config } as CharacterConfig;

    // Get physics world
    this.world = PhysicsWorld.getWorld();

    // Create kinematic body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      config.position.x,
      config.position.y,
      config.position.z
    );
    this.rigidBody = this.world.createRigidBody(bodyDesc);

    // Create capsule collider
    const colliderDesc = RAPIER.ColliderDesc.capsule(
      this.config.halfHeight,
      this.config.radius
    ).setCollisionGroups(this.config.collisionGroups!);

    this.collider = this.world.createCollider(colliderDesc, this.rigidBody);

    // Create character controller
    this.controller = this.world.createCharacterController(
      this.config.skinWidth!
    );

    // Configure controller
    this.controller.setMaxSlopeClimbAngle(this.config.maxSlopeClimbAngle!);

    if (this.config.minSlopeSlideAngle !== undefined) {
      this.controller.setMinSlopeSlideAngle(this.config.minSlopeSlideAngle);
    }

    this.controller.enableAutostep(
      this.config.autostepMaxHeight!,
      this.config.autostepMinWidth!,
      this.config.autostepIncludeDynamic!
    );

    this.controller.enableSnapToGround(this.config.snapToGroundDistance!);
    this.controller.setSlideEnabled(true);

    // Register entity mapping
    if (this.config.entityId) {
      PhysicsWorld.registerColliderEntity(this.collider, this.config.entityId);
    }

    // Initialize cached position
    this.updateCachedPosition();
  }

  /**
   * Move the character by the desired translation
   *
   * @param desiredTranslation Desired movement vector (world space)
   * @param filterFlags Optional filter flags for the movement query
   * @param filterGroups Optional collision groups for the movement query
   * @returns Movement result with final position and grounding info
   */
  move(
    desiredTranslation: THREE.Vector3,
    filterFlags?: number,
    filterGroups?: number
  ): MovementResult {
    // Convert to Rapier vector
    const rapierTranslation = {
      x: desiredTranslation.x,
      y: desiredTranslation.y,
      z: desiredTranslation.z,
    };

    // Compute collision-aware movement
    this.controller.computeColliderMovement(
      this.collider,
      rapierTranslation,
      filterFlags,
      filterGroups
    );

    // Get the corrected movement
    const correctedMovement = this.controller.computedMovement();
    this._lastMovement.set(
      correctedMovement.x,
      correctedMovement.y,
      correctedMovement.z
    );

    // Get current position
    const currentPos = this.rigidBody.translation();

    // Apply the movement
    this.rigidBody.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    });

    // Update grounded state
    this._grounded = this.controller.computedGrounded();

    // Update cached position (will be accurate after world.step())
    this.updateCachedPosition();

    // Get collision count
    const collisionCount = this.controller.numComputedCollisions();

    return {
      position: this._position.clone(),
      grounded: this._grounded,
      movement: this._lastMovement.clone(),
      collisionCount,
    };
  }

  /**
   * Move with gravity applied
   *
   * @param horizontalMovement Horizontal movement (XZ plane)
   * @param dt Delta time
   * @param gravity Gravity acceleration (negative for downward)
   * @returns Movement result
   */
  moveWithGravity(
    horizontalMovement: THREE.Vector3,
    dt: number,
    gravity: number = -20
  ): MovementResult {
    // Apply gravity if not grounded
    if (!this._grounded) {
      this._verticalVelocity += gravity * dt;
      // Terminal velocity
      this._verticalVelocity = Math.max(this._verticalVelocity, -30);
    } else {
      // Small downward force to maintain ground contact
      this._verticalVelocity = -0.1;
    }

    // Combine horizontal and vertical movement
    const totalMovement = new THREE.Vector3(
      horizontalMovement.x,
      this._verticalVelocity * dt,
      horizontalMovement.z
    );

    return this.move(totalMovement);
  }

  /**
   * Teleport the character to a position
   */
  teleport(position: THREE.Vector3): void {
    this.rigidBody.setTranslation(
      { x: position.x, y: position.y, z: position.z },
      true
    );
    this.updateCachedPosition();
    this._verticalVelocity = 0;
  }

  /**
   * Set vertical velocity (for jumping, knockback, etc.)
   */
  setVerticalVelocity(velocity: number): void {
    this._verticalVelocity = velocity;
  }

  /**
   * Add to vertical velocity (for impulses)
   */
  addVerticalVelocity(delta: number): void {
    this._verticalVelocity += delta;
  }

  // ========== Getters ==========

  /**
   * Get current position
   */
  get position(): THREE.Vector3 {
    this.updateCachedPosition();
    return this._position.clone();
  }

  /**
   * Get position reference (avoid cloning for performance)
   */
  getPositionRef(): THREE.Vector3 {
    this.updateCachedPosition();
    return this._position;
  }

  /**
   * Check if grounded
   */
  get grounded(): boolean {
    return this._grounded;
  }

  /**
   * Get vertical velocity
   */
  get verticalVelocity(): number {
    return this._verticalVelocity;
  }

  /**
   * Get the raw rigid body
   */
  getRigidBody(): RAPIER.RigidBody {
    return this.rigidBody;
  }

  /**
   * Get the raw collider
   */
  getCollider(): RAPIER.Collider {
    return this.collider;
  }

  /**
   * Get the raw controller
   */
  getController(): RAPIER.KinematicCharacterController {
    return this.controller;
  }

  /**
   * Get capsule radius
   */
  get radius(): number {
    return this.config.radius;
  }

  /**
   * Get capsule half height
   */
  get halfHeight(): number {
    return this.config.halfHeight;
  }

  /**
   * Get total height (capsule + hemispheres)
   */
  get height(): number {
    return this.config.halfHeight * 2 + this.config.radius * 2;
  }

  // ========== Configuration Updates ==========

  /**
   * Update autostep settings
   */
  setAutostep(maxHeight: number, minWidth: number, includeDynamic: boolean = true): void {
    this.controller.enableAutostep(maxHeight, minWidth, includeDynamic);
  }

  /**
   * Disable autostep (for airborne state, etc.)
   */
  disableAutostep(): void {
    this.controller.disableAutostep();
  }

  /**
   * Update snap to ground distance
   */
  setSnapToGround(distance: number): void {
    this.controller.enableSnapToGround(distance);
  }

  /**
   * Disable snap to ground (for jumping)
   */
  disableSnapToGround(): void {
    this.controller.disableSnapToGround();
  }

  /**
   * Set slide enabled
   */
  setSlideEnabled(enabled: boolean): void {
    this.controller.setSlideEnabled(enabled);
  }

  // ========== Collision Iteration ==========

  /**
   * Iterate over computed collisions from the last move
   */
  *getCollisions(): Generator<{
    collider: RAPIER.Collider;
    normal: THREE.Vector3;
  }> {
    const count = this.controller.numComputedCollisions();
    for (let i = 0; i < count; i++) {
      const collision = this.controller.computedCollision(i);
      if (collision) {
        yield {
          collider: collision.collider,
          normal: new THREE.Vector3(
            collision.normal1.x,
            collision.normal1.y,
            collision.normal1.z
          ),
        };
      }
    }
  }

  // ========== Private Methods ==========

  private updateCachedPosition(): void {
    const pos = this.rigidBody.translation();
    this._position.set(pos.x, pos.y, pos.z);
  }

  // ========== Cleanup ==========

  /**
   * Destroy the character controller
   */
  destroy(): void {
    PhysicsWorld.removeBody(this.rigidBody);
    // Note: Controller is automatically cleaned up when body is removed
  }
}
