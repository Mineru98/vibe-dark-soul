# Dark Souls 웹 게임 구현 진행 상황

**최종 업데이트**: 2026-02-19 (8차 업데이트)

---

## 전체 진행률

```
Phase 1: 코어 인프라     [██████████] 100% (2/2)
Phase 2: 입력 시스템     [██████████] 100% (3/3)
Phase 3: 물리/KCC        [██████████] 100% (3/3)
Phase 4: 플레이어        [██████████] 100% (5/5)
Phase 5: 카메라          [██████████] 100% (2/2)
Phase 6: 전투            [██████████] 100% (3/3)
Phase 7: 보스 AI         [██████████] 100% (2/2)
Phase 8: 레벨            [██████████] 100% (3/3)
Phase 9: UI              [██████████] 100% (3/3)

전체: ██████████████████████████ 100% (27/27)
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

### Phase 5: 카메라 시스템 ✅

#### 1. ThirdPersonCamera.ts - 3인칭 카메라 ✅

**파일**: `src/camera/ThirdPersonCamera.ts`

- 오비트 카메라 (pitch/yaw 회전)
- 충돌 회피 (레이캐스트 기반)
- 부드러운 위치/회전 보간
- 락온 모드 지원
- 어깨 오프셋 (전투 가시성)
- 줌 인/아웃

**사용 예시**:
```typescript
const camera = new ThirdPersonCamera({
  distance: 4.0,
  heightOffset: 1.6,
  shoulderOffset: 0.5,
});

// 타겟 설정
camera.setTarget(player.position);

// 마우스 입력
camera.rotate(deltaX, deltaY);

// 매 프레임 업데이트
camera.update(dt);

// 락온 모드
camera.setLockOnTarget(enemy.position);

// Three.js 카메라 접근
scene.add(camera.getCamera());
```

#### 2. LockOnSystem.ts - 락온 시스템 ✅

**파일**: `src/camera/LockOnSystem.ts`

- 타겟 후보 선정 (거리/FOV 기반)
- LOS (Line of Sight) 체크
- 타겟 전환 (좌/우)
- 자동 해제 (거리/LOS 손실)
- 우선순위 기반 타겟 선택

**사용 예시**:
```typescript
const lockOn = new LockOnSystem({
  maxLockDistance: 20.0,
  lockOnFOV: Math.PI / 3, // 60도
});

// 타겟 등록
lockOn.registerTarget({
  entityId: 'boss_1',
  position: boss.position,
  lockOnHeight: 1.5,
});

// 락온 토글
if (InputManager.isJustPressed(Action.LockOn)) {
  lockOn.toggleLockOn();
}

// 타겟 전환
lockOn.switchTargetRight();
lockOn.switchTargetLeft();

// 매 프레임 업데이트
lockOn.setPlayerPosition(player.position);
lockOn.setCamera(camera.position, camera.forward);
lockOn.update(dt);

// 락온 포인트 가져오기
if (lockOn.isLockedOn) {
  camera.setLockOnTarget(lockOn.lockOnPoint);
}
```

---

### Phase 6: 전투 시스템 ✅

#### 1. IFrameSystem.ts - 무적 프레임 관리 ✅

**파일**: `src/combat/IFrameSystem.ts`

- 엔티티별 i-frame 관리
- 다양한 소스 지원 (Roll, Backstep, HyperArmor, Respawn, PlungeAttack)
- 애니메이션 진행률 기반 i-frame 갱신
- 부분 감소 지원 (damageReduction 0-1)
- 자동 만료 처리

**사용 예시**:
```typescript
import { IFrameSystem, IFrameSource } from './combat/IFrameSystem';

// 롤 i-frame 부여 (0.3초)
IFrameSystem.grantIFrames('player', IFrameSource.Roll, 0.3);

// 애니메이션 진행률 기반 i-frame
IFrameSystem.updateProgressBasedIFrames(
  'player',
  IFrameSource.Roll,
  progress,  // 현재 진행률
  0.12,      // i-frame 시작
  0.46,      // i-frame 끝
  0.75       // 총 애니메이션 시간
);

// 체크
if (IFrameSystem.hasIFrames('player')) { /* 무적 */ }

// 데미지 감소 계산
const finalDamage = IFrameSystem.calculateDamageAfterIFrames('player', baseDamage);
```

#### 2. DamageSystem.ts - 데미지 계산 ✅

**파일**: `src/combat/DamageSystem.ts`

- 중앙화된 데미지 처리
- I-frame 체크 → 가드 체크 → 데미지 적용 → 사망 체크
- 패리 지원
- 가드 스태미나 소비/브레이크
- 포이즈 데미지 및 스태거
- 저항력 시스템
- 크리티컬 히트 배율

**처리 순서**:
1. i-frame 체크 → 무시 (DamageBlockedReason.IFrames)
2. 가드/패리 체크 → 스태미나 데미지 or 무시
3. HP 데미지 적용 + 포이즈 데미지
4. 사망 체크

**사용 예시**:
```typescript
import { DamageSystem, DamageRequest, DamageSourceType } from './combat/DamageSystem';
import { DamageType } from './player/PlayerStats';

// 엔티티 등록
DamageSystem.registerEntity({
  entityId: 'player',
  currentHP: 100,
  maxHP: 100,
  currentStamina: 100,
  maxStamina: 100,
  currentPoise: 30,
  maxPoise: 30,
  isGuarding: false,
  isParrying: false,
  isDead: false,
  guardDamageReduction: 0.9,
  onTakeDamage: (result) => console.log(`Took ${result.finalDamage} damage`),
  onDie: () => console.log('Player died'),
});

// 데미지 처리
const result = DamageSystem.processDamage({
  sourceEntityId: 'boss_1',
  sourceType: DamageSourceType.BossAttack,
  targetEntityId: 'player',
  baseDamage: 40,
  damageType: DamageType.Physical,
  poiseDamage: 30,
  canBeBlocked: true,
  canBeDodged: true,
});

if (result.applied) {
  console.log(`Dealt ${result.finalDamage} damage, staggered: ${result.targetStaggered}`);
}
```

#### 3. AttackSystem.ts - 공격 실행/히트박스 ✅

**파일**: `src/combat/AttackSystem.ts`

- 공격 데이터 정의 (데미지, 프레임, 히트박스 등)
- 프레임 스윕 히트박스 (무기 소켓 2점 → shapeCast)
- AoE 공격 (overlapSphere)
- 다중 히트 방지 (같은 대상 1회만)
- 콤보 윈도우 지원
- DamageSystem 연동

**기본 공격 라이브러리**:
- `player_light_1/2/3` - 플레이어 라이트 콤보
- `player_heavy` - 플레이어 헤비 어택
- `player_plunge` - 플런지 어택
- `boss_wide_sweep`, `boss_overhead_smash`, `boss_jump_slam`, `boss_aoe_stomp` - 보스 패턴

**사용 예시**:
```typescript
import { AttackSystem, WeaponSockets } from './combat/AttackSystem';
import { CollisionGroups } from './physics/CollisionGroups';

// 공격 시작
const attack = AttackSystem.startAttack(
  'player',
  'player_light_1',
  playerCollider,
  { base: weaponBase, tip: weaponTip },
  playerForward
);

// 매 프레임 업데이트 (애니메이션 진행률 기준)
const hits = AttackSystem.updateAttack(
  attack,
  animProgress,  // 0-1
  { base: weaponBase, tip: weaponTip },
  CollisionGroups.ENEMY
);

// 콤보 체크
if (AttackSystem.isInComboWindow(attack) && nextAttackInput) {
  // 다음 콤보 시작
}

// 공격 종료
AttackSystem.endAttack(attack);
```

---

### Phase 7: 보스 AI ✅

#### 1. BossFSM.ts - 보스 상태 머신 ✅

**파일**: `src/ai/BossFSM.ts`

- 보스 AI 상태 관리 (Idle, Engage, AttackTelegraph, AttackActive, Recover, Staggered, Dead)
- 가중치 기반 공격 패턴 선택
- 거리/쿨다운 기반 패턴 필터링
- 타겟 추적 (거리, 각도)
- 텔레그래프 → 액티브 → 리커버리 흐름

**상태 흐름**:
```
Idle → (플레이어 감지) → Engage → (공격 결정) → AttackTelegraph
                                                    ↓
                                              AttackActive
                                                    ↓
                                                Recover → Engage

(피격 시 포이즈 0) → Staggered → Engage
(HP 0) → Dead
```

**기본 패턴 (TUTORIAL_BOSS_PATTERNS)**:
- `boss_wide_sweep` (30%) - 근접 0-4m, 텔레그래프 0.8s
- `boss_overhead_smash` (25%) - 근접 0-3.5m, 텔레그래프 1.0s
- `boss_jump_slam` (20%) - 중거리 4-12m, 텔레그래프 0.6s
- `boss_aoe_stomp` (25%) - 범위 0-5m, 텔레그래프 0.5s

**사용 예시**:
```typescript
import { BossFSM, BossStateType, TUTORIAL_BOSS_PATTERNS } from './ai/BossFSM';

const fsm = new BossFSM('boss_1', TUTORIAL_BOSS_PATTERNS, {
  onStateEnter: (state, prev) => console.log(`Boss: ${prev} -> ${state}`),
  onAttackSelected: (pattern) => console.log(`Selected: ${pattern.attackId}`),
  onAnimationTrigger: (name, opts) => playAnimation(name),
});

// 타겟 설정
fsm.setTarget('player');
fsm.updateTargetInfo(distance, angle);

// 매 프레임
fsm.update(dt);

// 쿼리
if (fsm.currentState === BossStateType.AttackActive) {
  // 히트박스 활성화
}
if (fsm.isVulnerable) {
  // 크리티컬 가능
}
```

#### 2. Boss.ts - 보스 엔티티 ✅

**파일**: `src/ai/Boss.ts`

- BossFSM 기반 AI 제어
- 3D 메시 및 Rapier 물리 바디 관리
- DamageSystem 연동 (HP, 포이즈, 스태거)
- AttackSystem 연동 (히트박스 실행)
- 플런지 감지 영역 (센서 콜라이더)
- 타겟 추적 및 이동
- 포이즈 자동 회복

**주요 기능**:
- `spawn(scene)` - 월드에 보스 스폰
- `despawn(scene)` - 월드에서 제거
- `update(dt)` - 매 프레임 업데이트
- `setTarget(id, position)` - 타겟 설정
- `checkPlungeZone(pos, velY)` - 플런지 영역 체크
- `receivePlungeAttack()` - 플런지 히트 처리

**사용 예시**:
```typescript
import { Boss, TUTORIAL_BOSS_CONFIG } from './ai/Boss';

// 보스 생성
const boss = new Boss({
  ...TUTORIAL_BOSS_CONFIG,
  position: new THREE.Vector3(0, 0, 20),
});

// 스폰
boss.spawn(scene);

// 타겟 설정
boss.setTarget('player', player.position);

// 게임 루프
function update(dt: number) {
  boss.updateTargetPosition(player.position);
  boss.update(dt);

  // 플런지 체크
  if (boss.checkPlungeZone(player.position, player.velocityY)) {
    if (playerIsAttacking) {
      boss.receivePlungeAttack();
    }
  }
}

// 이벤트 수신
EventBus.on('boss:died', () => {
  console.log('Victory!');
});
```

**설정 (TUTORIAL_BOSS_CONFIG)**:
```typescript
{
  id: 'boss_tutorial',
  name: 'Asylum Demon',
  maxHP: 1000,
  maxPoise: 100,
  poiseRecoveryDelay: 3.0,
  poiseRecoveryRate: 20.0,
  moveSpeed: 2.5,
  turnSpeed: 2.0,
  colliderRadius: 1.5,
  colliderHeight: 4.0,
  plungeDetectionRadius: 2.5,
  plungeDetectionHeight: 3.0,
}
```

---

### Phase 8: 레벨 시스템 ✅

#### 1. TriggerVolume.ts - 트리거 영역 ✅

**파일**: `src/level/TriggerVolume.ts`

- 센서 콜라이더 래핑 (Box, Sphere, Cylinder)
- onEnter/onExit/onStay 콜백
- EventBus 연동 (trigger:enter, trigger:exit, trigger:stay)
- 원샷 트리거 지원
- TriggerManager 싱글톤으로 전역 관리

**사용 예시**:
```typescript
import { TriggerManager, TriggerShape } from './level/TriggerVolume';

// 트리거 생성
const trigger = TriggerManager.create({
  id: 'boss_room',
  position: new THREE.Vector3(0, 1, 20),
  shape: TriggerShape.Box,
  halfExtents: new THREE.Vector3(5, 3, 5),
  oneShot: false,
}, {
  onEnter: (entityId) => console.log(`${entityId} entered!`),
  onExit: (entityId) => console.log(`${entityId} exited!`),
});

// 스폰
TriggerManager.spawnAll();

// 매 프레임
TriggerManager.update(dt);
```

#### 2. GameFlags.ts - 게임 플래그 ✅

**파일**: `src/level/GameFlags.ts`

- 게임 진행 상태 플래그 관리
- 타입 안전한 플래그 enum (GameFlag)
- EventBus 연동 (flag:set, flag:cleared)
- localStorage 저장/로드
- 조건 체커 (require, requireAny, exclude)

**플래그 목록**:
- 튜토리얼: `LEARNED_ROLL`, `LEARNED_ATTACK`, `LEARNED_BLOCK`
- 장비: `HAS_WEAPON`, `HAS_SHIELD`, `HAS_ESTUS`
- 보스: `MET_BOSS_ONCE`, `BOSS_DEFEATED`, `BOSS_PLUNGED`
- 체크포인트: `CHECKPOINT_CELL`, `CHECKPOINT_CORRIDOR`
- 문/단축키: `BOSS_DOOR_OPENED`, `SHORTCUT_UNLOCKED`

**사용 예시**:
```typescript
import { GameFlags, GameFlag, checkFlagCondition } from './level/GameFlags';

// 플래그 설정
GameFlags.set(GameFlag.HAS_WEAPON);

// 플래그 체크
if (GameFlags.is(GameFlag.MET_BOSS_ONCE)) {
  // 보스 이미 만남
}

// 복합 조건
const canEnterBossRoom = checkFlagCondition({
  require: [GameFlag.HAS_WEAPON],
  exclude: [GameFlag.BOSS_DEFEATED],
});

// 저장/로드
GameFlags.saveToStorage();
GameFlags.loadFromStorage();
```

#### 3. LevelLoader.ts - 레벨 로딩 ✅

**파일**: `src/level/LevelLoader.ts`

- JSON 기반 레벨 데이터 로딩
- 지오메트리 생성 (Box, Plane, Cylinder, Ramp)
- 물리 콜라이더 자동 생성
- 트리거 자동 배치
- 스포너 시스템 (보스, 적, 아이템)
- 체크포인트 관리
- 환경 설정 (조명, 안개)

**레벨 데이터 구조**:
```typescript
interface LevelData {
  id: string;
  name: string;
  playerSpawn: Vec3;
  geometry: GeometryDef[];  // 레벨 지오메트리
  triggers: TriggerDef[];   // 트리거 영역
  spawners: SpawnerDef[];   // 엔티티 스포너
  checkpoints: CheckpointDef[]; // 체크포인트
  ambientLight?: number;
  fogColor?: number;
}
```

**사용 예시**:
```typescript
import { LevelLoader, TUTORIAL_LEVEL } from './level/LevelLoader';

// 레벨 로드
await LevelLoader.load(TUTORIAL_LEVEL, scene);

// 플레이어 스폰 위치
const spawn = LevelLoader.getPlayerSpawn();

// 스포너 콜백 등록
LevelLoader.registerSpawnCallback('boss_tutorial', (spawner) => {
  const boss = new Boss(TUTORIAL_BOSS_CONFIG);
  boss.spawn(scene);
  return boss.id;
});

// 스폰 처리
LevelLoader.processSpawns();

// 레벨 언로드
LevelLoader.unload();
```

**내장 튜토리얼 레벨 (TUTORIAL_LEVEL)**:
- 감방 → 복도 → 보스룸 레이아웃
- 튜토리얼 트리거 (구르기 학습)
- 체크포인트 3개 (cell, corridor, boss_room)
- 보스 스포너 (조건부: BOSS_DEFEATED가 아닐 때)

---

### Phase 9: UI 시스템 ✅

#### 1. HUDView.ts - HUD (HP/스태미나 바) ✅

**파일**: `src/ui/HUDView.ts`

- Dark Souls 스타일 HP/스태미나 바
- EventBus 자동 연동 (player:healthChanged, player:staminaChanged)
- 지연 데미지 표시 (노란색 → 빨간색)
- 낮은 HP 경고 애니메이션
- 데미지 플래시 효과

**사용 예시**:
```typescript
import { HUDView } from './ui/HUDView';

// 초기화
HUDView.init();

// 수동 업데이트 (EventBus 사용 시 자동)
HUDView.setHP(80, 100);
HUDView.setStamina(50, 100);

// 표시/숨김
HUDView.toggle();

// 정리
HUDView.destroy();
```

#### 2. BossBar.ts - 보스 HP 바 ✅

**파일**: `src/ui/BossBar.ts`

- 화면 하단 중앙 보스 HP 바
- EventBus 자동 연동 (boss:engaged, boss:healthChanged, boss:died, boss:staggered)
- 지연 데미지 표시
- 스태거 시 금색 펄스 애니메이션
- 사망 시 자동 페이드 아웃

**사용 예시**:
```typescript
import { BossBar } from './ui/BossBar';

// 초기화
BossBar.init();

// 표시 (EventBus 통해 자동 호출됨)
BossBar.show('Asylum Demon', 1000, 1000);

// 숨김
BossBar.hide();

// 정리
BossBar.destroy();
```

#### 3. TutorialPrompts.ts - 튜토리얼 메시지 ✅

**파일**: `src/ui/TutorialPrompts.ts`

- 화면 하단 튜토리얼 프롬프트
- 키 입력 힌트 표시 (자동 포맷팅)
- EventBus 자동 연동 (ui:tutorialShow, ui:tutorialHide)
- 자동 숨김 (5초)
- 메시지 큐잉 지원
- 미리 정의된 튜토리얼 메시지 (TUTORIAL_MESSAGES)

**미리 정의된 메시지**:
- `ROLL`: 구르기 안내
- `ATTACK`: 공격 안내
- `BLOCK`: 가드 안내
- `LOCK_ON`: 락온 안내
- `HEAL`: 회복 안내
- `PLUNGE`: 플런지 공격 안내

**사용 예시**:
```typescript
import { TutorialPrompts, TUTORIAL_MESSAGES, showTutorialSequence } from './ui/TutorialPrompts';

// 초기화
TutorialPrompts.init();

// 메시지 표시
TutorialPrompts.show('Roll to evade enemy attacks', 'Space');

// 미리 정의된 메시지
TutorialPrompts.showPredefined('ROLL');

// 시퀀스 표시
await showTutorialSequence([
  { message: 'Move around', action: 'W A S D' },
  { message: 'Roll to evade', action: 'Space' },
  { message: 'Attack enemies', action: 'MouseLeft' },
]);

// 정리
TutorialPrompts.destroy();
```

---

## 구현 완료

모든 Phase (1-9)가 완료되었습니다.

---

## 디렉터리 구조 (최종)

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
├── camera/
│   ├── ThirdPersonCamera.ts ✅ NEW
│   └── LockOnSystem.ts ✅ NEW
├── combat/
│   ├── IFrameSystem.ts  ✅ NEW
│   ├── DamageSystem.ts  ✅ NEW
│   └── AttackSystem.ts  ✅ NEW
├── ai/
│   ├── BossFSM.ts       ✅ NEW
│   └── Boss.ts          ✅ NEW
├── level/
│   ├── TriggerVolume.ts ✅ NEW
│   ├── GameFlags.ts     ✅ NEW
│   └── LevelLoader.ts   ✅ NEW
├── effects/            (기존 유지)
└── ui/
    ├── Menu.ts         (기존)
    ├── HUDView.ts      ✅ NEW
    ├── BossBar.ts      ✅ NEW
    └── TutorialPrompts.ts ✅ NEW
```

---

## 변경 로그

### 2026-02-19 (8차 업데이트)

#### 추가됨
- `src/ui/HUDView.ts` - Dark Souls 스타일 HP/스태미나 바
- `src/ui/BossBar.ts` - 보스 HP 바 (스태거 애니메이션 포함)
- `src/ui/TutorialPrompts.ts` - 튜토리얼 메시지 시스템

#### 진행률
- Phase 1-9 완료
- 전체 100% 완료 🎉

### 2026-02-19 (7차 업데이트)

#### 추가됨
- `src/level/TriggerVolume.ts` - 센서 기반 트리거 시스템
- `src/level/GameFlags.ts` - 게임 진행 플래그 관리
- `src/level/LevelLoader.ts` - JSON 기반 레벨 로딩 (내장 튜토리얼 레벨 포함)

#### 진행률
- Phase 1-8 완료
- 전체 92.6% 완료

### 2026-02-19 (6차 업데이트)

#### 추가됨
- `src/ai/BossFSM.ts` - 보스 상태 머신 (가중치 기반 패턴 선택)
- `src/ai/Boss.ts` - 보스 엔티티 (물리, 전투, AI 통합)

#### 진행률
- Phase 1-7 완료
- 전체 81.5% 완료

### 2026-02-19 (5차 업데이트)

#### 추가됨
- `src/combat/IFrameSystem.ts` - 무적 프레임 관리 시스템
- `src/combat/DamageSystem.ts` - 중앙화된 데미지 처리 시스템
- `src/combat/AttackSystem.ts` - 공격 실행 및 히트박스 시스템

#### 진행률
- Phase 1-6 완료
- 전체 74.1% 완료

### 2026-02-19 (4차 업데이트)

#### 추가됨
- `src/camera/ThirdPersonCamera.ts` - 3인칭 오비트 카메라
- `src/camera/LockOnSystem.ts` - 락온 타겟팅 시스템

#### 진행률
- Phase 1-5 완료
- 전체 63.0% 완료

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

### 6. 3인칭 카메라 충돌 회피
- **이유**: 벽 뒤로 카메라가 들어가는 것 방지
- **구현**: 레이캐스트로 장애물 감지 → 거리 조정
- **설정**: collisionRadius(0.2), collisionPadding(0.3)
- **필터**: ENVIRONMENT 그룹만 충돌 체크

### 7. 락온 LOS 체크
- **이유**: 벽 뒤의 적에게 락온 방지
- **구현**: 주기적 레이캐스트 (0.1초 간격)
- **타임아웃**: LOS 손실 1초 후 락온 해제
- **FOV**: 획득 60°, 전환 90°

### 8. 프레임 스윕 히트박스
- **이유**: 빠른 공격에서 히트 누락 방지
- **구현**: 무기 소켓 2점(base, tip) → shapeCast
- **방식**: 이전 프레임 위치에서 현재 위치로 캡슐 캐스트
- **AoE**: 슬램 공격은 overlapSphere 사용

### 9. 다중 히트 방지
- **이유**: 한 공격에 같은 대상이 여러 번 피격되는 것 방지
- **구현**: ActiveAttack.hitEntities Set으로 추적
- **리셋**: 새로운 공격 시작 시 초기화

### 10. 중앙화된 데미지 처리
- **이유**: 데미지 로직 일관성 및 가드/i-frame 처리 통합
- **흐름**: IFrameSystem 체크 → Guard 체크 → HP/Poise 적용
- **이벤트**: combat:dodged, combat:blocked, combat:parried, combat:damage

### 11. 보스 AI 패턴 선택 (가중치 기반)
- **이유**: 다양하고 예측 가능한 보스 행동
- **구현**: 거리/쿨다운 필터링 후 가중치 랜덤 선택
- **텔레그래프**: 공격 전 예고 시간 (0.5-1.0초) → 플레이어 반응 기회
- **쿨다운**: 같은 패턴 연속 사용 방지

### 12. 플런지 공격 감지
- **이유**: Dark Souls 스타일 플런지 기믹
- **구현**: 보스 상부에 센서 콜라이더 배치
- **조건**: 플레이어가 보스 위에서 하강(5m/s 이상) + 공격 입력
- **효과**: 보스 즉시 스태거

### 13. 포이즈 회복 시스템
- **이유**: 지속 공격 → 스태거 가능하게
- **구현**: 마지막 피격 후 지연 시간(3초) 이후 자동 회복
- **회복 속도**: 초당 20 포이즈

### 14. 트리거 볼륨 (센서 기반)
- **이유**: 레벨 이벤트 (보스룸 진입, 체크포인트, 아이템 픽업)
- **구현**: Rapier 센서 콜라이더 + 매 프레임 오버랩 쿼리
- **이벤트**: onEnter/onExit/onStay 콜백 + EventBus 연동
- **원샷**: 한 번 트리거 후 비활성화 옵션

### 15. 게임 플래그 시스템
- **이유**: 게임 진행 상태 추적 (튜토리얼, 보스 만남, 장비 획득)
- **구현**: Map 기반 플래그 + localStorage 영속화
- **조건 체커**: require (AND), requireAny (OR), exclude (NOT)
- **이벤트**: flag:set, flag:cleared로 다른 시스템과 연동

### 16. JSON 기반 레벨 로딩
- **이유**: 데이터 기반 레벨 디자인, 런타임 수정 용이
- **구조**: geometry + triggers + spawners + checkpoints
- **지오메트리**: Box, Plane, Cylinder, Ramp (자동 물리 콜라이더)
- **스포너**: 콜백 등록으로 엔티티 타입별 처리

### 17. 지연 데미지 표시 (HP 바)
- **이유**: Dark Souls 스타일 피해 시각화
- **구현**: 노란색 바가 실제 HP보다 천천히 감소
- **타이밍**: 데미지 후 300-500ms 지연 → 0.5-0.8초에 걸쳐 페이드

### 18. 튜토리얼 메시지 큐잉
- **이유**: 연속 트리거 시 메시지 손실 방지
- **구현**: 표시 중일 때 새 메시지는 큐에 추가
- **처리**: 현재 메시지 종료 후 자동으로 다음 메시지 표시

### 19. EventBus 기반 UI 연동
- **이유**: UI와 게임 로직 디커플링
- **이벤트**: player:healthChanged, boss:engaged, ui:tutorialShow 등
- **패턴**: UI 초기화 시 EventBus 구독, destroy 시 구독 해제

---

## 구현 완료

모든 Phase (1-9) 구현이 완료되었습니다. 다음 단계는 통합 테스트 및 폴리싱입니다.
