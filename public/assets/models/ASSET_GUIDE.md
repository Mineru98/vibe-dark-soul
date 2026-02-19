# Dark Souls Style 3D Asset Guide

이 가이드는 vibe-dark-soul 게임에 다크소울 스타일의 3D 에셋을 추가하는 방법을 설명합니다.

## 권장 무료 에셋 소스

### 1. Solus Knight (추천)
**URL:** https://manneko.itch.io/solustheknight

- Low Poly 스타일의 애니메이션된 기사 캐릭터
- GLTF 포맷 지원
- 다양한 애니메이션 포함 (Idle, Walk, Run, Attack, Block, Death 등)
- 상업적 사용 가능

**설치 방법:**
1. 위 URL에서 모델 다운로드
2. `solus_knight.glb` 파일을 `public/assets/models/` 폴더에 복사

### 2. Quaternius Knight Pack (CC0)
**URL:** https://quaternius.com/packs/knightcharacter.html

- CC0 라이선스 (완전 무료)
- 다양한 무기와 방어구 포함
- FBX/Blend 포맷 (Blender에서 GLTF로 변환 필요)

**설치 방법:**
1. 다운로드 후 Blender에서 열기
2. File > Export > glTF 2.0 (.glb/.gltf) 선택
3. `knight_quaternius.glb`로 저장하여 `public/assets/models/` 폴더에 복사

### 3. Sketchfab 무료 모델

**Knight Artorias (다크소울):**
https://sketchfab.com/3d-models/knight-artorias-dark-souls-remastered-39d5150f92984524be7d4cc6854e34c0

**Heavy Knight:**
https://sketchfab.com/3d-models/heavy-knight-2343cc4a52be4f1eaa64c995886f8273

**Dark Souls 3 Firelink Set:**
https://sketchfab.com/3d-models/dark-souls-3-firelink-set-9d52df0b5981453998e96a5d8e673621

**설치 방법:**
1. Sketchfab에서 Download 클릭
2. glTF 포맷 선택
3. 다운로드된 파일을 `public/assets/models/` 폴더에 복사

### 4. Mixamo (애니메이션)
**URL:** https://www.mixamo.com/

캐릭터에 애니메이션을 추가할 수 있습니다:
1. Mixamo에 가입/로그인
2. 캐릭터 업로드 또는 기본 캐릭터 선택
3. 필요한 애니메이션 적용 (Sword Attack, Block, Roll 등)
4. FBX 다운로드 후 Blender에서 GLTF로 변환

## 무기 에셋

### Free3D / TurboSquid
- **Medieval Sword:** https://free3d.com/3d-models/medieval-sword
- **Knight Sword:** https://www.turbosquid.com/Search/3D-Models/free/knight+sword

### Fab (Epic Games)
- **Knight Sword and Shield:** https://www.fab.com/listings/a89ee455-c903-4257-bd0f-e25b09553572
- 무료 Low-poly 모델, GLTF 포맷 지원

## 파일 구조

```
public/
└── assets/
    └── models/
        ├── solus_knight.glb      # 플레이어 캐릭터
        ├── knight_quaternius.glb  # 대체 캐릭터
        ├── sword_longsword.glb   # 무기
        ├── shield_knight.glb     # 방패
        └── boss_demon.glb        # 보스 캐릭터
```

## 코드에서 사용하기

### 기본 사용법

```typescript
import { CharacterModel, KNIGHT_MODEL_PRESETS } from './assets/CharacterModel';

// Solus Knight 프리셋 사용
const character = new CharacterModel(KNIGHT_MODEL_PRESETS.solus);
await character.load();

// 씬에 추가
scene.add(character.getObject());

// 애니메이션 재생
character.playAnimation('attack_light');
```

### 커스텀 모델 설정

```typescript
const customConfig = {
  modelPath: '/assets/models/my_knight.glb',
  scale: 1.0,
  heightOffset: 0,
  animationMapping: {
    idle: 'Idle',
    walk: 'Walk_Forward',
    run: 'Run_Forward',
    attack_light: 'Sword_Slash_1',
    attack_heavy: 'Sword_Slash_Heavy',
    roll: 'Dodge_Roll',
    guard: 'Block_Idle',
    hit_stun: 'Hit_Reaction',
    death: 'Death_Back',
  },
};

const character = new CharacterModel(customConfig);
```

## 애니메이션 이름 매핑

게임에서 사용하는 애니메이션 이름과 모델의 실제 애니메이션 이름을 매핑해야 합니다:

| 게임 상태 | Solus Knight | Mixamo | Quaternius |
|----------|--------------|--------|------------|
| idle | Idle | idle | Idle |
| walk | Walk | walking | Walking |
| run | Run | running | Running |
| sprint | Run | sprint | Running |
| roll | Roll | roll | Roll |
| attack_light | Attack_1 | slash | Sword_Slash |
| attack_heavy | Attack_2 | heavy_slash | Sword_Slash |
| guard | Block | block_idle | Blocking |
| hit_stun | Hit | hit_reaction | Getting_Hit |
| death | Death | death | Dying |

## 트러블슈팅

### 모델이 너무 크거나 작음
`scale` 값을 조정하세요:
- Mixamo 모델: `scale: 0.01`
- Quaternius 모델: `scale: 0.5`
- Solus 모델: `scale: 1.0`

### 모델이 땅에 묻힘
`heightOffset` 값을 조정하세요:
```typescript
{
  heightOffset: 0.5  // 위로 0.5 유닛 올림
}
```

### 애니메이션이 재생되지 않음
1. 모델에 애니메이션이 포함되어 있는지 확인
2. 콘솔에서 사용 가능한 애니메이션 이름 확인:
```typescript
console.log(character.getAvailableAnimations());
```
3. `animationMapping`에서 정확한 이름 사용

### Blender에서 GLTF 변환 팁
1. **애니메이션 포함:** Export 시 "Animation" 체크박스 활성화
2. **텍스처 포함:** "Materials" > "Export" 옵션에서 이미지 임베드 선택
3. **스케일 확인:** Apply Scale 후 Export

## 라이선스 주의사항

- 에셋을 사용하기 전 각 에셋의 라이선스를 확인하세요
- CC0: 상업적 사용 가능, 저작자 표시 불필요
- CC-BY: 상업적 사용 가능, 저작자 표시 필요
- 개인용: 상업적 사용 불가

## 추가 리소스

- **glTF Sample Models:** https://github.com/KhronosGroup/glTF-Sample-Models
- **Poly Pizza:** https://poly.pizza/
- **Kenney Assets:** https://kenney.nl/assets
