import * as THREE from 'three';

const BASE_PLAYER_SPEED = 8; // run speed — phase speeds are fractions of this

export class OvenEnemy {
  constructor(scene, startPos) {
    this.scene = scene;
    this.startPos = startPos.clone();
    this.group = new THREE.Group();
    this.group.position.copy(startPos);
    scene.add(this.group);

    this.radius = 1.9;
    this.phase = 'dormant';
    this.dormantT = 4;
    this.elapsed = 0;
    this.speedBonus = 0;
    this.roundBoost = 0;
    this.rage = false;
    this.recoilT = 0; // pause after landing a hit
    this.velocity = new THREE.Vector3();

    this._build();
    this._buildEmbers();
    this._bursts = [];
  }

  _build() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1d1f24, metalness: 0.85, roughness: 0.45 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x44474f, metalness: 0.9, roughness: 0.3 });

    const legH = 0.45;
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 2.5), bodyMat);
    body.position.y = legH + 2;
    body.castShadow = body.receiveShadow = true;
    this.group.add(body);
    this.body = body;

    // 4 tiny legs — same absurd proportion as the potato's
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2c32, metalness: 0.7, roughness: 0.5 });
    this.legs = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 1.1, legH, sz * 0.85);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, legH, 10), legMat);
      leg.position.y = -legH / 2;
      leg.castShadow = true;
      hip.add(leg);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), legMat);
      foot.scale.set(1, 0.6, 1.3);
      foot.position.y = -legH;
      hip.add(foot);
      this.group.add(hip);
      this.legs.push(hip);
    }

    // door (front face, hinged at the bottom) with glowing window
    this.door = new THREE.Group();
    this.door.position.set(0, legH + 0.35, 1.25); // hinge line
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.0, 0.18), trimMat);
    doorPanel.position.y = 1.5;
    doorPanel.castShadow = true;
    this.door.add(doorPanel);

    this.windowMat = new THREE.MeshStandardMaterial({
      color: 0x331303, emissive: 0xff5208, emissiveIntensity: 1.0,
      roughness: 0.3, metalness: 0.1,
    });
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 0.1), this.windowMat);
    win.position.set(0, 1.55, 0.08);
    this.door.add(win);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 10), trimMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, 2.85, 0.22);
    this.door.add(handle);
    this.group.add(this.door);

    // top vents
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.8 });
    for (const x of [-0.8, 0.8]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.6), ventMat);
      vent.position.set(x, legH + 4.05, 0);
      this.group.add(vent);
    }

    // dials, for menace
    for (let i = 0; i < 4; i++) {
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), trimMat);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(-1.05 + i * 0.7, legH + 3.6, 1.3);
      this.group.add(dial);
    }
  }

  _buildEmbers() {
    const count = 80;
    this._emberData = [];
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this._emberData.push(this._spawnEmber());
      color.setHSL(0.03 + Math.random() * 0.06, 1, 0.5 + Math.random() * 0.2);
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.embers = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
  }

  _spawnEmber() {
    return {
      p: new THREE.Vector3((Math.random() < 0.5 ? -0.8 : 0.8) + (Math.random() - 0.5) * 0.7, 4.5, (Math.random() - 0.5) * 1.4),
      v: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.5),
      life: Math.random() * 1.5,
    };
  }

  setRage() {
    if (this.rage) return;
    this.rage = true;
    this.phase = 'rage';
  }

  clearRage() {
    if (!this.rage) return;
    this.rage = false;
    if (this.phase === 'rage') this.phase = 'pursuit';
  }

  /** Reset for the next round — back to the wall, dormant, a bit meaner. */
  reset(round) {
    this.group.position.copy(this.startPos);
    this.group.rotation.y = 0;
    this.velocity.set(0, 0, 0);
    this.phase = 'dormant';
    this.dormantT = Math.max(1.5, 4 - (round - 1) * 0.5);
    this.elapsed = 0;
    this.speedBonus = 0;
    this.recoilT = 0;
    this.roundBoost = (round - 1) * 0.07;
    this.door.rotation.x = 0;
    this._doorOpen = false;
  }

  /** Burst of sparks from the contact point (world space). */
  sparkBurst(point, count = 200) {
    const pos = new Float32Array(count * 3);
    const vel = [];
    const col = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos[i * 3] = point.x; pos[i * 3 + 1] = point.y; pos[i * 3 + 2] = point.z;
      const theta = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.1;
      const s = 2 + Math.random() * 7;
      vel.push(new THREE.Vector3(Math.cos(theta) * s * (1 - up * 0.5), up * s, Math.sin(theta) * s * (1 - up * 0.5)));
      color.setHSL(0.02 + Math.random() * 0.09, 1, 0.55 + Math.random() * 0.25);
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this._bursts.push({ points, vel, life: 0.8 });
    this.recoilT = 1.0;
  }

  openDoor() {
    // handled with a simple per-frame ease in update via target angle
    this._doorOpen = true;
  }

  update(dt, t, playerPos, kitchen) {
    this.elapsed += dt;

    // ── window glow pulse 0.8–1.4 (white-hot in rage) ──
    const pulse = 0.8 + (Math.sin(t * (this.rage ? 9 : 3.2)) * 0.5 + 0.5) * 0.6;
    this.windowMat.emissiveIntensity = this.rage ? pulse * 2.4 : pulse;
    this.windowMat.emissive.setHex(this.rage ? 0xffe9c8 : 0xff5208);
    this.pulse = (pulse - 0.8) / 0.6;

    // ── phases ──
    let speed = 0;
    if (this.phase === 'dormant') {
      this.dormantT -= dt;
      // steam builds: tremble grows as it wakes
      const wake = 1 - Math.max(0, this.dormantT) / 4;
      this.body.position.x = (Math.random() - 0.5) * 0.04 * wake;
      this.windowMat.emissiveIntensity = 0.4 + wake * pulse;
      if (this.dormantT <= 0) this.phase = 'pursuit';
    } else {
      this.body.position.x = 0;
      // +0.3 speed every 30s of pursuit, capped at 95% of player speed.
      // Later rounds start faster via roundBoost.
      this.speedBonus = Math.floor((this.elapsed - 4) / 30) * 0.3;
      const frac = this.rage ? 0.9 : Math.min(0.6 + this.roundBoost, 0.9);
      speed = Math.min(frac * BASE_PLAYER_SPEED + Math.max(0, this.speedBonus), 0.95 * BASE_PLAYER_SPEED);
      if (this.recoilT > 0) { this.recoilT -= dt; speed = 0; }
    }

    // ── steering: seek player, repulsed by obstacles ──
    if (speed > 0) {
      const seek = new THREE.Vector3().subVectors(playerPos, this.group.position);
      seek.y = 0;
      const dist = seek.length();
      if (dist > 0.1) {
        seek.normalize();
        // simple obstacle avoidance: push away from anything close to our path
        for (const o of kitchen.obstacles) {
          if (o.h < 1) continue; // waddle over the flat stuff
          const dx = this.group.position.x - o.x;
          const dz = this.group.position.z - o.z;
          const d = Math.hypot(dx, dz);
          const avoidR = o.r + this.radius + 1.2;
          if (d < avoidR && d > 1e-3) {
            const w = (avoidR - d) / avoidR * 2.2;
            seek.x += (dx / d) * w;
            seek.z += (dz / d) * w;
          }
        }
        seek.normalize();
        this.velocity.lerp(seek.multiplyScalar(speed), Math.min(1, dt * 3));
        this.group.position.addScaledVector(this.velocity, dt);

        // face the player
        const yaw = Math.atan2(this.velocity.x, this.velocity.z);
        let dy = yaw - this.group.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.group.rotation.y += dy * Math.min(1, dt * 4);

        // tiny legs scurrying, body rocking
        const scurry = t * (14 + speed);
        for (let i = 0; i < 4; i++) {
          this.legs[i].rotation.x = Math.sin(scurry + (i % 2) * Math.PI) * 0.5;
        }
        this.body.rotation.z = Math.sin(scurry * 0.5) * 0.025;
      }

      // hard push-out so the oven never clips into pots or walls
      for (const o of kitchen.obstacles) {
        if (o.h < 1) continue;
        const dx = this.group.position.x - o.x;
        const dz = this.group.position.z - o.z;
        const minD = o.r + this.radius * 0.8;
        const d = Math.hypot(dx, dz);
        if (d < minD && d > 1e-3) {
          this.group.position.x += (dx / d) * (minD - d);
          this.group.position.z += (dz / d) * (minD - d);
        }
      }
      const b = kitchen.bounds;
      this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, b.minX - 0.2, b.maxX + 0.2);
      this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, b.minZ - 0.2, b.maxZ + 0.2);
    }

    // ── door (lose sequence) ──
    if (this._doorOpen) {
      this.door.rotation.x = Math.min(this.door.rotation.x + dt * 1.4, Math.PI * 0.52);
    }

    // ── embers ──
    const pos = this.embers.geometry.attributes.position;
    const rate = this.rage ? 2 : 1;
    for (let i = 0; i < this._emberData.length; i++) {
      const e = this._emberData[i];
      e.life -= dt * rate;
      e.p.addScaledVector(e.v, dt * rate);
      e.v.x += (Math.random() - 0.5) * dt * 3;
      e.v.z += (Math.random() - 0.5) * dt * 3;
      if (e.life <= 0) Object.assign(e, this._spawnEmber(), { life: 1 + Math.random() });
      pos.setXYZ(i, e.p.x, e.p.y, e.p.z);
    }
    pos.needsUpdate = true;

    // ── spark bursts ──
    for (let i = this._bursts.length - 1; i >= 0; i--) {
      const burst = this._bursts[i];
      burst.life -= dt;
      const bp = burst.points.geometry.attributes.position;
      for (let j = 0; j < burst.vel.length; j++) {
        const v = burst.vel[j];
        v.y -= 14 * dt;
        bp.setXYZ(j, bp.getX(j) + v.x * dt, Math.max(0.03, bp.getY(j) + v.y * dt), bp.getZ(j) + v.z * dt);
      }
      bp.needsUpdate = true;
      burst.points.material.opacity = Math.max(0, burst.life / 0.8);
      if (burst.life <= 0) {
        this.scene.remove(burst.points);
        burst.points.geometry.dispose();
        burst.points.material.dispose();
        this._bursts.splice(i, 1);
      }
    }
  }
}
