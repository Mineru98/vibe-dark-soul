/**
 * TriggerVolume - Sensor collider wrapper for level triggers
 *
 * Usage:
 * - Create trigger volumes for boss rooms, checkpoints, item pickups, etc.
 * - Subscribe to onEnter/onExit/onStay callbacks
 * - Automatically integrates with EventBus for global notifications
 *
 * Events emitted:
 * - 'trigger:enter' when entity enters
 * - 'trigger:exit' when entity exits
 * - 'trigger:stay' each frame while entity is inside
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld, OverlapResult } from '../physics/PhysicsWorld';
import { CollisionGroups, CollisionGroup } from '../physics/CollisionGroups';
import { EventBus } from '../core/EventBus';

/**
 * Trigger shape types
 */
export enum TriggerShape {
  Box = 'box',
  Sphere = 'sphere',
  Cylinder = 'cylinder',
}

/**
 * Trigger configuration
 */
export interface TriggerConfig {
  id: string;
  position: THREE.Vector3;
  shape: TriggerShape;

  // Shape-specific dimensions
  halfExtents?: THREE.Vector3; // For box
  radius?: number; // For sphere/cylinder
  halfHeight?: number; // For cylinder

  // Behavior
  oneShot?: boolean; // Disable after first trigger
  enabled?: boolean; // Start enabled/disabled
  filterGroups?: CollisionGroup[]; // What entities can trigger this

  // Optional data
  data?: Record<string, unknown>;
}

/**
 * Trigger callbacks
 */
export interface TriggerCallbacks {
  onEnter?: (entityId: string, data: Record<string, unknown>) => void;
  onExit?: (entityId: string, data: Record<string, unknown>) => void;
  onStay?: (entityId: string, delta: number, data: Record<string, unknown>) => void;
}

/**
 * TriggerVolume class
 */
export class TriggerVolume {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly data: Record<string, unknown>;

  private collider: RAPIER.Collider | null = null;
  private shape: RAPIER.Shape;
  private shapeType: TriggerShape;

  private enabled: boolean;
  private oneShot: boolean;
  private triggered: boolean = false;

  private entitiesInside: Set<string> = new Set();
  private callbacks: TriggerCallbacks = {};
  private filterGroups: number;

  constructor(config: TriggerConfig, callbacks?: TriggerCallbacks) {
    this.id = config.id;
    this.position = config.position.clone();
    this.data = config.data ?? {};
    this.enabled = config.enabled ?? true;
    this.oneShot = config.oneShot ?? false;
    this.shapeType = config.shape;

    if (callbacks) {
      this.callbacks = callbacks;
    }

    // Build filter groups
    this.filterGroups = this.buildFilterGroups(config.filterGroups);

    // Create Rapier shape for overlap queries
    this.shape = this.createShape(config);
  }

  /**
   * Create collision shape based on config
   */
  private createShape(config: TriggerConfig): RAPIER.Shape {
    switch (config.shape) {
      case TriggerShape.Box: {
        const halfExtents = config.halfExtents ?? new THREE.Vector3(1, 1, 1);
        return new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
      }
      case TriggerShape.Sphere: {
        const radius = config.radius ?? 1;
        return new RAPIER.Ball(radius);
      }
      case TriggerShape.Cylinder: {
        const radius = config.radius ?? 1;
        const halfHeight = config.halfHeight ?? 1;
        return new RAPIER.Cylinder(halfHeight, radius);
      }
      default:
        return new RAPIER.Cuboid(1, 1, 1);
    }
  }

  /**
   * Build collision filter groups
   */
  private buildFilterGroups(groups?: CollisionGroup[]): number {
    if (!groups || groups.length === 0) {
      // Default: Player and Enemy
      return CollisionGroups.create(
        [CollisionGroup.TRIGGER],
        [CollisionGroup.PLAYER, CollisionGroup.ENEMY]
      );
    }

    return CollisionGroups.create([CollisionGroup.TRIGGER], groups);
  }

  /**
   * Spawn the trigger in the physics world
   */
  spawn(): void {
    if (this.collider) return;

    // Create sensor collider in physics world
    let halfExtents: THREE.Vector3;

    switch (this.shapeType) {
      case TriggerShape.Box:
        halfExtents = new THREE.Vector3(
          (this.shape as RAPIER.Cuboid).halfExtents.x,
          (this.shape as RAPIER.Cuboid).halfExtents.y,
          (this.shape as RAPIER.Cuboid).halfExtents.z
        );
        break;
      case TriggerShape.Sphere:
        const radius = (this.shape as RAPIER.Ball).radius;
        halfExtents = new THREE.Vector3(radius, radius, radius);
        break;
      case TriggerShape.Cylinder:
        const cylRadius = (this.shape as RAPIER.Cylinder).radius;
        const cylHalfHeight = (this.shape as RAPIER.Cylinder).halfHeight;
        halfExtents = new THREE.Vector3(cylRadius, cylHalfHeight, cylRadius);
        break;
      default:
        halfExtents = new THREE.Vector3(1, 1, 1);
    }

    this.collider = PhysicsWorld.createTrigger(
      this.position,
      halfExtents,
      this.id
    );
  }

  /**
   * Remove the trigger from the physics world
   */
  despawn(): void {
    if (this.collider) {
      PhysicsWorld.removeCollider(this.collider);
      this.collider = null;
    }
    this.entitiesInside.clear();
  }

  /**
   * Update trigger state - call each frame
   */
  update(delta: number): void {
    if (!this.enabled || this.triggered) return;

    // Perform overlap query
    const overlaps = this.performOverlapQuery();
    const currentEntities = new Set<string>();

    // Process overlapping entities
    for (const overlap of overlaps) {
      const entityId = PhysicsWorld.getEntityFromCollider(overlap.collider);
      if (!entityId) continue;

      currentEntities.add(entityId);

      // Check for new entries
      if (!this.entitiesInside.has(entityId)) {
        this.handleEnter(entityId);
      } else {
        // Entity staying inside
        this.handleStay(entityId, delta);
      }
    }

    // Check for exits
    for (const entityId of this.entitiesInside) {
      if (!currentEntities.has(entityId)) {
        this.handleExit(entityId);
      }
    }

    // Update tracked entities
    this.entitiesInside = currentEntities;
  }

  /**
   * Perform overlap query
   */
  private performOverlapQuery(): OverlapResult[] {
    return PhysicsWorld.overlapShape(
      this.shape,
      this.position,
      undefined,
      this.filterGroups
    );
  }

  /**
   * Handle entity entering trigger
   */
  private handleEnter(entityId: string): void {
    // Emit EventBus event
    EventBus.emit('trigger:enter', {
      triggerId: this.id,
      entityId,
    });

    // Call callback
    if (this.callbacks.onEnter) {
      this.callbacks.onEnter(entityId, this.data);
    }

    // Handle one-shot triggers
    if (this.oneShot) {
      this.triggered = true;
    }
  }

  /**
   * Handle entity exiting trigger
   */
  private handleExit(entityId: string): void {
    // Emit EventBus event
    EventBus.emit('trigger:exit', {
      triggerId: this.id,
      entityId,
    });

    // Call callback
    if (this.callbacks.onExit) {
      this.callbacks.onExit(entityId, this.data);
    }
  }

  /**
   * Handle entity staying in trigger
   */
  private handleStay(entityId: string, delta: number): void {
    // Emit EventBus event
    EventBus.emit('trigger:stay', {
      triggerId: this.id,
      entityId,
    });

    // Call callback
    if (this.callbacks.onStay) {
      this.callbacks.onStay(entityId, delta, this.data);
    }
  }

  /**
   * Check if an entity is inside the trigger
   */
  contains(entityId: string): boolean {
    return this.entitiesInside.has(entityId);
  }

  /**
   * Get all entities inside the trigger
   */
  getEntitiesInside(): string[] {
    return Array.from(this.entitiesInside);
  }

  /**
   * Enable the trigger
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable the trigger
   */
  disable(): void {
    this.enabled = false;
    // Clear entities and fire exit events
    for (const entityId of this.entitiesInside) {
      this.handleExit(entityId);
    }
    this.entitiesInside.clear();
  }

  /**
   * Reset one-shot trigger
   */
  reset(): void {
    this.triggered = false;
    this.entitiesInside.clear();
  }

  /**
   * Check if trigger is enabled
   */
  isEnabled(): boolean {
    return this.enabled && !this.triggered;
  }

  /**
   * Set trigger callbacks
   */
  setCallbacks(callbacks: TriggerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Update trigger position
   */
  setPosition(position: THREE.Vector3): void {
    this.position.copy(position);
    // Collider position is fixed, need to recreate
    if (this.collider) {
      this.despawn();
      this.spawn();
    }
  }
}

/**
 * TriggerManager - Manages all trigger volumes in a level
 */
class TriggerManagerClass {
  private triggers: Map<string, TriggerVolume> = new Map();

  /**
   * Create and register a trigger
   */
  create(config: TriggerConfig, callbacks?: TriggerCallbacks): TriggerVolume {
    const trigger = new TriggerVolume(config, callbacks);
    this.triggers.set(config.id, trigger);
    return trigger;
  }

  /**
   * Get a trigger by ID
   */
  get(id: string): TriggerVolume | undefined {
    return this.triggers.get(id);
  }

  /**
   * Remove a trigger
   */
  remove(id: string): void {
    const trigger = this.triggers.get(id);
    if (trigger) {
      trigger.despawn();
      this.triggers.delete(id);
    }
  }

  /**
   * Update all triggers
   */
  update(delta: number): void {
    for (const trigger of this.triggers.values()) {
      trigger.update(delta);
    }
  }

  /**
   * Spawn all triggers
   */
  spawnAll(): void {
    for (const trigger of this.triggers.values()) {
      trigger.spawn();
    }
  }

  /**
   * Despawn all triggers
   */
  despawnAll(): void {
    for (const trigger of this.triggers.values()) {
      trigger.despawn();
    }
  }

  /**
   * Clear all triggers
   */
  clear(): void {
    this.despawnAll();
    this.triggers.clear();
  }

  /**
   * Get all trigger IDs
   */
  getAllIds(): string[] {
    return Array.from(this.triggers.keys());
  }

  /**
   * Get triggers containing an entity
   */
  getTriggersContaining(entityId: string): TriggerVolume[] {
    const result: TriggerVolume[] = [];
    for (const trigger of this.triggers.values()) {
      if (trigger.contains(entityId)) {
        result.push(trigger);
      }
    }
    return result;
  }
}

// Singleton instance
export const TriggerManager = new TriggerManagerClass();
