# Soulslike 모션/에셋 리서치 (2026-02-19)

## 1. 목적
현재 프로젝트를 "다크 소울 풍" 전투 템포/모션 감각에 더 가깝게 만들기 위한 구현 가능한 기준을 정리한다.

핵심 질문:
1. 현재 코드/에셋에서 무엇이 부족한가?
2. 즉시 가능한 개선과 중기 개선을 어떻게 나눌 것인가?
3. 에셋 소싱 시 라이선스 리스크는 무엇인가?

---

## 2. 현재 상태 진단

### 2-1. 애니메이션 클립 현황
실측(로딩 로그 기준):
- `solus_knight.glb` 내 확인된 클립: `Idle`, `Run`, `TPose`, `Walk`

부족한 핵심 전투 클립:
- `Roll`, `Backstep`, `Attack_Light_1~3`, `Attack_Heavy`, `Guard`, `Hit_React`

결론:
- 전투 모션 상당 부분을 절차형(procedural) 보정으로 보완해야 하며,
- 장기적으로는 전투 클립이 포함된 리그/애니메이션 세트가 필요.

부족 에셋 체크리스트:
- humanoid 기사형 캐릭터 + 전투 애니메이션 세트
- 검/방패 무기 세트(리깅 호환)
- 타격/회피/가드 SFX
- 공격 궤적/히트 스파크 VFX
- 환경 보강 리소스(favicon, 실제 fire loop 오디오)

---

## 3. 구현 전략 (실행 가능 순서)

### 3-1. 1단계: 코드 기반 감각 보정 (즉시)
적용 완료/적용 가능 항목:
- 카메라 상대 이동 축 정확화
- 롤/백스텝 속도 곡선(초반 버스트, 후반 감속)
- 공격 런지(root-motion 유사) 추가
- 절차형 공격 모션(콤보 단계별 포즈 차등)

장점:
- 에셋 추가 없이 즉시 체감 개선 가능
- 입력/FSM/스태미나/피격 판정과 빠르게 결합 가능

한계:
- 원본 모캡/핸드키 애니메이션 대비 디테일, 체중감, 관절 자연스러움 한계

### 3-2. 2단계: 전투 애니메이션 세트 도입 (중기)
권장 세트(최소 구성):
- locomotion: `idle/walk/run`
- dodge: `roll/backstep`
- attack: `light combo(3)`, `heavy`
- defense/hit: `guard`, `guard hit`, `hit react`

적용 방식:
- 우선 humanoid 리그/본 네이밍 정규화
- `AnimationMixer`에서 상태 전환 블렌딩(짧은 fade) 구성
- 루트모션은 상태별 선택 적용(회피/강공격 중심)

---

## 4. 에셋 라이선스/소싱 체크포인트

### 4-1. 실무 체크리스트
- 모델/애니메이션 다운로드 URL과 라이선스 문구를 프로젝트 문서에 같이 보존
- 상업 사용/2차 배포/원본 재배포 금지 조항 확인
- 동일 모델이라도 사이트별 라이선스가 다를 수 있으므로 원문 확인 필수

### 4-2. 참고 링크
- Three.js Animation System: https://threejs.org/docs/#manual/en/introduction/Animation-system
- Three.js AnimationMixer: https://threejs.org/docs/pages/AnimationMixer.html
- Rapier Character Controller(JS): https://rapier.rs/docs/user_guides/javascript/character_controller/
- Mixamo FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Quaternius Knight Character Pack: https://quaternius.com/packs/knightcharacter.html
- Kenney License(CC0): https://kenney.nl/license
- Sketchfab Licenses: https://sketchfab.com/licenses

---

## 5. 프로젝트 적용 결론

현재 프로젝트는 다음 접근이 최적:
1. 단기: 절차형 모션 + 루트모션 보정으로 소울라이크 템포 확보
2. 중기: 전투 클립이 포함된 통합 리그 에셋으로 교체
3. 장기: 타격 VFX/SFX/카메라 쉐이크/히트스톱 등 전투 연출 계층 추가

이번 수정에서 1단계는 즉시 반영했으며, 2단계(에셋 교체) 준비를 위해 별도 백그라운드 리서치 문서를 추가한다.
