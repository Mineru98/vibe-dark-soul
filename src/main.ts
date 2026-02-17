import * as THREE from 'three';
import { initScene, updateScene, getScene, getRenderer } from './core/Scene';
import { initCamera, updateCamera, getCamera } from './core/Camera';
import { initParticles, updateParticles, setParticleIntensity } from './effects/Particles';
import { initPostProcessing, renderWithPostProcessing } from './effects/PostProcessing';
import { initPhysics, updatePhysics, createAshDebris } from './physics/Physics';
import { initUI } from './ui/Menu';
import { initAudio, playFireSound } from './core/Audio';

let isLoaded = false;

async function init() {
  const container = document.getElementById('canvas-container')!;

  // Core setup
  await initScene(container);
  initCamera();

  // Physics (async - WASM)
  await initPhysics();
  createAshDebris(15); // 15개의 재 조각

  // Effects
  initParticles();
  initPostProcessing();

  // UI & Audio
  initUI(setParticleIntensity);
  initAudio();

  // Hide loading, show UI
  hideLoading();

  // Start render loop
  animate();
}

function hideLoading() {
  const loading = document.getElementById('loading');
  const title = document.getElementById('title');
  const menu = document.getElementById('main-menu');
  const pressKey = document.getElementById('press-key');

  if (loading) loading.classList.add('hidden');

  // Fade in UI elements
  setTimeout(() => {
    if (title) title.style.display = 'block';
    if (menu) menu.style.display = 'block';
    if (pressKey) pressKey.style.display = 'block';
    isLoaded = true;
    playFireSound();
  }, 500);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = 0.016; // ~60fps

  // Update systems
  updateCamera();
  updatePhysics(delta);
  updateParticles(delta);
  updateScene();

  // Render with post-processing
  renderWithPostProcessing();
}

// Start
init().catch(console.error);
