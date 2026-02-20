import { initScene, updateScene } from './core/Scene';
import { initCamera, updateCamera } from './core/Camera';
import { initParticles, updateParticles, setParticleIntensity } from './effects/Particles';
import { initPostProcessing, renderWithPostProcessing } from './effects/PostProcessing';
import { initPhysics, updatePhysics, createAshDebris } from './physics/Physics';
import { initUI } from './ui/Menu';
import { initAudio, playFireSound } from './core/Audio';
import { GameApp, GameState } from './core/GameApp';

let isLoaded = false;
let titleAnimationId: number | null = null;

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

  // Initialize GameApp (gameplay systems)
  await GameApp.init({ debugPhysics: false });
  GameApp.setTitleState();

  // Setup menu action handlers
  setupMenuHandlers();

  // Hide loading, show UI
  hideLoading();

  // Start title render loop
  animateTitle();
}

function setupMenuHandlers() {
  const menuItems = document.querySelectorAll('.menu-item');

  menuItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;

      switch (action) {
        case 'new':
          startNewGame();
          break;
        case 'continue':
          continueGame();
          break;
        case 'settings':
          // TODO: Settings menu
          break;
        case 'quit':
          // In browser, just refresh or show message
          break;
      }
    });
  });
}

async function startNewGame() {
  if (GameApp.getState() === GameState.Gameplay) return;

  console.log('[Main] Starting new game...');

  // Stop title animation
  if (titleAnimationId !== null) {
    cancelAnimationFrame(titleAnimationId);
    titleAnimationId = null;
  }

  // Clear saved progress (new game)
  localStorage.removeItem('darksouls_flags');

  // Transition to gameplay
  await GameApp.startGameplay();
}

async function continueGame() {
  if (GameApp.getState() === GameState.Gameplay) return;

  console.log('[Main] Continuing game...');

  // Stop title animation
  if (titleAnimationId !== null) {
    cancelAnimationFrame(titleAnimationId);
    titleAnimationId = null;
  }

  // Start gameplay (flags will be loaded from storage)
  await GameApp.startGameplay();
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

function animateTitle() {
  titleAnimationId = requestAnimationFrame(animateTitle);

  const delta = 0.016; // ~60fps

  // Update systems (title screen bonfire)
  updateCamera();
  updatePhysics(delta);
  updateParticles(delta);
  updateScene();

  // Render with post-processing
  renderWithPostProcessing();
}

// Start
init().catch(console.error);

// Expose for debugging
(window as unknown as { GameApp: typeof GameApp }).GameApp = GameApp;
