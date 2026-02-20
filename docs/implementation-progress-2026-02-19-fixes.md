# 2026-02-19 수정 진행 문서 (실측 기반)

## 0. 작업 목표
사용자 요청 항목 기준으로 실제 플레이 동작을 재현/검증하고, 문제가 확인된 항목을 코드 레벨에서 즉시 수정한 뒤 반복 테스트했다.

요청 항목:
- WASD 이동 방향 반전 느낌 수정
- 구르기(롤/백스텝) 모션을 소울라이크 감성에 맞게 개선
- 마우스 카메라 회전 민감도/반응성 개선
- 검 휘두르기 모션 강화
- 캐릭터 실전용 검 장착 확인
- 부족한 에셋 검토

---

## 1. 실행/검증 환경
- 날짜: 2026-02-19
- 로컬 서버: Vite dev server
- 실행 포트: `127.0.0.1:3000`
- 브라우저 테스트: Playwright MCP

### 1-1. 포트 3000 강제 재기동 이행
반복 테스트 전후로 `3000` 포트 리스너를 강제 종료 후 재기동.
- 1차 리스너 PID 종료 및 재실행
- 2차 수정 후 재검증 전 다시 종료/재실행
- 최종 리스너 확인: `127.0.0.1:3000 LISTENING`

---

## 2. 재현된 문제(수정 전)
Playwright MCP 실측 결과:

1. 이동 축 반전
- 카메라 기준으로 `W` 입력 시 전진이 아닌 역방향 이동이 재현됨.

2. 마우스 카메라 제어 체감 저하
- 카메라 회전이 포인터락 상태에 강하게 의존했고, 포인터락 실패 시 마우스 회전이 사실상 동작하지 않음.
- 입력 스케일이 과도하게 낮아 체감 민감도가 매우 낮음.

3. 롤/백스텝 감각
- 롤 이동이 일정 속도 직선형으로 나가 체감이 단조로움.
- 소울라이크 특유의 초반 버스트/후반 감속 느낌이 부족.

4. 공격 체감
- 모델 원본에 공격 애니메이션이 없어 절차형 보정에 의존.
- 검 휘두르기 포즈 강도가 더 필요.

---

## 3. 적용한 코드 수정

### 3-1. WASD 축 변환 수정
- 파일: `src/player/PlayerMotor.ts`
- 변경:
  - 카메라 상대 입력 변환식에서 Z 축 부호를 수정.
  - 결과적으로 `W/S`가 카메라 기준 전/후진으로 정상 매핑.

핵심 변경 요약:
- 기존: `worldZ = -inputX * sin + inputY * cos`
- 변경: `worldZ = inputX * sin - inputY * cos`

---

### 3-2. 롤/백스텝 루트 모션 개선
- 파일: `src/player/PlayerMotor.ts`, `src/player/PlayerFSM.ts`
- 변경:
  - 롤/백스텝 이동을 고정 속도에서 시간 기반 속도 곡선으로 변경.
  - 롤/백스텝 상태 시간을 조정해 초반 회피-후반 회복 느낌 강화.
  - 롤/백스텝 i-frame 구간도 새 타이밍에 맞춰 재조정.

적용 파라미터(요약):
- Roll duration: `0.75 -> 0.62`
- Backstep duration: `0.60 -> 0.44`
- Roll/Backstep 이동은 progress 기반 가감속 곡선 사용

---

### 3-3. 공격 루트 모션 + 절차 모션 강화
- 파일: `src/player/PlayerMotor.ts`, `src/assets/CharacterModel.ts`, `src/player/PlayerFSM.ts`
- 변경:
  - `AttackLight/AttackHeavy` 진입 시 짧은 전진 런지(root-motion 유사) 추가.
  - 절차형 공격 모션을 1종에서 콤보별 3종(`Attack_Light_1/2/3`)으로 분리.
  - 척추/팔/전완/손 회전량을 키워 검 휘두름 시각 피드백 강화.
  - Heavy는 더 큰 와인드업/릴리즈로 무게감 강화.

---

### 3-4. 카메라 마우스 반응성 개선
- 파일: `src/input/Bindings.ts`, `src/input/InputManager.ts`, `src/core/GameApp.ts`, `src/camera/ThirdPersonCamera.ts`
- 변경:
  - 마우스 look 축 계산을 포인터락 필수 조건에서 해제(포인터락 없이도 동작).
  - 기본 마우스 감도 상향: `0.002 -> 1.0`
  - 카메라 회전 민감도 상향: `0.003 -> 0.0032`
  - InputManager 초기화 시 렌더러 DOM 전달: `InputManager.init(getRenderer().domElement)`
  - 자동 pointer lock 요청 제거(실환경 실패 시 입력 무반응 방지)

효과:
- 포인터락 실패 시에도 마우스 이동에 즉시 반응.
- Playwright 테스트에서 yaw/pitch 변화량이 정상적으로 관측됨.

---

### 3-5. 검 장착 확인
- 파일: `src/assets/CharacterModel.ts`
- 상태:
  - `PlayerSword`를 `mixamorigRightHand` 본에 장착 유지.
  - 실측: `hasSword=true`, `swordParent=mixamorigRightHand` 확인.

---

### 3-6. 상태 매핑 누락 버그 정리
- 파일: `src/player/PlayerState.ts`
- 변경:
  - `STATE_ANIMATIONS`에서 깨진 주석 라인으로 인해 `Run` 매핑이 섞이던 부분 정리.
  - `WalkBack`, `Run` 매핑을 분리해 명시.

---

## 4. Playwright MCP 재검증 결과

### 4-1. WASD 방향 검증
카메라 기준 로컬 성분 측정:
- `W`: forward 양수
- `S`: forward 음수
- `A`: right 음수(좌)
- `D`: right 양수(우)

결론: 반전 재현 이슈 해소.

### 4-2. 마우스 카메라 검증
- 마우스 이동 후 yaw/pitch 변화량이 0이 아닌 값으로 지속 관측.
- pointer lock warning이 더 이상 반복 출력되지 않음.

### 4-3. 롤/백스텝 검증
- `Space`: `Backstep` 정상 진입/복귀.
- `W + Space`: `Roll` 진입 후 짧은 시간 내 감속-복귀 패턴 확인.
- 고정 속도 직진 대비 회피 템포가 개선됨.

### 4-4. 공격 검증
- 마우스 좌클릭 홀드 시 `AttackLight` 정상 진입.
- 공격 중 소폭 전진 런지(`delta z` 변화) 확인.
- 스태미나 소모/복구 정상.

---

## 5. 0.1초(100ms) 프레임 캡처 산출물
경로: `test-captures/2026-02-19-fixes`

시나리오별 18프레임 캡처(100ms 간격):
- `movement-w-forward`
- `movement-roll-w-space`
- `combat-attack-light`
- `camera-mouse-turn`

---

## 6. 추가 에셋 검토 요약
현재 주력 모델(`solus_knight.glb`)에는 전투용 원본 공격/회피 애니메이션 클립이 부족하여 절차형 보정 비중이 높다.

따라서, 실제 다크소울 감성 고도화를 위해 아래 보강이 필요:
- humanoid 리그 기반 전투 애니메이션 세트(roll/backstep/light combo/heavy/hit react/guard)
- 무기 애니메이션(검/방패) 연동 클립
- 타격 VFX/SFX 보강
- 환경 보강 에셋: 실제 파이어 루프 오디오(현재 synthetic fallback), favicon 리소스

자세한 리서치는 별도 문서 참조:
- `docs/research-soulslike-motion-assets-2026-02-19.md`
- `docs/research-subagent-soulslike-implementation-2026-02-19.md`

---

## 7. 변경 파일 목록
- `src/player/PlayerMotor.ts`
- `src/player/PlayerFSM.ts`
- `src/player/PlayerState.ts`
- `src/input/Bindings.ts`
- `src/input/InputManager.ts`
- `src/core/GameApp.ts`
- `src/camera/ThirdPersonCamera.ts`
- `src/assets/CharacterModel.ts`
