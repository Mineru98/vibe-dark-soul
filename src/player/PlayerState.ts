/**
 * Player state definitions and interfaces
 */

/**
 * Top-level player state groups
 */
export enum PlayerStateGroup {
  Grounded = 'Grounded',
  Airborne = 'Airborne',
  Dead = 'Dead',
}

/**
 * All player states
 */
export enum PlayerStateType {
  // Grounded states
  Idle = 'Idle',
  Walk = 'Walk',
  WalkBack = 'WalkBack',
  Run = 'Run',
  Sprint = 'Sprint',
  Roll = 'Roll',
  Backstep = 'Backstep',
  AttackLight = 'AttackLight',
  AttackHeavy = 'AttackHeavy',
  Guard = 'Guard',
  GuardBreak = 'GuardBreak',
  Parry = 'Parry',
  HitStun = 'HitStun',
  Interacting = 'Interacting',
  UsingItem = 'UsingItem',

  // Airborne states
  Falling = 'Falling',
  Landing = 'Landing',
  PlungeAttack = 'PlungeAttack',

  // Dead state
  Dead = 'Dead',
}

/**
 * Map states to groups
 */
export const STATE_GROUPS: Record<PlayerStateType, PlayerStateGroup> = {
  [PlayerStateType.Idle]: PlayerStateGroup.Grounded,
  [PlayerStateType.Walk]: PlayerStateGroup.Grounded,
  [PlayerStateType.WalkBack]: PlayerStateGroup.Grounded,
  [PlayerStateType.Run]: PlayerStateGroup.Grounded,
  [PlayerStateType.Sprint]: PlayerStateGroup.Grounded,
  [PlayerStateType.Roll]: PlayerStateGroup.Grounded,
  [PlayerStateType.Backstep]: PlayerStateGroup.Grounded,
  [PlayerStateType.AttackLight]: PlayerStateGroup.Grounded,
  [PlayerStateType.AttackHeavy]: PlayerStateGroup.Grounded,
  [PlayerStateType.Guard]: PlayerStateGroup.Grounded,
  [PlayerStateType.GuardBreak]: PlayerStateGroup.Grounded,
  [PlayerStateType.Parry]: PlayerStateGroup.Grounded,
  [PlayerStateType.HitStun]: PlayerStateGroup.Grounded,
  [PlayerStateType.Interacting]: PlayerStateGroup.Grounded,
  [PlayerStateType.UsingItem]: PlayerStateGroup.Grounded,
  [PlayerStateType.Falling]: PlayerStateGroup.Airborne,
  [PlayerStateType.Landing]: PlayerStateGroup.Airborne,
  [PlayerStateType.PlungeAttack]: PlayerStateGroup.Airborne,
  [PlayerStateType.Dead]: PlayerStateGroup.Dead,
};

/**
 * Check if a state belongs to a given group
 */
export function isInGroup(state: PlayerStateType, group: PlayerStateGroup): boolean {
  return STATE_GROUPS[state] === group;
}

/**
 * States that allow movement input
 */
export const MOVEMENT_STATES: Set<PlayerStateType> = new Set([
  PlayerStateType.Idle,
  PlayerStateType.Walk,
  PlayerStateType.WalkBack,
  PlayerStateType.Run,
  PlayerStateType.Sprint,
  PlayerStateType.Guard,
  PlayerStateType.Falling,
]);

/**
 * States with i-frames
 */
export const IFRAME_STATES: Set<PlayerStateType> = new Set([
  PlayerStateType.Roll,
  PlayerStateType.Backstep,
]);

/**
 * States that can cancel into roll/backstep
 */
export const ROLL_CANCELABLE_STATES: Set<PlayerStateType> = new Set([
  PlayerStateType.Idle,
  PlayerStateType.Walk,
  PlayerStateType.WalkBack,
  PlayerStateType.Run,
  PlayerStateType.Sprint,
  PlayerStateType.Guard,
]);

/**
 * States that can cancel into attack
 */
export const ATTACK_CANCELABLE_STATES: Set<PlayerStateType> = new Set([
  PlayerStateType.Idle,
  PlayerStateType.Walk,
  PlayerStateType.Run,
]);

/**
 * Animation clip name per state
 */
export const STATE_ANIMATIONS: Record<PlayerStateType, string> = {
  [PlayerStateType.Idle]: 'Idle',
  [PlayerStateType.Walk]: 'Walk',
  [PlayerStateType.WalkBack]: 'Walk_Back',
  [PlayerStateType.Run]: 'Run',
  [PlayerStateType.Sprint]: 'Sprint',
  [PlayerStateType.Roll]: 'Roll',
  [PlayerStateType.Backstep]: 'Backstep',
  [PlayerStateType.AttackLight]: 'Attack_Light_1',
  [PlayerStateType.AttackHeavy]: 'Attack_Heavy',
  [PlayerStateType.Guard]: 'Guard_Idle',
  [PlayerStateType.GuardBreak]: 'Guard_Break',
  [PlayerStateType.Parry]: 'Parry',
  [PlayerStateType.HitStun]: 'Hit_React',
  [PlayerStateType.Interacting]: 'Interact',
  [PlayerStateType.UsingItem]: 'Use_Item',
  [PlayerStateType.Falling]: 'Fall',
  [PlayerStateType.Landing]: 'Land',
  [PlayerStateType.PlungeAttack]: 'Plunge_Attack',
  [PlayerStateType.Dead]: 'Death',
};
