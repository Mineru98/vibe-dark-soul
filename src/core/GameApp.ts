/**
 * GameApp - Main game application controller
 *
 * Manages:
 * - Game state transitions (Title -> Gameplay -> Pause)
 * - System initialization and teardown
 * - Main game loop with fixed timestep physics
 *
 * Usage:
 * - GameApp.init() to start
 * - GameApp.startGameplay() to transition from title to game
 * - GameApp.pause() / GameApp.resume() for pause menu
 */

import * as THREE from 'three';
import { Time } from './Time';
import { EventBus } from './EventBus';
import { getScene, getRenderer } from './Scene';

// Systems
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InputManager } from '../input/InputManager';
import { Player, PlayerConfig } from '../player/Player';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { LockOnSystem } from '../camera/LockOnSystem';
import { AttackSystem } from '../combat/AttackSystem';
import { DamageSystem } from '../combat/DamageSystem';
import { IFrameSystem } from '../combat/IFrameSystem';
import { Boss, TUTORIAL_BOSS_CONFIG } from '../ai/Boss';
import { LevelLoader, TUTORIAL_LEVEL } from '../level/LevelLoader';
import { TriggerManager } from '../level/TriggerVolume';
import { GameFlags, GameFlag } from '../level/GameFlags';
import { HUDView } from '../ui/HUDView';
import { BossBar } from '../ui/BossBar';
import { TutorialPrompts, TUTORIAL_MESSAGES } from '../ui/TutorialPrompts';

/**
 * Game state enum
 */
export enum GameState {
  Loading = 'loading',
  Title = 'title',
  Gameplay = 'gameplay',
  Paused = 'paused',
  GameOver = 'gameover',
  Victory = 'victory',
}

/**
 * GameApp configuration
 */
export interface GameAppConfig {
  debugPhysics?: boolean;
}

/**
 * GameApp class
 */
class GameAppClass {
  private state: GameState = GameState.Loading;
  private config: GameAppConfig = {};

  // Entity references
  private player: Player | null = null;
  private boss: Boss | null = null;
  private camera: ThirdPersonCamera | null = null;
  private lockOn: LockOnSystem | null = null;

  // Debug
  private debugMesh: THREE.LineSegments | null = null;

  // Animation frame ID
  private animationFrameId: number | null = null;

  /**
   * Initialize the game application
   */
  async init(config?: GameAppConfig): Promise<void> {
    this.config = config ?? {};
    this.state = GameState.Loading;

    // Initialize core systems
    await PhysicsWorld.init();
    InputManager.init();
    Time.init();

    // Initialize UI systems
    HUDView.init();
    BossBar.init();
    TutorialPrompts.init();

    // Subscribe to game events
    this.subscribeEvents();

    // Load saved flags
    GameFlags.loadFromStorage();

    console.log('[GameApp] Initialized');
  }

  /**
   * Subscribe to game events
   */
  private subscribeEvents(): void {
    // Input actions
    EventBus.on('input:action', (data) => {
      if (this.state === GameState.Gameplay) {
        this.handleGameplayInput(data);
      }
    });

    // Player death
    EventBus.on('player:died', () => {
      this.onPlayerDied();
    });

    // Boss death
    EventBus.on('boss:died', () => {
      this.onBossDied();
    });

    // Trigger events
    EventBus.on('trigger:enter', (data) => {
      this.handleTriggerEnter(data);
    });
  }

  /**
   * Start gameplay (transition from title)
   */
  async startGameplay(): Promise<void> {
    if (this.state === GameState.Gameplay) return;

    console.log('[GameApp] Starting gameplay...');

    // Hide title UI
    this.hideTitleUI();

    // Load level
    const scene = getScene();
    await LevelLoader.load(TUTORIAL_LEVEL, scene);

    // Get spawn position
    const spawnPos = LevelLoader.getPlayerSpawn();

    // Create player
    this.createPlayer(spawnPos, scene);

    // Setup camera
    this.setupCamera();

    // Setup lock-on system
    this.setupLockOn();

    // Register boss spawner callback
    LevelLoader.registerSpawnCallback('boss_tutorial', (spawner) => {
      return this.spawnBoss(spawner.position, scene);
    });

    // Spawn triggers
    TriggerManager.spawnAll();

    // Show HUD
    HUDView.show();

    // Show tutorial if first time
    if (!GameFlags.is(GameFlag.LEARNED_MOVEMENT)) {
      TutorialPrompts.showPredefined('MOVEMENT');
      GameFlags.set(GameFlag.LEARNED_MOVEMENT);
    }

    // Debug physics visualization
    if (this.config.debugPhysics) {
      this.debugMesh = PhysicsWorld.createDebugMesh();
      if (this.debugMesh) {
        scene.add(this.debugMesh);
        PhysicsWorld.setDebugEnabled(true);
      }
    }

    this.state = GameState.Gameplay;

    // Start game loop
    this.startGameLoop();

    console.log('[GameApp] Gameplay started');
  }

  /**
   * Create player entity
   */
  private createPlayer(position: THREE.Vector3, scene: THREE.Scene): void {
    // Create player mesh (placeholder capsule)
    const geometry = new THREE.CapsuleGeometry(0.4, 1.0, 8, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a90d9,
      roughness: 0.7,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Create player
    const config: PlayerConfig = {
      position: position.clone(),
      mesh,
      entityId: 'player',
    };

    this.player = new Player(config);

    // Emit initial health/stamina
    EventBus.emit('player:healthChanged', {
      current: this.player.currentHP,
      max: this.player.maxHP,
    });
    EventBus.emit('player:staminaChanged', {
      current: this.player.currentStamina,
      max: this.player.maxStamina,
    });
  }

  /**
   * Setup third-person camera
   */
  private setupCamera(): void {
    if (!this.player) return;

    this.camera = new ThirdPersonCamera({
      target: this.player.position,
      distance: 5,
      height: 2,
      sensitivity: 0.003,
    });

    this.camera.init();
  }

  /**
   * Setup lock-on system
   */
  private setupLockOn(): void {
    if (!this.player) return;

    this.lockOn = new LockOnSystem({
      maxDistance: 20,
      maxAngle: Math.PI / 3,
      playerPosition: this.player.position,
    });
  }

  /**
   * Spawn boss
   */
  private spawnBoss(position: THREE.Vector3, scene: THREE.Scene): string {
    this.boss = new Boss({
      ...TUTORIAL_BOSS_CONFIG,
      position: position.clone(),
    });

    this.boss.spawn(scene);

    // Register as lock-on target
    if (this.lockOn) {
      this.lockOn.addTarget(this.boss.id, this.boss.position);
    }

    return this.boss.id;
  }

  /**
   * Main game loop
   */
  private startGameLoop(): void {
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop);

      // Update time
      Time.update();

      // Update input
      InputManager.update();

      // Fixed timestep physics
      Time.fixedUpdate((fixedDt) => {
        this.fixedUpdate(fixedDt);
      });

      // Variable timestep updates
      this.update(Time.delta);

      // Render
      this.render();
    };

    loop();
  }

  /**
   * Fixed timestep update (physics)
   */
  private fixedUpdate(dt: number): void {
    if (this.state !== GameState.Gameplay) return;

    // Update i-frames
    IFrameSystem.update(dt);

    // Update player
    if (this.player && !this.player.isDead) {
      // Update camera yaw for input transformation
      if (this.camera) {
        this.player.setCameraYaw(this.camera.yaw);
      }

      // Update lock-on target
      if (this.lockOn && this.lockOn.hasTarget()) {
        const targetPos = this.lockOn.getTargetPosition();
        if (targetPos) {
          this.player.setLockOnTarget(targetPos);
        }
      } else {
        this.player.setLockOnTarget(null);
      }

      this.player.update(dt);
    }

    // Update boss
    if (this.boss && this.player) {
      this.boss.updateTargetPosition(this.player.position);
      this.boss.update(dt);

      // Check plunge attack
      if (this.boss.checkPlungeZone(this.player.position, this.player.getMotor().verticalVelocity)) {
        if (this.player.inHitWindow && this.player.currentState === 'falling') {
          this.boss.receivePlungeAttack();
          GameFlags.set(GameFlag.BOSS_PLUNGED);
        }
      }
    }

    // Update triggers
    TriggerManager.update(dt);

    // Step physics
    PhysicsWorld.step();
  }

  /**
   * Variable timestep update (rendering, UI)
   */
  private update(dt: number): void {
    if (this.state !== GameState.Gameplay) return;

    // Update camera
    if (this.camera && this.player) {
      this.camera.setTarget(this.player.position);

      // Update lock-on camera behavior
      if (this.lockOn && this.lockOn.hasTarget()) {
        const targetPos = this.lockOn.getTargetPosition();
        if (targetPos) {
          this.camera.setLockOnTarget(targetPos);
        }
      } else {
        this.camera.setLockOnTarget(null);
      }

      this.camera.update(dt);
    }

    // Update lock-on system
    if (this.lockOn && this.player) {
      this.lockOn.setPlayerPosition(this.player.position);
      if (this.camera) {
        this.lockOn.setCameraForward(this.camera.forward);
      }
    }

    // Update boss lock-on target position
    if (this.lockOn && this.boss) {
      this.lockOn.updateTargetPosition(this.boss.id, this.boss.position);
    }

    // Update debug mesh
    if (this.config.debugPhysics) {
      PhysicsWorld.updateDebugMesh();
    }
  }

  /**
   * Render
   */
  private render(): void {
    const renderer = getRenderer();
    const scene = getScene();

    if (this.camera) {
      renderer.render(scene, this.camera.getCamera());
    }
  }

  /**
   * Handle gameplay input
   */
  private handleGameplayInput(data: { action: string; pressed: boolean }): void {
    if (!this.player || this.player.isDead) return;

    // Lock-on toggle
    if (data.action === 'LockOn' && data.pressed) {
      if (this.lockOn) {
        if (this.lockOn.hasTarget()) {
          this.lockOn.clearTarget();
        } else {
          this.lockOn.acquireTarget();
        }
      }
    }

    // Item use
    if (data.action === 'UseItem' && data.pressed) {
      this.player.useItem();
    }

    // Pause
    if (data.action === 'Escape' && data.pressed) {
      this.pause();
    }
  }

  /**
   * Handle trigger enter
   */
  private handleTriggerEnter(data: { triggerId: string; entityId: string }): void {
    const { triggerId } = data;

    // Tutorial triggers
    if (triggerId === 'tutorial_roll' && !GameFlags.is(GameFlag.LEARNED_ROLL)) {
      TutorialPrompts.showPredefined('ROLL');
      GameFlags.set(GameFlag.LEARNED_ROLL);
    }

    if (triggerId === 'tutorial_attack' && !GameFlags.is(GameFlag.LEARNED_ATTACK)) {
      TutorialPrompts.showPredefined('ATTACK');
      GameFlags.set(GameFlag.LEARNED_ATTACK);
    }

    // Boss room trigger
    if (triggerId === 'boss_room_trigger') {
      if (!GameFlags.is(GameFlag.MET_BOSS_ONCE)) {
        GameFlags.set(GameFlag.MET_BOSS_ONCE);
        // Process boss spawn
        LevelLoader.processSpawns();
      }
    }
  }

  /**
   * Pause game
   */
  pause(): void {
    if (this.state !== GameState.Gameplay) return;

    this.state = GameState.Paused;
    Time.pause();

    // Show pause UI
    EventBus.emit('ui:pauseShow', {});

    console.log('[GameApp] Paused');
  }

  /**
   * Resume game
   */
  resume(): void {
    if (this.state !== GameState.Paused) return;

    this.state = GameState.Gameplay;
    Time.resume();

    // Hide pause UI
    EventBus.emit('ui:pauseHide', {});

    console.log('[GameApp] Resumed');
  }

  /**
   * Handle player death
   */
  private onPlayerDied(): void {
    console.log('[GameApp] Player died');

    this.state = GameState.GameOver;
    HUDView.hide();

    // Show "YOU DIED" message
    this.showDeathScreen();

    // Respawn after delay
    setTimeout(() => {
      this.respawnPlayer();
    }, 3000);
  }

  /**
   * Show death screen
   */
  private showDeathScreen(): void {
    const deathScreen = document.createElement('div');
    deathScreen.id = 'death-screen';
    deathScreen.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Cinzel', serif;
      font-size: 4rem;
      color: #8b0000;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      opacity: 0;
      transition: opacity 1s ease;
      z-index: 2000;
      text-shadow: 0 0 20px rgba(139, 0, 0, 0.8);
    `;
    deathScreen.textContent = 'YOU DIED';
    document.body.appendChild(deathScreen);

    requestAnimationFrame(() => {
      deathScreen.style.opacity = '1';
    });

    setTimeout(() => {
      deathScreen.style.opacity = '0';
      setTimeout(() => {
        deathScreen.remove();
      }, 1000);
    }, 2000);
  }

  /**
   * Respawn player
   */
  private respawnPlayer(): void {
    if (!this.player) return;

    const spawnPos = LevelLoader.getPlayerSpawn();
    this.player.respawn(spawnPos);

    HUDView.show();
    this.state = GameState.Gameplay;

    console.log('[GameApp] Player respawned');
  }

  /**
   * Handle boss death
   */
  private onBossDied(): void {
    console.log('[GameApp] Boss defeated!');

    GameFlags.set(GameFlag.BOSS_DEFEATED);
    GameFlags.saveToStorage();

    // Show victory after delay
    setTimeout(() => {
      this.showVictoryScreen();
    }, 2000);
  }

  /**
   * Show victory screen
   */
  private showVictoryScreen(): void {
    this.state = GameState.Victory;

    const victoryScreen = document.createElement('div');
    victoryScreen.id = 'victory-screen';
    victoryScreen.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Cinzel', serif;
      font-size: 3rem;
      color: #d4a54a;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      opacity: 0;
      transition: opacity 1s ease;
      z-index: 2000;
      text-shadow: 0 0 20px rgba(212, 165, 74, 0.8);
      text-align: center;
    `;
    victoryScreen.innerHTML = 'VICTORY ACHIEVED<br><span style="font-size: 1.5rem">HEIR OF FIRE DESTROYED</span>';
    document.body.appendChild(victoryScreen);

    requestAnimationFrame(() => {
      victoryScreen.style.opacity = '1';
    });

    console.log('[GameApp] Victory!');
  }

  /**
   * Hide title UI elements
   */
  private hideTitleUI(): void {
    const title = document.getElementById('title');
    const menu = document.getElementById('main-menu');
    const pressKey = document.getElementById('press-key');

    if (title) title.style.display = 'none';
    if (menu) menu.style.display = 'none';
    if (pressKey) pressKey.style.display = 'none';
  }

  /**
   * Stop game loop
   */
  stopGameLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopGameLoop();

    // Destroy entities
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }

    if (this.boss) {
      this.boss.despawn(getScene());
      this.boss = null;
    }

    // Destroy systems
    LevelLoader.unload();
    TriggerManager.destroyAll();
    HUDView.destroy();
    BossBar.destroy();
    TutorialPrompts.destroy();
    InputManager.destroy();
    PhysicsWorld.destroy();

    // Remove debug mesh
    if (this.debugMesh && this.debugMesh.parent) {
      this.debugMesh.parent.remove(this.debugMesh);
      this.debugMesh = null;
    }

    this.state = GameState.Loading;

    console.log('[GameApp] Destroyed');
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Set state to title (for initial load)
   */
  setTitleState(): void {
    this.state = GameState.Title;
  }

  /**
   * Get player reference
   */
  getPlayer(): Player | null {
    return this.player;
  }

  /**
   * Get boss reference
   */
  getBoss(): Boss | null {
    return this.boss;
  }
}

// Singleton instance
export const GameApp = new GameAppClass();
