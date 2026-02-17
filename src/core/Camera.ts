import * as THREE from 'three';
import { getScene, getRenderer } from './Scene';

let camera: THREE.PerspectiveCamera;
let targetRotationX = 0;
let targetRotationY = 0;
let currentRotationX = 0;
let currentRotationY = 0;
let basePosition: THREE.Vector3;
let time = 0;

export function getCamera(): THREE.PerspectiveCamera {
  return camera;
}

export function initCamera(): void {
  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  // 3/4 view looking at bonfire
  basePosition = new THREE.Vector3(3, 2, 4);
  camera.position.copy(basePosition);
  camera.lookAt(0, 0.5, 0);

  // Mouse parallax
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', onResize);
}

function onMouseMove(event: MouseEvent): void {
  // Normalize mouse position (-1 to 1)
  const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  const mouseY = (event.clientY / window.innerHeight) * 2 - 1;

  // Target rotation (subtle parallax)
  targetRotationX = mouseY * 0.02; // ~1.2 degrees max
  targetRotationY = mouseX * 0.03; // ~1.7 degrees max
}

export function updateCamera(): void {
  time += 0.016;

  // Smooth interpolation for parallax
  currentRotationX += (targetRotationX - currentRotationX) * 0.05;
  currentRotationY += (targetRotationY - currentRotationY) * 0.05;

  // Idle sway (breathing effect)
  const swayX = Math.sin(time * 0.5) * 0.003;
  const swayY = Math.sin(time * 0.3) * 0.002;
  const swayZ = Math.sin(time * 0.4) * 0.005;

  // Apply position offset
  camera.position.set(
    basePosition.x + swayX + currentRotationY * 0.5,
    basePosition.y + swayZ,
    basePosition.z + swayY - currentRotationX * 0.5
  );

  // Always look at bonfire center
  camera.lookAt(0, 0.5, 0);
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
