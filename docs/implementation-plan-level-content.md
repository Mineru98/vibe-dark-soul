# 레벨/콘텐츠 시스템 구현 계획서 (Level/Content Systems Implementation Plan)

## 문서 정보
- **작성일**: 2026-02-18
- **작성 기준**: PRD.md 섹션 4, 4.2, 12, 부록 A
- **현재 프로젝트 상태**: 타이틀 화면 구현 완료 (Three.js + Rapier 기본 연동)

---

## 1. 아키텍처 개요

### 1.1 디렉터리 구조

```
src/
├── content/                         # 레벨/콘텐츠 시스템
│   ├── SceneManager.ts              # 씬 전환/관리
│   ├── LevelLoader.ts               # 레벨 지오메트리 로딩
│   ├── TriggerSystem.ts             # 볼륨 트리거 시스템
│   ├── CheckpointSystem.ts          # 체크포인트(모닥불) 시스템
│   ├── RespawnSystem.ts             # 사망/리스폰 시스템
│   ├── DialogueSystem.ts            # 대사 시스템
│   ├── BossArenaController.ts       # 보스 아레나 로직
│   │
│   ├── data/                        # 데이터 드리븐 콘텐츠
│   │   ├── triggers.json            # 레벨 트리거 정의
│   │   ├── dialogue.json            # 대사 데이터
│   │   ├── balance.json             # 밸런스 파라미터
│   │   ├── scenes.json              # 씬 정의 (씬 0-9)
│   │   └── checkpoints.json         # 체크포인트 위치
│   │
│   ├── levels/                      # 레벨별 스크립트
│   │   ├── Scene0_Prison.ts         # 감금된 방
│   │   ├── Scene1_Corridor.ts       # 좁은 복도
│   │   ├── Scene2_FirstEnemy.ts     # 첫 적 조우
│   │   ├── Scene3_Equipment.ts      # 장비 획득
│   │   ├── Scene4_Courtyard.ts      # 보스 첫 등장
│   │   ├── Scene5_Escape.ts         # 탈출 루프
│   │   ├── Scene6_Checkpoint.ts     # 체크포인트
│   │   ├── Scene7_FogGate.ts        # 안개문
│   │   ├── Scene8_BossFight.ts      # 보스전
│   │   └── Scene9_Ending.ts         # 엔딩
│   │
│   └── types.ts                     # 콘텐츠 관련 타입 정의
│
├── core/
│   └── EventBus.ts                  # 전역 이벤트 버스
│
└── utils/
    └── FadeTransition.ts            # 페이드 효과 유틸리티
```

### 1.2 시스템 의존성 다이어그램

```
                         ┌─────────────────┐
                         │   SceneManager  │
                         └────────┬────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│ TriggerSystem │        │ LevelLoader   │        │ DialogueSystem│
└───────┬───────┘        └───────────────┘        └───────────────┘
        │
        │ (트리거 이벤트)
        ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│CheckpointSys  │◄──────►│ RespawnSystem │◄──────►│BossArenaCtrl  │
└───────────────┘        └───────────────┘        └───────────────┘
        │                         │
        └──────────┬──────────────┘
                   ▼
            ┌─────────────┐
            │  EventBus   │
            └─────────────┘
```

---

## 2. 씬 매니저 시스템 (씬 0-9 흐름)

### 2.1 씬 정의 (PRD 섹션 4.1 기반)

```typescript
// src/content/types.ts

export enum SceneId {
  SCENE_0_PRISON = 'scene_0_prison',
  SCENE_1_CORRIDOR = 'scene_1_corridor',
  SCENE_2_FIRST_ENEMY = 'scene_2_first_enemy',
  SCENE_3_EQUIPMENT = 'scene_3_equipment',
  SCENE_4_COURTYARD = 'scene_4_courtyard',
  SCENE_5_ESCAPE = 'scene_5_escape',
  SCENE_6_CHECKPOINT = 'scene_6_checkpoint',
  SCENE_7_FOG_GATE = 'scene_7_fog_gate',
  SCENE_8_BOSS_FIGHT = 'scene_8_boss_fight',
  SCENE_9_ENDING = 'scene_9_ending',
}

export interface SceneDefinition {
  id: SceneId;
  name: string;
  description: string;
  levelGeometryPath: string;
  spawnPoint: { x: number; y: number; z: number };
  triggers: string[];
  enemies: EnemySpawnData[];
  tutorialMessages: TutorialMessage[];
  nextScene: SceneId | null;
  previousScene: SceneId | null;
}

export interface EnemySpawnData {
  enemyId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  respawnOnCheckpoint: boolean;
}
```

### 2.2 씬 데이터 (scenes.json)

```json
{
  "scenes": [
    {
      "id": "scene_0_prison",
      "name": "감금된 방",
      "description": "스타트 지점. 플레이어 스폰, 일어나기 인터랙션",
      "levelGeometryPath": "/assets/levels/prison_cell.glb",
      "spawnPoint": { "x": 0, "y": 0.1, "z": 0 },
      "triggers": ["wake_up_trigger", "exit_door_trigger"],
      "enemies": [],
      "tutorialMessages": [
        {
          "id": "msg_wake",
          "position": { "x": 0, "y": 0.5, "z": -1 },
          "text": "[E] 일어나기",
          "key": "E"
        }
      ],
      "nextScene": "scene_1_corridor",
      "previousScene": null
    },
    {
      "id": "scene_2_first_enemy",
      "name": "첫 적 조우",
      "description": "기본 전투 튜토리얼",
      "levelGeometryPath": "/assets/levels/enemy_room.glb",
      "spawnPoint": { "x": 0, "y": 0.1, "z": -5 },
      "triggers": ["enemy_room_entrance", "enemy_room_exit"],
      "enemies": [
        {
          "enemyId": "zombie_basic",
          "position": { "x": 0, "y": 0, "z": 5 },
          "rotation": 180,
          "respawnOnCheckpoint": true
        }
      ],
      "tutorialMessages": [
        { "id": "msg_lockon", "position": { "x": -2, "y": 0.5, "z": 0 }, "text": "[휠 클릭] 락온" },
        { "id": "msg_attack", "position": { "x": 2, "y": 0.5, "z": 0 }, "text": "[좌클릭] 공격, [우클릭] 방어" }
      ],
      "nextScene": "scene_3_equipment",
      "previousScene": "scene_1_corridor"
    },
    {
      "id": "scene_6_checkpoint",
      "name": "체크포인트",
      "description": "모닥불 활성화",
      "levelGeometryPath": "/assets/levels/checkpoint_room.glb",
      "spawnPoint": { "x": 0, "y": 0.1, "z": 0 },
      "triggers": ["checkpoint_bonfire"],
      "enemies": [],
      "tutorialMessages": [
        { "id": "msg_bonfire", "position": { "x": 0, "y": 0.5, "z": 1 }, "text": "[E] 모닥불에서 휴식" }
      ],
      "nextScene": "scene_7_fog_gate",
      "previousScene": "scene_5_escape"
    },
    {
      "id": "scene_8_boss_fight",
      "name": "보스전",
      "description": "Gate Warden 본 전투",
      "levelGeometryPath": "/assets/levels/boss_arena.glb",
      "spawnPoint": { "x": 0, "y": 0.1, "z": -8 },
      "triggers": ["boss_fight_start", "boss_defeated"],
      "enemies": [],
      "tutorialMessages": [],
      "nextScene": "scene_9_ending",
      "previousScene": "scene_7_fog_gate"
    }
  ]
}
```

### 2.3 SceneManager 구현

```typescript
// src/content/SceneManager.ts

import * as THREE from 'three';
import { SceneId, SceneDefinition } from './types';
import { LevelLoader } from './LevelLoader';
import { TriggerSystem } from './TriggerSystem';
import { EventBus } from '../core/EventBus';
import { FadeTransition } from '../utils/FadeTransition';

export class SceneManager {
  private scenes: Map<SceneId, SceneDefinition> = new Map();
  private currentScene: SceneDefinition | null = null;

  private levelLoader: LevelLoader;
  private triggerSystem: TriggerSystem;
  private fadeTransition: FadeTransition;

  private threeScene: THREE.Scene;
  private currentLevelObjects: THREE.Object3D[] = [];

  constructor(
    threeScene: THREE.Scene,
    levelLoader: LevelLoader,
    triggerSystem: TriggerSystem
  ) {
    this.threeScene = threeScene;
    this.levelLoader = levelLoader;
    this.triggerSystem = triggerSystem;
    this.fadeTransition = new FadeTransition();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    EventBus.on('trigger:scene_transition', (data: { targetScene: SceneId }) => {
      this.transitionToScene(data.targetScene);
    });

    EventBus.on('player:respawn', () => {
      this.reloadCurrentScene();
    });
  }

  async loadSceneData(scenesJsonPath: string): Promise<void> {
    const response = await fetch(scenesJsonPath);
    const data = await response.json();

    for (const sceneDef of data.scenes) {
      this.scenes.set(sceneDef.id as SceneId, sceneDef);
    }
  }

  async transitionToScene(sceneId: SceneId, fadeIn: boolean = true): Promise<void> {
    const sceneDef = this.scenes.get(sceneId);
    if (!sceneDef) {
      console.error(`Scene not found: ${sceneId}`);
      return;
    }

    if (fadeIn) {
      await this.fadeTransition.fadeOut(0.5);
    }

    await this.unloadCurrentScene();
    await this.loadScene(sceneDef);

    this.currentScene = sceneDef;
    EventBus.emit('scene:loaded', { sceneId, sceneDef });

    if (fadeIn) {
      await this.fadeTransition.fadeIn(0.5);
    }
  }

  private async loadScene(sceneDef: SceneDefinition): Promise<void> {
    // 레벨 지오메트리 로드
    const levelObjects = await this.levelLoader.load(sceneDef.levelGeometryPath);
    this.currentLevelObjects = levelObjects;

    for (const obj of levelObjects) {
      this.threeScene.add(obj);
    }

    // 트리거 설정
    for (const triggerId of sceneDef.triggers) {
      this.triggerSystem.activateTrigger(triggerId);
    }

    // 적 스폰
    for (const enemyData of sceneDef.enemies) {
      EventBus.emit('enemy:spawn', enemyData);
    }

    // 플레이어 스폰 위치 설정
    EventBus.emit('player:set_position', sceneDef.spawnPoint);
  }

  private async unloadCurrentScene(): Promise<void> {
    for (const obj of this.currentLevelObjects) {
      this.threeScene.remove(obj);
    }
    this.currentLevelObjects = [];
    this.triggerSystem.deactivateAllTriggers();
    EventBus.emit('enemy:despawn_all');
  }

  getCurrentScene(): SceneDefinition | null {
    return this.currentScene;
  }

  async goToNextScene(): Promise<void> {
    if (this.currentScene?.nextScene) {
      await this.transitionToScene(this.currentScene.nextScene);
    }
  }
}
```

### 2.4 씬 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           튜토리얼 구간                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                 │
│   │  씬 0   │───►│  씬 1   │───►│  씬 2   │───►│  씬 3   │                 │
│   │감금된 방 │    │좁은 복도│    │첫 적 조우│    │장비 획득 │                 │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘                 │
│       ▼                                              │                      │
│   일어나기         이동 튜토리얼    전투 튜토리얼       ▼                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                        보스 첫 등장 + 도망                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│   ┌─────────┐    ┌─────────┐    ┌─────────┐                                │
│   │  씬 4   │───►│  씬 5   │───►│  씬 6   │◄─────────────────┐              │
│   │  안뜰   │    │탈출 루프│    │체크포인트│                 │              │
│   └─────────┘    └─────────┘    └─────────┘                 │              │
│       ▼                              │                      │              │
│  보스 등장 컷신     구르기 튜토리얼    ▼                      │              │
│                                 모닥불 활성화                │              │
├─────────────────────────────────────────────────────────────┼──────────────┤
│                           보스 전투                         │(사망 시 복귀) │
├─────────────────────────────────────────────────────────────┴──────────────┤
│   ┌─────────┐    ┌─────────┐    ┌─────────┐                                │
│   │  씬 7   │───►│  씬 8   │───►│  씬 9   │                                │
│   │ 안개문  │    │ 보스전  │    │  엔딩   │                                │
│   └─────────┘    └─────────┘    └─────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 트리거 시스템

### 3.1 트리거 타입 정의

```typescript
// src/content/types.ts

export type TriggerType =
  | 'VOLUME'           // 볼륨 진입/퇴장
  | 'INTERACT'         // 상호작용 (E 키)
  | 'PROXIMITY'        // 근접 (자동 발동)
  | 'CHECKPOINT'       // 체크포인트 전용
  | 'BOSS_ARENA';      // 보스 아레나 전용

export type TriggerActionType =
  | 'SPAWN_ENEMY'
  | 'SPAWN_BOSS'
  | 'PLAY_CUTSCENE'
  | 'DIALOGUE'
  | 'SCENE_TRANSITION'
  | 'SHOW_MESSAGE'
  | 'PLAY_SOUND'
  | 'ACTIVATE_CHECKPOINT'
  | 'LOCK_DOOR'
  | 'UNLOCK_DOOR'
  | 'FOG_GATE_ENTER'
  | 'BOSS_FIGHT_START'
  | 'BOSS_DEFEATED';

export interface TriggerDefinition {
  id: string;
  type: TriggerType;
  aabb: {
    min: [number, number, number];
    max: [number, number, number];
  };
  once: boolean;
  enabled: boolean;
  actions: TriggerAction[];
}

export interface TriggerAction {
  type: TriggerActionType;
  delay?: number;
  data?: Record<string, any>;
}
```

### 3.2 triggers.json 예시

```json
{
  "triggers": [
    {
      "id": "wake_up_trigger",
      "type": "INTERACT",
      "aabb": { "min": [-1, 0, -1], "max": [1, 2, 1] },
      "once": true,
      "enabled": true,
      "actions": [
        { "type": "DIALOGUE", "data": { "lineId": "player_start_wake" } },
        { "type": "SCENE_TRANSITION", "delay": 2.0, "data": { "targetScene": "scene_1_corridor" } }
      ]
    },
    {
      "id": "boss_reveal_trigger",
      "type": "VOLUME",
      "aabb": { "min": [-5, 0, 8], "max": [5, 5, 15] },
      "once": true,
      "enabled": true,
      "actions": [
        { "type": "SPAWN_BOSS", "data": { "bossId": "gate_warden", "at": [0, 0, 22] } },
        { "type": "PLAY_CUTSCENE", "data": { "cutsceneId": "boss_reveal" } },
        { "type": "DIALOGUE", "data": { "lineId": "boss_first_appear" } }
      ]
    },
    {
      "id": "checkpoint_bonfire",
      "type": "INTERACT",
      "aabb": { "min": [-1, 0, -1], "max": [1, 2, 1] },
      "once": false,
      "enabled": true,
      "actions": [
        { "type": "ACTIVATE_CHECKPOINT", "data": { "checkpointId": "cp_before_boss" } },
        { "type": "PLAY_SOUND", "data": { "soundId": "bonfire_ignite" } }
      ]
    },
    {
      "id": "fog_gate_entrance",
      "type": "INTERACT",
      "aabb": { "min": [-2, 0, -1], "max": [2, 4, 1] },
      "once": false,
      "enabled": true,
      "actions": [
        { "type": "FOG_GATE_ENTER", "data": { "targetScene": "scene_8_boss_fight" } },
        { "type": "PLAY_SOUND", "data": { "soundId": "fog_gate_enter" } }
      ]
    },
    {
      "id": "boss_arena_lock",
      "type": "VOLUME",
      "aabb": { "min": [-3, 0, 5], "max": [3, 5, 8] },
      "once": true,
      "enabled": true,
      "actions": [
        { "type": "LOCK_DOOR", "data": { "doorId": "boss_entrance" } },
        { "type": "BOSS_FIGHT_START", "data": { "bossId": "gate_warden" } },
        { "type": "PLAY_CUTSCENE", "data": { "cutsceneId": "boss_intro" } }
      ]
    }
  ]
}
```

### 3.3 TriggerSystem 구현

```typescript
// src/content/TriggerSystem.ts

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TriggerDefinition, TriggerAction } from './types';
import { EventBus } from '../core/EventBus';

interface ActiveTrigger {
  definition: TriggerDefinition;
  collider: RAPIER.Collider;
  hasTriggered: boolean;
  isPlayerInside: boolean;
}

export class TriggerSystem {
  private world: RAPIER.World;
  private triggers: Map<string, ActiveTrigger> = new Map();
  private triggerDefinitions: Map<string, TriggerDefinition> = new Map();

  constructor(world: RAPIER.World) {
    this.world = world;
  }

  async loadTriggerData(triggersJsonPath: string): Promise<void> {
    const response = await fetch(triggersJsonPath);
    const data = await response.json();

    for (const triggerDef of data.triggers) {
      this.triggerDefinitions.set(triggerDef.id, triggerDef);
    }
  }

  activateTrigger(triggerId: string): void {
    const definition = this.triggerDefinitions.get(triggerId);
    if (!definition || this.triggers.has(triggerId)) return;

    const min = definition.aabb.min;
    const max = definition.aabb.max;
    const halfExtents = [
      (max[0] - min[0]) / 2,
      (max[1] - min[1]) / 2,
      (max[2] - min[2]) / 2,
    ];
    const center = [
      (max[0] + min[0]) / 2,
      (max[1] + min[1]) / 2,
      (max[2] + min[2]) / 2,
    ];

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents[0], halfExtents[1], halfExtents[2]
    )
      .setTranslation(center[0], center[1], center[2])
      .setSensor(true);

    const collider = this.world.createCollider(colliderDesc);

    this.triggers.set(triggerId, {
      definition,
      collider,
      hasTriggered: false,
      isPlayerInside: false,
    });
  }

  deactivateTrigger(triggerId: string): void {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      this.world.removeCollider(trigger.collider, false);
      this.triggers.delete(triggerId);
    }
  }

  deactivateAllTriggers(): void {
    for (const triggerId of this.triggers.keys()) {
      this.deactivateTrigger(triggerId);
    }
  }

  update(playerPosition: THREE.Vector3): void {
    for (const [triggerId, trigger] of this.triggers) {
      if (trigger.definition.once && trigger.hasTriggered) continue;

      const isInside = this.isPointInAABB(playerPosition, trigger.definition.aabb);

      if (isInside && !trigger.isPlayerInside) {
        trigger.isPlayerInside = true;
        this.onTriggerEnter(trigger);
      } else if (!isInside && trigger.isPlayerInside) {
        trigger.isPlayerInside = false;
        this.onTriggerExit(trigger);
      }
    }
  }

  private isPointInAABB(
    point: THREE.Vector3,
    aabb: { min: [number, number, number]; max: [number, number, number] }
  ): boolean {
    return (
      point.x >= aabb.min[0] && point.x <= aabb.max[0] &&
      point.y >= aabb.min[1] && point.y <= aabb.max[1] &&
      point.z >= aabb.min[2] && point.z <= aabb.max[2]
    );
  }

  private onTriggerEnter(trigger: ActiveTrigger): void {
    const def = trigger.definition;

    if (def.type === 'VOLUME' || def.type === 'PROXIMITY') {
      this.executeTriggerActions(trigger);
    }

    if (def.type === 'INTERACT') {
      EventBus.emit('ui:show_interact_prompt', { triggerId: def.id });
    }

    EventBus.emit('trigger:entered', { triggerId: def.id });
  }

  private onTriggerExit(trigger: ActiveTrigger): void {
    if (trigger.definition.type === 'INTERACT') {
      EventBus.emit('ui:hide_interact_prompt', { triggerId: trigger.definition.id });
    }
    EventBus.emit('trigger:exited', { triggerId: trigger.definition.id });
  }

  interactWithTrigger(triggerId: string): void {
    const trigger = this.triggers.get(triggerId);
    if (!trigger || trigger.definition.type !== 'INTERACT' || !trigger.isPlayerInside) return;
    this.executeTriggerActions(trigger);
  }

  private executeTriggerActions(trigger: ActiveTrigger): void {
    if (trigger.definition.once && trigger.hasTriggered) return;
    trigger.hasTriggered = true;

    for (const action of trigger.definition.actions) {
      if (action.delay && action.delay > 0) {
        setTimeout(() => this.executeAction(action), action.delay * 1000);
      } else {
        this.executeAction(action);
      }
    }
  }

  private executeAction(action: TriggerAction): void {
    switch (action.type) {
      case 'SPAWN_BOSS':
        EventBus.emit('boss:spawn', action.data);
        break;
      case 'DIALOGUE':
        EventBus.emit('dialogue:play', action.data);
        break;
      case 'SCENE_TRANSITION':
        EventBus.emit('trigger:scene_transition', action.data);
        break;
      case 'ACTIVATE_CHECKPOINT':
        EventBus.emit('checkpoint:activate', action.data);
        break;
      case 'FOG_GATE_ENTER':
        EventBus.emit('boss:fog_gate_enter', action.data);
        break;
      case 'BOSS_FIGHT_START':
        EventBus.emit('boss:fight_start', action.data);
        break;
      case 'PLAY_SOUND':
        EventBus.emit('audio:play', action.data);
        break;
      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  }
}
```

---

## 4. 체크포인트 시스템 (모닥불)

### 4.1 체크포인트 정의

```typescript
// src/content/types.ts

export interface CheckpointDefinition {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  sceneId: SceneId;
  healOnActivate: boolean;
  refillFlask: boolean;
  respawnEnemies: boolean;
}
```

### 4.2 checkpoints.json

```json
{
  "checkpoints": [
    {
      "id": "cp_start",
      "name": "감옥 시작점",
      "position": { "x": 0, "y": 0.1, "z": 0 },
      "rotation": 0,
      "sceneId": "scene_0_prison",
      "healOnActivate": true,
      "refillFlask": true,
      "respawnEnemies": false
    },
    {
      "id": "cp_before_boss",
      "name": "보스 앞 모닥불",
      "position": { "x": 0, "y": 0.1, "z": 0 },
      "rotation": 0,
      "sceneId": "scene_6_checkpoint",
      "healOnActivate": true,
      "refillFlask": true,
      "respawnEnemies": true
    }
  ]
}
```

### 4.3 CheckpointSystem 구현

```typescript
// src/content/CheckpointSystem.ts

import * as THREE from 'three';
import { CheckpointDefinition, SceneId } from './types';
import { EventBus } from '../core/EventBus';

export class CheckpointSystem {
  private checkpoints: Map<string, CheckpointDefinition> = new Map();
  private activeCheckpointId: string | null = null;
  private activatedCheckpoints: Set<string> = new Set();

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    EventBus.on('checkpoint:activate', (data: { checkpointId: string }) => {
      this.activateCheckpoint(data.checkpointId);
    });
  }

  async loadCheckpointData(checkpointsJsonPath: string): Promise<void> {
    const response = await fetch(checkpointsJsonPath);
    const data = await response.json();

    for (const cpDef of data.checkpoints) {
      this.checkpoints.set(cpDef.id, cpDef);
    }
  }

  activateCheckpoint(checkpointId: string): void {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return;

    const isFirstActivation = !this.activatedCheckpoints.has(checkpointId);

    this.activeCheckpointId = checkpointId;
    this.activatedCheckpoints.add(checkpointId);

    // HP/스태미나 회복 (PRD 섹션 12)
    if (checkpoint.healOnActivate) {
      EventBus.emit('player:heal_full');
      EventBus.emit('player:stamina_full');
    }

    // 플라스크 리필
    if (checkpoint.refillFlask) {
      EventBus.emit('player:refill_flask');
    }

    // 적 리스폰
    if (checkpoint.respawnEnemies) {
      EventBus.emit('enemy:respawn_all');
    }

    EventBus.emit('checkpoint:activated', { checkpointId, isFirstActivation, checkpoint });

    if (isFirstActivation) {
      EventBus.emit('dialogue:play', { lineId: 'bonfire_first_activate' });
    }
  }

  getRespawnData(): { position: THREE.Vector3; sceneId: SceneId } | null {
    if (!this.activeCheckpointId) return null;

    const checkpoint = this.checkpoints.get(this.activeCheckpointId);
    if (!checkpoint) return null;

    return {
      position: new THREE.Vector3(
        checkpoint.position.x,
        checkpoint.position.y,
        checkpoint.position.z
      ),
      sceneId: checkpoint.sceneId as SceneId,
    };
  }
}
```

---

## 5. 사망/리스폰 시스템

### 5.1 리스폰 흐름 (PRD 섹션 12 기반)

```
플레이어 사망
    │
    ▼
화면 페이드 아웃 (0.5초)
    │
    ▼
"YOU DIED" UI 표시 (2초)
    │
    ▼
체크포인트 씬으로 전환
    │
    ▼
플레이어 위치 이동
    │
    ▼
HP/스태미나 회복
    │
    ▼
보스 상태 리셋 (보스전 중이었다면)
    │
    ▼
화면 페이드 인 (0.5초)
    │
    ▼
짧은 무적 시간 (1-2초)
```

### 5.2 RespawnSystem 구현

```typescript
// src/content/RespawnSystem.ts

import * as THREE from 'three';
import { CheckpointSystem } from './CheckpointSystem';
import { SceneManager } from './SceneManager';
import { FadeTransition } from '../utils/FadeTransition';
import { EventBus } from '../core/EventBus';

export interface RespawnConfig {
  fadeOutDuration: number;
  deathScreenDuration: number;
  fadeInDuration: number;
  invincibilityDuration: number;
}

const DEFAULT_RESPAWN_CONFIG: RespawnConfig = {
  fadeOutDuration: 0.5,
  deathScreenDuration: 2.0,
  fadeInDuration: 0.5,
  invincibilityDuration: 1.5,
};

export class RespawnSystem {
  private checkpointSystem: CheckpointSystem;
  private sceneManager: SceneManager;
  private fadeTransition: FadeTransition;
  private config: RespawnConfig;

  private isRespawning: boolean = false;
  private wasInBossFight: boolean = false;

  constructor(
    checkpointSystem: CheckpointSystem,
    sceneManager: SceneManager,
    config: Partial<RespawnConfig> = {}
  ) {
    this.checkpointSystem = checkpointSystem;
    this.sceneManager = sceneManager;
    this.fadeTransition = new FadeTransition();
    this.config = { ...DEFAULT_RESPAWN_CONFIG, ...config };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    EventBus.