# 2026-02-19 수정 진행 문서

## 1) 실행/검증 환경
- `3000` 포트 점유 프로세스 강제 종료 후 Vite 재실행 완료
- 실행 확인: `127.0.0.1:3000` 리스닝
- Playwright MCP로 실제 입력 제어 기반 검증 수행
- `0.1초(100ms)` 간격 프레임 캡처 수행

캡처 저장 경로:
- `test-captures/2026-02-19/movement`
- `test-captures/2026-02-19/actions`

## 2) 이슈별 조치 내역
### A. WASD 반전 문제
원인:
- `MoveY` 축이 키보드까지 반전 처리됨
- 카메라 기준 월드 변환식의 축 부호가 뒤집혀 있음

수정:
- `src/input/Bindings.ts`: `Axis.MoveY.inverted`를 `false`로 변경
- `src/input/InputManager.ts`: 게임패드 `MoveY`만 별도 반전 처리
- `src/player/PlayerMotor.ts`: 카메라 상대 이동 벡터 변환식 수정

결과(Playwright 샘플):
- `W`: `Run` 상태로 전진
- `S`: `WalkBack` 상태로 후진
- `A`: 좌측 이동
- `D`: 우측 이동

### B. 맵 반짝임/랙처럼 보이는 문제
원인:
- 타이틀 씬 지면(`Plane`)과 레벨 지면(`Box`)이 동일 높이에서 중첩되어 Z-fighting 발생

수정:
- `src/core/Scene.ts`: 타이틀 지면/안개 평면에 이름 부여
- `src/core/GameApp.ts`: 게임플레이 진입 시 `titleGround`, `titleFogPlane` 제거

검증:
- 런타임 오브젝트 검사에서 `titleGround=false`, `titleFogPlane=false` 확인

### C. 구르기/백스텝 미동작
원인 1:
- FSM 스태미나 소비 콜백이 `void` 반환이라 `tryTransition`이 실패

원인 2:
- 타이머 기반 상태 종료 시 `tryTransition(Idle)`가 비인터럽트 상태에 막혀 상태 고착

수정:
- `src/player/Player.ts`: 스태미나 콜백을 `boolean` 반환(`tryConsumeStamina`)
- `src/player/PlayerFSM.ts`: 타이머 만료 상태는 `forceTransition(Idle)` 사용

결과:
- `Space`: `Backstep` 진입/종료 정상
- `W + Space`: `Roll` 진입 후 `Run/Idle` 복귀 정상

### D. 칼 휘두르기 모션 부재
원인:
- 현재 `solus_knight.glb`는 `Idle/Walk/Run/TPose`만 포함, 공격/회피 클립 없음

수정:
- `src/assets/CharacterModel.ts` 전면 정리
- 공격/회피/가드/피격에 대한 절차적(Procedural) 보정 포즈 추가
- 상태 기반으로 상체/팔/척추 회전을 오버레이 적용

결과:
- `AttackLight` 진입 및 스태미나 소모 확인
- 공격 후 `Idle`로 정상 복귀

### E. 전투용 칼 장착
수정:
- `src/assets/CharacterModel.ts`: 검 메쉬(블레이드/가드/그립/폼멜) 생성
- `mixamorigRightHand` 본에 `PlayerSword`로 장착

검증:
- 런타임에서 `hasSword=true`, `swordParentName=mixamorigRightHand` 확인

### F. 추가 에셋 이상 여부 점검
확인:
- 폰트 파일(`public/assets/fonts/Cinzel-*.ttf`)이 TTF가 아닌 HTML로 저장되어 있었음
- 브라우저 콘솔의 `Failed to decode downloaded font` 경고 원인과 일치

조치:
- Google Fonts 원본 `Cinzel[wght].ttf`로 폰트 파일 교체

결과:
- 폰트 디코드 경고 제거 확인

## 3) 에셋 검토 요약
- 현재 포함된 기사 모델(`solus_knight`, `soldier`)은 공격/구르기 애니메이션이 없음
- 따라서 다크소울급 모션 품질을 위해 추가 애니메이션 클립 또는 신규 리깅 에셋이 필요
- 임시 대응으로 절차적 모션 오버레이를 구현해 플레이 가능 상태로 복구

## 4) 변경 파일
- `src/input/Bindings.ts`
- `src/input/InputManager.ts`
- `src/player/PlayerMotor.ts`
- `src/player/Player.ts`
- `src/player/PlayerFSM.ts`
- `src/core/Scene.ts`
- `src/core/GameApp.ts`
- `src/assets/CharacterModel.ts`
