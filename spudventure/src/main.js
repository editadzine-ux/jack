import * as THREE from 'three';
import gsap from 'gsap';
import { Kitchen } from './Kitchen.js';
import { Lighting, setupShadows } from './Lighting.js';
import { Potato } from './Potato.js';
import { Physics } from './Physics.js';
import { OvenEnemy } from './OvenEnemy.js';
import { GameCamera } from './Camera.js';
import { PostFX } from './PostFX.js';
import { HUD } from './HUD.js';

// ── renderer ──
const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
setupShadows(renderer);
document.getElementById('app').appendChild(renderer.domElement);

// ── scene ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0604);
scene.fog = new THREE.FogExp2(0x0a0604, 0.011);

const OVEN_START = new THREE.Vector3(0, 0, -8.6);

const kitchen = new Kitchen(scene);
const lighting = new Lighting(scene, OVEN_START, kitchen.exitPos);
const potato = new Potato(scene);
const physics = new Physics(kitchen);
const oven = new OvenEnemy(scene, OVEN_START);
const gameCam = new GameCamera(window.innerWidth / window.innerHeight);
const postfx = new PostFX(renderer, scene, gameCam.camera);
const hud = new HUD();

// touch devices get a virtual joystick + jump/roll buttons
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  hud.initTouch({
    onMove: (x, z) => physics.setTouchMove(x, z),
    onJump: () => physics.queueJump(),
    onRollTap: () => physics.tryRoll(),
    onRunHold: (held) => { physics.touchRun = held; },
  });
}

// ── game state ──
let state = 'intro'; // intro | playing | win | lose
let health = 3;
let round = 1;
let invuln = 0;
let timeScale = 1;
let levelTime = 0;
let elapsed = 0;

potato.group.position.copy(physics.position);
gameCam.playIntro(physics.position, () => {
  state = 'playing';
  physics.enabled = true;
});

// ── hit handling ──
const _tmp = new THREE.Vector3();
function checkOvenHit() {
  if (state !== 'playing' || oven.phase === 'dormant' || invuln > 0) return;
  const dx = physics.position.x - oven.group.position.x;
  const dz = physics.position.z - oven.group.position.z;
  if (Math.hypot(dx, dz) > oven.radius + physics.radius) return;

  health -= 1;
  invuln = 1.5;
  const dir = _tmp.set(dx, 0, dz).normalize();
  const contact = potato.group.position.clone().setY(1).addScaledVector(dir, -0.4);

  physics.applyKnockback(dir);
  potato.hit();
  gameCam.shake();
  postfx.damageSpike();
  oven.sparkBurst(contact, 200);
  hud.loseStrip(health);

  if (health === 1) {
    oven.setRage();
    hud.setRage(true);
  }
  if (health <= 0) startLose();
}

// ── win: a breath of glory, then the next round ──
function startWin() {
  state = 'win';
  physics.enabled = false;
  physics.velocity.set(0, physics.velocity.y, 0);
  oven.recoilT = 999; // the oven gives up. for now.
  hud.setRage(false);
  hud.setPanic(false, 0);
  hud.setDangerArrow(0, 99);

  // slow-motion 0.5s, then the verdict
  timeScale = 0.25;
  gsap.delayedCall(0.5, () => {
    timeScale = 1;
    hud.showWin();
  });
  gsap.delayedCall(3.4, () => {
    round += 1;
    startRound();
  });
}

// ── next round: same kitchen, angrier oven ──
function startRound() {
  hud.hideEnd();

  // one strip of skin grows back between escapes
  health = Math.min(3, health + 1);
  hud.setHealth(health);
  if (health > 1) {
    oven.clearRage();
    hud.setRage(false);
  }

  oven.reset(round);
  physics.position.set(0, 0, 4.5);
  physics.velocity.set(0, 0, 0);
  potato.group.position.copy(physics.position);
  invuln = 2;

  state = 'playing';
  physics.enabled = true;
  hud.showRoundBanner(round);
}

// ── lose ──
function startLose() {
  state = 'lose';
  physics.enabled = false;
  physics.velocity.set(0, 0, 0);
  oven.recoilT = 999;
  hud.setRage(false);
  hud.setPanic(false, 0);
  hud.setDangerArrow(0, 99);

  timeScale = 0.3;
  oven.openDoor();

  // the potato slides in, in slow motion
  const yaw = oven.group.rotation.y;
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const doorFront = oven.group.position.clone().addScaledVector(fwd, 2.6).setY(0.2);
  const inside = oven.group.position.clone().addScaledVector(fwd, 0.6).setY(1.6);

  const tl = gsap.timeline();
  tl.to(potato.group.position, {
    x: doorFront.x, y: doorFront.y, z: doorFront.z, duration: 1.1, ease: 'power1.in', delay: 0.5,
  });
  tl.to(potato.group.position, {
    x: inside.x, y: inside.y, z: inside.z, duration: 0.9, ease: 'power2.in',
  });
  tl.to(potato.group.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.25 }, '-=0.15');
  tl.call(() => {
    timeScale = 1;
    hud.showLose(levelTime, round);
  });
}

// ── danger arrow: screen-space angle from potato to oven ──
const _pPos = new THREE.Vector3();
const _oPos = new THREE.Vector3();
function dangerArrowAngle() {
  _pPos.copy(potato.group.position).setY(1).project(gameCam.camera);
  _oPos.copy(oven.group.position).setY(1).project(gameCam.camera);
  const dx = _oPos.x - _pPos.x;
  const dy = _oPos.y - _pPos.y;
  return Math.atan2(dx, dy); // 0 = up, clockwise positive (matches CSS rotate)
}

// ── main loop ──
let lastT = performance.now();

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const rawDt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  const dt = rawDt * timeScale;
  elapsed += dt;
  if (state === 'playing') levelTime += rawDt;

  const ovenDist = Math.hypot(
    physics.position.x - oven.group.position.x,
    physics.position.z - oven.group.position.z
  );

  // panic when the oven is breathing down your skin
  const panic = state === 'playing' && oven.phase !== 'dormant' && ovenDist < 6;
  physics.panic = panic;
  potato.setPanic(panic);

  if (state === 'intro' || state === 'playing') {
    physics.update(dt);
    potato.group.position.copy(physics.position);
    if (physics.justJumped) potato.onJump();
  }
  invuln = Math.max(0, invuln - dt);

  kitchen.update(dt, elapsed);
  potato.update(dt, physics);
  if (state !== 'intro') {
    oven.update(dt, elapsed, potato.group.position, kitchen);
  }
  lighting.update(dt, elapsed, oven.group.position, oven.pulse ?? 0.5, oven.rage);
  gameCam.update(rawDt, potato.group.position, ovenDist);

  // gameplay checks
  checkOvenHit();
  if (state === 'playing') {
    const exitDist = Math.hypot(
      physics.position.x - kitchen.exitPos.x,
      physics.position.z - kitchen.exitPos.z
    );
    if (exitDist < kitchen.exitRadius) startWin();
  }

  // HUD
  if (state === 'playing') {
    hud.setPanic(panic, Math.min(1, (6 - ovenDist) / 4));
    hud.setDangerArrow(dangerArrowAngle(), oven.phase === 'dormant' ? 99 : ovenDist);
    hud.updateClock(levelTime);
  }

  postfx.update(rawDt);
  postfx.render(rawDt);
}

tick();

// debug/test handle
window.__spud = {
  physics, oven, potato, kitchen,
  get state() { return state; },
  get round() { return round; },
  get health() { return health; },
  forceWin: () => { physics.position.copy(kitchen.exitPos); },
  forceHit: () => { invuln = 0; oven.group.position.copy(physics.position); },
};

// ── resize ──
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  gameCam.resize(w / h);
  postfx.resize(w, h);
});
