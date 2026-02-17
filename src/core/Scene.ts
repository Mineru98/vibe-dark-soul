import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

let scene: THREE.Scene;
let renderer: THREE.WebGLRenderer;
let pointLight: THREE.PointLight;
let fireLight: THREE.PointLight;
let clock: THREE.Clock;

export function getScene(): THREE.Scene {
  return scene;
}

export function getRenderer(): THREE.WebGLRenderer {
  return renderer;
}

export function getFireLight(): THREE.PointLight {
  return fireLight;
}

export async function initScene(container: HTMLElement): Promise<void> {
  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.045);

  // Renderer
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  // Load HDRI
  await loadHDRI();

  // Create ground
  createGround();

  // Create bonfire
  createBonfire();

  // Lights
  setupLights();

  // Handle resize
  window.addEventListener('resize', onResize);
}

async function loadHDRI(): Promise<void> {
  const rgbeLoader = new RGBELoader();

  return new Promise((resolve, reject) => {
    rgbeLoader.load(
      '/assets/hdri/kloppenheim_02_1k.hdr',
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.background = new THREE.Color(0x050508);
        resolve();
      },
      undefined,
      reject
    );
  });
}

function createGround(): void {
  const textureLoader = new THREE.TextureLoader();

  // Load textures
  const diffuse = textureLoader.load('/assets/textures/burned_ground/burned_ground_01_diff_1k.jpg');
  const normal = textureLoader.load('/assets/textures/burned_ground/burned_ground_01_nor_gl_1k.jpg');
  const roughness = textureLoader.load('/assets/textures/burned_ground/burned_ground_01_rough_1k.jpg');

  // Repeat textures
  [diffuse, normal, roughness].forEach(tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
  });

  const groundMaterial = new THREE.MeshStandardMaterial({
    map: diffuse,
    normalMap: normal,
    roughnessMap: roughness,
    roughness: 0.9,
    metalness: 0.1,
  });

  const groundGeometry = new THREE.PlaneGeometry(20, 20);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;

  scene.add(ground);

  // Add fog plane (ground fog effect)
  const fogPlaneGeometry = new THREE.PlaneGeometry(15, 15);
  const fogPlaneMaterial = new THREE.MeshBasicMaterial({
    color: 0x1a1a2e,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
  });
  const fogPlane = new THREE.Mesh(fogPlaneGeometry, fogPlaneMaterial);
  fogPlane.rotation.x = -Math.PI / 2;
  fogPlane.position.y = 0.05;
  scene.add(fogPlane);
}

function createBonfire(): void {
  // Simple bonfire base (logs)
  const logGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8);
  const logMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a1810,
    roughness: 0.95,
    metalness: 0,
  });

  // Create crossed logs
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(logGeometry, logMaterial);
    const angle = (i / 5) * Math.PI * 2;
    log.position.set(
      Math.cos(angle) * 0.2,
      0.1,
      Math.sin(angle) * 0.2
    );
    log.rotation.z = Math.PI / 4 + (Math.random() - 0.5) * 0.3;
    log.rotation.y = angle;
    scene.add(log);
  }

  // Ember core (glowing center)
  const emberGeometry = new THREE.SphereGeometry(0.15, 16, 16);
  const emberMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    transparent: true,
    opacity: 0.8,
  });
  const ember = new THREE.Mesh(emberGeometry, emberMaterial);
  ember.position.y = 0.2;
  ember.name = 'emberCore';
  scene.add(ember);
}

function setupLights(): void {
  // Ambient light (very dim)
  const ambient = new THREE.AmbientLight(0x101020, 0.3);
  scene.add(ambient);

  // Main fire light
  fireLight = new THREE.PointLight(0xff6622, 3, 10);
  fireLight.position.set(0, 0.5, 0);
  scene.add(fireLight);

  // Secondary warm light
  pointLight = new THREE.PointLight(0xff4400, 1.5, 8);
  pointLight.position.set(0, 0.3, 0);
  scene.add(pointLight);
}

export function updateScene(): void {
  const time = clock.getElapsedTime();

  // Flickering fire light
  if (fireLight) {
    fireLight.intensity = 3 + Math.sin(time * 10) * 0.5 + Math.sin(time * 15) * 0.3;
  }
  if (pointLight) {
    pointLight.intensity = 1.5 + Math.sin(time * 12 + 1) * 0.3;
  }

  // Ember core pulsing
  const ember = scene.getObjectByName('emberCore') as THREE.Mesh;
  if (ember) {
    const scale = 1 + Math.sin(time * 8) * 0.1;
    ember.scale.set(scale, scale, scale);
  }
}

function onResize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
}
