import * as THREE from 'three';

// Level 6 — פנים התנור. You got caught. Now you're inside. The walls glow,
// the floor heats up over time, and heat waves sweep the room — invisible but
// for the shimmer. The door opens every 8s for exactly 1.2s. One window. Miss
// it and you wait for the next.

const HALF_W = 9;
const HALF_D = 7;
const DOOR_PERIOD = 8;
const DOOR_OPEN = 1.2;

export class OvenInteriorLevel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.fallOffEdges = false;
    this.bounds = { minX: -HALF_W + 0.5, maxX: HALF_W - 0.5, minZ: -HALF_D + 0.5, maxZ: HALF_D - 0.5 };
    this.obstacles = [];
    this.steamVents = [];
    this.butterZone = { x: 9999, z: 9999, half: 0 };

    // the door is the exit — fixed on the front wall
    this.exitPos = new THREE.Vector3(0, 0, HALF_D - 0.6);
    this.exitRadius = 2.0;
    this.exitActive = false;
    this.active = false;
    this.floorHeat = 0; // 0..1 ramps over the level
    this.spawn = { x: 0, z: -3.5 }; // back wall, away from the front door

    this._build();
    this._buildHeatWaves();
  }

  isOverFloor() { return true; }

  // the door is cyclic, not corner-random — keep it fixed, ignore relocation
  get exitSpots() { return [[0, HALF_D - 0.6]]; }
  setExitPosition() { /* fixed door */ }

  setExitActive(active) {
    this.exitActive = active;
    this.doorMat.emissiveIntensity = active ? 1.6 : 0.0;
    this.doorOpening.scale.y = active ? 1 : 0.02;
  }

  setActive(a) {
    this.active = a;
    this.group.visible = a;
    if (a) {
      this.doorCycle = DOOR_OPEN; // start just after a closing, so no instant win
      this.floorHeat = 0;
      this.heatTickT = 0;
      for (const w of this.waves) { w.t = Math.random() * 4; w.mesh.visible = false; }
    }
  }

  _build() {
    // glowing-hot interior walls
    this.wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a0a04, emissive: 0xff4008, emissiveIntensity: 0.6, roughness: 0.7, metalness: 0.2,
    });
    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a0803, emissive: 0xff2a04, emissiveIntensity: 0.2, roughness: 0.6, metalness: 0.3,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.4, HALF_D * 2), this.floorMat);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 11), this.wallMat);
    back.position.set(0, 5.5, -HALF_D);
    this.group.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(HALF_D * 2, 11), this.wallMat);
      side.rotation.y = -s * Math.PI / 2;
      side.position.set(s * HALF_W, 5.5, 0);
      this.group.add(side);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), this.wallMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 11;
    this.group.add(ceil);

    // heating coils on the floor, for flavour
    const coilMat = new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff5010, emissiveIntensity: 1.2, roughness: 0.5 });
    for (let i = -1; i <= 1; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 8, 40), coilMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(i * 5, 0.06, -2);
      this.group.add(coil);
    }
    this.coilMat = coilMat;

    // the door on the front wall (the exit)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.6, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x15110d, metalness: 0.6, roughness: 0.4 }));
    frame.position.set(0, 2.4, HALF_D - 0.2);
    this.group.add(frame);
    this.doorMat = new THREE.MeshStandardMaterial({
      color: 0x081018, emissive: 0x6cf0ff, emissiveIntensity: 0.0, roughness: 0.3,
    });
    // "opening" — cool outside light spills in when the door lifts
    this.doorOpening = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.8), this.doorMat);
    this.doorOpening.position.set(0, 2.3, HALF_D - 0.55);
    this.doorOpening.scale.y = 0.02;
    this.group.add(this.doorOpening);
  }

  _buildHeatWaves() {
    // near-invisible sweeping hazards: just a faint shimmer
    this.waves = [];
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.0, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0.07, depthWrite: false })
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.waves.push({ mesh, t: Math.random() * 4, dir: new THREE.Vector3(), speed: 6 + i });
    }
  }

  threats() {
    if (!this.active) return [];
    return this.waves.filter(w => w.mesh.visible).map(w => w.mesh.position);
  }

  /** Door is a fixed cyclic window — main loop calls this for gating. */
  doorIsOpen() { return this.exitActive; }

  update(dt, t, playerPos, physics, onHit) {
    if (!this.active) return;

    // ── door cycle: open 1.2s every 8s ──
    this.doorCycle = (this.doorCycle + dt) % DOOR_PERIOD;
    const shouldOpen = this.doorCycle < DOOR_OPEN;
    if (shouldOpen !== this.exitActive) this.setExitActive(shouldOpen);

    // ── floor heats up over time → periodic damage that quickens ──
    this.floorHeat = Math.min(1, this.floorHeat + dt * 0.018);
    this.floorMat.emissiveIntensity = 0.2 + this.floorHeat * 1.6 + Math.sin(t * 6) * 0.1;
    this.coilMat.emissiveIntensity = 1.2 + Math.sin(t * 8) * 0.4 + this.floorHeat;
    this.wallMat.emissiveIntensity = 0.6 + this.floorHeat * 0.5;
    // grounded potato takes ticks; in the air (jumping) you're briefly safe
    const tickInterval = 2.4 - this.floorHeat * 1.6; // 2.4s → 0.8s
    this.heatTickT -= dt;
    if (this.heatTickT <= 0) {
      this.heatTickT = tickInterval;
      if (this.floorHeat > 0.25 && physics.grounded) {
        onHit(new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5)).normalize(),
          playerPos.clone().setY(0.4));
      }
    }

    // ── heat waves sweep the room ──
    for (const w of this.waves) {
      w.t -= dt;
      if (!w.mesh.visible) {
        if (w.t <= 0) {
          // launch from a random edge toward the player
          const side = Math.random() < 0.5;
          w.mesh.position.set(
            side ? (Math.random() < 0.5 ? -HALF_W : HALF_W) : (Math.random() - 0.5) * HALF_W * 2,
            1.0,
            side ? (Math.random() - 0.5) * HALF_D * 2 : (Math.random() < 0.5 ? -HALF_D : HALF_D)
          );
          w.dir.subVectors(playerPos, w.mesh.position).setY(0).normalize();
          w.mesh.visible = true;
          w.life = 3.2;
        }
      } else {
        w.mesh.position.addScaledVector(w.dir, w.speed * dt);
        w.mesh.scale.setScalar(1 + Math.sin(t * 12 + w.speed) * 0.12);
        w.life -= dt;
        const dx = playerPos.x - w.mesh.position.x;
        const dz = playerPos.z - w.mesh.position.z;
        if (Math.hypot(dx, dz) < 2.0) {
          const dir = new THREE.Vector3(dx, 0, dz);
          if (dir.lengthSq() < 1e-4) dir.copy(w.dir);
          onHit(dir.normalize(), playerPos.clone().setY(0.6));
        }
        if (w.life <= 0 || Math.abs(w.mesh.position.x) > HALF_W + 3 || Math.abs(w.mesh.position.z) > HALF_D + 3) {
          w.mesh.visible = false;
          w.t = 1.6 + Math.random() * 2;
        }
      }
    }
  }
}
