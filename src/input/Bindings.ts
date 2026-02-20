/**
 * Input bindings configuration
 * Maps physical inputs (keys, buttons) to game actions
 */

import { Action, Axis } from './Action';

/**
 * Keyboard key codes (using KeyboardEvent.code)
 */
export type KeyCode = string;

/**
 * Mouse button indices
 */
export enum MouseButton {
  Left = 0,
  Middle = 1,
  Right = 2,
  Back = 3,
  Forward = 4,
}

/**
 * Gamepad button indices (standard layout)
 * https://w3c.github.io/gamepad/#remapping
 */
export enum GamepadButton {
  A = 0, // Cross on PlayStation
  B = 1, // Circle on PlayStation
  X = 2, // Square on PlayStation
  Y = 3, // Triangle on PlayStation
  LB = 4, // L1
  RB = 5, // R1
  LT = 6, // L2
  RT = 7, // R2
  Back = 8, // Select/Share
  Start = 9, // Options
  LS = 10, // Left stick press
  RS = 11, // Right stick press
  DPadUp = 12,
  DPadDown = 13,
  DPadLeft = 14,
  DPadRight = 15,
  Home = 16, // PS/Xbox button
}

/**
 * Gamepad axis indices
 */
export enum GamepadAxis {
  LeftStickX = 0,
  LeftStickY = 1,
  RightStickX = 2,
  RightStickY = 3,
}

/**
 * Binding for a single action
 */
export interface ActionBinding {
  keys?: KeyCode[];
  mouseButtons?: MouseButton[];
  gamepadButtons?: GamepadButton[];
}

/**
 * Binding for an axis
 */
export interface AxisBinding {
  // Keyboard keys for axis (positive, negative)
  keys?: { positive: KeyCode[]; negative: KeyCode[] };
  // Gamepad axis
  gamepadAxis?: GamepadAxis;
  // Mouse movement (for look)
  mouseDelta?: 'x' | 'y';
  // Invert axis
  inverted?: boolean;
}

/**
 * Complete bindings configuration
 */
export interface BindingsConfig {
  actions: Partial<Record<Action, ActionBinding>>;
  axes: Partial<Record<Axis, AxisBinding>>;
  settings: {
    mouseSensitivity: number;
    gamepadDeadzone: number;
    gamepadSensitivity: number;
    invertMouseY: boolean;
    invertGamepadY: boolean;
  };
}

/**
 * Default keyboard + mouse bindings (Dark Souls PC style)
 */
export const DEFAULT_BINDINGS: BindingsConfig = {
  actions: {
    [Action.MoveForward]: {
      keys: ['KeyW', 'ArrowUp'],
    },
    [Action.MoveBack]: {
      keys: ['KeyS', 'ArrowDown'],
    },
    [Action.MoveLeft]: {
      keys: ['KeyA', 'ArrowLeft'],
    },
    [Action.MoveRight]: {
      keys: ['KeyD', 'ArrowRight'],
    },
    [Action.Attack]: {
      mouseButtons: [MouseButton.Left],
      gamepadButtons: [GamepadButton.RB],
    },
    [Action.StrongAttack]: {
      mouseButtons: [MouseButton.Right],
      gamepadButtons: [GamepadButton.RT],
    },
    [Action.Roll]: {
      keys: ['Space'],
      gamepadButtons: [GamepadButton.B],
    },
    [Action.Sprint]: {
      keys: ['Space'], // Hold Space to sprint
      gamepadButtons: [GamepadButton.B],
    },
    [Action.Block]: {
      keys: ['ShiftLeft', 'ShiftRight'],
      gamepadButtons: [GamepadButton.LB],
    },
    [Action.Parry]: {
      keys: ['Tab'],
      gamepadButtons: [GamepadButton.LT],
    },
    [Action.Interact]: {
      keys: ['KeyE', 'KeyF'],
      gamepadButtons: [GamepadButton.A],
    },
    [Action.UseItem]: {
      keys: ['KeyR'],
      gamepadButtons: [GamepadButton.X],
    },
    [Action.LockOn]: {
      keys: ['KeyQ', 'KeyZ'],
      mouseButtons: [MouseButton.Middle],
      gamepadButtons: [GamepadButton.RS],
    },
    [Action.SwitchTargetLeft]: {
      gamepadButtons: [GamepadButton.DPadLeft],
    },
    [Action.SwitchTargetRight]: {
      gamepadButtons: [GamepadButton.DPadRight],
    },
    [Action.Pause]: {
      keys: ['Escape'],
      gamepadButtons: [GamepadButton.Start],
    },
    [Action.Menu]: {
      keys: ['KeyI'],
      gamepadButtons: [GamepadButton.Back],
    },
    [Action.DebugToggle]: {
      keys: ['F1'],
    },
  },
  axes: {
    [Axis.MoveX]: {
      keys: { positive: ['KeyD', 'ArrowRight'], negative: ['KeyA', 'ArrowLeft'] },
      gamepadAxis: GamepadAxis.LeftStickX,
    },
    [Axis.MoveY]: {
      keys: { positive: ['KeyW', 'ArrowUp'], negative: ['KeyS', 'ArrowDown'] },
      gamepadAxis: GamepadAxis.LeftStickY,
      inverted: false,
    },
    [Axis.LookX]: {
      mouseDelta: 'x',
      gamepadAxis: GamepadAxis.RightStickX,
    },
    [Axis.LookY]: {
      mouseDelta: 'y',
      gamepadAxis: GamepadAxis.RightStickY,
    },
  },
  settings: {
    mouseSensitivity: 1.0,
    gamepadDeadzone: 0.15,
    gamepadSensitivity: 2.0,
    invertMouseY: false,
    invertGamepadY: false,
  },
};

/**
 * Clone bindings for modification
 */
export function cloneBindings(bindings: BindingsConfig): BindingsConfig {
  return JSON.parse(JSON.stringify(bindings));
}
