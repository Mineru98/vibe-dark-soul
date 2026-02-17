# Ashen Flame - Dark Souls Tribute

다크 소울의 타이틀 화면 분위기를 three.js + Rapier 물리 엔진으로 웹에서 재현한 프로젝트입니다.

## 기술 스택

- **Renderer**: three.js
- **Physics**: Rapier (WASM)
- **Bundler**: Vite
- **Runtime**: Bun

## 실행 방법

```bash
# 의존성 설치
bun install

# 개발 서버 실행
bun run dev

# 프로덕션 빌드
bun run build
```

## 프로젝트 구조

```
├── public/
│   └── assets/
│       ├── hdri/           # HDRI 환경맵
│       ├── textures/       # PBR 텍스처
│       │   ├── burned_ground/  # 그을린 바닥
│       │   └── stone_floor/    # 돌 바닥
│       ├── audio/          # 사운드 파일 (수동 추가 필요)
│       ├── fonts/          # Cinzel 폰트
│       └── models/         # 3D 모델 (옵션)
├── src/
│   ├── core/
│   │   ├── Scene.ts        # 씬, 조명, 바닥 관리
│   │   ├── Camera.ts       # 카메라 + 패럴랙스
│   │   └── Audio.ts        # 오디오 시스템
│   ├── effects/
│   │   ├── Particles.ts    # 불티 파티클 시스템
│   │   └── PostProcessing.ts # Bloom 후처리
│   ├── physics/
│   │   └── Physics.ts      # Rapier 물리 엔진
│   ├── ui/
│   │   └── Menu.ts         # UI 인터랙션
│   └── main.ts             # 엔트리 포인트
├── index.html
├── vite.config.ts
└── package.json
```

## 포함된 에셋

### 자동 다운로드됨
- ✅ HDRI 환경맵 (Poly Haven - kloppenheim_02)
- ✅ 그을린 바닥 PBR 텍스처 (Poly Haven - burned_ground_01)
- ✅ 돌 바닥 PBR 텍스처 (Poly Haven - rock_pitted_mossy)
- ✅ Cinzel 폰트 (Google Fonts)

### 수동 추가 필요
- ⚠️ **사운드 파일**: freesound.org에서 직접 다운로드 필요
  - [Fireplace Fire Crackling](https://freesound.org/people/RyanKingArt/sounds/717579/) (CC0)
  - 다운로드 후 `public/assets/audio/fire_crackle.mp3`로 저장
  - *사운드 파일이 없어도 합성 사운드로 대체됩니다*

## 주요 기능

### 1. 시각 효과
- **본파이어**: 불티 파티클 + 발광 코어
- **조명**: HDRI 환경광 + 깜빡이는 포인트 라이트
- **안개**: FogExp2로 깊이감 연출
- **Bloom**: 불꽃만 살아있게 후처리

### 2. 인터랙션
- **카메라 패럴랙스**: 마우스 이동에 따른 미세한 시차
- **카메라 호흡**: 시간 기반 아이들 스웨이
- **메뉴 호버**: 불꽃 강도 반응 + 언더라인 애니메이션

### 3. 물리 시뮬레이션
- **Rapier 엔진**: 15개의 재/잔해 조각이 물리적으로 움직임
- **중력 + 충돌**: 바닥과 충돌하며 자연스럽게 굴러감

## 연출 파라미터 (조정 가능)

```typescript
// Scene.ts
scene.fog = new THREE.FogExp2(0x0a0a0f, 0.045);

// PostProcessing.ts
bloomPass.strength = 0.9;
bloomPass.radius = 0.5;
bloomPass.threshold = 0.3;

// Particles.ts
const PARTICLE_COUNT = 400;
// 수명: 1.5 ~ 3초

// Camera.ts
// 패럴랙스: ±1.7도
// 스웨이: 0.3 ~ 0.5도
```

## 라이선스

에셋 라이선스:
- HDRI/텍스처: [Poly Haven](https://polyhaven.com/) (CC0)
- 폰트: [Google Fonts](https://fonts.google.com/specimen/Cinzel) (OFL)
- 사운드: 개별 확인 필요 (freesound.org)
