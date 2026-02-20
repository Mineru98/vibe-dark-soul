/**
 * Physics world wrapper for Rapier 3D
 *
 * Provides:
 * - World initialization and stepping
 * - Character controller creation
 * - Raycast and shape query helpers
 * - Event queue processing
 * - Debug rendering
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CollisionGroups, CollisionGroup } from './CollisionGroups';

/**
 * Raycast hit result
 */
export interface RaycastHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
}

/**
 * Shape cast hit result
 */
export interface ShapeCastHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  timeOfImpact: number;
  collider: RAPIER.Collider;
}

/**
 * Overlap result
 */
export interface OverlapResult {
  collider: RAPIER.Collider;
}

/**
 * Character controller configuration
 */
export interface KCCConfig {
  position: THREE.Vector3;
  radius: number;
  halfHeight: number;
  collisionGroups: number;
  offset?: number; // Skin width for numerical stability
  maxSlopeClimbAngle?: number;
  minSlopeSlideAngle?: number;
  autostepMaxHeight?: number;
  autostepMinWidth?: number;
  snapToGroundDistance?: number;
}

/**
 * Registered body with entity reference
 */
interface RegisteredBody {
  rigidBody: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  entityId?: string;
}

class PhysicsWorldManager {
  private world: RAPIER.World | null = null;
  private eventQueue: RAPIER.EventQueue | null = null;

  private bodies: Map<number, RegisteredBody> = new Map();
  private colliderToEntity: Map<number, string> = new Map();

  private initialized: boolean = false;

  // Debug rendering
  private debugLines: THREE.LineSegments | null = null;
  private debugEnabled: boolean = false;

  /**
   * Initialize the physics world
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize Rapier WASM
    await RAPIER.init();

    // Create world with gravity
    const gravity = { x: 0, y: -20.0, z: 0 }; // Slightly stronger for Souls-like feel
    this.world = new RAPIER.World(gravity);

    // Create event queue for collision events
    this.eventQueue = new RAPIER.EventQueue(true);

    this.initialized = true;
  }

  /**
   * Get the raw Rapier world
   */
  getWorld(): RAPIER.World {
    if (!this.world) throw new Error('PhysicsWorld not initialized');
    return this.world;
  }

  /**
   * Step the physics simulation
   */
  step(): void {
    if (!this.world || !this.eventQueue) return;

    // Step the world
    this.world.step(this.eventQueue);

    // Process collision events
    this.processEvents();
  }

  // ========== Body Creation ==========

  /**
   * Create a static collider (ground, walls, etc.)
   */
  createStaticCollider(
    desc: RAPIER.ColliderDesc,
    entityId?: string
  ): RAPIER.Collider {
    if (!this.world) throw new Error('PhysicsWorld not initialized');

    const collider = this.world.createCollider(desc);

    if (entityId) {
      this.colliderToEntity.set(collider.handle, entityId);
    }

    return collider;
  }

  /**
   * Create a dynamic rigid body with collider
   */
  createDynamicBody(
    bodyDesc: RAPIER.RigidBodyDesc,
    colliderDesc: RAPIER.ColliderDesc,
    entityId?: string
  ): { rigidBody: RAPIER.RigidBody; collider: RAPIER.Collider } {
    if (!this.world) throw new Error('PhysicsWorld not initialized');

    const rigidBody = this.world.createRigidBody(bodyDesc);
    const collider = this.world.createCollider(colliderDesc, rigidBody);

    this.bodies.set(rigidBody.handle, {
      rigidBody,
      colliders: [collider],
      entityId,
    });

    if (entityId) {
      this.colliderToEntity.set(collider.handle, entityId);
    }

    return { rigidBody, collider };
  }

  /**
   * Create a kinematic rigid body (for character controllers)
   */
  createKinematicBody(
    position: THREE.Vector3,
    colliderDesc: RAPIER.ColliderDesc,
    entityId?: string
  ): { rigidBody: RAPIER.RigidBody; collider: RAPIER.Collider } {
    if (!this.world) throw new Error('PhysicsWorld not initialized');

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      position.x,
      position.y,
      position.z
    );

    const rigidBody = this.world.createRigidBody(bodyDesc);
    const collider = this.world.createCollider(colliderDesc, rigidBody);

    this.bodies.set(rigidBody.handle, {
      rigidBody,
      colliders: [collider],
      entityId,
    });

    if (entityId) {
      this.colliderToEntity.set(collider.handle, entityId);
    }

    return { rigidBody, collider };
  }

  /**
   * Create a character controller
   */
  createCharacterController(offset: number = 0.01): RAPIER.KinematicCharacterController {
    if (!this.world) throw new Error('PhysicsWorld not initialized');
    return this.world.createCharacterController(offset);
  }

  /**
   * Create a full character setup (rigid body + collider + KCC)
   */
  createCharacter(config: KCCConfig): {
    rigidBody: RAPIER.RigidBody;
    collider: RAPIER.Collider;
    controller: RAPIER.KinematicCharacterController;
  } {
    if (!this.world) throw new Error('PhysicsWorld not initialized');

    // Create kinematic body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      config.position.x,
      config.position.y,
      config.position.z
    );
    const rigidBody = this.world.createRigidBody(bodyDesc);

    // Create capsule collider (standing upright)
    const colliderDesc = RAPIER.ColliderDesc.capsule(
      config.halfHeight,
      config.radius
    ).setCollisionGroups(config.collisionGroups);
    const collider = this.world.createCollider(colliderDesc, rigidBody);

    // Create character controller
    const controller = this.world.createCharacterController(config.offset ?? 0.01);

    // Configure KCC
    if (config.maxSlopeClimbAngle !== undefined) {
      controller.setMaxSlopeClimbAngle(config.maxSlopeClimbAngle);
    } else {
      controller.setMaxSlopeClimbAngle(Math.PI / 4); // 45 degrees default
    }

    if (config.minSlopeSlideAngle !== undefined) {
      controller.setMinSlopeSlideAngle(config.minSlopeSlideAngle);
    }

    if (
      config.autostepMaxHeight !== undefined &&
      config.autostepMinWidth !== undefined
    ) {
      controller.enableAutostep(
        config.autostepMaxHeight,
        config.autostepMinWidth,
        true // include dynamic bodies
      );
    } else {
      controller.enableAutostep(0.3, 0.2, true);
    }

    if (config.snapToGroundDistance !== undefined) {
      controller.enableSnapToGround(config.snapToGroundDistance);
    } else {
      controller.enableSnapToGround(0.3);
    }

    controller.setSlideEnabled(true);

    return { rigidBody, collider, controller };
  }

  /**
   * Create a sensor/trigger volume
   */
  createTrigger(
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
    entityId?: string
  ): RAPIER.Collider {
    if (!this.world) throw new Error('PhysicsWorld not initialized');

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z
    )
      .setTranslation(position.x, position.y, position.z)
      .setSensor(true)
      .setCollisionGroups(CollisionGroups.TRIGGER)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const collider = this.world.createCollider(colliderDesc);

    if (entityId) {
      this.colliderToEntity.set(collider.handle, entityId);
    }

    return collider;
  }

  // ========== Queries ==========

  /**
   * Cast a ray and return the first hit
   */
  castRay(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    filterGroups?: number,
    excludeColliders?: RAPIER.Collider[]
  ): RaycastHit | null {
    if (!this.world) return null;

    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );

    const excludeSet = new Set(excludeColliders?.map((c) => c.handle) ?? []);

    const hit = this.world.castRay(
      ray,
      maxDistance,
      true,
      undefined,
      filterGroups,
      undefined,
      undefined,
      (collider) => !excludeSet.has(collider.handle)
    );

    if (hit) {
      const collider = hit.collider;
      const hitPoint = ray.pointAt(hit.timeOfImpact);
      // Get the normal at the hit point
      const normal = hit.normal;

      return {
        point: new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
        normal: new THREE.Vector3(normal.x, normal.y, normal.z),
        distance: hit.timeOfImpact,
        collider,
      };
    }

    return null;
  }

  /**
   * Cast a ray and return all hits
   */
  castRayAll(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    filterGroups?: number
  ): RaycastHit[] {
    if (!this.world) return [];

    const results: RaycastHit[] = [];

    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );

    this.world.intersectionsWithRay(
      ray,
      maxDistance,
      true,
      (intersection) => {
        const hitPoint = ray.pointAt(intersection.timeOfImpact);
        results.push({
          point: new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
          normal: new THREE.Vector3(
            intersection.normal.x,
            intersection.normal.y,
            intersection.normal.z
          ),
          distance: intersection.timeOfImpact,
          collider: intersection.collider,
        });
        return true; // Continue searching
      },
      filterGroups
    );

    return results.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Cast a shape and return the first hit
   */
  shapeCast(
    shape: RAPIER.Shape,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    filterGroups?: number,
    excludeColliders?: RAPIER.Collider[]
  ): ShapeCastHit | null {
    if (!this.world) return null;

    const excludeSet = new Set(excludeColliders?.map((c) => c.handle) ?? []);

    const hit = this.world.castShape(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: 0, y: 0, z: 0, w: 1 }, // Identity rotation
      { x: direction.x, y: direction.y, z: direction.z },
      shape,
      { maxToi: maxDistance, targetDistance: 0 },
      true,
      filterGroups,
      undefined,
      undefined,
      (collider) => !excludeSet.has(collider.handle)
    );

    if (hit) {
      return {
        point: new THREE.Vector3(hit.witness1.x, hit.witness1.y, hit.witness1.z),
        normal: new THREE.Vector3(hit.normal1.x, hit.normal1.y, hit.normal1.z),
        timeOfImpact: hit.timeOfImpact,
        collider: hit.collider,
      };
    }

    return null;
  }

  /**
   * Find all colliders overlapping with a shape
   */
  overlapShape(
    shape: RAPIER.Shape,
    position: THREE.Vector3,
    rotation?: THREE.Quaternion,
    filterGroups?: number
  ): OverlapResult[] {
    if (!this.world) return [];

    const results: OverlapResult[] = [];

    const rot = rotation
      ? { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }
      : { x: 0, y: 0, z: 0, w: 1 };

    this.world.intersectionsWithShape(
      { x: position.x, y: position.y, z: position.z },
      rot,
      shape,
      (collider) => {
        results.push({ collider });
        return true; // Continue searching
      },
      filterGroups
    );

    return results;
  }

  /**
   * Find all colliders in a sphere
   */
  overlapSphere(
    center: THREE.Vector3,
    radius: number,
    filterGroups?: number
  ): OverlapResult[] {
    const sphere = new RAPIER.Ball(radius);
    return this.overlapShape(sphere, center, undefined, filterGroups);
  }

  /**
   * Find all colliders in a box
   */
  overlapBox(
    center: THREE.Vector3,
    halfExtents: THREE.Vector3,
    rotation?: THREE.Quaternion,
    filterGroups?: number
  ): OverlapResult[] {
    const box = new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    return this.overlapShape(box, center, rotation, filterGroups);
  }

  // ========== Entity Mapping ==========

  /**
   * Get entity ID from a collider
   */
  getEntityFromCollider(collider: RAPIER.Collider): string | undefined {
    return this.colliderToEntity.get(collider.handle);
  }

  /**
   * Register a collider to entity mapping
   */
  registerColliderEntity(collider: RAPIER.Collider, entityId: string): void {
    this.colliderToEntity.set(collider.handle, entityId);
  }

  // ========== Body Removal ==========

  /**
   * Remove a rigid body and its colliders
   */
  removeBody(rigidBody: RAPIER.RigidBody): void {
    if (!this.world) return;

    const registered = this.bodies.get(rigidBody.handle);
    if (registered) {
      for (const collider of registered.colliders) {
        this.colliderToEntity.delete(collider.handle);
      }
      this.bodies.delete(rigidBody.handle);
    }

    this.world.removeRigidBody(rigidBody);
  }

  /**
   * Remove a collider
   */
  removeCollider(collider: RAPIER.Collider): void {
    if (!this.world) return;
    this.colliderToEntity.delete(collider.handle);
    this.world.removeCollider(collider, true);
  }

  // ========== Event Processing ==========

  private processEvents(): void {
    if (!this.eventQueue) return;

    // Drain collision events
    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      const entity1 = this.colliderToEntity.get(handle1);
      const entity2 = this.colliderToEntity.get(handle2);

      if (entity1 || entity2) {
        // Events can be processed by game systems via EventBus
        // This is just the low-level physics callback
      }
    });

    // Drain contact force events
    this.eventQueue.drainContactForceEvents((_event) => {
      // Can be used for impact sounds, etc.
    });
  }

  // ========== Debug Rendering ==========

  /**
   * Enable/disable debug rendering
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Create debug visualization mesh
   */
  createDebugMesh(): THREE.LineSegments | null {
    if (!this.world) return null;

    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      vertexColors: true,
    });

    const geometry = new THREE.BufferGeometry();
    this.debugLines = new THREE.LineSegments(geometry, material);
    this.debugLines.frustumCulled = false;

    return this.debugLines;
  }

  /**
   * Update debug visualization
   */
  updateDebugMesh(): void {
    if (!this.debugEnabled || !this.debugLines || !this.world) return;

    const buffers = this.world.debugRender();
    const vertices = buffers.vertices;
    const colors = buffers.colors;

    const geometry = this.debugLines.geometry;
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  }

  // ========== Cleanup ==========

  /**
   * Destroy the physics world
   */
  destroy(): void {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    if (this.eventQueue) {
      this.eventQueue.free();
      this.eventQueue = null;
    }

    this.bodies.clear();
    this.colliderToEntity.clear();
    this.initialized = false;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get Rapier module (for creating shapes, etc.)
   */
  getRapier(): typeof RAPIER {
    return RAPIER;
  }
}

// Singleton instance
export const PhysicsWorld = new PhysicsWorldManager();

// Re-export RAPIER for convenience
export { RAPIER };
