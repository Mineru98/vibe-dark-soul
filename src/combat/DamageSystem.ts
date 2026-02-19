/**
 * Damage System
 *
 * Centralized damage processing:
 * 1. I-frame check -> ignore damage
 * 2. Guard check -> stamina damage + reduced HP damage
 * 3. Apply HP damage + poise damage
 * 4. Check death
 *
 * Supports damage types, resistances, and modifiers.
 */

import * as THREE from 'three';
import { EventBus } from '../core/EventBus';
import { IFrameSystem, IFrameSource } from './IFrameSystem';
import { DamageType } from '../player/PlayerStats';

/**
 * Damage request structure
 */
export interface DamageRequest {
  // Source of damage
  sourceEntityId: string;
  sourceType: DamageSourceType;

  // Target of damage
  targetEntityId: string;

  // Damage values
  baseDamage: number;
  damageType: DamageType;
  poiseDamage?: number;

  // Position/direction for knockback
  hitPoint?: THREE.Vector3;
  hitDirection?: THREE.Vector3;

  // Modifiers
  canBeBlocked?: boolean;
  canBeDodged?: boolean;
  ignoreArmor?: boolean;

  // Critical hit
  isCritical?: boolean;
  criticalMultiplier?: number;
}

/**
 * Damage source types
 */
export enum DamageSourceType {
  PlayerAttack = 'PlayerAttack',
  EnemyAttack = 'EnemyAttack',
  BossAttack = 'BossAttack',
  Environment = 'Environment',
  Fall = 'Fall',
  Poison = 'Poison',
  Bleed = 'Bleed',
  Magic = 'Magic',
}

/**
 * Damage result
 */
export interface DamageResult {
  // Was damage applied?
  applied: boolean;

  // Reason if not applied
  blockedReason?: DamageBlockedReason;

  // Final values
  finalDamage: number;
  poiseDamage: number;

  // State changes
  targetStaggered: boolean;
  targetDied: boolean;
  guardBroken: boolean;

  // For UI effects
  damageType: DamageType;
  isCritical: boolean;
  hitPoint?: THREE.Vector3;
}

/**
 * Reasons damage can be blocked
 */
export enum DamageBlockedReason {
  IFrames = 'IFrames',
  GuardBlocked = 'GuardBlocked',
  Parried = 'Parried',
  TargetDead = 'TargetDead',
  TargetInvulnerable = 'TargetInvulnerable',
}

/**
 * Entity combat state (registered by entities)
 */
export interface EntityCombatState {
  entityId: string;

  // HP
  currentHP: number;
  maxHP: number;

  // Stamina (for guard)
  currentStamina: number;
  maxStamina: number;

  // Poise
  currentPoise: number;
  maxPoise: number;

  // State flags
  isGuarding: boolean;
  isParrying: boolean;
  isDead: boolean;

  // Guard properties
  guardStaminaCostMultiplier?: number; // How much stamina blocking costs
  guardDamageReduction?: number; // 0-1, how much damage is reduced when blocking

  // Resistances (damage type -> reduction %)
  resistances?: Map<DamageType, number>;

  // Callbacks
  onTakeDamage?: (result: DamageResult) => void;
  onDie?: () => void;
  onStagger?: () => void;
  onGuardBreak?: () => void;
}

/**
 * Damage System Manager
 */
class DamageSystemManager {
  // Registered entity states
  private entities: Map<string, EntityCombatState> = new Map();

  // Damage modifiers (for buffs/debuffs)
  private globalDamageMultiplier: number = 1.0;

  /**
   * Register an entity for damage processing
   */
  registerEntity(state: EntityCombatState): void {
    this.entities.set(state.entityId, state);
  }

  /**
   * Unregister an entity
   */
  unregisterEntity(entityId: string): void {
    this.entities.delete(entityId);
  }

  /**
   * Update entity state
   */
  updateEntityState(entityId: string, updates: Partial<EntityCombatState>): void {
    const state = this.entities.get(entityId);
    if (state) {
      Object.assign(state, updates);
    }
  }

  /**
   * Get entity state
   */
  getEntityState(entityId: string): EntityCombatState | undefined {
    return this.entities.get(entityId);
  }

  /**
   * Process a damage request
   *
   * @returns DamageResult with all processing details
   */
  processDamage(request: DamageRequest): DamageResult {
    const targetState = this.entities.get(request.targetEntityId);

    // Default result
    const result: DamageResult = {
      applied: false,
      finalDamage: 0,
      poiseDamage: 0,
      targetStaggered: false,
      targetDied: false,
      guardBroken: false,
      damageType: request.damageType,
      isCritical: request.isCritical ?? false,
      hitPoint: request.hitPoint,
    };

    // Check if target exists and is alive
    if (!targetState) {
      return result;
    }

    if (targetState.isDead) {
      result.blockedReason = DamageBlockedReason.TargetDead;
      return result;
    }

    // Step 1: Check I-Frames
    if (request.canBeDodged !== false) {
      if (IFrameSystem.hasIFrames(request.targetEntityId)) {
        result.blockedReason = DamageBlockedReason.IFrames;
        EventBus.emit('combat:dodged', {
          entityId: request.targetEntityId,
          sourceEntityId: request.sourceEntityId,
          damageType: request.damageType,
        });
        return result;
      }
    }

    // Calculate base damage
    let damage = request.baseDamage;

    // Apply critical multiplier
    if (request.isCritical) {
      damage *= request.criticalMultiplier ?? 2.0;
    }

    // Apply resistances
    if (targetState.resistances && !request.ignoreArmor) {
      const resistance = targetState.resistances.get(request.damageType) ?? 0;
      damage *= 1 - resistance;
    }

    // Apply global multiplier
    damage *= this.globalDamageMultiplier;

    // Step 2: Check Guard
    if (request.canBeBlocked !== false && targetState.isGuarding) {
      // Check for parry window
      if (targetState.isParrying) {
        result.blockedReason = DamageBlockedReason.Parried;
        EventBus.emit('combat:parried', {
          parryEntityId: request.targetEntityId,
          attackerEntityId: request.sourceEntityId,
        });
        return result;
      }

      // Calculate stamina cost for blocking
      const staminaCost =
        damage * (targetState.guardStaminaCostMultiplier ?? 1.0);

      if (targetState.currentStamina >= staminaCost) {
        // Successful block
        targetState.currentStamina -= staminaCost;

        // Reduced damage (some attacks do chip damage)
        const damageReduction = targetState.guardDamageReduction ?? 0.9;
        damage *= 1 - damageReduction;

        result.blockedReason = DamageBlockedReason.GuardBlocked;

        EventBus.emit('combat:blocked', {
          blockerEntityId: request.targetEntityId,
          attackerEntityId: request.sourceEntityId,
          staminaCost,
          chipDamage: damage,
        });

        // If chip damage is 0, block was complete
        if (damage <= 0) {
          return result;
        }
      } else {
        // Guard break - not enough stamina
        result.guardBroken = true;
        targetState.currentStamina = 0;

        EventBus.emit('combat:guardBroken', {
          entityId: request.targetEntityId,
          attackerEntityId: request.sourceEntityId,
        });

        targetState.onGuardBreak?.();

        // Full damage on guard break
      }
    }

    // Step 3: Apply HP damage
    result.finalDamage = Math.max(0, Math.floor(damage));
    targetState.currentHP -= result.finalDamage;
    result.applied = true;

    // Step 4: Apply poise damage
    result.poiseDamage = request.poiseDamage ?? 0;
    if (result.poiseDamage > 0) {
      targetState.currentPoise -= result.poiseDamage;

      if (targetState.currentPoise <= 0) {
        result.targetStaggered = true;
        targetState.currentPoise = 0;

        EventBus.emit('combat:staggered', {
          entityId: request.targetEntityId,
          sourceEntityId: request.sourceEntityId,
        });

        targetState.onStagger?.();
      }
    }

    // Step 5: Check death
    if (targetState.currentHP <= 0) {
      targetState.currentHP = 0;
      targetState.isDead = true;
      result.targetDied = true;

      EventBus.emit('combat:death', {
        entityId: request.targetEntityId,
        killerEntityId: request.sourceEntityId,
        damageType: request.damageType,
      });

      targetState.onDie?.();
    }

    // Emit damage event
    EventBus.emit('combat:damage', {
      sourceEntityId: request.sourceEntityId,
      targetEntityId: request.targetEntityId,
      damage: result.finalDamage,
      damageType: request.damageType,
      isCritical: result.isCritical,
      hitPoint: result.hitPoint,
    });

    // Call entity callback
    targetState.onTakeDamage?.(result);

    return result;
  }

  /**
   * Apply healing to an entity
   */
  heal(entityId: string, amount: number): number {
    const state = this.entities.get(entityId);
    if (!state || state.isDead) return 0;

    const prevHP = state.currentHP;
    state.currentHP = Math.min(state.maxHP, state.currentHP + amount);
    const actualHeal = state.currentHP - prevHP;

    if (actualHeal > 0) {
      EventBus.emit('combat:healed', {
        entityId,
        amount: actualHeal,
        currentHP: state.currentHP,
        maxHP: state.maxHP,
      });
    }

    return actualHeal;
  }

  /**
   * Apply stamina damage (for blocking, etc.)
   */
  applyStaminaDamage(entityId: string, amount: number): boolean {
    const state = this.entities.get(entityId);
    if (!state) return false;

    state.currentStamina -= amount;

    if (state.currentStamina <= 0) {
      state.currentStamina = 0;
      return true; // Stamina broken
    }

    return false;
  }

  /**
   * Restore stamina
   */
  restoreStamina(entityId: string, amount: number): void {
    const state = this.entities.get(entityId);
    if (!state) return;

    state.currentStamina = Math.min(
      state.maxStamina,
      state.currentStamina + amount
    );
  }

  /**
   * Reset poise (after stagger recovery)
   */
  resetPoise(entityId: string): void {
    const state = this.entities.get(entityId);
    if (!state) return;

    state.currentPoise = state.maxPoise;
  }

  /**
   * Revive an entity
   */
  revive(entityId: string, hpPercent: number = 1.0): void {
    const state = this.entities.get(entityId);
    if (!state) return;

    state.isDead = false;
    state.currentHP = Math.floor(state.maxHP * hpPercent);
    state.currentStamina = state.maxStamina;
    state.currentPoise = state.maxPoise;

    EventBus.emit('combat:revived', {
      entityId,
      currentHP: state.currentHP,
    });
  }

  /**
   * Set global damage multiplier (for difficulty, buffs, etc.)
   */
  setGlobalDamageMultiplier(multiplier: number): void {
    this.globalDamageMultiplier = multiplier;
  }

  /**
   * Get global damage multiplier
   */
  getGlobalDamageMultiplier(): number {
    return this.globalDamageMultiplier;
  }

  /**
   * Clear all registered entities
   */
  clear(): void {
    this.entities.clear();
  }
}

// Singleton instance
export const DamageSystem = new DamageSystemManager();
