/**
 * LevelLoader - Load and manage level data
 *
 * Usage:
 * - Load level geometry, triggers, spawners from JSON
 * - Create physics colliders for level geometry
 * - Manage level transitions
 *
 * Level JSON structure:
 * {
 *   name: string,
 *   geometry: GeometryDef[],
 *   triggers: TriggerDef[],
 *   spawners: SpawnerDef[],
 *   checkpoints: CheckpointDef[],
 *   playerSpawn: Vector3
 * }
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CollisionGroups, CollisionGroup } from '../physics/CollisionGroups';
import { TriggerManager, TriggerShape, TriggerConfig } from './TriggerVolume';
import { GameFlags, GameFlag, FlagCondition, checkFlagCondition } from './GameFlags';
import { EventBus } from '../core/EventBus';

// ============ Data Types ============

/**
 * Vector3 in JSON format
 */
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Geometry types
 */
export enum GeometryType {
  Box = 'box',
  Plane = 'plane',
  Cylinder = 'cylinder',
  Ramp = 'ramp',
  Mesh = 'mesh', // For complex geometry loaded from GLTF
}

/**
 * Geometry definition in level data
 */
export interface GeometryDef {
  id: string;
  type: GeometryType;
  position: Vec3;
  rotation?: Vec3; // Euler angles in degrees
  scale?: Vec3;

  // Type-specific
  halfExtents?: Vec3; // For box
  radius?: number; // For cylinder
  height?: number; // For cylinder
  width?: number; // For plane/ramp
  depth?: number; // For plane/ramp
  slopeAngle?: number; // For ramp

  // Visual
  material?: {
    color?: number;
    texture?: string;
  };

  // Collision
  collisionGroup?: CollisionGroup;
}

/**
 * Trigger definition in level data
 */
export interface TriggerDef {
  id: string;
  type: 'checkpoint' | 'boss_room' | 'item_pickup' | 'dialogue' | 'event' | 'teleport';
  position: Vec3;
  shape: TriggerShape;
  halfExtents?: Vec3;
  radius?: number;
  halfHeight?: number;
  oneShot?: boolean;

  // Condition for activation
  condition?: FlagCondition;

  // Type-specific data
  checkpointId?: string;
  itemId?: string;
  itemType?: string;
  dialogueSpeaker?: string;
  dialogueText?: string;
  eventName?: string;
  eventData?: Record<string, unknown>;
  teleportTarget?: Vec3;
  flagToSet?: GameFlag | string;
}

/**
 * Spawner definition
 */
export interface SpawnerDef {
  id: string;
  type: 'enemy' | 'boss' | 'item' | 'npc';
  position: Vec3;
  rotation?: Vec3;

  // Spawn configuration
  entityType: string; // e.g., 'boss_tutorial', 'hollow_soldier'
  spawnOnLoad?: boolean;
  respawns?: boolean;
  condition?: FlagCondition;
}

/**
 * Checkpoint definition
 */
export interface CheckpointDef {
  id: string;
  name: string;
  position: Vec3;
  rotation?: number; // Y rotation for player spawn direction
  isDefault?: boolean; // Starting checkpoint
}

/**
 * Complete level data
 */
export interface LevelData {
  id: string;
  name: string;
  version: number;

  // Player
  playerSpawn: Vec3;
  playerSpawnRotation?: number;

  // Content
  geometry: GeometryDef[];
  triggers: TriggerDef[];
  spawners: SpawnerDef[];
  checkpoints: CheckpointDef[];

  // Environment
  ambientLight?: number;
  fogColor?: number;
  fogNear?: number;
  fogFar?: number;
}

// ============ Level Objects ============

/**
 * Loaded geometry object
 */
interface LoadedGeometry {
  id: string;
  mesh: THREE.Mesh | THREE.Group;
  collider?: RAPIER.Collider;
}

/**
 * Loaded spawner
 */
interface LoadedSpawner {
  def: SpawnerDef;
  spawned: boolean;
  entityId?: string;
}

// ============ Level Loader ============

class LevelLoaderClass {
  private currentLevel: LevelData | null = null;
  private loadedGeometry: Map<string, LoadedGeometry> = new Map();
  private loadedSpawners: Map<string, LoadedSpawner> = new Map();
  private scene: THREE.Scene | null = null;

  // Callbacks
  private spawnCallbacks: Map<string, (spawner: SpawnerDef) => string | undefined> = new Map();

  /**
   * Register a spawn callback for an entity type
   */
  registerSpawnCallback(
    entityType: string,
    callback: (spawner: SpawnerDef) => string | undefined
  ): void {
    this.spawnCallbacks.set(entityType, callback);
  }

  /**
   * Load a level from data
   */
  async load(data: LevelData, scene: THREE.Scene): Promise<void> {
    // Clean up previous level
    this.unload();

    this.currentLevel = data;
    this.scene = scene;

    console.log(`[LevelLoader] Loading level: ${data.name}`);

    // Load geometry
    for (const geoDef of data.geometry) {
      this.loadGeometry(geoDef);
    }

    // Load triggers
    for (const triggerDef of data.triggers) {
      this.loadTrigger(triggerDef);
    }

    // Initialize spawners
    for (const spawnerDef of data.spawners) {
      this.loadSpawner(spawnerDef);
    }

    // Load checkpoints
    for (const checkpoint of data.checkpoints) {
      this.loadCheckpoint(checkpoint);
    }

    // Spawn triggers
    TriggerManager.spawnAll();

    // Apply environment settings
    this.applyEnvironment(data);

    // Process initial spawns
    this.processSpawns();

    console.log(`[LevelLoader] Level loaded: ${data.name}`);
  }

  /**
   * Load geometry piece
   */
  private loadGeometry(def: GeometryDef): void {
    if (!this.scene) return;

    let mesh: THREE.Mesh | null = null;
    let collider: RAPIER.Collider | null = null;

    const position = new THREE.Vector3(def.position.x, def.position.y, def.position.z);
    const rotation = def.rotation
      ? new THREE.Euler(
          THREE.MathUtils.degToRad(def.rotation.x),
          THREE.MathUtils.degToRad(def.rotation.y),
          THREE.MathUtils.degToRad(def.rotation.z)
        )
      : new THREE.Euler();
    const scale = def.scale
      ? new THREE.Vector3(def.scale.x, def.scale.y, def.scale.z)
      : new THREE.Vector3(1, 1, 1);

    // Create material
    const material = new THREE.MeshStandardMaterial({
      color: def.material?.color ?? 0x808080,
      roughness: 0.8,
      metalness: 0.2,
    });

    switch (def.type) {
      case GeometryType.Box: {
        const halfExtents = def.halfExtents ?? { x: 1, y: 1, z: 1 };
        const geometry = new THREE.BoxGeometry(
          halfExtents.x * 2,
          halfExtents.y * 2,
          halfExtents.z * 2
        );
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.rotation.copy(rotation);
        mesh.scale.copy(scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Create physics collider
        const scaledHalfExtents = new THREE.Vector3(
          halfExtents.x * scale.x,
          halfExtents.y * scale.y,
          halfExtents.z * scale.z
        );

        const colliderDesc = RAPIER.ColliderDesc.cuboid(
          scaledHalfExtents.x,
          scaledHalfExtents.y,
          scaledHalfExtents.z
        )
          .setTranslation(position.x, position.y, position.z)
          .setCollisionGroups(
            CollisionGroups.create(
              [def.collisionGroup ?? CollisionGroup.ENVIRONMENT],
              [CollisionGroup.PLAYER, CollisionGroup.ENEMY]
            )
          );

        collider = PhysicsWorld.createStaticCollider(colliderDesc, def.id);
        break;
      }

      case GeometryType.Plane: {
        const width = def.width ?? 10;
        const depth = def.depth ?? 10;
        const geometry = new THREE.PlaneGeometry(width, depth);
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.rotation.copy(rotation);
        mesh.rotation.x -= Math.PI / 2; // Make horizontal
        mesh.receiveShadow = true;

        // Create physics collider (thin box)
        const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, 0.1, depth / 2)
          .setTranslation(position.x, position.y, position.z)
          .setCollisionGroups(
            CollisionGroups.create(
              [def.collisionGroup ?? CollisionGroup.ENVIRONMENT],
              [CollisionGroup.PLAYER, CollisionGroup.ENEMY]
            )
          );

        collider = PhysicsWorld.createStaticCollider(colliderDesc, def.id);
        break;
      }

      case GeometryType.Cylinder: {
        const radius = def.radius ?? 1;
        const height = def.height ?? 2;
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.rotation.copy(rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Create physics collider
        const colliderDesc = RAPIER.ColliderDesc.cylinder(height / 2, radius)
          .setTranslation(position.x, position.y, position.z)
          .setCollisionGroups(
            CollisionGroups.create(
              [def.collisionGroup ?? CollisionGroup.ENVIRONMENT],
              [CollisionGroup.PLAYER, CollisionGroup.ENEMY]
            )
          );

        collider = PhysicsWorld.createStaticCollider(colliderDesc, def.id);
        break;
      }

      case GeometryType.Ramp: {
        // Ramp is a rotated box
        const width = def.width ?? 4;
        const depth = def.depth ?? 10;
        const slopeAngle = def.slopeAngle ?? 30;
        const height = Math.tan(THREE.MathUtils.degToRad(slopeAngle)) * depth;

        const geometry = new THREE.BoxGeometry(width, 0.2, Math.sqrt(depth * depth + height * height));
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.rotation.x = THREE.MathUtils.degToRad(-slopeAngle);
        mesh.rotation.y = rotation.y;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Physics - simplified as a tilted cuboid
        const rampLength = Math.sqrt(depth * depth + height * height);
        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(THREE.MathUtils.degToRad(-slopeAngle), rotation.y, 0)
        );

        const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, 0.1, rampLength / 2)
          .setTranslation(position.x, position.y, position.z)
          .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
          .setCollisionGroups(
            CollisionGroups.create(
              [def.collisionGroup ?? CollisionGroup.ENVIRONMENT],
              [CollisionGroup.PLAYER, CollisionGroup.ENEMY]
            )
          );

        collider = PhysicsWorld.createStaticCollider(colliderDesc, def.id);
        break;
      }
    }

    if (mesh) {
      mesh.name = def.id;
      this.scene.add(mesh);

      this.loadedGeometry.set(def.id, {
        id: def.id,
        mesh,
        collider: collider ?? undefined,
      });
    }
  }

  /**
   * Load trigger
   */
  private loadTrigger(def: TriggerDef): void {
    // Check condition
    if (def.condition && !checkFlagCondition(def.condition)) {
      return;
    }

    const config: TriggerConfig = {
      id: def.id,
      position: new THREE.Vector3(def.position.x, def.position.y, def.position.z),
      shape: def.shape,
      halfExtents: def.halfExtents
        ? new THREE.Vector3(def.halfExtents.x, def.halfExtents.y, def.halfExtents.z)
        : undefined,
      radius: def.radius,
      halfHeight: def.halfHeight,
      oneShot: def.oneShot,
      data: { ...def },
    };

    const callbacks = this.createTriggerCallbacks(def);
    TriggerManager.create(config, callbacks);
  }

  /**
   * Create trigger callbacks based on trigger type
   */
  private createTriggerCallbacks(def: TriggerDef) {
    return {
      onEnter: (entityId: string) => {
        // Only respond to player
        if (entityId !== 'player') return;

        switch (def.type) {
          case 'checkpoint':
            if (def.checkpointId) {
              EventBus.emit('checkpoint:activated', { checkpointId: def.checkpointId });
              if (def.flagToSet) {
                GameFlags.set(def.flagToSet);
              }
            }
            break;

          case 'boss_room':
            EventBus.emit('trigger:enter', {
              triggerId: def.id,
              entityId,
            });
            if (def.flagToSet) {
              GameFlags.set(def.flagToSet);
            }
            break;

          case 'item_pickup':
            if (def.itemId && def.itemType) {
              EventBus.emit('item:pickup', {
                itemId: def.itemId,
                itemType: def.itemType,
              });
              if (def.flagToSet) {
                GameFlags.set(def.flagToSet);
              }
            }
            break;

          case 'dialogue':
            if (def.dialogueSpeaker && def.dialogueText) {
              EventBus.emit('ui:dialogueShow', {
                speaker: def.dialogueSpeaker,
                text: def.dialogueText,
              });
            }
            break;

          case 'event':
            if (def.eventName) {
              // Generic event - can be handled by game logic
              console.log(`[LevelLoader] Event triggered: ${def.eventName}`, def.eventData);
              if (def.flagToSet) {
                GameFlags.set(def.flagToSet);
              }
            }
            break;

          case 'teleport':
            // Teleport handled by game logic listening to trigger:enter
            console.log(`[LevelLoader] Teleport to:`, def.teleportTarget);
            break;
        }
      },

      onExit: (entityId: string) => {
        if (entityId !== 'player') return;

        if (def.type === 'dialogue') {
          EventBus.emit('ui:dialogueHide');
        }
      },
    };
  }

  /**
   * Load spawner
   */
  private loadSpawner(def: SpawnerDef): void {
    this.loadedSpawners.set(def.id, {
      def,
      spawned: false,
    });
  }

  /**
   * Load checkpoint
   */
  private loadCheckpoint(def: CheckpointDef): void {
    // Create a visual marker (optional)
    if (this.scene) {
      const geometry = new THREE.SphereGeometry(0.3);
      const material = new THREE.MeshBasicMaterial({
        color: def.isDefault ? 0xffff00 : 0x00ff00,
        transparent: true,
        opacity: 0.5,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(def.position.x, def.position.y + 0.5, def.position.z);
      mesh.name = `checkpoint_${def.id}`;
      // this.scene.add(mesh); // Uncomment to show checkpoint markers
    }
  }

  /**
   * Apply environment settings
   */
  private applyEnvironment(data: LevelData): void {
    if (!this.scene) return;

    // Ambient light
    if (data.ambientLight !== undefined) {
      const ambient = this.scene.children.find(
        (c) => c instanceof THREE.AmbientLight
      ) as THREE.AmbientLight | undefined;
      if (ambient) {
        ambient.intensity = data.ambientLight;
      }
    }

    // Fog
    if (data.fogColor !== undefined) {
      this.scene.fog = new THREE.Fog(
        data.fogColor,
        data.fogNear ?? 10,
        data.fogFar ?? 50
      );
    }
  }

  /**
   * Process spawns based on conditions
   */
  processSpawns(): void {
    for (const [id, spawner] of this.loadedSpawners) {
      // Skip already spawned
      if (spawner.spawned && !spawner.def.respawns) continue;

      // Check condition
      if (spawner.def.condition && !checkFlagCondition(spawner.def.condition)) {
        continue;
      }

      // Check if should spawn on load
      if (!spawner.def.spawnOnLoad && !spawner.spawned) {
        continue;
      }

      // Spawn via callback
      const callback = this.spawnCallbacks.get(spawner.def.entityType);
      if (callback) {
        const entityId = callback(spawner.def);
        spawner.entityId = entityId;
        spawner.spawned = true;
      }
    }
  }

  /**
   * Manually trigger a spawner
   */
  triggerSpawner(spawnerId: string): string | undefined {
    const spawner = this.loadedSpawners.get(spawnerId);
    if (!spawner) return undefined;

    const callback = this.spawnCallbacks.get(spawner.def.entityType);
    if (callback) {
      const entityId = callback(spawner.def);
      spawner.entityId = entityId;
      spawner.spawned = true;
      return entityId;
    }

    return undefined;
  }

  /**
   * Get player spawn position
   */
  getPlayerSpawn(): THREE.Vector3 {
    if (!this.currentLevel) {
      return new THREE.Vector3(0, 1, 0);
    }

    const spawn = this.currentLevel.playerSpawn;
    return new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  }

  /**
   * Get player spawn rotation
   */
  getPlayerSpawnRotation(): number {
    return this.currentLevel?.playerSpawnRotation ?? 0;
  }

  /**
   * Get checkpoint position
   */
  getCheckpoint(checkpointId: string): { position: THREE.Vector3; rotation: number } | null {
    if (!this.currentLevel) return null;

    const checkpoint = this.currentLevel.checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) return null;

    return {
      position: new THREE.Vector3(
        checkpoint.position.x,
        checkpoint.position.y,
        checkpoint.position.z
      ),
      rotation: checkpoint.rotation ?? 0,
    };
  }

  /**
   * Get all checkpoint IDs
   */
  getCheckpointIds(): string[] {
    return this.currentLevel?.checkpoints.map((c) => c.id) ?? [];
  }

  /**
   * Unload current level
   */
  unload(): void {
    // Remove geometry
    for (const geo of this.loadedGeometry.values()) {
      if (this.scene) {
        this.scene.remove(geo.mesh);
      }
      if (geo.mesh instanceof THREE.Mesh) {
        geo.mesh.geometry.dispose();
        if (geo.mesh.material instanceof THREE.Material) {
          geo.mesh.material.dispose();
        }
      }
      if (geo.collider) {
        PhysicsWorld.removeCollider(geo.collider);
      }
    }
    this.loadedGeometry.clear();

    // Clear triggers
    TriggerManager.clear();

    // Clear spawners
    this.loadedSpawners.clear();

    // Clear fog
    if (this.scene) {
      this.scene.fog = null;
    }

    this.currentLevel = null;
    this.scene = null;
  }

  /**
   * Get current level data
   */
  getCurrentLevel(): LevelData | null {
    return this.currentLevel;
  }

  /**
   * Check if a level is loaded
   */
  isLoaded(): boolean {
    return this.currentLevel !== null;
  }
}

// Singleton instance
export const LevelLoader = new LevelLoaderClass();

// ============ Tutorial Level Data ============

/**
 * Tutorial level data (inline definition)
 * This can also be loaded from a JSON file
 */
export const TUTORIAL_LEVEL: LevelData = {
  id: 'tutorial',
  name: 'Northern Undead Asylum',
  version: 1,

  playerSpawn: { x: 0, y: 1, z: 0 },
  playerSpawnRotation: 0,

  geometry: [
    // Ground
    {
      id: 'ground',
      type: GeometryType.Box,
      position: { x: 0, y: -0.5, z: 0 },
      halfExtents: { x: 30, y: 0.5, z: 30 },
      material: { color: 0x444444 },
    },

    // Cell walls
    {
      id: 'wall_cell_back',
      type: GeometryType.Box,
      position: { x: 0, y: 2, z: -5 },
      halfExtents: { x: 4, y: 2, z: 0.5 },
      material: { color: 0x555555 },
    },
    {
      id: 'wall_cell_left',
      type: GeometryType.Box,
      position: { x: -4, y: 2, z: -2.5 },
      halfExtents: { x: 0.5, y: 2, z: 2.5 },
      material: { color: 0x555555 },
    },
    {
      id: 'wall_cell_right',
      type: GeometryType.Box,
      position: { x: 4, y: 2, z: -2.5 },
      halfExtents: { x: 0.5, y: 2, z: 2.5 },
      material: { color: 0x555555 },
    },

    // Corridor
    {
      id: 'corridor_left',
      type: GeometryType.Box,
      position: { x: -4, y: 2, z: 10 },
      halfExtents: { x: 0.5, y: 2, z: 10 },
      material: { color: 0x555555 },
    },
    {
      id: 'corridor_right',
      type: GeometryType.Box,
      position: { x: 4, y: 2, z: 10 },
      halfExtents: { x: 0.5, y: 2, z: 10 },
      material: { color: 0x555555 },
    },

    // Boss room platform (elevated)
    {
      id: 'boss_platform',
      type: GeometryType.Box,
      position: { x: 0, y: 4, z: 25 },
      halfExtents: { x: 8, y: 0.5, z: 8 },
      material: { color: 0x666666 },
    },

    // Ramp to boss room
    {
      id: 'ramp_to_boss',
      type: GeometryType.Ramp,
      position: { x: 0, y: 2, z: 18 },
      width: 4,
      depth: 6,
      slopeAngle: 30,
      material: { color: 0x555555 },
    },
  ],

  triggers: [
    // Tutorial trigger
    {
      id: 'tutorial_roll',
      type: 'event',
      position: { x: 0, y: 1, z: 3 },
      shape: TriggerShape.Box,
      halfExtents: { x: 3, y: 2, z: 1 },
      oneShot: true,
      eventName: 'tutorial_show_roll',
      flagToSet: GameFlag.LEARNED_ROLL,
    },

    // Boss room entrance
    {
      id: 'boss_room_trigger',
      type: 'boss_room',
      position: { x: 0, y: 5, z: 25 },
      shape: TriggerShape.Box,
      halfExtents: { x: 6, y: 3, z: 6 },
      oneShot: false,
      flagToSet: GameFlag.MET_BOSS_ONCE,
    },

    // Checkpoint
    {
      id: 'checkpoint_corridor',
      type: 'checkpoint',
      position: { x: 0, y: 1, z: 8 },
      shape: TriggerShape.Sphere,
      radius: 2,
      oneShot: true,
      checkpointId: 'corridor',
      flagToSet: GameFlag.CHECKPOINT_CORRIDOR,
    },
  ],

  spawners: [
    // Boss spawner
    {
      id: 'boss_spawner',
      type: 'boss',
      position: { x: 0, y: 5, z: 28 },
      entityType: 'boss_tutorial',
      spawnOnLoad: false,
      respawns: false,
      condition: {
        exclude: [GameFlag.BOSS_DEFEATED],
      },
    },
  ],

  checkpoints: [
    {
      id: 'cell',
      name: 'Undead Asylum Cell',
      position: { x: 0, y: 1, z: -3 },
      rotation: 0,
      isDefault: true,
    },
    {
      id: 'corridor',
      name: 'Asylum Corridor',
      position: { x: 0, y: 1, z: 8 },
      rotation: 0,
    },
    {
      id: 'boss_room',
      name: 'Boss Room',
      position: { x: 0, y: 5, z: 22 },
      rotation: 180,
    },
  ],

  ambientLight: 0.3,
  fogColor: 0x222222,
  fogNear: 15,
  fogFar: 40,
};
