# Soulslike 모션/에셋 리서치 (2026-02-19)

## 목적
- 현재 프로젝트를 다크소울 스타일에 더 가깝게 만들기 위해
  - 전투 모션(회피/약공/강공/가드) 품질 개선
  - 무기/캐릭터 에셋 확보
  - 실제 적용 가능한 구현 파이프라인 정리

참고:
- 전용 서브에이전트 실행 도구는 현재 세션에서 제공되지 않아, 별도 리서치 트랙으로 문서화함.

## 핵심 조사 결과
1. 현재 소스 에셋 상태
- 프로젝트 내 기본 기사 모델은 공격/구르기 전용 애니메이션이 부족함.
- 즉, 코드만으로 완전한 다크소울형 모션을 만들기에는 한계가 있고, 추가 모션 클립이 필요함.

2. 구현 기술 적합성
- Three.js 애니메이션 시스템은 `AnimationMixer`, `AnimationAction` 기반 블렌딩과 전환에 적합.
- Rapier JavaScript Character Controller는 이동 충돌 처리용이며, 루트모션/모션 품질은 별도 애니메이션 시스템에서 해결해야 함.

3. 에셋 소스/라이선스 관점
- Quaternius 계열은 게임 프로토타입에 유리한 무료 리소스를 제공.
- Kenney는 CC0 정책을 명시.
- Mixamo는 FAQ 기준으로 상업적 사용 가능 방향의 안내가 있으나, 배포 형태(원본 재배포 금지 등)는 최종 정책 문구 재확인이 필요.
- Sketchfab은 모델별 라이선스가 다르므로 개별 확인이 필수.

## 권장 구현 로드맵
### 1단계 (즉시 적용, 1~2일)
- 현재 반영한 절차적 모션(공격/회피/가드)을 유지
- 입력/FSM/스태미나/상태복귀 안정성 우선
- 무기 본 장착과 충돌 타이밍(히트윈도우) 정합성 점검

### 2단계 (중기, 2~4일)
- 공격/롤/피격 전용 클립을 포함한 기사 리그로 교체
- 상태별 애니메이션 블렌드 트리 정리:
  - `Idle/Walk/Run`
  - `Backstep/Roll`
  - `AttackLightCombo1~3`
  - `AttackHeavy`
  - `Guard/GuardHit/HitReact`
- 상태 종료 시점을 모션 시간 기반으로 통일(현재처럼 duration + FSM 강제복귀 유지)

### 3단계 (완성도, 3~7일)
- 무기 트레일, 타격 리액션(카메라/사운드), 피격 방향별 애드립 모션 추가
- 루트모션 사용 여부를 상태별로 분리:
  - 회피/강공은 루트모션 또는 루트모션 유사 보정
  - 보행/질주는 물리 모터 주도

## 부족 에셋 체크리스트
- 필수:
  - 기사형 캐릭터 + 전투 애니메이션 세트(롤/백스텝/약공/강공/가드/피격/사망)
  - 검/방패 실모델(저해상도 LOD 포함)
- 권장:
  - 공격 궤적 VFX
  - 타격/회피/가드 SFX
  - 피격 파티클/디칼

## 적용 시 주의사항
- 동일 스켈레톤/본 네이밍 체계를 유지해야 리타겟 비용이 크게 줄어듦.
- 에셋 라이선스는 “소스별, 파일별”로 문서화해야 나중에 배포 리스크를 줄일 수 있음.
- Mixamo/Sketchfab 계열은 최종 배포 전에 정책 최신 문구를 다시 확인해야 함.

## 참고 출처
- Three.js Animation System: https://threejs.org/docs/#manual/en/introduction/Animation-system
- Three.js AnimationMixer: https://threejs.org/docs/pages/AnimationMixer.html
- Three.js AnimationAction: https://threejs.org/docs/pages/AnimationAction.html
- Rapier JS Character Controller: https://rapier.rs/docs/user_guides/javascript/character_controller/
- Quaternius Knight Character Pack: https://quaternius.com/packs/knightcharacter.html
- Kenney License (CC0): https://kenney.nl/license
- Mixamo FAQ (Adobe): https://helpx.adobe.com/kr/creative-cloud/faq/mixamo-faq.html
- Sketchfab Licenses: https://sketchfab.com/licenses
