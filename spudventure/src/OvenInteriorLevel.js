import * as THREE from 'three';

// Level 6 — פנים התנור. You got caught. Now you're inside. The exit is the
// oven door on the FAR wall, right in front of you. It is shut most of the
// time, flashes yellow as a warning, then opens green for a generous window.
// Reach it while it's green. Slow heat waves drift across — visible, dodgeable.

const HALF_W = 9;
const HALF_D = 7;
// clear, generous door rhythm: shut → "get ready" → wide open
const SHUT_TIME = 3.0;
const SOON_TIME = 1.6;
const OPEN_TIME = 2.6;

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

    // the door is on the BACK wall so the camera sees it ahead of the player
    this.exitPos = new THREE.Vector3(0, 0, -HALF_D + 0.8);
    this.exitRadius = 2.4;
    this.exitActive = false;
    this.active = false;
    this.floorHeat = 0;
    this.doorPhase = 'shut'; // shut | soon | open — read by the HUD
    this.spawn = { x: 0, z: HALF_D - 1.5 }; // front, facing the door

    this._build();
    this._buildHeatWaves();
  }

  isOverFloor() { return true; }

  // door is a fixed cyclic window — no corner relocation
  get exitSpots() { return [[0, -HALF_D + 0.8]]; }
  setExitPosition() { /* fixed door */ }

  setExitActive(active) {
    this.exitActive = active;
  }

  setActive(a) {
    this.active = a;
    this.group.visible = a;
    if (a) {
      this.cycle = 0;
      this.doorPhase = 'shut';
      this.exitActive = false;
      this.floorHeat = 0;
      this.heatTickT = 0;
      for (const w of this.waves) { w.t = 2 + Math.random() * 3; w.state = 'idle'; w.mesh.visible = false; }
    }
  }

  _build() {
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

    // heating coils on the floor
    const coilMat = new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff5010, emissiveIntensity: 1.2, roughness: 0.5 });
    for (let i = -1; i <= 1; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.16, 8, 40), coilMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(i * 5, 0.06, 1.5);
      this.group.add(coil);
    }
    this.coilMat = coilMat;

    // ── the door on the back wall ──
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.0, 5.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x15110d, metalness: 0.6, roughness: 0.4 }));
    frame.position.set(0, 2.6, -HALF_D + 0.25);
    this.group.add(frame);

    // the door panel itself — recolours with phase (shut/soon/open)
    this.doorMat = new THREE.MeshStandardMaterial({
      color: 0x1a0d08, emissive: 0xff3010, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.3,
    });
    this.doorPanel = new THREE.Mesh(new THREE.BoxGeometry(4.3, 4.4, 0.2), this.doorMat);
    this.doorPanel.position.set(0, 2.4, -HALF_D + 0.55);
    this.group.add(this.doorPanel);

    // cool daylight that floods in when it opens (scales up from the floor)
    this.openLight = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 4.2),
      new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0 })
    );
    this.openLight.position.set(0, 2.4, -HALF_D + 0.66);
    this.group.add(this.openLight);

    // a bright arrow on the floor that always points at the door
    this.guide = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.2, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8 })
    );
    this.guide.rotation.x = Math.PI / 2; // lie flat, pointing -z (toward door)
    this.guide.position.set(0, 0.08, -HALF_D + 3.2);
    this.group.add(this.guide);
  }

  _buildHeatWaves() {
    // visible, dodgeable shimmer that drifts across the room
    this.waves = [];
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.7, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.22, depthWrite: false })
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.waves.push({ mesh, t: 2 + Math.random() * 3, state: 'idle', dir: new THREE.Vector3(), speed: 4.2 });
    }
  }

  threats() {
    if (!this.active) return [];
    return this.waves.filter(w => w.state === 'move').map(w => w.mesh.position);
  }

  update(dt, t, playerPos, physics, onHit) {
    if (!this.active) return;

    // ── door rhythm: shut → soon (telegraph) → open ──
    this.cycle += dt;
    const period = SHUT_TIME + SOON_TIME + OPEN_TIME;
    if (this.cycle >= period) this.cycle -= period;
    let phase;
    if (this.cycle < SHUT_TIME) phase = 'shut';
    else if (this.cycle < SHUT_TIME + SOON_TIME) phase = 'soon';
    else phase = 'open';
    this.doorPhase = phase;
    this.exitActive = (phase === 'open');

    // door visuals per phase
    if (phase === 'shut') {
      this.doorMat.emissive.setHex(0xff3010);
      this.doorMat.emissiveIntensity = 0.45;
      this.openLight.material.opacity = 0;
      this.doorPanel.position.y += (2.4 - this.doorPanel.position.y) * Math.min(1, dt * 8);
    } else if (phase === 'soon') {
      // flashing yellow warning — get ready
      const blink = Math.sin(t * 18) * 0.5 + 0.5;
      this.doorMat.emissive.setHex(0xffd23f);
      this.doorMat.emissiveIntensity = 0.6 + blink * 1.8;
      this.openLight.material.opacity = 0;
    } else {
      // wide open — bright cool light, panel lifts away
      this.doorMat.emissive.setHex(0x6cf0ff);
      this.doorMat.emissiveIntensity = 2.2;
      this.openLight.material.opacity = 0.85;
      this.doorPanel.position.y += (5.4 - this.doorPanel.position.y) * Math.min(1, dt * 9);
    }

    // floor guide arrow pulses
    this.guide.material.opacity = 0.5 + (Math.sin(t * 4) * 0.5 + 0.5) * 0.4;

    // ── floor heat: gentle, with a long grace period; the door is the real test ──
    this.floorHeat = Math.min(1, this.floorHeat + dt * 0.012);
    this.floorMat.emissiveIntensity = 0.2 + this.floorHeat * 1.4 + Math.sin(t * 6) * 0.1;
    this.coilMat.emissiveIntensity = 1.2 + Math.sin(t * 8) * 0.4 + this.floorHeat;
    this.wallMat.emissiveIntensity = 0.6 + this.floorHeat * 0.4;
    const tickInterval = 3.0 - this.floorHeat * 1.0; // 3.0s → 2.0s, never punishing
    this.heatTickT -= dt;
    if (this.heatTickT <= 0) {
      this.heatTickT = tickInterval;
      if (this.floorHeat > 0.55 && physics.grounded) {
        onHit(new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5)).normalize(),
          playerPos.clone().setY(0.4));
      }
    }

    // ── heat waves: telegraph, then drift slowly across — easy to read ──
    for (const w of this.waves) {
      w.t -= dt;
      if (w.state === 'idle') {
        if (w.t <= 0) {
          // appear at an edge, grow in place as a warning, aim across the room
          const fromX = Math.random() < 0.5;
          w.mesh.position.set(
            fromX ? (Math.random() < 0.5 ? -HALF_W : HALF_W) : (Math.random() - 0.5) * HALF_W * 1.4,
            1.1,
            fromX ? (Math.random() - 0.5) * HALF_D * 1.4 : (Math.random() < 0.5 ? -HALF_D : HALF_D)
          );
          w.dir.set(-Math.sign(w.mesh.position.x) || 0, 0, -Math.sign(w.mesh.position.z) || 0).normalize();
          if (w.dir.lengthSq() < 0.1) w.dir.set(1, 0, 0);
          w.mesh.visible = true;
          w.mesh.scale.setScalar(0.2);
          w.state = 'warn';
          w.t = 0.7;
        }
      } else if (w.state === 'warn') {
        // swell up in place so the player sees it before it moves
        const k = 1 - Math.max(0, w.t) / 0.7;
        w.mesh.scale.setScalar(0.2 + k * 0.8);
        w.mesh.material.opacity = 0.12 + k * 0.18;
        if (w.t <= 0) { w.state = 'move'; w.life = 3.0; }
      } else { // move
        w.mesh.position.addScaledVector(w.dir, w.speed * dt);
        w.mesh.scale.setScalar(1 + Math.sin(t * 10) * 0.1);
        w.life -= dt;
        const dx = playerPos.x - w.mesh.position.x;
        const dz = playerPos.z - w.mesh.position.z;
        if (Math.hypot(dx, dz) < 1.7) {
          const dir = new THREE.Vector3(dx, 0, dz);
          if (dir.lengthSq() < 1e-4) dir.copy(w.dir);
          onHit(dir.normalize(), playerPos.clone().setY(0.6));
        }
        if (w.life <= 0 || Math.abs(w.mesh.position.x) > HALF_W + 3 || Math.abs(w.mesh.position.z) > HALF_D + 3) {
          w.mesh.visible = false;
          w.state = 'idle';
          w.t = 2.5 + Math.random() * 2.5;
        }
      }
    }
  }
}
