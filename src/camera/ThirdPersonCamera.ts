/**
 * Third Person Camera
 *
 * Features:
 * - Orbit camera (pitch/yaw rotation)
 * - Collision avoidance via raycast
 * - Smooth interpolation
 * - Lock-on mode support
 * - Shoulder offset for better combat visibility
 */

import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CollisionGroups, CollisionGroup } from '../physics/CollisionGroups';

/**
 * Camera configuration
 */
export interface ThirdPersonCameraConfig {
  // Distance from target
  distance?: number;
  minDistance?: number;
  maxDistance?: number;

  // Height offset from target pivot
  heightOffset?: number;

  // Shoulder offset (positive = right)
  shoulderOffset?: number;

  // Rotation limits
  minPitch?: number; // Radians, looking up limit
  maxPitch?: number; // Radians, looking down limit

  // Rotation speed (radians per pixel of mouse movement)
  rotationSensitivity?: number;

  // Smoothing
  positionLerpSpeed?: number;
  rotationLerpSpeed?: number;

  // Collision
  collisionRadius?: number;
  collisionPadding?: number;

  // Initial angles
  initialYaw?: number;
  initialPitch?: number;
}

/**
 * Default camera configuration
 */
const DEFAULT_CONFIG: Required<ThirdPersonCameraConfig> = {
  distance: 4.0,
  minDistance: 1.5,
  maxDistance: 8.0,
  heightOffset: 1.6, // Eye level
  shoulderOffset: 0.5, // Slight right offset
  minPitch: -Math.PI / 3, // -60 degrees (looking up)
  maxPitch: Math.PI / 2.5, // 72 degrees (looking down)
  rotationSensitivity: 0.003,
  positionLerpSpeed: 12.0,
  rotationLerpSpeed: 15.0,
  collisionRadius: 0.2,
  collisionPadding: 0.3,
  initialYaw: 0,
  initialPitch: 0.2, // Slightly looking down
};

/**
 * Third Person Camera class
 */
export class ThirdPersonCamera {
  // Three.js camera
  private camera: THREE.PerspectiveCamera;

  // Configuration
  private config: Required<ThirdPersonCameraConfig>;

  // Target to follow
  private target: THREE.Vector3 = new THREE.Vector3();
  private targetObject: THREE.Object3D | null = null;

  // Current camera state
  private _yaw: number;
  private _pitch: number;
  private _distance: number;

  // Desired state (for smoothing)
  private desiredYaw: number;
  private desiredPitch: number;
  private desiredDistance: number;

  // Computed positions
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private desiredPosition: THREE.Vector3 = new THREE.Vector3();

  // Lock-on state
  private lockOnTarget: THREE.Vector3 | null = null;
  private isLockedOn: boolean = false;

  // Temporary vectors (avoid allocations)
  private _tempVec3: THREE.Vector3 = new THREE.Vector3();
  private _tempVec3B: THREE.Vector3 = new THREE.Vector3();

  // Player collider to exclude from raycasts
  private excludeCollider: any = null;

  constructor(config: ThirdPersonCameraConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      55, // FOV
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );

    // Initialize rotation
    this._yaw = this.config.initialYaw;
    this._pitch = this.config.initialPitch;
    this._distance = this.config.distance;

    this.desiredYaw = this._yaw;
    this.desiredPitch = this._pitch;
    this.desiredDistance = this._distance;

    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  /**
   * Set the target to follow
   */
  setTarget(target: THREE.Object3D | THREE.Vector3): void {
    if (target instanceof THREE.Vector3) {
      this.target.copy(target);
      this.targetObject = null;
    } else {
      this.targetObject = target;
    }
  }

  /**
   * Set collider to exclude from collision checks
   */
  setExcludeCollider(collider: any): void {
    this.excludeCollider = collider;
  }

  /**
   * Apply rotation input (from mouse/gamepad)
   *
   * @param deltaX Horizontal input (pixels or normalized)
   * @param deltaY Vertical input (pixels or normalized)
   */
  rotate(deltaX: number, deltaY: number): void {
    // Don't allow manual rotation when locked on
    if (this.isLockedOn) return;

    this.desiredYaw -= deltaX * this.config.rotationSensitivity;
    this.desiredPitch += deltaY * this.config.rotationSensitivity;

    // Clamp pitch
    this.desiredPitch = Math.max(
      this.config.minPitch,
      Math.min(this.config.maxPitch, this.desiredPitch)
    );
  }

  /**
   * Apply zoom input
   *
   * @param delta Zoom delta (positive = zoom out)
   */
  zoom(delta: number): void {
    this.desiredDistance += delta * 0.5;
    this.desiredDistance = Math.max(
      this.config.minDistance,
      Math.min(this.config.maxDistance, this.desiredDistance)
    );
  }

  /**
   * Set lock-on target
   */
  setLockOnTarget(target: THREE.Vector3 | null): void {
    this.lockOnTarget = target;
    this.isLockedOn = target !== null;
  }

  /**
   * Update camera position and rotation
   *
   * @param dt Delta time in seconds
   */
  update(dt: number): void {
    // Update target position
    if (this.targetObject) {
      this.target.copy(this.targetObject.position);
    }

    // Calculate pivot point (target + height offset)
    const pivot = this._tempVec3.copy(this.target);
    pivot.y += this.config.heightOffset;

    // Handle lock-on rotation
    if (this.isLockedOn && this.lockOnTarget) {
      this.updateLockOnRotation(pivot, dt);
    }

    // Smooth rotation interpolation
    this._yaw = this.lerpAngle(this._yaw, this.desiredYaw, this.config.rotationLerpSpeed * dt);
    this._pitch = THREE.MathUtils.lerp(
      this._pitch,
      this.desiredPitch,
      this.config.rotationLerpSpeed * dt
    );
    this._distance = THREE.MathUtils.lerp(
      this._distance,
      this.desiredDistance,
      this.config.positionLerpSpeed * dt
    );

    // Calculate desired camera position
    this.calculateDesiredPosition(pivot);

    // Check for collisions and adjust position
    this.handleCollision(pivot);

    // Smooth position interpolation
    this.currentPosition.lerp(this.desiredPosition, this.config.positionLerpSpeed * dt);

    // Apply to camera
    this.camera.position.copy(this.currentPosition);

    // Look at target (with lock-on offset if applicable)
    if (this.isLockedOn && this.lockOnTarget) {
      // Look between player and target
      const lookTarget = this._tempVec3B.copy(this.target).add(this.lockOnTarget).multiplyScalar(0.5);
      lookTarget.y += this.config.heightOffset * 0.8;
      this.camera.lookAt(lookTarget);
    } else {
      this.camera.lookAt(pivot);
    }
  }

  /**
   * Update rotation for lock-on mode
   */
  private updateLockOnRotation(pivot: THREE.Vector3, dt: number): void {
    if (!this.lockOnTarget) return;

    // Calculate direction from player to target
    const toTarget = this._tempVec3B.copy(this.lockOnTarget).sub(this.target);
    toTarget.y = 0; // Ignore vertical

    if (toTarget.lengthSq() > 0.01) {
      // Calculate yaw to face target
      const targetYaw = Math.atan2(toTarget.x, toTarget.z);
      this.desiredYaw = targetYaw + Math.PI; // Camera behind player

      // Slightly lower pitch for better combat view
      this.desiredPitch = 0.15;
    }
  }

  /**
   * Calculate the desired camera position based on rotation
   */
  private calculateDesiredPosition(pivot: THREE.Vector3): void {
    // Spherical coordinates
    const cosPitch = Math.cos(this._pitch);
    const sinPitch = Math.sin(this._pitch);
    const cosYaw = Math.cos(this._yaw);
    const sinYaw = Math.sin(this._yaw);

    // Camera offset from pivot
    const offsetX = this._distance * cosPitch * sinYaw;
    const offsetY = this._distance * sinPitch;
    const offsetZ = this._distance * cosPitch * cosYaw;

    // Apply shoulder offset (perpendicular to look direction)
    const shoulderX = this.config.shoulderOffset * cosYaw;
    const shoulderZ = -this.config.shoulderOffset * sinYaw;

    this.desiredPosition.set(
      pivot.x + offsetX + shoulderX,
      pivot.y + offsetY,
      pivot.z + offsetZ + shoulderZ
    );
  }

  /**
   * Handle collision with environment
   */
  private handleCollision(pivot: THREE.Vector3): void {
    // Direction from pivot to desired position
    const direction = this._tempVec3B.copy(this.desiredPosition).sub(pivot).normalize();
    const maxDistance = this.desiredPosition.distanceTo(pivot);

    // Exclude player collider and only hit environment
    const filterGroups = CollisionGroups.createFilter(
      CollisionGroup.ENVIRONMENT,
      CollisionGroup.ENVIRONMENT
    );

    const excludeColliders = this.excludeCollider ? [this.excludeCollider] : undefined;

    const hit = PhysicsWorld.castRay(
      pivot,
      direction,
      maxDistance + this.config.collisionPadding,
      filterGroups,
      excludeColliders
    );

    if (hit && hit.distance < maxDistance) {
      // Move camera closer to avoid collision
      const adjustedDistance = Math.max(
        this.config.minDistance,
        hit.distance - this.config.collisionPadding
      );

      this.desiredPosition.copy(pivot).addScaledVector(direction, adjustedDistance);
    }
  }

  /**
   * Lerp between angles (handles wraparound)
   */
  private lerpAngle(from: number, to: number, t: number): number {
    let diff = to - from;

    // Normalize to -PI to PI
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    return from + diff * Math.min(1, t);
  }

  /**
   * Handle window resize
   */
  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ========== Getters ==========

  /**
   * Get the Three.js camera
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Get current yaw angle
   */
  get yaw(): number {
    return this._yaw;
  }

  /**
   * Get current pitch angle
   */
  get pitch(): number {
    return this._pitch;
  }

  /**
   * Get current distance
   */
  get distance(): number {
    return this._distance;
  }

  /**
   * Get camera position
   */
  get position(): THREE.Vector3 {
    return this.camera.position;
  }

  /**
   * Get camera forward direction
   */
  get forward(): THREE.Vector3 {
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera.quaternion);
    return forward;
  }

  /**
   * Check if locked on
   */
  get lockedOn(): boolean {
    return this.isLockedOn;
  }

  // ========== Setters ==========

  /**
   * Set yaw directly
   */
  setYaw(yaw: number): void {
    this._yaw = yaw;
    this.desiredYaw = yaw;
  }

  /**
   * Set pitch directly
   */
  setPitch(pitch: number): void {
    this._pitch = Math.max(this.config.minPitch, Math.min(this.config.maxPitch, pitch));
    this.desiredPitch = this._pitch;
  }

  /**
   * Set distance directly
   */
  setDistance(distance: number): void {
    this._distance = Math.max(
      this.config.minDistance,
      Math.min(this.config.maxDistance, distance)
    );
    this.desiredDistance = this._distance;
  }

  /**
   * Snap to position (no interpolation)
   */
  snapToTarget(): void {
    if (this.targetObject) {
      this.target.copy(this.targetObject.position);
    }

    const pivot = this._tempVec3.copy(this.target);
    pivot.y += this.config.heightOffset;

    this._yaw = this.desiredYaw;
    this._pitch = this.desiredPitch;
    this._distance = this.desiredDistance;

    this.calculateDesiredPosition(pivot);
    this.handleCollision(pivot);
    this.currentPosition.copy(this.desiredPosition);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(pivot);
  }

  // ========== Cleanup ==========

  /**
   * Destroy camera
   */
  destroy(): void {
    window.removeEventListener('resize', this.onResize.bind(this));
  }
}
