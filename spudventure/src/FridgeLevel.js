import * as THREE from 'three';

// Level 5 — המקרר. Cold, blue, slippery. Tupperware boxes pop their lids and
// try to vacuum you in. Shelves collapse every 20s. The exit is the vegetable
// drawer at the bottom: you WIN by falling into it. Weird, but right.

const HALF_W = 11;
const HALF_D = 8;
const PULL_R = 5.5;      // suction reach
const CAPTURE_R = 1.0;   // sucked fully in → caught
const SHELF_PERIOD = 20;

export class FridgeLevel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // arena interface
    this.fallOffEdges = false; // fridge walls clamp you in...
    this.bounds = { minX: -HALF_W + 0.5, maxX: HALF_W - 0.5, minZ: -HALF_D + 0.5, maxZ: HALF_D - 0.5 };
    this.obstacles = [];
    this.steamVents = [];
    this.butterZone = { x: 9999, z: 9999, half: 0 };
    // the "exit" is the drawer hole; exitPos sits at its centre for the arrow
    this.exitPos = new THREE.Vector3(0, 0, HALF_D - 2.2);
    this.exitRadius = 2.2;
    this.exitActive = false;
    this.active = false;
    this.spawn = { x: 0, z: -4 }; // back of the fridge, clear of the front drawer

    // drawer opening footprint (where the floor disappears when open)
    this.drawer = { x: 0, z: HALF_D - 2.2, halfX: 3.0, halfZ: 1.7 };

    this._build();
    this._buildTupperware();
    this._buildShelves();
    this._buildDrawer();
  }

  // floor exists everywhere unless the drawer is open and you're over it
  isOverFloor(x, z) {
    if (this.exitActive &&
        Math.abs(x - this.drawer.x) < this.drawer.halfX &&
        Math.abs(z - this.drawer.z) < this.drawer.halfZ) {
      return false; // fall through → win (handled in main)
    }
    return true;
  }

  // falling here is the win condition
  checkFallWin(x, z) {
    return Math.abs(x - this.drawer.x) < this.drawer.halfX + 0.4 &&
           Math.abs(z - this.drawer.z) < this.drawer.halfZ + 0.4;
  }

  get exitSpots() {
    // the drawer is always at the front-bottom, but slide it side to side
    return [[0, HALF_D - 2.2], [-5, HALF_D - 2.2], [5, HALF_D - 2.2]];
  }

  setExitPosition(x) {
    this.drawer.x = x;
    this.exitPos.set(x, 0, this.drawer.z);
    this.drawerGroup.position.x = x;
  }

  setExitActive(active) {
    this.exitActive = active;
    // drawer slides open, revealing the hole + a green glow lip
    this.drawerRimMat.emissive.setHex(active ? 0x2bff66 : 0x113322);
    this.drawerRimMat.emissiveIntensity = active ? 0.9 : 0.1;
    this.drawerFloor.visible = !active; // the floor panel slides away
  }

  setActive(a) {
    this.active = a;
    this.group.visible = a;
    if (a) {
      this.shelfT = SHELF_PERIOD;
      this.falls = [];
      for (const tw of this.tupperware) { tw.lidT = Math.random() * 4; tw.open = false; }
    }
  }

  _build() {
    // glowing cold interior
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd6e6ee, roughness: 0.35, metalness: 0.05 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.4, HALF_D * 2),
      new THREE.MeshStandardMaterial({ color: 0xc2dae6, roughness: 0.25, metalness: 0.1 }));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.floorPanel = floor;

    const back = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 12), wallMat);
    back.position.set(0, 6, -HALF_D);
    this.group.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(HALF_D * 2, 12), wallMat);
      side.rotation.y = -s * Math.PI / 2;
      side.position.set(s * HALF_W, 6, 0);
      this.group.add(side);
    }

    // frost overlay on the floor (slippery sheen)
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2),
      new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.03, metalness: 0.3, transparent: true, opacity: 0.3, depthWrite: false }));
    frost.rotation.x = -Math.PI / 2;
    frost.position.y = 0.02;
    this.group.add(frost);
  }

  _buildTupperware() {
    this.tupperware = [];
    const spots = [[-6, -3], [6, -2], [-3, 4], [5, 4.5]];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x9fd8e8, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.55 }));
      box.position.y = 0.8;
      box.castShadow = true;
      g.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x4fb0d8, roughness: 0.3 }));
      lid.position.set(0, 1.7, 0);
      g.add(lid);
      // glow that appears when the mouth is open and pulling
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0),
        new THREE.MeshBasicMaterial({ color: 0x8be0ff, transparent: true, opacity: 0, depthWrite: false }));
      mouth.rotation.x = -Math.PI / 2;
      mouth.position.y = 1.62;
      g.add(mouth);
      g.position.set(x, 0, z);
      this.group.add(g);
      this.tupperware.push({ group: g, lid, mouth, x, z, open: false, lidT: Math.random() * 4 });
      this.obstacles.push({ x, z, r: 1.3, h: 1.6 });
    }
  }

  _buildShelves() {
    // glass shelves overhead that collapse periodically
    this.shelfMat = new THREE.MeshStandardMaterial({
      color: 0xbfe8f5, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4,
    });
    this.shelfT = SHELF_PERIOD;
    this.falls = [];
  }

  _buildDrawer() {
    this.drawerGroup = new THREE.Group();
    // the drawer bin
    const bin = new THREE.Mesh(
      new THREE.BoxGeometry(this.drawer.halfX * 2 + 0.6, 1.4, this.drawer.halfZ * 2 + 0.4),
      new THREE.MeshStandardMaterial({ color: 0x7fc0d8, roughness: 0.2, transparent: true, opacity: 0.45 })
    );
    bin.position.y = -1.4;
    this.drawerGroup.add(bin);
    // veggies inside, as a reward you never reach
    for (let i = 0; i < 5; i++) {
      const veg = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 10, 8),
        new THREE.MeshStandardMaterial({ color: [0xff6a3a, 0x6ab04c, 0xe0a818][i % 3], roughness: 0.6 }));
      veg.position.set((Math.random() - 0.5) * 4, -1.6, (Math.random() - 0.5) * 2);
      this.drawerGroup.add(veg);
    }
    // floor panel that covers the hole until the drawer opens
    this.drawerFloor = new THREE.Mesh(
      new THREE.BoxGeometry(this.drawer.halfX * 2, 0.3, this.drawer.halfZ * 2),
      new THREE.MeshStandardMaterial({ color: 0xc2dae6, roughness: 0.25, metalness: 0.1 })
    );
    this.drawerFloor.position.y = -0.05;
    this.drawerGroup.add(this.drawerFloor);
    // glowing lip
    this.drawerRimMat = new THREE.MeshStandardMaterial({
      color: 0x123, emissive: 0x113322, emissiveIntensity: 0.1, roughness: 0.4,
    });
    for (const [w, d, x, z] of [
      [this.drawer.halfX * 2, 0.12, 0, this.drawer.halfZ],
      [this.drawer.halfX * 2, 0.12, 0, -this.drawer.halfZ],
      [0.12, this.drawer.halfZ * 2, this.drawer.halfX, 0],
      [0.12, this.drawer.halfZ * 2, -this.drawer.halfX, 0],
    ]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), this.drawerRimMat);
      lip.position.set(x, 0.12, z);
      this.drawerGroup.add(lip);
    }
    this.drawerGroup.position.set(this.drawer.x, 0, this.drawer.z);
    this.group.add(this.drawerGroup);
  }

  threats() {
    if (!this.active) return [];
    return this.tupperware.filter(t => t.open).map(t => t.group.position);
  }

  /** External pull applied to the player; returns true if caught (sucked in). */
  applySuction(physics) {
    let caught = false;
    for (const tw of this.tupperware) {
      if (!tw.open) continue;
      const dx = tw.x - physics.position.x;
      const dz = tw.z - physics.position.z;
      const d = Math.hypot(dx, dz);
      if (d < PULL_R && d > 1e-3) {
        const strength = (1 - d / PULL_R) * 26;
        physics.externalForce.x += (dx / d) * strength;
        physics.externalForce.z += (dz / d) * strength;
        if (d < CAPTURE_R) caught = true;
      }
    }
    return caught;
  }

  update(dt, t, playerPos, physics, onHit) {
    if (!this.active) return;

    // tupperware lids breathe open/closed
    for (const tw of this.tupperware) {
      tw.lidT -= dt;
      if (tw.lidT <= 0) {
        tw.open = !tw.open;
        tw.lidT = tw.open ? 2.4 : 3.2 + Math.random() * 2;
      }
      const targetLift = tw.open ? 1.1 : 0;
      tw.lid.position.y += ((1.7 + targetLift) - tw.lid.position.y) * Math.min(1, dt * 6);
      tw.lid.rotation.z += ((tw.open ? -0.5 : 0) - tw.lid.rotation.z) * Math.min(1, dt * 6);
      const targetOpacity = tw.open ? 0.35 + Math.sin(t * 10) * 0.15 : 0;
      tw.mouth.material.opacity += (targetOpacity - tw.mouth.material.opacity) * Math.min(1, dt * 8);
    }

    // shelves collapse every 20s
    this.shelfT -= dt;
    if (this.shelfT <= 0) {
      this.shelfT = SHELF_PERIOD;
      this._collapseShelf();
    }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.t -= dt;
      if (f.state === 'warn') {
        f.ring.material.opacity = 0.2 + (Math.sin(t * 16) * 0.5 + 0.5) * 0.3;
        if (f.t <= 0) { f.state = 'drop'; f.mesh.visible = true; f.t = 3; }
      } else if (f.state === 'drop') {
        f.mesh.position.y -= 22 * dt;
        f.mesh.rotation.x += dt * 3;
        if (f.mesh.position.y <= 0.4) {
          f.mesh.position.y = 0.4;
          f.state = 'rest'; f.t = 2.5;
          f.ring.visible = false;
          const dx = playerPos.x - f.mesh.position.x;
          const dz = playerPos.z - f.mesh.position.z;
          if (Math.hypot(dx, dz) < 1.3) {
            const dir = new THREE.Vector3(dx, 0, dz);
            if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
            onHit(dir.normalize(), f.mesh.position.clone().setY(0.6));
          }
        }
      } else if (f.state === 'rest') {
        if (f.t <= 0) {
          this.group.remove(f.mesh, f.ring);
          this.falls.splice(i, 1);
        }
      }
    }
  }

  _collapseShelf() {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * (HALF_W * 2 - 4);
      const z = (Math.random() - 0.5) * (HALF_D * 2 - 4);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.2, 24),
        new THREE.MeshBasicMaterial({ color: 0x8be0ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.04, z);
      this.group.add(ring);
      const shard = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 1.6), this.shelfMat);
      shard.position.set(x, 9, z);
      shard.visible = false;
      shard.castShadow = true;
      this.group.add(shard);
      this.falls.push({ state: 'warn', t: 1.0, ring, mesh: shard });
    }
  }
}
