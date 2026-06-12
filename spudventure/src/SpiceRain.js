import * as THREE from 'three';

const WARN_TIME = 1.1;   // red ring telegraph before the drop
const FALL_SPEED = 26;
const HIT_RADIUS = 1.05; // damage radius at the moment of impact
const LINGER = 1.8;      // shaker stays as an obstacle, then sinks away

const SPICES = [
  { powder: 0xc8341c, name: 'paprika' },
  { powder: 0xe0a818, name: 'turmeric' },
  { powder: 0x2a2622, name: 'pepper' },
  { powder: 0x7a9c2e, name: 'oregano' },
];

export class SpiceRain {
  constructor(scene, kitchen) {
    this.scene = scene;
    this.kitchen = kitchen;
    this.active = false;
    this.timer = 0;
    this.drops = []; // { state: 'warn'|'fall'|'rest', mesh, ring, t, x, z, obstacle }
  }

  setActive(a) {
    this.active = a;
    if (!a) {
      for (const d of this.drops) this._dispose(d);
      this.drops.length = 0;
      this.timer = 0;
    }
  }

  _makeShaker() {
    const spice = SPICES[(Math.random() * SPICES.length) | 0];
    const g = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.46, 1.5, 14),
      new THREE.MeshStandardMaterial({
        color: 0xdfe8ea, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.5,
      })
    );
    glass.position.y = 0.75;
    g.add(glass);
    const powder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.42, 0.9, 14),
      new THREE.MeshStandardMaterial({ color: spice.powder, roughness: 0.9 })
    );
    powder.position.y = 0.47;
    g.add(powder);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.3, 14),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.85, roughness: 0.3 })
    );
    cap.position.y = 1.65;
    g.add(cap);
    g.traverse(o => { o.castShadow = true; });
    return g;
  }

  _spawn(playerPos, playerVel) {
    // aim near where the potato is heading, with scatter
    const lead = 0.7 + Math.random() * 0.6;
    const b = this.kitchen.bounds;
    const x = THREE.MathUtils.clamp(
      playerPos.x + playerVel.x * lead + (Math.random() - 0.5) * 5, b.minX + 1, b.maxX - 1);
    const z = THREE.MathUtils.clamp(
      playerPos.z + playerVel.z * lead + (Math.random() - 0.5) * 5, b.minZ + 1, b.maxZ - 1);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.95, 28),
      new THREE.MeshBasicMaterial({ color: 0xff3324, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    this.scene.add(ring);

    this.drops.push({ state: 'warn', t: WARN_TIME, x, z, ring, mesh: null, obstacle: null });
  }

  /**
   * @param onHit (dir, contactPoint) — called when a shaker lands on the potato
   */
  update(dt, t, playerPos, playerVel, onHit) {
    if (this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this._spawn(playerPos, playerVel);
        this.timer = 0.75 + Math.random() * 0.6;
      }
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t -= dt;

      if (d.state === 'warn') {
        const k = 1 - Math.max(0, d.t) / WARN_TIME;
        d.ring.material.opacity = 0.25 + k * 0.55 + Math.sin(t * 18) * 0.1;
        d.ring.scale.setScalar(1.3 - k * 0.3);
        if (d.t <= 0) {
          d.state = 'fall';
          d.mesh = this._makeShaker();
          d.mesh.position.set(d.x, 13, d.z);
          this.scene.add(d.mesh);
        }
      } else if (d.state === 'fall') {
        d.mesh.position.y -= FALL_SPEED * dt;
        d.mesh.rotation.y += dt * 2;
        if (d.mesh.position.y <= 0) {
          d.mesh.position.y = 0;
          d.state = 'rest';
          d.t = LINGER;
          this.scene.remove(d.ring);
          d.ring.geometry.dispose();
          d.ring.material.dispose();
          d.ring = null;
          // impact damage
          const dx = playerPos.x - d.x;
          const dz = playerPos.z - d.z;
          if (Math.hypot(dx, dz) < HIT_RADIUS) {
            const dir = new THREE.Vector3(dx, 0, dz);
            if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
            dir.normalize();
            onHit(dir, new THREE.Vector3(d.x, 0.8, d.z));
          }
          // becomes a low obstacle while it lies there
          d.obstacle = { x: d.x, z: d.z, r: 0.55, h: 1.6 };
          this.kitchen.obstacles.push(d.obstacle);
        }
      } else if (d.state === 'rest') {
        if (d.t < 0.5) d.mesh.position.y = -(0.5 - d.t) * 4; // sinks into the counter, sure, why not
        if (d.t <= 0) {
          this._dispose(d);
          this.drops.splice(i, 1);
        }
      }
    }
  }

  _dispose(d) {
    if (d.ring) {
      this.scene.remove(d.ring);
      d.ring.geometry.dispose();
      d.ring.material.dispose();
    }
    if (d.mesh) {
      this.scene.remove(d.mesh);
      d.mesh.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    if (d.obstacle) {
      const idx = this.kitchen.obstacles.indexOf(d.obstacle);
      if (idx >= 0) this.kitchen.obstacles.splice(idx, 1);
    }
  }
}
