# 입력 및 오디오 시스템 구현 계획서

이 문서는 PRD의 섹션 5 (조작 설계), 섹션 7.2 (입력 버퍼), 섹션 10.6 (사운드)을 기반으로 한 상세 구현 계획입니다.

---

## 1. 입력 시스템 (Input System)

### 1.1 아키텍처 개요

```
src/input/
├── InputManager.ts        # 입력 관리자 (중앙 집중식)
├── KeyboardInput.ts       # 키보드 이벤트 처리
├── MouseInput.ts          # 마우스 이벤트 + Pointer Lock
├── GamepadInput.ts        # 게임패드 지원 (선택)
├── InputBuffer.ts         # 입력 버퍼 시스템
├── InputPresets.ts        # 키 프리셋 정의 (A/B)
├── InputRemapper.ts       # 키 리맵핑 기능
└── types.ts               # 타입 정의
```

### 1.2 핵심 타입 정의

```typescript
// src/input/types.ts

/** 게임 액션 (다크 소울 동작 의미) */
export enum GameAction {
  // 이동
  MOVE_FORWARD = 'MOVE_FORWARD',
  MOVE_BACKWARD = 'MOVE_BACKWARD',
  MOVE_LEFT = 'MOVE_LEFT',
  MOVE_RIGHT = 'MOVE_RIGHT',

  // 전투
  ATTACK_LIGHT = 'ATTACK_LIGHT',       // R1 - 약공격
  ATTACK_HEAVY = 'ATTACK_HEAVY',       // R2 - 강공격
  GUARD = 'GUARD',                     // L1 - 막기
  PARRY = 'PARRY',                     // L2 - 패리

  // 기동
  DODGE_ROLL = 'DODGE_ROLL',           // 구르기 (탭)
  SPRINT = 'SPRINT',                   // 질주 (홀드)
  BACKSTEP = 'BACKSTEP',               // 백스텝 (락온 중 뒤로+구르기)

  // 타겟팅
  LOCK_ON = 'LOCK_ON',                 // 락온/해제
  TARGET_SWITCH_LEFT = 'TARGET_SWITCH_LEFT',
  TARGET_SWITCH_RIGHT = 'TARGET_SWITCH_RIGHT',

  // 상호작용
  INTERACT = 'INTERACT',               // 상호작용/확인
  USE_ITEM = 'USE_ITEM',               // 아이템 사용
  TWO_HAND_TOGGLE = 'TWO_HAND_TOGGLE', // 양손 전환

  // 장비 전환
  SWAP_WEAPON_LEFT = 'SWAP_WEAPON_LEFT',
  SWAP_WEAPON_RIGHT = 'SWAP_WEAPON_RIGHT',
  SWAP_ITEM = 'SWAP_ITEM',
  SWAP_SPELL = 'SWAP_SPELL',

  // 시스템
  PAUSE = 'PAUSE',
  CAMERA_RESET = 'CAMERA_RESET',
}

/** 입력 상태 */
export interface InputState {
  pressed: boolean;       // 현재 눌림 상태
  justPressed: boolean;   // 이번 프레임에 눌림
  justReleased: boolean;  // 이번 프레임에 뗌
  holdDuration: number;   // 홀드 시간 (초)
  timestamp: number;      // 마지막 입력 시간
}

/** 이동 벡터 */
export interface MoveVector {
  x: number;  // 좌(-1) ~ 우(+1)
  y: number;  // 뒤(-1) ~ 앞(+1)
  magnitude: number;
}

/** 카메라 델타 */
export interface CameraDelta {
  yaw: number;    // 좌우 회전
  pitch: number;  // 상하 회전
}

/** 버퍼된 입력 */
export interface BufferedInput {
  action: GameAction;
  timestamp: number;
  priority: number;
  consumed: boolean;
}
```

### 1.3 키 매핑 테이블

#### 프리셋 A - 원작 PC 기본 (레거시)

| 행동 (게임패드 의미) | 키/마우스 | GameAction |
|---------------------|-----------|------------|
| 이동 | W/A/S/D | MOVE_* |
| 카메라 | 마우스 (또는 I/J/K/L) | - |
| 락온/카메라 리셋 | Mouse3(휠 클릭) 또는 O | LOCK_ON |
| 약공격 (R1) | 좌클릭 또는 H | ATTACK_LIGHT |
| 강공격 (R2) | 우클릭 또는 U | ATTACK_HEAVY |
| 막기 (L1) | Left Shift | GUARD |
| 패리 (L2) | Tab | PARRY |
| 회피/질주/백스텝 | Space | DODGE_ROLL / SPRINT |
| 상호작용 (A/X) | Q | INTERACT |
| 아이템 사용 | E | USE_ITEM |
| 양손 전환 | Left Alt | TWO_HAND_TOGGLE |
| 무기/아이템 스왑 | V/C/F/R | SWAP_* |

#### 프리셋 B - 현대적 WASD+마우스 (권장 기본값)

| 행동 | 키/마우스 | GameAction |
|------|-----------|------------|
| 이동 | W/A/S/D | MOVE_* |
| 카메라 | 마우스 + Pointer Lock | - |
| 락온 | Middle Mouse 또는 Q | LOCK_ON |
| 약공격 (R1) | 좌클릭 | ATTACK_LIGHT |
| 강공격 (R2) | Shift+좌클릭 또는 우클릭 | ATTACK_HEAVY |
| 막기 (L1) | 우클릭 (홀드) | GUARD |
| 패리 (L2) | Ctrl+우클릭 또는 F | PARRY |
| 회피/질주/백스텝 | Left Shift | DODGE_ROLL / SPRINT |
| 점프 (질주 중) | Space | - |
| 상호작용 | E | INTERACT |
| 아이템 사용 | R | USE_ITEM |
| 양손 전환 | F (또는 Alt) | TWO_HAND_TOGGLE |
| 무기/아이템 스왑 | 1/2/3/4 또는 휠 | SWAP_* |

### 1.4 InputManager 구현

```typescript
// src/input/InputManager.ts

import { GameAction, InputState, MoveVector, CameraDelta, BufferedInput } from './types';
import { KeyboardInput } from './KeyboardInput';
import { MouseInput } from './MouseInput';
import { InputBuffer } from './InputBuffer';
import { InputPresets, type PresetType } from './InputPresets';
import { InputRemapper } from './InputRemapper';
import { GamepadInput } from './GamepadInput';

export class InputManager {
  private keyboardInput: KeyboardInput;
  private mouseInput: MouseInput;
  private gamepadInput: GamepadInput | null = null;
  private inputBuffer: InputBuffer;
  private remapper: InputRemapper;

  private actionStates: Map<GameAction, InputState> = new Map();
  private currentPreset: PresetType = 'B';
  private isPointerLocked: boolean = false;
  private enabled: boolean = true;

  // 민감도 설정
  private mouseSensitivity: number = 0.002;
  private gamepadSensitivity: number = 2.0;

  constructor() {
    this.keyboardInput = new KeyboardInput();
    this.mouseInput = new MouseInput();
    this.inputBuffer = new InputBuffer({
      windowDuration: 0.3,  // 0.25~0.35초
      maxBufferSize: 8,
    });
    this.remapper = new InputRemapper();

    // 모든 액션 상태 초기화
    Object.values(GameAction).forEach(action => {
      this.actionStates.set(action, this.createDefaultState());
    });

    // 이벤트 리스너 설정
    this.setupEventListeners();
  }

  private createDefaultState(): InputState {
    return {
      pressed: false,
      justPressed: false,
      justReleased: false,
      holdDuration: 0,
      timestamp: 0,
    };
  }

  private setupEventListeners(): void {
    // Pointer Lock 상태 변경 감지
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement !== null;
    });
  }

  /** 프레임마다 호출 */
  update(deltaTime: number): void {
    if (!this.enabled) return;

    // 이전 프레임 상태 리셋
    this.resetFrameStates();

    // 입력 소스 업데이트
    this.keyboardInput.update();
    this.mouseInput.update();
    this.gamepadInput?.update();

    // 키 매핑에 따라 액션 상태 업데이트
    this.updateActionStates(deltaTime);

    // 입력 버퍼 업데이트
    this.inputBuffer.update(deltaTime);

    // 버퍼에 새 입력 추가
    this.bufferNewInputs();
  }

  private resetFrameStates(): void {
    this.actionStates.forEach(state => {
      state.justPressed = false;
      state.justReleased = false;
    });
  }

  private updateActionStates(deltaTime: number): void {
    const keymap = InputPresets.getKeymap(this.currentPreset);
    const remappedKeymap = this.remapper.applyRemapping(keymap);

    remappedKeymap.forEach((bindings, action) => {
      const state = this.actionStates.get(action)!;
      const wasPressed = state.pressed;

      // 키보드/마우스/게임패드 중 하나라도 눌렸는지 확인
      const isPressed = this.checkBindings(bindings);

      state.pressed = isPressed;
      state.justPressed = isPressed && !wasPressed;
      state.justReleased = !isPressed && wasPressed;

      if (isPressed) {
        state.holdDuration += deltaTime;
        if (state.justPressed) {
          state.timestamp = performance.now();
        }
      } else {
        state.holdDuration = 0;
      }
    });
  }

  private checkBindings(bindings: InputBinding[]): boolean {
    return bindings.some(binding => {
      if (binding.type === 'keyboard') {
        return this.keyboardInput.isKeyPressed(binding.code);
      } else if (binding.type === 'mouse') {
        return this.mouseInput.isButtonPressed(binding.button);
      } else if (binding.type === 'gamepad' && this.gamepadInput) {
        return this.gamepadInput.isButtonPressed(binding.button);
      }
      return false;
    });
  }

  private bufferNewInputs(): void {
    // 버퍼링 가능한 액션들
    const bufferableActions: GameAction[] = [
      GameAction.ATTACK_LIGHT,
      GameAction.ATTACK_HEAVY,
      GameAction.DODGE_ROLL,
      GameAction.INTERACT,
      GameAction.USE_ITEM,
      GameAction.PARRY,
    ];

    bufferableActions.forEach(action => {
      const state = this.actionStates.get(action)!;
      if (state.justPressed) {
        this.inputBuffer.addInput({
          action,
          timestamp: performance.now(),
          priority: this.getActionPriority(action),
          consumed: false,
        });
      }
    });
  }

  private getActionPriority(action: GameAction): number {
    // 우선순위: 사망 > 피격 > 구르기 > 공격 > 상호작용 > 이동
    const priorities: Partial<Record<GameAction, number>> = {
      [GameAction.DODGE_ROLL]: 100,
      [GameAction.ATTACK_LIGHT]: 80,
      [GameAction.ATTACK_HEAVY]: 80,
      [GameAction.PARRY]: 75,
      [GameAction.GUARD]: 70,
      [GameAction.INTERACT]: 50,
      [GameAction.USE_ITEM]: 40,
    };
    return priorities[action] ?? 0;
  }

  // === Public API ===

  /** 액션 상태 조회 */
  getActionState(action: GameAction): InputState {
    return this.actionStates.get(action)!;
  }

  /** 액션이 눌렸는지 */
  isActionPressed(action: GameAction): boolean {
    return this.actionStates.get(action)!.pressed;
  }

  /** 이번 프레임에 액션이 눌렸는지 */
  isActionJustPressed(action: GameAction): boolean {
    return this.actionStates.get(action)!.justPressed;
  }

  /** 이동 벡터 (정규화됨) */
  getMoveVector(): MoveVector {
    let x = 0;
    let y = 0;

    if (this.isActionPressed(GameAction.MOVE_FORWARD)) y += 1;
    if (this.isActionPressed(GameAction.MOVE_BACKWARD)) y -= 1;
    if (this.isActionPressed(GameAction.MOVE_LEFT)) x -= 1;
    if (this.isActionPressed(GameAction.MOVE_RIGHT)) x += 1;

    // 게임패드 스틱 입력 (있는 경우)
    if (this.gamepadInput) {
      const stick = this.gamepadInput.getLeftStick();
      if (Math.abs(stick.x) > 0.1 || Math.abs(stick.y) > 0.1) {
        x = stick.x;
        y = stick.y;
      }
    }

    const magnitude = Math.sqrt(x * x + y * y);
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }

    return { x, y, magnitude: Math.min(magnitude, 1) };
  }

  /** 카메라 회전 델타 */
  getCameraDelta(): CameraDelta {
    let yaw = 0;
    let pitch = 0;

    if (this.isPointerLocked) {
      const mouseDelta = this.mouseInput.getMovementDelta();
      yaw = -mouseDelta.x * this.mouseSensitivity;
      pitch = -mouseDelta.y * this.mouseSensitivity;
    }

    // 게임패드 우측 스틱
    if (this.gamepadInput) {
      const stick = this.gamepadInput.getRightStick();
      yaw += -stick.x * this.gamepadSensitivity * 0.016;
      pitch += -stick.y * this.gamepadSensitivity * 0.016;
    }

    return { yaw, pitch };
  }

  /** 버퍼에서 액션 소비 */
  consumeBufferedAction(action: GameAction): BufferedInput | null {
    return this.inputBuffer.consumeAction(action);
  }

  /** 버퍼에 특정 액션이 있는지 */
  hasBufferedAction(action: GameAction): boolean {
    return this.inputBuffer.hasAction(action);
  }

  /** Pointer Lock 요청 */
  requestPointerLock(): void {
    this.mouseInput.requestPointerLock();
  }

  /** Pointer Lock 해제 */
  exitPointerLock(): void {
    document.exitPointerLock();
  }

  /** 프리셋 변경 */
  setPreset(preset: PresetType): void {
    this.currentPreset = preset;
  }

  /** 키 리맵핑 */
  remapKey(action: GameAction, newBinding: InputBinding): void {
    this.remapper.setMapping(action, newBinding);
  }

  /** 게임패드 활성화 */
  enableGamepad(): void {
    if (!this.gamepadInput) {
      this.gamepadInput = new GamepadInput();
    }
  }

  /** 민감도 설정 */
  setMouseSensitivity(value: number): void {
    this.mouseSensitivity = Math.max(0.0005, Math.min(0.01, value));
  }

  /** 입력 활성화/비활성화 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// 싱글톤 인스턴스
export const inputManager = new InputManager();
```

### 1.5 Pointer Lock 구현

```typescript
// src/input/MouseInput.ts

export class MouseInput {
  private movementX: number = 0;
  private movementY: number = 0;
  private buttonStates: Map<number, boolean> = new Map();
  private prevButtonStates: Map<number, boolean> = new Map();

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 마우스 이동 (Pointer Lock 상태에서만 유효)
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.movementX += e.movementX;
        this.movementY += e.movementY;
      }
    });

    // 마우스 버튼
    document.addEventListener('mousedown', (e) => {
      this.buttonStates.set(e.button, true);
    });

    document.addEventListener('mouseup', (e) => {
      this.buttonStates.set(e.button, false);
    });

    // 우클릭 메뉴 방지
    document.addEventListener('contextmenu', (e) => {
      if (document.pointerLockElement) {
        e.preventDefault();
      }
    });
  }

  update(): void {
    // 이전 상태 저장
    this.prevButtonStates = new Map(this.buttonStates);
  }

  /** 프레임 동안의 마우스 이동량 (픽셀) */
  getMovementDelta(): { x: number; y: number } {
    const delta = { x: this.movementX, y: this.movementY };
    // 다음 프레임을 위해 리셋
    this.movementX = 0;
    this.movementY = 0;
    return delta;
  }

  isButtonPressed(button: number): boolean {
    return this.buttonStates.get(button) ?? false;
  }

  isButtonJustPressed(button: number): boolean {
    const current = this.buttonStates.get(button) ?? false;
    const prev = this.prevButtonStates.get(button) ?? false;
    return current && !prev;
  }

  requestPointerLock(): void {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.requestPointerLock();
    }
  }
}

// 마우스 버튼 상수
export const MOUSE_BUTTON = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
} as const;
```

### 1.6 키보드 입력 처리

```typescript
// src/input/KeyboardInput.ts

export class KeyboardInput {
  private keyStates: Map<string, boolean> = new Map();
  private prevKeyStates: Map<string, boolean> = new Map();

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    document.addEventListener('keydown', (e) => {
      // 특정 시스템 키 조합 허용 (Alt+Tab 등)
      if (e.altKey && e.key === 'Tab') return;

      // 게임 중 기본 동작 방지
      if (document.pointerLockElement) {
        e.preventDefault();
      }

      this.keyStates.set(e.code, true);
    });

    document.addEventListener('keyup', (e) => {
      this.keyStates.set(e.code, false);
    });

    // 포커스 손실 시 모든 키 리셋
    window.addEventListener('blur', () => {
      this.keyStates.clear();
    });
  }

  update(): void {
    this.prevKeyStates = new Map(this.keyStates);
  }

  isKeyPressed(code: string): boolean {
    return this.keyStates.get(code) ?? false;
  }

  isKeyJustPressed(code: string): boolean {
    const current = this.keyStates.get(code) ?? false;
    const prev = this.prevKeyStates.get(code) ?? false;
    return current && !prev;
  }

  isKeyJustReleased(code: string): boolean {
    const current = this.keyStates.get(code) ?? false;
    const prev = this.prevKeyStates.get(code) ?? false;
    return !current && prev;
  }
}
```

---

## 2. 입력 버퍼 시스템 (Input Buffer)

### 2.1 설계 원칙

PRD 섹션 7.2에 따른 핵심 요구사항:
- **버퍼 윈도우**: 0.25 ~ 0.35초 (기본 0.3초)
- **우선순위**: 사망 > 피격 > 구르기 > 공격 > 상호작용 > 이동
- **연타 방지**: 동일 행동 최소 간격 120ms

### 2.2 InputBuffer 구현

```typescript
// src/input/InputBuffer.ts

import { GameAction, BufferedInput } from './types';

export interface InputBufferConfig {
  windowDuration: number;     // 버퍼 유지 시간 (초)
  maxBufferSize: number;      // 최대 버퍼 크기
  repeatThreshold: number;    // 연타 방지 최소 간격 (ms)
}

const DEFAULT_CONFIG: InputBufferConfig = {
  windowDuration: 0.3,        // 300ms
  maxBufferSize: 8,
  repeatThreshold: 120,       // 120ms
};

export class InputBuffer {
  private buffer: BufferedInput[] = [];
  private config: InputBufferConfig;
  private lastActionTimestamps: Map<GameAction, number> = new Map();

  constructor(config: Partial<InputBufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 입력 추가 */
  addInput(input: BufferedInput): boolean {
    // 연타 방지 체크
    const lastTimestamp = this.lastActionTimestamps.get(input.action) ?? 0;
    const timeSinceLastInput = input.timestamp - lastTimestamp;

    if (timeSinceLastInput < this.config.repeatThreshold) {
      return false; // 너무 빠른 연타 무시
    }

    // 버퍼 크기 제한
    if (this.buffer.length >= this.config.maxBufferSize) {
      // 가장 오래되고 우선순위 낮은 입력 제거
      this.buffer.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);
      this.buffer.shift();
    }

    this.buffer.push(input);
    this.lastActionTimestamps.set(input.action, input.timestamp);

    return true;
  }

  /** 버퍼 업데이트 (만료된 입력 제거) */
  update(deltaTime: number): void {
    const now = performance.now();
    const windowMs = this.config.windowDuration * 1000;

    // 만료된 입력 제거
    this.buffer = this.buffer.filter(input => {
      return (now - input.timestamp) < windowMs && !input.consumed;
    });
  }

  /** 특정 액션 소비 */
  consumeAction(action: GameAction): BufferedInput | null {
    // 우선순위 높은 순으로 정렬
    this.buffer.sort((a, b) => b.priority - a.priority);

    const index = this.buffer.findIndex(input =>
      input.action === action && !input.consumed
    );

    if (index === -1) return null;

    const input = this.buffer[index];
    input.consumed = true;

    return input;
  }

  /** 가장 높은 우선순위의 액션 소비 */
  consumeHighestPriority(): BufferedInput | null {
    this.buffer.sort((a, b) => b.priority - a.priority);

    const input = this.buffer.find(i => !i.consumed);
    if (input) {
      input.consumed = true;
    }

    return input ?? null;
  }

  /** 특정 액션이 버퍼에 있는지 확인 */
  hasAction(action: GameAction): boolean {
    return this.buffer.some(input =>
      input.action === action && !input.consumed
    );
  }

  /** 버퍼 내 특정 액션들 중 가장 우선순위 높은 것 반환 */
  peekPriorityAmong(actions: GameAction[]): BufferedInput | null {
    const candidates = this.buffer
      .filter(input => actions.includes(input.action) && !input.consumed)
      .sort((a, b) => b.priority - a.priority);

    return candidates[0] ?? null;
  }

  /** 버퍼 클리어 */
  clear(): void {
    this.buffer = [];
  }

  /** 특정 액션 타입만 클리어 */
  clearAction(action: GameAction): void {
    this.buffer = this.buffer.filter(input => input.action !== action);
  }

  /** 디버그용 버퍼 상태 */
  getDebugInfo(): { action: string; age: number; priority: number }[] {
    const now = performance.now();
    return this.buffer
      .filter(i => !i.consumed)
      .map(input => ({
        action: input.action,
        age: now - input.timestamp,
        priority: input.priority,
      }));
  }
}
```

### 2.3 플레이어 FSM과의 통합 예시

```typescript
// 플레이어 상태 머신에서 입력 버퍼 사용 예시
class PlayerStateMachine {
  private inputManager: InputManager;

  updateState(deltaTime: number): void {
    const currentState = this.getCurrentState();

    // 현재 상태에서 취소 가능한 시점인지 확인
    if (currentState.canCancelIntoAction()) {
      // 버퍼에서 가장 높은 우선순위 액션 확인
      const bufferedAction = this.inputManager.hasBufferedAction(GameAction.DODGE_ROLL)
        ? this.inputManager.consumeBufferedAction(GameAction.DODGE_ROLL)
        : this.inputManager.consumeBufferedAction(GameAction.ATTACK_LIGHT);

      if (bufferedAction) {
        this.transitionToState(this.getStateForAction(bufferedAction.action));
      }
    }
  }
}
```

---

## 3. 오디오 시스템 (Audio System)

### 3.1 아키텍처 개요

```
src/audio/
├── AudioManager.ts        # 오디오 관리자
├── SoundPool.ts           # 사운드 풀링
├── SoundCategory.ts       # 카테고리별 볼륨 관리
├── MusicManager.ts        # BGM 관리 (크로스페이드)
├── SpatialAudio.ts        # 3D 공간 오디오
└── types.ts               # 타입 정의
```

### 3.2 기술 선택: Web Audio API vs howler.js

| 기준 | Web Audio API (직접) | howler.js |
|------|---------------------|-----------|
| 번들 크기 | 0 KB | ~12 KB |
| 저수준 제어 | 완전한 제어 | 제한적 |
| 크로스브라우저 | 직접 처리 필요 | 자동 처리 |
| 3D 오디오 | 네이티브 지원 | 플러그인 필요 |
| 개발 속도 | 느림 | 빠름 |

**권장**: 세로 슬라이스에서는 **howler.js** 사용 후, 필요시 Web Audio API로 마이그레이션

### 3.3 사운드 카테고리 및 에셋

PRD 섹션 10.6 기반:

| 카테고리 | 사운드 | 출처 (CC0) | 파일명 (예시) |
|---------|--------|-----------|--------------|
| **SFX - 발소리** | 걷기, 달리기, 구르기 | Kenney RPG Audio | footstep_*.ogg |
| **SFX - 전투** | 무기 스윙, 피격, 방어 | Kenney Impact Sounds | swing_*.ogg, hit_*.ogg |
| **SFX - UI** | 메뉴 선택, 확인 | Kenney Interface Sounds | ui_*.ogg |
| **SFX - 환경** | 문 열림, 화톳불, 안개문 | Kenney RPG Audio | env_*.ogg |
| **Music** | 보스 BGM, 체크포인트 | - (별도 제작/확보) | music_*.ogg |

### 3.4 AudioManager 구현

```typescript
// src/audio/AudioManager.ts

import { Howl, Howler } from 'howler';
import { SoundPool } from './SoundPool';

/** 사운드 카테고리 */
export enum SoundCategory {
  MASTER = 'master',
  SFX = 'sfx',
  MUSIC = 'music',
  VOICE = 'voice',
  AMBIENT = 'ambient',
}

/** 사운드 ID */
export enum SoundId {
  // 발소리
  FOOTSTEP_WALK = 'footstep_walk',
  FOOTSTEP_RUN = 'footstep_run',
  FOOTSTEP_ROLL = 'footstep_roll',

  // 전투
  SWING_LIGHT = 'swing_light',
  SWING_HEAVY = 'swing_heavy',
  HIT_FLESH = 'hit_flesh',
  HIT_METAL = 'hit_metal',
  BLOCK = 'block',
  PARRY = 'parry',

  // 상태
  DEATH = 'death',
  HEAL = 'heal',
  STAMINA_EXHAUST = 'stamina_exhaust',

  // 환경
  BONFIRE_LOOP = 'bonfire_loop',
  DOOR_OPEN = 'door_open',
  FOG_GATE = 'fog_gate',
  ITEM_PICKUP = 'item_pickup',

  // UI
  UI_SELECT = 'ui_select',
  UI_CONFIRM = 'ui_confirm',
  UI_CANCEL = 'ui_cancel',

  // 음악
  MUSIC_BOSS = 'music_boss',
  MUSIC_TITLE = 'music_title',
}

/** 사운드 정의 */
interface SoundDefinition {
  id: SoundId;
  src: string | string[];
  category: SoundCategory;
  volume?: number;
  loop?: boolean;
  spatial?: boolean;
  poolSize?: number;
}

/** 사운드 정의 목록 */
const SOUND_DEFINITIONS: SoundDefinition[] = [
  // 발소리
  {
    id: SoundId.FOOTSTEP_WALK,
    src: ['/assets/audio/sfx/footstep_walk_01.ogg', '/assets/audio/sfx/footstep_walk_02.ogg'],
    category: SoundCategory.SFX,
    volume: 0.5,
    poolSize: 4,
  },
  {
    id: SoundId.FOOTSTEP_RUN,
    src: ['/assets/audio/sfx/footstep_run_01.ogg', '/assets/audio/sfx/footstep_run_02.ogg'],
    category: SoundCategory.SFX,
    volume: 0.6,
    poolSize: 4,
  },
  {
    id: SoundId.FOOTSTEP_ROLL,
    src: '/assets/audio/sfx/footstep_roll.ogg',
    category: SoundCategory.SFX,
    volume: 0.7,
  },

  // 전투
  {
    id: SoundId.SWING_LIGHT,
    src: ['/assets/audio/sfx/swing_light_01.ogg', '/assets/audio/sfx/swing_light_02.ogg'],
    category: SoundCategory.SFX,
    volume: 0.7,
    poolSize: 3,
  },
  {
    id: SoundId.SWING_HEAVY,
    src: '/assets/audio/sfx/swing_heavy.ogg',
    category: SoundCategory.SFX,
    volume: 0.8,
  },
  {
    id: SoundId.HIT_FLESH,
    src: ['/assets/audio/sfx/hit_flesh_01.ogg', '/assets/audio/sfx/hit_flesh_02.ogg'],
    category: SoundCategory.SFX,
    volume: 0.8,
    poolSize: 4,
  },
  {
    id: SoundId.BLOCK,
    src: '/assets/audio/sfx/block.ogg',
    category: SoundCategory.SFX,
    volume: 0.75,
  },
  {
    id: SoundId.PARRY,
    src: '/assets/audio/sfx/parry.ogg',
    category: SoundCategory.SFX,
    volume: 0.9,
  },

  // 환경
  {
    id: SoundId.BONFIRE_LOOP,
    src: '/assets/audio/ambient/bonfire_loop.ogg',
    category: SoundCategory.AMBIENT,
    volume: 0.4,
    loop: true,
  },
  {
    id: SoundId.FOG_GATE,
    src: '/assets/audio/sfx/fog_gate.ogg',
    category: SoundCategory.SFX,
    volume: 0.8,
  },

  // UI
  {
    id: SoundId.UI_SELECT,
    src: '/assets/audio/ui/select.ogg',
    category: SoundCategory.SFX,
    volume: 0.5,
  },

  // 음악
  {
    id: SoundId.MUSIC_BOSS,
    src: '/assets/audio/music/boss_theme.ogg',
    category: SoundCategory.MUSIC,
    volume: 0.6,
    loop: true,
  },
];

export class AudioManager {
  private sounds: Map<SoundId, Howl | SoundPool> = new Map();
  private categoryVolumes: Map<SoundCategory, number> = new Map();
  private currentMusic: Howl | null = null;
  private initialized: boolean = false;

  constructor() {
    // 기본 볼륨 설정
    this.categoryVolumes.set(SoundCategory.MASTER, 1.0);
    this.categoryVolumes.set(SoundCategory.SFX, 0.8);
    this.categoryVolumes.set(SoundCategory.MUSIC, 0.5);
    this.categoryVolumes.set(SoundCategory.VOICE, 1.0);
    this.categoryVolumes.set(SoundCategory.AMBIENT, 0.6);
  }

  /** 초기화 (사용자 상호작용 후 호출) */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Web Audio Context 언락 (브라우저 정책)
    await Howler.ctx?.resume();

    // 모든 사운드 로드
    await this.loadAllSounds();

    this.initialized = true;
    console.log('AudioManager initialized');
  }

  private async loadAllSounds(): Promise<void> {
    const loadPromises = SOUND_DEFINITIONS.map(def => {
      return new Promise<void>((resolve) => {
        if (def.poolSize && def.poolSize > 1) {
          // 풀링이 필요한 사운드
          const pool = new SoundPool({
            src: def.src,
            volume: def.volume ?? 1.0,
            poolSize: def.poolSize,
            onload: () => resolve(),
          });
          this.sounds.set(def.id, pool);
        } else {
          // 단일 인스턴스 사운드
          const howl = new Howl({
            src: Array.isArray(def.src) ? def.src : [def.src],
            volume: def.volume ?? 1.0,
            loop: def.loop ?? false,
            onload: () => resolve(),
            onloaderror: () => {
              console.warn(`Failed to load sound: ${def.id}`);
              resolve();
            },
          });
          this.sounds.set(def.id, howl);
        }
      });
    });

    await Promise.all(loadPromises);
  }

  /** 사운드 재생 */
  play(soundId: SoundId, options?: PlayOptions): number {
    const sound = this.sounds.get(soundId);
    if (!sound) {
      console.warn(`Sound not found: ${soundId}`);
      return -1;
    }

    const def = SOUND_DEFINITIONS.find(d => d.id === soundId)!;
    const categoryVolume = this.getCategoryVolume(def.category);
    const masterVolume = this.categoryVolumes.get(SoundCategory.MASTER)!;
    const finalVolume = (options?.volume ?? 1.0) * categoryVolume * masterVolume;

    if (sound instanceof SoundPool) {
      return sound.play({ volume: finalVolume });
    } else {
      sound.volume(finalVolume);
      return sound.play();
    }
  }

  /** 3D 공간 사운드 재생 */
  play3D(soundId: SoundId, position: THREE.Vector3, options?: Play3DOptions): number {
    const sound = this.sounds.get(soundId);
    if (!sound || sound instanceof SoundPool) {
      return this.play(soundId, options);
    }

    const id = this.play(soundId, options);

    // Howler 3D 위치 설정
    sound.pos(position.x, position.y, position.z, id);

    // 거리 감쇠 설정
    sound.pannerAttr({
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: options?.refDistance ?? 1,
      maxDistance: options?.maxDistance ?? 20,
      rolloffFactor: options?.rolloffFactor ?? 1,
    }, id);

    return id;
  }

  /** 사운드 정지 */
  stop(soundId: SoundId, id?: number): void {
    const sound = this.sounds.get(soundId);
    if (sound instanceof Howl) {
      if (id !== undefined) {
        sound.stop(id);
      } else {
        sound.stop();
      }
    } else if (sound instanceof SoundPool) {
      sound.stopAll();
    }
  }

  /** BGM 재생 (크로스페이드 지원) */
  playMusic(soundId: SoundId, fadeInDuration: number = 2.0): void {
    const newMusic = this.sounds.get(soundId);
    if (!(newMusic instanceof Howl)) return;

    // 현재 BGM 페이드 아웃
    if (this.currentMusic) {
      const oldMusic = this.currentMusic;
      oldMusic.fade(oldMusic.volume(), 0, fadeInDuration * 1000);
      setTimeout(() => oldMusic.stop(), fadeInDuration * 1000);
    }

    // 새 BGM 페이드 인
    const targetVolume = this.getCategoryVolume(SoundCategory.MUSIC);
    newMusic.volume(0);
    newMusic.play();
    newMusic.fade(0, targetVolume, fadeInDuration * 1000);

    this.currentMusic = newMusic;
  }

  /** BGM 정지 */
  stopMusic(fadeOutDuration: number = 1.0): void {
    if (this.currentMusic) {
      this.currentMusic.fade(this.currentMusic.volume(), 0, fadeOutDuration * 1000);
      setTimeout(() => {
        this.currentMusic?.stop();
        this.currentMusic = null;
      }, fadeOutDuration * 1000);
    }
  }

  /** 카테고리 볼륨 설정 */
  setCategoryVolume(category: SoundCategory, volume: number): void {
    this.categoryVolumes.set(category, Math.max(0, Math.min(1, volume)));

    // 마스터 볼륨은 전역 설정
    if (category === SoundCategory.MASTER) {
      Howler.volume(volume);
    }
  }

  /** 카테고리 볼륨 조회 */
  getCategoryVolume(category: SoundCategory): number {
    return this.categoryVolumes.get(category) ?? 1.0;
  }

  /** 리스너 위치 업데이트 (3D 오디오용) */
  updateListenerPosition(position: THREE.Vector3, forward: THREE.Vector3): void {
    Howler.pos(position.x, position.y, position.z);
    Howler.orientation(
      forward.x, forward.y, forward.z,
      0, 1, 0  // up vector
    );
  }

  /** 모든 사운드 일시정지 */
  pauseAll(): void {
    this.sounds.forEach(sound => {
      if (sound instanceof Howl) {
        sound.pause();
      }
    });
  }

  /** 모든 사운드 재개 */
  resumeAll(): void {
    this.sounds.forEach(sound => {
      if (sound instanceof Howl) {
        sound.play();
      }
    });
  }
}

interface PlayOptions {
  volume?: number;
  rate?: number;
}

interface Play3DOptions extends PlayOptions {
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
}

// 싱글톤 인스턴스
export const audioManager = new AudioManager();
```

### 3.5 SoundPool 구현 (사운드 풀링)

```typescript
// src/audio/SoundPool.ts

import { Howl } from 'howler';

interface SoundPoolConfig {
  src: string | string[];
  volume: number;
  poolSize: number;
  onload?: () => void;
}

export class SoundPool {
  private sounds: Howl[] = [];
  private currentIndex: number = 0;
  private loadedCount: number = 0;
  private config: SoundPoolConfig;

  constructor(config: SoundPoolConfig) {
    this.config = config;

    // 풀 생성
    for (let i = 0; i < config.poolSize; i++) {
      const howl = new Howl({
        src: Array.isArray(config.src) ? config.src : [config.src],
        volume: config.volume,
        onload: () => {
          this.loadedCount++;
          if (this.loadedCount === config.poolSize && config.onload) {
            config.onload();
          }
        },
      });
      this.sounds.push(howl);
    }
  }

  /** 다음 사용 가능한 사운드 재생 */
  play(options?: { volume?: number }): number {
    // 라운드 로빈 방식으로 사운드 선택
    const sound = this.sounds[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.sounds.length;

    // 이미 재생 중이면 정지 후 재생
    if (sound.playing()) {
      sound.stop();
    }

    if (options?.volume !== undefined) {
      sound.volume(options.volume);
    }

    return sound.play();
  }

  /** 모든 사운드 정지 */
  stopAll(): void {
    this.sounds.forEach(sound => sound.stop());
  }

  /** 볼륨 설정 */
  setVolume(volume: number): void {
    this.sounds.forEach(sound => sound.volume(volume));
  }
}
```

### 3.6 게임 이벤트와 사운드 연결

```typescript
// src/audio/GameAudioBridge.ts

import { audioManager, SoundId } from './AudioManager';
import type { EventBus } from '../core/EventBus';

/** 게임 이벤트와 오디오를 연결하는 브릿지 */
export function setupGameAudioBridge(eventBus: EventBus): void {

  // 발소리
  eventBus.on('player:footstep', (event) => {
    const soundId = event.isRunning
      ? SoundId.FOOTSTEP_RUN
      : SoundId.FOOTSTEP_WALK;
    audioManager.play3D(soundId, event.position);
  });

  // 구르기
  eventBus.on('player:roll', (event) => {
    audioManager.play3D(SoundId.FOOTSTEP_ROLL, event.position);
  });

  // 공격 스윙
  eventBus.on('combat:swing', (event) => {
    const soundId = event.isHeavy
      ? SoundId.SWING_HEAVY
      : SoundId.SWING_LIGHT;
    audioManager.play3D(soundId, event.position);
  });

  // 피격
  eventBus.on('combat:hit', (event) => {
    const soundId = event.isMetallic
      ? SoundId.HIT_METAL
      : SoundId.HIT_FLESH;
    audioManager.play3D(soundId, event.position, {
      volume: Math.min(1.0, event.damage / 50), // 데미지에 따른 볼륨
    });
  });

  // 방어
  eventBus.on('combat:block', (event) => {
    audioManager.play3D(SoundId.BLOCK, event.position);
  });

  // 패리
  eventBus.on('combat:parry', (event) => {
    audioManager.play3D(SoundId.PARRY, event.position, {
      volume: 1.0, // 패리는 항상 최대 볼륨
    });
  });

  // 사망
  eventBus.on('player:death', () => {
    audioManager.stopMusic(1.5);
    audioManager.play(SoundId.DEATH);
  });

  // 체크포인트 활성화
  eventBus.on('checkpoint:activate', (event) => {
    audioManager.play3D(SoundId.BONFIRE_LOOP, event.position);
  });

  // 보스전 시작
  eventBus.on('boss:fight_start', () => {
    audioManager.playMusic(SoundId.MUSIC_BOSS, 2.0);
  });

  // 보스 처치
  eventBus.on('boss:defeated', () => {
    audioManager.stopMusic(3.0);
  });

  // 안개문 진입
  eventBus.on('level:fog_gate', (event) => {
    audioManager.play3D(SoundId.FOG_GATE, event.position);
  });
}
```

---

## 4. 기존 코드와의 통합 계획

현재 프로젝트는 타이틀 화면까지 구현되어 있으며, 입력/오디오 시스템을 확장해야 합니다.

### 4.1 기존 Audio.ts 마이그레이션

현재 `src/core/Audio.ts`는 Web Audio API로 단순한 화톳불 사운드만 처리합니다. 이를 새로운 AudioManager로 대체합니다:

1. 기존 `initAudio()`, `playFireSound()` 함수를 deprecated로 표시
2. 새로운 `audioManager.init()` 호출로 대체
3. `SoundId.BONFIRE_LOOP`로 화톳불 사운드 재생

### 4.2 main.ts 수정 계획

```typescript
// main.ts 수정 계획

import { inputManager } from './input/InputManager';
import { audioManager } from './audio/AudioManager';

async function init() {
  // ... 기존 초기화 코드 ...

  // 새로운 시스템 초기화
  // 사용자 상호작용 후 오디오 초기화
  document.addEventListener('click', async () => {
    await audioManager.init();
    inputManager.requestPointerLock();
  }, { once: true });
}

function animate() {
  const delta = clock.getDelta();

  // 입력 시스템 업데이트
  inputManager.update(delta);

  // ... 기존 업데이트 코드 ...
}
```

---

## 5. 파일 및 폴더 구조

```
src/
├── input/
│   ├── InputManager.ts        # 중앙 입력 관리자
│   ├── KeyboardInput.ts       # 키보드 이벤트
│   ├── MouseInput.ts          # 마우스 + Pointer Lock
│   ├── GamepadInput.ts        # 게임패드 (선택)
│   ├── InputBuffer.ts         # 입력 버퍼 시스템
│   ├── InputPresets.ts        # 프리셋 A/B 정의
│   ├── InputRemapper.ts       # 키 리맵핑
│   └── types.ts               # 타입 정의
├── audio/
│   ├── AudioManager.ts        # 오디오 관리자
│   ├── SoundPool.ts           # 사운드 풀링
│   ├── MusicManager.ts        # BGM 크로스페이드
│   ├── GameAudioBridge.ts     # 게임 이벤트 연결
│   └── types.ts               # 타입 정의
├── core/
│   ├── EventBus.ts            # 이벤트 버스 (새로 추가)
│   └── ... (기존 파일들)
└── ...
```

---

## 6. 필요한 의존성

```json
// package.json 추가
{
  "dependencies": {
    "howler": "^2.2.4"
  },
  "devDependencies": {
    "@types/howler": "^2.2.0"
  }
}
```

---

## 7. 에셋 파일 구조

```
public/assets/audio/
├── sfx/
│   ├── footstep_walk_01.ogg
│   ├── footstep_walk_02.ogg
│   ├── footstep_run_01.ogg
│   ├── footstep_run_02.ogg
│   ├── footstep_roll.ogg
│   ├── swing_light_01.ogg
│   ├── swing_light_02.ogg
│   ├── swing_heavy.ogg
│   ├── hit_flesh_01.ogg
│   ├── hit_flesh_02.ogg
│   ├── hit_metal.ogg
│   ├── block.ogg
│   ├── parry.ogg
│   ├── death.ogg
│   ├── heal.ogg
│   ├── fog_gate.ogg
│   └── item_pickup.ogg
├── ambient/
│   ├── bonfire_loop.ogg
│   └── dungeon_ambience.ogg
├── ui/
│   ├── select.ogg
│   ├── confirm.ogg
│   └── cancel.ogg
└── music/
    ├── boss_theme.ogg
    └── title_theme.ogg
```

---

## 8. 구현 우선순위 (마일스톤별)

| 우선순위 | 기능 | 마일스톤 |
|---------|------|---------|
| 1 | KeyboardInput + MouseInput | M1 (물리/충돌) |
| 2 | Pointer Lock + 카메라 연동 | M2 (3인칭 카메라) |
| 3 | InputManager + 프리셋 B | M3 (애니메이션) |
| 4 | InputBuffer + 입력 선입력 | M4 (스태미나/입력 버퍼) |
| 5 | AudioManager + 기본 SFX | M5 (전투 MVP) |
| 6 | 3D 공간 오디오 | M6 (락온) |
| 7 | BGM + 크로스페이드 | M8 (보스전) |
| 8 | 키 리맵핑 UI + 게임패드 | M9 (폴리시) |

---

## 9. 핵심 구현 파일 목록

1. **src/input/InputManager.ts** - 입력 시스템의 핵심, 모든 입력 처리 통합
2. **src/input/InputBuffer.ts** - 선입력/버퍼 시스템, 다크 소울 느낌의 핵심
3. **src/audio/AudioManager.ts** - 오디오 시스템 중앙 관리자
4. **src/core/Audio.ts** - 기존 오디오 코드, 마이그레이션 참조용
5. **src/main.ts** - 엔트리 포인트, 새 시스템 초기화 통합 필요
