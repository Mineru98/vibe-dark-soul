/**
 * Boss Entity
 *
 * Manages a boss enemy:
 * - 3D mesh and collider
 * - Health, poise, and combat state
 * - BossFSM for AI behavior
 * - Attack execution via AttackSystem
 * - Plunge attack detection zone
 *
 * Integrates with DamageSystem, AttackSystem, and EventBus.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Time } from '../core/Time';
import { EventBus } from '../core/EventBus';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CollisionGroups, CollisionGroup } from '../physics/CollisionGroups';
import {
  DamageSystem,
  EntityCombatState,
  DamageResult,
  DamageSourceType,
} from '../combat/DamageSystem';
import {
  AttackSystem,
  ActiveAttack,
  WeaponSockets,
  HitResult,
} from '../combat/AttackSystem';
import { DamageType } from '../player/PlayerStats';
import { BossFSM, BossStateType, AttackPattern, TUTORIAL_BOSS_PATTERNS } from './BossFSM';

/**
 * Boss configuration
 */
export interface BossConfig {
  // Identity
  id: string;
  name: string;

  // Initial position
  position: THREE.Vector3;
  rotation?: number; // Y rotation in radians

  // Stats
  maxHP: number;
  maxPoise: number;
  poiseRecoveryDelay: number; // Seconds before poise starts recovering
  poiseRecoveryRate: number; // Poise per second

  // Movement
  moveSpeed: number;
  turnSpeed: number;

  // Physics
  colliderRadius: number;
  colliderHeight: number;

  // Plunge detection
  plungeDetectionRadius: number;
  plungeDetectionHeight: number;

  // Attack patterns (optional, uses defaults if not provided)
  patterns?: AttackPattern[];
}

/**
 * Default tutorial boss config
 */
export const TUTORIAL_BOSS_CONFIG: BossConfig = {
  id: 'boss_tutorial',
  name: 'Asylum Demon',
  position: new THREE.Vector3(0, 0, 0),
  maxHP: 1000,
  maxPoise: 100,
  poiseRecoveryDelay: 3.0,
  poiseRecoveryRate: 20.0,
  moveSpeed: 2.5,
  turnSpeed: 2.0,
  colliderRadius: 1.5,
  colliderHeight: 4.0,
  plungeDetectionRadius: 2.5,
  plungeDetectionHeight: 3.0,
};

/**
 * Boss entity class
 */
export class Boss {
  // Identity
  readonly id: string;
  readonly name: string;

  // Scene objects
  private _mesh: THREE.Group | null = null;
  private _rigidBody: RAPIER.RigidBody | null = null;
  private _collider: RAPIER.Collider | null = null;
  private _plungeCollider: RAPIER.Collider | null = null;

  // Position/rotation
  private _position: THREE.Vector3 = new THREE.Vector3();
  private _rotation: number = 0; // Y rotation

  // Stats
  private _maxHP: number;
  private _currentHP: number;
  private _maxPoise: number;
  private _currentPoise: number;
  private poiseRecoveryDelay: number;
  private poiseRecoveryRate: number;
  private lastPoiseHitTime: number = 0;

  // Movement
  private moveSpeed: number;
  private turnSpeed: number;

  // Physics config
  private colliderRadius: number;
  private colliderHeight: number;
  private plungeDetectionRadius: number;
  private plungeDetectionHeight: number;

  // FSM
  private _fsm: BossFSM;

  // Attack state
  private activeAttack: ActiveAttack | null = null;
  private weaponSockets: WeaponSockets = {
    base: new THREE.Vector3(),
    tip: new THREE.Vector3(),
  };

  // Target tracking
  private _targetPosition: THREE.Vector3 = new THREE.Vector3();
  private _targetId: string | null = null;

  // State
  private _isSpawned: boolean = false;
  private _isDead: boolean = false;

  constructor(config: BossConfig) {
    this.id = config.id;
    this.name = config.name;

    this._position.copy(config.position);
    this._rotation = config.rotation ?? 0;

    this._maxHP = config.maxHP;
    this._currentHP = config.maxHP;
    this._maxPoise = config.maxPoise;
    this._currentPoise = config.maxPoise;
    this.poiseRecoveryDelay = config.poiseRecoveryDelay;
    this.poiseRecoveryRate = config.poiseRecoveryRate;

    this.moveSpeed = config.moveSpeed;
    this.turnSpeed = config.turnSpeed;

    this.colliderRadius = config.colliderRadius;
    this.colliderHeight = config.colliderHeight;
    this.plungeDetectionRadius = config.plungeDetectionRadius;
    this.plungeDetectionHeight = config.plungeDetectionHeight;

    // Create FSM
    this._fsm = new BossFSM(this.id, config.patterns ?? TUTORIAL_BOSS_PATTERNS, {
      onStateEnter: this.onStateEnter.bind(this),
      onStateExit: this.onStateExit.bind(this),
      onAttackSelected: this.onAttackSelected.bind(this),
      onAnimationTrigger: this.onAnimationTrigger.bind(this),
    });
  }

  /**
   * Spawn the boss into the world
   */
  spawn(scene: THREE.Scene): void {
    if (this._isSpawned) return;

    // Create placeholder mesh (replace with actual model)
    this._mesh = this.createPlaceholderMesh();
    this._mesh.position.copy(this._position);
    this._mesh.rotation.y = this._rotation;
    scene.add(this._mesh);

    // Create physics body
    this.createPhysicsBody();

    // Register with damage system
    this.registerWithDamageSystem();

    this._isSpawned = true;

    EventBus.emit('debug:log', {
      message: `Boss ${this.id} spawned at ${this._position.toArray()}`,
      level: 'info',
    });
  }

  /**
   * Despawn the boss from the world
   */
  despawn(scene: THREE.Scene): void {
    if (!this._isSpawned) return;

    // Remove mesh
    if (this._mesh) {
      scene.remove(this._mesh);
      this._mesh = null;
    }

    // Remove physics
    this.removePhysicsBody();

    // Unregister from damage system
    DamageSystem.unregisterEntity(this.id);

    this._isSpawned = false;
  }

  /**
   * Update the boss (call every frame)
   */
  update(dt: number): void {
    if (!this._isSpawned || this._isDead) return;

    // Update target info for FSM
    this.updateTargetInfo();

    // Update FSM
    this._fsm.update(dt);

    // Update movement
    this.updateMovement(dt);

    // Update attack
    this.updateAttack(dt);

    // Update poise recovery
    this.updatePoiseRecovery(dt);

    // Sync mesh with physics
    this.syncMeshWithPhysics();

    // Update damage system state
    this.updateDamageSystemState();
  }

  /**
   * Set target entity
   */
  setTarget(targetId: string | null, position?: THREE.Vector3): void {
    this._targetId = targetId;
    this._fsm.setTarget(targetId);

    if (position) {
      this._targetPosition.copy(position);
    }
  }

  /**
   * Update target position (call when target moves)
   */
  updateTargetPosition(position: THREE.Vector3): void {
    this._targetPosition.copy(position);
  }

  // ========== Private Methods ==========

  private createPlaceholderMesh(): THREE.Group {
    const group = new THREE.Group();

    // Body (capsule approximation using cylinder + spheres)
    const bodyGeometry = new THREE.CylinderGeometry(
      this.colliderRadius,
      this.colliderRadius,
      this.colliderHeight - this.colliderRadius * 2,
      16
    );
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a0000,
      roughness: 0.8,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = this.colliderHeight / 2;
    group.add(body);

    // Head
    const headGeometry = new THREE.SphereGeometry(this.colliderRadius * 0.6, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a0000,
      roughness: 0.7,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = this.colliderHeight - this.colliderRadius * 0.3;
    group.add(head);

    // Weapon (simple box)
    const weaponGeometry = new THREE.BoxGeometry(0.3, 3.0, 0.3);
    const weaponMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.8,
    });
    const weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
    weapon.position.set(this.colliderRadius + 0.5, this.colliderHeight * 0.6, 0);
    weapon.rotation.z = -Math.PI / 6;
    weapon.name = 'weapon';
    group.add(weapon);

    return group;
  }

  private createPhysicsBody(): void {
    // Create kinematic rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      this._position.x,
      this._position.y,
      this._position.z
    );
    this._rigidBody = PhysicsWorld.createRigidBody(bodyDesc);

    // Create main collider (capsule)
    const colliderDesc = RAPIER.ColliderDesc.capsule(
      (this.colliderHeight - this.colliderRadius * 2) / 2,
      this.colliderRadius
    )
      .setTranslation(0, this.colliderHeight / 2, 0)
      .setCollisionGroups(
        CollisionGroups.createMask(CollisionGroup.ENEMY, [
          CollisionGroup.PLAYER,
          CollisionGroup.ENVIRONMENT,
          CollisionGroup.HITBOX,
        ])
      );

    this._collider = PhysicsWorld.createCollider(colliderDesc, this._rigidBody);

    // Register collider with entity ID
    PhysicsWorld.registerColliderEntity(this._collider, this.id);

    // Create plunge detection zone (sensor above boss)
    const plungeColliderDesc = RAPIER.ColliderDesc.cylinder(
      this.plungeDetectionHeight / 2,
      this.plungeDetectionRadius
    )
      .setTranslation(0, this.colliderHeight + this.plungeDetectionHeight / 2, 0)
      .setSensor(true)
      .setCollisionGroups(
        CollisionGroups.createMask(CollisionGroup.TRIGGER, [CollisionGroup.PLAYER])
      );

    this._plungeCollider = PhysicsWorld.createCollider(plungeColliderDesc, this._rigidBody);
  }

  private removePhysicsBody(): void {
    if (this._collider) {
      PhysicsWorld.unregisterColliderEntity(this._collider);
    }

    if (this._rigidBody) {
      PhysicsWorld.removeRigidBody(this._rigidBody);
      this._rigidBody = null;
      this._collider = null;
      this._plungeCollider = null;
    }
  }

  private registerWithDamageSystem(): void {
    const combatState: EntityCombatState = {
      entityId: this.id,
      currentHP: this._currentHP,
      maxHP: this._maxHP,
      currentStamina: 100, // Bosses have infinite stamina
      maxStamina: 100,
      currentPoise: this._currentPoise,
      maxPoise: this._maxPoise,
      isGuarding: false,
      isParrying: false,
      isDead: this._isDead,
      onTakeDamage: this.onTakeDamage.bind(this),
      onDie: this.onDie.bind(this),
      onStagger: this.onStagger.bind(this),
    };

    DamageSystem.registerEntity(combatState);
  }

  private updateDamageSystemState(): void {
    DamageSystem.updateEntityState(this.id, {
      currentHP: this._currentHP,
      currentPoise: this._currentPoise,
      isDead: this._isDead,
    });
  }

  private updateTargetInfo(): void {
    if (!this._targetId) {
      this._fsm.updateTargetInfo(Infinity, 0);
      return;
    }

    // Calculate distance to target
    const toTarget = this._targetPosition.clone().sub(this._position);
    const distance = toTarget.length();

    // Calculate angle to target (relative to boss forward)
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this._rotation
    );
    const angle = forward.angleTo(toTarget.normalize());

    this._fsm.updateTargetInfo(distance, angle);
  }

  private updateMovement(dt: number): void {
    if (this._fsm.movementMultiplier <= 0) return;

    const state = this._fsm.currentState;

    // Engage state: move toward player
    if (state === BossStateType.Engage) {
      this.moveTowardTarget(dt);
    }

    // Jump slam: move during jump
    if (
      state === BossStateType.AttackActive &&
      this._fsm.attackPattern?.attackId === 'boss_jump_slam'
    ) {
      // Jump toward target position (captured at attack start)
      const jumpProgress = this._fsm.progress;
      if (jumpProgress < 0.5) {
        // Rising phase
        const moveDir = this._targetPosition.clone().sub(this._position).normalize();
        const speed = this.moveSpeed * 4 * this._fsm.movementMultiplier;
        this._position.x += moveDir.x * speed * dt;
        this._position.z += moveDir.z * speed * dt;
        this._position.y += 8 * dt; // Rise
      } else {
        // Falling phase
        this._position.y -= 12 * dt;
        if (this._position.y < 0) this._position.y = 0;
      }
    }
  }

  private moveTowardTarget(dt: number): void {
    if (!this._targetId) return;

    const toTarget = this._targetPosition.clone().sub(this._position);
    toTarget.y = 0; // Ignore vertical
    const distance = toTarget.length();

    // Stop at preferred distance
    const preferredDist = this._fsm.getPreferredDistance();
    if (distance <= preferredDist) return;

    // Rotate toward target
    const targetRotation = Math.atan2(toTarget.x, toTarget.z);
    const rotationDiff = this.normalizeAngle(targetRotation - this._rotation);
    const rotationStep = this.turnSpeed * this._fsm.rotationMultiplier * dt;

    if (Math.abs(rotationDiff) > rotationStep) {
      this._rotation += Math.sign(rotationDiff) * rotationStep;
    } else {
      this._rotation = targetRotation;
    }

    // Move forward
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this._rotation
    );
    const speed = this.moveSpeed * this._fsm.movementMultiplier;
    this._position.add(forward.multiplyScalar(speed * dt));

    // Update physics body
    if (this._rigidBody) {
      this._rigidBody.setNextKinematicTranslation({
        x: this._position.x,
        y: this._position.y,
        z: this._position.z,
      });
    }
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  private updateAttack(dt: number): void {
    const state = this._fsm.currentState;

    // Start attack when entering AttackActive
    if (state === BossStateType.AttackActive && !this.activeAttack) {
      this.startAttackExecution();
    }

    // Update active attack
    if (this.activeAttack) {
      this.updateWeaponSockets();

      const hits = AttackSystem.updateAttack(
        this.activeAttack,
        this._fsm.progress,
        this.weaponSockets,
        CollisionGroups.PLAYER
      );

      // Process hits (already handled by AttackSystem -> DamageSystem)
      for (const hit of hits) {
        EventBus.emit('debug:log', {
          message: `Boss hit ${hit.entityId}`,
          level: 'info',
        });
      }
    }

    // End attack when leaving AttackActive
    if (state !== BossStateType.AttackActive && this.activeAttack) {
      AttackSystem.endAttack(this.activeAttack);
      this.activeAttack = null;
    }
  }

  private startAttackExecution(): void {
    const pattern = this._fsm.attackPattern;
    if (!pattern || !this._collider) return;

    this.updateWeaponSockets();

    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this._rotation
    );

    this.activeAttack = AttackSystem.startAttack(
      this.id,
      pattern.attackId,
      this._collider,
      this.weaponSockets,
      forward
    );
  }

  private updateWeaponSockets(): void {
    // Calculate weapon positions based on boss position and rotation
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this._rotation
    );
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this._rotation
    );

    // Base: at shoulder height, offset to side
    this.weaponSockets.base.copy(this._position);
    this.weaponSockets.base.y += this.colliderHeight * 0.7;
    this.weaponSockets.base.add(right.clone().multiplyScalar(this.colliderRadius * 0.5));

    // Tip: extended forward and down (for swing attacks)
    this.weaponSockets.tip.copy(this.weaponSockets.base);
    this.weaponSockets.tip.add(forward.clone().multiplyScalar(2.5));
    this.weaponSockets.tip.y -= 0.5;

    // Adjust based on attack animation progress (simplified)
    if (this.activeAttack) {
      const progress = this._fsm.progress;
      const attackId = this._fsm.attackPattern?.attackId;

      if (attackId === 'boss_wide_sweep') {
        // Sweep from right to left
        const sweepAngle = (progress - 0.4) * Math.PI * 1.5;
        const sweepDir = right
          .clone()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), sweepAngle);
        this.weaponSockets.tip.copy(this.weaponSockets.base);
        this.weaponSockets.tip.add(sweepDir.multiplyScalar(3.0));
      } else if (attackId === 'boss_overhead_smash') {
        // Overhead to ground
        const smashProgress = Math.max(0, (progress - 0.3) / 0.3);
        this.weaponSockets.tip.copy(this.weaponSockets.base);
        this.weaponSockets.tip.add(forward.clone().multiplyScalar(1.5));
        this.weaponSockets.tip.y -= smashProgress * 3.0;
      }
      // AoE attacks use position-based detection, not weapon sockets
    }
  }

  private updatePoiseRecovery(dt: number): void {
    // Only recover if not recently hit
    if (Time.elapsed - this.lastPoiseHitTime < this.poiseRecoveryDelay) {
      return;
    }

    // Recover poise
    if (this._currentPoise < this._maxPoise) {
      this._currentPoise = Math.min(
        this._maxPoise,
        this._currentPoise + this.poiseRecoveryRate * dt
      );
    }
  }

  private syncMeshWithPhysics(): void {
    if (!this._mesh) return;

    this._mesh.position.copy(this._position);
    this._mesh.rotation.y = this._rotation;

    // Update rigid body
    if (this._rigidBody) {
      this._rigidBody.setNextKinematicTranslation({
        x: this._position.x,
        y: this._position.y,
        z: this._position.z,
      });
    }
  }

  // ========== Callbacks ==========

  private onStateEnter(state: BossStateType, prevState: BossStateType): void {
    // State-specific entry logic
    if (state === BossStateType.Staggered) {
      // Cancel any active attack
      if (this.activeAttack) {
        AttackSystem.cancelAttacks(this.id);
        this.activeAttack = null;
      }

      EventBus.emit('boss:staggered', {
        duration: 2.0,
      });
    }
  }

  private onStateExit(state: BossStateType, nextState: BossStateType): void {
    // State-specific exit logic
    if (state === BossStateType.Staggered) {
      // Reset poise after stagger
      DamageSystem.resetPoise(this.id);
      this._currentPoise = this._maxPoise;
    }
  }

  private onAttackSelected(pattern: AttackPattern): void {
    // Could play telegraph sound here
    EventBus.emit('debug:log', {
      message: `Boss preparing: ${pattern.attackId}`,
      level: 'info',
    });
  }

  private onAnimationTrigger(animationName: string, options?: { loop?: boolean }): void {
    // Would trigger actual animation here
    // For now, just log
    EventBus.emit('debug:log', {
      message: `Boss animation: ${animationName}`,
      level: 'info',
    });
  }

  private onTakeDamage(result: DamageResult): void {
    this._currentHP = Math.max(0, this._currentHP - result.finalDamage);
    this._currentPoise -= result.poiseDamage;
    this.lastPoiseHitTime = Time.elapsed;

    // Notify FSM
    this._fsm.onDamaged(result.finalDamage, result.poiseDamage, this._currentPoise);

    // Emit event
    EventBus.emit('boss:damaged', {
      damage: result.finalDamage,
      currentHp: this._currentHP,
      maxHp: this._maxHP,
    });

    EventBus.emit('boss:healthChanged', {
      current: this._currentHP,
      max: this._maxHP,
    });
  }

  private onDie(): void {
    this._isDead = true;
    this._fsm.onDeath();

    // Cancel any active attack
    if (this.activeAttack) {
      AttackSystem.cancelAttacks(this.id);
      this.activeAttack = null;
    }

    EventBus.emit('boss:died', {
      bossId: this.id,
    });

    EventBus.emit('game:victory');
  }

  private onStagger(): void {
    this._fsm.tryTransition(BossStateType.Staggered);
  }

  // ========== Public API ==========

  /**
   * Check if boss is in plunge detection zone
   */
  checkPlungeZone(entityPosition: THREE.Vector3, entityVelocityY: number): boolean {
    if (!this._plungeCollider || this._isDead) return false;

    // Check if entity is above boss and falling
    const relativePos = entityPosition.clone().sub(this._position);
    const horizontalDist = Math.sqrt(
      relativePos.x * relativePos.x + relativePos.z * relativePos.z
    );

    const isAbove = relativePos.y > this.colliderHeight;
    const isWithinRadius = horizontalDist <= this.plungeDetectionRadius;
    const isFalling = entityVelocityY < -5.0; // Falling fast enough

    return isAbove && isWithinRadius && isFalling;
  }

  /**
   * Called when player performs plunge attack on boss
   */
  receivePlungeAttack(): void {
    this._fsm.onPlungeHit();

    EventBus.emit('debug:log', {
      message: `Boss ${this.id} received plunge attack!`,
      level: 'info',
    });
  }

  /**
   * Get mesh
   */
  get mesh(): THREE.Group | null {
    return this._mesh;
  }

  /**
   * Get position
   */
  get position(): THREE.Vector3 {
    return this._position.clone();
  }

  /**
   * Get rotation
   */
  get rotation(): number {
    return this._rotation;
  }

  /**
   * Get FSM
   */
  get fsm(): BossFSM {
    return this._fsm;
  }

  /**
   * Get current HP
   */
  get currentHP(): number {
    return this._currentHP;
  }

  /**
   * Get max HP
   */
  get maxHP(): number {
    return this._maxHP;
  }

  /**
   * Get health percentage
   */
  get healthPercent(): number {
    return this._currentHP / this._maxHP;
  }

  /**
   * Check if dead
   */
  get isDead(): boolean {
    return this._isDead;
  }

  /**
   * Check if spawned
   */
  get isSpawned(): boolean {
    return this._isSpawned;
  }

  /**
   * Get collider
   */
  get collider(): RAPIER.Collider | null {
    return this._collider;
  }

  /**
   * Reset boss to initial state
   */
  reset(): void {
    this._currentHP = this._maxHP;
    this._currentPoise = this._maxPoise;
    this._isDead = false;
    this.lastPoiseHitTime = 0;

    if (this.activeAttack) {
      AttackSystem.cancelAttacks(this.id);
      this.activeAttack = null;
    }

    this._fsm.reset();
    this.updateDamageSystemState();
  }

  /**
   * Set position directly
   */
  setPosition(position: THREE.Vector3): void {
    this._position.copy(position);
    this.syncMeshWithPhysics();
  }

  /**
   * Set rotation directly
   */
  setRotation(rotation: number): void {
    this._rotation = rotation;
    if (this._mesh) {
      this._mesh.rotation.y = rotation;
    }
  }
}
