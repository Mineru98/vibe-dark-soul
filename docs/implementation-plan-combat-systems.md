# 전투 시스템 구현 계획서 (Combat Systems Implementation Plan)

작성일: 2026-02-18
참조: PRD.md 섹션 2, 7

---

## 개요

이 문서는 PRD.md의 섹션 2(Soulslike 핵심 디테일 체크리스트)와 섹션 7(전투/피드백 시스템 설계)을 기반으로, Soulslike 게임의 전투 시스템을 three.js + Rapier 환경에서 구현하기 위한 상세 계획을 제공합니다.

---

## 1. 히트 판정 시스템 (Hit Detection System)

### 1.1 개요

PRD 섹션 7.1에 명시된 대로, 메시(mesh) 충돌이 아닌 캡슐 스윕(capsule sweep) 방식으로 무기 히트 판정을 구현합니다.

### 1.2 아키텍처

```
src/
  combat/
    HitDetection.ts      # 히트 판정 핵심 로직
    HitBox.ts            # HitBox/HurtBox 정의
    CapsuleSweep.ts      # 캡슐 스윕 유틸리티
    types.ts             # 전투 관련 타입 정의
```

### 1.3 HitBox/HurtBox 타입 정의

```typescript
// src/combat/types.ts

export interface HitBoxConfig {
  id: string;
  type: 'capsule' | 'box' | 'sphere';
  // 캡슐 파라미터
  radius?: number;      // 캡슐 반지름 (m)
  halfHeight?: number;  // 캡슐 절반 높이 (m)
  // 박스 파라미터
  halfExtents?: { x: number; y: number; z: number };
  // 로컬 오프셋 (본/조인트 기준)
  localOffset: { x: number; y: number; z: number };
  localRotation?: { x: number; y: number; z: number; w: number };
}

export interface HurtBoxConfig extends HitBoxConfig {
  damageMultiplier: number;  // 부위별 피해 배율 (머리: 1.5, 몸통: 1.0 등)
  isWeakPoint: boolean;      // 약점 여부
}

export interface AttackData {
  attackId: string;
  damage: number;
  staminaCost: number;
  poiseBreak: number;       // 경직(포이즈) 데미지
  knockbackForce: number;
  hitStopDuration: number;  // 히트스톱 지속시간 (초)
  // 애니메이션 프레임 기반 활성 구간
  activeFrameStart: number;
  activeFrameEnd: number;
}

export interface HitResult {
  hit: boolean;
  target: Entity | null;
  hitPoint: THREE.Vector3 | null;
  damage: number;
  isCritical: boolean;
}
```

### 1.4 캡슐 스윕 구현

```typescript
// src/combat/CapsuleSweep.ts

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export interface SweepResult {
  hit: boolean;
  collider: RAPIER.Collider | null;
  hitPoint: THREE.Vector3 | null;
  hitNormal: THREE.Vector3 | null;
  timeOfImpact: number;
}

export class CapsuleSweep {
  private world: RAPIER.World;

  constructor(world: RAPIER.World) {
    this.world = world;
  }

  /**
   * 캡슐 형태로 스윕 캐스트 수행
   * @param startPos 시작 위치 (무기 손잡이)
   * @param endPos 끝 위치 (무기 끝)
   * @param radius 캡슐 반지름
   * @param excludeCollider 제외할 콜라이더 (자기 자신)
   */
  sweep(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    radius: number,
    excludeCollider?: RAPIER.Collider
  ): SweepResult {
    // 스윕 방향 및 거리 계산
    const direction = endPos.clone().sub(startPos);
    const distance = direction.length();
    direction.normalize();

    // Rapier ShapeCast 수행
    const shape = new RAPIER.Capsule(0.1, radius);  // 짧은 캡슐
    const shapePos = { x: startPos.x, y: startPos.y, z: startPos.z };
    const shapeRot = { x: 0, y: 0, z: 0, w: 1 };
    const velocity = { x: direction.x * distance, y: direction.y * distance, z: direction.z * distance };

    const hit = this.world.castShape(
      shapePos,
      shapeRot,
      velocity,
      shape,
      { maxToi: 1.0, targetDistance: 0.0 },
      true,  // 솔리드
      excludeCollider ? RAPIER.QueryFilterFlags.EXCLUDE_COLLIDER : 0,
      excludeCollider ? [excludeCollider.handle] : undefined
    );

    if (hit) {
      const hitPoint = new THREE.Vector3(
        startPos.x + direction.x * hit.toi * distance,
        startPos.y + direction.y * hit.toi * distance,
        startPos.z + direction.z * hit.toi * distance
      );

      return {
        hit: true,
        collider: hit.collider,
        hitPoint,
        hitNormal: hit.normal1 ? new THREE.Vector3(hit.normal1.x, hit.normal1.y, hit.normal1.z) : null,
        timeOfImpact: hit.toi
      };
    }

    return { hit: false, collider: null, hitPoint: null, hitNormal: null, timeOfImpact: 1.0 };
  }
}
```

### 1.5 히트 판정 매니저

```typescript
// src/combat/HitDetection.ts

import * as THREE from 'three';
import { CapsuleSweep, SweepResult } from './CapsuleSweep';
import type { AttackData, HitResult } from './types';

export class HitDetectionManager {
  private capsuleSweep: CapsuleSweep;
  private activeAttacks: Map<string, ActiveAttack> = new Map();
  private hitSet: Set<string> = new Set();  // 동일 스윙 중복 히트 방지

  // 무기 샘플 포인트 (손잡이 -> 끝)
  private weaponSamplePoints: THREE.Vector3[] = [];
  private previousSamplePoints: THREE.Vector3[] = [];

  constructor(world: RAPIER.World) {
    this.capsuleSweep = new CapsuleSweep(world);
  }

  /**
   * 공격 시작 - 히트 판정 활성화
   */
  startAttack(attackId: string, attackData: AttackData): void {
    this.hitSet.clear();
    this.activeAttacks.set(attackId, {
      data: attackData,
      currentFrame: 0,
      isActive: false
    });
  }

  /**
   * 매 프레임 히트 판정 업데이트
   * @param weaponBone 무기가 부착된 본의 월드 변환
   * @param weaponLength 무기 길이 (m)
   * @param weaponRadius 무기 히트박스 반지름 (m)
   */
  update(
    attackId: string,
    weaponBone: THREE.Bone,
    weaponLength: number = 1.0,
    weaponRadius: number = 0.08,
    hurtBoxes: Map<string, HurtBox>
  ): HitResult[] {
    const attack = this.activeAttacks.get(attackId);
    if (!attack) return [];

    attack.currentFrame++;

    // 활성 프레임 체크
    const isInActiveFrames =
      attack.currentFrame >= attack.data.activeFrameStart &&
      attack.currentFrame <= attack.data.activeFrameEnd;

    if (!isInActiveFrames) {
      attack.isActive = false;
      return [];
    }

    attack.isActive = true;

    // 무기 월드 위치 계산
    const worldMatrix = new THREE.Matrix4();
    weaponBone.updateWorldMatrix(true, false);
    worldMatrix.copy(weaponBone.matrixWorld);

    // 샘플 포인트 생성 (손잡이부터 끝까지 3-5개)
    const sampleCount = 4;
    const currentSamples: THREE.Vector3[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const t = i / (sampleCount - 1);
      const localPoint = new THREE.Vector3(0, t * weaponLength, 0);  // Y축 기준
      localPoint.applyMatrix4(worldMatrix);
      currentSamples.push(localPoint);
    }

    const results: HitResult[] = [];

    // 이전 프레임과 현재 프레임 사이 스윕
    if (this.previousSamplePoints.length === sampleCount) {
      for (let i = 0; i < sampleCount; i++) {
        const sweepResult = this.capsuleSweep.sweep(
          this.previousSamplePoints[i],
          currentSamples[i],
          weaponRadius
        );

        if (sweepResult.hit && sweepResult.collider) {
          const targetId = this.getEntityIdFromCollider(sweepResult.collider);

          // 중복 히트 방지
          if (targetId && !this.hitSet.has(targetId)) {
            this.hitSet.add(targetId);

            const hurtBox = hurtBoxes.get(targetId);
            const damageMultiplier = hurtBox?.damageMultiplier ?? 1.0;

            results.push({
              hit: true,
              target: this.getEntityFromCollider(sweepResult.collider),
              hitPoint: sweepResult.hitPoint,
              damage: attack.data.damage * damageMultiplier,
              isCritical: hurtBox?.isWeakPoint ?? false
            });
          }
        }
      }
    }

    this.previousSamplePoints = currentSamples;
    return results;
  }

  /**
   * 공격 종료
   */
  endAttack(attackId: string): void {
    this.activeAttacks.delete(attackId);
    this.hitSet.clear();
    this.previousSamplePoints = [];
  }

  private getEntityIdFromCollider(collider: RAPIER.Collider): string | null {
    // Collider의 userData에서 Entity ID 추출
    const userData = collider.parent()?.userData as { entityId?: string };
    return userData?.entityId ?? null;
  }

  private getEntityFromCollider(collider: RAPIER.Collider): Entity | null {
    // EntityManager에서 Entity 조회 (별도 구현 필요)
    return null;
  }
}

interface ActiveAttack {
  data: AttackData;
  currentFrame: number;
  isActive: boolean;
}
```

### 1.6 권장 수치

| 항목 | 권장값 | 비고 |
|------|--------|------|
| 무기 히트박스 반지름 | 0.06-0.10m | 검/도끼 기준 |
| 샘플 포인트 수 | 3-5개 | 무기 길이에 비례 |
| 약공격 활성 프레임 | 8-15 (0.13-0.25초) | 60fps 기준 |
| 강공격 활성 프레임 | 12-24 (0.2-0.4초) | 60fps 기준 |

---

## 2. 스태미나 시스템 (Stamina System)

### 2.1 개요

PRD 섹션 2에 명시된 "스태미나(지구력) 경제"를 구현합니다. 공격/방어/달리기/구르기가 스태미나를 소모하며, 스태미나가 없으면 행동이 제한됩니다.

### 2.2 스태미나 설정

```typescript
// src/combat/StaminaConfig.ts

export const STAMINA_CONFIG = {
  // 기본값 (PRD 섹션 6.2 참조)
  maxStamina: 100,

  // 회복 속도 (초당)
  recoveryRateIdle: 25,      // 정지/걷기 중
  recoveryRateGuard: 12,     // 방어 중
  recoveryRateRun: 0,        // 달리기 중 (회복 없음)
  recoveryDelay: 1.0,        // 소모 후 회복 시작 딜레이 (초)

  // 소모량
  costs: {
    roll: 35,
    backstep: 20,
    lightAttack: 20,
    heavyAttack: 35,
    sprint: 15,              // 초당 소모
    jump: 25,
    guardBase: 0,            // 방어 유지 자체는 무료
  },

  // 방어 시 피해당 스태미나 소모 배율
  guardStaminaMultiplier: 0.8,  // 받은 피해 x 0.8 = 스태미나 소모

  // 행동 제한 임계값
  minimumForAction: {
    roll: 15,                // 최소 이만큼 있어야 구르기 가능
    attack: 10,              // 최소 이만큼 있어야 공격 가능
    sprint: 5,               // 최소 이만큼 있어야 질주 가능
  },

  // 스태미나 고갈 패널티
  exhaustedRecoveryRate: 15,   // 고갈 시 느린 회복
  exhaustedDuration: 0.5,      // 고갈 상태 유지 시간
} as const;
```

### 2.3 스태미나 시스템 구현

```typescript
// src/combat/StaminaSystem.ts

import { STAMINA_CONFIG } from './StaminaConfig';
import { EventEmitter } from '../core/EventEmitter';

export type StaminaState = 'normal' | 'recovering' | 'exhausted';

export interface StaminaEvents {
  'stamina-changed': { current: number; max: number; percentage: number };
  'stamina-exhausted': void;
  'stamina-recovered': void;
  'action-blocked': { action: string; required: number; current: number };
}

export class StaminaSystem extends EventEmitter<StaminaEvents> {
  private currentStamina: number;
  private maxStamina: number;
  private state: StaminaState = 'normal';

  // 회복 딜레이 타이머
  private recoveryDelayTimer: number = 0;
  private lastConsumeTime: number = 0;

  // 현재 행동 상태
  private isGuarding: boolean = false;
  private isSprinting: boolean = false;

  constructor(maxStamina: number = STAMINA_CONFIG.maxStamina) {
    super();
    this.maxStamina = maxStamina;
    this.currentStamina = maxStamina;
  }

  /**
   * 스태미나 소모 시도
   * @returns 소모 성공 여부
   */
  tryConsume(amount: number, actionType: string): boolean {
    const minimumRequired = STAMINA_CONFIG.minimumForAction[actionType as keyof typeof STAMINA_CONFIG.minimumForAction] ?? 0;

    // 최소 스태미나 체크
    if (this.currentStamina < minimumRequired) {
      this.emit('action-blocked', {
        action: actionType,
        required: minimumRequired,
        current: this.currentStamina
      });
      return false;
    }

    // 소모
    this.currentStamina = Math.max(0, this.currentStamina - amount);
    this.recoveryDelayTimer = STAMINA_CONFIG.recoveryDelay;
    this.lastConsumeTime = performance.now();

    this.emitChange();

    // 고갈 체크
    if (this.currentStamina <= 0 && this.state !== 'exhausted') {
      this.state = 'exhausted';
      this.emit('stamina-exhausted', undefined);
    }

    return true;
  }

  /**
   * 스태미나 즉시 소모 (방어 피격 등, 실패해도 강제 소모)
   */
  forceConsume(amount: number): void {
    this.currentStamina = Math.max(0, this.currentStamina - amount);
    this.recoveryDelayTimer = STAMINA_CONFIG.recoveryDelay;
    this.emitChange();

    if (this.currentStamina <= 0 && this.state !== 'exhausted') {
      this.state = 'exhausted';
      this.emit('stamina-exhausted', undefined);
    }
  }

  /**
   * 매 프레임 업데이트
   */
  update(deltaTime: number): void {
    // 회복 딜레이 처리
    if (this.recoveryDelayTimer > 0) {
      this.recoveryDelayTimer -= deltaTime;
      return;
    }

    // 질주 중 스태미나 지속 소모
    if (this.isSprinting) {
      this.forceConsume(STAMINA_CONFIG.costs.sprint * deltaTime);
      return;
    }

    // 스태미나 회복
    if (this.currentStamina < this.maxStamina) {
      let recoveryRate: number;

      if (this.state === 'exhausted') {
        recoveryRate = STAMINA_CONFIG.exhaustedRecoveryRate;
      } else if (this.isGuarding) {
        recoveryRate = STAMINA_CONFIG.recoveryRateGuard;
      } else {
        recoveryRate = STAMINA_CONFIG.recoveryRateIdle;
      }

      const previousStamina = this.currentStamina;
      this.currentStamina = Math.min(
        this.maxStamina,
        this.currentStamina + recoveryRate * deltaTime
      );

      if (previousStamina !== this.currentStamina) {
        this.emitChange();
      }

      // 고갈 상태에서 벗어남
      if (this.state === 'exhausted' && this.currentStamina > this.maxStamina * 0.2) {
        this.state = 'recovering';
        this.emit('stamina-recovered', undefined);
      }

      // 완전 회복
      if (this.currentStamina >= this.maxStamina) {
        this.state = 'normal';
      }
    }
  }

  // Getters & Setters
  setGuarding(value: boolean): void { this.isGuarding = value; }
  setSprinting(value: boolean): void { this.isSprinting = value; }

  getCurrent(): number { return this.currentStamina; }
  getMax(): number { return this.maxStamina; }
  getPercentage(): number { return this.currentStamina / this.maxStamina; }
  getState(): StaminaState { return this.state; }
  isExhausted(): boolean { return this.state === 'exhausted'; }

  /**
   * 특정 행동이 가능한지 체크 (소모하지 않음)
   */
  canPerform(actionType: string): boolean {
    const minimumRequired = STAMINA_CONFIG.minimumForAction[actionType as keyof typeof STAMINA_CONFIG.minimumForAction] ?? 0;
    return this.currentStamina >= minimumRequired && this.state !== 'exhausted';
  }

  private emitChange(): void {
    this.emit('stamina-changed', {
      current: this.currentStamina,
      max: this.maxStamina,
      percentage: this.getPercentage()
    });
  }
}
```

### 2.4 권장 수치 (PRD 섹션 6.2 기준)

| 항목 | 예시 값 | 비고 |
|------|---------|------|
| 최대 스태미나 | 100 | 레벨업으로 증가 가능 |
| 회복 속도 (정지/걷기) | 25/초 | 약 4초에 0->100 |
| 회복 속도 (방어) | 12/초 | 느린 회복 |
| 구르기 비용 | 35 | 약 3회 연속 가능 |
| 약공격 비용 | 20 | 약 5회 연속 가능 |
| 강공격 비용 | 35 | 약 3회 연속 가능 |
| 방어 피격 비용 | 피해량 x 0.8 | 20 피해 = 16 스태미나 |
| 회복 시작 딜레이 | 1.0초 | 소모 후 대기 |

---

## 3. 입력 버퍼/선입력 시스템 (Input Buffer System)

### 3.1 개요

PRD 섹션 2와 7.2에 명시된 대로, "입력이 씹히는" 느낌을 방지하고 "애니메이션 종료 직전에 입력을 받아 다음 동작으로 이어지는" 시스템을 구현합니다.

### 3.2 입력 버퍼 설정

```typescript
// src/input/InputConfig.ts

export const INPUT_BUFFER_CONFIG = {
  // 버퍼 윈도우 (PRD 섹션 7.2 참조)
  bufferWindowMs: 300,         // 0.25~0.35초 권장, 300ms 사용

  // 연타 방지 최소 간격
  minRepeatIntervalMs: 120,    // 120ms

  // 입력 우선순위 (높을수록 우선)
  priority: {
    death: 100,
    hitStun: 90,
    roll: 70,
    backstep: 65,
    attack: 60,
    guard: 50,
    parry: 55,
    interact: 40,
    useItem: 35,
    move: 10,
  } as const,

  // 버퍼 가능한 액션 목록
  bufferableActions: ['roll', 'backstep', 'lightAttack', 'heavyAttack', 'interact', 'useItem'] as const,
} as const;

export type BufferableAction = typeof INPUT_BUFFER_CONFIG.bufferableActions[number];
```

### 3.3 입력 버퍼 구현

```typescript
// src/input/InputBuffer.ts

import { INPUT_BUFFER_CONFIG, BufferableAction } from './InputConfig';

interface BufferedInput {
  action: BufferableAction;
  timestamp: number;
  priority: number;
  consumed: boolean;
}

export class InputBuffer {
  private buffer: BufferedInput[] = [];
  private lastInputTime: Map<string, number> = new Map();
  private maxBufferSize: number = 5;

  /**
   * 입력을 버퍼에 추가
   */
  addInput(action: BufferableAction): boolean {
    const now = performance.now();

    // 연타 방지 체크
    const lastTime = this.lastInputTime.get(action) ?? 0;
    if (now - lastTime < INPUT_BUFFER_CONFIG.minRepeatIntervalMs) {
      return false;
    }

    this.lastInputTime.set(action, now);

    // 버퍼에 추가
    const input: BufferedInput = {
      action,
      timestamp: now,
      priority: INPUT_BUFFER_CONFIG.priority[action] ?? 0,
      consumed: false
    };

    this.buffer.push(input);

    // 버퍼 크기 제한
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    return true;
  }

  /**
   * 버퍼에서 실행 가능한 가장 높은 우선순위 입력 가져오기
   * @param allowedActions 현재 상태에서 허용되는 액션 목록
   */
  consumeInput(allowedActions: BufferableAction[]): BufferableAction | null {
    const now = performance.now();

    // 만료된 입력 제거
    this.buffer = this.buffer.filter(input =>
      !input.consumed &&
      now - input.timestamp < INPUT_BUFFER_CONFIG.bufferWindowMs
    );

    // 허용된 액션 중 가장 높은 우선순위 찾기
    const validInputs = this.buffer
      .filter(input => allowedActions.includes(input.action))
      .sort((a, b) => {
        // 우선순위 내림차순, 같으면 먼저 들어온 것
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.timestamp - b.timestamp;
      });

    if (validInputs.length > 0) {
      validInputs[0].consumed = true;
      return validInputs[0].action;
    }

    return null;
  }

  /**
   * 특정 액션이 버퍼에 있는지 확인 (소모하지 않음)
   */
  hasInput(action: BufferableAction): boolean {
    const now = performance.now();
    return this.buffer.some(input =>
      input.action === action &&
      !input.consumed &&
      now - input.timestamp < INPUT_BUFFER_CONFIG.bufferWindowMs
    );
  }

  /**
   * 버퍼 초기화
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * 특정 액션만 버퍼에서 제거
   */
  removeAction(action: BufferableAction): void {
    this.buffer = this.buffer.filter(input => input.action !== action);
  }
}
```

---

## 4. 구르기 무적 프레임 (i-frame) 구현

### 4.1 개요

PRD 섹션 2와 7.3에 명시된 "구르기/백스텝 중 일부 프레임은 피격 판정 무시"를 구현합니다. 이것이 없으면 "회피가 안 되는 게임"이 됩니다.

### 4.2 i-frame 설정

```typescript
// src/combat/IFrameConfig.ts

export const IFRAME_CONFIG = {
  roll: {
    totalDuration: 0.75,       // 구르기 총 길이 (초)
    iframeStart: 0.15,         // 무적 시작 시점 (초)
    iframeEnd: 0.45,           // 무적 종료 시점 (초)
    // 즉, 무적 구간 = 0.30초 (약 18프레임 @60fps)

    // 이동 프로파일
    distance: 3.2,             // 총 이동 거리 (m)
    speedCurve: 'easeOutQuad', // 초반 빠르고 후반 감속

    // 후딜레이
    recoveryTime: 0.15,        // 구르기 후 공격 불가 시간
  },

  backstep: {
    totalDuration: 0.5,
    iframeStart: 0.08,
    iframeEnd: 0.28,
    distance: 2.0,
    speedCurve: 'easeOutQuad',
    recoveryTime: 0.1,
  },

  // 무적 상태에서 무시할 레이어
  ignoredDamageLayers: ['enemy_attack', 'boss_attack', 'trap'] as const,
} as const;
```

### 4.3 i-frame 시스템 구현

```typescript
// src/combat/IFrameSystem.ts

import { IFRAME_CONFIG } from './IFrameConfig';
import { EventEmitter } from '../core/EventEmitter';

export type IFrameType = 'roll' | 'backstep';

interface IFrameState {
  active: boolean;
  type: IFrameType | null;
  startTime: number;
  duration: number;
  iframeStart: number;
  iframeEnd: number;
  isInvincible: boolean;
}

export interface IFrameEvents {
  'iframe-start': { type: IFrameType };
  'iframe-end': { type: IFrameType };
  'invincibility-start': void;
  'invincibility-end': void;
}

export class IFrameSystem extends EventEmitter<IFrameEvents> {
  private state: IFrameState = {
    active: false,
    type: null,
    startTime: 0,
    duration: 0,
    iframeStart: 0,
    iframeEnd: 0,
    isInvincible: false,
  };

  /**
   * i-frame 액션 시작
   */
  startIFrame(type: IFrameType): void {
    const config = IFRAME_CONFIG[type];

    this.state = {
      active: true,
      type,
      startTime: performance.now() / 1000,
      duration: config.totalDuration,
      iframeStart: config.iframeStart,
      iframeEnd: config.iframeEnd,
      isInvincible: false,
    };

    this.emit('iframe-start', { type });
  }

  /**
   * 매 프레임 업데이트
   */
  update(currentTime: number): void {
    if (!this.state.active) return;

    const elapsed = currentTime - this.state.startTime;

    // i-frame 종료 체크
    if (elapsed >= this.state.duration) {
      this.endIFrame();
      return;
    }

    // 무적 상태 체크
    const wasInvincible = this.state.isInvincible;
    this.state.isInvincible =
      elapsed >= this.state.iframeStart &&
      elapsed < this.state.iframeEnd;

    // 무적 상태 변경 이벤트
    if (!wasInvincible && this.state.isInvincible) {
      this.emit('invincibility-start', undefined);
    } else if (wasInvincible && !this.state.isInvincible) {
      this.emit('invincibility-end', undefined);
    }
  }

  /**
   * 현재 무적 상태인지 확인
   */
  isInvincible(): boolean {
    return this.state.isInvincible;
  }

  /**
   * 현재 i-frame 액션 중인지 확인
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * 현재 진행률 (0-1)
   */
  getProgress(): number {
    if (!this.state.active) return 0;
    const elapsed = (performance.now() / 1000) - this.state.startTime;
    return Math.min(1, elapsed / this.state.duration);
  }

  /**
   * 이동 속도 계수 (easing 적용)
   */
  getSpeedMultiplier(): number {
    if (!this.state.active || !this.state.type) return 0;

    const config = IFRAME_CONFIG[this.state.type];
    const progress = this.getProgress();

    // easeOutQuad: 1 - (1 - x)^2
    if (config.speedCurve === 'easeOutQuad') {
      return 1 - Math.pow(1 - progress, 2);
    }

    return progress;
  }

  private endIFrame(): void {
    const type = this.state.type;
    this.state = {
      active: false,
      type: null,
      startTime: 0,
      duration: 0,
      iframeStart: 0,
      iframeEnd: 0,
      isInvincible: false,
    };

    if (type) {
      this.emit('iframe-end', { type });
    }
  }
}
```

### 4.4 권장 수치 (PRD 섹션 7.3 기준)

| 항목 | 구르기 | 백스텝 |
|------|--------|--------|
| 총 길이 | 0.75초 | 0.5초 |
| 무적 시작 | 0.15초 | 0.08초 |
| 무적 종료 | 0.45초 | 0.28초 |
| 무적 구간 | 0.30초 | 0.20초 |
| 이동 거리 | 3.0-3.5m | 2.0m |
| 후딜레이 | 0.10-0.20초 | 0.10초 |

---

## 5. 피격 반응과 경직 (Stagger/HitStun System)

### 5.1 개요

PRD 섹션 2에 명시된 "맞았을 때 짧은 경직(스태거)과 슈퍼아머(강인도/포이즈) 개념"을 구현합니다.

### 5.2 포이즈(강인도) 시스템

```typescript
// src/combat/PoiseSystem.ts

export interface PoiseConfig {
  maxPoise: number;           // 최대 강인도
  recoveryRate: number;       // 초당 회복량
  recoveryDelay: number;      // 피격 후 회복 시작 딜레이
  staggerThreshold: number;   // 경직 발생 임계값 (0 이하 시)
}

export const POISE_PRESETS = {
  player: {
    maxPoise: 30,
    recoveryRate: 20,
    recoveryDelay: 2.0,
    staggerThreshold: 0,
  },
  enemy_weak: {
    maxPoise: 15,
    recoveryRate: 15,
    recoveryDelay: 1.5,
    staggerThreshold: 0,
  },
  enemy_normal: {
    maxPoise: 40,
    recoveryRate: 25,
    recoveryDelay: 2.0,
    staggerThreshold: 0,
  },
  boss: {
    maxPoise: 100,
    recoveryRate: 40,
    recoveryDelay: 3.0,
    staggerThreshold: 0,
  },
} as const;

export class PoiseSystem {
  private currentPoise: number;
  private config: PoiseConfig;
  private lastDamageTime: number = 0;
  private isStaggered: boolean = false;

  constructor(config: PoiseConfig) {
    this.config = config;
    this.currentPoise = config.maxPoise;
  }

  /**
   * 포이즈 데미지 적용
   * @returns 경직 발생 여부
   */
  takePoiseDamage(amount: number): boolean {
    this.currentPoise -= amount;
    this.lastDamageTime = performance.now() / 1000;

    if (this.currentPoise <= this.config.staggerThreshold) {
      this.isStaggered = true;
      this.currentPoise = this.config.maxPoise;  // 경직 후 포이즈 리셋
      return true;
    }

    return false;
  }

  /**
   * 매 프레임 업데이트
   */
  update(deltaTime: number, currentTime: number): void {
    // 회복 딜레이 체크
    if (currentTime - this.lastDamageTime < this.config.recoveryDelay) {
      return;
    }

    // 포이즈 회복
    if (this.currentPoise < this.config.maxPoise) {
      this.currentPoise = Math.min(
        this.config.maxPoise,
        this.currentPoise + this.config.recoveryRate * deltaTime
      );
    }

    this.isStaggered = false;
  }

  // Getters
  getCurrent(): number { return this.currentPoise; }
  getMax(): number { return this.config.maxPoise; }
  getIsStaggered(): boolean { return this.isStaggered; }
  clearStagger(): void { this.isStaggered = false; }
}
```

### 5.3 경직(Stagger) 시스템

```typescript
// src/combat/StaggerSystem.ts

import { EventEmitter } from '../core/EventEmitter';

export type StaggerLevel = 'none' | 'light' | 'medium' | 'heavy' | 'knockdown';

export interface StaggerConfig {
  lightDuration: number;     // 가벼운 경직 (초)
  mediumDuration: number;    // 중간 경직 (초)
  heavyDuration: number;     // 강한 경직 (초)
  knockdownDuration: number; // 넉다운 (초)
  knockbackForce: number;    // 밀려나는 힘
}

export const STAGGER_CONFIG: StaggerConfig = {
  lightDuration: 0.15,
  mediumDuration: 0.35,
  heavyDuration: 0.6,
  knockdownDuration: 1.2,
  knockbackForce: 2.0,
};

export interface StaggerEvents {
  'stagger-start': { level: StaggerLevel; duration: number };
  'stagger-end': void;
  'knockback': { direction: THREE.Vector3; force: number };
}

export class StaggerSystem extends EventEmitter<StaggerEvents> {
  private currentStagger: StaggerLevel = 'none';
  private staggerEndTime: number = 0;
  private canBeInterrupted: boolean = true;

  /**
   * 경직 적용
   */
  applyStagger(level: StaggerLevel, knockbackDirection?: THREE.Vector3): void {
    // 더 강한 경직이 우선
    if (!this.canInterrupt(level)) return;

    const duration = this.getDuration(level);

    this.currentStagger = level;
    this.staggerEndTime = performance.now() / 1000 + duration;

    this.emit('stagger-start', { level, duration });

    // 넉백 적용
    if (knockbackDirection && level !== 'none') {
      const force = this.getKnockbackForce(level);
      this.emit('knockback', { direction: knockbackDirection, force });
    }
  }

  /**
   * 매 프레임 업데이트
   */
  update(currentTime: number): void {
    if (this.currentStagger === 'none') return;

    if (currentTime >= this.staggerEndTime) {
      this.currentStagger = 'none';
      this.emit('stagger-end', undefined);
    }
  }

  /**
   * 현재 경직 상태 확인
   */
  isStaggered(): boolean {
    return this.currentStagger !== 'none';
  }

  getCurrentLevel(): StaggerLevel {
    return this.currentStagger;
  }

  /**
   * 경직 중 행동 가능 여부
   */
  canAct(): boolean {
    return this.currentStagger === 'none' || this.currentStagger === 'light';
  }

  private canInterrupt(newLevel: StaggerLevel): boolean {
    const levelOrder: StaggerLevel[] = ['none', 'light', 'medium', 'heavy', 'knockdown'];
    const currentIndex = levelOrder.indexOf(this.currentStagger);
    const newIndex = levelOrder.indexOf(newLevel);
    return newIndex >= currentIndex;
  }

  private getDuration(level: StaggerLevel): number {
    switch (level) {
      case 'light': return STAGGER_CONFIG.lightDuration;
      case 'medium': return STAGGER_CONFIG.mediumDuration;
      case 'heavy': return STAGGER_CONFIG.heavyDuration;
      case 'knockdown': return STAGGER_CONFIG.knockdownDuration;
      default: return 0;
    }
  }

  private getKnockbackForce(level: StaggerLevel): number {
    switch (level) {
      case 'light': return STAGGER_CONFIG.knockbackForce * 0.3;
      case 'medium': return STAGGER_CONFIG.knockbackForce * 0.6;
      case 'heavy': return STAGGER_CONFIG.knockbackForce * 1.0;
      case 'knockdown': return STAGGER_CONFIG.knockbackForce * 1.5;
      default: return 0;
    }
  }
}
```

### 5.4 권장 수치

| 경직 레벨 | 지속 시간 | 넉백 배율 | 발생 조건 |
|-----------|-----------|-----------|-----------|
| Light | 0.15초 | 30% | 약공격 피격 |
| Medium | 0.35초 | 60% | 강공격 피격 |
| Heavy | 0.60초 | 100% | 포이즈 브레이크 |
| Knockdown | 1.20초 | 150% | 보스 강공격/특수기 |

---

## 6. 히트스톱 구현 (Hit Stop/Hit Freeze)

### 6.1 개요

PRD 섹션 2에 명시된 "히트스톱(짧은 정지)" 피드백을 구현합니다. 타격 시 짧은 시간 정지로 "맞았다"는 감각을 강화합니다.

### 6.2 히트스톱 시스템

```typescript
// src/combat/HitStopSystem.ts

import { EventEmitter } from '../core/EventEmitter';

export interface HitStopConfig {
  lightHitDuration: number;     // 약공격 히트스톱 (초)
  heavyHitDuration: number;     // 강공격 히트스톱 (초)
  criticalHitDuration: number;  // 치명타 히트스톱 (초)
  deathHitDuration: number;     // 처치 시 히트스톱 (초)

  // 시간 스케일 (0 = 완전 정지, 0.1 = 90% 느려짐)
  timeScale: number;

  // 카메라 쉐이크 연동
  cameraShakeIntensity: number;
}

export const HITSTOP_CONFIG: HitStopConfig = {
  lightHitDuration: 0.05,     // 50ms
  heavyHitDuration: 0.10,     // 100ms
  criticalHitDuration: 0.15,  // 150ms
  deathHitDuration: 0.20,     // 200ms
  timeScale: 0.02,            // 거의 정지
  cameraShakeIntensity: 0.3,
};

export type HitStopType = 'light' | 'heavy' | 'critical' | 'death';

export interface HitStopEvents {
  'hitstop-start': { type: HitStopType; duration: number };
  'hitstop-end': void;
  'camera-shake': { intensity: number; duration: number };
}

export class HitStopSystem extends EventEmitter<HitStopEvents> {
  private isActive: boolean = false;
  private endTime: number = 0;
  private currentTimeScale: number = 1.0;
  private originalTimeScale: number = 1.0;

  /**
   * 히트스톱 트리거
   */
  trigger(type: HitStopType): void {
    const duration = this.getDuration(type);

    this.isActive = true;
    this.endTime = performance.now() / 1000 + duration;
    this.currentTimeScale = HITSTOP_CONFIG.timeScale;

    this.emit('hitstop-start', { type, duration });

    // 카메라 쉐이크 연동
    const shakeIntensity = this.getShakeIntensity(type);
    this.emit('camera-shake', {
      intensity: shakeIntensity,
      duration: duration * 2
    });
  }

  /**
   * 매 프레임 업데이트
   */
  update(currentTime: number): void {
    if (!this.isActive) return;

    if (currentTime >= this.endTime) {
      this.isActive = false;
      this.currentTimeScale = this.originalTimeScale;
      this.emit('hitstop-end', undefined);
    }
  }

  /**
   * 현재 시간 스케일 반환 (애니메이션/물리에 적용)
   */
  getTimeScale(): number {
    return this.isActive ? this.currentTimeScale : this.originalTimeScale;
  }

  /**
   * 히트스톱 중인지 확인
   */
  isHitStopActive(): boolean {
    return this.isActive;
  }

  private getDuration(type: HitStopType): number {
    switch (type) {
      case 'light': return HITSTOP_CONFIG.lightHitDuration;
      case 'heavy': return HITSTOP_CONFIG.heavyHitDuration;
      case 'critical': return HITSTOP_CONFIG.criticalHitDuration;
      case 'death': return HITSTOP_CONFIG.deathHitDuration;
    }
  }

  private getShakeIntensity(type: HitStopType): number {
    const base = HITSTOP_CONFIG.cameraShakeIntensity;
    switch (type) {
      case 'light': return base * 0.3;
      case 'heavy': return base * 0.7;
      case 'critical': return base * 1.0;
      case 'death': return base * 1.5;
    }
  }
}
```

### 6.3 권장 수치

| 히트 타입 | 히트스톱 시간 | 시간 스케일 | 카메라 쉐이크 |
|-----------|--------------|-------------|---------------|
| Light | 50ms | 0.02 | 30% |
| Heavy | 100ms | 0.02 | 70% |
| Critical | 150ms | 0.02 | 100% |
| Death | 200ms | 0.02 | 150% |

---

## 7. 공격/방어/패리 시스템

### 7.1 공격 시스템

```typescript
// src/combat/AttackSystem.ts

import { StaminaSystem } from './StaminaSystem';
import { HitDetectionManager } from './HitDetection';
import { HitStopSystem } from './HitStopSystem';
import type { AttackData } from './types';

export type AttackType = 'lightAttack' | 'heavyAttack' | 'chargedAttack' | 'runningAttack' | 'rollingAttack';

export interface AttackDefinition extends AttackData {
  type: AttackType;
  animationName: string;
  canCombo: boolean;
  comboWindow: { start: number; end: number };  // 콤보 가능 프레임
  cancelWindow: { start: number; end: number }; // 회피 취소 가능 프레임
}

// PRD 섹션 6.2 기반 공격 정의
export const ATTACK_DEFINITIONS: Record<string, AttackDefinition> = {
  lightAttack_1: {
    attackId: 'lightAttack_1',
    type: 'lightAttack',
    animationName: 'Attack_L1',
    damage: 25,
    staminaCost: 20,
    poiseBreak: 15,
    knockbackForce: 1.0,
    hitStopDuration: 0.05,
    activeFrameStart: 8,
    activeFrameEnd: 14,
    canCombo: true,
    comboWindow: { start: 18, end: 30 },
    cancelWindow: { start: 20, end: 35 },
  },
  lightAttack_2: {
    attackId: 'lightAttack_2',
    type: 'lightAttack',
    animationName: 'Attack_L2',
    damage: 28,
    staminaCost: 22,
    poiseBreak: 18,
    knockbackForce: 1.2,
    hitStopDuration: 0.06,
    activeFrameStart: 10,
    activeFrameEnd: 18,
    canCombo: true,
    comboWindow: { start: 22, end: 35 },
    cancelWindow: { start: 25, end: 40 },
  },
  heavyAttack: {
    attackId: 'heavyAttack',
    type: 'heavyAttack',
    animationName: 'Attack_H1',
    damage: 50,
    staminaCost: 35,
    poiseBreak: 35,
    knockbackForce: 2.5,
    hitStopDuration: 0.10,
    activeFrameStart: 18,
    activeFrameEnd: 28,
    canCombo: false,
    comboWindow: { start: 0, end: 0 },
    cancelWindow: { start: 35, end: 50 },
  },
};
```

### 7.2 방어 시스템

```typescript
// src/combat/GuardSystem.ts

import { StaminaSystem } from './StaminaSystem';
import { STAMINA_CONFIG } from './StaminaConfig';
import { EventEmitter } from '../core/EventEmitter';

export interface GuardResult {
  blocked: boolean;
  damageReduction: number;    // 피해 감소율 (0-1)
  staminaDrained: number;     // 소모된 스태미나
  guardBroken: boolean;       // 가드 브레이크 여부
  chipDamage: number;         // 관통 피해
}

export interface GuardConfig {
  damageReduction: number;    // 피해 감소율 (방패 기준)
  stability: number;          // 안정성 (스태미나 소모 감소)
  chipDamageRate: number;     // 관통 피해율
  guardBreakRecovery: number; // 가드 브레이크 회복 시간
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  damageReduction: 0.9,       // 90% 피해 감소
  stability: 50,              // 안정성 50
  chipDamageRate: 0.1,        // 10% 관통
  guardBreakRecovery: 1.5,    // 1.5초
};

export class GuardSystem extends EventEmitter {
  private stamina: StaminaSystem;
  private config: GuardConfig;

  private isGuarding: boolean = false;
  private isGuardBroken: boolean = false;
  private guardBreakEndTime: number = 0;

  constructor(stamina: StaminaSystem, config: GuardConfig = DEFAULT_GUARD_CONFIG) {
    super();
    this.stamina = stamina;
    this.config = config;
  }

  /**
   * 방어 시작
   */
  startGuard(): boolean {
    if (this.isGuardBroken) return false;
    if (this.stamina.isExhausted()) return false;

    this.isGuarding = true;
    this.stamina.setGuarding(true);
    this.emit('guard-start', undefined);

    return true;
  }

  /**
   * 방어 종료
   */
  endGuard(): void {
    this.isGuarding = false;
    this.stamina.setGuarding(false);
    this.emit('guard-end', undefined);
  }

  /**
   * 피격 처리 (방어 중)
   */
  processHit(incomingDamage: number, attackPoiseBreak: number): GuardResult {
    if (!this.isGuarding || this.isGuardBroken) {
      return {
        blocked: false,
        damageReduction: 0,
        staminaDrained: 0,
        guardBroken: false,
        chipDamage: incomingDamage,
      };
    }

    // 스태미나 소모 계산
    const baseStaminaCost = incomingDamage * STAMINA_CONFIG.guardStaminaMultiplier;
    const stabilityReduction = this.config.stability / 100;
    const staminaCost = baseStaminaCost * (1 - stabilityReduction * 0.5);

    // 스태미나 소모
    this.stamina.forceConsume(staminaCost);

    // 가드 브레이크 체크
    const guardBroken = this.stamina.getCurrent() <= 0;

    if (guardBroken) {
      this.triggerGuardBreak();
    }

    // 관통 피해 계산
    const reducedDamage = incomingDamage * (1 - this.config.damageReduction);
    const chipDamage = guardBroken ? incomingDamage : reducedDamage;

    const result: GuardResult = {
      blocked: !guardBroken,
      damageReduction: guardBroken ? 0 : this.config.damageReduction,
      staminaDrained: staminaCost,
      guardBroken,
      chipDamage,
    };

    this.emit('guard-hit', result);

    return result;
  }

  private triggerGuardBreak(): void {
    this.isGuardBroken = true;
    this.isGuarding = false;
    this.guardBreakEndTime = performance.now() / 1000 + this.config.guardBreakRecovery;

    this.emit('guard-break', undefined);
  }

  /**
   * 매 프레임 업데이트
   */
  update(currentTime: number): void {
    // 가드 브레이크 회복 체크
    if (this.isGuardBroken && currentTime >= this.guardBreakEndTime) {
      this.isGuardBroken = false;
    }
  }

  // Getters
  getIsGuarding(): boolean { return this.isGuarding; }
  getIsGuardBroken(): boolean { return this.isGuardBroken; }
}
```

### 7.3 패리 시스템

```typescript
// src/combat/ParrySystem.ts

import { EventEmitter } from '../core/EventEmitter';

export interface ParryConfig {
  windowDuration: number;      // 패리 윈도우 (초)
  startupFrames: number;       // 시작 프레임
  recoveryFrames: number;      // 회복 프레임
  riposteWindow: number;       // 리포스트 가능 시간 (초)
  staminaCost: number;         // 스태미나 비용
}

export const PARRY_CONFIG: ParryConfig = {
  windowDuration: 0.12,        // 120ms (약 7프레임)
  startupFrames: 4,            // 4프레임 준비
  recoveryFrames: 25,          // 실패 시 25프레임 경직
  riposteWindow: 2.0,          // 2초간 리포스트 가능
  staminaCost: 15,
};

export type ParryState = 'idle' | 'startup' | 'active' | 'recovery' | 'success';

export class ParrySystem extends EventEmitter {
  private state: ParryState = 'idle';
  private stateStartTime: number = 0;
  private currentFrame: number = 0;

  // 리포스트 대상
  private riposteTarget: Entity | null = null;
  private riposteExpireTime: number = 0;

  private config: ParryConfig;

  constructor(config: ParryConfig = PARRY_CONFIG) {
    super();
    this.config = config;
  }

  /**
   * 패리 시도
   */
  startParry(): boolean {
    if (this.state !== 'idle') return false;

    this.state = 'startup';
    this.currentFrame = 0;
    this.stateStartTime = performance.now() / 1000;

    this.emit('parry-start', undefined);

    return true;
  }

  /**
   * 공격이 패리 윈도우에 들어왔는지 체크
   */
  checkParry(attacker: Entity): boolean {
    if (this.state !== 'active') return false;

    // 패리 성공!
    this.state = 'success';
    this.riposteTarget = attacker;
    this.riposteExpireTime = performance.now() / 1000 + this.config.riposteWindow;

    this.emit('parry-success', { target: attacker });
    this.emit('riposte-available', { target: attacker });

    return true;
  }

  /**
   * 리포스트 실행
   */
  executeRiposte(): Entity | null {
    if (!this.riposteTarget) return null;
    if (performance.now() / 1000 > this.riposteExpireTime) {
      this.riposteTarget = null;
      return null;
    }

    const target = this.riposteTarget;
    this.riposteTarget = null;
    this.state = 'idle';

    return target;
  }

  /**
   * 매 프레임 업데이트
   */
  update(deltaTime: number): void {
    if (this.state === 'idle') return;

    this.currentFrame++;
    const currentTime = performance.now() / 1000;

    switch (this.state) {
      case 'startup':
        if (this.currentFrame >= this.config.startupFrames) {
          this.state = 'active';
          this.stateStartTime = currentTime;
        }
        break;

      case 'active':
        if (currentTime - this.stateStartTime >= this.config.windowDuration) {
          // 패리 실패 (공격이 안 들어옴)
          this.state = 'recovery';
          this.currentFrame = 0;
          this.emit('parry-fail', undefined);
        }
        break;

      case 'recovery':
        if (this.currentFrame >= this.config.recoveryFrames) {
          this.state = 'idle';
        }
        break;

      case 'success':
        // 리포스트 타임아웃 체크
        if (currentTime > this.riposteExpireTime) {
          this.riposteTarget = null;
          this.state = 'idle';
          this.emit('riposte-expired', undefined);
        }
        break;
    }
  }

  // Getters
  getState(): ParryState { return this.state; }
  isParryActive(): boolean { return this.state === 'active'; }
  hasRiposteTarget(): boolean { return this.riposteTarget !== null; }
  canAct(): boolean { return this.state === 'idle' || this.state === 'success'; }
}
```

---

## 8. 전투 매니저 (통합)

```typescript
// src/combat/CombatManager.ts

import { StaminaSystem } from './StaminaSystem';
import { AttackSystem } from './AttackSystem';
import { GuardSystem } from './GuardSystem';
import { ParrySystem } from './ParrySystem';
import { HitDetectionManager } from './HitDetection';
import { HitStopSystem } from './HitStopSystem';
import { IFrameSystem } from './IFrameSystem';
import { StaggerSystem } from './StaggerSystem';
import { PoiseSystem, POISE_PRESETS } from './PoiseSystem';
import { InputBuffer } from '../input/InputBuffer';
import type { BufferableAction } from '../input/InputConfig';

export class CombatManager {
  // 서브시스템
  public readonly stamina: StaminaSystem;
  public readonly attack: AttackSystem;
  public readonly guard: GuardSystem;
  public readonly parry: ParrySystem;
  public readonly hitDetection: HitDetectionManager;
  public readonly hitStop: HitStopSystem;
  public readonly iframe: IFrameSystem;
  public readonly stagger: StaggerSystem;
  public readonly poise: PoiseSystem;

  private inputBuffer: InputBuffer;

  constructor(world: RAPIER.World, inputBuffer: InputBuffer) {
    this.inputBuffer = inputBuffer;

    // 시스템 초기화
    this.stamina = new StaminaSystem();
    this.hitDetection = new HitDetectionManager(world);
    this.hitStop = new HitStopSystem();
    this.iframe = new IFrameSystem();
    this.stagger = new StaggerSystem();
    this.poise = new PoiseSystem(POISE_PRESETS.player);

    this.attack = new AttackSystem(this.stamina, this.hitDetection, this.hitStop);
    this.guard = new GuardSystem(this.stamina);
    this.parry = new ParrySystem();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 스태미나 고갈 시 가드 해제
    this.stamina.on('stamina-exhausted', () => {
      this.guard.endGuard();
    });

    // 가드 브레이크 시 스태거 적용
    this.guard.on('guard-break', () => {
      this.stagger.applyStagger('heavy');
    });
  }

  /**
   * 매 프레임 업데이트
   */
  update(deltaTime: number, currentTime: number): void {
    // 히트스톱 적용
    const timeScale = this.hitStop.getTimeScale();
    const scaledDelta = deltaTime * timeScale;

    // 시스템 업데이트
    this.stamina.update(scaledDelta);
    this.hitStop.update(currentTime);
    this.iframe.update(currentTime);
    this.stagger.update(currentTime);
    this.poise.update(scaledDelta, currentTime);
    this.guard.update(currentTime);
    this.parry.update(scaledDelta);

    // 버퍼된 입력 처리
    this.processBufferedInput();
  }

  private processBufferedInput(): void {
    // 현재 상태에서 허용되는 액션 결정
    const allowedActions = this.getAllowedActions();

    // 버퍼에서 실행 가능한 입력 가져오기
    const action = this.inputBuffer.consumeInput(allowedActions);

    if (action) {
      this.executeAction(action);
    }
  }

  private getAllowedActions(): BufferableAction[] {
    const actions: BufferableAction[] = [];

    // 스태거 중에는 아무것도 못함
    if (this.stagger.isStaggered()) return actions;

    // i-frame 중에는 제한
    if (this.iframe.isActive()) return actions;

    // 공격 중 캔슬 가능 여부 체크
    if (this.attack.isAttacking()) {
      if (this.attack.canCancelToRoll()) {
        actions.push('roll', 'backstep');
      }
      return actions;
    }

    // 기본 허용 액션
    if (this.stamina.canPerform('roll')) {
      actions.push('roll', 'backstep');
    }
    if (this.stamina.canPerform('attack')) {
      actions.push('lightAttack', 'heavyAttack');
    }
    actions.push('interact', 'useItem');

    return actions;
  }

  private executeAction(action: BufferableAction): void {
    switch (action) {
      case 'roll':
        if (this.stamina.tryConsume(35, 'roll')) {
          this.iframe.startIFrame('roll');
        }
        break;
      case 'backstep':
        if (this.stamina.tryConsume(20, 'roll')) {
          this.iframe.startIFrame('backstep');
        }
        break;
      case 'lightAttack':
        this.attack.tryAttack('lightAttack');
        break;
      case 'heavyAttack':
        this.attack.tryAttack('heavyAttack');
        break;
      // ... 기타 액션
    }
  }

  /**
   * 피격 처리
   */
  receiveDamage(damage: number, poiseBreak: number, knockbackDir: THREE.Vector3): number {
    // 무적 상태 체크
    if (this.iframe.isInvincible()) {
      return 0;
    }

    // 가드 중 처리
    if (this.guard.getIsGuarding()) {
      const result = this.guard.processHit(damage, poiseBreak);

      if (result.blocked) {
        // 포이즈 데미지는 여전히 적용
        this.poise.takePoiseDamage(poiseBreak * 0.5);
        return result.chipDamage;
      }
    }

    // 포이즈 체크
    const isStaggered = this.poise.takePoiseDamage(poiseBreak);

    // 스태거 적용
    if (isStaggered) {
      this.stagger.applyStagger('heavy', knockbackDir);
    } else {
      this.stagger.applyStagger('light', knockbackDir);
    }

    // 히트스톱 (피격자)
    this.hitStop.trigger('light');

    return damage;
  }
}
```

---

## 9. 파일 구조 및 의존성

### 9.1 최종 파일 구조

```
src/
  core/
    EventEmitter.ts          # 이벤트 시스템 기반 클래스
    GameLoop.ts              # 게임 루프 (main.ts 확장)
    Scene.ts                 # (기존)
    Camera.ts                # (기존) + 카메라 쉐이크 추가
    Audio.ts                 # (기존)

  input/
    InputManager.ts          # 입력 관리
    InputBuffer.ts           # 입력 버퍼
    InputConfig.ts           # 입력 설정

  combat/
    types.ts                 # 전투 타입 정의
    CombatManager.ts         # 전투 시스템 통합

    # 히트 판정
    HitDetection.ts
    HitBox.ts
    CapsuleSweep.ts

    # 스태미나
    StaminaSystem.ts
    StaminaConfig.ts

    # i-frame
    IFrameSystem.ts
    IFrameConfig.ts

    # 경직/포이즈
    StaggerSystem.ts
    PoiseSystem.ts

    # 히트스톱
    HitStopSystem.ts

    # 공격/방어/패리
    AttackSystem.ts
    GuardSystem.ts
    ParrySystem.ts

  physics/
    Physics.ts               # (기존) + 캐릭터 컨트롤러 추가
    CharacterController.ts   # KCC 구현

  animation/
    AnimationFSM.ts          # 애니메이션 상태 머신

  effects/
    Particles.ts             # (기존)
    PostProcessing.ts        # (기존)

  ui/
    Menu.ts                  # (기존)
    HUD.ts                   # HP/스태미나 바
```

### 9.2 구현 순서 권장

1. **M4. 스태미나/입력 버퍼** (PRD 로드맵 참조)
   - `StaminaSystem.ts`, `StaminaConfig.ts`
   - `InputBuffer.ts`, `InputConfig.ts`, `InputManager.ts`
   - `EventEmitter.ts`

2. **M5. 전투 MVP**
   - `types.ts`
   - `HitDetection.ts`, `CapsuleSweep.ts`
   - `HitStopSystem.ts`
   - `AttackSystem.ts`

3. **확장**
   - `IFrameSystem.ts` (구르기 무적)
   - `StaggerSystem.ts`, `PoiseSystem.ts`
   - `GuardSystem.ts`
   - `ParrySystem.ts` (옵션)
   - `CombatManager.ts` (통합)

---

## 10. 핵심 구현 체크리스트

- [ ] EventEmitter 기반 클래스 구현
- [ ] StaminaSystem - 소모/회복/고갈 상태
- [ ] InputBuffer - 버퍼 윈도우, 우선순위, 연타 방지
- [ ] CapsuleSweep - Rapier shape cast 래핑
- [ ] HitDetection - 무기 샘플 포인트, 중복 히트 방지
- [ ] IFrameSystem - 구르기/백스텝 무적 구간
- [ ] StaggerSystem - 경직 레벨별 지속시간
- [ ] PoiseSystem - 강인도/포이즈 브레이크
- [ ] HitStopSystem - 시간 스케일 조절
- [ ] AttackSystem - 콤보, 캔슬 윈도우
- [ ] GuardSystem - 피해 감소, 스태미나 소모, 가드 브레이크
- [ ] ParrySystem - 패리 윈도우, 리포스트
- [ ] CombatManager - 시스템 통합, 상태 관리

---

## 11. 핵심 구현 파일

다음 파일들이 구현에 가장 중요합니다:

- **src/physics/Physics.ts** - Rapier 물리 엔진이 이미 초기화되어 있으며, 캡슐 스윕/히트 판정의 기반
- **src/main.ts** - 게임 루프 구조가 정의되어 있으며, 전투 시스템을 통합할 진입점
- **src/core/Scene.ts** - 씬 관리 패턴을 따라 전투 시스템 모듈을 구성
- **docs/PRD.md** - 모든 수치와 밸런스 기준이 정의되어 있음 (섹션 2, 6.2, 7)
- **src/effects/Particles.ts** - 이벤트 기반 업데이트 패턴의 참조 구현
