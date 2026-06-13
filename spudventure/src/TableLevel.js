import * as THREE from 'three';

// Level 4 — שולחן האוכל. You fell off the counter onto the dining table.
// The edges are cliffs; the carpet below is certain death. A giant fork
// sweeps across like a zamboni. Olives can be rolled into it as projectiles.

const HALF_W = 12;
const HALF_D = 7;
const FORK_SPEED = 11;

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a5226';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 3) {
    g.fillStyle = `rgba(40,22,8,${0.05 + 0.14 * Math.abs(Math.sin(y * 0.13 + Math.sin(y * 0.04) * 4))})`;
    g.fillRect(0, y, 256, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class TableLevel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // arena interface
    this.fallOffEdges = true;
    this.bounds = { minX: -HALF_W + 0.4, maxX: HALF_W - 0.4, minZ: -HALF_D + 0.4, maxZ: HALF_D - 0.4 };
    this.obstacles = [];
    this.steamVents = [];
    this.butterZone = { x: 9999, z: 9999, half: 0 };
    this.exitPos = new THREE.Vector3(9.5, 0, 5);
    this.exitRadius = 1.5;
    this.exitActive = false;
    this.active = false;
    this.spawn = { x: 0, z: 0 };

    this._build();
    this._buildFork();
    this._buildOlives();
    this._buildExit();
  }

  isOverFloor(x, z) { return Math.abs(x) <= HALF_W && Math.abs(z) <= HALF_D; }

  get exitSpots() {
    return [[9.3, 4.8], [-9.3, 4.8], [9.3, -4.8], [-9.3, -4.8]];
  }

  setExitPosition(x, z) {
    this.exitPos.set(x, 0, z);
    this.exitGroup.position.set(x, 0, z);
  }

  setExitActive(active) {
    this.exitActive = active;
    this.exitRimMat.emissive.setHex(active ? 0x2bff66 : 0x182218);
  }

  setActive(a) {
    this.active = a;
    this.group.visible = a;
    if (a) {
      this.forkState = 'idle';
      this.forkT = 3;
      this.forkStun = 0;
      this.fork.visible = false;
      this.warnStrip.visible = false;
      for (const o of this.olives) this._respawnOlive(o, true);
    }
  }

  _build() {
    const wood = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 0.6 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.8, HALF_D * 2), wood);
    top.position.y = -0.4;
    top.castShadow = top.receiveShadow = true;
    this.group.add(top);

    // table legs, for the vertigo
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6.2, 10), wood);
      leg.position.set(sx * (HALF_W - 1.5), -3.9, sz * (HALF_D - 1.2));
      this.group.add(leg);
    }

    // the carpet below: certain death, decoratively
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 50),
      new THREE.MeshStandardMaterial({ color: 0x4a1f24, roughness: 1 })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = -7;
    carpet.receiveShadow = true;
    this.group.add(carpet);
    const rug = new THREE.Mesh(
      new THREE.RingGeometry(6, 14, 32),
      new THREE.MeshStandardMaterial({ color: 0x6a3030, roughness: 1, side: THREE.DoubleSide })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = -6.97;
    this.group.add(rug);

    // dinnerware obstacles
    const china = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.25 });
    const plates = [
      { x: -5, z: -2, r: 2.2 },
      { x: 6, z: 2.5, r: 1.8 },
    ];
    for (const p of plates) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 0.8, 0.22, 28), china);
      plate.position.set(p.x, 0.11, p.z);
      plate.castShadow = plate.receiveShadow = true;
      this.group.add(plate);
      this.obstacles.push({ x: p.x, z: p.z, r: p.r, h: 0.25 }); // low — jumpable
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.1, 1.4, 24), china);
    bowl.position.set(-0.5, 0.7, 3.5);
    bowl.castShadow = bowl.receiveShadow = true;
    this.group.add(bowl);
    this.obstacles.push({ x: -0.5, z: 3.5, r: 1.6, h: 1.4 });

    const salt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 1.7, 12),
      new THREE.MeshStandardMaterial({ color: 0xdfe8ea, roughness: 0.15, transparent: true, opacity: 0.7 })
    );
    salt.position.set(3.5, 0.85, -3.5);
    salt.castShadow = true;
    this.group.add(salt);
    this.obstacles.push({ x: 3.5, z: -3.5, r: 0.55, h: 1.7 });
  }

  _buildFork() {
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.95, roughness: 0.25 });
    this.fork = new THREE.Group();
    // giant fork lying flat, long axis along z — slides along x
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 6.5, 12), steel);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.35, -2.2);
    this.fork.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 1.4), steel);
    head.position.set(0, 0.35, 1.6);
    this.fork.add(head);
    for (let i = 0; i < 4; i++) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 2.6, 8), steel);
      tine.rotation.x = Math.PI / 2;
      tine.position.set(-0.6 + i * 0.4, 0.35, 3.4);
      this.fork.add(tine);
    }
    this.fork.traverse(o => { o.castShadow = true; });
    this.fork.visible = false;
    this.group.add(this.fork);

    // telegraphed sweep lane
    this.warnStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2 + 8, 9.6),
      new THREE.MeshBasicMaterial({ color: 0xff3324, transparent: true, opacity: 0.12, depthWrite: false })
    );
    this.warnStrip.rotation.x = -Math.PI / 2;
    this.warnStrip.rotation.z = Math.PI / 2;
    this.warnStrip.position.y = 0.02;
    this.warnStrip.visible = false;
    this.group.add(this.warnStrip);

    this.forkState = 'idle';
    this.forkT = 3;
    this.forkStun = 0;
    this.sweepDir = 1;
  }

  _buildOlives() {
    const oliveMat = new THREE.MeshStandardMaterial({ color: 0x5a7a1e, roughness: 0.35 });
    const pimentoMat = new THREE.MeshStandardMaterial({ color: 0xc83a1c, roughness: 0.5 });
    this.olives = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), oliveMat);
      ball.castShadow = true;
      g.add(ball);
      const pim = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), pimentoMat);
      pim.position.set(0, 0.18, 0.24);
      g.add(pim);
      this.group.add(g);
      const olive = { mesh: g, vel: new THREE.Vector3(), respawnT: 0 };
      this.olives.push(olive);
      this._respawnOlive(olive, true);
    }
  }

  _respawnOlive(olive, instant = false) {
    olive.respawnT = instant ? 0 : 4;
    olive.vel.set(0, 0, 0);
    olive.mesh.visible = instant;
    olive.mesh.position.set(
      (Math.random() - 0.5) * (HALF_W * 2 - 6),
      0.33,
      (Math.random() - 0.5) * (HALF_D * 2 - 4)
    );
  }

  _buildExit() {
    this.exitGroup = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.24, 2.2),
      new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 0.7 })
    );
    pad.position.y = 0.12;
    pad.castShadow = pad.receiveShadow = true;
    this.exitGroup.add(pad);
    this.exitRimMat = new THREE.MeshStandardMaterial({
      color: 0x1a2018, emissive: 0x182218, emissiveIntensity: 0.12, roughness: 0.5,
    });
    const rimX = new THREE.BoxGeometry(3.0, 0.1, 0.1);
    const rimZ = new THREE.BoxGeometry(0.1, 0.1, 2.4);
    for (const [x, y, z, geo] of [
      [0, 0.26, 1.15, rimX], [0, 0.26, -1.15, rimX],
      [1.45, 0.26, 0, rimZ], [-1.45, 0.26, 0, rimZ],
    ]) {
      const rim = new THREE.Mesh(geo, this.exitRimMat);
      rim.position.set(x, y, z);
      this.exitGroup.add(rim);
    }
    this.exitGroup.position.copy(this.exitPos);
    this.group.add(this.exitGroup);
  }

  /** Positions the danger arrow should point at. */
  threats() {
    if (!this.active) return [];
    return (this.forkState === 'sweep' || this.forkState === 'telegraph') ? [this.fork.position] : [];
  }

  update(dt, t, playerPos, physics, onHit) {
    if (!this.active) return;

    // exit rim breathing
    this.exitRimMat.emissiveIntensity = this.exitActive ? 0.8 + Math.sin(t * 2.2) * 0.3 : 0.12;

    // ── fork zamboni ──
    this.forkT -= dt;
    if (this.forkState === 'idle') {
      if (this.forkT <= 0) {
        this.forkState = 'telegraph';
        this.forkT = 1.2;
        this.sweepDir = Math.random() < 0.5 ? 1 : -1;
        const laneZ = THREE.MathUtils.clamp(playerPos.z, -HALF_D + 2, HALF_D - 2);
        this.fork.position.set(-this.sweepDir * (HALF_W + 4), 0, laneZ);
        this.fork.rotation.y = this.sweepDir > 0 ? 0 : Math.PI;
        this.fork.visible = true;
        this.warnStrip.position.z = laneZ;
        this.warnStrip.visible = true;
      }
    } else if (this.forkState === 'telegraph') {
      this.warnStrip.material.opacity = 0.1 + (Math.sin(t * 16) * 0.5 + 0.5) * 0.18;
      this.fork.position.y = Math.sin(t * 30) * 0.04; // revving
      if (this.forkT <= 0) {
        this.forkState = 'sweep';
        this.fork.position.y = 0;
      }
    } else if (this.forkState === 'sweep') {
      if (this.forkStun > 0) {
        this.forkStun -= dt;
        this.fork.position.x += (Math.random() - 0.5) * 0.08; // rattled
      } else {
        this.fork.position.x += this.sweepDir * FORK_SPEED * dt;
      }
      this.warnStrip.material.opacity = 0.08;
      if (Math.abs(this.fork.position.x) > HALF_W + 5) {
        this.forkState = 'idle';
        this.forkT = 2.2 + Math.random() * 1.6;
        this.fork.visible = false;
        this.warnStrip.visible = false;
      }
      // hit the potato? (jump over it)
      const dx = playerPos.x - this.fork.position.x;
      const dz = playerPos.z - this.fork.position.z;
      if (this.forkStun <= 0 && Math.abs(dx) < 1.0 && Math.abs(dz) < 4.9 && playerPos.y < 0.75) {
        const dir = new THREE.Vector3(this.sweepDir, 0, 0);
        onHit(dir, playerPos.clone().setY(0.6));
      }
    }

    // ── olives ──
    for (const o of this.olives) {
      if (o.respawnT > 0) {
        o.respawnT -= dt;
        if (o.respawnT <= 0) this._respawnOlive(o, true);
        continue;
      }
      const speed = o.vel.length();
      // a rolling potato launches the olive like a marble
      if (physics.rolling && speed < 2) {
        const d = o.mesh.position.distanceTo(playerPos.clone().setY(0.33));
        if (d < 0.95) {
          const dir = new THREE.Vector3(physics.velocity.x, 0, physics.velocity.z);
          if (dir.lengthSq() > 0.1) {
            o.vel.copy(dir.normalize().multiplyScalar(16));
          }
        }
      }
      if (speed > 0.05) {
        o.mesh.position.addScaledVector(o.vel, dt);
        o.mesh.rotation.x += speed * dt * 2;
        o.vel.multiplyScalar(Math.max(0, 1 - 0.9 * dt));
        // olive vs fork: direct hit stuns the zamboni
        if (this.forkState === 'sweep' && this.forkStun <= 0 && speed > 5) {
          const dx = o.mesh.position.x - this.fork.position.x;
          const dz = o.mesh.position.z - this.fork.position.z;
          if (Math.abs(dx) < 1.2 && Math.abs(dz) < 4.9) {
            this.forkStun = 3;
            o.vel.multiplyScalar(-0.25);
          }
        }
        // rolled off the table
        if (Math.abs(o.mesh.position.x) > HALF_W + 0.4 || Math.abs(o.mesh.position.z) > HALF_D + 0.4) {
          o.mesh.visible = false;
          o.respawnT = 4;
        }
      }
    }
  }
}
