/**
 * Attack System
 *
 * Manages attack execution and hit detection:
 * - Attack data definitions
 * - Frame-based hitbox sweeping (weapon socket -> shapeCast)
 * - Multi-hit prevention (same target hit once per attack)
 * - Combo chain management
 * - Damage request generation
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CollisionGroups, CollisionGroup } from '../physics/CollisionGroups';
import { EventBus } from '../core/EventBus';
import { DamageSystem, DamageRequest, DamageSourceType } from './DamageSystem';
import { DamageType } from '../player/PlayerStats';

/**
 * Attack data definition
 */
export interface AttackData {
  // Identification
  id: string;
  name: string;

  // Damage
  baseDamage: number;
  damageType: DamageType;
  poiseDamage: number;

  // Cost
  staminaCost: number;

  // Timing (normalized 0-1 progress)
  activeFrames: [number, number]; // When hitbox is active
  comboWindow?: [number, number]; // When next attack can chain

  // Hitbox
  hitboxRadius: number;
  hitboxLength: number; // For sweeping attacks

  // Properties
  canBeBlocked?: boolean;
  canBeDodged?: boolean;
  knockbackForce?: number;

  // Critical hit
  criticalMultiplier?: number;
}

/**
 * Active attack instance
 */
export interface ActiveAttack {
  // Source
  attackerId: string;
  attackerCollider: RAPIER.Collider;

  // Attack data
  attackData: AttackData;

  // State
  startTime: number;
  progress: number;
  isActive: boolean;

  // Weapon positions for sweep
  prevWeaponBase: THREE.Vector3;
  prevWeaponTip: THREE.Vector3;
  currentWeaponBase: THREE.Vector3;
  currentWeaponTip: THREE.Vector3;

  // Hit tracking (prevent multi-hit)
  hitEntities: Set<string>;

  // Direction for knockback
  attackDirection: THREE.Vector3;
}

/**
 * Weapon socket positions (for melee hitbox)
 */
export interface WeaponSockets {
  base: THREE.Vector3; // Handle/grip position
  tip: THREE.Vector3; // Blade/tip position
}

/**
 * Hit detection result
 */
export interface HitResult {
  entityId: string;
  hitPoint: THREE.Vector3;
  hitNormal: THREE.Vector3;
  collider: RAPIER.Collider;
}

/**
 * Default attack library
 */
export const DEFAULT_ATTACKS: Record<string, AttackData> = {
  // Player attacks
  player_light_1: {
    id: 'player_light_1',
    name: 'Light Attack 1',
    baseDamage: 25,
    damageType: DamageType.Physical,
    poiseDamage: 15,
    staminaCost: 16,
    activeFrames: [0.22, 0.38],
    comboWindow: [0.4, 0.6],
    hitboxRadius: 0.4,
    hitboxLength: 1.2,
    canBeBlocked: true,
    canBeDodged: true,
    knockbackForce: 2,
  },
  player_light_2: {
    id: 'player_light_2',
    name: 'Light Attack 2',
    baseDamage: 28,
    damageType: DamageType.Physical,
    poiseDamage: 18,
    staminaCost: 18,
    activeFrames: [0.2, 0.36],
    comboWindow: [0.4, 0.6],
    hitboxRadius: 0.45,
    hitboxLength: 1.3,
    canBeBlocked: true,
    canBeDodged: true,
    knockbackForce: 2.5,
  },
  player_light_3: {
    id: 'player_light_3',
    name: 'Light Attack 3',
    baseDamage: 35,
    damageType: DamageType.Physical,
    poiseDamage: 25,
    staminaCost: 22,
    activeFrames: [0.25, 0.45],
    hitboxRadius: 0.5,
    hitboxLength: 1.4,
    canBeBlocked: true,
    canBeDodged: true,
    knockbackForce: 4,
  },
  player_heavy: {
    id: 'player_heavy',
    name: 'Heavy Attack',
    baseDamage: 50,
    damageType: DamageType.Physical,
    poiseDamage: 40,
    staminaCost: 28,
    activeFrames: [0.3, 0.52],
    hitboxRadius: 0.6,
    hitboxLength: 1.5,
    canBeBlocked: true,
    canBeDodged: true,
    knockbackForce: 6,
    criticalMultiplier: 2.5,
  },
  player_plunge: {
    id: 'player_plunge',
    name: 'Plunge Attack',
    baseDamage: 80,
    damageType: DamageType.Physical,
    poiseDamage: 60,
    staminaCost: 20,
    activeFrames: [0.0, 0.5],
    hitboxRadius: 1.5,
    hitboxLength: 0, // AoE, not sweep
    canBeBlocked: false,
    canBeDodged: true,
    knockbackForce: 8,
    criticalMultiplier: 3.0,
  },

  // Boss attacks (examples)
  boss_wide_sweep: {
    id: 'boss_wide_sweep',
    name: 'Wide Sweep',
    baseDamage: 40,
    damageType: DamageType.Physical,
    poiseDamage: 50,
    staminaCost: 0,
    activeFrames: [0.3, 0.55],
    hitboxRadius: 1.2,
    hitboxLength: 3.0,
    canBeBlocked: true,
    canBeDodged: true,
    knockbackForce: 5,
  },
  boss_overhead_smash: {
    id: 'boss_overhead_smash',
    name: 'Overhead Smash',
    baseDamage: 60,
    damageType: DamageType.Physical,
    poiseDamage: 80,
    staminaCost: 0,
    activeFrames: [0.4, 0.6],
    hitboxRadius: 1.5,
    hitboxLength: 0.5,
    canBeBlocked: true,
    canBeDodged: true,
    knockbackForce: 8,
  },
  boss_jump_slam: {
    id: 'boss_jump_slam',
    name: 'Jump Slam',
    baseDamage: 70,
    damageType: DamageType.Physical,
    poiseDamage: 100,
    staminaCost: 0,
    activeFrames: [0.5, 0.7],
    hitboxRadius: 2.5,
    hitboxLength: 0, // AoE
    canBeBlocked: false,
    canBeDodged: true,
    knockbackForce: 10,
  },
  boss_aoe_stomp: {
    id: 'boss_aoe_stomp',
    name: 'AoE Stomp',
    baseDamage: 35,
    damageType: DamageType.Physical,
    poiseDamage: 30,
    staminaCost: 0,
    activeFrames: [0.35, 0.5],
    hitboxRadius: 4.0,
    hitboxLength: 0, // AoE
    canBeBlocked: true,
    canBeDodged: true,
    knockbackForce: 3,
  },
};

/**
 * Attack System Manager
 */
class AttackSystemManager {
  // Registered attacks
  private attacks: Map<string, AttackData> = new Map();

  // Active attacks being processed
  private activeAttacks: Map<string, ActiveAttack> = new Map();

  // Temporary vectors
  private _tempVec3: THREE.Vector3 = new THREE.Vector3();
  private _tempVec3B: THREE.Vector3 = new THREE.Vector3();

  constructor() {
    // Load default attacks
    for (const [id, data] of Object.entries(DEFAULT_ATTACKS)) {
      this.attacks.set(id, data);
    }
  }

  /**
   * Register a custom attack
   */
  registerAttack(attack: AttackData): void {
    this.attacks.set(attack.id, attack);
  }

  /**
   * Get attack data by ID
   */
  getAttack(attackId: string): AttackData | undefined {
    return this.attacks.get(attackId);
  }

  /**
   * Start an attack
   *
   * @param attackerId Entity performing the attack
   * @param attackId Attack data ID
   * @param attackerCollider Collider to exclude from hit detection
   * @param weaponSockets Current weapon socket positions
   * @param attackDirection Direction the attack is facing
   * @returns Active attack instance or null if failed
   */
  startAttack(
    attackerId: string,
    attackId: string,
    attackerCollider: RAPIER.Collider,
    weaponSockets: WeaponSockets,
    attackDirection: THREE.Vector3
  ): ActiveAttack | null {
    const attackData = this.attacks.get(attackId);
    if (!attackData) {
      console.warn(`Attack not found: ${attackId}`);
      return null;
    }

    // Create active attack instance
    const activeAttack: ActiveAttack = {
      attackerId,
      attackerCollider,
      attackData,
      startTime: Date.now(),
      progress: 0,
      isActive: false,
      prevWeaponBase: weaponSockets.base.clone(),
      prevWeaponTip: weaponSockets.tip.clone(),
      currentWeaponBase: weaponSockets.base.clone(),
      currentWeaponTip: weaponSockets.tip.clone(),
      hitEntities: new Set(),
      attackDirection: attackDirection.clone().normalize(),
    };

    // Use unique key (attacker can have multiple attacks in rare cases)
    const key = `${attackerId}_${attackId}_${activeAttack.startTime}`;
    this.activeAttacks.set(key, activeAttack);

    EventBus.emit('attack:started', {
      attackerId,
      attackId,
    });

    return activeAttack;
  }

  /**
   * Update an active attack
   *
   * @param attack Active attack instance
   * @param progress Animation progress (0-1)
   * @param weaponSockets Current weapon socket positions
   * @param targetGroups Collision groups to check for hits
   * @returns Array of hit results
   */
  updateAttack(
    attack: ActiveAttack,
    progress: number,
    weaponSockets: WeaponSockets,
    targetGroups: number = CollisionGroups.ENEMY
  ): HitResult[] {
    const hits: HitResult[] = [];

    // Update progress
    attack.progress = progress;

    // Update weapon positions
    attack.prevWeaponBase.copy(attack.currentWeaponBase);
    attack.prevWeaponTip.copy(attack.currentWeaponTip);
    attack.currentWeaponBase.copy(weaponSockets.base);
    attack.currentWeaponTip.copy(weaponSockets.tip);

    // Check if in active frames
    const [activeStart, activeEnd] = attack.attackData.activeFrames;
    const wasActive = attack.isActive;
    attack.isActive = progress >= activeStart && progress <= activeEnd;

    // Just entered active frames
    if (attack.isActive && !wasActive) {
      EventBus.emit('attack:activeStart', {
        attackerId: attack.attackerId,
        attackId: attack.attackData.id,
      });
    }

    // Just exited active frames
    if (!attack.isActive && wasActive) {
      EventBus.emit('attack:activeEnd', {
        attackerId: attack.attackerId,
        attackId: attack.attackData.id,
      });
    }

    // Perform hit detection if active
    if (attack.isActive) {
      if (attack.attackData.hitboxLength > 0) {
        // Sweeping attack - use shapeCast between previous and current positions
        const sweepHits = this.performSweepHitDetection(attack, targetGroups);
        hits.push(...sweepHits);
      } else {
        // AoE attack - use overlap sphere
        const aoeHits = this.performAoEHitDetection(attack, targetGroups);
        hits.push(...aoeHits);
      }

      // Process hits through damage system
      for (const hit of hits) {
        this.processHit(attack, hit);
      }
    }

    return hits;
  }

  /**
   * End an active attack
   */
  endAttack(attack: ActiveAttack): void {
    // Find and remove from active attacks
    for (const [key, activeAttack] of this.activeAttacks.entries()) {
      if (activeAttack === attack) {
        this.activeAttacks.delete(key);
        break;
      }
    }

    EventBus.emit('attack:ended', {
      attackerId: attack.attackerId,
      attackId: attack.attackData.id,
      hitCount: attack.hitEntities.size,
    });
  }

  /**
   * Cancel all active attacks from an entity
   */
  cancelAttacks(attackerId: string): void {
    for (const [key, attack] of this.activeAttacks.entries()) {
      if (attack.attackerId === attackerId) {
        this.activeAttacks.delete(key);
        EventBus.emit('attack:cancelled', {
          attackerId,
          attackId: attack.attackData.id,
        });
      }
    }
  }

  /**
   * Get active attack for an entity
   */
  getActiveAttack(attackerId: string): ActiveAttack | null {
    for (const attack of this.activeAttacks.values()) {
      if (attack.attackerId === attackerId) {
        return attack;
      }
    }
    return null;
  }

  /**
   * Check if entity has an active attack
   */
  hasActiveAttack(attackerId: string): boolean {
    return this.getActiveAttack(attackerId) !== null;
  }

  /**
   * Check if attack is in combo window
   */
  isInComboWindow(attack: ActiveAttack): boolean {
    if (!attack.attackData.comboWindow) return false;

    const [start, end] = attack.attackData.comboWindow;
    return attack.progress >= start && attack.progress <= end;
  }

  /**
   * Clean up expired attacks
   */
  cleanup(): void {
    const now = Date.now();
    const maxAttackDuration = 3000; // 3 seconds max

    for (const [key, attack] of this.activeAttacks.entries()) {
      if (now - attack.startTime > maxAttackDuration) {
        this.activeAttacks.delete(key);
      }
    }
  }

  // ========== Private Methods ==========

  /**
   * Perform sweep hit detection (for melee weapons)
   */
  private performSweepHitDetection(
    attack: ActiveAttack,
    targetGroups: number
  ): HitResult[] {
    const hits: HitResult[] = [];

    // Calculate sweep direction (from previous to current weapon position)
    const sweepDir = this._tempVec3
      .copy(attack.currentWeaponTip)
      .sub(attack.prevWeaponTip);

    const sweepDistance = sweepDir.length();
    if (sweepDistance < 0.01) {
      // Not enough movement, skip
      return hits;
    }
    sweepDir.normalize();

    // Create capsule shape for the weapon
    const capsule = new RAPIER.Capsule(
      attack.attackData.hitboxLength / 2,
      attack.attackData.hitboxRadius
    );

    // Shape cast from previous to current position
    const shapeCastHit = PhysicsWorld.shapeCast(
      capsule,
      attack.prevWeaponBase,
      sweepDir,
      sweepDistance,
      targetGroups,
      [attack.attackerCollider]
    );

    if (shapeCastHit) {
      const entityId = PhysicsWorld.getEntityFromCollider(shapeCastHit.collider);

      if (entityId && !attack.hitEntities.has(entityId)) {
        hits.push({
          entityId,
          hitPoint: shapeCastHit.point.clone(),
          hitNormal: shapeCastHit.normal.clone(),
          collider: shapeCastHit.collider,
        });
      }
    }

    // Also check overlap at current position for immediate contacts
    const overlapHits = PhysicsWorld.overlapSphere(
      attack.currentWeaponTip,
      attack.attackData.hitboxRadius * 1.5,
      targetGroups
    );

    for (const overlap of overlapHits) {
      if (overlap.collider.handle === attack.attackerCollider.handle) continue;

      const entityId = PhysicsWorld.getEntityFromCollider(overlap.collider);
      if (entityId && !attack.hitEntities.has(entityId)) {
        // Check if already in hits
        const alreadyHit = hits.some((h) => h.entityId === entityId);
        if (!alreadyHit) {
          hits.push({
            entityId,
            hitPoint: attack.currentWeaponTip.clone(),
            hitNormal: attack.attackDirection.clone().negate(),
            collider: overlap.collider,
          });
        }
      }
    }

    return hits;
  }

  /**
   * Perform AoE hit detection (for slam attacks, etc.)
   */
  private performAoEHitDetection(
    attack: ActiveAttack,
    targetGroups: number
  ): HitResult[] {
    const hits: HitResult[] = [];

    // Use weapon base as center for AoE
    const center = attack.currentWeaponBase;

    // Overlap sphere check
    const overlapHits = PhysicsWorld.overlapSphere(
      center,
      attack.attackData.hitboxRadius,
      targetGroups
    );

    for (const overlap of overlapHits) {
      if (overlap.collider.handle === attack.attackerCollider.handle) continue;

      const entityId = PhysicsWorld.getEntityFromCollider(overlap.collider);
      if (entityId && !attack.hitEntities.has(entityId)) {
        // Calculate direction from center to target
        const colliderPos = overlap.collider.translation();
        const hitNormal = this._tempVec3B
          .set(colliderPos.x, colliderPos.y, colliderPos.z)
          .sub(center)
          .normalize();

        hits.push({
          entityId,
          hitPoint: center.clone(),
          hitNormal: hitNormal.clone(),
          collider: overlap.collider,
        });
      }
    }

    return hits;
  }

  /**
   * Process a hit through the damage system
   */
  private processHit(attack: ActiveAttack, hit: HitResult): void {
    // Mark as hit to prevent multi-hit
    attack.hitEntities.add(hit.entityId);

    // Determine damage source type
    let sourceType = DamageSourceType.PlayerAttack;
    if (attack.attackerId.startsWith('boss')) {
      sourceType = DamageSourceType.BossAttack;
    } else if (attack.attackerId.startsWith('enemy')) {
      sourceType = DamageSourceType.EnemyAttack;
    }

    // Create damage request
    const damageRequest: DamageRequest = {
      sourceEntityId: attack.attackerId,
      sourceType,
      targetEntityId: hit.entityId,
      baseDamage: attack.attackData.baseDamage,
      damageType: attack.attackData.damageType,
      poiseDamage: attack.attackData.poiseDamage,
      hitPoint: hit.hitPoint,
      hitDirection: attack.attackDirection,
      canBeBlocked: attack.attackData.canBeBlocked,
      canBeDodged: attack.attackData.canBeDodged,
      criticalMultiplier: attack.attackData.criticalMultiplier,
    };

    // Process through damage system
    const result = DamageSystem.processDamage(damageRequest);

    // Emit hit event
    EventBus.emit('attack:hit', {
      attackerId: attack.attackerId,
      attackId: attack.attackData.id,
      targetId: hit.entityId,
      damage: result.finalDamage,
      hitPoint: hit.hitPoint,
      blocked: result.blockedReason !== undefined,
      staggered: result.targetStaggered,
      killed: result.targetDied,
    });
  }
}

// Singleton instance
export const AttackSystem = new AttackSystemManager();
