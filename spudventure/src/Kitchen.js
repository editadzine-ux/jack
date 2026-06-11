import * as THREE from 'three';

// Floor is 30 (x) by 20 (z), centred on the origin. Back wall at z = -10.
export const FLOOR_W = 30;
export const FLOOR_D = 20;

function makeTileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  // ceramic tile with grout border and faint mottling
  g.fillStyle = '#cfc6b6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    const a = Math.random() * 0.05;
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '90,80,65' : '255,250,240'},${a})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 14, 14);
  }
  g.strokeStyle = '#8e8478';
  g.lineWidth = 10;
  g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 2;
  g.strokeRect(7, 7, 242, 242);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9a6b38';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    g.fillStyle = `rgba(60,35,12,${0.05 + 0.12 * Math.abs(Math.sin(y * 0.21 + Math.sin(y * 0.05) * 3))})`;
    g.fillRect(0, y, 256, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Kitchen {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Circle colliders { x, z, r, h } — h lets the potato jump over low objects
    this.obstacles = [];
    // Inner playable bounds (walls minus potato radius handled in Physics)
    this.bounds = { minX: -FLOOR_W / 2 + 0.6, maxX: FLOOR_W / 2 - 0.6, minZ: -FLOOR_D / 2 + 0.6, maxZ: FLOOR_D / 2 - 0.6 };

    this.exitPos = new THREE.Vector3(11.5, 0, 7.2);
    this.exitRadius = 1.8;
    this.butterZone = { x: -5, z: 2, half: 1.5 };
    this.steamVents = [];

    this._buildFloorAndWalls();
    this._buildPots();
    this._buildPans();
    this._buildUtensils();
    this._buildCuttingBoard();
    this._buildButterZone();
    this._buildSteamVents();
  }

  _buildFloorAndWalls() {
    const tile = makeTileTexture();
    tile.repeat.set(15, 10);
    const tileMat = new THREE.MeshStandardMaterial({ map: tile, roughness: 0.85, metalness: 0.05 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_W, FLOOR_D), tileMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const wallH = 10;
    const wallTile = makeTileTexture();
    wallTile.repeat.set(15, 5);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTile, roughness: 0.85, metalness: 0.05 });

    const back = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_W, wallH), wallMat);
    back.position.set(0, wallH / 2, -FLOOR_D / 2);
    back.receiveShadow = true;
    this.group.add(back);

    const sideTile = makeTileTexture();
    sideTile.repeat.set(10, 5);
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTile, roughness: 0.85, metalness: 0.05 });

    const left = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_D, wallH), sideMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-FLOOR_W / 2, wallH / 2, 0);
    left.receiveShadow = true;
    this.group.add(left);

    const right = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_D, wallH), sideMat.clone());
    right.rotation.y = -Math.PI / 2;
    right.position.set(FLOOR_W / 2, wallH / 2, 0);
    right.receiveShadow = true;
    this.group.add(right);
  }

  _buildPots() {
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.32 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x5a5e66, metalness: 0.85, roughness: 0.4 });
    const pots = [
      { x: -6, z: -4, r: 2.0, h: 3.4 },
      { x: 5.5, z: -5, r: 1.7, h: 2.7 },
      { x: -1.5, z: 3.5, r: 1.45, h: 2.3 },
    ];
    for (const p of pots) {
      const pot = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 0.94, p.h, 32, 1, false), steel);
      body.position.y = p.h / 2;
      body.castShadow = body.receiveShadow = true;
      pot.add(body);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.09, 12, 36), steel);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = p.h;
      rim.castShadow = true;
      pot.add(rim);
      // stubby handles
      for (const s of [-1, 1]) {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 16, Math.PI), darkSteel);
        handle.position.set(s * (p.r + 0.05), p.h * 0.8, 0);
        handle.rotation.z = s * Math.PI / 2 - Math.PI / 2;
        pot.add(handle);
      }
      pot.position.set(p.x, 0, p.z);
      this.group.add(pot);
      this.obstacles.push({ x: p.x, z: p.z, r: p.r + 0.12, h: p.h });
    }
  }

  _buildPans() {
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.75, roughness: 0.5 });
    const pans = [
      { x: 8, z: 1.2, r: 1.8, rot: 0.7 },
      { x: -9.5, z: 5.5, r: 1.6, rot: -1.9 },
    ];
    for (const p of pans) {
      const pan = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 0.92, 0.26, 36), iron);
      disc.position.y = 0.13;
      disc.castShadow = disc.receiveShadow = true;
      pan.add(disc);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.3), iron);
      handle.position.set(p.r + 0.8, 0.2, 0);
      handle.castShadow = true;
      pan.add(handle);
      pan.position.set(p.x, 0, p.z);
      pan.rotation.y = p.rot;
      this.group.add(pan);
      // low — jumpable
      this.obstacles.push({ x: p.x, z: p.z, r: p.r, h: 0.28 });
    }
  }

  _buildUtensils() {
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.95, roughness: 0.25 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5c2e, roughness: 0.8 });

    // wooden spoon
    const spoon = new THREE.Group();
    const spoonHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 10), wood);
    spoonHandle.rotation.z = Math.PI / 2;
    spoonHandle.position.set(0, 0.1, 0);
    const spoonHead = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), wood);
    spoonHead.scale.set(1, 0.35, 0.8);
    spoonHead.position.set(1.55, 0.14, 0);
    spoon.add(spoonHandle, spoonHead);
    spoon.position.set(2.2, 0, -0.8);
    spoon.rotation.y = 0.5;
    spoon.traverse(o => { o.castShadow = o.receiveShadow = true; });
    this.group.add(spoon);
    this.obstacles.push({ x: 2.2, z: -0.8, r: 1.0, h: 0.25 });

    // spatula
    const spat = new THREE.Group();
    const spatHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 10), steel);
    spatHandle.rotation.z = Math.PI / 2;
    spatHandle.position.y = 0.08;
    const spatHead = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.8), steel);
    spatHead.position.set(1.4, 0.06, 0);
    spat.add(spatHandle, spatHead);
    spat.position.set(-4, 0, -7.5);
    spat.rotation.y = -0.9;
    spat.traverse(o => { o.castShadow = o.receiveShadow = true; });
    this.group.add(spat);
    this.obstacles.push({ x: -4, z: -7.5, r: 0.9, h: 0.18 });

    // fork
    const fork = new THREE.Group();
    const forkHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 10), steel);
    forkHandle.rotation.z = Math.PI / 2;
    forkHandle.position.y = 0.08;
    for (let i = 0; i < 3; i++) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.8, 8), steel);
      tine.rotation.z = Math.PI / 2;
      tine.position.set(1.35, 0.08, (i - 1) * 0.16);
      fork.add(tine);
    }
    fork.add(forkHandle);
    fork.position.set(6.5, 0, 5.5);
    fork.rotation.y = 2.2;
    fork.traverse(o => { o.castShadow = o.receiveShadow = true; });
    this.group.add(fork);
    this.obstacles.push({ x: 6.5, z: 5.5, r: 0.9, h: 0.18 });
  }

  _buildCuttingBoard() {
    const wood = makeWoodTexture();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.3, 3.2),
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7 })
    );
    board.position.set(this.exitPos.x, 0.15, this.exitPos.z);
    board.castShadow = board.receiveShadow = true;
    this.group.add(board);

    // green emissive rim
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x1a3320, emissive: 0x2bff66, emissiveIntensity: 1.6, roughness: 0.5,
    });
    const rimGeoX = new THREE.BoxGeometry(4.6, 0.12, 0.12);
    const rimGeoZ = new THREE.BoxGeometry(0.12, 0.12, 3.4);
    const rims = [
      [0, 0.32, 1.66, rimGeoX], [0, 0.32, -1.66, rimGeoX],
      [2.26, 0.32, 0, rimGeoZ], [-2.26, 0.32, 0, rimGeoZ],
    ];
    this.exitRims = [];
    for (const [x, y, z, geo] of rims) {
      const rim = new THREE.Mesh(geo, rimMat);
      rim.position.set(this.exitPos.x + x, y, this.exitPos.z + z);
      this.group.add(rim);
      this.exitRims.push(rim);
    }
    this.exitRimMat = rimMat;
  }

  _buildButterZone() {
    const b = this.butterZone;
    const slick = new THREE.Mesh(
      new THREE.PlaneGeometry(b.half * 2, b.half * 2),
      new THREE.MeshStandardMaterial({
        color: 0xf2d04a, roughness: 0.08, metalness: 0.1,
        transparent: true, opacity: 0.55,
      })
    );
    slick.rotation.x = -Math.PI / 2;
    slick.position.set(b.x, 0.02, b.z);
    this.group.add(slick);
    // the melting pat of butter responsible for the mess
    const pat = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.4, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xf6d65d, roughness: 0.25 })
    );
    pat.position.set(b.x + 0.9, 0.2, b.z - 0.9);
    pat.castShadow = true;
    this.group.add(pat);
  }

  _buildSteamVents() {
    const grate = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.8, roughness: 0.45 });
    const positions = [
      { x: 0.5, z: 0.5, offset: 0 },
      { x: 7.5, z: -2.5, offset: 1.8 },
      { x: -9, z: -2, offset: 3.4 },
    ];
    for (const p of positions) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 24), grate);
      disc.position.set(p.x, 0.04, p.z);
      disc.receiveShadow = true;
      this.group.add(disc);

      // steam column: recycled point sprites
      const count = 40;
      const pos = new Float32Array(count * 3);
      const seed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = p.x + (Math.random() - 0.5) * 0.8;
        pos[i * 3 + 1] = Math.random() * 2.4;
        pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.8;
        seed[i] = Math.random();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xdfe5e8, size: 0.45, transparent: true, opacity: 0,
        depthWrite: false,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      this.group.add(points);

      this.steamVents.push({
        pos: new THREE.Vector3(p.x, 0, p.z),
        radius: 1.3,
        offset: p.offset,
        active: false,
        points, seed,
      });
    }
  }

  update(dt, t) {
    // exit rim breathing
    this.exitRimMat.emissiveIntensity = 1.4 + Math.sin(t * 2.2) * 0.5;

    // steam vents: 5s cycle, active for the first 2s
    for (const v of this.steamVents) {
      v.active = ((t + v.offset) % 5) < 2;
      const mat = v.points.material;
      mat.opacity += ((v.active ? 0.5 : 0) - mat.opacity) * Math.min(1, dt * 6);
      if (mat.opacity > 0.01) {
        const pos = v.points.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) + dt * (1.6 + v.seed[i] * 1.2);
          if (y > 2.6) {
            y = 0.05;
            pos.setX(i, v.pos.x + (Math.random() - 0.5) * 0.8);
            pos.setZ(i, v.pos.z + (Math.random() - 0.5) * 0.8);
          }
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
    }
  }
}
