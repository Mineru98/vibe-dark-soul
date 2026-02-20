/**
 * Lock-On System
 *
 * Dark Souls style lock-on targeting:
 * - Target candidate selection by distance and field of view
 * - Line of Sight (LOS) verification
 * - Target switching (left/right)
 * - Auto-release when target is lost or too far
 */

import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CollisionGroups, CollisionGroup } from '../physics/CollisionGroups';
import { EventBus } from '../core/EventBus';

/**
 * Lock-on target interface
 */
export interface LockOnTarget {
  entityId: string;
  position: THREE.Vector3;
  // Height offset for lock-on point (e.g., chest level)
  lockOnHeight?: number;
  // Priority (higher = more likely to be selected)
  priority?: number;
  // Whether this target can be locked on to
  canLockOn?: boolean;
}

/**
 * Lock-on system configuration
 */
export interface LockOnSystemConfig {
  // Maximum distance to acquire a target
  maxLockDistance?: number;

  // Maximum distance before lock is released
  maxReleaseDistance?: number;

  // Field of view for target acquisition (radians, from camera forward)
  lockOnFOV?: number;

  // Field of view for target switching (wider than acquisition)
  switchFOV?: number;

  // Minimum time between target switches (seconds)
  switchCooldown?: number;

  // Height offset for lock-on point (default)
  defaultLockOnHeight?: number;

  // How often to verify LOS (seconds)
  losCheckInterval?: number;

  // Time without LOS before releasing lock (seconds)
  losLostTimeout?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<LockOnSystemConfig> = {
  maxLockDistance: 20.0,
  maxReleaseDistance: 25.0,
  lockOnFOV: Math.PI / 3, // 60 degrees
  switchFOV: Math.PI / 2, // 90 degrees
  switchCooldown: 0.3,
  defaultLockOnHeight: 1.2,
  losCheckInterval: 0.1,
  losLostTimeout: 1.0,
};

/**
 * Internal target data
 */
interface TargetData {
  target: LockOnTarget;
  distance: number;
  angle: number; // Angle from camera forward
  screenX: number; // Screen space X (-1 to 1)
}

/**
 * Lock-On System class
 */
export class LockOnSystem {
  // Configuration
  private config: Required<LockOnSystemConfig>;

  // Registered targets
  private targets: Map<string, LockOnTarget> = new Map();

  // Current lock-on state
  private _currentTarget: LockOnTarget | null = null;
  private _lockOnPoint: THREE.Vector3 = new THREE.Vector3();

  // References
  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  private cameraForward: THREE.Vector3 = new THREE.Vector3();
  private cameraPosition: THREE.Vector3 = new THREE.Vector3();

  // Timing
  private switchCooldownTimer: number = 0;
  private losCheckTimer: number = 0;
  private losLostTimer: number = 0;
  private hasLOS: boolean = true;

  // Player collider to exclude from LOS checks
  private playerCollider: any = null;

  // Temporary vectors
  private _tempVec3: THREE.Vector3 = new THREE.Vector3();
  private _tempVec3B: THREE.Vector3 = new THREE.Vector3();

  constructor(config: LockOnSystemConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a potential lock-on target
   */
  registerTarget(target: LockOnTarget): void {
    this.targets.set(target.entityId, {
      lockOnHeight: this.config.defaultLockOnHeight,
      priority: 0,
      canLockOn: true,
      ...target,
    });
  }

  /**
   * Unregister a target
   */
  unregisterTarget(entityId: string): void {
    this.targets.delete(entityId);

    // Release lock if current target was removed
    if (this._currentTarget?.entityId === entityId) {
      this.releaseLock();
    }
  }

  /**
   * Update target position
   */
  updateTargetPosition(entityId: string, position: THREE.Vector3): void {
    const target = this.targets.get(entityId);
    if (target) {
      target.position.copy(position);
    }
  }

  /**
   * Set player position for distance calculations
   */
  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Set camera orientation for angle calculations
   */
  setCamera(position: THREE.Vector3, forward: THREE.Vector3): void {
    this.cameraPosition.copy(position);
    this.cameraForward.copy(forward).normalize();
  }

  /**
   * Set player collider to exclude from LOS checks
   */
  setPlayerCollider(collider: any): void {
    this.playerCollider = collider;
  }

  /**
   * Toggle lock-on (acquire or release)
   *
   * @returns true if locked on, false if released
   */
  toggleLockOn(): boolean {
    if (this._currentTarget) {
      this.releaseLock();
      return false;
    } else {
      return this.acquireLock();
    }
  }

  /**
   * Acquire a new lock-on target
   *
   * @returns true if a target was acquired
   */
  acquireLock(): boolean {
    const candidates = this.getCandidates(this.config.lockOnFOV);

    if (candidates.length === 0) {
      return false;
    }

    // Select best candidate (closest with highest priority)
    candidates.sort((a, b) => {
      // Priority first
      const priorityDiff = (b.target.priority ?? 0) - (a.target.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;

      // Then distance
      return a.distance - b.distance;
    });

    this._currentTarget = candidates[0].target;
    this.updateLockOnPoint();

    EventBus.emit('lockOn:acquired', {
      entityId: this._currentTarget.entityId,
    });

    return true;
  }

  /**
   * Release current lock-on
   */
  releaseLock(): void {
    if (this._currentTarget) {
      EventBus.emit('lockOn:released', {
        entityId: this._currentTarget.entityId,
      });
    }

    this._currentTarget = null;
    this.hasLOS = true;
    this.losLostTimer = 0;
  }

  /**
   * Switch to next target (right)
   */
  switchTargetRight(): boolean {
    return this.switchTarget(1);
  }

  /**
   * Switch to next target (left)
   */
  switchTargetLeft(): boolean {
    return this.switchTarget(-1);
  }

  /**
   * Switch to adjacent target
   *
   * @param direction 1 for right, -1 for left
   */
  private switchTarget(direction: number): boolean {
    if (!this._currentTarget) return false;
    if (this.switchCooldownTimer > 0) return false;

    const candidates = this.getCandidates(this.config.switchFOV);

    if (candidates.length <= 1) return false;

    // Sort by screen X position
    candidates.sort((a, b) => a.screenX - b.screenX);

    // Find current target index
    const currentIndex = candidates.findIndex(
      (c) => c.target.entityId === this._currentTarget?.entityId
    );

    if (currentIndex === -1) return false;

    // Get next target in direction
    let nextIndex = currentIndex + direction;

    // Wrap around
    if (nextIndex < 0) nextIndex = candidates.length - 1;
    if (nextIndex >= candidates.length) nextIndex = 0;

    // Don't switch to same target
    if (nextIndex === currentIndex) return false;

    // Switch
    this._currentTarget = candidates[nextIndex].target;
    this.updateLockOnPoint();
    this.switchCooldownTimer = this.config.switchCooldown;

    EventBus.emit('lockOn:switched', {
      entityId: this._currentTarget.entityId,
    });

    return true;
  }

  /**
   * Get valid lock-on candidates
   */
  private getCandidates(maxAngle: number): TargetData[] {
    const candidates: TargetData[] = [];

    for (const target of this.targets.values()) {
      // Skip if can't lock on
      if (!target.canLockOn) continue;

      // Calculate distance
      const distance = this.playerPosition.distanceTo(target.position);

      // Skip if too far
      if (distance > this.config.maxLockDistance) continue;

      // Calculate direction to target
      const toTarget = this._tempVec3.copy(target.position).sub(this.playerPosition);
      toTarget.y = 0; // Ignore vertical for angle calculation
      toTarget.normalize();

      // Calculate angle from camera forward
      const cameraForwardXZ = this._tempVec3B.copy(this.cameraForward);
      cameraForwardXZ.y = 0;
      cameraForwardXZ.normalize();

      const angle = Math.acos(
        Math.max(-1, Math.min(1, cameraForwardXZ.dot(toTarget)))
      );

      // Skip if outside FOV
      if (angle > maxAngle) continue;

      // Check LOS
      if (!this.checkLOS(target)) continue;

      // Calculate screen X (for switching)
      const cross = cameraForwardXZ.cross(toTarget);
      const screenX = cross.y > 0 ? angle : -angle;

      candidates.push({
        target,
        distance,
        angle,
        screenX,
      });
    }

    return candidates;
  }

  /**
   * Check line of sight to target
   */
  private checkLOS(target: LockOnTarget): boolean {
    const lockOnPoint = this._tempVec3.copy(target.position);
    lockOnPoint.y += target.lockOnHeight ?? this.config.defaultLockOnHeight;

    // Ray from player eye level to target lock-on point
    const origin = this._tempVec3B.copy(this.playerPosition);
    origin.y += 1.5; // Eye level

    const direction = lockOnPoint.clone().sub(origin).normalize();
    const maxDistance = origin.distanceTo(lockOnPoint);

    // Only check against environment
    const filterGroups = CollisionGroups.createFilter(
      CollisionGroup.ENVIRONMENT,
      CollisionGroup.ENVIRONMENT
    );

    const excludeColliders = this.playerCollider ? [this.playerCollider] : undefined;

    const hit = PhysicsWorld.castRay(
      origin,
      direction,
      maxDistance - 0.1, // Small buffer
      filterGroups,
      excludeColliders
    );

    return hit === null;
  }

  /**
   * Update lock-on point position
   */
  private updateLockOnPoint(): void {
    if (!this._currentTarget) return;

    this._lockOnPoint.copy(this._currentTarget.position);
    this._lockOnPoint.y +=
      this._currentTarget.lockOnHeight ?? this.config.defaultLockOnHeight;
  }

  /**
   * Update system (call every frame)
   *
   * @param dt Delta time in seconds
   */
  update(dt: number): void {
    // Update cooldown
    if (this.switchCooldownTimer > 0) {
      this.switchCooldownTimer -= dt;
    }

    // Update lock-on state
    if (this._currentTarget) {
      // Update lock-on point
      this.updateLockOnPoint();

      // Check distance
      const distance = this.playerPosition.distanceTo(this._currentTarget.position);
      if (distance > this.config.maxReleaseDistance) {
        this.releaseLock();
        return;
      }

      // Check if target can still be locked on
      if (!this._currentTarget.canLockOn) {
        this.releaseLock();
        return;
      }

      // Periodic LOS check
      this.losCheckTimer -= dt;
      if (this.losCheckTimer <= 0) {
        this.losCheckTimer = this.config.losCheckInterval;

        const currentLOS = this.checkLOS(this._currentTarget);

        if (!currentLOS) {
          this.losLostTimer += this.config.losCheckInterval;

          if (this.losLostTimer >= this.config.losLostTimeout) {
            this.releaseLock();
          }
        } else {
          this.losLostTimer = 0;
        }

        this.hasLOS = currentLOS;
      }
    }
  }

  // ========== Getters ==========

  /**
   * Get current lock-on target
   */
  get currentTarget(): LockOnTarget | null {
    return this._currentTarget;
  }

  /**
   * Get current lock-on point (world position)
   */
  get lockOnPoint(): THREE.Vector3 | null {
    if (!this._currentTarget) return null;
    return this._lockOnPoint;
  }

  /**
   * Check if currently locked on
   */
  get isLockedOn(): boolean {
    return this._currentTarget !== null;
  }

  /**
   * Check if current target is visible (has LOS)
   */
  get targetVisible(): boolean {
    return this.hasLOS;
  }

  /**
   * Get all registered targets
   */
  getTargets(): LockOnTarget[] {
    return Array.from(this.targets.values());
  }

  /**
   * Get target by entity ID
   */
  getTarget(entityId: string): LockOnTarget | undefined {
    return this.targets.get(entityId);
  }

  // ========== Cleanup ==========

  /**
   * Clear all targets
   */
  clear(): void {
    this.targets.clear();
    this._currentTarget = null;
  }
}
