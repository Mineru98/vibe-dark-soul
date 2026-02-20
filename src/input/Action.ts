/**
 * Game actions - abstracted from physical inputs
 * These represent what the player wants to DO, not which key they pressed
 */

export enum Action {
  // Movement
  MoveForward = 'MoveForward',
  MoveBack = 'MoveBack',
  MoveLeft = 'MoveLeft',
  MoveRight = 'MoveRight',

  // Combat
  Attack = 'Attack',
  StrongAttack = 'StrongAttack',
  Roll = 'Roll',
  Sprint = 'Sprint', // Hold to sprint
  Block = 'Block',
  Parry = 'Parry',

  // Interaction
  Interact = 'Interact',
  UseItem = 'UseItem',

  // Camera
  LockOn = 'LockOn',
  SwitchTargetLeft = 'SwitchTargetLeft',
  SwitchTargetRight = 'SwitchTargetRight',

  // System
  Pause = 'Pause',
  Menu = 'Menu',

  // Debug
  DebugToggle = 'DebugToggle',
}

/**
 * Axis inputs (analog values from -1 to 1)
 */
export enum Axis {
  MoveX = 'MoveX', // Left/Right movement
  MoveY = 'MoveY', // Forward/Back movement
  LookX = 'LookX', // Camera horizontal
  LookY = 'LookY', // Camera vertical
}

/**
 * Input state for an action
 */
export interface ActionState {
  pressed: boolean;
  justPressed: boolean;
  justReleased: boolean;
  heldTime: number; // How long the action has been held (seconds)
}

/**
 * Default action state
 */
export const DEFAULT_ACTION_STATE: ActionState = {
  pressed: false,
  justPressed: false,
  justReleased: false,
  heldTime: 0,
};
