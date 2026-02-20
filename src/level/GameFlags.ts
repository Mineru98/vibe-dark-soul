/**
 * GameFlags - Persistent game state flags
 *
 * Usage:
 * - Track game progression (metBossOnce, hasWeapon, bossDefeated, etc.)
 * - Conditionally enable/disable triggers, dialogues, events
 * - Save/load game progress
 *
 * Events emitted:
 * - 'flag:set' when a flag is set to true
 * - 'flag:cleared' when a flag is cleared
 */

import { EventBus } from '../core/EventBus';

/**
 * Known game flags (type safety)
 */
export enum GameFlag {
  // Tutorial progression
  TUTORIAL_COMPLETED = 'tutorial_completed',
  LEARNED_MOVEMENT = 'learned_movement',
  LEARNED_ROLL = 'learned_roll',
  LEARNED_ATTACK = 'learned_attack',
  LEARNED_BLOCK = 'learned_block',
  LEARNED_HEAL = 'learned_heal',
  LEARNED_LOCKON = 'learned_lockon',

  // Equipment
  HAS_WEAPON = 'has_weapon',
  HAS_SHIELD = 'has_shield',
  HAS_ESTUS = 'has_estus',

  // Boss encounters
  MET_BOSS_ONCE = 'met_boss_once',
  BOSS_DEFEATED = 'boss_defeated',
  BOSS_PLUNGED = 'boss_plunged',

  // Checkpoints
  CHECKPOINT_CELL = 'checkpoint_cell',
  CHECKPOINT_CORRIDOR = 'checkpoint_corridor',
  CHECKPOINT_BOSS_ROOM = 'checkpoint_boss_room',

  // Doors and shortcuts
  BOSS_DOOR_OPENED = 'boss_door_opened',
  SHORTCUT_UNLOCKED = 'shortcut_unlocked',

  // Items collected
  KEY_CELL = 'key_cell',
  KEY_BOSS_ROOM = 'key_boss_room',

  // Misc
  SAW_INTRO_CUTSCENE = 'saw_intro_cutscene',
  SAW_BOSS_INTRO = 'saw_boss_intro',
  SAW_VICTORY_CUTSCENE = 'saw_victory_cutscene',
}

/**
 * Flag change listener
 */
type FlagListener = (flag: string, value: boolean) => void;

/**
 * GameFlags manager
 */
class GameFlagsManager {
  private flags: Map<string, boolean> = new Map();
  private listeners: Set<FlagListener> = new Set();

  /**
   * Set a flag to true
   */
  set(flag: GameFlag | string): void {
    const wasSet = this.flags.get(flag) ?? false;
    this.flags.set(flag, true);

    if (!wasSet) {
      // Notify listeners
      this.notifyListeners(flag, true);

      // Emit EventBus event
      EventBus.emit('flag:set', { flag });
    }
  }

  /**
   * Clear (set to false) a flag
   */
  clear(flag: GameFlag | string): void {
    const wasSet = this.flags.get(flag) ?? false;
    this.flags.set(flag, false);

    if (wasSet) {
      // Notify listeners
      this.notifyListeners(flag, false);

      // Emit EventBus event
      EventBus.emit('flag:cleared', { flag });
    }
  }

  /**
   * Toggle a flag
   */
  toggle(flag: GameFlag | string): boolean {
    const current = this.flags.get(flag) ?? false;
    if (current) {
      this.clear(flag);
    } else {
      this.set(flag);
    }
    return !current;
  }

  /**
   * Check if a flag is set
   */
  is(flag: GameFlag | string): boolean {
    return this.flags.get(flag) ?? false;
  }

  /**
   * Check if all flags are set
   */
  all(...flags: (GameFlag | string)[]): boolean {
    return flags.every((flag) => this.is(flag));
  }

  /**
   * Check if any flag is set
   */
  any(...flags: (GameFlag | string)[]): boolean {
    return flags.some((flag) => this.is(flag));
  }

  /**
   * Check if no flags are set
   */
  none(...flags: (GameFlag | string)[]): boolean {
    return !this.any(...flags);
  }

  /**
   * Get all set flags
   */
  getAllSet(): string[] {
    const result: string[] = [];
    for (const [flag, value] of this.flags) {
      if (value) {
        result.push(flag);
      }
    }
    return result;
  }

  /**
   * Get count of set flags
   */
  count(): number {
    let count = 0;
    for (const value of this.flags.values()) {
      if (value) count++;
    }
    return count;
  }

  /**
   * Add a listener for flag changes
   */
  addListener(listener: FlagListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Remove a listener
   */
  removeListener(listener: FlagListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of a flag change
   */
  private notifyListeners(flag: string, value: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(flag, value);
      } catch (error) {
        console.error('[GameFlags] Error in listener:', error);
      }
    }
  }

  /**
   * Reset all flags
   */
  reset(): void {
    const setFlags = this.getAllSet();

    this.flags.clear();

    // Notify about cleared flags
    for (const flag of setFlags) {
      this.notifyListeners(flag, false);
      EventBus.emit('flag:cleared', { flag });
    }
  }

  /**
   * Initialize with a set of flags
   */
  initialize(flagsToSet: (GameFlag | string)[]): void {
    for (const flag of flagsToSet) {
      this.flags.set(flag, true);
    }
  }

  /**
   * Export flags to JSON-serializable object
   */
  export(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [flag, value] of this.flags) {
      result[flag] = value;
    }
    return result;
  }

  /**
   * Import flags from JSON object
   */
  import(data: Record<string, boolean>): void {
    // Clear existing
    this.flags.clear();

    // Import new
    for (const [flag, value] of Object.entries(data)) {
      if (typeof value === 'boolean') {
        this.flags.set(flag, value);
      }
    }
  }

  /**
   * Save flags to localStorage
   */
  saveToStorage(key: string = 'darksouls_flags'): void {
    try {
      const data = JSON.stringify(this.export());
      localStorage.setItem(key, data);
    } catch (error) {
      console.error('[GameFlags] Failed to save to storage:', error);
    }
  }

  /**
   * Load flags from localStorage
   */
  loadFromStorage(key: string = 'darksouls_flags'): boolean {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        this.import(JSON.parse(data));
        return true;
      }
    } catch (error) {
      console.error('[GameFlags] Failed to load from storage:', error);
    }
    return false;
  }

  /**
   * Clear saved flags from localStorage
   */
  clearStorage(key: string = 'darksouls_flags'): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[GameFlags] Failed to clear storage:', error);
    }
  }
}

// Singleton instance
export const GameFlags = new GameFlagsManager();

/**
 * Helper: Condition checker for triggers/events
 */
export interface FlagCondition {
  require?: (GameFlag | string)[]; // All must be true
  requireAny?: (GameFlag | string)[]; // At least one must be true
  exclude?: (GameFlag | string)[]; // None can be true
}

/**
 * Check if a flag condition is satisfied
 */
export function checkFlagCondition(condition: FlagCondition): boolean {
  // Check required flags (AND)
  if (condition.require && condition.require.length > 0) {
    if (!GameFlags.all(...condition.require)) {
      return false;
    }
  }

  // Check any required flags (OR)
  if (condition.requireAny && condition.requireAny.length > 0) {
    if (!GameFlags.any(...condition.requireAny)) {
      return false;
    }
  }

  // Check excluded flags (NOT)
  if (condition.exclude && condition.exclude.length > 0) {
    if (GameFlags.any(...condition.exclude)) {
      return false;
    }
  }

  return true;
}

/**
 * Helper: Wait for a flag to be set
 */
export function waitForFlag(
  flag: GameFlag | string,
  timeout?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already set?
    if (GameFlags.is(flag)) {
      resolve();
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = GameFlags.addListener((changedFlag, value) => {
      if (changedFlag === flag && value) {
        unsubscribe();
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      }
    });

    // Optional timeout
    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for flag: ${flag}`));
      }, timeout);
    }
  });
}
