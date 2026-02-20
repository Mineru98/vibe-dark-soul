/**
 * I-Frame (Invincibility Frame) System
 *
 * Manages invincibility frames for all entities:
 * - Roll i-frames
 * - Backstep i-frames
 * - Attack hyper-armor
 * - Temporary invincibility (respawn, etc.)
 *
 * Used by DamageSystem to check if damage should be ignored.
 */

import { EventBus } from '../core/EventBus';
import { Time } from '../core/Time';

/**
 * I-frame source type
 */
export enum IFrameSource {
  Roll = 'Roll',
  Backstep = 'Backstep',
  HyperArmor = 'HyperArmor',
  Respawn = 'Respawn',
  PlungeAttack = 'PlungeAttack',
  Custom = 'Custom',
}

/**
 * Active i-frame entry
 */
interface IFrameEntry {
  source: IFrameSource;
  startTime: number;
  endTime: number;
  // Optional damage reduction instead of full immunity
  damageReduction?: number; // 0-1, 1 = full immunity
}

/**
 * Entity i-frame state
 */
interface EntityIFrameState {
  entries: IFrameEntry[];
  // Cached immunity state
  isImmune: boolean;
  // Total damage reduction (0-1)
  damageReduction: number;
}

/**
 * I-Frame System class
 */
class IFrameSystemManager {
  // Entity i-frame states
  private entities: Map<string, EntityIFrameState> = new Map();

  /**
   * Grant i-frames to an entity
   *
   * @param entityId Entity ID
   * @param source Source of i-frames
   * @param duration Duration in seconds
   * @param damageReduction Optional damage reduction (0-1, default 1 = full immunity)
   */
  grantIFrames(
    entityId: string,
    source: IFrameSource,
    duration: number,
    damageReduction: number = 1.0
  ): void {
    const state = this.getOrCreateState(entityId);
    const now = Time.elapsed;

    const entry: IFrameEntry = {
      source,
      startTime: now,
      endTime: now + duration,
      damageReduction: Math.max(0, Math.min(1, damageReduction)),
    };

    state.entries.push(entry);
    this.updateEntityState(entityId);

    EventBus.emit('iframes:granted', {
      entityId,
      source,
      duration,
    });
  }

  /**
   * Grant i-frames based on animation progress
   *
   * @param entityId Entity ID
   * @param source Source of i-frames
   * @param progress Current animation progress (0-1)
   * @param startProgress Progress when i-frames start
   * @param endProgress Progress when i-frames end
   * @param totalDuration Total animation duration
   * @returns true if currently in i-frames
   */
  updateProgressBasedIFrames(
    entityId: string,
    source: IFrameSource,
    progress: number,
    startProgress: number,
    endProgress: number,
    totalDuration: number
  ): boolean {
    const inIFrameWindow = progress >= startProgress && progress <= endProgress;

    if (inIFrameWindow) {
      // Calculate remaining duration
      const remainingProgress = endProgress - progress;
      const remainingDuration = remainingProgress * totalDuration;

      // Only grant if not already active from same source
      const state = this.getOrCreateState(entityId);
      const existingEntry = state.entries.find((e) => e.source === source);

      if (!existingEntry || existingEntry.endTime < Time.elapsed) {
        this.grantIFrames(entityId, source, remainingDuration);
      }
    }

    return inIFrameWindow;
  }

  /**
   * Revoke all i-frames from a specific source
   */
  revokeIFrames(entityId: string, source: IFrameSource): void {
    const state = this.entities.get(entityId);
    if (!state) return;

    state.entries = state.entries.filter((e) => e.source !== source);
    this.updateEntityState(entityId);

    EventBus.emit('iframes:revoked', {
      entityId,
      source,
    });
  }

  /**
   * Revoke all i-frames from an entity
   */
  revokeAllIFrames(entityId: string): void {
    const state = this.entities.get(entityId);
    if (!state) return;

    state.entries = [];
    this.updateEntityState(entityId);

    EventBus.emit('iframes:revokedAll', {
      entityId,
    });
  }

  /**
   * Check if entity has i-frames
   */
  hasIFrames(entityId: string): boolean {
    const state = this.entities.get(entityId);
    if (!state) return false;

    // Clean expired entries first
    this.cleanExpiredEntries(entityId);

    return state.isImmune;
  }

  /**
   * Get damage reduction multiplier
   *
   * @returns 0 = no reduction, 1 = full immunity
   */
  getDamageReduction(entityId: string): number {
    const state = this.entities.get(entityId);
    if (!state) return 0;

    // Clean expired entries first
    this.cleanExpiredEntries(entityId);

    return state.damageReduction;
  }

  /**
   * Calculate final damage after i-frame reduction
   *
   * @param entityId Entity ID
   * @param baseDamage Original damage amount
   * @returns Damage after reduction
   */
  calculateDamageAfterIFrames(entityId: string, baseDamage: number): number {
    const reduction = this.getDamageReduction(entityId);
    return baseDamage * (1 - reduction);
  }

  /**
   * Check if entity has a specific i-frame source active
   */
  hasIFrameSource(entityId: string, source: IFrameSource): boolean {
    const state = this.entities.get(entityId);
    if (!state) return false;

    const now = Time.elapsed;
    return state.entries.some((e) => e.source === source && e.endTime > now);
  }

  /**
   * Get remaining i-frame duration
   */
  getRemainingDuration(entityId: string): number {
    const state = this.entities.get(entityId);
    if (!state) return 0;

    const now = Time.elapsed;
    let maxRemaining = 0;

    for (const entry of state.entries) {
      const remaining = entry.endTime - now;
      if (remaining > maxRemaining) {
        maxRemaining = remaining;
      }
    }

    return Math.max(0, maxRemaining);
  }

  /**
   * Update system (call every frame to clean expired entries)
   */
  update(): void {
    for (const entityId of this.entities.keys()) {
      this.cleanExpiredEntries(entityId);
    }
  }

  /**
   * Clear all i-frame data
   */
  clear(): void {
    this.entities.clear();
  }

  /**
   * Remove entity from system
   */
  removeEntity(entityId: string): void {
    this.entities.delete(entityId);
  }

  // ========== Private Methods ==========

  private getOrCreateState(entityId: string): EntityIFrameState {
    let state = this.entities.get(entityId);
    if (!state) {
      state = {
        entries: [],
        isImmune: false,
        damageReduction: 0,
      };
      this.entities.set(entityId, state);
    }
    return state;
  }

  private cleanExpiredEntries(entityId: string): void {
    const state = this.entities.get(entityId);
    if (!state) return;

    const now = Time.elapsed;
    const hadEntries = state.entries.length > 0;

    state.entries = state.entries.filter((e) => e.endTime > now);

    if (hadEntries && state.entries.length === 0) {
      EventBus.emit('iframes:expired', { entityId });
    }

    this.updateEntityState(entityId);
  }

  private updateEntityState(entityId: string): void {
    const state = this.entities.get(entityId);
    if (!state) return;

    if (state.entries.length === 0) {
      state.isImmune = false;
      state.damageReduction = 0;
      return;
    }

    // Calculate max damage reduction from all active entries
    let maxReduction = 0;
    for (const entry of state.entries) {
      const reduction = entry.damageReduction ?? 1;
      if (reduction > maxReduction) {
        maxReduction = reduction;
      }
    }

    state.damageReduction = maxReduction;
    state.isImmune = maxReduction >= 1;
  }
}

// Singleton instance
export const IFrameSystem = new IFrameSystemManager();
