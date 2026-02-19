/**
 * Unified input manager for keyboard, mouse, and gamepad
 *
 * Features:
 * - Action-based input (abstracted from physical keys)
 * - Just pressed/released detection
 * - Input buffering for combat
 * - Analog axis support
 * - Pointer lock for mouse look
 */

import { Time } from '../core/Time';
import { EventBus } from '../core/EventBus';
import {
  Action,
  Axis,
  ActionState,
  DEFAULT_ACTION_STATE,
} from './Action';
import {
  BindingsConfig,
  DEFAULT_BINDINGS,
  MouseButton,
  GamepadButton,
  GamepadAxis,
} from './Bindings';

/**
 * Buffered input for combat
 */
interface BufferedInput {
  action: Action;
  timestamp: number;
}

class InputManagerClass {
  // Bindings configuration
  private bindings: BindingsConfig = DEFAULT_BINDINGS;

  // Current state of all actions
  private actionStates: Map<Action, ActionState> = new Map();
  private previousActionStates: Map<Action, boolean> = new Map();

  // Axis values
  private axisValues: Map<Axis, number> = new Map();

  // Raw input state
  private keysPressed: Set<string> = new Set();
  private mouseButtonsPressed: Set<MouseButton> = new Set();
  private mouseDelta: { x: number; y: number } = { x: 0, y: 0 };
  private mousePosition: { x: number; y: number } = { x: 0, y: 0 };

  // Gamepad state
  private gamepad: Gamepad | null = null;
  private gamepadButtonsPressed: Set<GamepadButton> = new Set();
  private gamepadAxes: number[] = [];

  // Input buffering
  private inputBuffer: BufferedInput[] = [];
  private readonly BUFFER_DURATION = 0.15; // 150ms buffer

  // Pointer lock
  private isPointerLocked: boolean = false;
  private pointerLockElement: HTMLElement | null = null;

  // Initialization state
  private initialized: boolean = false;

  /**
   * Initialize the input system
   * @param element Element to attach event listeners to (usually canvas)
   */
  init(element?: HTMLElement): void {
    if (this.initialized) return;

    this.pointerLockElement = element || document.body;

    // Initialize action states
    Object.values(Action).forEach((action) => {
      this.actionStates.set(action, { ...DEFAULT_ACTION_STATE });
      this.previousActionStates.set(action, false);
    });

    // Initialize axis values
    Object.values(Axis).forEach((axis) => {
      this.axisValues.set(axis, 0);
    });

    // Keyboard events
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    // Mouse events
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel);

    // Pointer lock events
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);

    // Gamepad events
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);

    // Prevent context menu on right-click
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    this.initialized = true;
  }

  /**
   * Cleanup event listeners
   */
  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener(
      'gamepaddisconnected',
      this.onGamepadDisconnected
    );

    this.initialized = false;
  }

  /**
   * Update input state
   * Call once per frame at the start of the game loop
   */
  update(): void {
    // Poll gamepad
    this.pollGamepad();

    // Update action states
    this.updateActionStates();

    // Update axis values
    this.updateAxisValues();

    // Clear mouse delta (accumulated since last frame)
    this.mouseDelta = { x: 0, y: 0 };

    // Clean expired input buffer
    const now = Time.elapsed;
    this.inputBuffer = this.inputBuffer.filter(
      (input) => now - input.timestamp < this.BUFFER_DURATION
    );
  }

  // ========== Action Queries ==========

  /**
   * Check if an action is currently pressed
   */
  isPressed(action: Action): boolean {
    return this.actionStates.get(action)?.pressed ?? false;
  }

  /**
   * Check if an action was just pressed this frame
   */
  isJustPressed(action: Action): boolean {
    return this.actionStates.get(action)?.justPressed ?? false;
  }

  /**
   * Check if an action was just released this frame
   */
  isJustReleased(action: Action): boolean {
    return this.actionStates.get(action)?.justReleased ?? false;
  }

  /**
   * Get how long an action has been held (in seconds)
   */
  getHeldTime(action: Action): number {
    return this.actionStates.get(action)?.heldTime ?? 0;
  }

  /**
   * Get the full state of an action
   */
  getActionState(action: Action): ActionState {
    return this.actionStates.get(action) ?? { ...DEFAULT_ACTION_STATE };
  }

  // ========== Axis Queries ==========

  /**
   * Get axis value (-1 to 1)
   */
  getAxis(axis: Axis): number {
    return this.axisValues.get(axis) ?? 0;
  }

  /**
   * Get movement vector (from MoveX and MoveY axes)
   * Returns normalized vector if length > 1
   */
  getMovementVector(): { x: number; y: number } {
    const x = this.getAxis(Axis.MoveX);
    const y = this.getAxis(Axis.MoveY);
    const length = Math.sqrt(x * x + y * y);

    if (length > 1) {
      return { x: x / length, y: y / length };
    }
    return { x, y };
  }

  /**
   * Get look delta (from LookX and LookY axes)
   */
  getLookDelta(): { x: number; y: number } {
    return {
      x: this.getAxis(Axis.LookX),
      y: this.getAxis(Axis.LookY),
    };
  }

  // ========== Input Buffering ==========

  /**
   * Buffer an action for later consumption
   */
  bufferInput(action: Action): void {
    this.inputBuffer.push({
      action,
      timestamp: Time.elapsed,
    });
  }

  /**
   * Try to consume a buffered action
   * @returns true if the action was in the buffer and consumed
   */
  consumeBufferedInput(action: Action): boolean {
    const index = this.inputBuffer.findIndex((input) => input.action === action);
    if (index !== -1) {
      this.inputBuffer.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Check if an action is in the buffer (without consuming)
   */
  hasBufferedInput(action: Action): boolean {
    return this.inputBuffer.some((input) => input.action === action);
  }

  /**
   * Clear all buffered inputs
   */
  clearBuffer(): void {
    this.inputBuffer = [];
  }

  // ========== Pointer Lock ==========

  /**
   * Request pointer lock (for mouse look)
   */
  requestPointerLock(): void {
    if (this.pointerLockElement && !this.isPointerLocked) {
      this.pointerLockElement.requestPointerLock();
    }
  }

  /**
   * Exit pointer lock
   */
  exitPointerLock(): void {
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  }

  /**
   * Check if pointer is locked
   */
  isPointerLockedState(): boolean {
    return this.isPointerLocked;
  }

  // ========== Configuration ==========

  /**
   * Set new bindings configuration
   */
  setBindings(bindings: BindingsConfig): void {
    this.bindings = bindings;
  }

  /**
   * Get current bindings
   */
  getBindings(): BindingsConfig {
    return this.bindings;
  }

  /**
   * Get mouse position (screen coordinates)
   */
  getMousePosition(): { x: number; y: number } {
    return { ...this.mousePosition };
  }

  /**
   * Check if any gamepad is connected
   */
  isGamepadConnected(): boolean {
    return this.gamepad !== null;
  }

  // ========== Private Methods ==========

  private updateActionStates(): void {
    const delta = Time.delta;

    for (const action of Object.values(Action)) {
      const binding = this.bindings.actions[action];
      if (!binding) continue;

      const previousPressed = this.previousActionStates.get(action) ?? false;
      let currentPressed = false;

      // Check keyboard keys
      if (binding.keys) {
        for (const key of binding.keys) {
          if (this.keysPressed.has(key)) {
            currentPressed = true;
            break;
          }
        }
      }

      // Check mouse buttons
      if (!currentPressed && binding.mouseButtons) {
        for (const button of binding.mouseButtons) {
          if (this.mouseButtonsPressed.has(button)) {
            currentPressed = true;
            break;
          }
        }
      }

      // Check gamepad buttons
      if (!currentPressed && binding.gamepadButtons) {
        for (const button of binding.gamepadButtons) {
          if (this.gamepadButtonsPressed.has(button)) {
            currentPressed = true;
            break;
          }
        }
      }

      // Calculate state
      const justPressed = currentPressed && !previousPressed;
      const justReleased = !currentPressed && previousPressed;

      const state = this.actionStates.get(action)!;
      state.pressed = currentPressed;
      state.justPressed = justPressed;
      state.justReleased = justReleased;
      state.heldTime = currentPressed ? state.heldTime + delta : 0;

      this.previousActionStates.set(action, currentPressed);

      // Emit input event for tutorials
      if (justPressed) {
        EventBus.emit('input:action', { action, pressed: true });

        // Auto-buffer combat actions
        if (
          action === Action.Attack ||
          action === Action.StrongAttack ||
          action === Action.Roll ||
          action === Action.Parry
        ) {
          this.bufferInput(action);
        }
      }
    }
  }

  private updateAxisValues(): void {
    for (const axis of Object.values(Axis)) {
      const binding = this.bindings.axes[axis];
      if (!binding) continue;

      let value = 0;

      // Keyboard (digital to analog)
      if (binding.keys) {
        let positive = 0;
        let negative = 0;

        for (const key of binding.keys.positive) {
          if (this.keysPressed.has(key)) {
            positive = 1;
            break;
          }
        }
        for (const key of binding.keys.negative) {
          if (this.keysPressed.has(key)) {
            negative = 1;
            break;
          }
        }

        value = positive - negative;
      }

      // Gamepad axis (overwrites if available)
      if (this.gamepad && binding.gamepadAxis !== undefined) {
        const gpValue = this.gamepadAxes[binding.gamepadAxis] ?? 0;
        const deadzone = this.bindings.settings.gamepadDeadzone;

        if (Math.abs(gpValue) > deadzone) {
          // Apply deadzone remapping
          const sign = Math.sign(gpValue);
          const remapped =
            (Math.abs(gpValue) - deadzone) / (1 - deadzone);
          value = sign * remapped * this.bindings.settings.gamepadSensitivity;
        }
      }

      // Mouse delta (for look)
      if (binding.mouseDelta && this.isPointerLocked) {
        const delta =
          binding.mouseDelta === 'x' ? this.mouseDelta.x : this.mouseDelta.y;
        value = delta * this.bindings.settings.mouseSensitivity;

        // Apply Y inversion if needed
        if (
          binding.mouseDelta === 'y' &&
          this.bindings.settings.invertMouseY
        ) {
          value = -value;
        }
      }

      // Apply axis inversion
      if (binding.inverted) {
        value = -value;
      }

      this.axisValues.set(axis, value);
    }
  }

  private pollGamepad(): void {
    const gamepads = navigator.getGamepads();
    this.gamepad = null;
    this.gamepadButtonsPressed.clear();
    this.gamepadAxes = [];

    for (const gp of gamepads) {
      if (gp && gp.connected) {
        this.gamepad = gp;

        // Read buttons
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i].pressed) {
            this.gamepadButtonsPressed.add(i as GamepadButton);
          }
        }

        // Read axes
        this.gamepadAxes = [...gp.axes];

        break; // Use first connected gamepad
      }
    }
  }

  // ========== Event Handlers ==========

  private onKeyDown = (event: KeyboardEvent): void => {
    // Ignore if typing in an input field
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    this.keysPressed.add(event.code);

    // Prevent default for game keys
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keysPressed.delete(event.code);
  };

  private onMouseDown = (event: MouseEvent): void => {
    this.mouseButtonsPressed.add(event.button as MouseButton);

    // Request pointer lock on first click
    if (!this.isPointerLocked && event.button === MouseButton.Left) {
      this.requestPointerLock();
    }
  };

  private onMouseUp = (event: MouseEvent): void => {
    this.mouseButtonsPressed.delete(event.button as MouseButton);
  };

  private onMouseMove = (event: MouseEvent): void => {
    // Accumulate delta (will be reset in update())
    this.mouseDelta.x += event.movementX;
    this.mouseDelta.y += event.movementY;

    // Track position
    this.mousePosition.x = event.clientX;
    this.mousePosition.y = event.clientY;
  };

  private onWheel = (_event: WheelEvent): void => {
    // Can be used for target switching or item selection
  };

  private onPointerLockChange = (): void => {
    this.isPointerLocked =
      document.pointerLockElement === this.pointerLockElement;
  };

  private onPointerLockError = (): void => {
    console.warn('Pointer lock error');
    this.isPointerLocked = false;
  };

  private onGamepadConnected = (event: GamepadEvent): void => {
    console.log('Gamepad connected:', event.gamepad.id);
  };

  private onGamepadDisconnected = (event: GamepadEvent): void => {
    console.log('Gamepad disconnected:', event.gamepad.id);
    if (this.gamepad?.index === event.gamepad.index) {
      this.gamepad = null;
    }
  };

  private isGameKey(code: string): boolean {
    // Check if this key is bound to any action
    for (const binding of Object.values(this.bindings.actions)) {
      if (binding?.keys?.includes(code)) {
        return true;
      }
    }
    for (const binding of Object.values(this.bindings.axes)) {
      if (
        binding?.keys?.positive.includes(code) ||
        binding?.keys?.negative.includes(code)
      ) {
        return true;
      }
    }
    return false;
  }
}

// Singleton instance
export const InputManager = new InputManagerClass();
