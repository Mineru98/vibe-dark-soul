/**
 * Player Finite State Machine
 *
 * Manages player state transitions with:
 * - Input buffering for combat (150ms buffer)
 * - Combo windows for attack chains
 * - State-specific update logic
 * - Animation triggering
 */

import { Time } from '../core/Time';
import { EventBus } from '../core/EventBus';
import { InputManager } from '../input/InputManager';
import { Action } from '../input/Action';
import {
  PlayerStateType,
  PlayerStateGroup,
  STATE_GROUPS,
  MOVEMENT_STATES,
  IFRAME_STATES,
  ROLL_CANCELABLE_STATES,
  ATTACK_CANCELABLE_STATES,
  STATE_ANIMATIONS,
  isInGroup,
} from './PlayerState';

/**
 * State configuration
 */
interface StateConfig {
  // Duration (0 = indefinite, requires manual exit)
  duration: number;

  // Can this state be interrupted?
  canBeInterrupted: boolean;

  // Stamina cost to enter this state
  staminaCost: number;

  // Movement multiplier (0 = no movement, 1 = full speed)
  movementMultiplier: number;

  // I-frame window (normalized 0-1)
  iframeStart?: number;
  iframeEnd?: number;

  // Combo window (normalized 0-1)
  comboWindowStart?: number;
  comboWindowEnd?: number;

  // Hit window for attacks (normalized 0-1)
  hitWindowStart?: number;
  hitWindowEnd?: number;

  // Root motion (movement comes from animation)
  hasRootMotion?: boolean;
}

/**
 * State configurations
 */
const STATE_CONFIGS: Record<PlayerStateType, StateConfig> = {
  [PlayerStateType.Idle]: {
    duration: 0,
    canBeInterrupted: true,
    staminaCost: 0,
    movementMultiplier: 1,
  },
  [PlayerStateType.Walk]: {
    duration: 0,
    canBeInterrupted: true,
    staminaCost: 0,
    movementMultiplier: 0.5,
  },
  [PlayerStateType.Run]: {
    duration: 0,
    canBeInterrupted: true,
    staminaCost: 0,
    movementMultiplier: 1,
  },
  [PlayerStateType.Sprint]: {
    duration: 0,
    canBeInterrupted: true,
    staminaCost: 0, // Continuous drain handled separately
    movementMultiplier: 1.3,
  },
  [PlayerStateType.Roll]: {
    duration: 0.75,
    canBeInterrupted: false,
    staminaCost: 22,
    movementMultiplier: 0,
    iframeStart: 0.12,
    iframeEnd: 0.46,
    hasRootMotion: true,
  },
  [PlayerStateType.Backstep]: {
    duration: 0.6,
    canBeInterrupted: false,
    staminaCost: 18,
    movementMultiplier: 0,
    iframeStart: 0.08,
    iframeEnd: 0.35,
    hasRootMotion: true,
  },
  [PlayerStateType.AttackLight]: {
    duration: 0.7,
    canBeInterrupted: false,
    staminaCost: 16,
    movementMultiplier: 0,
    comboWindowStart: 0.4,
    comboWindowEnd: 0.6,
    hitWindowStart: 0.22,
    hitWindowEnd: 0.38,
    hasRootMotion: true,
  },
  [PlayerStateType.AttackHeavy]: {
    duration: 1.0,
    canBeInterrupted: false,
    staminaCost: 28,
    movementMultiplier: 0,
    hitWindowStart: 0.3,
    hitWindowEnd: 0.52,
    hasRootMotion: true,
  },
  [PlayerStateType.Guard]: {
    duration: 0,
    canBeInterrupted: true,
    staminaCost: 0,
    movementMultiplier: 0.3,
  },
  [PlayerStateType.GuardBreak]: {
    duration: 1.2,
    canBeInterrupted: false,
    staminaCost: 0,
    movementMultiplier: 0,
  },
  [PlayerStateType.Parry]: {
    duration: 0.5,
    canBeInterrupted: false,
    staminaCost: 10,
    movementMultiplier: 0,
  },
  [PlayerStateType.HitStun]: {
    duration: 0.5,
    canBeInterrupted: false,
    staminaCost: 0,
    movementMultiplier: 0,
  },
  [PlayerStateType.Interacting]: {
    duration: 0,
    canBeInterrupted: true,
    staminaCost: 0,
    movementMultiplier: 0,
  },
  [PlayerStateType.UsingItem]: {
    duration: 1.5,
    canBeInterrupted: false,
    staminaCost: 0,
    movementMultiplier: 0,
  },
  [PlayerStateType.Falling]: {
    duration: 0,
    canBeInterrupted: true,
    staminaCost: 0,
    movementMultiplier: 0.5, // Air control
  },
  [PlayerStateType.Landing]: {
    duration: 0.3,
    canBeInterrupted: false,
    staminaCost: 0,
    movementMultiplier: 0,
  },
  [PlayerStateType.PlungeAttack]: {
    duration: 0.8,
    canBeInterrupted: false,
    staminaCost: 20,
    movementMultiplier: 0,
    hitWindowStart: 0.0,
    hitWindowEnd: 0.5,
    hasRootMotion: true,
  },
  [PlayerStateType.Dead]: {
    duration: 0,
    canBeInterrupted: false,
    staminaCost: 0,
    movementMultiplier: 0,
  },
};

/**
 * Buffered input entry
 */
interface BufferedInput {
  action: Action;
  timestamp: number;
}

/**
 * FSM event callbacks
 */
export interface FSMCallbacks {
  onStateEnter?: (state: PlayerStateType, prevState: PlayerStateType) => void;
  onStateExit?: (state: PlayerStateType, nextState: PlayerStateType) => void;
  onAnimationTrigger?: (animationName: string, options?: AnimationOptions) => void;
  onConsumeStamina?: (amount: number) => boolean; // Return false if not enough
  getStamina?: () => number;
}

interface AnimationOptions {
  loop?: boolean;
  speed?: number;
  fadeIn?: number;
}

/**
 * Player FSM
 */
export class PlayerFSM {
  // Current state
  private _currentState: PlayerStateType = PlayerStateType.Idle;
  private _previousState: PlayerStateType = PlayerStateType.Idle;

  // State timing
  private stateStartTime: number = 0;
  private stateProgress: number = 0;

  // Input buffering
  private inputBuffer: BufferedInput[] = [];
  private readonly BUFFER_DURATION = 0.15; // 150ms

  // Combo tracking
  private comboCount: number = 0;
  private readonly MAX_COMBO = 3;

  // Callbacks
  private callbacks: FSMCallbacks = {};

  // I-frame state
  private _hasIFrames: boolean = false;

  // Hit window state (for attack system)
  private _inHitWindow: boolean = false;

  constructor(callbacks?: FSMCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  /**
   * Update the FSM (call every frame)
   */
  update(dt: number): void {
    // Update state progress
    const config = STATE_CONFIGS[this._currentState];
    if (config.duration > 0) {
      this.stateProgress = (Time.elapsed - this.stateStartTime) / config.duration;

      // Check for state completion
      if (this.stateProgress >= 1.0) {
        this.onStateComplete();
      }
    }

    // Update i-frame status
    this._hasIFrames = this.checkIFrames();

    // Update hit window status
    this._inHitWindow = this.checkHitWindow();

    // Process input buffer
    this.processInputBuffer();

    // Clean expired inputs
    this.cleanInputBuffer();
  }

  /**
   * Pre-update (call before physics, for state transitions from input)
   */
  preUpdate(): void {
    // Check for transitions based on input
    this.checkInputTransitions();
  }

  // ========== State Transitions ==========

  /**
   * Attempt to transition to a new state
   */
  tryTransition(newState: PlayerStateType): boolean {
    if (!this.canTransitionTo(newState)) {
      return false;
    }

    // Check stamina cost
    const config = STATE_CONFIGS[newState];
    if (config.staminaCost > 0) {
      if (this.callbacks.onConsumeStamina) {
        if (!this.callbacks.onConsumeStamina(config.staminaCost)) {
          return false; // Not enough stamina
        }
      }
    }

    this.transition(newState);
    return true;
  }

  /**
   * Force a transition (bypasses checks)
   */
  forceTransition(newState: PlayerStateType): void {
    this.transition(newState);
  }

  /**
   * Check if transition is allowed
   */
  canTransitionTo(newState: PlayerStateType): boolean {
    const currentConfig = STATE_CONFIGS[this._currentState];

    // Dead state is terminal
    if (this._currentState === PlayerStateType.Dead) {
      return false;
    }

    // HitStun and Death can interrupt anything
    if (
      newState === PlayerStateType.HitStun ||
      newState === PlayerStateType.Dead
    ) {
      return !this._hasIFrames || newState === PlayerStateType.Dead;
    }

    // Check if current state can be interrupted
    if (!currentConfig.canBeInterrupted) {
      return false;
    }

    // Check stamina
    const newConfig = STATE_CONFIGS[newState];
    if (newConfig.staminaCost > 0 && this.callbacks.getStamina) {
      if (this.callbacks.getStamina() < newConfig.staminaCost) {
        return false;
      }
    }

    return true;
  }

  private transition(newState: PlayerStateType): void {
    const prevState = this._currentState;

    // Exit current state
    this.callbacks.onStateExit?.(prevState, newState);

    // Update state
    this._previousState = prevState;
    this._currentState = newState;
    this.stateStartTime = Time.elapsed;
    this.stateProgress = 0;

    // Reset combo if not chaining attacks
    if (
      newState !== PlayerStateType.AttackLight &&
      newState !== PlayerStateType.AttackHeavy
    ) {
      this.comboCount = 0;
    }

    // Enter new state
    this.callbacks.onStateEnter?.(newState, prevState);

    // Trigger animation
    const animName = this.getAnimationForState(newState);
    const config = STATE_CONFIGS[newState];
    this.callbacks.onAnimationTrigger?.(animName, {
      loop: config.duration === 0,
      speed: 1,
      fadeIn: 0.1,
    });

    // Emit event
    EventBus.emit('player:stateChanged', {
      previous: prevState,
      current: newState,
    });
  }

  private onStateComplete(): void {
    // Handle state completion
    switch (this._currentState) {
      case PlayerStateType.Roll:
      case PlayerStateType.Backstep:
      case PlayerStateType.AttackLight:
      case PlayerStateType.AttackHeavy:
      case PlayerStateType.Parry:
      case PlayerStateType.UsingItem:
      case PlayerStateType.HitStun:
      case PlayerStateType.GuardBreak:
      case PlayerStateType.Landing:
      case PlayerStateType.PlungeAttack:
        this.tryTransition(PlayerStateType.Idle);
        break;
    }
  }

  // ========== Input Handling ==========

  private checkInputTransitions(): void {
    // Don't process inputs if state doesn't allow
    const config = STATE_CONFIGS[this._currentState];
    if (!config.canBeInterrupted && this.stateProgress < 1.0) {
      // Check combo window for attacks
      if (this.isInComboWindow()) {
        if (InputManager.consumeBufferedInput(Action.Attack)) {
          this.executeCombo();
        }
      }
      return;
    }

    // Check for guard (hold)
    if (InputManager.isPressed(Action.Block)) {
      if (ROLL_CANCELABLE_STATES.has(this._currentState)) {
        this.tryTransition(PlayerStateType.Guard);
        return;
      }
    } else if (this._currentState === PlayerStateType.Guard) {
      this.tryTransition(PlayerStateType.Idle);
    }

    // Check for roll/backstep
    if (InputManager.isJustPressed(Action.Roll)) {
      if (ROLL_CANCELABLE_STATES.has(this._currentState)) {
        const moveVec = InputManager.getMovementVector();
        const hasMovement = Math.abs(moveVec.x) > 0.1 || Math.abs(moveVec.y) > 0.1;

        if (hasMovement) {
          this.tryTransition(PlayerStateType.Roll);
        } else {
          this.tryTransition(PlayerStateType.Backstep);
        }
        return;
      }
    }

    // Check for attack
    if (InputManager.isJustPressed(Action.Attack)) {
      if (ATTACK_CANCELABLE_STATES.has(this._currentState)) {
        this.tryTransition(PlayerStateType.AttackLight);
        return;
      }
    }

    if (InputManager.isJustPressed(Action.StrongAttack)) {
      if (ATTACK_CANCELABLE_STATES.has(this._currentState)) {
        this.tryTransition(PlayerStateType.AttackHeavy);
        return;
      }
    }

    // Check for parry
    if (InputManager.isJustPressed(Action.Parry)) {
      if (this._currentState === PlayerStateType.Guard) {
        this.tryTransition(PlayerStateType.Parry);
        return;
      }
    }

    // Check for item use
    if (InputManager.isJustPressed(Action.UseItem)) {
      if (this._currentState === PlayerStateType.Idle) {
        this.tryTransition(PlayerStateType.UsingItem);
        return;
      }
    }

    // Movement state transitions
    const moveVec = InputManager.getMovementVector();
    const hasMovement = Math.abs(moveVec.x) > 0.1 || Math.abs(moveVec.y) > 0.1;

    if (MOVEMENT_STATES.has(this._currentState)) {
      if (hasMovement) {
        // Check for sprint
        if (
          InputManager.isPressed(Action.Roll) &&
          InputManager.getHeldTime(Action.Roll) > 0.15
        ) {
          if (
            this._currentState !== PlayerStateType.Sprint &&
            this._currentState !== PlayerStateType.Guard
          ) {
            this.tryTransition(PlayerStateType.Sprint);
          }
        } else if (this._currentState === PlayerStateType.Sprint) {
          this.tryTransition(PlayerStateType.Run);
        } else if (
          this._currentState === PlayerStateType.Idle ||
          this._currentState === PlayerStateType.Walk
        ) {
          this.tryTransition(PlayerStateType.Run);
        }
      } else {
        // No movement input
        if (
          this._currentState !== PlayerStateType.Idle &&
          this._currentState !== PlayerStateType.Guard
        ) {
          this.tryTransition(PlayerStateType.Idle);
        }
      }
    }
  }

  private executeCombo(): void {
    if (this.comboCount < this.MAX_COMBO - 1) {
      this.comboCount++;
      // Trigger next combo animation
      const animName = `Attack_Light_${this.comboCount + 1}`;
      this.stateStartTime = Time.elapsed;
      this.stateProgress = 0;
      this.callbacks.onAnimationTrigger?.(animName, {
        loop: false,
        speed: 1,
        fadeIn: 0.05,
      });
    }
  }

  // ========== Input Buffer ==========

  /**
   * Buffer an input for later processing
   */
  bufferInput(action: Action): void {
    this.inputBuffer.push({
      action,
      timestamp: Time.elapsed,
    });
  }

  private processInputBuffer(): void {
    // Check for buffered attacks during combo windows
    if (this.isInComboWindow()) {
      const attackIndex = this.inputBuffer.findIndex(
        (input) => input.action === Action.Attack
      );
      if (attackIndex !== -1) {
        this.inputBuffer.splice(attackIndex, 1);
        this.executeCombo();
      }
    }
  }

  private cleanInputBuffer(): void {
    const now = Time.elapsed;
    this.inputBuffer = this.inputBuffer.filter(
      (input) => now - input.timestamp < this.BUFFER_DURATION
    );
  }

  // ========== Grounding ==========

  /**
   * Called when grounding state changes
   */
  onGroundingChanged(grounded: boolean): void {
    if (grounded) {
      if (isInGroup(this._currentState, PlayerStateGroup.Airborne)) {
        this.forceTransition(PlayerStateType.Landing);
      }
    } else {
      if (isInGroup(this._currentState, PlayerStateGroup.Grounded)) {
        this.forceTransition(PlayerStateType.Falling);
      }
    }
  }

  // ========== Combat Events ==========

  /**
   * Called when player takes damage
   */
  onDamaged(damage: number, isBlocked: boolean): void {
    if (isBlocked) {
      // Guard took the hit
      return;
    }

    if (!this._hasIFrames) {
      this.forceTransition(PlayerStateType.HitStun);
    }
  }

  /**
   * Called when player dies
   */
  onDeath(): void {
    this.forceTransition(PlayerStateType.Dead);
  }

  /**
   * Called when guard is broken
   */
  onGuardBroken(): void {
    this.forceTransition(PlayerStateType.GuardBreak);
  }

  // ========== Queries ==========

  /**
   * Get current state
   */
  get currentState(): PlayerStateType {
    return this._currentState;
  }

  /**
   * Get previous state
   */
  get previousState(): PlayerStateType {
    return this._previousState;
  }

  /**
   * Get current state group
   */
  get currentGroup(): PlayerStateGroup {
    return STATE_GROUPS[this._currentState];
  }

  /**
   * Get state progress (0-1)
   */
  get progress(): number {
    return this.stateProgress;
  }

  /**
   * Check if player has i-frames
   */
  get hasIFrames(): boolean {
    return this._hasIFrames;
  }

  /**
   * Check if currently in hit window (for attacks)
   */
  get inHitWindow(): boolean {
    return this._inHitWindow;
  }

  /**
   * Get movement multiplier for current state
   */
  get movementMultiplier(): number {
    return STATE_CONFIGS[this._currentState].movementMultiplier;
  }

  /**
   * Check if player can move
   */
  get canMove(): boolean {
    return STATE_CONFIGS[this._currentState].movementMultiplier > 0;
  }

  /**
   * Check if current state has root motion
   */
  get hasRootMotion(): boolean {
    return STATE_CONFIGS[this._currentState].hasRootMotion ?? false;
  }

  /**
   * Get current combo count
   */
  get combo(): number {
    return this.comboCount;
  }

  private checkIFrames(): boolean {
    if (!IFRAME_STATES.has(this._currentState)) {
      return false;
    }

    const config = STATE_CONFIGS[this._currentState];
    if (config.iframeStart === undefined || config.iframeEnd === undefined) {
      return false;
    }

    return (
      this.stateProgress >= config.iframeStart &&
      this.stateProgress <= config.iframeEnd
    );
  }

  private checkHitWindow(): boolean {
    const config = STATE_CONFIGS[this._currentState];
    if (config.hitWindowStart === undefined || config.hitWindowEnd === undefined) {
      return false;
    }

    return (
      this.stateProgress >= config.hitWindowStart &&
      this.stateProgress <= config.hitWindowEnd
    );
  }

  private isInComboWindow(): boolean {
    if (this._currentState !== PlayerStateType.AttackLight) {
      return false;
    }

    const config = STATE_CONFIGS[this._currentState];
    if (
      config.comboWindowStart === undefined ||
      config.comboWindowEnd === undefined
    ) {
      return false;
    }

    return (
      this.stateProgress >= config.comboWindowStart &&
      this.stateProgress <= config.comboWindowEnd
    );
  }

  private getAnimationForState(state: PlayerStateType): string {
    // Special case for combo attacks
    if (state === PlayerStateType.AttackLight && this.comboCount > 0) {
      return `Attack_Light_${this.comboCount + 1}`;
    }
    return STATE_ANIMATIONS[state];
  }
}
