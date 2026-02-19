# 핵심 시스템(Core Systems) 구현 계획서

## 문서 정보
- **작성일**: 2026-02-18
- **작성 기준**: PRD.md 섹션 3, 11, 14
- **현재 프로젝트 상태**: 타이틀 화면 구현 완료 (Three.js + Rapier 기본 연동)

---

## 1. 프로젝트 구조 및 모듈 분해

### 1.1 현재 구조 분석

현재 프로젝트는 타이틀 화면 중심의 단순 구조입니다.

```
src/
├── main.ts              # 엔트리 포인트
├── core/
│   ├── Scene.ts         # 씬/조명/바닥
│   ├── Camera.ts        # 패럴랙스 카메라 (고정 시점)
│   └── Audio.ts         # 오디오 시스템
├── effects/
│   ├── Particles.ts     # 불티 파티클
│   └── PostProcessing.ts # Bloom 후처리
├── physics/
│   └── Physics.ts       # Rapier 기본 설정 (재 조각만)
└── ui/
    └── Menu.ts          # 메뉴 UI
```

### 1.2 목표 구조 (PRD 섹션 3.3 기반)

```
src/
├── main.ts                      # 엔트리 포인트
├── Game.ts                      # 게임 인스턴스 (싱글톤)
│
├── core/                        # 핵심 시스템
│   ├── GameLoop.ts              # 게임 루프 및 시간 관리
│   ├── Time.ts                  # 델타/고정스텝 시간 관리
│   ├── SceneManager.ts          # 씬 전환/관리
│   ├── ResourceLoader.ts        # 에셋 로더 (GLB/텍스처/오디오)
│   ├── EventBus.ts              # 전역 이벤트 버스
│   └── types.ts                 # 공용 타입 정의
│
├── input/                       # 입력 시스템
│   ├── InputManager.ts          # 키보드/마우스 통합 관리
│   ├── InputBuffer.ts           # 입력 버퍼 (선입력)
│   ├── InputPresets.ts          # 키 프리셋 (레거시/현대적)
│   └── PointerLockController.ts # Pointer Lock API 래퍼
│
├── physics/                     # 물리/충돌 시스템
│   ├── PhysicsWorld.ts          # Rapier 월드 관리
│   ├── CharacterController.ts   # KCC (Kinematic Character Controller)
│   ├── CollisionGroups.ts       # 충돌 그룹/레이어 정의
│   ├── RaycastSystem.ts         # 레이캐스트/스윕 유틸
│   └── HitboxSystem.ts          # 히트박스/허트박스 관리
│
├── render/                      # 렌더링 시스템
│   ├── RenderSystem.ts          # Three.js 씬/렌더러
│   ├── ThirdPersonCamera.ts     # 3인칭 추적 카메라
│   ├── CameraCollision.ts       # 카메라 벽 충돌
│   ├── LightingSystem.ts        # 조명 관리
│   ├── PostProcessing.ts        # 후처리 효과
│   └── DebugRenderer.ts         # 디버그 드로우 (콜라이더 시각화)
│
├── animation/                   # 애니메이션 시스템
│   ├── AnimationController.ts   # AnimationMixer 래퍼
│   ├── AnimationStateMachine.ts # FSM 기반 애니메이션 전이
│   ├── AnimationBlender.ts      # 애니메이션 블렌딩
│   └── RootMotionHandler.ts     # 루트 모션 처리
│
├── combat/                      # 전투 시스템 (별도 계획서)
├── ai/                          # AI 시스템 (별도 계획서)
├── ui/                          # UI 시스템 (별도 계획서)
│
├── content/                     # 데이터 드리븐 콘텐츠
│   ├── data/
│   │   ├── dialogue.json        # 대사 데이터
│   │   ├── triggers.json        # 레벨 트리거
│   │   └── balance.json         # 밸런스 파라미터
│   └── ContentLoader.ts         # JSON 데이터 로더
│
└── utils/                       # 유틸리티
    ├── math.ts                  # 수학 헬퍼
    ├── debug.ts                 # 디버그 유틸
    └── constants.ts             # 전역 상수
```

### 1.3 모듈 의존성 다이어그램

```
                    ┌─────────────┐
                    │   main.ts   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Game.ts   │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
│   GameLoop    │  │ SceneManager  │  │ ResourceLoader│
└───────┬───────┘  └───────┬───────┘  └───────────────┘
        │                  │
        │          ┌───────┴───────┐
        │          │               │
┌───────▼───────┐  │       ┌───────▼───────┐
│     Time      │  │       │   EventBus    │
└───────────────┘  │       └───────────────┘
                   │                ▲
        ┌──────────┴──────────┐     │ (이벤트 구독)
        │                     │     │
┌───────▼───────┐     ┌───────▼─────┴─┐
│ PhysicsWorld  │     │ RenderSystem  │
└───────┬───────┘     └───────┬───────┘
        │                     │
┌───────▼───────┐     ┌───────▼───────┐
│CharController │     │ThirdPersonCam │
└───────────────┘     └───────────────┘
```

---

## 2. 기술 스택 상세

### 2.1 핵심 의존성 (현재 package.json 기반)

```json
{
  "dependencies": {
    "@dimforge/rapier3d-compat": "^0.19.3",
    "three": "^0.182.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/three": "^0.182.0",
    "vite": "^7.3.1"
  }
}
```

### 2.2 추가 권장 의존성

```json
{
  "dependencies": {
    "howler": "^2.2.4"           // 크로스브라우저 오디오 (선택)
  },
  "devDependencies": {
    "@types/howler": "^2.2.12"
  }
}
```

### 2.3 Three.js 핵심 모듈

```typescript
// 렌더링
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// 후처리
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
```

### 2.4 Rapier 핵심 모듈

```typescript
import RAPIER from '@dimforge/rapier3d-compat';

// 핵심 클래스
// - RAPIER.World: 물리 월드
// - RAPIER.RigidBodyDesc: 리지드바디 설명자
// - RAPIER.ColliderDesc: 콜라이더 설명자
// - RAPIER.KinematicCharacterController: 캐릭터 컨트롤러
// - RAPIER.QueryFilterFlags: 쿼리 필터
```

### 2.5 Vite 설정

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']  // WASM 번들링 제외
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          rapier: ['@dimforge/rapier3d-compat']
        }
      }
    }
  },
  assetsInclude: ['**/*.glb', '**/*.hdr', '**/*.ktx2']
});
```

---

## 3. 게임 루프 및 시간 관리

### 3.1 설계 원칙

Soulslike 게임은 **물리 기반 전투**가 핵심이므로, 물리 시뮬레이션은 **고정 타임스텝(Fixed Timestep)**으로 실행하고, 렌더링은 **가변 프레임레이트**로 동작해야 합니다.

### 3.2 Time.ts 인터페이스

```typescript
// src/core/Time.ts

export interface TimeState {
  // 프레임 시간
  deltaTime: number;           // 이전 프레임 이후 경과 시간 (초)
  unscaledDeltaTime: number;   // timeScale 미적용 델타

  // 누적 시간
  time: number;                // 게임 시작 후 총 경과 시간
  unscaledTime: number;        // timeScale 미적용 누적 시간

  // 프레임 정보
  frameCount: number;          // 총 프레임 수

  // 타임 스케일
  timeScale: number;           // 1.0 = 정상, 0.5 = 슬로우모션

  // 고정 타임스텝 (물리용)
  fixedDeltaTime: number;      // 고정 물리 스텝 (기본: 1/60)
  fixedTime: number;           // 고정 스텝 누적 시간
}

export class Time {
  private static state: TimeState = {
    deltaTime: 0,
    unscaledDeltaTime: 0,
    time: 0,
    unscaledTime: 0,
    frameCount: 0,
    timeScale: 1.0,
    fixedDeltaTime: 1 / 60,    // 60Hz 물리
    fixedTime: 0
  };

  private static lastTime: number = 0;
  private static accumulator: number = 0;
  private static maxDeltaTime: number = 0.1;  // 최대 델타 (끊김 방지)

  static get delta(): number { return this.state.deltaTime; }
  static get fixedDelta(): number { return this.state.fixedDeltaTime; }
  static get elapsed(): number { return this.state.time; }
  static get frame(): number { return this.state.frameCount; }
  static get scale(): number { return this.state.timeScale; }

  static setTimeScale(scale: number): void {
    this.state.timeScale = Math.max(0, Math.min(2, scale));
  }

  static update(currentTime: number): void {
    const rawDelta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.state.unscaledDeltaTime = Math.min(rawDelta, this.maxDeltaTime);
    this.state.deltaTime = this.state.unscaledDeltaTime * this.state.timeScale;

    this.state.unscaledTime += this.state.unscaledDeltaTime;
    this.state.time += this.state.deltaTime;
    this.state.frameCount++;

    this.accumulator += this.state.deltaTime;
  }

  static consumeFixedStep(): boolean {
    if (this.accumulator >= this.state.fixedDeltaTime) {
      this.accumulator -= this.state.fixedDeltaTime;
      this.state.fixedTime += this.state.fixedDeltaTime;
      return true;
    }
    return false;
  }

  static getInterpolationAlpha(): number {
    return this.accumulator / this.state.fixedDeltaTime;
  }
}
```

### 3.3 GameLoop.ts 구현

```typescript
// src/core/GameLoop.ts

import { Time } from './Time';
import { EventBus } from './EventBus';

export type UpdateCallback = (deltaTime: number) => void;
export type FixedUpdateCallback = (fixedDeltaTime: number) => void;
export type RenderCallback = (interpolationAlpha: number) => void;

export class GameLoop {
  private isRunning: boolean = false;
  private rafId: number = 0;

  private updateCallbacks: UpdateCallback[] = [];
  private fixedUpdateCallbacks: FixedUpdateCallback[] = [];
  private lateUpdateCallbacks: UpdateCallback[] = [];
  private renderCallbacks: RenderCallback[] = [];

  private maxFixedStepsPerFrame: number = 5;  // 프레임당 최대 물리 스텝

  constructor() {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.rafId = requestAnimationFrame(this.loop.bind(this));
    EventBus.emit('game:started');
  }

  stop(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
    EventBus.emit('game:stopped');
  }

  private loop(currentTime: number): void {
    if (!this.isRunning) return;

    // 시간 업데이트
    Time.update(currentTime);
    const delta = Time.delta;

    // 1. Update (매 프레임 - 입력, AI, 애니메이션)
    for (const callback of this.updateCallbacks) {
      callback(delta);
    }

    // 2. Fixed Update (고정 타임스텝 - 물리)
    let fixedSteps = 0;
    while (Time.consumeFixedStep() && fixedSteps < this.maxFixedStepsPerFrame) {
      for (const callback of this.fixedUpdateCallbacks) {
        callback(Time.fixedDelta);
      }
      fixedSteps++;
    }

    // 3. Late Update (모든 업데이트 후 - 카메라)
    for (const callback of this.lateUpdateCallbacks) {
      callback(delta);
    }

    // 4. Render (보간 알파 전달)
    const alpha = Time.getInterpolationAlpha();
    for (const callback of this.renderCallbacks) {
      callback(alpha);
    }

    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

  onUpdate(callback: UpdateCallback): void {
    this.updateCallbacks.push(callback);
  }

  onFixedUpdate(callback: FixedUpdateCallback): void {
    this.fixedUpdateCallbacks.push(callback);
  }

  onLateUpdate(callback: UpdateCallback): void {
    this.lateUpdateCallbacks.push(callback);
  }

  onRender(callback: RenderCallback): void {
    this.renderCallbacks.push(callback);
  }
}
```

### 3.4 Game.ts (통합 진입점)

```typescript
// src/Game.ts

import { GameLoop } from './core/GameLoop';
import { EventBus } from './core/EventBus';
import { ResourceLoader } from './core/ResourceLoader';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { RenderSystem } from './render/RenderSystem';
import { InputManager } from './input/InputManager';
import { ThirdPersonCamera } from './render/ThirdPersonCamera';

export class Game {
  private static instance: Game;

  readonly loop: GameLoop;
  readonly resources: ResourceLoader;
  readonly physics: PhysicsWorld;
  readonly render: RenderSystem;
  readonly input: InputManager;

  private constructor() {
    this.loop = new GameLoop();
    this.resources = new ResourceLoader();
    this.physics = new PhysicsWorld();
    this.render = new RenderSystem();
    this.input = new InputManager();
  }

  static getInstance(): Game {
    if (!Game.instance) {
      Game.instance = new Game();
    }
    return Game.instance;
  }

  async initialize(container: HTMLElement): Promise<void> {
    // 1. 물리 엔진 초기화 (WASM 로드)
    await this.physics.initialize();

    // 2. 렌더러 초기화
    await this.render.initialize(container);

    // 3. 입력 시스템 초기화
    this.input.initialize(container);

    // 4. 게임 루프 콜백 등록
    this.loop.onUpdate(this.update.bind(this));
    this.loop.onFixedUpdate(this.fixedUpdate.bind(this));
    this.loop.onLateUpdate(this.lateUpdate.bind(this));
    this.loop.onRender(this.render.render.bind(this.render));

    EventBus.emit('game:initialized');
  }

  private update(delta: number): void {
    this.input.update();
    // 애니메이션, AI 등
  }

  private fixedUpdate(fixedDelta: number): void {
    this.physics.step(fixedDelta);
  }

  private lateUpdate(delta: number): void {
    // 카메라 업데이트
  }

  start(): void {
    this.loop.start();
  }
}
```

---

## 4. 리소스 로더 및 에셋 파이프라인

### 4.1 ResourceLoader.ts 인터페이스

```typescript
// src/core/ResourceLoader.ts

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EventBus } from './EventBus';

export interface LoadProgress {
  loaded: number;
  total: number;
  percentage: number;
  currentAsset: string;
}

export interface AssetManifest {
  models: Record<string, string>;      // name -> path
  textures: Record<string, string>;
  hdri: Record<string, string>;
  audio: Record<string, string>;
}

export class ResourceLoader {
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  private rgbeLoader: RGBELoader;
  private textureLoader: THREE.TextureLoader;
  private audioLoader: THREE.AudioLoader;

  private cache: {
    models: Map<string, GLTF>;
    textures: Map<string, THREE.Texture>;
    hdri: Map<string, THREE.DataTexture>;
    audio: Map<string, AudioBuffer>;
  };

  constructor() {
    // DRACO 압축 지원
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('/draco/');

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    this.rgbeLoader = new RGBELoader();
    this.textureLoader = new THREE.TextureLoader();
    this.audioLoader = new THREE.AudioLoader();

    this.cache = {
      models: new Map(),
      textures: new Map(),
      hdri: new Map(),
      audio: new Map()
    };
  }

  async loadManifest(manifest: AssetManifest): Promise<void> {
    const allAssets: Array<{ type: string; name: string; path: string }> = [];

    for (const [name, path] of Object.entries(manifest.models)) {
      allAssets.push({ type: 'model', name, path });
    }
    for (const [name, path] of Object.entries(manifest.textures)) {
      allAssets.push({ type: 'texture', name, path });
    }
    for (const [name, path] of Object.entries(manifest.hdri)) {
      allAssets.push({ type: 'hdri', name, path });
    }
    for (const [name, path] of Object.entries(manifest.audio)) {
      allAssets.push({ type: 'audio', name, path });
    }

    let loaded = 0;
    const total = allAssets.length;

    for (const asset of allAssets) {
      EventBus.emit('loading:progress', {
        loaded,
        total,
        percentage: (loaded / total) * 100,
        currentAsset: asset.name
      } as LoadProgress);

      switch (asset.type) {
        case 'model':
          await this.loadModel(asset.name, asset.path);
          break;
        case 'texture':
          await this.loadTexture(asset.name, asset.path);
          break;
        case 'hdri':
          await this.loadHDRI(asset.name, asset.path);
          break;
        case 'audio':
          await this.loadAudio(asset.name, asset.path);
          break;
      }
      loaded++;
    }

    EventBus.emit('loading:complete');
  }

  async loadModel(name: string, path: string): Promise<GLTF> {
    if (this.cache.models.has(name)) {
      return this.cache.models.get(name)!;
    }

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf) => {
          this.cache.models.set(name, gltf);
          resolve(gltf);
        },
        undefined,
        reject
      );
    });
  }

  async loadTexture(name: string, path: string): Promise<THREE.Texture> {
    if (this.cache.textures.has(name)) {
      return this.cache.textures.get(name)!;
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          this.cache.textures.set(name, texture);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  async loadHDRI(name: string, path: string): Promise<THREE.DataTexture> {
    if (this.cache.hdri.has(name)) {
      return this.cache.hdri.get(name)!;
    }

    return new Promise((resolve, reject) => {
      this.rgbeLoader.load(
        path,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.cache.hdri.set(name, texture);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  async loadAudio(name: string, path: string): Promise<AudioBuffer> {
    if (this.cache.audio.has(name)) {
      return this.cache.audio.get(name)!;
    }

    return new Promise((resolve, reject) => {
      this.audioLoader.load(
        path,
        (buffer) => {
          this.cache.audio.set(name, buffer);
          resolve(buffer);
        },
        undefined,
        reject
      );
    });
  }

  getModel(name: string): GLTF | undefined {
    return this.cache.models.get(name);
  }

  getTexture(name: string): THREE.Texture | undefined {
    return this.cache.textures.get(name);
  }

  getHDRI(name: string): THREE.DataTexture | undefined {
    return this.cache.hdri.get(name);
  }

  getAudio(name: string): AudioBuffer | undefined {
    return this.cache.audio.get(name);
  }

  dispose(): void {
    // 텍스처 해제
    for (const texture of this.cache.textures.values()) {
      texture.dispose();
    }
    for (const hdri of this.cache.hdri.values()) {
      hdri.dispose();
    }
    this.dracoLoader.dispose();
  }
}
```

### 4.2 에셋 매니페스트 예시

```typescript
// src/content/assetManifest.ts

import type { AssetManifest } from '../core/ResourceLoader';

export const GAME_ASSETS: AssetManifest = {
  models: {
    'player': '/assets/models/knight.glb',
    'zombie': '/assets/models/zombie.glb',
    'boss': '/assets/models/demon.glb',
    'dungeon_floor': '/assets/models/dungeon_floor.glb',
    'dungeon_wall': '/assets/models/dungeon_wall.glb',
  },
  textures: {
    'ground_diffuse': '/assets/textures/burned_ground/burned_ground_01_diff_1k.jpg',
    'ground_normal': '/assets/textures/burned_ground/burned_ground_01_nor_gl_1k.jpg',
    'ground_roughness': '/assets/textures/burned_ground/burned_ground_01_rough_1k.jpg',
  },
  hdri: {
    'dungeon_env': '/assets/hdri/kloppenheim_02_1k.hdr',
  },
  audio: {
    'footstep': '/assets/audio/footstep.mp3',
    'sword_swing': '/assets/audio/sword_swing.mp3',
    'hit_impact': '/assets/audio/hit_impact.mp3',
  }
};
```

### 4.3 GLB 에셋 규칙 (PRD 섹션 11 기반)

```
에셋 파이프라인 가이드라인:

1. 포맷
   - 모든 3D 모델: GLB (glTF binary)
   - 텍스처: JPG/PNG (1K~2K), KTX2 압축 권장
   - 오디오: MP3/OGG

2. 애니메이션 클립 이름 규칙 (주인공/보스)
   - Idle
   - Walk, Run, Sprint
   - Roll_Forward, Roll_Back, Roll_Left, Roll_Right, Backstep
   - Attack_Light_1, Attack_Light_2, Attack_Light_3
   - Attack_Heavy_1, Attack_Heavy_2
   - Guard_Start, Guard_Loop, Guard_End
   - Hit_Front, Hit_Back
   - Death
   - (보스) Attack_Slam, Attack_Sweep, Attack_Jump

3. 스케일 (1 unit = 1m)
   - 플레이어 높이: 1.7~1.8m
   - 보스 높이: 3~4m
   - 문 폭: 1.2m, 높이: 2.2m

4. 콜라이더 분리
   - 렌더 메시와 콜라이더 메시 별도 제작
   - 복잡한 메시 대신 박스/캡슐 사용
```

---

## 5. 이벤트 버스 시스템

### 5.1 EventBus.ts 구현

```typescript
// src/core/EventBus.ts

export type EventCallback<T = any> = (data: T) => void;

interface EventSubscription {
  callback: EventCallback;
  once: boolean;
}

class EventBusClass {
  private events: Map<string, EventSubscription[]> = new Map();

  on<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const subscription: EventSubscription = { callback, once: false };
    this.events.get(event)!.push(subscription);

    // 구독 해제 함수 반환
    return () => this.off(event, callback);
  }

  once<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const subscription: EventSubscription = { callback, once: true };
    this.events.get(event)!.push(subscription);

    return () => this.off(event, callback);
  }

  off<T = any>(event: string, callback: EventCallback<T>): void {
    const subs = this.events.get(event);
    if (!subs) return;

    const index = subs.findIndex(sub => sub.callback === callback);
    if (index !== -1) {
      subs.splice(index, 1);
    }
  }

  emit<T = any>(event: string, data?: T): void {
    const subs = this.events.get(event);
    if (!subs) return;

    // once 구독자 분리
    const toRemove: EventSubscription[] = [];

    for (const sub of subs) {
      sub.callback(data);
      if (sub.once) {
        toRemove.push(sub);
      }
    }

    // once 구독자 제거
    for (const sub of toRemove) {
      const index = subs.indexOf(sub);
      if (index !== -1) {
        subs.splice(index, 1);
      }
    }
  }

  clear(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

// 싱글톤 인스턴스
export const EventBus = new EventBusClass();
```

### 5.2 이벤트 타입 정의

```typescript
// src/core/types.ts

// 게임 라이프사이클 이벤트
export interface GameEvents {
  'game:initialized': void;
  'game:started': void;
  'game:stopped': void;
  'game:paused': void;
  'game:resumed': void;
}

// 로딩 이벤트
export interface LoadingEvents {
  'loading:progress': LoadProgress;
  'loading:complete': void;
  'loading:error': Error;
}

// 입력 이벤트
export interface InputEvents {
  'input:attack_light': void;
  'input:attack_heavy': void;
  'input:roll': void;
  'input:guard_start': void;
  'input:guard_end': void;
  'input:interact': void;
  'input:lock_on': void;
}

// 플레이어 이벤트
export interface PlayerEvents {
  'player:damaged': { amount: number; source: string };
  'player:died': void;
  'player:respawned': void;
  'player:stamina_depleted': void;
}

// 전투 이벤트
export interface CombatEvents {
  'combat:hit': { attacker: string; target: string; damage: number };
  'combat:parry': { defender: string; attacker: string };
  'combat:guard_break': { target: string };
}

// 트리거 이벤트
export interface TriggerEvents {
  'trigger:entered': { triggerId: string; entity: string };
  'trigger:exited': { triggerId: string; entity: string };
}
```

### 5.3 사용 예시

```typescript
// 이벤트 구독
const unsubscribe = EventBus.on('player:damaged', (data) => {
  console.log(`Player took ${data.amount} damage from ${data.source}`);
  updateHealthUI(data.amount);
});

// 일회성 이벤트
EventBus.once('game:initialized', () => {
  showStartScreen();
});

// 이벤트 발행
EventBus.emit('player:damaged', { amount: 20, source: 'zombie_01' });

// 구독 해제
unsubscribe();
```

---

## 6. 3인칭 카메라 시스템

### 6.1 요구사항 (PRD 기반)

| 항목 | 권장 값 |
|------|---------|
| 카메라 거리 | 기본 4.0~5.5m, 벽 충돌 시 자동 줌인 |
| 락온 거리 | 8~12m (보스는 15m) |
| 회전 속도 | 마우스 감도 조절 가능 |
| 벽 충돌 | 레이캐스트로 감지, 즉시 줌인 |

### 6.2 ThirdPersonCamera.ts 구현

```typescript
// src/render/ThirdPersonCamera.ts

import * as THREE from 'three';
import { EventBus } from '../core/EventBus';

export interface CameraConfig {
  // 기본 설정
  defaultDistance: number;      // 기본 거리 (4.5m)
  minDistance: number;          // 최소 거리 (1.5m)
  maxDistance: number;          // 최대 거리 (8.0m)

  // 높이/오프셋
  heightOffset: number;         // 타겟 위 높이 (1.6m - 어깨 높이)
  horizontalOffset: number;     // 좌우 오프셋 (0 = 중앙)

  // 회전 제한
  minPitch: number;             // 최소 피치 (-60도)
  maxPitch: number;             // 최대 피치 (60도)

  // 감도
  sensitivity: number;          // 마우스 감도 (0.002)
  smoothing: number;            // 카메라 스무딩 (0.1)

  // 충돌
  collisionRadius: number;      // 충돌 검사 반경 (0.3m)
  collisionLayers: number;      // 충돌 레이어 마스크
}

export class ThirdPersonCamera {
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Object3D | null = null;

  private config: CameraConfig;

  // 카메라 상태
  private currentDistance: number;
  private targetDistance: number;
  private yaw: number = 0;        // 수평 회전 (라디안)
  private pitch: number = 0;      // 수직 회전 (라디안)

  // 락온 상태
  private lockOnTarget: THREE.Object3D | null = null;
  private isLockedOn: boolean = false;

  // 임시 벡터 (GC 방지)
  private tempVec3 = new THREE.Vector3();
  private idealPosition = new THREE.Vector3();
  private currentPosition = new THREE.Vector3();

  // 레이캐스터 (충돌 검사)
  private raycaster = new THREE.Raycaster();

  constructor(camera: THREE.PerspectiveCamera, config?: Partial<CameraConfig>) {
    this.camera = camera;

    this.config = {
      defaultDistance: 4.5,
      minDistance: 1.5,
      maxDistance: 8.0,
      heightOffset: 1.6,
      horizontalOffset: 0,
      minPitch: -Math.PI / 3,    // -60도
      maxPitch: Math.PI / 3,      // 60도
      sensitivity: 0.002,
      smoothing: 0.1,
      collisionRadius: 0.3,
      collisionLayers: 0xFFFF,
      ...config
    };

    this.currentDistance = this.config.defaultDistance;
    this.targetDistance = this.config.defaultDistance;

    // 입력 이벤트 구독
    EventBus.on('input:lock_on', this.toggleLockOn.bind(this));
  }

  setTarget(target: THREE.Object3D): void {
    this.target = target;
  }

  handleMouseMove(deltaX: number, deltaY: number): void {
    if (this.isLockedOn) return;  // 락온 중에는 수동 회전 비활성화

    this.yaw -= deltaX * this.config.sensitivity;
    this.pitch -= deltaY * this.config.sensitivity;

    // 피치 제한
    this.pitch = Math.max(this.config.minPitch,
                          Math.min(this.config.maxPitch, this.pitch));
  }

  update(deltaTime: number, colliders?: THREE.Object3D[]): void {
    if (!this.target) return;

    // 타겟 위치 계산
    const targetPosition = this.tempVec3.copy(this.target.position);
    targetPosition.y += this.config.heightOffset;

    if (this.isLockedOn && this.lockOnTarget) {
      this.updateLockedOnCamera(targetPosition, deltaTime);
    } else {
      this.updateFreeCamera(targetPosition, deltaTime);
    }

    // 벽 충돌 검사
    if (colliders && colliders.length > 0) {
      this.handleCollision(targetPosition, colliders);
    }

    // 카메라 위치 스무딩
    this.currentPosition.lerp(this.idealPosition, this.config.smoothing);
    this.camera.position.copy(this.currentPosition);

    // 카메라가 타겟을 바라보도록
    if (this.isLockedOn && this.lockOnTarget) {
      // 락온 타겟과 플레이어 사이를 바라봄
      const lookAtPoint = this.tempVec3.copy(this.lockOnTarget.position);
      lookAtPoint.y += 1.2;  // 적의 가슴 높이
      this.camera.lookAt(lookAtPoint);
    } else {
      this.camera.lookAt(targetPosition);
    }
  }

  private updateFreeCamera(targetPosition: THREE.Vector3, deltaTime: number): void {
    // 구면 좌표계로 카메라 위치 계산
    const x = Math.sin(this.yaw) * Math.cos(this.pitch) * this.currentDistance;
    const y = Math.sin(this.pitch) * this.currentDistance;
    const z = Math.cos(this.yaw) * Math.cos(this.pitch) * this.currentDistance;

    this.idealPosition.set(
      targetPosition.x + x,
      targetPosition.y + y,
      targetPosition.z + z
    );
  }

  private updateLockedOnCamera(targetPosition: THREE.Vector3, deltaTime: number): void {
    if (!this.lockOnTarget) return;

    // 플레이어에서 락온 타겟으로의 방향
    const dirToTarget = this.tempVec3.copy(this.lockOnTarget.position)
      .sub(this.target!.position)
      .normalize();

    // 카메라는 플레이어 뒤에 위치
    this.idealPosition.copy(this.target!.position)
      .sub(dirToTarget.multiplyScalar(this.currentDistance));
    this.idealPosition.y = targetPosition.y;

    // 락온 시 yaw/pitch 업데이트 (나중에 락온 해제 시 사용)
    this.yaw = Math.atan2(
      this.idealPosition.x - targetPosition.x,
      this.idealPosition.z - targetPosition.z
    );
  }

  private handleCollision(targetPosition: THREE.Vector3, colliders: THREE.Object3D[]): void {
    // 타겟에서 이상적인 카메라 위치로 레이캐스트
    const direction = this.tempVec3.copy(this.idealPosition)
      .sub(targetPosition)
      .normalize();

    this.raycaster.set(targetPosition, direction);
    this.raycaster.far = this.currentDistance + this.config.collisionRadius;

    const intersects = this.raycaster.intersectObjects(colliders, true);

    if (intersects.length > 0) {
      const hitDistance = intersects[0].distance - this.config.collisionRadius;
      const clampedDistance = Math.max(this.config.minDistance, hitDistance);

      // 즉시 줌인 (벽에 끼지 않도록)
      this.currentDistance = Math.min(this.currentDistance, clampedDistance);

      // 위치 재계산
      this.idealPosition.copy(targetPosition)
        .add(direction.multiplyScalar(this.currentDistance));
    } else {
      // 충돌 없으면 서서히 기본 거리로 복귀
      this.currentDistance = THREE.MathUtils.lerp(
        this.currentDistance,
        this.targetDistance,
        0.05
      );
    }
  }

  private toggleLockOn(): void {
    if (this.isLockedOn) {
      this.isLockedOn = false;
      this.lockOnTarget = null;
      EventBus.emit('camera:lock_off');
    } else {
      // 가장 가까운 적 찾기 (외부에서 처리)
      EventBus.emit('camera:request_lock_target');
    }
  }

  setLockOnTarget(target: THREE.Object3D | null): void {
    if (target) {
      this.lockOnTarget = target;
      this.isLockedOn = true;
      EventBus.emit('camera:locked_on', { target });
    } else {
      this.isLockedOn = false;
      this.lockOnTarget = null;
    }
  }

  // 캐릭터가 바라봐야 할 방향 반환 (입력 방향 변환용)
  getForwardDirection(): THREE.Vector3 {
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return forward;
  }

  getRightDirection(): THREE.Vector3 {
    const right = new THREE.Vector3(1, 0, 0);
    right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return right;
  }
}
```

### 6.3 PointerLockController.ts

```typescript
// src/input/PointerLockController.ts

import { EventBus } from '../core/EventBus';

export class PointerLockController {
  private element: HTMLElement;
  private isLocked: boolean = false;

  private mouseMoveCallback: ((deltaX: number, deltaY: number) => void) | null = null;

  constructor(element: HTMLElement) {
    this.element = element;

    // Pointer Lock 이벤트 리스너
    document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
    document.addEventListener('pointerlockerror', this.onPointerLockError.bind(this));

    // 클릭 시 잠금 요청
    element.addEventListener('click', this.requestLock.bind(this));

    // ESC 키로 잠금 해제는 브라우저가 자동 처리
  }

  onMouseMove(callback: (deltaX: number, deltaY: number) => void): void {
    this.mouseMoveCallback = callback;
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isLocked || !this.mouseMoveCallback) return;

    this.mouseMoveCallback(event.movementX, event.movementY);
  }

  requestLock(): void {
    if (this.isLocked) return;
    this.element.requestPointerLock();
  }

  exitLock(): void {
    if (!this.isLocked) return;
    document.exitPointerLock();
  }

  private onPointerLockChange(): void {
    this.isLocked = document.pointerLockElement === this.element;

    if (this.isLocked) {
      EventBus.emit('pointer:locked');
    } else {
      EventBus.emit('pointer:unlocked');
    }
  }

  private onPointerLockError(): void {
    console.error('Pointer Lock failed');
    EventBus.emit('pointer:error');
  }

  get locked(): boolean {
    return this.isLocked;
  }
}
```

---

## 7. 물리/충돌 시스템 (Kinematic Character Controller)

### 7.1 설계 원칙 (PRD 섹션 3.2, 14)

> "Soulslike는 '걷기/달리기/구르기'가 지면에 안정적으로 붙어 있어야 한다. 풀 리지드바디로 캐릭터를 굴리면 계단/경사/벽에서 튀고, 컨트롤이 불안정해지기 쉽다."

따라서:
- 캐릭터: **Kinematic** 리지드바디 + KinematicCharacterController
- 적/오브젝트: **Dynamic** 리지드바디
- 환경: **Static** 콜라이더

### 7.2 CollisionGroups.ts

```typescript
// src/physics/CollisionGroups.ts

// Rapier 충돌 그룹 (비트 플래그)
export const CollisionGroups = {
  NONE: 0x0000,

  // 그룹 정의 (하위 16비트: 멤버십, 상위 16비트: 필터)
  PLAYER: 0x0001,
  ENEMY: 0x0002,
  ENVIRONMENT: 0x0004,
  WEAPON: 0x0008,
  TRIGGER: 0x0010,
  CAMERA: 0x0020,

  // 프리셋
  PLAYER_MEMBERSHIP: 0x0001,
  PLAYER_FILTER: 0x0006,  // ENEMY | ENVIRONMENT와 충돌

  ENEMY_MEMBERSHIP: 0x0002,
  ENEMY_FILTER: 0x0005,   // PLAYER | ENVIRONMENT와 충돌

  ENVIRONMENT_MEMBERSHIP: 0x0004,
  ENVIRONMENT_FILTER: 0xFFFF,  // 모든 것과 충돌

  WEAPON_MEMBERSHIP: 0x0008,
  WEAPON_FILTER: 0x0003,  // PLAYER | ENEMY와 충돌 (히트박스)
};

// 충돌 그룹 조합 헬퍼
export function makeCollisionGroups(membership: number, filter: number): number {
  return (membership & 0xFFFF) | ((filter & 0xFFFF) << 16);
}
```

### 7.3 PhysicsWorld.ts

```typescript
// src/physics/PhysicsWorld.ts

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { EventBus } from '../core/EventBus';

export class PhysicsWorld {
  private world!: RAPIER.World;
  private eventQueue!: RAPIER.EventQueue;

  // 리지드바디/콜라이더 맵핑
  private bodyToEntity: Map<number, string> = new Map();
  private entityToBody: Map<string, RAPIER.RigidBody> = new Map();

  async initialize(): Promise<void> {
    await RAPIER.init();

    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this.eventQueue = new RAPIER.EventQueue(true);

    EventBus.emit('physics:initialized');
  }

  step(deltaTime: number): void {
    this.world.step(this.eventQueue);
    this.processCollisionEvents();
  }

  private processCollisionEvents(): void {
    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      const entity1 = this.getEntityFromCollider(handle1);
      const entity2 = this.getEntityFromCollider(handle2);

      if (entity1 && entity2) {
        if (started) {
          EventBus.emit('physics:collision_start', { entity1, entity2 });
        } else {
          EventBus.emit('physics:collision_end', { entity1, entity2 });
        }
      }
    });
  }

  private getEntityFromCollider(handle: number): string | undefined {
    const collider = this.world.getCollider(handle);
    if (!collider) return undefined;

    const body = collider.parent();
    if (!body) return undefined;

    return this.bodyToEntity.get(body.handle);
  }

  // 정적 환경 콜라이더 생성
  createStaticCollider(
    shape: 'box' | 'capsule' | 'trimesh',
    params: any,
    position: THREE.Vector3,
    rotation?: THREE.Quaternion
  ): RAPIER.Collider {
    let colliderDesc: RAPIER.ColliderDesc;

    switch (shape) {
      case 'box':
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          params.halfExtents.x,
          params.halfExtents.y,
          params.halfExtents.z
        );
        break;
      case 'capsule':
        colliderDesc = RAPIER.ColliderDesc.capsule(
          params.halfHeight,
          params.radius
        );
        break;
      case 'trimesh':
        colliderDesc = RAPIER.ColliderDesc.trimesh(
          params.vertices,
          params.indices
        );
        break;
      default:
        throw new Error(`Unknown shape: ${shape}`);
    }

    colliderDesc.setTranslation(position.x, position.y, position.z);

    if (rotation) {
      colliderDesc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    }

    return this.world.createCollider(colliderDesc);
  }

  // Kinematic 리지드바디 생성 (캐릭터용)
  createKinematicBody(
    entityId: string,
    position: THREE.Vector3
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);

    const body = this.world.createRigidBody(bodyDesc);

    this.bodyToEntity.set(body.handle, entityId);
    this.entityToBody.set(entityId, body);

    return body;
  }

  // Dynamic 리지드바디 생성 (적/오브젝트용)
  createDynamicBody(
    entityId: string,
    position: THREE.Vector3,
    mass: number = 1.0
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.5)
      .setAngularDamping(0.5);

    const body = this.world.createRigidBody(bodyDesc);

    this.bodyToEntity.set(body.handle, entityId);
    this.entityToBody.set(entityId, body);

    return body;
  }

  // 캡슐 콜라이더 추가
  addCapsuleCollider(
    body: RAPIER.RigidBody,
    halfHeight: number,
    radius: number,
    collisionGroups: number
  ): RAPIER.Collider {
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setCollisionGroups(collisionGroups);

    return this.world.createCollider(colliderDesc, body);
  }

  // 레이캐스트
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    filterGroups?: number
  ): RAPIER.RayColliderHit | null {
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );

    return this.world.castRay(
      ray,
      maxDistance,
      true,  // solid
      filterGroups
    );
  }

  getWorld(): RAPIER.World {
    return this.world;
  }

  getBody(entityId: string): RAPIER.RigidBody | undefined {
    return this.entityToBody.get(entityId);
  }
}
```

### 7.4 CharacterController.ts (KCC)

```typescript
// src/physics/CharacterController.ts

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { CollisionGroups, makeCollisionGroups } from './CollisionGroups';

export interface CharacterControllerConfig {
  // 캐릭터 크기 (PRD 섹션 4.2)
  capsuleRadius: number;       // 0.35m
  capsuleHalfHeight: number;   // 0.85m (총 높이 1.7m)

  // 이동 (PRD 섹션 6.2)
  walkSpeed: number;           // 2.5 m/s
  runSpeed: number;            // 4.5 m/s
  sprintSpeed: number;         // 6.0 m/s

  // 자동 스텝 (PRD 섹션 4.2)
  maxStepHeight: number;       // 0.25m
  minStepWidth: number;        // 0.3m

  // 경사 (PRD 섹션 14 리스크 대응)
  maxSlopeClimbAngle: number;  // 45도 (라디안)
  minSlopeSlideAngle: number;  // 30도 (라디안)

  // 지면 스냅
  snapToGroundDistance: number; // 0.1m
}

export class CharacterController {
  private world: PhysicsWorld;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;

  private config: CharacterControllerConfig;

  // 현재 상태
  private isGrounded: boolean = false;
  private groundNormal: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private velocity: THREE.Vector3 = new THREE.Vector3();

  // 이동 입력
  private moveDirection: THREE.Vector3 = new THREE.Vector3();
  private moveSpeed: number = 0;

  constructor(
    world: PhysicsWorld,
    entityId: string,
    startPosition: THREE.Vector3,
    config?: Partial<CharacterControllerConfig>
  ) {
    this.world = world;

    this.config = {
      capsuleRadius: 0.35,
      capsuleHalfHeight: 0.85,
      walkSpeed: 2.5,
      runSpeed: 4.5,
      sprintSpeed: 6.0,
      maxStepHeight: 0.25,
      minStepWidth: 0.3,
      maxSlopeClimbAngle: Math.PI / 4,      // 45도
      minSlopeSlideAngle: Math.PI / 6,      // 30도
      snapToGroundDistance: 0.1,
      ...config
    };

    // Kinematic 리지드바디 생성
    this.body = world.createKinematicBody(entityId, startPosition);

    // 캡슐 콜라이더 추가
    const collisionGroups = makeCollisionGroups(
      CollisionGroups.PLAYER_MEMBERSHIP,
      CollisionGroups.PLAYER_FILTER
    );
    this.collider = world.addCapsuleCollider(
      this.body,
      this.config.capsuleHalfHeight,
      this.config.capsuleRadius,
      collisionGroups
    );

    // KinematicCharacterController 생성
    this.controller = world.getWorld().createCharacterController(0.01);  // offset

    // 컨트롤러 설정
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(
      this.config.maxStepHeight,
      this.config.minStepWidth,
      true  // includeDynamicBodies
    );
    this.controller.enableSnapToGround(this.config.snapToGroundDistance);
    this.controller.setMaxSlopeClimbAngle(this.config.maxSlopeClimbAngle);
    this.controller.setMinSlopeSlideAngle(this.config.minSlopeSlideAngle);
    this.controller.setSlideEnabled(true);
  }

  setMoveInput(direction: THREE.Vector3, speedMultiplier: number = 1.0): void {
    this.moveDirection.copy(direction).normalize();

    // 속도 결정 (걷기/달리기/질주)
    if (speedMultiplier >= 1.5) {
      this.moveSpeed = this.config.sprintSpeed;
    } else if (speedMultiplier >= 1.0) {
      this.moveSpeed = this.config.runSpeed;
    } else {
      this.moveSpeed = this.config.walkSpeed;
    }
  }

  update(deltaTime: number): void {
    // 원하는 이동량 계산
    const desiredMovement = {
      x: this.moveDirection.x * this.moveSpeed * deltaTime,
      y: this.velocity.y * deltaTime,  // 중력 적용
      z: this.moveDirection.z * this.moveSpeed * deltaTime
    };

    // 캐릭터 컨트롤러로 충돌 계산
    this.controller.computeColliderMovement(
      this.collider,
      desiredMovement,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined
    );

    // 실제 이동량 가져오기
    const correctedMovement = this.controller.computedMovement();

    // 지면 상태 업데이트
    this.isGrounded = this.controller.computedGrounded();

    // 리지드바디 위치 업데이트
    const currentPos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z
    });

    // 중력 처리
    if (this.isGrounded) {
      this.velocity.y = 0;
    } else {
      this.velocity.y -= 9.81 * deltaTime;  // 중력 가속
    }

    // 이동 입력 리셋
    this.moveDirection.set(0, 0, 0);
  }

  // 즉시 이동 (구르기, 넉백 등)
  applyImpulseMovement(direction: THREE.Vector3, distance: number): void {
    const impulse = direction.clone().normalize().multiplyScalar(distance);

    const currentPos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: currentPos.x + impulse.x,
      y: currentPos.y + impulse.y,
      z: currentPos.z + impulse.z
    });
  }

  // 회전 설정 (락온/이동 방향)
  setRotation(quaternion: THREE.Quaternion): void {
    this.body.setNextKinematicRotation({
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w
    });
  }

  getPosition(): THREE.Vector3 {
    const pos = this.body.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }

  getRotation(): THREE.Quaternion {
    const rot = this.body.rotation();
    return new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  }

  get grounded(): boolean {
    return this.isGrounded;
  }
}
```

### 7.5 디버그 렌더러 (선택)

```typescript
// src/render/DebugRenderer.ts

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export class DebugRenderer {
  private lines: THREE.LineSegments;
  private enabled: boolean = false;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      vertexColors: true
    });

    this.lines = new THREE.LineSegments(geometry, material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  update(world: RAPIER.World): void {
    if (!this.enabled) {
      this.lines.visible = false;
      return;
    }

    this.lines.visible = true;
    const { vertices, colors } = world.debugRender();

    const geometry = this.lines.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  }

  toggle(): void {
    this.enabled = !this.enabled;
  }
}
```

---

## 8. 구현 순서 권장 (PRD 섹션 13 기반)

| 순서 | 마일스톤 | 구현 내용 | 예상 소요 |
|------|----------|-----------|-----------|
| 1 | M0 | 프로젝트 구조 재편성, 모듈 스켈레톤 생성 | 0.5일 |
| 2 | M1.1 | GameLoop, Time, EventBus 구현 | 0.5일 |
| 3 | M1.2 | ResourceLoader (GLB/텍스처) 구현 | 0.5일 |
| 4 | M1.3 | PhysicsWorld + CollisionGroups 구현 | 1일 |
| 5 | M2.1 | CharacterController (KCC) 기본 구현 | 1일 |
| 6 | M2.2 | 지면 판정, 스텝업, 경사 처리 | 0.5일 |
| 7 | M3.1 | ThirdPersonCamera 기본 구현 | 0.5일 |
| 8 | M3.2 | 카메라 벽 충돌 + Pointer Lock | 0.5일 |
| 9 | M3.3 | 락온 시스템 기초 | 0.5일 |
| 10 | M4 | 입력 시스템 + 입력 버퍼 | 1일 |

**총 예상 소요: 약 6일**

---

## 9. 리스크 및 대응 (PRD 섹션 14 참조)

| 리스크 | 대응 |
|--------|------|
| (R1) 캐릭터 미끄러짐/튐 | KCC 사용, setSlideEnabled 조정, snapToGround 활성화 |
| (R2) 카메라 벽 끼임 | 레이캐스트 거리 줄임, 충돌 시 즉시 줌인 |
| (R3) 물리 스텝 불안정 | 고정 타임스텝 (60Hz), maxFixedStepsPerFrame 제한 |
| (R4) WASM 로딩 지연 | 로딩 화면에서 물리 초기화, 프로그레스 표시 |
| (R5) 콜라이더/메시 동기화 | 보간 알파 사용, 렌더 위치 보간 |

---

## 10. 핵심 구현 파일

핵심 시스템 구현에 가장 중요한 파일 5개:

1. **src/physics/Physics.ts** - 현재 Rapier 기본 설정이 있으며, PhysicsWorld와 CharacterController로 확장 필요

2. **src/core/Camera.ts** - 현재 고정 패럴랙스 카메라를 ThirdPersonCamera로 교체 필요

3. **src/main.ts** - 현재 엔트리 포인트를 Game.ts + GameLoop 패턴으로 리팩토링 필요

4. **src/core/Scene.ts** - RenderSystem으로 분리하고 ResourceLoader 통합 필요

5. **package.json** - 의존성 관리 및 빌드 설정 기준점
