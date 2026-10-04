// A simplified cabin so the car isn't hollow when seen through the windows.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COPPER } from './palette.js';

export function buildInterior() {
  const group = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.85 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.55 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.7 });
  const stitch = new THREE.MeshStandardMaterial({ color: COPPER, metalness: 0.8, roughness: 0.4 });
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x05080c, emissive: 0x0e2438, emissiveIntensity: 0.55, roughness: 0.2 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 1 });

  const box = (w, h, d, r, mat, x, y, z, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
    m.position.set(x, y, z); m.rotation.set(...rot);
    group.add(m);
    return m;
  };

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(-0.8, 0.32, 0);
  group.add(floor);

  // dashboard + instrument hood + screen
  box(0.46, 0.22, 1.58, 0.05, dashMat, 0.56, 0.86, 0);
  box(0.30, 0.10, 0.46, 0.04, dashMat, 0.46, 1.0, -0.37);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.16), screenMat);
  screen.rotation.y = -Math.PI / 2; screen.position.set(0.322, 0.93, 0.02);
  group.add(screen);
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.09), screenMat);
  cluster.rotation.y = -Math.PI / 2; cluster.position.set(0.31, 0.985, -0.37);
  group.add(cluster);
  box(0.02, 0.012, 1.5, 0.004, stitch, 0.32, 0.8, 0);

  // steering wheel (left-hand drive)
  const swPitch = new THREE.Group();
  swPitch.position.set(0.25, 0.86, -0.37);
  swPitch.rotation.z = -0.38;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.017, 16, 48), leather);
  rim.rotation.y = -Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 24), leather);
  hub.rotation.z = Math.PI / 2;
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.34), leather);
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.03), stitch);
  mark.position.set(-0.0, 0.17, 0);
  swPitch.add(rim, hub, spoke, mark);
  group.add(swPitch);

  // seats
  const seat = (x, z, w = 0.5, headrest = true) => {
    box(0.52, 0.14, w, 0.05, fabric, x, 0.48, z);
    const back = box(0.13, 0.64, w, 0.05, fabric, x - 0.28, 0.82, z, [0, 0, 0.2]);
    for (const dz of [-0.12, 0.12]) box(0.006, 0.46, 0.008, 0.002, stitch, x - 0.212, 0.82, z + dz, [0, 0, 0.2]);
    if (headrest) box(0.09, 0.2, 0.26, 0.04, fabric, x - 0.355, 1.2, z, [0, 0, 0.2]);
    void back;
  };
  seat(-0.20, -0.37);
  seat(-0.20, 0.37);
  // rear bench
  box(0.52, 0.14, 1.34, 0.05, fabric, -1.05, 0.48, 0);
  box(0.13, 0.62, 1.34, 0.05, fabric, -1.33, 0.82, 0, [0, 0, 0.2]);
  for (const z of [-0.42, 0, 0.42]) box(0.09, 0.18, 0.24, 0.04, fabric, -1.39, 1.15, z, [0, 0, 0.2]);

  // centre console + gear selector
  box(1.0, 0.22, 0.2, 0.04, dashMat, -0.12, 0.5, 0);
  box(0.12, 0.05, 0.06, 0.02, leather, 0.12, 0.65, 0);

  return { group };
}
