/**
 * AssetLoader - 3D 모델 및 텍스처 로딩 시스템
 *
 * Three.js GLTFLoader를 사용하여 GLTF/GLB 모델을 로드합니다.
 * 다크소울 스타일 캐릭터, 무기, 방어구 에셋을 지원합니다.
 *
 * 지원 포맷: .gltf, .glb
 */

import * as THREE from 'three';
// @ts-expect-error - Three.js addons type declarations
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
// @ts-expect-error - Three.js addons type declarations
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// @ts-expect-error - Three.js addons type declarations
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * 로드된 모델 데이터
 */
export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer | null;
}

/**
 * 캐릭터 모델 설정
 */
export interface CharacterModelConfig {
  scale?: number;
  rotation?: THREE.Euler;
  offset?: THREE.Vector3;
}

/**
 * AssetLoader 클래스
 */
class AssetLoaderClass {
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  private loadedModels: Map<string, LoadedModel> = new Map();
  private loadingPromises: Map<string, Promise<LoadedModel>> = new Map();

  constructor() {
    // GLTF 로더 초기화
    this.gltfLoader = new GLTFLoader();

    // Draco 압축 지원 (선택적)
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  /**
   * GLTF/GLB 모델 로드
   */
  async loadModel(path: string, config?: CharacterModelConfig): Promise<LoadedModel> {
    // 이미 로드된 모델 확인
    const cached = this.loadedModels.get(path);
    if (cached) {
      return this.cloneModel(cached);
    }

    // 로딩 중인 모델 확인
    const loading = this.loadingPromises.get(path);
    if (loading) {
      const result = await loading;
      return this.cloneModel(result);
    }

    // 새로 로드
    const loadPromise = this.loadGLTF(path, config);
    this.loadingPromises.set(path, loadPromise);

    try {
      const model = await loadPromise;
      this.loadedModels.set(path, model);
      this.loadingPromises.delete(path);
      return this.cloneModel(model);
    } catch (error) {
      this.loadingPromises.delete(path);
      throw error;
    }
  }

  /**
   * GLTF 파일 로드 (내부)
   */
  private loadGLTF(path: string, config?: CharacterModelConfig): Promise<LoadedModel> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf: GLTF) => {
          const model = this.processGLTF(gltf, config);
          console.log(`[AssetLoader] Loaded: ${path}`);
          console.log(`[AssetLoader] Animations: ${gltf.animations.map((a: THREE.AnimationClip) => a.name).join(', ')}`);
          resolve(model);
        },
        (progress: ProgressEvent) => {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`[AssetLoader] Loading ${path}: ${percent.toFixed(1)}%`);
        },
        (error: Error) => {
          console.error(`[AssetLoader] Failed to load ${path}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * GLTF 데이터 처리
   */
  private processGLTF(gltf: GLTF, config?: CharacterModelConfig): LoadedModel {
    const scene = gltf.scene;

    // 스케일 적용
    if (config?.scale) {
      scene.scale.setScalar(config.scale);
    }

    // 회전 적용
    if (config?.rotation) {
      scene.rotation.copy(config.rotation);
    }

    // 오프셋 적용
    if (config?.offset) {
      scene.position.copy(config.offset);
    }

    // 그림자 설정
    scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // PBR 머티리얼 최적화
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.envMapIntensity = 0.5;
        }
      }
    });

    // 애니메이션 믹서 생성 (애니메이션이 있는 경우)
    const mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(scene) : null;

    return {
      scene,
      animations: gltf.animations,
      mixer,
    };
  }

  /**
   * 모델 복제 (인스턴싱용)
   * SkeletonUtils.clone을 사용하여 SkinnedMesh의 skeleton을 제대로 복제
   */
  private cloneModel(model: LoadedModel): LoadedModel {
    // SkeletonUtils.clone을 사용하여 skeleton 포함 복제
    const clonedScene = SkeletonUtils.clone(model.scene) as THREE.Group;
    const mixer = model.animations.length > 0 ? new THREE.AnimationMixer(clonedScene) : null;

    return {
      scene: clonedScene,
      animations: model.animations, // 애니메이션 클립은 공유
      mixer,
    };
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.loadedModels.clear();
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    this.loadedModels.forEach((model) => {
      model.scene.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      if (model.mixer) {
        model.mixer.stopAllAction();
      }
    });
    this.loadedModels.clear();
    this.dracoLoader.dispose();
  }
}

// 싱글톤 인스턴스
export const AssetLoader = new AssetLoaderClass();
