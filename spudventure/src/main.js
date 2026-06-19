import * as THREE from 'three';
import gsap from 'gsap';
import { Kitchen } from './Kitchen.js';
import { Lighting, setupShadows } from './Lighting.js';
import { Potato } from './Potato.js';
import { Physics } from './Physics.js';
import { OvenEnemy } from './OvenEnemy.js';
import { SpiceRain } from './SpiceRain.js';
import { Kids } from './Kids.js';
import { TableLevel } from './TableLevel.js';
import { FridgeLevel } from './FridgeLevel.js';
import { OvenInteriorLevel } from './OvenInteriorLevel.js';
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
const table = new TableLevel(scene);
const fridge = new FridgeLevel(scene);
const ovenInterior = new OvenInteriorLevel(scene);
const gameCam = new GameCamera(window.innerWidth / window.innerHeight);
const postfx = new PostFX(renderer, scene, gameCam.camera);
const hud = new HUD();

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (IS_TOUCH) {
  hud.initTouch({
    onMove: (x, z) => physics.setTouchMove(x, z),
    onJump: () => physics.queueJump(),
    onRollTap: () => physics.tryRoll(),
    onRunHold: (held) => { physics.touchRun = held; },
  });
}

// ── levels ──
// 1 ניחוח · 2 קרש גלישה · 3 מסיבת ילדים · 4 שולחן האוכל · 5 המקרר · 6 פנים התנור
const LEVELS = {
  1: { name: 'KITCHEN', arena: kitchen, exitDelay: 16 },
  2: { name: 'OIL SLICK', arena: kitchen, exitDelay: 32 },
  3: { name: 'KIDS PARTY', arena: kitchen, exitDelay: 32 },
  4: { name: 'DINNER TABLE', arena: table, exitDelay: 24 },
  5: { name: 'THE FRIDGE', arena: fridge, exitDelay: 26, winByFall: true },
  6: { name: 'INSIDE THE OVEN', arena: ovenInterior, exitDelay: 0, cyclicExit: true },
};
const FINAL_LEVEL = 6;

// ── game state ──
let state = 'menu'; // menu | intro | playing | win | lose
let health = 3;
let level = 1;
let levelClock = 0;
let invuln = 0;
let timeScale = 1;
let levelTime = 0;
let elapsed = 0;
let currentArena = kitchen;
let exitOpenedOnce = false;
let advanceCall = null; // pending "next level" timer after a win

// each level hides the exit in a different random spot
let lastExitSpot = -1;
function placeExit(arena) {
  const spots = arena.exitSpots;
  let i;
  do { i = (Math.random() * spots.length) | 0; } while (spots.length > 1 && i === lastExitSpot);
  lastExitSpot = i;
  arena.setExitPosition(spots[i][0], spots[i][1]);
  lighting.exitLight.position.set(arena.exitPos.x, 2.4, arena.exitPos.z);
}

function startLevel(n) {
  n = Math.min(FINAL_LEVEL, Math.max(1, n));
  if (advanceCall) { advanceCall.kill(); advanceCall = null; }
  level = n;
  levelClock = 0;
  exitOpenedOnce = false;
  hud.hideEnd();
  gsap.killTweensOf(potato.group.position);
  gsap.killTweensOf(potato.group.scale);
  gsap.killTweensOf(potato.group.rotation);

  // one strip of skin grows back between escapes
  health = Math.min(3, health + 1);
  hud.setHealth(health);

  // reset the spud (spawn point depends on the arena, set just below)
  physics.velocity.set(0, 0, 0);
  potato.group.scale.set(1, 1, 1);
  potato.group.rotation.set(0, 0, 0);
  potato.rollPivot.rotation.set(0, 0, 0);
  potato.bodyGroup.rotation.set(0, 0, 0);
  potato.facing = 0;
  invuln = 2;

  // baseline config
  physics.gravityScale = 1;
  physics.oilEverywhere = false;
  physics.externalForce.set(0, 0, 0);
  potato.space = false;
  kitchen.setOil(false);
  kitchen.setParty(false);
  spiceRain.setActive(false);
  kids.setActive(false);
  oven.setActive(false);
  oven.clearRage();
  hud.setRage(false);
  hud.setDoorStatus(null);

  // pick & show the arena, hide the others
  const cfg = LEVELS[n];
  currentArena = cfg.arena;
  physics.env = currentArena;

  // spawn at the arena's safe start point
  const sp = currentArena.spawn || { x: 0, z: 5 };
  physics.position.set(sp.x, 0, sp.z);
  potato.group.position.copy(physics.position);

  kitchen.group.visible = (currentArena === kitchen);
  table.setActive(currentArena === table);
  fridge.setActive(currentArena === fridge);
  ovenInterior.setActive(currentArena === ovenInterior);

  // per-arena atmosphere
  if (currentArena === table) {
    lighting.setMood('table'); scene.background.setHex(0x0a0604); scene.fog.density = 0.012;
  } else if (currentArena === fridge) {
    lighting.setMood('fridge'); scene.background.setHex(0x0a141c); scene.fog.density = 0.01;
  } else if (currentArena === ovenInterior) {
    lighting.setMood('ovenInterior'); scene.background.setHex(0x100402); scene.fog.density = 0.022;
  } else {
    lighting.setMood('kitchen'); scene.background.setHex(0x0a0604); scene.fog.density = 0.011;
  }

  // per-level hazards
  if (n === 1) {
    oven.setActive(true); oven.reset(1);
  } else if (n === 2) {
    physics.oilEverywhere = true; kitchen.setOil(true); spiceRain.setActive(true);
  } else if (n === 3) {
    kitchen.setParty(true); kids.setActive(true);
  } else if (n === 5) {
    physics.oilEverywhere = true; // frost is slippery too
  }
  if (health === 1 && oven.active) { oven.setRage(); hud.setRage(true); }

  // exit starts locked & nearly invisible, fresh spot
  placeExit(currentArena);
  currentArena.setExitActive(false);
  lighting.exitOn = false;

  state = 'playing';
  physics.enabled = true;
  hud.setLevelIndicator(n);
  hud.setPauseButtonVisible(true);
  hud.showLevelBanner(n, cfg.name);
  if (cfg.cyclicExit) {
    // tell the player exactly what to do in the oven
    gsap.delayedCall(2.0, () => { if (state === 'playing' && level === n) hud.flashBanner('WAIT FOR THE GREEN DOOR', true); });
  }
}

// ── pause + restart system (level tracked in memory only) ──
let paused = false;

function togglePause() {
  if (state !== 'playing') return; // only while actually in a level
  paused = !paused;
  if (paused) {
    timeScale = 0;
    hud.showPause(resumeGame, restartFromLevel1);
  } else {
    timeScale = 1;
    hud.hidePause();
  }
}
function resumeGame() {
  paused = false;
  timeScale = 1;
  hud.hidePause();
}
// "Restart" ALWAYS returns to Level 1 with a full state reset
function restartFromLevel1() {
  paused = false;
  hud.hidePause();
  gsap.killTweensOf(potato.group.position);
  gsap.killTweensOf(potato.group.scale);
  gsap.killTweensOf(potato.group.rotation);
  timeScale = 1;
  health = 2;        // startLevel tops it back up to 3
  lastExitSpot = -1; // forget previous exit placement
  startLevel(1);
}
hud.onPauseButton(togglePause);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { togglePause(); e.preventDefault(); }
});

// ── boot: fresh page load always starts clean at the start screen ──
potato.group.position.copy(physics.position);
function beginRun() {
  state = 'intro';
  gameCam.playIntro(physics.position, () => {
    health = 2;        // startLevel tops it back up to 3
    startLevel(1);     // every run begins at Level 1
  });
}
hud.showStart(IS_TOUCH, beginRun);

// ── damage (shared by every hazard) ──
function damagePlayer(dir, contact) {
  if (state !== 'playing' || invuln > 0) return;
  health -= 1;
  invuln = 1.5;

  physics.applyKnockback(dir);
  potato.hit();
  gameCam.shake();
  postfx.damageSpike();
  oven.sparkBurst(contact, 200); // sparks fly regardless of which hazard
  hud.loseStrip(health);

  if (health === 1 && oven.active) { oven.setRage(); hud.setRage(true); }
  if (health <= 0) startLose(oven.active ? 'oven' : 'squash');
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

// ── win ──
function startWin(byFall = false) {
  state = 'win';
  physics.enabled = false;
  oven.recoilT = 999;
  hud.setRage(false);
  hud.setPanic(false, 0);
  hud.setDangerArrow(0, 99);
  hud.setDoorStatus(null);
  hud.setPauseButtonVisible(false);

  const final = level >= FINAL_LEVEL;
  if (byFall) {
    // drop into the fridge drawer
    physics.velocity.set(0, 0, 0);
    gsap.to(potato.group.position, { y: -3, duration: 0.9, ease: 'power1.in' });
    gsap.to(potato.group.scale, { x: 0.4, y: 0.4, z: 0.4, duration: 0.9 });
  } else {
    physics.velocity.set(0, physics.velocity.y, 0);
  }

  timeScale = 0.25;
  gsap.delayedCall(0.5, () => {
    timeScale = 1;
    hud.showWin(final, levelTime);
  });
  if (!final) {
    const next = level + 1;
    advanceCall = gsap.delayedCall(3.4, () => startLevel(next));
  }
}

// ── lose ──
function startLose(cause = 'squash') {
  state = 'lose';
  physics.enabled = false;
  oven.recoilT = 999;
  hud.setRage(false);
  hud.setPanic(false, 0);
  hud.setDangerArrow(0, 99);
  hud.setDoorStatus(null);
  hud.setPauseButtonVisible(false);

  timeScale = 0.3;
  const tl = gsap.timeline();

  if (cause === 'oven') {
    physics.velocity.set(0, 0, 0);
    oven.openDoor();
    const yaw = oven.group.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const doorFront = oven.group.position.clone().addScaledVector(fwd, 2.6).setY(0.2);
    const inside = oven.group.position.clone().addScaledVector(fwd, 0.6).setY(1.6);
    tl.to(potato.group.position, { x: doorFront.x, y: doorFront.y, z: doorFront.z, duration: 1.1, ease: 'power1.in', delay: 0.5 });
    tl.to(potato.group.position, { x: inside.x, y: inside.y, z: inside.z, duration: 0.9, ease: 'power2.in' });
    tl.to(potato.group.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.25 }, '-=0.15');
  } else if (cause === 'fell') {
    // plummeted off the table
    physics.velocity.set(0, 0, 0);
    tl.to(potato.group.position, { y: -16, duration: 1.4, ease: 'power1.in' });
    tl.to(potato.group.rotation, { x: '+=10', z: '+=6', duration: 1.4, ease: 'none' }, '<');
  } else {
    physics.velocity.set(0, 0, 0);
    tl.to(potato.group.rotation, { y: '+=9', duration: 1.6, ease: 'power1.out', delay: 0.4 });
    tl.to(potato.group.scale, { x: 1.5, y: 0.06, z: 1.5, duration: 0.7, ease: 'power2.in' }, '<');
  }
  tl.call(() => {
    timeScale = 1;
    hud.showLose(levelTime, level, restartFromLevel1);
  });
}

// ── danger arrow: nearest threat across oven, kids and arena hazards ──
const _pPos = new THREE.Vector3();
const _oPos = new THREE.Vector3();
function threatInfo() {
  let dist = Infinity, pos = null;
  const consider = (p) => {
    const d = Math.hypot(physics.position.x - p.x, physics.position.z - p.z);
    if (d < dist) { dist = d; pos = p; }
  };
  if (oven.active && oven.phase !== 'dormant') consider(oven.group.position);
  if (kids.active) for (const kid of kids.kids) consider(kid.group.position);
  if (currentArena.threats) for (const p of currentArena.threats()) consider(p);
  return { dist, pos };
}
function arrowAngleTo(targetPos) {
  _pPos.copy(potato.group.position).setY(1).project(gameCam.camera);
  _oPos.copy(targetPos).setY(1).project(gameCam.camera);
  return Math.atan2(_oPos.x - _pPos.x, _oPos.y - _pPos.y);
}

// ── main loop ──
let lastT = performance.now();

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const rawDt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  // paused: hold the frozen frame, run no simulation
  if (paused) { postfx.render(rawDt); return; }

  const dt = rawDt * timeScale;
  elapsed += dt;
  if (state === 'playing') { levelTime += rawDt; levelClock += rawDt; }

  const threat = threatInfo();
  const panic = state === 'playing' && threat.dist < 6;
  physics.panic = panic;
  potato.setPanic(panic);

  // fridge suction must be applied before the physics step
  if (state === 'playing' && currentArena.applySuction) {
    if (currentArena.applySuction(physics)) startLose('squash');
  }

  if (state === 'intro' || state === 'playing') {
    physics.update(dt);
    potato.group.position.copy(physics.position);
    if (physics.justJumped) potato.onJump();
  }
  invuln = Math.max(0, invuln - dt);

  // arena + entity updates
  if (currentArena === kitchen) {
    kitchen.update(dt, elapsed);
  } else if (state !== 'menu') {
    currentArena.update(dt, elapsed, potato.group.position, physics, damagePlayer);
  }
  potato.update(dt, physics);
  if (state !== 'intro' && state !== 'menu') {
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

    const cfg = LEVELS[level];

    // exit gate
    if (cfg.cyclicExit) {
      // the arena drives exitActive itself (oven door); sync light, arrow & HUD
      lighting.exitLight.position.set(currentArena.exitPos.x, 2.4, currentArena.exitPos.z);
      lighting.exitOn = currentArena.exitActive;
      hud.setDoorStatus(currentArena.doorPhase);
    } else if (!currentArena.exitActive && levelClock >= cfg.exitDelay) {
      currentArena.setExitActive(true);
      lighting.exitOn = true;
      hud.flashBanner('EXIT OPEN', true);
    }

    // fell off / fell in
    if (physics.position.y < -3.5) {
      if (currentArena.checkFallWin && currentArena.checkFallWin(physics.position.x, physics.position.z)) {
        startWin(true);
      } else {
        startLose('fell');
      }
    } else if (currentArena.exitActive && !cfg.winByFall) {
      const exitDist = Math.hypot(physics.position.x - currentArena.exitPos.x, physics.position.z - currentArena.exitPos.z);
      if (exitDist < currentArena.exitRadius) startWin();
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
  physics, oven, potato, kitchen, kids, spiceRain, table, fridge, ovenInterior,
  get state() { return state; },
  get level() { return level; },
  get health() { return health; },
  get arena() { return currentArena; },
  begin: () => beginRun(),
  openExit: () => currentArena.setExitActive(true),
  forceWin: () => {
    if (LEVELS[level].winByFall) { currentArena.setExitActive(true); physics.position.set(currentArena.exitPos.x, 0.1, currentArena.exitPos.z); }
    else { currentArena.setExitActive(true); physics.position.copy(currentArena.exitPos); }
  },
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
