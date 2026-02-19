# 캐릭터 및 AI 시스템 구현 계획서

작성일: 2026-02-18
참조: PRD.md 섹션 6, 8

---

## 목차

1. [개요](#1-개요)
2. [플레이어 상태 머신 (FSM)](#2-플레이어-상태-머신-fsm)
3. [플레이어 스탯/밸런스 시스템](#3-플레이어-스탯밸런스-시스템)
4. [애니메이션 시스템](#4-애니메이션-시스템)
5. [보스 AI 로직 (FSM)](#5-보스-ai-로직-fsm)
6. [보스 패턴 시스템](#6-보스-패턴-시스템)
7. [일반 적 AI](#7-일반-적-ai)
8. [디렉터리 구조](#8-디렉터리-구조)
9. [구현 순서](#9-구현-순서)

---

## 1. 개요

본 문서는 Soulslike 게임의 핵심인 캐릭터 시스템과 AI를 구현하기 위한 상세 계획서이다. PRD.md의 섹션 6(주인공 설계)과 섹션 8(보스 설계)을 기반으로 하며, 기존 프로젝트의 three.js + Rapier 아키텍처와 호환되도록 설계한다.

### 1.1 기존 프로젝트 분석

현재 프로젝트는 다음 구조를 가지고 있다:

- `src/core/`: Scene, Camera, Audio 관리
- `src/effects/`: Particles, PostProcessing
- `src/physics/`: Rapier 물리 엔진 (기초 구현 완료)
- `src/ui/`: Menu 시스템

캐릭터/AI 시스템은 다음 디렉터리를 신규로 추가해야 한다:

- `src/entities/`: Player, Enemy, Boss 엔티티
- `src/fsm/`: 상태 머신 프레임워크
- `src/animation/`: AnimationMixer 래퍼, 상태-애니메이션 연동
- `src/combat/`: 스탯, 데미지, 히트박스 시스템
- `src/ai/`: 적 AI, 센서, 패턴 시스템
- `src/input/`: 입력 버퍼, 키 매핑

---

## 2. 플레이어 상태 머신 (FSM)

### 2.1 상태 다이어그램

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                                                         │
                    ▼                                                         │
              ┌──────────┐                                                    │
        ┌────►│  Idle    │◄────────────────────────────────────┐              │
        │     └────┬─────┘                                     │              │
        │          │ 이동 입력                                 │              │
        │          ▼                                           │              │
        │     ┌──────────┐     Shift 홀드 + 이동              │              │
        │     │Walk/Run  │─────────────────────►┌──────────┐   │              │
        │     └────┬─────┘                      │  Sprint  │   │              │
        │          │                            └────┬─────┘   │              │
        │          │ 공격 입력                       │         │              │
        │          ▼                                 │         │              │
        │     ┌──────────────────┐                   │         │              │
        │     │ AttackLight /    │◄──────────────────┘         │              │
        │     │ AttackHeavy      │    탭 입력 (스태미나 충분)  │              │
        │     └────────┬─────────┘                             │              │
        │              │                                       │              │
        │              │ 애니메이션 종료                       │              │
        │              ▼                                       │              │
        │         (복귀)───────────────────────────────────────┘              │
        │                                                                     │
        │     ┌──────────┐     Space 탭                                      │
        │     │Roll/     │◄───────────────────────────────────────────────────┤
        │     │Backstep  │     (모든 이동 상태에서)                           │
        │     └────┬─────┘                                                    │
        │          │ 애니메이션 종료                                          │
        │          ▼                                                          │
        │      (복귀)─────────────────────────────────────────────────────────┘
        │
        │     ┌──────────┐     막기 입력 (홀드)
        │     │  Guard   │◄───────────────────────────────────────────────────┐
        │     └────┬─────┘                                                    │
        │          │ 스태미나 0 시 피격                                       │
        │          ▼                                                          │
        │     ┌──────────┐                                                    │
        │     │GuardBreak│                                                    │
        │     └────┬─────┘                                                    │
        │          │                                                          │
        │          ▼                                                          │
        │      (복귀)─────────────────────────────────────────────────────────┘
        │
        │     ┌──────────┐     패리 입력 (타이밍)
        │     │  Parry   │◄───────────────────────────────────────────────────┐
        │     └────┬─────┘                                                    │
        │          │ 성공/실패                                                │
        │          ▼                                                          │
        │      (복귀)─────────────────────────────────────────────────────────┘
        │
        │     ┌──────────┐     피격 시
        │     │ HitStun  │◄───────────────────────────────────────────────────┤
        │     └────┬─────┘                                                    │
        │          │ HP > 0                                                   │
        │          ▼                                                          │
        │      (복귀)                                                         │
        │          │ HP <= 0                                                  │
        │          ▼                                                          │
        │     ┌──────────┐                                                    │
        └─────│  Death   │                                                    │
              └──────────┘                                                    │
                   │                                                          │
                   ▼                                                          │
              체크포인트 리스폰 → Idle                                        │
```

### 2.2 상태 정의 및 전이 규칙

#### 2.2.1 상태 열거형

```typescript
// src/fsm/PlayerState.ts

export enum PlayerStateType {
  Idle = 'Idle',
  Walk = 'Walk',
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
  Death = 'Death',
}
```

#### 2.2.2 상태 전이 테이블

| 현재 상태 | 전이 조건 | 다음 상태 | 비고 |
|-----------|-----------|-----------|------|
| Idle | 이동 입력 + 스태미나 > 0 | Walk/Run | 락온 시 Walk, 비락온 시 Run |
| Idle | 공격 입력 + 스태미나 >= 공격비용 | AttackLight/Heavy | 좌클릭=Light, 우클릭=Heavy |
| Idle | 막기 홀드 | Guard | - |
| Idle | 패리 입력 | Parry | Tab 키 |
| Walk/Run | 이동 입력 해제 | Idle | - |
| Walk/Run | Shift 홀드 + 이동 + 스태미나 > 0 | Sprint | - |
| Walk/Run | Space 탭 + 스태미나 >= 35 | Roll | 이동 방향으로 구르기 |
| Walk/Run | Space 탭 (이동 없음) | Backstep | 후방 스텝 |
| Sprint | Shift 해제 or 스태미나 = 0 | Run | - |
| Sprint | Space 탭 + 스태미나 >= 35 | Roll | - |
| Roll/Backstep | 애니메이션 종료 | Idle/Walk | 버퍼된 입력에 따라 |
| AttackLight | 애니메이션 종료 | Idle | - |
| AttackLight | 공격 입력 (버퍼) + 스태미나 충분 | AttackLight (콤보) | 최대 3콤보 |
| AttackHeavy | 애니메이션 종료 | Idle | - |
| Guard | 막기 해제 | Idle | - |
| Guard | 피격 + 스태미나 = 0 | GuardBreak | - |
| GuardBreak | 애니메이션 종료 | Idle | 약 1초 무방비 |
| Parry | 성공/실패 후 | Idle | - |
| HitStun | 경직 종료 + HP > 0 | Idle | - |
| HitStun | HP <= 0 | Death | - |
| Death | 리스폰 트리거 | Idle | 체크포인트에서 |

#### 2.2.3 FSM 인터페이스 설계

```typescript
// src/fsm/StateMachine.ts

export interface State<T> {
  name: string;

  // 상태 진입 시 호출
  onEnter(context: T): void;

  // 매 프레임 호출
  onUpdate(context: T, deltaTime: number): void;

  // 상태 종료 시 호출
  onExit(context: T): void;

  // 전이 가능 여부 체크
  canTransitionTo(nextState: string, context: T): boolean;
}

export class StateMachine<T> {
  private states: Map<string, State<T>> = new Map();
  private currentState: State<T> | null = null;
  private context: T;

  constructor(context: T) {
    this.context = context;
  }

  addState(state: State<T>): void {
    this.states.set(state.name, state);
  }

  setState(stateName: string): boolean {
    const newState = this.states.get(stateName);
    if (!newState) return false;

    if (this.currentState) {
      if (!this.currentState.canTransitionTo(stateName, this.context)) {
        return false;
      }
      this.currentState.onExit(this.context);
    }

    this.currentState = newState;
    this.currentState.onEnter(this.context);
    return true;
  }

  update(deltaTime: number): void {
    if (this.currentState) {
      this.currentState.onUpdate(this.context, deltaTime);
    }
  }

  getCurrentState(): string | null {
    return this.currentState?.name ?? null;
  }
}
```

#### 2.2.4 플레이어 상태 구현 예시 (Roll State)

```typescript
// src/fsm/states/RollState.ts

import { State } from '../StateMachine';
import { PlayerContext } from '../../entities/Player';
import { PlayerStateType } from '../PlayerState';

export class RollState implements State<PlayerContext> {
  name = PlayerStateType.Roll;

  private rollDuration = 0.75; // 초
  private iframeStart = 0.15;  // 무적 시작
  private iframeEnd = 0.45;    // 무적 종료
  private elapsed = 0;
  private rollDirection: THREE.Vector3 = new THREE.Vector3();
  private rollSpeed = 6.0; // m/s

  onEnter(ctx: PlayerContext): void {
    this.elapsed = 0;

    // 스태미나 소모
    ctx.stats.consumeStamina(35);

    // 구르기 방향 결정 (입력 방향 또는 전방)
    if (ctx.input.moveDirection.lengthSq() > 0.01) {
      this.rollDirection.copy(ctx.input.moveDirection).normalize();
    } else {
      this.rollDirection.copy(ctx.entity.getForward());
    }

    // 애니메이션 재생
    ctx.animation.play('Roll', { fadeIn: 0.1, loop: false });

    // 사운드 재생
    ctx.audio.play('roll_woosh');
  }

  onUpdate(ctx: PlayerContext, deltaTime: number): void {
    this.elapsed += deltaTime;

    // 무적 프레임 설정
    ctx.combat.isInvincible = (
      this.elapsed >= this.iframeStart &&
      this.elapsed <= this.iframeEnd
    );

    // 이동 처리 (속도 프로파일: 초반 가속 -> 중반 최고속 -> 후반 감속)
    const t = this.elapsed / this.rollDuration;
    let speedMultiplier: number;

    if (t < 0.3) {
      speedMultiplier = t / 0.3; // 가속
    } else if (t < 0.7) {
      speedMultiplier = 1.0; // 최고속
    } else {
      speedMultiplier = 1.0 - ((t - 0.7) / 0.3) * 0.7; // 감속
    }

    const velocity = this.rollDirection
      .clone()
      .multiplyScalar(this.rollSpeed * speedMultiplier);

    ctx.physics.setVelocity(velocity);

    // 애니메이션 종료 체크
    if (this.elapsed >= this.rollDuration) {
      ctx.fsm.setState(PlayerStateType.Idle);
    }
  }

  onExit(ctx: PlayerContext): void {
    ctx.combat.isInvincible = false;
    ctx.physics.setVelocity(new THREE.Vector3(0, 0, 0));
  }

  canTransitionTo(nextState: string, ctx: PlayerContext): boolean {
    // Roll 중에는 HitStun, Death만 가능 (무적이 아닐 때)
    if (ctx.combat.isInvincible) {
      return nextState === PlayerStateType.Death;
    }
    return [
      PlayerStateType.HitStun,
      PlayerStateType.Death,
      PlayerStateType.Idle,
    ].includes(nextState as PlayerStateType);
  }
}
```

---

## 3. 플레이어 스탯/밸런스 시스템

### 3.1 스탯 데이터 구조

```typescript
// src/combat/Stats.ts

export interface PlayerStats {
  // HP
  maxHP: number;
  currentHP: number;

  // Stamina
  maxStamina: number;
  currentStamina: number;
  staminaRegenRate: number;      // 기본 회복 (초당)
  staminaRegenGuardRate: number; // 방어 중 회복 (초당)
  staminaRegenDelay: number;     // 소모 후 회복 시작까지 딜레이 (초)

  // Combat
  attackPower: number;           // 기본 공격력
  defense: number;               // 방어력 (피해 감소)
  poise: number;                 // 강인도 (경직 저항)

  // Movement
  walkSpeed: number;
  runSpeed: number;
  sprintSpeed: number;

  // Costs
  rollStaminaCost: number;
  lightAttackStaminaCost: number;
  heavyAttackStaminaCost: number;
  sprintStaminaCostPerSec: number;
  guardStaminaCostMultiplier: number;
}

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  maxHP: 100,
  currentHP: 100,

  maxStamina: 100,
  currentStamina: 100,
  staminaRegenRate: 25,
  staminaRegenGuardRate: 12,
  staminaRegenDelay: 0.5,

  attackPower: 20,
  defense: 10,
  poise: 30,

  walkSpeed: 2.5,
  runSpeed: 4.5,
  sprintSpeed: 6.0,

  rollStaminaCost: 35,
  lightAttackStaminaCost: 20,
  heavyAttackStaminaCost: 35,
  sprintStaminaCostPerSec: 15,
  guardStaminaCostMultiplier: 0.8,
};
```

### 3.2 스탯 매니저 클래스

```typescript
// src/combat/StatsManager.ts

export class StatsManager {
  private stats: PlayerStats;
  private staminaRegenTimer: number = 0;
  private isRegenerating: boolean = true;

  constructor(initialStats: PlayerStats = DEFAULT_PLAYER_STATS) {
    this.stats = { ...initialStats };
  }

  // HP 관련
  takeDamage(amount: number): { actualDamage: number; isDead: boolean } {
    const actualDamage = Math.max(1, amount - this.stats.defense);
    this.stats.currentHP = Math.max(0, this.stats.currentHP - actualDamage);
    return {
      actualDamage,
      isDead: this.stats.currentHP <= 0,
    };
  }

  heal(amount: number): void {
    this.stats.currentHP = Math.min(this.stats.maxHP, this.stats.currentHP + amount);
  }

  // Stamina 관련
  consumeStamina(amount: number): boolean {
    if (this.stats.currentStamina < amount) return false;
    this.stats.currentStamina -= amount;
    this.staminaRegenTimer = this.stats.staminaRegenDelay;
    this.isRegenerating = false;
    return true;
  }

  hasStamina(amount: number): boolean {
    return this.stats.currentStamina >= amount;
  }

  updateStamina(deltaTime: number, isGuarding: boolean): void {
    if (!this.isRegenerating) {
      this.staminaRegenTimer -= deltaTime;
      if (this.staminaRegenTimer <= 0) {
        this.isRegenerating = true;
      }
      return;
    }

    const regenRate = isGuarding
      ? this.stats.staminaRegenGuardRate
      : this.stats.staminaRegenRate;

    this.stats.currentStamina = Math.min(
      this.stats.maxStamina,
      this.stats.currentStamina + regenRate * deltaTime
    );
  }

  // Getters
  getHP(): number { return this.stats.currentHP; }
  getMaxHP(): number { return this.stats.maxHP; }
  getStamina(): number { return this.stats.currentStamina; }
  getMaxStamina(): number { return this.stats.maxStamina; }
  getHPPercent(): number { return this.stats.currentHP / this.stats.maxHP; }
  getStaminaPercent(): number { return this.stats.currentStamina / this.stats.maxStamina; }

  // Reset (체크포인트 리스폰 시)
  reset(): void {
    this.stats.currentHP = this.stats.maxHP;
    this.stats.currentStamina = this.stats.maxStamina;
    this.isRegenerating = true;
    this.staminaRegenTimer = 0;
  }
}
```

### 3.3 밸런스 수치표

| 항목 | 값 | 비고 |
|------|-----|------|
| HP | 100 | 보스 3~4회 피격 시 사망 |
| Stamina | 100 | - |
| Stamina 회복 (기본) | 25/초 | 약 4초에 풀 회복 |
| Stamina 회복 (방어) | 12/초 | 약 8초에 풀 회복 |
| 회복 딜레이 | 0.5초 | 소모 후 대기 시간 |
| 구르기 비용 | 35 | 연속 2회 후 회복 필요 |
| 약공격 비용 | 20 | 연속 5회 가능 |
| 강공격 비용 | 35 | 연속 2회 후 회복 필요 |
| 질주 비용 | 15/초 | 약 6.6초 연속 질주 |
| 막기 피격 비용 | 피해량 x 0.8 | 20 데미지 = 16 스태미나 |
| 걷기 속도 | 2.5 m/s | 락온 시 |
| 달리기 속도 | 4.5 m/s | 비락온 기본 |
| 질주 속도 | 6.0 m/s | 최고 속도 |

---

## 4. 애니메이션 시스템

### 4.1 AnimationMixer 래퍼

```typescript
// src/animation/AnimationController.ts

import * as THREE from 'three';

export interface AnimationPlayOptions {
  fadeIn?: number;      // 페이드인 시간 (초)
  fadeOut?: number;     // 페이드아웃 시간 (초)
  loop?: boolean;       // 반복 여부
  speed?: number;       // 재생 속도 배율
  onComplete?: () => void;
}

export class AnimationController {
  private mixer: THREE.AnimationMixer;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentAction: THREE.AnimationAction | null = null;
  private currentName: string = '';

  constructor(model: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(model);
  }

  // 애니메이션 클립 등록
  addAnimation(name: string, clip: THREE.AnimationClip): void {
    const action = this.mixer.clipAction(clip);
    this.actions.set(name, action);
  }

  // 여러 클립 일괄 등록 (GLB에서 로드 시)
  addAnimations(clips: THREE.AnimationClip[]): void {
    for (const clip of clips) {
      this.addAnimation(clip.name, clip);
    }
  }

  // 애니메이션 재생
  play(name: string, options: AnimationPlayOptions = {}): void {
    const {
      fadeIn = 0.2,
      fadeOut = 0.2,
      loop = true,
      speed = 1.0,
      onComplete,
    } = options;

    const newAction = this.actions.get(name);
    if (!newAction) {
      console.warn(`Animation "${name}" not found`);
      return;
    }

    // 이미 같은 애니메이션이 재생 중이면 무시
    if (this.currentName === name && this.currentAction?.isRunning()) {
      return;
    }

    // 이전 애니메이션 페이드아웃
    if (this.currentAction) {
      this.currentAction.fadeOut(fadeOut);
    }

    // 새 애니메이션 설정
    newAction.reset();
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    newAction.clampWhenFinished = !loop;
    newAction.timeScale = speed;
    newAction.fadeIn(fadeIn);
    newAction.play();

    this.currentAction = newAction;
    this.currentName = name;

    // 완료 콜백 (루프가 아닐 때)
    if (!loop && onComplete) {
      const onFinished = (event: { action: THREE.AnimationAction }) => {
        if (event.action === newAction) {
          onComplete();
          this.mixer.removeEventListener('finished', onFinished);
        }
      };
      this.mixer.addEventListener('finished', onFinished);
    }
  }

  // 매 프레임 업데이트
  update(deltaTime: number): void {
    this.mixer.update(deltaTime);
  }

  // 현재 애니메이션 진행률 (0~1)
  getProgress(): number {
    if (!this.currentAction) return 0;
    const clip = this.currentAction.getClip();
    return (this.currentAction.time % clip.duration) / clip.duration;
  }

  // 현재 애니메이션 이름
  getCurrentAnimation(): string {
    return this.currentName;
  }

  // 애니메이션 재생 중 여부
  isPlaying(name?: string): boolean {
    if (name) {
      return this.currentName === name && (this.currentAction?.isRunning() ?? false);
    }
    return this.currentAction?.isRunning() ?? false;
  }
}
```

### 4.2 상태-애니메이션 매핑

```typescript
// src/animation/StateAnimationMap.ts

import { PlayerStateType } from '../fsm/PlayerState';

export interface AnimationMapping {
  animation: string;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
  speed: number;
}

export const PLAYER_ANIMATION_MAP: Record<PlayerStateType, AnimationMapping> = {
  [PlayerStateType.Idle]: {
    animation: 'Idle',
    fadeIn: 0.2,
    fadeOut: 0.2,
    loop: true,
    speed: 1.0,
  },
  [PlayerStateType.Walk]: {
    animation: 'Walk',
    fadeIn: 0.15,
    fadeOut: 0.15,
    loop: true,
    speed: 1.0,
  },
  [PlayerStateType.Run]: {
    animation: 'Run',
    fadeIn: 0.15,
    fadeOut: 0.15,
    loop: true,
    speed: 1.0,
  },
  [PlayerStateType.Sprint]: {
    animation: 'Sprint',
    fadeIn: 0.1,
    fadeOut: 0.15,
    loop: true,
    speed: 1.0,
  },
  [PlayerStateType.Roll]: {
    animation: 'Roll',
    fadeIn: 0.1,
    fadeOut: 0.2,
    loop: false,
    speed: 1.0,
  },
  [PlayerStateType.Backstep]: {
    animation: 'Backstep',
    fadeIn: 0.1,
    fadeOut: 0.2,
    loop: false,
    speed: 1.0,
  },
  [PlayerStateType.AttackLight]: {
    animation: 'Attack_Light_1', // Attack_Light_2, Attack_Light_3 for combo
    fadeIn: 0.05,
    fadeOut: 0.2,
    loop: false,
    speed: 1.0,
  },
  [PlayerStateType.AttackHeavy]: {
    animation: 'Attack_Heavy',
    fadeIn: 0.1,
    fadeOut: 0.25,
    loop: false,
    speed: 0.9,
  },
  [PlayerStateType.Guard]: {
    animation: 'Guard_Idle',
    fadeIn: 0.1,
    fadeOut: 0.15,
    loop: true,
    speed: 1.0,
  },
  [PlayerStateType.GuardBreak]: {
    animation: 'Guard_Break',
    fadeIn: 0.05,
    fadeOut: 0.3,
    loop: false,
    speed: 1.0,
  },
  [PlayerStateType.Parry]: {
    animation: 'Parry',
    fadeIn: 0.05,
    fadeOut: 0.2,
    loop: false,
    speed: 1.2,
  },
  [PlayerStateType.HitStun]: {
    animation: 'Hit_React',
    fadeIn: 0.05,
    fadeOut: 0.2,
    loop: false,
    speed: 1.0,
  },
  [PlayerStateType.Death]: {
    animation: 'Death',
    fadeIn: 0.1,
    fadeOut: 0.0,
    loop: false,
    speed: 0.8,
  },
};
```

### 4.3 애니메이션 이벤트 시스템

공격 히트박스 활성화, 사운드 재생 등을 위한 애니메이션 이벤트 시스템:

```typescript
// src/animation/AnimationEvents.ts

export interface AnimationEvent {
  animation: string;
  time: number;          // 초 단위 발동 시점
  type: 'hitbox_start' | 'hitbox_end' | 'sound' | 'vfx' | 'footstep';
  data?: any;
}

export const ANIMATION_EVENTS: AnimationEvent[] = [
  // 약공격 1타
  { animation: 'Attack_Light_1', time: 0.15, type: 'hitbox_start' },
  { animation: 'Attack_Light_1', time: 0.30, type: 'hitbox_end' },
  { animation: 'Attack_Light_1', time: 0.10, type: 'sound', data: 'sword_swing' },

  // 약공격 2타
  { animation: 'Attack_Light_2', time: 0.12, type: 'hitbox_start' },
  { animation: 'Attack_Light_2', time: 0.28, type: 'hitbox_end' },

  // 강공격
  { animation: 'Attack_Heavy', time: 0.35, type: 'hitbox_start' },
  { animation: 'Attack_Heavy', time: 0.55, type: 'hitbox_end' },

  // 발소리
  { animation: 'Run', time: 0.25, type: 'footstep' },
  { animation: 'Run', time: 0.75, type: 'footstep' },
  { animation: 'Walk', time: 0.35, type: 'footstep' },
  { animation: 'Walk', time: 0.85, type: 'footstep' },
];

export class AnimationEventEmitter {
  private events: AnimationEvent[];
  private firedEvents: Set<string> = new Set();
  private callbacks: Map<string, ((event: AnimationEvent) => void)[]> = new Map();

  constructor(events: AnimationEvent[]) {
    this.events = events;
  }

  on(type: string, callback: (event: AnimationEvent) => void): void {
    if (!this.callbacks.has(type)) {
      this.callbacks.set(type, []);
    }
    this.callbacks.get(type)!.push(callback);
  }

  update(animationName: string, currentTime: number): void {
    for (const event of this.events) {
      if (event.animation !== animationName) continue;

      const eventKey = `${event.animation}_${event.time}_${event.type}`;

      if (currentTime >= event.time && !this.firedEvents.has(eventKey)) {
        this.firedEvents.add(eventKey);
        const callbacks = this.callbacks.get(event.type);
        if (callbacks) {
          callbacks.forEach(cb => cb(event));
        }
      }
    }
  }

  resetForAnimation(animationName: string): void {
    // 해당 애니메이션의 이벤트 초기화
    for (const event of this.events) {
      if (event.animation === animationName) {
        const eventKey = `${event.animation}_${event.time}_${event.type}`;
        this.firedEvents.delete(eventKey);
      }
    }
  }
}
```

---

## 5. 보스 AI 로직 (FSM)

### 5.1 보스 상태 다이어그램

```
                                    ┌───────────────────────────────┐
                                    │                               │
                                    ▼                               │
                              ┌───────────┐                         │
                         ┌───►│Idle/      │◄────────────────────────┤
                         │    │Threaten   │                         │
                         │    └─────┬─────┘                         │
                         │          │ 플레이어 감지 (거리 < 15m)    │
                         │          ▼                               │
                         │    ┌───────────┐                         │
                         │    │  Chase    │◄────────────────────────┤
                         │    └─────┬─────┘                         │
                         │          │ 공격 사거리 도달 (거리 < 4m)  │
                         │          ▼                               │
                         │    ┌───────────┐                         │
                         │    │ Attack    │                         │
                         │    │ Select    │                         │
                         │    └─────┬─────┘                         │
                         │          │ 패턴 선택 완료                │
                         │          ▼                               │
                         │    ┌───────────┐                         │
                         │    │Attacking  │                         │
                         │    └─────┬─────┘                         │
                         │          │ 공격 애니메이션 종료          │
                         │          ▼                               │
                         │    ┌───────────┐                         │
                         │    │ Recover   │────────────────────────►│
                         │    └─────┬─────┘   회복 완료             │
                         │          │                               │
                         │          │ 피격 (특정 조건)              │
                         │          ▼                               │
                         │    ┌───────────┐                         │
                         │    │ Stagger   │────────────────────────►│
                         │    └───────────┘   경직 종료             │
                         │                                          │
                         │    ┌───────────┐   HP <= 0               │
                         └────│   Dead    │◄────────────────────────┘
                              └───────────┘
```

### 5.2 보스 상태 정의

```typescript
// src/fsm/BossState.ts

export enum BossStateType {
  Idle = 'Idle',
  Threaten = 'Threaten',
  Chase = 'Chase',
  AttackSelect = 'AttackSelect',
  Attacking = 'Attacking',
  Recover = 'Recover',
  Stagger = 'Stagger',
  Dead = 'Dead',
}

export interface BossContext {
  entity: BossEntity;
  target: PlayerEntity | null;
  physics: PhysicsController;
  animation: AnimationController;
  combat: CombatComponent;
  fsm: StateMachine<BossContext>;
  patterns: PatternManager;

  // 센서 데이터
  distanceToPlayer: number;
  angleToPlayer: number;
  playerInSight: boolean;

  // 상태 변수
  currentPattern: AttackPattern | null;
  lastPatternTime: Map<string, number>;
  enrageThreshold: number; // HP 50%
  isEnraged: boolean;
}
```

### 5.3 보스 상태 전이 테이블

| 현재 상태 | 전이 조건 | 다음 상태 | 비고 |
|-----------|-----------|-----------|------|
| Idle/Threaten | 플레이어 감지 (거리 < 15m) | Chase | - |
| Chase | 공격 사거리 도달 (거리 < 4m) | AttackSelect | - |
| Chase | 플레이어 탈출 (거리 > 20m) | Idle | 리셋 |
| AttackSelect | 패턴 선택 완료 | Attacking | 패턴 큐에서 선택 |
| Attacking | 애니메이션 종료 | Recover | - |
| Attacking | 피격 (약점/낙하공격) | Stagger | 특수 조건 |
| Recover | 회복 시간 종료 | Chase 또는 AttackSelect | 거리에 따라 |
| Stagger | 경직 시간 종료 | Chase | - |
| Any (HP > 0) | HP <= 0 | Dead | - |

### 5.4 Chase 상태 구현 예시

```typescript
// src/fsm/states/boss/ChaseState.ts

export class BossChaseState implements State<BossContext> {
  name = BossStateType.Chase;

  private moveSpeed = 3.5; // m/s
  private rotationSpeed = 4.0; // rad/s
  private attackRange = 4.0; // m
  private loseRange = 20.0; // m

  onEnter(ctx: BossContext): void {
    ctx.animation.play('Walk', { loop: true, speed: 1.0 });
  }

  onUpdate(ctx: BossContext, deltaTime: number): void {
    if (!ctx.target) {
      ctx.fsm.setState(BossStateType.Idle);
      return;
    }

    // 플레이어 방향 계산
    const toPlayer = ctx.target.getPosition()
      .clone()
      .sub(ctx.entity.getPosition());
    toPlayer.y = 0; // 수평면만

    const distance = toPlayer.length();
    ctx.distanceToPlayer = distance;

    // 탈출 체크
    if (distance > this.loseRange) {
      ctx.fsm.setState(BossStateType.Idle);
      return;
    }

    // 공격 사거리 체크
    if (distance <= this.attackRange) {
      ctx.fsm.setState(BossStateType.AttackSelect);
      return;
    }

    // 회전 (플레이어 방향으로)
    const targetRotation = Math.atan2(toPlayer.x, toPlayer.z);
    const currentRotation = ctx.entity.getRotationY();
    const rotationDiff = this.normalizeAngle(targetRotation - currentRotation);

    const maxRotation = this.rotationSpeed * deltaTime;
    const actualRotation = Math.sign(rotationDiff) * Math.min(Math.abs(rotationDiff), maxRotation);
    ctx.entity.rotateY(actualRotation);

    // 이동
    const forward = ctx.entity.getForward();
    const velocity = forward.multiplyScalar(this.moveSpeed);
    ctx.physics.setVelocity(velocity);
  }

  onExit(ctx: BossContext): void {
    ctx.physics.setVelocity(new THREE.Vector3(0, 0, 0));
  }

  canTransitionTo(nextState: string, ctx: BossContext): boolean {
    return true;
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }
}
```

---

## 6. 보스 패턴 시스템

### 6.1 패턴 데이터 구조

```typescript
// src/ai/patterns/AttackPattern.ts

export interface AttackPattern {
  id: string;
  name: string;

  // 사용 조건
  minRange: number;         // 최소 사거리 (m)
  maxRange: number;         // 최대 사거리 (m)
  preferredAngle: number;   // 선호 각도 (도)
  angleThreshold: number;   // 각도 허용 오차 (도)
  cooldown: number;         // 재사용 대기 (초)
  priority: number;         // 우선순위 (높을수록 우선)

  // 분노 모드 전용
  requiresEnrage: boolean;

  // 애니메이션
  animation: string;
  animationSpeed: number;

  // 히트박스
  hitboxes: HitboxData[];

  // 타이밍
  windupTime: number;       // 준비 동작 시간 (초)
  activeTime: number;       // 공격 활성 시간 (초)
  recoveryTime: number;     // 후딜레이 (초)

  // 이동
  movementDuringAttack?: {
    type: 'forward' | 'lunge' | 'none';
    distance: number;
    speed: number;
  };

  // 데미지
  damage: number;
  knockback: number;
}

export interface HitboxData {
  type: 'sphere' | 'capsule' | 'box';
  offset: THREE.Vector3;
  size: THREE.Vector3;       // sphere: x=radius, capsule: x=radius y=height
  activeStart: number;       // 활성 시작 (초)
  activeEnd: number;         // 활성 종료 (초)
  damageMultiplier: number;  // 데미지 배율
}
```

### 6.2 6개 보스 패턴 정의

```typescript
// src/ai/patterns/GateWardenPatterns.ts

export const GATE_WARDEN_PATTERNS: AttackPattern[] = [
  // 패턴 1: 해머 수직 내려찍기
  {
    id: 'hammer_slam',
    name: '해머 내려찍기',
    minRange: 0,
    maxRange: 3.5,
    preferredAngle: 0,
    angleThreshold: 30,
    cooldown: 3.0,
    priority: 3,
    requiresEnrage: false,
    animation: 'Attack_Slam',
    animationSpeed: 1.0,
    hitboxes: [
      {
        type: 'sphere',
        offset: new THREE.Vector3(0, 0, 2.5),
        size: new THREE.Vector3(1.5, 0, 0),
        activeStart: 0.6,
        activeEnd: 0.8,
        damageMultiplier: 1.0,
      },
      // 충격파 (추가 히트박스)
      {
        type: 'sphere',
        offset: new THREE.Vector3(0, 0, 2.5),
        size: new THREE.Vector3(2.5, 0, 0),
        activeStart: 0.8,
        activeEnd: 0.9,
        damageMultiplier: 0.5,
      },
    ],
    windupTime: 0.5,
    activeTime: 0.4,
    recoveryTime: 1.0,
    movementDuringAttack: {
      type: 'forward',
      distance: 1.0,
      speed: 2.0,
    },
    damage: 35,
    knockback: 3.0,
  },

  // 패턴 2: 해머 좌우 휘두르기
  {
    id: 'hammer_sweep',
    name: '해머 휘두르기',
    minRange: 0,
    maxRange: 4.0,
    preferredAngle: 0,
    angleThreshold: 60,
    cooldown: 2.5,
    priority: 4,
    requiresEnrage: false,
    animation: 'Attack_Sweep',
    animationSpeed: 1.0,
    hitboxes: [
      {
        type: 'capsule',
        offset: new THREE.Vector3(0, 1.5, 2.0),
        size: new THREE.Vector3(1.0, 3.0, 0),
        activeStart: 0.4,
        activeEnd: 0.7,
        damageMultiplier: 1.0,
      },
    ],
    windupTime: 0.3,
    activeTime: 0.4,
    recoveryTime: 0.8,
    damage: 28,
    knockback: 4.0,
  },

  // 패턴 3: 점프 후 착지 충격
  {
    id: 'jump_slam',
    name: '점프 내려찍기',
    minRange: 4.0,
    maxRange: 10.0,
    preferredAngle: 0,
    angleThreshold: 45,
    cooldown: 6.0,
    priority: 5,
    requiresEnrage: false,
    animation: 'Attack_Jump_Slam',
    animationSpeed: 1.0,
    hitboxes: [
      {
        type: 'sphere',
        offset: new THREE.Vector3(0, 0, 0),
        size: new THREE.Vector3(4.0, 0, 0), // 넓은 범위
        activeStart: 1.2,
        activeEnd: 1.4,
        damageMultiplier: 1.2,
      },
    ],
    windupTime: 0.5,
    activeTime: 1.0,
    recoveryTime: 1.5,
    movementDuringAttack: {
      type: 'lunge',
      distance: 8.0,
      speed: 12.0,
    },
    damage: 40,
    knockback: 5.0,
  },

  // 패턴 4: 후방 밟기 (카운터)
  {
    id: 'back_stomp',
    name: '후방 밟기',
    minRange: 0,
    maxRange: 2.5,
    preferredAngle: 180, // 후방
    angleThreshold: 60,
    cooldown: 4.0,
    priority: 6, // 높은 우선순위 (카운터)
    requiresEnrage: false,
    animation: 'Attack_Back_Stomp',
    animationSpeed: 1.2,
    hitboxes: [
      {
        type: 'sphere',
        offset: new THREE.Vector3(0, 0, -2.0),
        size: new THREE.Vector3(2.0, 0, 0),
        activeStart: 0.3,
        activeEnd: 0.5,
        damageMultiplier: 1.0,
      },
    ],
    windupTime: 0.2,
    activeTime: 0.3,
    recoveryTime: 0.6,
    damage: 25,
    knockback: 4.0,
  },

  // 패턴 5: 앞으로 밀치기/돌진
  {
    id: 'charge',
    name: '돌진',
    minRange: 5.0,
    maxRange: 12.0,
    preferredAngle: 0,
    angleThreshold: 20,
    cooldown: 5.0,
    priority: 4,
    requiresEnrage: false,
    animation: 'Attack_Charge',
    animationSpeed: 1.0,
    hitboxes: [
      {
        type: 'capsule',
        offset: new THREE.Vector3(0, 1.5, 1.0),
        size: new THREE.Vector3(1.5, 2.5, 0),
        activeStart: 0.3,
        activeEnd: 1.0,
        damageMultiplier: 1.0,
      },
    ],
    windupTime: 0.4,
    activeTime: 0.8,
    recoveryTime: 1.0,
    movementDuringAttack: {
      type: 'lunge',
      distance: 10.0,
      speed: 15.0,
    },
    damage: 30,
    knockback: 6.0,
  },

  // 패턴 6: 분노 콤보 (HP 50% 이하)
  {
    id: 'rage_combo',
    name: '분노 연속 공격',
    minRange: 0,
    maxRange: 4.0,
    preferredAngle: 0,
    angleThreshold: 45,
    cooldown: 8.0,
    priority: 7, // 최고 우선순위
    requiresEnrage: true,
    animation: 'Attack_Rage_Combo',
    animationSpeed: 1.3, // 빠른 속도
    hitboxes: [
      // 1타
      {
        type: 'capsule',
        offset: new THREE.Vector3(0, 1.5, 2.0),
        size: new THREE.Vector3(1.0, 2.5, 0),
        activeStart: 0.3,
        activeEnd: 0.5,
        damageMultiplier: 0.8,
      },
      // 2타
      {
        type: 'capsule',
        offset: new THREE.Vector3(0, 1.5, 2.5),
        size: new THREE.Vector3(1.2, 2.5, 0),
        activeStart: 0.8,
        activeEnd: 1.0,
        damageMultiplier: 0.8,
      },
      // 3타 (피니시)
      {
        type: 'sphere',
        offset: new THREE.Vector3(0, 0, 3.0),
        size: new THREE.Vector3(2.0, 0, 0),
        activeStart: 1.4,
        activeEnd: 1.6,
        damageMultiplier: 1.2,
      },
    ],
    windupTime: 0.2,
    activeTime: 1.5,
    recoveryTime: 1.5,
    movementDuringAttack: {
      type: 'forward',
      distance: 3.0,
      speed: 4.0,
    },
    damage: 25, // 기본 데미지 (배율 적용)
    knockback: 3.0,
  },
];
```

### 6.3 패턴 선택 알고리즘

```typescript
// src/ai/patterns/PatternManager.ts

export class PatternManager {
  private patterns: AttackPattern[];
  private cooldowns: Map<string, number> = new Map();
  private lastUsedPattern: string | null = null;

  constructor(patterns: AttackPattern[]) {
    this.patterns = patterns;
    patterns.forEach(p => this.cooldowns.set(p.id, 0));
  }

  selectPattern(ctx: BossContext): AttackPattern | null {
    const availablePatterns = this.patterns.filter(pattern => {
      // 쿨다운 체크
      const cooldown = this.cooldowns.get(pattern.id) ?? 0;
      if (cooldown > 0) return false;

      // 분노 모드 체크
      if (pattern.requiresEnrage && !ctx.isEnraged) return false;

      // 거리 체크
      if (ctx.distanceToPlayer < pattern.minRange) return false;
      if (ctx.distanceToPlayer > pattern.maxRange) return false;

      // 각도 체크
      const angleDiff = Math.abs(ctx.angleToPlayer - pattern.preferredAngle);
      if (angleDiff > pattern.angleThreshold) return false;

      return true;
    });

    if (availablePatterns.length === 0) return null;

    // 우선순위 + 약간의 랜덤성
    const totalPriority = availablePatterns.reduce((sum, p) => sum + p.priority, 0);
    let random = Math.random() * totalPriority;

    for (const pattern of availablePatterns) {
      random -= pattern.priority;
      if (random <= 0) {
        return pattern;
      }
    }

    return availablePatterns[0];
  }

  startPattern(patternId: string): void {
    this.lastUsedPattern = patternId;
  }

  endPattern(patternId: string): void {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      this.cooldowns.set(patternId, pattern.cooldown);
    }
  }

  update(deltaTime: number): void {
    for (const [id, cooldown] of this.cooldowns) {
      if (cooldown > 0) {
        this.cooldowns.set(id, Math.max(0, cooldown - deltaTime));
      }
    }
  }
}
```

---

## 7. 일반 적 AI

### 7.1 일반 적 상태 머신 (간소화)

```
              ┌───────────┐
              │   Idle    │◄─────────────────────┐
              └─────┬─────┘                      │
                    │ 플레이어 감지              │
                    ▼                            │
              ┌───────────┐                      │
              │  Chase    │                      │
              └─────┬─────┘                      │
                    │ 공격 사거리                │
                    ▼                            │
              ┌───────────┐                      │
              │  Attack   │──────────────────────┤
              └─────┬─────┘   공격 종료          │
                    │                            │
                    │ 피격                       │
                    ▼                            │
              ┌───────────┐                      │
              │ HitStun   │──────────────────────┤
              └─────┬─────┘   경직 종료          │
                    │                            │
                    │ HP <= 0                    │
                    ▼                            │
              ┌───────────┐                      │
              │   Dead    │                      │
              └───────────┘                      │
```

### 7.2 일반 적 데이터 구조

```typescript
// src/ai/EnemyData.ts

export interface EnemyData {
  id: string;
  name: string;

  // 스탯
  maxHP: number;
  damage: number;
  defense: number;
  poise: number;

  // 이동
  walkSpeed: number;
  runSpeed: number;

  // 감지
  sightRange: number;      // 시야 거리
  sightAngle: number;      // 시야각 (도)
  hearingRange: number;    // 청각 거리 (플레이어 달리기 등)
  loseTargetRange: number; // 타겟 놓치는 거리

  // 공격
  attackRange: number;
  attackCooldown: number;
  attacks: EnemyAttack[];

  // 애니메이션
  animations: {
    idle: string;
    walk: string;
    run: string;
    attack: string;
    hit: string;
    death: string;
  };

  // 모델
  modelPath: string;
  scale: number;
  colliderRadius: number;
  colliderHeight: number;
}

export interface EnemyAttack {
  animation: string;
  damage: number;
  range: number;
  hitboxStart: number;
  hitboxEnd: number;
  hitboxOffset: THREE.Vector3;
  hitboxSize: THREE.Vector3;
}
```

### 7.3 튜토리얼 적 (좀비) 정의

```typescript
// src/content/enemies/ZombieEnemy.ts

export const ZOMBIE_ENEMY: EnemyData = {
  id: 'zombie_basic',
  name: '언데드 시체',

  maxHP: 40,
  damage: 15,
  defense: 2,
  poise: 10,

  walkSpeed: 1.5,
  runSpeed: 3.0,

  sightRange: 8.0,
  sightAngle: 120,
  hearingRange: 5.0,
  loseTargetRange: 15.0,

  attackRange: 2.0,
  attackCooldown: 2.0,

  attacks: [
    {
      animation: 'Attack_Claw',
      damage: 15,
      range: 2.0,
      hitboxStart: 0.3,
      hitboxEnd: 0.5,
      hitboxOffset: new THREE.Vector3(0, 1.0, 1.2),
      hitboxSize: new THREE.Vector3(0.8, 0, 0),
    },
  ],

  animations: {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    attack: 'Attack_Claw',
    hit: 'Hit_React',
    death: 'Death',
  },

  modelPath: '/assets/models/zombie.glb',
  scale: 1.0,
  colliderRadius: 0.4,
  colliderHeight: 1.8,
};
```

### 7.4 일반 적 AI 컨트롤러

```typescript
// src/ai/EnemyAI.ts

export class EnemyAI {
  private entity: EnemyEntity;
  private fsm: StateMachine<EnemyContext>;
  private data: EnemyData;
  private target: PlayerEntity | null = null;

  constructor(entity: EnemyEntity, data: EnemyData) {
    this.entity = entity;
    this.data = data;
    this.fsm = this.createFSM();
  }

  private createFSM(): StateMachine<EnemyContext> {
    const fsm = new StateMachine<EnemyContext>(this.createContext());

    fsm.addState(new EnemyIdleState());
    fsm.addState(new EnemyChaseState());
    fsm.addState(new EnemyAttackState());
    fsm.addState(new EnemyHitStunState());
    fsm.addState(new EnemyDeadState());

    fsm.setState('Idle');
    return fsm;
  }

  update(deltaTime: number, player: PlayerEntity): void {
    // 플레이어 감지
    this.updateSensors(player);

    // FSM 업데이트
    this.fsm.update(deltaTime);
  }

  private updateSensors(player: PlayerEntity): void {
    const toPlayer = player.getPosition()
      .clone()
      .sub(this.entity.getPosition());

    const distance = toPlayer.length();
    const angle = this.calculateAngle(toPlayer);

    // 시야 내 감지
    if (distance <= this.data.sightRange &&
        angle <= this.data.sightAngle / 2) {
      this.target = player;
    }

    // 청각 감지 (플레이어가 달리고 있을 때)
    if (distance <= this.data.hearingRange && player.isRunning()) {
      this.target = player;
    }

    // 타겟 놓침
    if (this.target && distance > this.data.loseTargetRange) {
      this.target = null;
    }
  }

  private calculateAngle(direction: THREE.Vector3): number {
    const forward = this.entity.getForward();
    forward.y = 0;
    direction.y = 0;

    const dot = forward.dot(direction.normalize());
    return Math.acos(Math.min(1, Math.max(-1, dot))) * (180 / Math.PI);
  }
}
```

---

## 8. 디렉터리 구조

최종 디렉터리 구조:

```
src/
├── main.ts                      # 엔트리 포인트 (수정)
├── core/
│   ├── Scene.ts                 # 씬 관리 (기존)
│   ├── Camera.ts                # 3인칭 카메라 (수정 필요)
│   ├── Audio.ts                 # 오디오 시스템 (기존)
│   └── GameLoop.ts              # 게임 루프 (신규)
├── input/
│   ├── InputManager.ts          # 키/마우스 입력 관리
│   ├── InputBuffer.ts           # 입력 버퍼 (선입력)
│   └── KeyBindings.ts           # 키 프리셋 정의
├── entities/
│   ├── Entity.ts                # 기본 엔티티 클래스
│   ├── Player.ts                # 플레이어 엔티티
│   ├── Enemy.ts                 # 일반 적 엔티티
│   └── Boss.ts                  # 보스 엔티티
├── fsm/
│   ├── StateMachine.ts          # FSM 프레임워크
│   ├── PlayerState.ts           # 플레이어 상태 열거형
│   ├── BossState.ts             # 보스 상태 열거형
│   ├── EnemyState.ts            # 적 상태 열거형
│   └── states/
│       ├── player/
│       │   ├── IdleState.ts
│       │   ├── WalkState.ts
│       │   ├── RunState.ts
│       │   ├── SprintState.ts
│       │   ├── RollState.ts
│       │   ├── BackstepState.ts
│       │   ├── AttackLightState.ts
│       │   ├── AttackHeavyState.ts
│       │   ├── GuardState.ts
│       │   ├── ParryState.ts
│       │   ├── HitStunState.ts
│       │   └── DeathState.ts
│       ├── boss/
│       │   ├── IdleState.ts
│       │   ├── ChaseState.ts
│       │   ├── AttackSelectState.ts
│       │   ├── AttackingState.ts
│       │   ├── RecoverState.ts
│       │   ├── StaggerState.ts
│       │   └── DeadState.ts
│       └── enemy/
│           ├── IdleState.ts
│           ├── ChaseState.ts
│           ├── AttackState.ts
│           ├── HitStunState.ts
│           └── DeadState.ts
├── animation/
│   ├── AnimationController.ts   # AnimationMixer 래퍼
│   ├── StateAnimationMap.ts     # 상태-애니메이션 매핑
│   └── AnimationEvents.ts       # 애니메이션 이벤트
├── combat/
│   ├── Stats.ts                 # 스탯 데이터 구조
│   ├── StatsManager.ts          # 스탯 관리
│   ├── DamageSystem.ts          # 데미지 계산
│   ├── HitboxManager.ts         # 히트박스 관리
│   └── CombatFeedback.ts        # 히트스톱, 카메라 쉐이크
├── ai/
│   ├── EnemyAI.ts               # 일반 적 AI
│   ├── BossAI.ts                # 보스 AI
│   ├── Sensor.ts                # 시야/청각 센서
│   └── patterns/
│       ├── AttackPattern.ts     # 패턴 인터페이스
│       ├── PatternManager.ts    # 패턴 선택/관리
│       └── GateWardenPatterns.ts# 보스 패턴 정의
├── physics/
│   ├── Physics.ts               # Rapier 월드 (기존, 확장)
│   ├── CharacterController.ts   # KCC (Kinematic Character Controller)
│   └── HitboxCollider.ts        # 히트박스 콜라이더
├── effects/
│   ├── Particles.ts             # 파티클 (기존)
│   └── PostProcessing.ts        # 후처리 (기존)
├── ui/
│   ├── Menu.ts                  # 메뉴 (기존)
│   ├── HUD.ts                   # HP/스태미나 바
│   ├── LockOnIndicator.ts       # 락온 표시
│   └── BossHealthBar.ts         # 보스 HP 바
└── content/
    ├── enemies/
    │   └── ZombieEnemy.ts       # 좀비 적 데이터
    ├── bosses/
    │   └── GateWarden.ts        # 보스 데이터
    └── player/
        └── PlayerConfig.ts      # 플레이어 설정
```

---

## 9. 구현 순서

PRD.md의 마일스톤을 기반으로, 캐릭터/AI 시스템에 특화된 구현 순서:

### Phase 1: 기반 시스템 (1-2주)

1. **FSM 프레임워크 구현**
   - `src/fsm/StateMachine.ts`
   - 상태 인터페이스 정의

2. **입력 시스템 구현**
   - `src/input/InputManager.ts`
   - `src/input/InputBuffer.ts`
   - Pointer Lock API 연동

3. **캐릭터 컨트롤러 구현**
   - `src/physics/CharacterController.ts`
   - Rapier KCC 패턴 적용

### Phase 2: 플레이어 기본 (2-3주)

4. **플레이어 엔티티**
   - `src/entities/Player.ts`
   - 모델 로딩 (GLB)
   - 기본 이동 (Idle/Walk/Run)

5. **애니메이션 시스템**
   - `src/animation/AnimationController.ts`
   - 상태-애니메이션 연동

6. **플레이어 FSM 상태들**
   - Sprint, Roll, Backstep
   - 무적 프레임 구현

### Phase 3: 전투 시스템 (2-3주)

7. **스탯/밸런스 시스템**
   - `src/combat/Stats.ts`
   - `src/combat/StatsManager.ts`

8. **공격/히트박스**
   - `src/combat/HitboxManager.ts`
   - 캡슐 스윕 판정

9. **전투 피드백**
   - 히트스톱
   - 카메라 쉐이크

### Phase 4: 일반 적 AI (1-2주)

10. **적 엔티티**
    - `src/entities/Enemy.ts`
    - 기본 적 (좀비) 구현

11. **적 AI**
    - `src/ai/EnemyAI.ts`
    - 감지/추적/공격

### Phase 5: 보스 AI (2-3주)

12. **보스 엔티티**
    - `src/entities/Boss.ts`
    - 보스 모델 로딩

13. **보스 FSM**
    - 모든 보스 상태 구현

14. **패턴 시스템**
    - 6개 패턴 구현
    - 패턴 선택 알고리즘

### Phase 6: 통합/폴리시 (1-2주)

15. **UI 통합**
    - HUD, 락온 표시, 보스 HP 바

16. **밸런스 조정**
    - 플레이테스트 기반 수치 조정

17. **버그 수정 및 최적화**

---

## 참고 자료

- PRD.md 섹션 6: 주인공(플레이어) 설계
- PRD.md 섹션 8: 첫 보스 설계
- Three.js AnimationMixer 문서
- Rapier3D 캐릭터 컨트롤러 가이드
- Dark Souls 1 프레임 데이터 분석 (커뮤니티 자료)

---

## 핵심 구현 파일

구현 시 가장 중요한 파일들:

- **src/physics/Physics.ts** - 기존 Rapier 물리 시스템, KCC 확장 필요
- **src/core/Camera.ts** - 3인칭 추적 카메라 + 락온 시스템 확장 필요
- **src/main.ts** - 게임 루프, FSM/입력/엔티티 통합 필요
- **docs/PRD.md** - 상세 요구사항 및 밸런스 수치 참조
