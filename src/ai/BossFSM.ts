/**
 * Boss Finite State Machine
 *
 * Manages boss AI states and attack pattern selection:
 * - Idle: Waiting or out of combat
 * - Engage: Moving toward player
 * - AttackTelegraph: Wind-up before attack (player can react)
 * - AttackActive: Attack hitbox active
 * - Recover: Post-attack cooldown
 * - Staggered: Stunned, vulnerable to critical
 * - Dead: Boss defeated
 *
 * Pattern selection is weight-based with distance filtering.
 */

import { Time } from '../core/Time';
import { EventBus } from '../core/EventBus';
import { AttackSystem, AttackData, DEFAULT_ATTACKS } from '../combat/AttackSystem';

/**
 * Boss state types
 */
export enum BossStateType {
  Idle = 'Idle',
  Engage = 'Engage',
  AttackTelegraph = 'AttackTelegraph',
  AttackActive = 'AttackActive',
  Recover = 'Recover',
  Staggered = 'Staggered',
  Dead = 'Dead',
}

/**
 * Attack pattern definition
 */
export interface AttackPattern {
  // Attack ID (matches AttackSystem)
  attackId: string;

  // Selection weight (0-100)
  weight: number;

  // Distance constraints
  minDistance: number;
  maxDistance: number;

  // Timing
  telegraphDuration: number; // Wind-up before hit
  recoveryDuration: number; // Cooldown after hit

  // Cooldown (can't use same attack within this time)
  cooldown: number;
}

/**
 * Default tutorial boss patterns
 */
export const TUTORIAL_BOSS_PATTERNS: AttackPattern[] = [
  {
    attackId: 'boss_wide_sweep',
    weight: 30,
    minDistance: 0,
    maxDistance: 4.0,
    telegraphDuration: 0.8,
    recoveryDuration: 0.6,
    cooldown: 2.0,
  },
  {
    attackId: 'boss_overhead_smash',
    weight: 25,
    minDistance: 0,
    maxDistance: 3.5,
    telegraphDuration: 1.0,
    recoveryDuration: 0.8,
    cooldown: 2.5,
  },
  {
    attackId: 'boss_jump_slam',
    weight: 20,
    minDistance: 4.0,
    maxDistance: 12.0,
    telegraphDuration: 0.6,
    recoveryDuration: 1.0,
    cooldown: 4.0,
  },
  {
    attackId: 'boss_aoe_stomp',
    weight: 25,
    minDistance: 0,
    maxDistance: 5.0,
    telegraphDuration: 0.5,
    recoveryDuration: 0.5,
    cooldown: 3.0,
  },
];

/**
 * State configuration
 */
interface StateConfig {
  // Duration (0 = indefinite)
  duration: number;

  // Can be staggered during this state?
  canBeStaggered: boolean;

  // Movement multiplier (0 = no movement)
  movementMultiplier: number;

  // Rotation multiplier (0 = no rotation)
  rotationMultiplier: number;
}

/**
 * State configurations
 */
const STATE_CONFIGS: Record<BossStateType, StateConfig> = {
  [BossStateType.Idle]: {
    duration: 0,
    canBeStaggered: true,
    movementMultiplier: 0,
    rotationMultiplier: 1.0,
  },
  [BossStateType.Engage]: {
    duration: 0,
    canBeStaggered: true,
    movementMultiplier: 1.0,
    rotationMultiplier: 1.0,
  },
  [BossStateType.AttackTelegraph]: {
    duration: 0, // Set dynamically
    canBeStaggered: true,
    movementMultiplier: 0.2,
    rotationMultiplier: 0.5,
  },
  [BossStateType.AttackActive]: {
    duration: 0, // Set dynamically
    canBeStaggered: false,
    movementMultiplier: 0,
    rotationMultiplier: 0,
  },
  [BossStateType.Recover]: {
    duration: 0, // Set dynamically
    canBeStaggered: true,
    movementMultiplier: 0,
    rotationMultiplier: 0.3,
  },
  [BossStateType.Staggered]: {
    duration: 2.0,
    canBeStaggered: false,
    movementMultiplier: 0,
    rotationMultiplier: 0,
  },
  [BossStateType.Dead]: {
    duration: 0,
    canBeStaggered: false,
    movementMultiplier: 0,
    rotationMultiplier: 0,
  },
};

/**
 * FSM callbacks
 */
export interface BossFSMCallbacks {
  onStateEnter?: (state: BossStateType, prevState: BossStateType) => void;
  onStateExit?: (state: BossStateType, nextState: BossStateType) => void;
  onAttackSelected?: (pattern: AttackPattern) => void;
  onAnimationTrigger?: (animationName: string, options?: AnimationOptions) => void;
}

interface AnimationOptions {
  loop?: boolean;
  speed?: number;
  fadeIn?: number;
}

/**
 * Boss FSM
 */
export class BossFSM {
  // Boss identity
  private readonly bossId: string;

  // Current state
  private _currentState: BossStateType = BossStateType.Idle;
  private _previousState: BossStateType = BossStateType.Idle;

  // State timing
  private stateStartTime: number = 0;
  private stateProgress: number = 0;
  private stateDuration: number = 0;

  // Attack patterns
  private patterns: AttackPattern[] = [];
  private currentPattern: AttackPattern | null = null;
  private patternCooldowns: Map<string, number> = new Map();

  // Target tracking
  private _targetId: string | null = null;
  private _targetDistance: number = Infinity;
  private _targetAngle: number = 0;

  // Combat parameters
  private engageDistance: number = 15.0; // Start approaching
  private attackDecisionDistance: number = 8.0; // Consider attacking
  private preferredDistance: number = 3.0; // Ideal attack range

  // Callbacks
  private callbacks: BossFSMCallbacks = {};

  constructor(bossId: string, patterns?: AttackPattern[], callbacks?: BossFSMCallbacks) {
    this.bossId = bossId;
    this.patterns = patterns ?? TUTORIAL_BOSS_PATTERNS;

    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  /**
   * Update the FSM
   */
  update(dt: number): void {
    // Update state progress
    if (this.stateDuration > 0) {
      this.stateProgress = (Time.elapsed - this.stateStartTime) / this.stateDuration;

      // Check for state completion
      if (this.stateProgress >= 1.0) {
        this.onStateComplete();
      }
    }

    // Update cooldowns
    this.updateCooldowns(dt);

    // State-specific logic
    this.updateStateLogic();
  }

  /**
   * Set target entity
   */
  setTarget(targetId: string | null): void {
    this._targetId = targetId;
  }

  /**
   * Update target distance and angle
   */
  updateTargetInfo(distance: number, angle: number): void {
    this._targetDistance = distance;
    this._targetAngle = angle;
  }

  // ========== State Transitions ==========

  /**
   * Attempt to transition to a new state
   */
  tryTransition(newState: BossStateType): boolean {
    if (!this.canTransitionTo(newState)) {
      return false;
    }

    this.transition(newState);
    return true;
  }

  /**
   * Force a transition (bypasses checks)
   */
  forceTransition(newState: BossStateType): void {
    this.transition(newState);
  }

  /**
   * Check if transition is allowed
   */
  canTransitionTo(newState: BossStateType): boolean {
    // Dead state is terminal
    if (this._currentState === BossStateType.Dead) {
      return false;
    }

    // Death can always happen
    if (newState === BossStateType.Dead) {
      return true;
    }

    // Stagger can happen if allowed by current state
    if (newState === BossStateType.Staggered) {
      return STATE_CONFIGS[this._currentState].canBeStaggered;
    }

    // AttackActive cannot be interrupted
    if (this._currentState === BossStateType.AttackActive) {
      return false;
    }

    // Staggered must complete
    if (this._currentState === BossStateType.Staggered && this.stateProgress < 1.0) {
      return false;
    }

    return true;
  }

  private transition(newState: BossStateType, duration?: number): void {
    const prevState = this._currentState;

    // Exit current state
    this.callbacks.onStateExit?.(prevState, newState);

    // Update state
    this._previousState = prevState;
    this._currentState = newState;
    this.stateStartTime = Time.elapsed;
    this.stateProgress = 0;

    // Set duration
    if (duration !== undefined) {
      this.stateDuration = duration;
    } else {
      this.stateDuration = STATE_CONFIGS[newState].duration;
    }

    // Enter new state
    this.callbacks.onStateEnter?.(newState, prevState);

    // Trigger animation
    const animName = this.getAnimationForState(newState);
    this.callbacks.onAnimationTrigger?.(animName, {
      loop: this.stateDuration === 0,
      speed: 1,
      fadeIn: 0.1,
    });

    // Emit event
    EventBus.emit('debug:log', {
      message: `Boss ${this.bossId}: ${prevState} -> ${newState}`,
      level: 'info',
    });
  }

  private onStateComplete(): void {
    switch (this._currentState) {
      case BossStateType.AttackTelegraph:
        // Start attack
        this.transition(BossStateType.AttackActive, this.getAttackDuration());
        break;

      case BossStateType.AttackActive:
        // Start recovery
        const recoveryDuration = this.currentPattern?.recoveryDuration ?? 0.5;
        this.transition(BossStateType.Recover, recoveryDuration);
        break;

      case BossStateType.Recover:
        // Return to engage
        this.currentPattern = null;
        this.transition(BossStateType.Engage);
        break;

      case BossStateType.Staggered:
        // Return to engage
        this.transition(BossStateType.Engage);
        break;
    }
  }

  // ========== State Logic ==========

  private updateStateLogic(): void {
    switch (this._currentState) {
      case BossStateType.Idle:
        this.updateIdle();
        break;

      case BossStateType.Engage:
        this.updateEngage();
        break;
    }
  }

  private updateIdle(): void {
    // Check if player is within engage distance
    if (this._targetId && this._targetDistance <= this.engageDistance) {
      this.tryTransition(BossStateType.Engage);

      EventBus.emit('boss:engaged', {
        bossId: this.bossId,
        name: 'Tutorial Boss',
        maxHp: 1000, // Will be set properly by Boss entity
      });
    }
  }

  private updateEngage(): void {
    // Check for attack opportunity
    if (this._targetDistance <= this.attackDecisionDistance) {
      // Try to select an attack
      const pattern = this.selectAttackPattern();
      if (pattern) {
        this.startAttack(pattern);
      }
    }
  }

  // ========== Attack Selection ==========

  /**
   * Select an attack pattern based on weights and constraints
   */
  selectAttackPattern(): AttackPattern | null {
    // Filter valid patterns based on distance and cooldown
    const validPatterns = this.patterns.filter((pattern) => {
      // Check distance constraints
      if (
        this._targetDistance < pattern.minDistance ||
        this._targetDistance > pattern.maxDistance
      ) {
        return false;
      }

      // Check cooldown
      const cooldownEnd = this.patternCooldowns.get(pattern.attackId) ?? 0;
      if (Time.elapsed < cooldownEnd) {
        return false;
      }

      return true;
    });

    if (validPatterns.length === 0) {
      return null;
    }

    // Calculate total weight
    const totalWeight = validPatterns.reduce((sum, p) => sum + p.weight, 0);

    // Random selection based on weights
    let roll = Math.random() * totalWeight;
    for (const pattern of validPatterns) {
      roll -= pattern.weight;
      if (roll <= 0) {
        return pattern;
      }
    }

    // Fallback to last valid pattern
    return validPatterns[validPatterns.length - 1];
  }

  /**
   * Start an attack with the given pattern
   */
  startAttack(pattern: AttackPattern): void {
    this.currentPattern = pattern;

    // Set cooldown
    this.patternCooldowns.set(pattern.attackId, Time.elapsed + pattern.cooldown);

    // Notify callback
    this.callbacks.onAttackSelected?.(pattern);

    // Transition to telegraph
    this.transition(BossStateType.AttackTelegraph, pattern.telegraphDuration);

    // Emit event
    EventBus.emit('debug:log', {
      message: `Boss ${this.bossId} selected attack: ${pattern.attackId}`,
      level: 'info',
    });
  }

  /**
   * Get current attack data
   */
  getCurrentAttackData(): AttackData | null {
    if (!this.currentPattern) return null;
    return AttackSystem.getAttack(this.currentPattern.attackId) ?? null;
  }

  private getAttackDuration(): number {
    const attackData = this.getCurrentAttackData();
    if (!attackData) return 1.0;

    // Calculate duration from active frames
    // Assume full animation = active end + some margin
    return attackData.activeFrames[1] + 0.2;
  }

  private updateCooldowns(dt: number): void {
    // Cooldowns are time-based, no need to decrement
    // They're checked against Time.elapsed
  }

  // ========== Combat Events ==========

  /**
   * Called when boss takes damage
   */
  onDamaged(damage: number, poiseDamage: number, currentPoise: number): void {
    // Poise break causes stagger
    if (currentPoise <= 0) {
      this.tryTransition(BossStateType.Staggered);
    }
  }

  /**
   * Called when boss dies
   */
  onDeath(): void {
    this.forceTransition(BossStateType.Dead);

    EventBus.emit('boss:died', {
      bossId: this.bossId,
    });
  }

  /**
   * Called when boss receives plunge attack
   */
  onPlungeHit(): void {
    // Plunge attack causes instant stagger
    this.tryTransition(BossStateType.Staggered);
  }

  // ========== Queries ==========

  /**
   * Get current state
   */
  get currentState(): BossStateType {
    return this._currentState;
  }

  /**
   * Get previous state
   */
  get previousState(): BossStateType {
    return this._previousState;
  }

  /**
   * Get state progress (0-1)
   */
  get progress(): number {
    return this.stateProgress;
  }

  /**
   * Get current attack pattern
   */
  get attackPattern(): AttackPattern | null {
    return this.currentPattern;
  }

  /**
   * Get target entity ID
   */
  get targetId(): string | null {
    return this._targetId;
  }

  /**
   * Get target distance
   */
  get targetDistance(): number {
    return this._targetDistance;
  }

  /**
   * Get movement multiplier for current state
   */
  get movementMultiplier(): number {
    return STATE_CONFIGS[this._currentState].movementMultiplier;
  }

  /**
   * Get rotation multiplier for current state
   */
  get rotationMultiplier(): number {
    return STATE_CONFIGS[this._currentState].rotationMultiplier;
  }

  /**
   * Check if boss is in attack state (telegraph or active)
   */
  get isAttacking(): boolean {
    return (
      this._currentState === BossStateType.AttackTelegraph ||
      this._currentState === BossStateType.AttackActive
    );
  }

  /**
   * Check if boss is vulnerable (can be critically hit)
   */
  get isVulnerable(): boolean {
    return (
      this._currentState === BossStateType.Staggered ||
      this._currentState === BossStateType.Recover
    );
  }

  /**
   * Check if boss can be staggered
   */
  get canBeStaggered(): boolean {
    return STATE_CONFIGS[this._currentState].canBeStaggered;
  }

  /**
   * Check if boss is dead
   */
  get isDead(): boolean {
    return this._currentState === BossStateType.Dead;
  }

  private getAnimationForState(state: BossStateType): string {
    switch (state) {
      case BossStateType.Idle:
        return 'Boss_Idle';
      case BossStateType.Engage:
        return 'Boss_Walk';
      case BossStateType.AttackTelegraph:
        return this.getTelegraphAnimation();
      case BossStateType.AttackActive:
        return this.getAttackAnimation();
      case BossStateType.Recover:
        return 'Boss_Recover';
      case BossStateType.Staggered:
        return 'Boss_Stagger';
      case BossStateType.Dead:
        return 'Boss_Death';
      default:
        return 'Boss_Idle';
    }
  }

  private getTelegraphAnimation(): string {
    if (!this.currentPattern) return 'Boss_Idle';

    // Map attack ID to telegraph animation
    switch (this.currentPattern.attackId) {
      case 'boss_wide_sweep':
        return 'Boss_Telegraph_Sweep';
      case 'boss_overhead_smash':
        return 'Boss_Telegraph_Smash';
      case 'boss_jump_slam':
        return 'Boss_Telegraph_Jump';
      case 'boss_aoe_stomp':
        return 'Boss_Telegraph_Stomp';
      default:
        return 'Boss_Telegraph';
    }
  }

  private getAttackAnimation(): string {
    if (!this.currentPattern) return 'Boss_Idle';

    // Map attack ID to attack animation
    switch (this.currentPattern.attackId) {
      case 'boss_wide_sweep':
        return 'Boss_Attack_Sweep';
      case 'boss_overhead_smash':
        return 'Boss_Attack_Smash';
      case 'boss_jump_slam':
        return 'Boss_Attack_Jump';
      case 'boss_aoe_stomp':
        return 'Boss_Attack_Stomp';
      default:
        return 'Boss_Attack';
    }
  }

  // ========== Configuration ==========

  /**
   * Set engage distance
   */
  setEngageDistance(distance: number): void {
    this.engageDistance = distance;
  }

  /**
   * Set attack decision distance
   */
  setAttackDecisionDistance(distance: number): void {
    this.attackDecisionDistance = distance;
  }

  /**
   * Set preferred distance
   */
  setPreferredDistance(distance: number): void {
    this.preferredDistance = distance;
  }

  /**
   * Get preferred distance
   */
  getPreferredDistance(): number {
    return this.preferredDistance;
  }

  /**
   * Add a custom attack pattern
   */
  addPattern(pattern: AttackPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Clear all patterns
   */
  clearPatterns(): void {
    this.patterns = [];
  }

  /**
   * Set patterns
   */
  setPatterns(patterns: AttackPattern[]): void {
    this.patterns = patterns;
  }

  /**
   * Reset FSM to initial state
   */
  reset(): void {
    this._currentState = BossStateType.Idle;
    this._previousState = BossStateType.Idle;
    this.stateStartTime = 0;
    this.stateProgress = 0;
    this.stateDuration = 0;
    this.currentPattern = null;
    this.patternCooldowns.clear();
    this._targetId = null;
    this._targetDistance = Infinity;
    this._targetAngle = 0;
  }
}
