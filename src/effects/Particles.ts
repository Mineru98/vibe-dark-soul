import * as THREE from 'three';
import { getScene } from '../core/Scene';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

let particles: Particle[] = [];
let particleGeometry: THREE.BufferGeometry;
let particleMaterial: THREE.PointsMaterial;
let particleSystem: THREE.Points;

const PARTICLE_COUNT = 400;
let intensityMultiplier = 1.0;

export function initParticles(): void {
  const scene = getScene();

  // Initialize particles
  particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(createParticle());
  }

  // Create geometry
  particleGeometry = new THREE.BufferGeometry();
  updateGeometry();

  // Create material
  particleMaterial = new THREE.PointsMaterial({
    color: 0xff6600,
    size: 0.05,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleSystem);
}

function createParticle(): Particle {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 0.2;

  return {
    position: new THREE.Vector3(
      Math.cos(angle) * radius,
      0.2 + Math.random() * 0.3,
      Math.sin(angle) * radius
    ),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      0.8 + Math.random() * 1.2,
      (Math.random() - 0.5) * 0.3
    ),
    life: Math.random() * 2,
    maxLife: 1.5 + Math.random() * 1.5,
    size: 0.02 + Math.random() * 0.04,
  };
}

export function updateParticles(delta: number): void {
  const effectiveDelta = delta * intensityMultiplier;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Update position
    p.position.x += p.velocity.x * effectiveDelta;
    p.position.y += p.velocity.y * effectiveDelta;
    p.position.z += p.velocity.z * effectiveDelta;

    // Add some turbulence
    p.velocity.x += (Math.random() - 0.5) * 0.5 * effectiveDelta;
    p.velocity.z += (Math.random() - 0.5) * 0.5 * effectiveDelta;

    // Update life
    p.life += delta;

    // Reset if dead
    if (p.life >= p.maxLife) {
      particles[i] = createParticle();
    }
  }

  updateGeometry();

  // Update material based on intensity
  if (particleMaterial) {
    particleMaterial.opacity = 0.6 + intensityMultiplier * 0.3;
    particleMaterial.size = 0.04 + intensityMultiplier * 0.02;
  }
}

function updateGeometry(): void {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const lifeRatio = p.life / p.maxLife;

    positions[i * 3] = p.position.x;
    positions[i * 3 + 1] = p.position.y;
    positions[i * 3 + 2] = p.position.z;

    // Color gradient: orange -> red -> dark
    const t = lifeRatio;
    colors[i * 3] = 1.0 - t * 0.3; // R
    colors[i * 3 + 1] = 0.4 * (1 - t); // G
    colors[i * 3 + 2] = 0.1 * (1 - t * 2); // B

    // Size decreases with life
    sizes[i] = p.size * (1 - lifeRatio * 0.5);
  }

  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  particleGeometry.attributes.position.needsUpdate = true;
}

export function setParticleIntensity(intensity: number): void {
  intensityMultiplier = Math.max(0.5, Math.min(2.0, intensity));
}
