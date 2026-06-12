import * as THREE from 'three';
import gsap from 'gsap';
import { Kitchen } from './Kitchen.js';
import { Lighting, setupShadows } from './Lighting.js';
import { Potato } from './Potato.js';
import { Physics } from './Physics.js';
import { OvenEnemy } from './OvenEnemy.js';
import { SpiceRain } from './SpiceRain.js';
import { Kids } from './Kids.js';
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
const spiceRain = new SpiceRain(scene, kitchen);
const kids = new Kids(scene, kitchen);
const gameCam = new GameCamera(window.innerWidth / window.innerHeight);
const postfx = new PostFX(renderer, scene, gameCam.camera);
const hud = new HUD();

// level 4 starfield
const stars = (() => {
  const count = 600;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(50 + Math.random() * 15);
    if (v.y < 1) v.y = 1 + Math.random() * 30; // keep them in the sky
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xcfe0ff, size: 0.3, sizeAttenuation: true, fog: false,
    transparent: true, opacity: 0.9, depthWrite: false,
  }));
  points.visible = false;
  scene.add(points);
  return points;
})();

// touch devices get a virtual joystick + jump/roll buttons
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  hud.initTouch({
    onMove: (x, z) => physics.setTouchMove(x, z),
    onJump: () => physics.queueJump(),
    onRollTap: () => physics.tryRoll(),
    onRunHold: (held) => { physics.touchRun = held; },
  });
}

// ── levels ──
// 1 ניחוח — oven chase | 2 קרש גלישה — olive oil + spice rain
// 3 מסיבת ילדים — hungry kids | 4 חלל — zero-g oven finale
const LEVELS = {
  1: { name: 'SIZZLE', exitDelay: 18 },
  2: { name: 'SLICK RIDE', exitDelay: 35 },
  3: { name: 'PARTY SNACK', exitDelay: 35 },
  4: { name: 'ZERO-G', exitDelay: 25 },
};
const FINAL_LEVEL = 4;

// ── game state ──
let state = 'intro'; // intro | playing | win | lose
let health = 3;
let level = 1;
let levelClock = 0; // seconds inside the current level (gates the exit)
let invuln = 0;
let timeScale = 1;
let levelTime = 0;  // total run time, shown on the clock and end screens
let elapsed = 0;

// each level hides the exit in a different random corner
let lastExitSpot = -1;
function placeExit() {
  const spots = kitchen.exitSpots;
  let i;
  do { i = (Math.random() * spots.length) | 0; } while (i === lastExitSpot);
  lastExitSpot = i;
  kitchen.setExitPosition(spots[i][0], spots[i][1]);
  lighting.exitLight.position.set(spots[i][0], 2.4, spots[i][1]);
}

function startLevel(n) {
  level = n;
  levelClock = 0;
  hud.hideEnd();

  // one strip of skin grows back between escapes
  health = Math.min(3, health + 1);
  hud.setHealth(health);

  // reset the spud
  physics.position.set(0, 0, 4.5);
  physics.velocity.set(0, 0, 0);
  potato.group.position.copy(physics.position);
  potato.group.scale.set(1, 1, 1);
  invuln = 2;

  // baseline config
  physics.gravityScale = 1;
  physics.oilEverywhere = false;
  potato.space = false;
  kitchen.setOil(false);
  kitchen.setParty(false);
  stars.visible = false;
  spiceRain.setActive(false);
  kids.setActive(false);
  oven.setActive(false);
  oven.clearRage();
  hud.setRage(false);

  if (n === 1) {
    oven.setActive(true);
    oven.reset(1);
  } else if (n === 2) {
    physics.oilEverywhere = true;
    kitchen.setOil(true);
    spiceRain.setActive(true);
  } else if (n === 3) {
    kitchen.setParty(true);
    kids.setActive(true);
  } else if (n === 4) {
    physics.gravityScale = 0.15;
    potato.space = true;
    stars.visible = true;
    oven.setActive(true);
    oven.reset(1);
    oven.roundBoost = 0.12; // the finale oven means it
  }
  if (health === 1 && oven.active) {
    oven.setRage();
    hud.setRage(true);
  }

  // exit always starts locked and nearly invisible, in a fresh spot
  placeExit();
  kitchen.setExitActive(false);
  lighting.exitOn = false;

  state = 'playing';
  physics.enabled = true;
  hud.showLevelBanner(n, LEVELS[n].name);
}

potato.group.position.copy(physics.position);
gameCam.playIntro(physics.position, () => {
  health = 2; // startLevel tops it back up to 3
  startLevel(1);
});

// ── damage (shared by oven, kids and falling spice) ──
function damagePlayer(dir, contact) {
  if (state !== 'playing' || invuln > 0) return;
  health -= 1;
  invuln = 1.5;

  physics.applyKnockback(dir);
  potato.hit();
  gameCam.shake();
  postfx.damageSpike();
  oven.sparkBurst(contact, 200);
  hud.loseStrip(health);

  if (health === 1 && oven.active) {
    oven.setRage();
    hud.setRage(true);
  }
  if (health <= 0) startLose();
}

const _tmp = new THREE.Vector3();
function checkOvenHit() {
  if (!oven.active || oven.phase === 'dormant') return;
  const dx = physics.position.x - oven.group.position.x;
  const dz = physics.position.z - oven.group.position.z;
  if (Math.hypot(dx, dz) > oven.radius + physics.radius) return;
  const dir = _tmp.set(dx, 0, dz).normalize();
  const contact = potato.group.position.clone().setY(1).addScaledVector(dir, -0.4);
  damagePlayer(dir, contact);
}

// ── win: next level, or the actual ending ──
function startWin() {
  state = 'win';
  physics.enabled = false;
  physics.velocity.set(0, physics.velocity.y, 0);
  oven.recoilT = 999; // the oven gives up. for now.
  hud.setRage(false);
  hud.setPanic(false, 0);
  hud.setDangerArrow(0, 99);

  const final = level >= FINAL_LEVEL;
  // slow-motion 0.5s, then the verdict
  timeScale = 0.25;
  gsap.delayedCall(0.5, () => {
    timeScale = 1;
    hud.showWin(final, levelTime);
  });
  if (!final) {
    gsap.delayedCall(3.4, () => startLevel(level + 1));
  }
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
  const tl = gsap.timeline();

  if (oven.active) {
    // the oven door opens, the potato slides in
    oven.openDoor();
    const yaw = oven.group.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const doorFront = oven.group.position.clone().addScaledVector(fwd, 2.6).setY(0.2);
    const inside = oven.group.position.clone().addScaledVector(fwd, 0.6).setY(1.6);
    tl.to(potato.group.position, {
      x: doorFront.x, y: doorFront.y, z: doorFront.z, duration: 1.1, ease: 'power1.in', delay: 0.5,
    });
    tl.to(potato.group.position, {
      x: inside.x, y: inside.y, z: inside.z, duration: 0.9, ease: 'power2.in',
    });
    tl.to(potato.group.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.25 }, '-=0.15');
  } else {
    // squashed flat by spice / grabbed by kids — flatten and spin out
    tl.to(potato.group.rotation, { y: '+=9', duration: 1.6, ease: 'power1.out', delay: 0.4 });
    tl.to(potato.group.scale, { x: 1.5, y: 0.06, z: 1.5, duration: 0.7, ease: 'power2.in' }, '<');
  }
  tl.call(() => {
    timeScale = 1;
    hud.showLose(levelTime, level);
  });
}

// ── danger arrow: screen-space angle from potato to nearest threat ──
const _pPos = new THREE.Vector3();
const _oPos = new THREE.Vector3();
function threatInfo() {
  let dist = Infinity;
  let pos = null;
  if (oven.active && oven.phase !== 'dormant') {
    dist = Math.hypot(physics.position.x - oven.group.position.x, physics.position.z - oven.group.position.z);
    pos = oven.group.position;
  }
  if (kids.active) {
    for (const kid of kids.kids) {
      const d = Math.hypot(physics.position.x - kid.group.position.x, physics.position.z - kid.group.position.z);
      if (d < dist) { dist = d; pos = kid.group.position; }
    }
  }
  return { dist, pos };
}

function arrowAngleTo(targetPos) {
  _pPos.copy(potato.group.position).setY(1).project(gameCam.camera);
  _oPos.copy(targetPos).setY(1).project(gameCam.camera);
  return Math.atan2(_oPos.x - _pPos.x, _oPos.y - _pPos.y); // 0 = up, CW positive
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
  if (state === 'playing') {
    levelTime += rawDt;
    levelClock += rawDt;
  }

  const threat = threatInfo();

  // the closer the danger, the faster the fear (panic boost)
  const panic = state === 'playing' && threat.dist < 6;
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
    kids.update(dt, elapsed, potato.group.position);
    spiceRain.update(dt, elapsed, physics.position, physics.velocity, damagePlayer);
  }
  lighting.update(dt, elapsed, oven.group.position, oven.pulse ?? 0.5, oven.rage);
  gameCam.update(rawDt, potato.group.position, threat.dist);

  // gameplay checks
  if (state === 'playing') {
    checkOvenHit();
    const grab = kids.checkHit(physics.position, physics.radius);
    if (grab) damagePlayer(grab.dir, grab.contact);

    // exit gate
    if (!kitchen.exitActive && levelClock >= LEVELS[level].exitDelay) {
      kitchen.setExitActive(true);
      lighting.exitOn = true;
      hud.flashBanner('EXIT OPEN', true);
    }
    if (kitchen.exitActive) {
      const exitDist = Math.hypot(
        physics.position.x - kitchen.exitPos.x,
        physics.position.z - kitchen.exitPos.z
      );
      if (exitDist < kitchen.exitRadius) startWin();
    }
  }

  // HUD
  if (state === 'playing') {
    hud.setPanic(panic, Math.min(1, (6 - threat.dist) / 4));
    if (threat.pos) hud.setDangerArrow(arrowAngleTo(threat.pos), threat.dist);
    else hud.setDangerArrow(0, 99);
    hud.updateClock(levelTime);
  }

  postfx.update(rawDt);
  postfx.render(rawDt);
}

tick();

// debug/test handle
window.__spud = {
  physics, oven, potato, kitchen, kids, spiceRain,
  get state() { return state; },
  get level() { return level; },
  get health() { return health; },
  openExit: () => kitchen.setExitActive(true),
  forceWin: () => { kitchen.setExitActive(true); physics.position.copy(kitchen.exitPos); },
  forceHit: () => { invuln = 0; damagePlayer(new THREE.Vector3(0, 0, 1), potato.group.position.clone().setY(1)); },
  setLevel: (n) => startLevel(n),
};

// ── resize ──
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  gameCam.resize(w / h);
  postfx.resize(w, h);
});
