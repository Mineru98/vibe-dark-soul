/**
 * Player Stats
 *
 * Manages player resources:
 * - HP (Health Points)
 * - Stamina
 * - Poise (stagger resistance)
 *
 * Emits events for UI updates and game logic.
 */

import { EventBus } from '../core/EventBus';

/**
 * Stats configuration
 */
export interface PlayerStatsConfig {
  // Health
  maxHP?: number;
  currentHP?: number;

  // Stamina
  maxStamina?: number;
  currentStamina?: number;
  staminaRegenRate?: number; // per second
  staminaRegenDelay?: number; // seconds after consumption

  // Poise
  maxPoise?: number;
  currentPoise?: number;
  poiseRegenRate?: number; // per second
  poiseRegenDelay?: number; // seconds after hit
}

/**
 * Default stats values (Dark Souls style)
 */
const DEFAULT_CONFIG: Required<PlayerStatsConfig> = {
  maxHP: 100,
  currentHP: 100,
  maxStamina: 100,
  currentStamina: 100,
  staminaRegenRate: 45, // Regenerates fully in ~2.2 seconds
  staminaRegenDelay: 0.8, // Delay after stamina use
  maxPoise: 30,
  currentPoise: 30,
  poiseRegenRate: 15, // Regenerates fully in 2 seconds
  poiseRegenDelay: 3.0, // Longer delay for poise
};

/**
 * Damage types
 */
export enum DamageType {
  Physical = 'Physical',
  Fire = 'Fire',
  Magic = 'Magic',
  Lightning = 'Lightning',
  Dark = 'Dark',
  Bleed = 'Bleed',
  Poison = 'Poison',
  Fall = 'Fall',
}

/**
 * Damage info for events
 */
export interface DamageInfo {
  amount: number;
  type: DamageType;
  source?: string;
  direction?: { x: number; y: number; z: number };
  poiseDamage?: number;
}

/**
 * Player Stats class
 */
export class PlayerStats {
  // Health
  private _maxHP: number;
  private _currentHP: number;

  // Stamina
  private _maxStamina: number;
  private _currentStamina: number;
  private _staminaRegenRate: number;
  private _staminaRegenDelay: number;
  private _staminaRegenTimer: number = 0;

  // Poise
  private _maxPoise: number;
  private _currentPoise: number;
  private _poiseRegenRate: number;
  private _poiseRegenDelay: number;
  private _poiseRegenTimer: number = 0;

  // State flags
  private _isDead: boolean = false;
  private _isStaggered: boolean = false;

  constructor(config: PlayerStatsConfig = {}) {
    const merged = { ...DEFAULT_CONFIG, ...config };

    this._maxHP = merged.maxHP;
    this._currentHP = merged.currentHP;
    this._maxStamina = merged.maxStamina;
    this._currentStamina = merged.currentStamina;
    this._staminaRegenRate = merged.staminaRegenRate;
    this._staminaRegenDelay = merged.staminaRegenDelay;
    this._maxPoise = merged.maxPoise;
    this._currentPoise = merged.currentPoise;
    this._poiseRegenRate = merged.poiseRegenRate;
    this._poiseRegenDelay = merged.poiseRegenDelay;
  }

  /**
   * Update stats (call every frame)
   */
  update(dt: number): void {
    if (this._isDead) return;

    this.updateStamina(dt);
    this.updatePoise(dt);
  }

  /**
   * Update stamina regeneration
   */
  private updateStamina(dt: number): void {
    // Countdown regen delay
    if (this._staminaRegenTimer > 0) {
      this._staminaRegenTimer -= dt;
      return;
    }

    // Regenerate stamina
    if (this._currentStamina < this._maxStamina) {
      this._currentStamina = Math.min(
        this._maxStamina,
        this._currentStamina + this._staminaRegenRate * dt
      );

      EventBus.emit('player:staminaChanged', {
        current: this._currentStamina,
        max: this._maxStamina,
        percent: this.staminaPercent,
      });
    }
  }

  /**
   * Update poise regeneration
   */
  private updatePoise(dt: number): void {
    // Countdown regen delay
    if (this._poiseRegenTimer > 0) {
      this._poiseRegenTimer -= dt;
      return;
    }

    // Regenerate poise
    if (this._currentPoise < this._maxPoise) {
      this._currentPoise = Math.min(
        this._maxPoise,
        this._currentPoise + this._poiseRegenRate * dt
      );
    }
  }

  // ========== Health Methods ==========

  /**
   * Take damage
   *
   * @returns true if damage was applied (not dead)
   */
  takeDamage(info: DamageInfo): boolean {
    if (this._isDead) return false;

    // Apply HP damage
    const actualDamage = Math.min(info.amount, this._currentHP);
    this._currentHP -= actualDamage;

    // Emit damage event
    EventBus.emit('player:damaged', {
      damage: actualDamage,
      currentHP: this._currentHP,
      maxHP: this._maxHP,
      damageType: info.type,
      source: info.source,
    });

    // Apply poise damage
    if (info.poiseDamage !== undefined && info.poiseDamage > 0) {
      this.takePoiseDamage(info.poiseDamage);
    }

    // Check death
    if (this._currentHP <= 0) {
      this._currentHP = 0;
      this._isDead = true;
      EventBus.emit('player:died', {
        cause: info.type,
        source: info.source,
      });
    }

    return true;
  }

  /**
   * Heal HP
   */
  heal(amount: number): void {
    if (this._isDead) return;

    const prevHP = this._currentHP;
    this._currentHP = Math.min(this._maxHP, this._currentHP + amount);
    const actualHeal = this._currentHP - prevHP;

    if (actualHeal > 0) {
      EventBus.emit('player:healed', {
        amount: actualHeal,
        currentHP: this._currentHP,
        maxHP: this._maxHP,
      });
    }
  }

  /**
   * Set HP directly (for respawn, etc.)
   */
  setHP(value: number): void {
    this._currentHP = Math.max(0, Math.min(this._maxHP, value));
    if (this._currentHP > 0) {
      this._isDead = false;
    }
  }

  /**
   * Fully restore HP
   */
  fullHeal(): void {
    this._currentHP = this._maxHP;
    this._isDead = false;
  }

  // ========== Stamina Methods ==========

  /**
   * Check if player has enough stamina
   */
  hasStamina(amount: number): boolean {
    return this._currentStamina >= amount;
  }

  /**
   * Consume stamina
   *
   * @returns true if stamina was consumed, false if insufficient
   */
  consumeStamina(amount: number): boolean {
    if (amount <= 0) return true;

    // Allow going negative for "exhausted" state
    this._currentStamina -= amount;
    this._staminaRegenTimer = this._staminaRegenDelay;

    EventBus.emit('player:staminaChanged', {
      current: this._currentStamina,
      max: this._maxStamina,
      percent: this.staminaPercent,
    });

    return true;
  }

  /**
   * Try to consume stamina (only if sufficient)
   *
   * @returns true if consumed, false if insufficient
   */
  tryConsumeStamina(amount: number): boolean {
    if (!this.hasStamina(amount)) return false;
    return this.consumeStamina(amount);
  }

  /**
   * Restore stamina
   */
  restoreStamina(amount: number): void {
    this._currentStamina = Math.min(this._maxStamina, this._currentStamina + amount);
  }

  /**
   * Fully restore stamina
   */
  fullRestoreStamina(): void {
    this._currentStamina = this._maxStamina;
    this._staminaRegenTimer = 0;
  }

  // ========== Poise Methods ==========

  /**
   * Take poise damage
   *
   * @returns true if staggered (poise broken)
   */
  takePoiseDamage(amount: number): boolean {
    this._currentPoise -= amount;
    this._poiseRegenTimer = this._poiseRegenDelay;

    if (this._currentPoise <= 0) {
      this._currentPoise = 0;
      this._isStaggered = true;
      EventBus.emit('player:staggered', {});
      return true;
    }

    return false;
  }

  /**
   * Reset poise (after stagger recovery)
   */
  resetPoise(): void {
    this._currentPoise = this._maxPoise;
    this._isStaggered = false;
  }

  // ========== Respawn ==========

  /**
   * Respawn player (full restore)
   */
  respawn(): void {
    this._currentHP = this._maxHP;
    this._currentStamina = this._maxStamina;
    this._currentPoise = this._maxPoise;
    this._isDead = false;
    this._isStaggered = false;
    this._staminaRegenTimer = 0;
    this._poiseRegenTimer = 0;

    EventBus.emit('player:respawned', {});
  }

  // ========== Getters ==========

  // Health
  get currentHP(): number {
    return this._currentHP;
  }
  get maxHP(): number {
    return this._maxHP;
  }
  get hpPercent(): number {
    return this._currentHP / this._maxHP;
  }
  get isDead(): boolean {
    return this._isDead;
  }

  // Stamina
  get currentStamina(): number {
    return this._currentStamina;
  }
  get maxStamina(): number {
    return this._maxStamina;
  }
  get staminaPercent(): number {
    return Math.max(0, this._currentStamina / this._maxStamina);
  }
  get isExhausted(): boolean {
    return this._currentStamina <= 0;
  }
  get canAct(): boolean {
    return this._currentStamina > 0;
  }

  // Poise
  get currentPoise(): number {
    return this._currentPoise;
  }
  get maxPoise(): number {
    return this._maxPoise;
  }
  get poisePercent(): number {
    return this._currentPoise / this._maxPoise;
  }
  get isStaggered(): boolean {
    return this._isStaggered;
  }

  // ========== Setters (for configuration) ==========

  set maxHP(value: number) {
    this._maxHP = Math.max(1, value);
    this._currentHP = Math.min(this._currentHP, this._maxHP);
  }

  set maxStamina(value: number) {
    this._maxStamina = Math.max(1, value);
    this._currentStamina = Math.min(this._currentStamina, this._maxStamina);
  }

  set maxPoise(value: number) {
    this._maxPoise = Math.max(1, value);
    this._currentPoise = Math.min(this._currentPoise, this._maxPoise);
  }

  set staminaRegenRate(value: number) {
    this._staminaRegenRate = Math.max(0, value);
  }

  set staminaRegenDelay(value: number) {
    this._staminaRegenDelay = Math.max(0, value);
  }
}
