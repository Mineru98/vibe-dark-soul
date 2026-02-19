import * as THREE from 'three';
import { AssetLoader, LoadedModel } from './AssetLoader';

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

export interface CharacterModelConfig {
  modelPath: string;
  scale?: number;
  heightOffset?: number;
  rotationX?: number;
  animationMapping?: Partial<AnimationMapping>;
}

type AnimationKey = keyof AnimationMapping;
type ProceduralMotionType =
  | 'none'
  | 'attackLight1'
  | 'attackLight2'
  | 'attackLight3'
  | 'attackHeavy'
  | 'roll'
  | 'backstep'
  | 'guard'
  | 'hitStun';

interface ProceduralMotion {
  type: ProceduralMotionType;
  time: number;
  duration: number;
  loop: boolean;
}

const DEFAULT_ANIMATION_MAPPING: AnimationMapping = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  sprint: 'Sprint',
  roll: 'Roll',
  backstep: 'Backstep',
  attack_light: 'Attack_Light_1',
  attack_heavy: 'Attack_Heavy',
  attack_combo_1: 'Attack_Light_1',
  attack_combo_2: 'Attack_Light_2',
  attack_combo_3: 'Attack_Light_3',
  guard: 'Guard_Idle',
  guard_hit: 'Guard_Hit',
  hit_stun: 'Hit_React',
  death: 'Death',
  falling: 'Fall',
  landing: 'Land',
  use_item: 'Use_Item',
};

const PROCEDURAL_DURATIONS: Record<
  Exclude<ProceduralMotionType, 'none'>,
  number
> = {
  attackLight1: 0.44,
  attackLight2: 0.48,
  attackLight3: 0.52,
  attackHeavy: 0.72,
  roll: 0.62,
  backstep: 0.45,
  guard: 0.8,
  hitStun: 0.3,
};

export class CharacterModel {
  private model: LoadedModel | null = null;
  private root: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentAction: THREE.AnimationAction | null = null;
  private animationMapping: AnimationMapping;
  private config: CharacterModelConfig;

  private loaded: boolean = false;
  private loading: boolean = false;

  private rightArmBone: THREE.Bone | null = null;
  private leftArmBone: THREE.Bone | null = null;
  private rightForeArmBone: THREE.Bone | null = null;
  private rightHandBone: THREE.Bone | null = null;
  private spineBone: THREE.Bone | null = null;
  private sword: THREE.Group | null = null;
  private modelBasePitch: number = 0;

  private proceduralMotion: ProceduralMotion = {
    type: 'none',
    time: 0,
    duration: 0,
    loop: false,
  };

  private tempEuler: THREE.Euler = new THREE.Euler();
  private tempQuat: THREE.Quaternion = new THREE.Quaternion();

  constructor(config: CharacterModelConfig) {
    this.config = config;
    this.root = new THREE.Group();
    this.root.name = 'CharacterModel';
    this.animationMapping = {
      ...DEFAULT_ANIMATION_MAPPING,
      ...config.animationMapping,
    };
  }

  async load(): Promise<void> {
    if (this.loaded || this.loading) return;

    this.loading = true;
    try {
      this.model = await AssetLoader.loadModel(this.config.modelPath, {
        scale: this.config.scale ?? 1,
        offset: new THREE.Vector3(0, this.config.heightOffset ?? 0, 0),
      });

      if (this.config.rotationX !== undefined) {
        this.model.scene.rotation.x = this.config.rotationX;
      }

      this.root.add(this.model.scene);

      if (this.model.mixer) {
        this.mixer = this.model.mixer;
        this.setupAnimations();
      }

      this.setupCombatRig();

      this.loaded = true;
      console.log('[CharacterModel] Model loaded successfully');
    } catch (error) {
      console.error('[CharacterModel] Failed to load model:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  private setupAnimations(): void {
    if (!this.model || !this.mixer) return;

    for (const clip of this.model.animations) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
      console.log(`[CharacterModel] Animation registered: ${clip.name}`);
    }

    this.playAnimation('idle', { loop: true });
  }

  private setupCombatRig(): void {
    if (!this.model) return;

    this.modelBasePitch = this.model.scene.rotation.x;

    this.spineBone = this.findBone('mixamorigSpine2');
    this.rightArmBone = this.findBone('mixamorigRightArm');
    this.leftArmBone = this.findBone('mixamorigLeftArm');
    this.rightForeArmBone = this.findBone('mixamorigRightForeArm');
    this.rightHandBone = this.findBone('mixamorigRightHand');

    this.attachSwordToRightHand();
  }

  private findBone(name: string): THREE.Bone | null {
    if (!this.model) return null;
    const node = this.model.scene.getObjectByName(name);
    return node instanceof THREE.Bone ? node : null;
  }

  private attachSwordToRightHand(): void {
    if (!this.rightHandBone || this.sword) return;

    const sword = this.createSwordMesh();
    sword.name = 'PlayerSword';
    sword.position.set(0.025, 0.03, -0.02);
    sword.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
    this.rightHandBone.add(sword);
    this.sword = sword;
  }

  private createSwordMesh(): THREE.Group {
    const sword = new THREE.Group();

    const steel = new THREE.MeshStandardMaterial({
      color: 0xcfd6df,
      metalness: 0.95,
      roughness: 0.18,
    });
    const guardMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7c62,
      metalness: 0.7,
      roughness: 0.35,
    });
    const gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a2e22,
      roughness: 0.85,
      metalness: 0.08,
    });

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.92, 0.02), steel);
    blade.position.y = 0.56;

    const bladeTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.09, 6),
      steel
    );
    bladeTip.position.y = 1.065;

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.035, 0.04),
      guardMaterial
    );
    guard.position.y = 0.1;

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, 0.22, 12),
      gripMaterial
    );
    grip.position.y = -0.03;

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), guardMaterial);
    pommel.position.y = -0.16;

    sword.add(blade, bladeTip, guard, grip, pommel);
    sword.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return sword;
  }

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

    const mappedName = this.resolveMappedAnimationName(name);
    let action = this.findAction(mappedName);

    const startedProcedural = !action && this.tryStartProceduralMotion(name);

    if (!action) {
      const fallback = this.getFallbackAnimation(mappedName);
      if (fallback) {
        action = this.findAction(fallback);
      }
    }

    if (!action) {
      if (!startedProcedural) {
        console.warn(`[CharacterModel] Animation not found: ${mappedName}`);
      }
      return;
    }

    if (!this.isProceduralRequest(name)) {
      this.stopProceduralMotion();
    }

    const fadeTime = options?.fadeIn ?? 0.15;

    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.fadeOut(options?.fadeOut ?? fadeTime);
    }

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

  private resolveMappedAnimationName(requestedName: string): string {
    const key = this.toAnimationKey(requestedName);
    if (!key) return requestedName;
    return this.animationMapping[key] ?? requestedName;
  }

  private toAnimationKey(name: string): AnimationKey | null {
    const lower = name.toLowerCase();

    if (lower === 'idle') return 'idle';
    if (lower === 'walk' || lower === 'walk_back') return 'walk';
    if (lower === 'run') return 'run';
    if (lower === 'sprint') return 'sprint';
    if (lower === 'roll') return 'roll';
    if (lower === 'backstep') return 'backstep';
    if (lower.startsWith('attack_light')) return 'attack_light';
    if (lower === 'attack_heavy') return 'attack_heavy';
    if (lower === 'guard_idle' || lower === 'guard') return 'guard';
    if (lower === 'hit_react' || lower === 'hit') return 'hit_stun';
    if (lower === 'death') return 'death';
    if (lower === 'fall') return 'falling';
    if (lower === 'land') return 'landing';
    if (lower === 'use_item') return 'use_item';

    return null;
  }

  private findAction(name: string): THREE.AnimationAction | null {
    const exact = this.actions.get(name);
    if (exact) return exact;

    const lower = name.toLowerCase();
    for (const [clipName, action] of this.actions) {
      const clipLower = clipName.toLowerCase();
      if (
        clipLower === lower ||
        clipLower.includes(lower) ||
        lower.includes(clipLower)
      ) {
        return action;
      }
    }

    return null;
  }

  private getFallbackAnimation(name: string): string | null {
    const fallbackMap: Record<string, string> = {
      Walk_Back: 'Walk',
      Sprint: 'Run',
      Fall: 'Idle',
      Land: 'Idle',
    };
    return fallbackMap[name] ?? null;
  }

  private isProceduralRequest(name: string): boolean {
    return this.toProceduralMotion(name) !== 'none';
  }

  private tryStartProceduralMotion(name: string): boolean {
    const type = this.toProceduralMotion(name);
    if (type === 'none') return false;

    this.proceduralMotion = {
      type,
      time: 0,
      duration: PROCEDURAL_DURATIONS[type],
      loop: type === 'guard',
    };

    return true;
  }

  private toProceduralMotion(name: string): ProceduralMotionType {
    const lower = name.toLowerCase();
    if (lower === 'attack_light_2') return 'attackLight2';
    if (lower === 'attack_light_3') return 'attackLight3';
    if (lower.startsWith('attack_light')) return 'attackLight1';
    if (lower === 'attack_heavy') return 'attackHeavy';
    if (lower === 'roll') return 'roll';
    if (lower === 'backstep') return 'backstep';
    if (lower === 'guard_idle' || lower === 'guard') return 'guard';
    if (lower === 'hit_react' || lower === 'hit') return 'hitStun';
    return 'none';
  }

  private stopProceduralMotion(): void {
    this.proceduralMotion = {
      type: 'none',
      time: 0,
      duration: 0,
      loop: false,
    };
    this.setModelPitch(0);
  }

  update(dt: number): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }

    this.updateProceduralMotion(dt);
  }

  private updateProceduralMotion(dt: number): void {
    if (this.proceduralMotion.type === 'none') {
      this.setModelPitch(0);
      return;
    }

    this.proceduralMotion.time += dt;

    const progress = this.proceduralMotion.loop
      ? (this.proceduralMotion.time % this.proceduralMotion.duration) /
        this.proceduralMotion.duration
      : THREE.MathUtils.clamp(
          this.proceduralMotion.time / this.proceduralMotion.duration,
          0,
          1
        );

    const blendInOut = this.proceduralMotion.loop
      ? 1
      : Math.min(1, progress / 0.2, (1 - progress) / 0.2);

    this.applyProceduralPose(this.proceduralMotion.type, progress, blendInOut);

    if (
      !this.proceduralMotion.loop &&
      this.proceduralMotion.time >= this.proceduralMotion.duration
    ) {
      this.stopProceduralMotion();
    }
  }

  private applyProceduralPose(
    type: Exclude<ProceduralMotionType, 'none'>,
    progress: number,
    weight: number
  ): void {
    this.setModelPitch(0);

    switch (type) {
      case 'attackLight1': {
        const swing = this.computeSwing(progress, 0.3, 0.78);
        const torso = Math.sin(progress * Math.PI);
        this.setModelPitch(-0.06 * torso * weight);
        this.applyBoneRotation(this.spineBone, -0.05 * torso, 0.42 * swing, 0.12 * swing, weight);
        this.applyBoneRotation(
          this.rightArmBone,
          -0.45 + 1.05 * swing,
          -0.28 * swing,
          -0.3 * swing,
          weight
        );
        this.applyBoneRotation(
          this.rightForeArmBone,
          -0.9 + 1.35 * swing,
          0.08 * swing,
          0.18 * swing,
          weight
        );
        this.applyBoneRotation(
          this.rightHandBone,
          -0.3 + 0.62 * swing,
          0.06 * swing,
          0.14 * swing,
          weight
        );
        this.applyBoneRotation(this.leftArmBone, 0.2, 0.05, 0.24, weight * 0.72);
        break;
      }

      case 'attackLight2': {
        const swing = this.computeSwing(progress, 0.28, 0.74);
        const body = Math.sin(progress * Math.PI);
        this.setModelPitch(-0.05 * body * weight);
        this.applyBoneRotation(this.spineBone, 0.02 * body, -0.38 * swing, -0.1 * swing, weight);
        this.applyBoneRotation(
          this.rightArmBone,
          -0.4 + 0.95 * swing,
          0.22 * swing,
          0.28 * swing,
          weight
        );
        this.applyBoneRotation(
          this.rightForeArmBone,
          -0.82 + 1.28 * swing,
          -0.1 * swing,
          -0.16 * swing,
          weight
        );
        this.applyBoneRotation(
          this.rightHandBone,
          -0.28 + 0.58 * swing,
          -0.08 * swing,
          -0.12 * swing,
          weight
        );
        this.applyBoneRotation(this.leftArmBone, 0.18, -0.08, -0.2, weight * 0.68);
        break;
      }

      case 'attackLight3': {
        const swing = this.computeSwing(progress, 0.4, 0.86);
        const windup = Math.sin(progress * Math.PI);
        this.setModelPitch(-0.12 * windup * weight);
        this.applyBoneRotation(this.spineBone, -0.2 * windup, 0.24 * swing, 0.05 * swing, weight);
        this.applyBoneRotation(
          this.rightArmBone,
          -0.95 + 1.48 * swing,
          -0.18 * swing,
          -0.26 * swing,
          weight
        );
        this.applyBoneRotation(
          this.rightForeArmBone,
          -1.22 + 1.78 * swing,
          0.04 * swing,
          0.16 * swing,
          weight
        );
        this.applyBoneRotation(
          this.rightHandBone,
          -0.42 + 0.72 * swing,
          0.08 * swing,
          0.16 * swing,
          weight
        );
        this.applyBoneRotation(this.leftArmBone, 0.32, 0.1, 0.3, weight * 0.74);
        break;
      }

      case 'attackHeavy': {
        const swing = this.computeSwing(progress, 0.45, 0.88);
        const windup = Math.sin(progress * Math.PI);
        this.setModelPitch(-0.16 * windup * weight);
        this.applyBoneRotation(this.spineBone, -0.26 * windup, 0.58 * swing, 0.04 * swing, weight);
        this.applyBoneRotation(
          this.rightArmBone,
          -0.85 + 1.45 * swing,
          -0.34 * swing,
          -0.38 * swing,
          weight
        );
        this.applyBoneRotation(
          this.rightForeArmBone,
          -1.25 + 1.95 * swing,
          0.08 * swing,
          0.28 * swing,
          weight
        );
        this.applyBoneRotation(
          this.rightHandBone,
          -0.45 + 0.72 * swing,
          0.1 * swing,
          0.16 * swing,
          weight
        );
        this.applyBoneRotation(this.leftArmBone, 0.34, 0.12, 0.34, weight * 0.78);
        break;
      }

      case 'roll': {
        const crouch = THREE.MathUtils.smoothstep(progress, 0, 0.16);
        const tumble = Math.sin(Math.min(1, progress / 0.64) * Math.PI);
        const recover = THREE.MathUtils.smoothstep(progress, 0.58, 1);
        const pitch = (-0.24 * crouch - 1.18 * tumble + 1.02 * recover) * weight;
        this.setModelPitch(pitch);
        this.applyBoneRotation(this.spineBone, -0.82 * tumble, 0, 0, weight);
        this.applyBoneRotation(this.rightArmBone, -1.22 * tumble, 0.12, -0.12, weight);
        this.applyBoneRotation(this.leftArmBone, -1.16 * tumble, -0.12, 0.12, weight);
        this.applyBoneRotation(this.rightForeArmBone, -0.88 * tumble, 0, 0, weight);
        break;
      }

      case 'backstep': {
        const recoil = Math.sin(progress * Math.PI);
        const settle = THREE.MathUtils.smoothstep(progress, 0.55, 1);
        this.setModelPitch((-0.36 * recoil + 0.18 * settle) * weight);
        this.applyBoneRotation(this.spineBone, -0.3 * recoil, 0, 0, weight);
        this.applyBoneRotation(this.rightArmBone, -0.42 * recoil, 0.06, 0, weight);
        this.applyBoneRotation(this.leftArmBone, -0.3 * recoil, -0.06, 0, weight);
        break;
      }

      case 'guard': {
        const guardPulse = 0.8 + 0.2 * Math.sin(progress * Math.PI * 2);
        this.applyBoneRotation(this.spineBone, 0.04, 0.1, 0, weight * guardPulse);
        this.applyBoneRotation(this.rightArmBone, -0.75, -0.18, -0.2, weight);
        this.applyBoneRotation(this.rightForeArmBone, -0.55, 0.1, 0, weight);
        this.applyBoneRotation(this.leftArmBone, 0.25, 0.1, 0.2, weight * 0.6);
        break;
      }

      case 'hitStun': {
        const recoil = Math.sin(progress * Math.PI);
        this.setModelPitch(-0.2 * recoil * weight);
        this.applyBoneRotation(this.spineBone, -0.4 * recoil, -0.1 * recoil, 0, weight);
        this.applyBoneRotation(this.rightArmBone, 0.2 * recoil, 0, 0.1 * recoil, weight);
        this.applyBoneRotation(this.leftArmBone, 0.2 * recoil, 0, -0.1 * recoil, weight);
        break;
      }
    }
  }

  private computeSwing(progress: number, windupEnd: number, recoverStart: number): number {
    if (progress < windupEnd) {
      return THREE.MathUtils.lerp(0, -1, progress / windupEnd);
    }

    if (progress < recoverStart) {
      return THREE.MathUtils.lerp(-1, 1, (progress - windupEnd) / (recoverStart - windupEnd));
    }

    return THREE.MathUtils.lerp(1, 0, (progress - recoverStart) / (1 - recoverStart));
  }

  private applyBoneRotation(
    bone: THREE.Bone | null,
    x: number,
    y: number,
    z: number,
    weight: number
  ): void {
    if (!bone || weight <= 0) return;
    this.tempEuler.set(x * weight, y * weight, z * weight, 'XYZ');
    this.tempQuat.setFromEuler(this.tempEuler);
    bone.quaternion.multiply(this.tempQuat);
  }

  private setModelPitch(pitchOffset: number): void {
    if (!this.model) return;
    this.model.scene.rotation.x = this.modelBasePitch + pitchOffset;
  }

  getObject(): THREE.Group {
    return this.root;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getAvailableAnimations(): string[] {
    return Array.from(this.actions.keys());
  }

  setPosition(position: THREE.Vector3): void {
    this.root.position.copy(position);
  }

  setRotation(quaternion: THREE.Quaternion): void {
    this.root.quaternion.copy(quaternion);
  }

  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
    }

    if (this.sword) {
      this.sword.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            for (const mat of obj.material) {
              mat.dispose();
            }
          } else {
            obj.material.dispose();
          }
        }
      });
      this.sword.removeFromParent();
      this.sword = null;
    }

    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }

    this.actions.clear();
    this.model = null;
    this.mixer = null;
    this.loaded = false;
    this.proceduralMotion = {
      type: 'none',
      time: 0,
      duration: 0,
      loop: false,
    };
  }
}

export const KNIGHT_MODEL_PRESETS = {
  solus: {
    modelPath: '/assets/models/solus_knight.glb',
    scale: 1.0,
    heightOffset: -0.9,
    animationMapping: {
      idle: 'Idle',
      walk: 'Walk',
      run: 'Run',
      sprint: 'Run',
      roll: 'Roll',
      backstep: 'Backstep',
      attack_light: 'Attack_Light_1',
      attack_heavy: 'Attack_Heavy',
      attack_combo_1: 'Attack_Light_1',
      attack_combo_2: 'Attack_Light_2',
      attack_combo_3: 'Attack_Light_3',
      guard: 'Guard_Idle',
      hit_stun: 'Hit_React',
      death: 'Death',
      falling: 'Fall',
      landing: 'Land',
      use_item: 'Use_Item',
    },
  },

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
      attack_heavy: 'Sword_Slash_Heavy',
      guard: 'Blocking',
      hit_stun: 'Getting_Hit',
      death: 'Dying',
    },
  },

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
