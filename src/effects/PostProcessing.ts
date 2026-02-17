import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { getScene, getRenderer } from '../core/Scene';
import { getCamera } from '../core/Camera';

let composer: EffectComposer;
let bloomPass: UnrealBloomPass;

export function initPostProcessing(): void {
  const scene = getScene();
  const renderer = getRenderer();
  const camera = getCamera();

  // Effect Composer
  composer = new EffectComposer(renderer);

  // Render Pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom Pass
  const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
  bloomPass = new UnrealBloomPass(resolution, 0.8, 0.4, 0.85);
  bloomPass.threshold = 0.3;
  bloomPass.strength = 0.9;
  bloomPass.radius = 0.5;
  composer.addPass(bloomPass);

  // Output Pass (for correct color space)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // Handle resize
  window.addEventListener('resize', onResize);
}

export function renderWithPostProcessing(): void {
  composer.render();
}

export function setBloomIntensity(intensity: number): void {
  if (bloomPass) {
    bloomPass.strength = 0.6 + intensity * 0.6;
  }
}

function onResize(): void {
  const renderer = getRenderer();
  const width = window.innerWidth;
  const height = window.innerHeight;

  composer.setSize(width, height);
  bloomPass.resolution.set(width, height);
}
