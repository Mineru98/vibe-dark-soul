/**
 * Type-safe EventBus for decoupled communication between game systems
 *
 * Usage:
 * - EventBus.on('event', handler): Subscribe to events
 * - EventBus.emit('event', payload): Emit events
 * - EventBus.off('event', handler): Unsubscribe
 * - EventBus.once('event', handler): One-time subscription
 */

// Event type definitions for type safety
export interface GameEvents {
  // Player events
  'player:damaged': { damage: number; source: string; currentHp: number };
  'player:healed': { amount: number; currentHp: number };
  'player:died': { position: { x: number; y: number; z: number } };
  'player:respawned': { checkpoint: string };
  'player:staminaChanged': { current: number; max: number };
  'player:healthChanged': { current: number; max: number };
  'player:stateChanged': { previous: string; current: string };

  // Boss events
  'boss:engaged': { bossId: string; name: string; maxHp: number };
  'boss:damaged': { damage: number; currentHp: number; maxHp: number };
  'boss:staggered': { duration: number };
  'boss:phaseChanged': { phase: number };
  'boss:died': { bossId: string };
  'boss:healthChanged': { current: number; max: number };

  // Combat events
  'combat:hit': {
    attacker: string;
    target: string;
    damage: number;
    type: string;
  };
  'combat:blocked': { blocker: string; attacker: string; staminaDamage: number };
  'combat:parried': { defender: string; attacker: string };
  'combat:criticalHit': { attacker: string; target: string; damage: number };

  // Trigger/Level events
  'trigger:enter': { triggerId: string; entityId: string };
  'trigger:exit': { triggerId: string; entityId: string };
  'trigger:stay': { triggerId: string; entityId: string };
  'checkpoint:activated': { checkpointId: string };
  'item:pickup': { itemId: string; itemType: string };

  // Game state events
  'game:pause': void;
  'game:resume': void;
  'game:start': void;
  'game:over': { reason: string };
  'game:victory': void;

  // Flag events
  'flag:set': { flag: string };
  'flag:cleared': { flag: string };

  // Input events (for tutorials)
  'input:action': { action: string; pressed: boolean };

  // UI events
  'ui:tutorialShow': { message: string; action?: string };
  'ui:tutorialHide': void;
  'ui:dialogueShow': { speaker: string; text: string };
  'ui:dialogueHide': void;

  // Debug events
  'debug:log': { message: string; level: 'info' | 'warn' | 'error' };
}

type EventCallback<T> = (payload: T) => void;
type UnsubscribeFn = () => void;

class EventBusManager {
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();
  private onceListeners: Map<string, Set<EventCallback<unknown>>> = new Map();
  private debugMode: boolean = false;

  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on<K extends keyof GameEvents>(
    event: K,
    callback: EventCallback<GameEvents[K]>
  ): UnsubscribeFn {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event once (auto-unsubscribes after first emit)
   * @returns Unsubscribe function
   */
  once<K extends keyof GameEvents>(
    event: K,
    callback: EventCallback<GameEvents[K]>
  ): UnsubscribeFn {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event)!.add(callback as EventCallback<unknown>);

    return () => {
      const set = this.onceListeners.get(event);
      if (set) {
        set.delete(callback as EventCallback<unknown>);
      }
    };
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof GameEvents>(
    event: K,
    callback: EventCallback<GameEvents[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback as EventCallback<unknown>);
    }

    const onceSet = this.onceListeners.get(event);
    if (onceSet) {
      onceSet.delete(callback as EventCallback<unknown>);
    }
  }

  /**
   * Emit an event to all subscribers
   */
  emit<K extends keyof GameEvents>(
    event: K,
    ...args: GameEvents[K] extends void ? [] : [GameEvents[K]]
  ): void {
    const payload = args[0];

    if (this.debugMode) {
      console.log(`[EventBus] ${event}`, payload);
    }

    // Regular listeners
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[EventBus] Error in listener for "${event}":`, error);
        }
      });
    }

    // Once listeners (remove after calling)
    const onceListeners = this.onceListeners.get(event);
    if (onceListeners) {
      onceListeners.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(
            `[EventBus] Error in once listener for "${event}":`,
            error
          );
        }
      });
      this.onceListeners.delete(event);
    }
  }

  /**
   * Check if an event has any listeners
   */
  hasListeners<K extends keyof GameEvents>(event: K): boolean {
    const listeners = this.listeners.get(event);
    const onceListeners = this.onceListeners.get(event);
    return (
      (listeners !== undefined && listeners.size > 0) ||
      (onceListeners !== undefined && onceListeners.size > 0)
    );
  }

  /**
   * Get count of listeners for an event
   */
  listenerCount<K extends keyof GameEvents>(event: K): number {
    const listeners = this.listeners.get(event)?.size ?? 0;
    const onceListeners = this.onceListeners.get(event)?.size ?? 0;
    return listeners + onceListeners;
  }

  /**
   * Remove all listeners for a specific event
   */
  removeAllListeners<K extends keyof GameEvents>(event: K): void {
    this.listeners.delete(event);
    this.onceListeners.delete(event);
  }

  /**
   * Clear all listeners for all events
   */
  clear(): void {
    this.listeners.clear();
    this.onceListeners.clear();
  }

  /**
   * Enable debug mode (logs all events)
   */
  setDebug(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Get all registered event names
   */
  getEventNames(): string[] {
    const names = new Set<string>();
    this.listeners.forEach((_, key) => names.add(key));
    this.onceListeners.forEach((_, key) => names.add(key));
    return Array.from(names);
  }
}

// Singleton instance
export const EventBus = new EventBusManager();
