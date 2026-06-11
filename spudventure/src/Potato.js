import * as THREE from 'three';

function makeSkinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c8964e';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(110,70,25,${0.08 + Math.random() * 0.18})`;
    const r = 1 + Math.random() * 3;
    g.beginPath();
    g.arc(Math.random() * 128, Math.random() * 128, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Potato {
  constructor(scene) {
    this.group = new THREE.Group();          // world position + facing yaw
    this.rollPivot = new THREE.Group();      // spins during a roll
    this.bodyGroup = new THREE.Group();      // squash/stretch/lean/bob
    this.group.add(this.rollPivot);
    this.rollPivot.add(this.bodyGroup);
    scene.add(this.group);

    this.radius = 0.55;

    this.bodyMat = new THREE.MeshStandardMaterial({
      map: makeSkinTexture(), color: 0xffffff, roughness: 0.9, metalness: 0,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 28, 22), this.bodyMat);
    body.scale.set(1.0, 0.82, 1.15);
    body.position.y = 0.78;
    body.castShadow = true;
    this.bodyGroup.add(body);
    this.body = body;

    // tiny dark eyes so panic reads on screen
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x241508, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), eyeMat);
      eye.position.set(s * 0.17, 0.92, 0.56);
      this.bodyGroup.add(eye);
    }

    // two absurdly short legs, pivoted at the hip
    const legMat = new THREE.MeshStandardMaterial({ color: 0xb07f3e, roughness: 0.85 });
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.2, 0.45, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.45, 10), legMat);
      leg.position.y = -0.225;
      leg.castShadow = true;
      hip.add(leg);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), legMat);
      foot.scale.set(1, 0.6, 1.3);
      foot.position.set(0, -0.45, 0.04);
      hip.add(foot);
      this.bodyGroup.add(hip);
      this.legs.push(hip);
    }

    // animation state
    this.animT = 0;
    this.idleT = 0;
    this.panic = false;
    this.scaleYTarget = 1;
    this.flashT = 0;
    this.facing = 0;
    this._wasAirborne = false;
    this._stretchedAtApex = false;
  }

  onJump() { this._squash(0.6, 0.08); this._stretchedAtApex = false; }
  onLand() { this._squash(0.62, 0.07); }

  hit() {
    this._squash(0.42, 0.05);            // violent squash
    this.flashT = 0.3;                   // red flash 0.3s
  }

  _squash(amount, hold) {
    this._squashAmount = amount;
    this._squashHold = hold;
  }

  setPanic(p) { this.panic = p; }

  /**
   * @param dt seconds
   * @param phys { velocity, grounded, rolling, running, position }
   */
  update(dt, phys) {
    const v = phys.velocity;
    const hSpeed = Math.hypot(v.x, v.z);
    const moving = hSpeed > 0.4;
    const speedMul = this.panic ? 2 : 1;
    this.animT += dt * speedMul;

    // facing follows movement direction
    if (moving) {
      const target = Math.atan2(v.x, v.z);
      let d = target - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 12);
      this.group.rotation.y = this.facing;
    }

    // ── rolling: full rotation around the local X axis (Z-flatten on body) ──
    if (phys.rolling) {
      this.rollPivot.rotation.x += dt * 14 * speedMul;
      this.scaleYTarget = 0.75;
      this.legs[0].rotation.x = this.legs[1].rotation.x = 0.4; // tucked
    } else {
      // unwind to upright quickly once the roll ends
      this.rollPivot.rotation.x *= Math.max(0, 1 - dt * 18);
      if (Math.abs(this.rollPivot.rotation.x) < 0.02) this.rollPivot.rotation.x = 0;

      const airborne = !phys.grounded;

      if (airborne) {
        // stretch at apex
        if (!this._stretchedAtApex && Math.abs(v.y) < 2.2) {
          this.scaleYTarget = 1.4;
          this._stretchedAtApex = true;
        }
        this.legs[0].rotation.x = -0.7;
        this.legs[1].rotation.x = 0.5;
      } else if (moving) {
        const running = hSpeed > 6.2;
        // walk 12Hz, run 22Hz (scaled to stay readable at 60fps)
        const freq = (running ? 22 : 12) * 1.4 * speedMul;
        const swing = running ? 1.15 : 0.85;
        this.legs[0].rotation.x = Math.sin(this.animT * freq) * swing;
        this.legs[1].rotation.x = -Math.sin(this.animT * freq) * swing;
        // body bob ±0.04
        this.bodyGroup.position.y = Math.abs(Math.sin(this.animT * freq)) * 0.08 - 0.04;
        // run lean 15° forward
        const lean = running ? THREE.MathUtils.degToRad(15) : 0;
        this.bodyGroup.rotation.x += (lean - this.bodyGroup.rotation.x) * Math.min(1, dt * 8);
        this.scaleYTarget = 1;
        this.idleT = 0;
      } else {
        // idle
        this.legs[0].rotation.x *= Math.max(0, 1 - dt * 10);
        this.legs[1].rotation.x *= Math.max(0, 1 - dt * 10);
        this.bodyGroup.position.y *= Math.max(0, 1 - dt * 10);
        this.bodyGroup.rotation.x *= Math.max(0, 1 - dt * 8);
        this.scaleYTarget = 1;
        this.idleT += dt;
        if (this.idleT > 3) {
          // subtle look-around: slow side-to-side glances
          const k = this.idleT - 3;
          this.group.rotation.y = this.facing + Math.sin(k * 0.9) * 0.45 * Math.min(1, k * 0.5);
          this.bodyGroup.rotation.z = Math.sin(k * 1.3) * 0.05;
        } else {
          this.bodyGroup.rotation.z *= Math.max(0, 1 - dt * 6);
        }
      }

      // squash/stretch on landing
      if (this._wasAirborne && phys.grounded) this.onLand();
      this._wasAirborne = airborne;
    }

    // ── pending squash impulses ──
    if (this._squashAmount !== undefined) {
      this.bodyGroup.scale.y = this._squashAmount;
      const inv = 1 / Math.sqrt(this._squashAmount);
      this.bodyGroup.scale.x = this.bodyGroup.scale.z = inv;
      this._squashHold -= dt;
      if (this._squashHold <= 0) { this._squashAmount = undefined; }
    } else {
      // ease toward target scale (preserve volume-ish)
      const sy = this.bodyGroup.scale.y + (this.scaleYTarget - this.bodyGroup.scale.y) * Math.min(1, dt * 10);
      this.bodyGroup.scale.y = sy;
      const inv = 1 / Math.sqrt(Math.max(0.2, sy));
      this.bodyGroup.scale.x += (inv - this.bodyGroup.scale.x) * Math.min(1, dt * 10);
      this.bodyGroup.scale.z = this.bodyGroup.scale.x;
    }

    // ── panic micro-tremors ──
    if (this.panic) {
      this.bodyGroup.position.x = (Math.random() - 0.5) * 0.035;
      this.bodyGroup.position.z = (Math.random() - 0.5) * 0.035;
    } else {
      this.bodyGroup.position.x *= Math.max(0, 1 - dt * 10);
      this.bodyGroup.position.z *= Math.max(0, 1 - dt * 10);
    }

    // ── hit flash ──
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.3);
      this.bodyMat.emissive.setRGB(k, k * 0.08, 0);
      this.bodyMat.emissiveIntensity = 1.5;
    } else {
      this.bodyMat.emissive.setRGB(0, 0, 0);
    }
  }
}
