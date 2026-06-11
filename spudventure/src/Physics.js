import * as THREE from 'three';

const GRAVITY = -18;
const JUMP_FORCE = 7;
const WALK_SPEED = 5;
const RUN_SPEED = 8;
const ROLL_SPEED = 10;
const PANIC_SPEED = 12;
const COYOTE_TIME = 0.08;
const JUMP_BUFFER = 0.1;

const ROLL_DURATION = 0.45;
const ROLL_COOLDOWN = 0.9;

export class Physics {
  constructor(kitchen) {
    this.kitchen = kitchen;
    this.position = new THREE.Vector3(0, 0, 4.5);
    this.velocity = new THREE.Vector3();
    this.radius = 0.5;

    this.grounded = true;
    this.rolling = false;
    this.running = false;
    this.panic = false;
    this.enabled = false; // off during intro / endgame

    this._coyote = 0;
    this._jumpBuffer = 0;
    this._rollT = 0;
    this._rollCooldown = 0;
    this._rollDir = new THREE.Vector3();

    this.touchDir = new THREE.Vector3();
    this.touchRun = false;

    this.keys = {};
    this._onKeyDown = (e) => {
      const k = e.code;
      if (this.keys[k]) return;
      this.keys[k] = true;
      if (k === 'Space') { this._jumpBuffer = JUMP_BUFFER; e.preventDefault(); }
      if (k.startsWith('Arrow')) e.preventDefault();
      if ((k === 'ShiftLeft' || k === 'ShiftRight') && this.enabled) this._tryRoll();
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  get inputDir() {
    const d = new THREE.Vector3(
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0),
      0,
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) -
      (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0)
    );
    if (d.lengthSq() > 0) return d.normalize();
    if (this.touchDir.lengthSq() > 0.04) return this.touchDir.clone().normalize();
    return d;
  }

  // virtual joystick: x right, z down-screen (toward camera)
  setTouchMove(x, z) { this.touchDir.set(x, 0, z); }
  queueJump() { this._jumpBuffer = JUMP_BUFFER; }
  tryRoll() { if (this.enabled) this._tryRoll(); }

  _tryRoll() {
    if (this.rolling || this._rollCooldown > 0 || !this.grounded) return;
    const dir = this.inputDir;
    const h = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    if (dir.lengthSq() > 0) this._rollDir.copy(dir);
    else if (h.lengthSq() > 0.2) this._rollDir.copy(h).normalize();
    else return; // can't roll from a standstill
    this.rolling = true;
    this._rollT = ROLL_DURATION;
    this._rollCooldown = ROLL_COOLDOWN + ROLL_DURATION;
  }

  applyKnockback(dir) {
    // ~1.5 units of travel before friction eats it
    this.velocity.x = dir.x * 7.5;
    this.velocity.z = dir.z * 7.5;
    this.velocity.y = 3.2;
    this.grounded = false;
    this.rolling = false;
    this._rollT = 0;
  }

  inButter() {
    const b = this.kitchen.butterZone;
    return Math.abs(this.position.x - b.x) < b.half && Math.abs(this.position.z - b.z) < b.half;
  }

  inActiveSteam() {
    for (const v of this.kitchen.steamVents) {
      if (v.active && this.position.distanceTo(v.pos) < v.radius) return true;
    }
    return false;
  }

  update(dt) {
    this._coyote = this.grounded ? COYOTE_TIME : Math.max(0, this._coyote - dt);
    this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);
    this._rollCooldown = Math.max(0, this._rollCooldown - dt);

    const butter = this.inButter();
    const steamed = this.inActiveSteam();

    // ── horizontal movement ──
    const dir = this.enabled ? this.inputDir : new THREE.Vector3();
    this.running = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchRun;

    let targetSpeed = this.panic ? PANIC_SPEED : (this.running ? RUN_SPEED : WALK_SPEED);
    if (steamed) targetSpeed *= 0.5;

    if (this.rolling) {
      this._rollT -= dt;
      if (this._rollT <= 0) this.rolling = false;
      const rollSpeed = steamed ? ROLL_SPEED * 0.5 : ROLL_SPEED;
      this.velocity.x = this._rollDir.x * rollSpeed;
      this.velocity.z = this._rollDir.z * rollSpeed;
    } else {
      // butter slick: barely any grip, momentum carries you
      const accel = butter ? 4 : (this.grounded ? 42 : 16);
      const friction = butter ? 0.6 : (this.grounded ? 14 : 1.5);

      if (dir.lengthSq() > 0) {
        this.velocity.x += dir.x * accel * dt;
        this.velocity.z += dir.z * accel * dt;
        const h = Math.hypot(this.velocity.x, this.velocity.z);
        if (h > targetSpeed && !butter) {
          this.velocity.x *= targetSpeed / h;
          this.velocity.z *= targetSpeed / h;
        }
      } else {
        const damp = Math.max(0, 1 - friction * dt);
        this.velocity.x *= damp;
        this.velocity.z *= damp;
      }
    }

    // ── jump (with input buffer + coyote time) ──
    if (this._jumpBuffer > 0 && (this.grounded || this._coyote > 0) && this.enabled) {
      this.velocity.y = JUMP_FORCE;
      this.grounded = false;
      this._coyote = 0;
      this._jumpBuffer = 0;
      this.justJumped = true;
    } else {
      this.justJumped = false;
    }

    // ── gravity ──
    this.velocity.y += GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    // ground plane
    if (this.position.y <= 0) {
      this.position.y = 0;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this._resolveCollisions();
  }

  _resolveCollisions() {
    const p = this.position;
    // walls
    const b = this.kitchen.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);

    // obstacle push-out (skip low ones we've jumped over)
    for (const o of this.kitchen.obstacles) {
      if (p.y > o.h - 0.05) continue;
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const minDist = o.r + this.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = (minDist - dist) / dist;
        p.x += dx * push;
        p.z += dz * push;
        // kill velocity into the obstacle
        const nx = dx / dist, nz = dz / dist;
        const into = this.velocity.x * nx + this.velocity.z * nz;
        if (into < 0) {
          this.velocity.x -= into * nx;
          this.velocity.z -= into * nz;
        }
      }
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
