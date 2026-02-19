/**
 * Collision groups and filters for Rapier physics
 *
 * Rapier uses 32-bit collision groups:
 * - Upper 16 bits: membership (what group this collider belongs to)
 * - Lower 16 bits: filter (what groups this collider can interact with)
 *
 * Two colliders interact if:
 * (A.membership & B.filter) != 0 && (B.membership & A.filter) != 0
 */

/**
 * Collision group membership bits
 */
export const CollisionGroup = {
  NONE: 0x0000,
  PLAYER: 0x0001,
  ENEMY: 0x0002,
  BOSS: 0x0004,
  ENVIRONMENT: 0x0008,
  TRIGGER: 0x0010,
  HITBOX: 0x0020,
  HURTBOX: 0x0040,
  PROJECTILE: 0x0080,
  ITEM: 0x0100,
  INTERACTABLE: 0x0200,
  DEBRIS: 0x0400, // Decorative physics objects
  ALL: 0xffff,
} as const;

export type CollisionGroupType =
  (typeof CollisionGroup)[keyof typeof CollisionGroup];

/**
 * Create a collision group value from membership and filter
 * @param membership What group this collider belongs to
 * @param filter What groups this collider can interact with
 */
export function createCollisionGroups(
  membership: number,
  filter: number
): number {
  return (membership << 16) | filter;
}

/**
 * Pre-defined collision group configurations
 */
export const CollisionGroups = {
  /**
   * Player character
   * - Collides with: environment, enemies, triggers, items
   * - Does NOT collide with: own hitboxes
   */
  PLAYER: createCollisionGroups(
    CollisionGroup.PLAYER,
    CollisionGroup.ENVIRONMENT |
      CollisionGroup.ENEMY |
      CollisionGroup.BOSS |
      CollisionGroup.TRIGGER |
      CollisionGroup.ITEM |
      CollisionGroup.INTERACTABLE |
      CollisionGroup.PROJECTILE
  ),

  /**
   * Player hurtbox (for receiving damage)
   * - Collides with: enemy hitboxes, boss hitboxes
   */
  PLAYER_HURTBOX: createCollisionGroups(
    CollisionGroup.HURTBOX,
    CollisionGroup.HITBOX
  ),

  /**
   * Player hitbox (for dealing damage)
   * - Collides with: enemy hurtboxes, boss hurtboxes
   */
  PLAYER_HITBOX: createCollisionGroups(
    CollisionGroup.HITBOX,
    CollisionGroup.HURTBOX
  ),

  /**
   * Enemy character
   * - Collides with: environment, player, other enemies
   */
  ENEMY: createCollisionGroups(
    CollisionGroup.ENEMY,
    CollisionGroup.ENVIRONMENT |
      CollisionGroup.PLAYER |
      CollisionGroup.ENEMY |
      CollisionGroup.PROJECTILE
  ),

  /**
   * Enemy hurtbox
   * - Collides with: player hitboxes
   */
  ENEMY_HURTBOX: createCollisionGroups(
    CollisionGroup.HURTBOX,
    CollisionGroup.HITBOX
  ),

  /**
   * Enemy hitbox
   * - Collides with: player hurtbox
   */
  ENEMY_HITBOX: createCollisionGroups(
    CollisionGroup.HITBOX,
    CollisionGroup.HURTBOX
  ),

  /**
   * Boss character
   * - Same as enemy but separate group for special handling
   */
  BOSS: createCollisionGroups(
    CollisionGroup.BOSS,
    CollisionGroup.ENVIRONMENT |
      CollisionGroup.PLAYER |
      CollisionGroup.PROJECTILE
  ),

  /**
   * Boss hurtbox
   */
  BOSS_HURTBOX: createCollisionGroups(
    CollisionGroup.HURTBOX,
    CollisionGroup.HITBOX
  ),

  /**
   * Boss hitbox
   */
  BOSS_HITBOX: createCollisionGroups(
    CollisionGroup.HITBOX,
    CollisionGroup.HURTBOX
  ),

  /**
   * Environment/static geometry
   * - Collides with: all characters, projectiles
   */
  ENVIRONMENT: createCollisionGroups(
    CollisionGroup.ENVIRONMENT,
    CollisionGroup.PLAYER |
      CollisionGroup.ENEMY |
      CollisionGroup.BOSS |
      CollisionGroup.PROJECTILE |
      CollisionGroup.DEBRIS
  ),

  /**
   * Trigger volumes (sensors)
   * - Collides with: player only (for efficiency)
   * - Note: These should be set as sensors
   */
  TRIGGER: createCollisionGroups(
    CollisionGroup.TRIGGER,
    CollisionGroup.PLAYER
  ),

  /**
   * Projectiles
   * - Collides with: environment, characters
   */
  PROJECTILE: createCollisionGroups(
    CollisionGroup.PROJECTILE,
    CollisionGroup.ENVIRONMENT |
      CollisionGroup.PLAYER |
      CollisionGroup.ENEMY |
      CollisionGroup.BOSS
  ),

  /**
   * Pickup items
   * - Collides with: player (for pickup detection)
   */
  ITEM: createCollisionGroups(CollisionGroup.ITEM, CollisionGroup.PLAYER),

  /**
   * Interactable objects (levers, doors, etc.)
   * - Collides with: player
   */
  INTERACTABLE: createCollisionGroups(
    CollisionGroup.INTERACTABLE,
    CollisionGroup.PLAYER
  ),

  /**
   * Decorative debris (ash, rubble)
   * - Collides with: environment only
   */
  DEBRIS: createCollisionGroups(
    CollisionGroup.DEBRIS,
    CollisionGroup.ENVIRONMENT | CollisionGroup.DEBRIS
  ),

  /**
   * Query filter for raycasts that should hit environment only
   */
  ENVIRONMENT_QUERY: createCollisionGroups(
    CollisionGroup.NONE,
    CollisionGroup.ENVIRONMENT
  ),

  /**
   * Query filter for raycasts that should hit characters
   */
  CHARACTER_QUERY: createCollisionGroups(
    CollisionGroup.NONE,
    CollisionGroup.PLAYER | CollisionGroup.ENEMY | CollisionGroup.BOSS
  ),

  /**
   * Query filter for attack hitbox sweeps
   */
  HITBOX_QUERY: createCollisionGroups(
    CollisionGroup.NONE,
    CollisionGroup.HURTBOX
  ),
};

/**
 * Extract membership bits from collision groups
 */
export function getMembership(groups: number): number {
  return (groups >> 16) & 0xffff;
}

/**
 * Extract filter bits from collision groups
 */
export function getFilter(groups: number): number {
  return groups & 0xffff;
}

/**
 * Check if two collision groups can interact
 */
export function canInteract(groupsA: number, groupsB: number): boolean {
  const membershipA = getMembership(groupsA);
  const filterA = getFilter(groupsA);
  const membershipB = getMembership(groupsB);
  const filterB = getFilter(groupsB);

  return (membershipA & filterB) !== 0 && (membershipB & filterA) !== 0;
}
