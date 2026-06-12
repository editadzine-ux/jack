import * as THREE from 'three';

// Giant toddlers who think you look delicious. They are slower than you,
// but there are three of them and they do not get tired.
const KID_SPEEDS = [4.6, 5.0, 5.4];
const SPAWNS = [
  [-12.5, -7.5],
  [12.5, -7.5],
  [-12.5, 7.5],
];
const SHIRTS = [0xff4d6d, 0x4dd2ff, 0xffd23f];

export class Kids {
  constructor(scene, kitchen) {
    this.scene = scene;
    this.kitchen = kitchen;
    this.active = false;
    this.kids = [];

    for (let i = 0; i < 3; i++) {
      const kid = this._buildKid(SHIRTS[i]);
      kid.group.visible = false;
      kid.speed = KID_SPEEDS[i];
      kid.recoil = 0;
      kid.radius = 0.8;
      this.kids.push(kid);
      scene.add(kid.group);
    }
  }

  _buildKid(shirtColor) {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xffd7b0, roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.65 });

    const legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.22, 0.85, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.85, 10), skin);
      leg.position.y = -0.42;
      leg.castShadow = true;
      hip.add(leg);
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
      shoe.scale.set(1, 0.55, 1.5);
      shoe.position.set(0, -0.85, 0.08);
      hip.add(shoe);
      group.add(hip);
      legs.push(hip);
    }

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 1.0, 14), shirt);
    body.position.y = 1.35;
    body.castShadow = true;
    group.add(body);

    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.75, 8), skin);
      arm.position.set(s * 0.55, 1.45, 0.25);
      arm.rotation.x = -1.1; // arms out, grabby
      arm.castShadow = true;
      group.add(arm);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), skin);
    head.position.y = 2.25;
    head.castShadow = true;
    group.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.43, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.9 }));
    hair.scale.set(1, 0.55, 1);
    hair.position.y = 2.5;
    group.add(hair);

    // party hat — these kids are celebrating you
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff * Math.random() | 0x404040, roughness: 0.5 }));
    hat.position.y = 2.85;
    group.add(hat);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x241508, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
      eye.position.set(s * 0.15, 2.3, 0.38);
      group.add(eye);
    }

    return { group, legs, velocity: new THREE.Vector3() };
  }

  setActive(a) {
    this.active = a;
    this.kids.forEach((kid, i) => {
      kid.group.visible = a;
      kid.recoil = 0;
      kid.velocity.set(0, 0, 0);
      if (a) kid.group.position.set(SPAWNS[i][0], 0, SPAWNS[i][1]);
    });
  }

  update(dt, t, playerPos) {
    if (!this.active) return;
    const b = this.kitchen.bounds;

    for (const kid of this.kids) {
      if (kid.recoil > 0) { kid.recoil -= dt; continue; }

      const seek = new THREE.Vector3().subVectors(playerPos, kid.group.position);
      seek.y = 0;
      if (seek.lengthSq() < 0.01) continue;
      seek.normalize();

      // avoid the big furniture
      for (const o of this.kitchen.obstacles) {
        if (o.h < 1) continue;
        const dx = kid.group.position.x - o.x;
        const dz = kid.group.position.z - o.z;
        const d = Math.hypot(dx, dz);
        const avoidR = o.r + 1.6;
        if (d < avoidR && d > 1e-3) {
          const w = (avoidR - d) / avoidR * 2;
          seek.x += (dx / d) * w;
          seek.z += (dz / d) * w;
        }
      }
      // don't bunch up with the other kids
      for (const other of this.kids) {
        if (other === kid) continue;
        const dx = kid.group.position.x - other.group.position.x;
        const dz = kid.group.position.z - other.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.4 && d > 1e-3) {
          seek.x += (dx / d) * 0.9;
          seek.z += (dz / d) * 0.9;
        }
      }
      seek.normalize();

      kid.velocity.lerp(seek.multiplyScalar(kid.speed), Math.min(1, dt * 4));
      kid.group.position.addScaledVector(kid.velocity, dt);
      kid.group.position.x = THREE.MathUtils.clamp(kid.group.position.x, b.minX, b.maxX);
      kid.group.position.z = THREE.MathUtils.clamp(kid.group.position.z, b.minZ, b.maxZ);

      // face the snack
      const yaw = Math.atan2(kid.velocity.x, kid.velocity.z);
      let dy = yaw - kid.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      kid.group.rotation.y += dy * Math.min(1, dt * 5);

      // toddler run
      const step = t * 9 + kid.speed;
      kid.legs[0].rotation.x = Math.sin(step) * 0.7;
      kid.legs[1].rotation.x = -Math.sin(step) * 0.7;
      kid.group.position.y = Math.abs(Math.sin(step)) * 0.06;
    }
  }

  /** Returns { dir, contact } when a kid grabs the potato, else null. */
  checkHit(playerPos, playerRadius) {
    if (!this.active) return null;
    for (const kid of this.kids) {
      if (kid.recoil > 0) continue;
      const dx = playerPos.x - kid.group.position.x;
      const dz = playerPos.z - kid.group.position.z;
      if (Math.hypot(dx, dz) < kid.radius + playerRadius) {
        kid.recoil = 1.6; // pauses to gloat
        const dir = new THREE.Vector3(dx, 0, dz);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
        dir.normalize();
        const contact = playerPos.clone().setY(0.9).addScaledVector(dir, -0.3);
        return { dir, contact };
      }
    }
    return null;
  }
}
