# Dark Souls 웹 게임 구현 진행 상황

**최종 업데이트**: 2026-02-19 (3차 업데이트)

---

## 전체 진행률

```
Phase 1: 코어 인프라     [██████████] 100% (2/2)
Phase 2: 입력 시스템     [██████████] 100% (3/3)
Phase 3: 물리/KCC        [██████████] 100% (3/3)
Phase 4: 플레이어        [██████████] 100% (5/5)
Phase 5: 카메라          [░░░░░░░░░░]   0% (0/2)
Phase 6: 전투            [░░░░░░░░░░]   0% (0/3)
Phase 7: 보스 AI         [░░░░░░░░░░]   0% (0/2)
Phase 8: 레벨            [░░░░░░░░░░]   0% (0/3)
Phase 9: UI              [░░░░░░░░░░]   0% (0/3)

전체: █████████████░░░░░░░░░░░ 55.6% (15/27)
```

---

## 완료된 작업

### Phase 1: 코어 인프라 ✅

#### 1. Time.ts - 시간 관리 시스템 ✅

**파일**: `src/core/Time.ts`

- 고정 타임스텝 물리 시뮬레이션 (60Hz)
- Accumulator 패턴으로 결정적 물리
- 최대 delta 제한 (0.1초)으로 "spiral of death" 방지
- 시간 스케일 지원 (슬로모션 효과용)
- FPS 측정

#### 2. EventBus.ts - 이벤트 버스 ✅

**파일**: `src/core/EventBus.ts`

- 타입 안전한 이벤트 시스템
- 플레이어/보스/전투/트리거/게임 상태 이벤트 정의
- on/off/once/emit 패턴

---

### Phase 2: 입력 시스템 ✅

#### 1. Action.ts - 액션 정의 ✅

**파일**: `src/input/Action.ts`

- 게임 액션 enum (MoveForward, Attack, Roll 등)
- Axis enum (MoveX, MoveY, LookX, LookY)
- ActionState 인터페이스 (pressed, justPressed, heldTime)

#### 2. Bindings.ts - 키 바인딩 ✅

**파일**: `src/input/Bindings.ts`

- 키보드/마우스/게임패드 바인딩 설정
- Dark Souls PC 스타일 기본 바인딩
- 리바인딩 지원 구조

#### 3. InputManager.ts - 통합 입력 관리 ✅

**파일**: `src/input/InputManager.ts`

- 키보드/마우스/게임패드 통합
- Just pressed/released 감지
- 입력 버퍼링 (150ms)
- Pointer Lock API 지원
- 게임패드 데드존 처리

**사용 예시**:
```typescript
import { InputManager } from './input/InputManager';
import { Action, Axis } from './input/Action';

InputManager.init();
InputManager.update(); // 매 프레임

// 액션 쿼리
if (InputManager.isJustPressed(Action.Attack)) { /* 공격 */ }
if (InputManager.isPressed(Action.Block)) { /* 가드 */ }

// 축 쿼리
const move = InputManager.getMovementVector();
const look = InputManager.getLookDelta();
```

---

### Phase 3: 물리 & 캐릭터 컨트롤러 ✅

#### 1. CollisionGroups.ts - 충돌 그룹 ✅

**파일**: `src/physics/CollisionGroups.ts`

- 충돌 그룹 비트마스크 정의 (PLAYER, ENEMY, ENVIRONMENT 등)
- 사전 정의된 필터 조합 (CollisionGroups.PLAYER, .ENEMY_HITBOX 등)
- Rapier 충돌 필터 유틸리티

#### 2. PhysicsWorld.ts - 물리 월드 ✅

**파일**: `src/physics/PhysicsWorld.ts`

- Rapier 월드 래핑
- 캐릭터 컨트롤러 생성 팩토리
- Raycast/ShapeCast 헬퍼
- 트리거/센서 볼륨 생성
- 디버그 렌더링
- Entity-Collider 매핑

**사용 예시**:
```typescript
import { PhysicsWorld } from './physics/PhysicsWorld';

await PhysicsWorld.init();

// 캐릭터 생성
const { rigidBody, collider, controller } = PhysicsWorld.createCharacter({
  position: new THREE.Vector3(0, 1, 0),
  radius: 0.3,
  halfHeight: 0.7,
  collisionGroups: CollisionGroups.PLAYER,
});

// 물리 스텝
PhysicsWorld.step();

// 레이캐스트
const hit = PhysicsWorld.castRay(origin, direction, maxDist);
```

#### 3. CharacterControllerAdapter.ts - KCC 어댑터 ✅

**파일**: `src/physics/CharacterControllerAdapter.ts`

- Rapier KinematicCharacterController 래핑
- computeColliderMovement → setNextKinematicTranslation 흐름
- 중력 적용 + 지면 감지
- autostep, snap-to-ground, slope 설정
- **핵심**: 콜라이더 직립 유지, 메시만 yaw 회전

**사용 예시**:
```typescript
const kcc = new CharacterControllerAdapter({
  position: new THREE.Vector3(0, 1, 0),
  radius: 0.3,
  halfHeight: 0.7,
  collisionGroups: CollisionGroups.PLAYER,
});

// 이동 (충돌 처리 포함)
const result = kcc.moveWithGravity(horizontalMove, dt, -20);
console.log(result.grounded, result.position);

// 점프
kcc.setVerticalVelocity(10);
```

---

### Phase 4: 플레이어 시스템 ✅

#### 1. PlayerState.ts - 상태 정의 ✅

**파일**: `src/player/PlayerState.ts`

- PlayerStateType enum (Idle, Walk, Roll, Attack 등)
- PlayerStateGroup (Grounded, Airborne, Dead)
- 상태별 설정 (MOVEMENT_STATES, IFRAME_STATES 등)
- 상태-애니메이션 매핑

#### 2. PlayerFSM.ts - 상태 머신 ✅

**파일**: `src/player/PlayerFSM.ts`

- 상태 전이 규칙
- 입력 버퍼링 (150ms)
- 콤보 시스템 (40-60% 윈도우)
- i-frame 관리
- 히트 윈도우 추적

**사용 예시**:
```typescript
const fsm = new PlayerFSM({
  onStateEnter: (state, prev) => console.log(`Enter: ${state}`),
  onAnimationTrigger: (name, opts) => playAnimation(name),
  onConsumeStamina: (amount) => stats.consume(amount),
  getStamina: () => stats.current,
});

// 매 프레임
fsm.preUpdate();
fsm.update(dt);

// 쿼리
if (fsm.hasIFrames) { /* 무적 */ }
if (fsm.inHitWindow) { /* 히트박스 활성 */ }
const speed = baseSpeed * fsm.movementMultiplier;
```

#### 3. PlayerMotor.ts - 이동 물리 ✅

**파일**: `src/player/PlayerMotor.ts`

- CharacterControllerAdapter 기반 이동
- 상태별 속도 (걷기 3.5, 달리기 5.0, 스프린트 7.0, 롤 8.0 m/s)
- 카메라 기준 이동 변환 (`setInputFromCamera`)
- yaw 회전 관리 (콜라이더 직립, 메시만 회전)
- 점프/롤/백스텝 처리

**사용 예시**:
```typescript
const motor = new PlayerMotor({
  position: new THREE.Vector3(0, 1, 0),
});

// 카메라 기준 입력
motor.setInputFromCamera(inputX, inputY, cameraYaw);

// 물리 업데이트
const result = motor.update(dt, fsm.movementMultiplier);

// 메시 동기화
mesh.position.copy(motor.position);
mesh.quaternion.copy(motor.getRotation());
```

#### 4. PlayerStats.ts - HP/스태미나 ✅

**파일**: `src/player/PlayerStats.ts`

- HP 관리 (데미지, 힐, 사망 이벤트)
- 스태미나 시스템 (소비, 지연 회복)
- 포이즈 시스템 (스태거)
- DamageType enum (Physical, Fire, Magic 등)
- EventBus 연동 이벤트 발생

**사용 예시**:
```typescript
const stats = new PlayerStats({
  maxHP: 100,
  maxStamina: 100,
});

// 스태미나 소비/확인
if (stats.hasStamina(20)) {
  stats.consumeStamina(20);
}

// 데미지 처리
stats.takeDamage({
  amount: 30,
  type: DamageType.Physical,
  poiseDamage: 15,
});

// 매 프레임 업데이트 (회복 처리)
stats.update(dt);
```

#### 5. Player.ts - 플레이어 엔티티 ✅

**파일**: `src/player/Player.ts`

- Motor, FSM, Stats 통합
- 입력 처리 (InputManager 연동)
- 락온 타겟 지원
- 메시/애니메이션 동기화
- i-frame 기반 데미지 처리

**사용 예시**:
```typescript
const player = new Player({
  position: new THREE.Vector3(0, 1, 0),
  mesh: playerMesh,
});

// 애니메이션 콜백 설정
player.setAnimationCallback((name, opts) => {
  animationMixer.play(name, opts);
});

// 게임 루프
player.setCameraYaw(camera.yaw);
player.update(dt);

// 전투
player.takeDamage({ amount: 30, type: DamageType.Physical });
if (player.hasIFrames) { /* 무적 */ }
```

---

## 현재 진행 중

### Phase 5 착수 예정
- `src/camera/ThirdPersonCamera.ts` - 3인칭 카메라
- `src/camera/LockOnSystem.ts` - 락온 시스템

---

## 예정된 작업

### Phase 5: 카메라 시스템
- `src/camera/ThirdPersonCamera.ts` - 3인칭 카메라
- `src/camera/LockOnSystem.ts` - 락온 시스템

### Phase 6: 전투 시스템
- `src/combat/AttackSystem.ts` - 공격 실행/히트박스
- `src/combat/DamageSystem.ts` - 데미지 계산
- `src/combat/IFrameSystem.ts` - 무적 프레임

### Phase 7: 보스 AI
- `src/ai/BossFSM.ts` - 보스 상태 머신
- `src/ai/Boss.ts` - 보스 엔티티

### Phase 8: 레벨 시스템
- `src/level/TriggerVolume.ts` - 트리거 영역
- `src/level/GameFlags.ts` - 게임 플래그
- `src/level/LevelLoader.ts` - 레벨 로딩

### Phase 9: UI 시스템
- `src/ui/HUDView.ts` - HUD (HP/스태미나 바)
- `src/ui/BossBar.ts` - 보스 HP 바
- `src/ui/TutorialPrompts.ts` - 튜토리얼 메시지

---

## 디렉터리 구조 (현재 상태)

```
src/
├── core/
│   ├── Time.ts         ✅ NEW
│   ├── EventBus.ts     ✅ NEW
│   ├── Scene.ts        (기존)
│   ├── Camera.ts       (기존)
│   └── Audio.ts        (기존)
├── input/
│   ├── Action.ts       ✅ NEW
│   ├── Bindings.ts     ✅ NEW
│   └── InputManager.ts ✅ NEW
├── physics/
│   ├── Physics.ts      (기존 - 유지)
│   ├── PhysicsWorld.ts ✅ NEW
│   ├── CollisionGroups.ts ✅ NEW
│   └── CharacterControllerAdapter.ts ✅ NEW
├── player/
│   ├── PlayerState.ts  ✅ NEW
│   ├── PlayerFSM.ts    ✅ NEW
│   ├── PlayerMotor.ts  ✅ NEW
│   ├── PlayerStats.ts  ✅ NEW
│   └── Player.ts       ✅ NEW
├── effects/            (기존 유지)
└── ui/
    └── Menu.ts         (기존)
```

---

## 변경 로그

### 2026-02-19 (3차 업데이트)

#### 추가됨
- `src/player/PlayerMotor.ts` - 이동 물리 시스템
- `src/player/PlayerStats.ts` - HP/스태미나/포이즈 시스템
- `src/player/Player.ts` - 플레이어 엔티티 통합

#### 진행률
- Phase 1-4 완료
- 전체 55.6% 완료

### 2026-02-19 (2차 업데이트)

#### 추가됨
- `src/input/Action.ts` - 게임 액션 정의
- `src/input/Bindings.ts` - 키 바인딩 설정
- `src/input/InputManager.ts` - 통합 입력 관리자
- `src/physics/CollisionGroups.ts` - 충돌 그룹 정의
- `src/physics/PhysicsWorld.ts` - 물리 월드 래퍼
- `src/physics/CharacterControllerAdapter.ts` - KCC 어댑터
- `src/player/PlayerState.ts` - 플레이어 상태 정의
- `src/player/PlayerFSM.ts` - 플레이어 상태 머신

#### 진행률
- Phase 1-3 완료
- Phase 4 50% 완료

### 2026-02-19 (1차)

#### 추가됨
- `src/core/Time.ts` - 고정 타임스텝 시간 관리 시스템
- `src/core/EventBus.ts` - 타입 안전 이벤트 버스
- `docs/implementation-progress.md` - 이 문서

---

## 기술 결정 사항

### 1. 고정 타임스텝 (60Hz)
- **이유**: 물리 시뮬레이션의 결정성 보장
- **구현**: Accumulator 패턴
- **참고**: 가변 프레임레이트에서도 물리 동작 일관성 유지

### 2. 이벤트 기반 통신
- **이유**: 시스템 간 디커플링
- **구현**: 타입스크립트 제네릭으로 타입 안전성 확보
- **장점**: 시스템 추가/제거가 쉬움

### 3. Rapier KCC (Kinematic Character Controller)
- **이유**: 기존 Rapier 물리 엔진 활용
- **핵심 흐름**: `computeColliderMovement()` → `computedMovement()` → `setNextKinematicTranslation()`
- **주의점**: KCC는 회전 미지원 → 콜라이더 직립, 메시만 yaw 회전
- **설정**: autostep(0.3, 0.2), snap-to-ground(0.3), maxSlope(45°)

### 4. 입력 버퍼링 (150ms)
- **이유**: 다크소울 스타일 전투에서 입력 누락 방지
- **구현**: 버퍼에 저장 후 상태 전이 시 소비
- **적용**: 공격, 롤, 패리

### 5. FSM 콤보 윈도우 (40-60%)
- **이유**: 자연스러운 콤보 연결
- **구현**: 애니메이션 진행률 기반
- **동작**: 윈도우 내 입력 시 다음 콤보로 전이

---

## 다음 업데이트 예정

Phase 5 (카메라 시스템) 완료 후 업데이트 예정
