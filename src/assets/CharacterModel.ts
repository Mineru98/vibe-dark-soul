/**
 * CharacterModel - 캐릭터 3D 모델 및 애니메이션 관리
 *
 * GLTF/GLB 모델을 로드하고 애니메이션을 제어합니다.
 * 다크소울 스타일의 기사 캐릭터를 지원합니다.
 */

import * as THREE from 'three';
import { AssetLoader, LoadedModel } from './AssetLoader';

/**
 * 애니메이션 매핑 타입
 * 게임 상태 -> 모델 애니메이션 이름
 */
export interface AnimationMapping {
  idle: string;
  walk: string;
  run: string;
  sprint: string;
  roll: string;
  backstep: string;
  attack_light: string;
  attack_heavy: string;
  attack_combo_1?: string;
  attack_combo_2?: string;
  attack_combo_3?: string;
  guard: string;
  guard_hit?: string;
  hit_stun: string;
  death: string;
  falling?: string;
  landing?: string;
  use_item?: string;
}

/**
 * 캐릭터 모델 설정
 */
export interface CharacterModelConfig {
  modelPath: string;
  scale?: number;
  heightOffset?: number;
  rotationX?: number; // X축 회전 (라디안) - Z-up 모델 보정용
  animationMapping?: Partial<AnimationMapping>;
}

/**
 * 기본 애니메이션 매핑 (Mixamo 스타일)
 */
const DEFAULT_ANIMATION_MAPPING: AnimationMapping = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  sprint: 'Sprint',
  roll: 'Roll',
  backstep: 'Backstep',
  attack_light: 'Attack',
  attack_heavy: 'Heavy Attack',
  guard: 'Block',
  hit_stun: 'Hit',
  death: 'Death',
};

/**
 * CharacterModel 클래스
 */
export class CharacterModel {
  private model: LoadedModel | null = null;
  private root: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentAction: THREE.AnimationAction | null = null;
  private animationMapping: AnimationMapping;
  private config: CharacterModelConfig;

  // 로드 상태
  private loaded: boolean = false;
  private loading: boolean = false;

  constructor(config: CharacterModelConfig) {
    this.config = config;
    this.root = new THREE.Group();
    this.root.name = 'CharacterModel';

    // 애니메이션 매핑 병합
    this.animationMapping = {
      ...DEFAULT_ANIMATION_MAPPING,
      ...config.animationMapping,
    };
  }

  /**
   * 모델 로드
   */
  async load(): Promise<void> {
    if (this.loaded || this.loading) return;

    this.loading = true;

    try {
      this.model = await AssetLoader.loadModel(this.config.modelPath, {
        scale: this.config.scale ?? 1,
        offset: new THREE.Vector3(0, this.config.heightOffset ?? 0, 0),
      });

      // X축 회전 적용 (Z-up 모델 보정)
      if (this.config.rotationX !== undefined) {
        this.model.scene.rotation.x = this.config.rotationX;
      }

      // 루트에 모델 추가
      this.root.add(this.model.scene);

      // 애니메이션 믹서 설정
      if (this.model.mixer) {
        this.mixer = this.model.mixer;
        this.setupAnimations();
      }

      this.loaded = true;
      console.log('[CharacterModel] Model loaded successfully');
    } catch (error) {
      console.error('[CharacterModel] Failed to load model:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * 애니메이션 설정
   */
  private setupAnimations(): void {
    if (!this.model || !this.mixer) return;

    // 모든 애니메이션 클립에서 액션 생성
    for (const clip of this.model.animations) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
      console.log(`[CharacterModel] Animation registered: ${clip.name}`);
    }

    // 기본 idle 애니메이션 재생
    this.playAnimation('idle', { loop: true });
  }

  /**
   * 애니메이션 재생
   */
  playAnimation(
    name: string,
    options?: {
      loop?: boolean;
      speed?: number;
      fadeIn?: number;
      fadeOut?: number;
    }
  ): void {
    if (!this.mixer) return;

    // 게임 상태 이름 -> 실제 애니메이션 이름 변환
    const animName = this.animationMapping[name as keyof AnimationMapping] ?? name;

    // 액션 찾기
    let action = this.actions.get(animName);

    // 이름이 정확히 일치하지 않으면 부분 매칭 시도
    if (!action) {
      for (const [key, act] of this.actions) {
        if (key.toLowerCase().includes(animName.toLowerCase())) {
          action = act;
          break;
        }
      }
    }

    if (!action) {
      // 폴백 처리: Walk_Back -> Walk, 기타 누락 애니메이션 처리
      const fallbacks: Record<string, string> = {
        'Walk_Back': 'Walk',
        'Sprint': 'Run',
        'Backstep': 'Roll',
      };

      const fallbackName = fallbacks[animName];
      if (fallbackName) {
        action = this.actions.get(fallbackName);
        if (!action) {
          for (const [key, act] of this.actions) {
            if (key.toLowerCase().includes(fallbackName.toLowerCase())) {
              action = act;
              break;
            }
          }
        }
      }

      if (!action) {
        console.warn(`[CharacterModel] Animation not found: ${animName}`);
        return;
      }
    }

    // 이전 애니메이션 페이드 아웃
    const fadeTime = options?.fadeIn ?? 0.2;

    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.fadeOut(options?.fadeOut ?? fadeTime);
    }

    // 새 애니메이션 설정
    action.reset();
    action.setLoop(
      options?.loop ? THREE.LoopRepeat : THREE.LoopOnce,
      options?.loop ? Infinity : 1
    );
    action.clampWhenFinished = !options?.loop;
    action.timeScale = options?.speed ?? 1;
    action.fadeIn(fadeTime);
    action.play();

    this.currentAction = action;
  }

  /**
   * 애니메이션 업데이트
   */
  update(dt: number): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }
  }

  /**
   * 3D Object 반환
   */
  getObject(): THREE.Group {
    return this.root;
  }

  /**
   * 로드 완료 여부
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * 사용 가능한 애니메이션 목록
   */
  getAvailableAnimations(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * 위치 설정
   */
  setPosition(position: THREE.Vector3): void {
    this.root.position.copy(position);
  }

  /**
   * 회전 설정
   */
  setRotation(quaternion: THREE.Quaternion): void {
    this.root.quaternion.copy(quaternion);
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
    }

    // 모델에서 자식 제거
    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }

    this.actions.clear();
    this.model = null;
    this.mixer = null;
    this.loaded = false;
  }
}

/**
 * 프리셋: 다크소울 스타일 기사 모델 설정
 */
export const KNIGHT_MODEL_PRESETS = {
  // Three.js Soldier - 기본 애니메이션 캐릭터
  solus: {
    modelPath: '/assets/models/solus_knight.glb',
    scale: 1.0,
    heightOffset: -0.9, // 캡슐 콜라이더 높이에 맞춤
    animationMapping: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      sprint: 'Run',
      roll: 'Run', // Soldier에는 Roll이 없어서 Run으로 대체
      backstep: 'Walk',
      attack_light: 'Idle', // 공격 애니메이션 없음
      attack_heavy: 'Idle',
      attack_combo_1: 'Idle',
      attack_combo_2: 'Idle',
      attack_combo_3: 'Idle',
      guard: 'Idle',
      hit_stun: 'Idle',
      death: 'Idle',
    },
  },

  // Quaternius Knight - CC0 기사 모델
  quaternius: {
    modelPath: '/assets/models/knight_quaternius.glb',
    scale: 0.5,
    heightOffset: 0,
    animationMapping: {
      idle: 'Idle',
      walk: 'Walking',
      run: 'Running',
      sprint: 'Running',
      roll: 'Roll',
      backstep: 'WalkingBackwards',
      attack_light: 'Sword_Slash',
      attack_heavy: 'Sword_Slash',
      guard: 'Blocking',
      hit_stun: 'Getting_Hit',
      death: 'Dying',
    },
  },

  // Mixamo Character (일반적인 Mixamo 리깅)
  mixamo: {
    modelPath: '/assets/models/character.glb',
    scale: 0.01,
    heightOffset: 0,
    animationMapping: {
      idle: 'idle',
      walk: 'walking',
      run: 'running',
      sprint: 'sprint',
      roll: 'roll',
      backstep: 'walk_back',
      attack_light: 'slash',
      attack_heavy: 'heavy_slash',
      guard: 'block_idle',
      hit_stun: 'hit_reaction',
      death: 'death',
    },
  },
} as const;
