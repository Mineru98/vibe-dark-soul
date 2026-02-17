import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { getScene } from '../core/Scene';

let world: RAPIER.World;
let ashBodies: { rigid: RAPIER.RigidBody; mesh: THREE.Mesh }[] = [];

export async function initPhysics(): Promise<void> {
  // Initialize Rapier WASM
  await RAPIER.init();

  // Create world with gravity
  const gravity = { x: 0, y: -9.81, z: 0 };
  world = new RAPIER.World(gravity);

  // Create ground collider
  const groundDesc = RAPIER.ColliderDesc.cuboid(10, 0.1, 10);
  groundDesc.setTranslation(0, -0.1, 0);
  world.createCollider(groundDesc);
}

export function createAshDebris(count: number): void {
  const scene = getScene();

  // Material for ash/debris
  const ashMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.9,
    metalness: 0.1,
  });

  for (let i = 0; i < count; i++) {
    // Random position around bonfire
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.5 + Math.random() * 1.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 0.5 + Math.random() * 0.5; // Start slightly above ground

    // Random size
    const size = 0.03 + Math.random() * 0.05;

    // Create mesh
    const geometry = new THREE.BoxGeometry(size, size * 0.3, size);
    const mesh = new THREE.Mesh(geometry, ashMaterial);
    mesh.position.set(x, y, z);
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    scene.add(mesh);

    // Create rigid body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.5)
      .setAngularDamping(0.5);

    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Create collider
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      size / 2,
      (size * 0.3) / 2,
      size / 2
    );
    colliderDesc.setRestitution(0.2);
    colliderDesc.setFriction(0.8);
    colliderDesc.setMass(0.01);
    world.createCollider(colliderDesc, rigidBody);

    // Add initial random velocity
    rigidBody.setLinvel(
      { x: (Math.random() - 0.5) * 0.5, y: 0, z: (Math.random() - 0.5) * 0.5 },
      true
    );

    ashBodies.push({ rigid: rigidBody, mesh });
  }
}

export function updatePhysics(delta: number): void {
  if (!world) return;

  // Step physics
  world.step();

  // Update mesh positions from physics
  for (const { rigid, mesh } of ashBodies) {
    const pos = rigid.translation();
    const rot = rigid.rotation();

    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    // Reset if fallen too far
    if (pos.y < -1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.5 + Math.random() * 1.0;
      rigid.setTranslation(
        { x: Math.cos(angle) * radius, y: 1, z: Math.sin(angle) * radius },
        true
      );
      rigid.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigid.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
}

export function applyForceToDebris(force: THREE.Vector3): void {
  for (const { rigid } of ashBodies) {
    rigid.applyImpulse(
      { x: force.x * 0.01, y: force.y * 0.01, z: force.z * 0.01 },
      true
    );
  }
}
