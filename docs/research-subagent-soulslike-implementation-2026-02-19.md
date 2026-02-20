# [백그라운드 리서치 트랙] Soulslike 구현 가능성 분석 (2026-02-19)

## 트랙 개요
요청사항 4번(서브에이전트 기반 백그라운드 리서치)에 대응하여, 구현과 병렬로 "실제 다크소울 느낌을 재현하기 위한 기술/에셋 실행안"을 정리했다.

역할 분리:
- 메인 트랙: 코드 수정 + Playwright 동작 검증
- 백그라운드 리서치 트랙: 모션 규격/에셋 소싱/리스크 문서화

---

## 1. 구현 기준선(실행 가능한 스펙)

### 1-1. 회피(롤/백스텝)
권장 특성:
- 총 길이 짧고 명확한 스타트업/무적/회복 단계
- 이동은 "초반 빠름 -> 후반 감속" 곡선
- i-frame은 전체의 초중반에 집중

이번 반영 기준:
- Roll duration: 0.62s
- Backstep duration: 0.44s
- i-frame 재배치:
  - Roll: 0.10~0.54 (normalized)
  - Backstep: 0.06~0.32 (normalized)

### 1-2. 경공격/강공격
권장 특성:
- 경공격: 짧은 전진 런지 + 빠른 회수
- 강공격: 긴 와인드업 + 큰 릴리즈
- 콤보 단계마다 궤적(우->좌, 좌->우, 오버헤드) 차등

이번 반영 기준:
- Light 공격 중 짧은 런지 추가
- Procedural `Attack_Light_1/2/3` 분리
- Heavy는 와인드업/스윙량 확대

### 1-3. 카메라 입력
권장 특성:
- 입력 장치/브라우저 제약(pointer lock 실패 등)과 무관하게 기본 회전 반응 확보
- 감도 스케일은 0이 아닌 실측 가능한 범위

이번 반영 기준:
- 마우스 look에서 pointer lock 의존 제거
- 기본 mouseSensitivity 대폭 상향
- camera rotationSensitivity 소폭 상향

---

## 2. 에셋 갭 분석 (현재 기준)

현재 모델의 실질적 한계:
- 전투 핵심 클립 부재 (`Roll/Backstep/Attack combo/Guard/HitReact`)

따라서 필요한 에셋 타입:
1. humanoid 기사형 캐릭터 + 전투 애니메이션 세트
2. 검/방패 무기 세트(리깅 호환)
3. 타격/회피/가드 SFX
4. 공격 궤적/히트 스파크 VFX

---

## 3. 구현 리스크와 대응

리스크 A: 절차형 모션만으로는 "실제 다크소울 동일" 수준 한계
- 대응: 2단계에서 전투 애니메이션 세트 도입

리스크 B: 에셋 라이선스 불명확 시 배포 리스크
- 대응: URL + 라이선스 원문 + 취득 날짜를 문서화

리스크 C: 리그 불일치로 리타겟 비용 증가
- 대응: 도입 전 본 네이밍/휴머노이드 호환성 체크리스트 적용

---

## 4. 바로 실행 가능한 후속 백로그

P1 (즉시)
- 공격 히트 타이밍에 맞춘 무기 트레일 VFX 추가
- 공격/회피 SFX 추가

P2 (중기)
- 전투 클립 포함 캐릭터로 교체 후 상태별 blend 재튜닝
- 회피/공격에 선택적 root motion 도입

P3 (완성도)
- 카메라 충격(미세 shake), 히트스톱, 타격 방향 반응

---

## 5. 참고 링크
- Three.js Animation System: https://threejs.org/docs/#manual/en/introduction/Animation-system
- Three.js AnimationMixer: https://threejs.org/docs/pages/AnimationMixer.html
- Rapier JS Character Controller: https://rapier.rs/docs/user_guides/javascript/character_controller/
- Mixamo FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Quaternius Knight Pack: https://quaternius.com/packs/knightcharacter.html
- Kenney License: https://kenney.nl/license
- Sketchfab Licenses: https://sketchfab.com/licenses
