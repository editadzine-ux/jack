const SVG_NS = 'http://www.w3.org/2000/svg';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');

    // health: 3 potato-skin strips
    this.healthEl = el('div', { id: 'health' });
    this.strips = [];
    for (let i = 0; i < 3; i++) {
      const s = el('div', { class: 'skin-strip' });
      this.healthEl.appendChild(s);
      this.strips.push(s);
    }
    this.root.appendChild(this.healthEl);

    // panic meter
    this.panicWrap = el('div', { id: 'panic-wrap' });
    this.panicBar = el('div', { id: 'panic-bar' });
    this.panicWrap.appendChild(this.panicBar);
    this.root.appendChild(this.panicWrap);

    // danger arrow
    this.arrowPivot = el('div', { id: 'arrow-pivot' });
    this.arrow = el('div', { id: 'danger-arrow' });
    this.arrowPivot.appendChild(this.arrow);
    this.root.appendChild(this.arrowPivot);

    // rage overlay
    this.rageEl = el('div', { id: 'rage-overlay' });
    this.root.appendChild(this.rageEl);

    // door status (oven-interior level only)
    this.doorEl = el('div', { id: 'door-status' });
    this.doorEl.style.display = 'none';
    this.root.appendChild(this.doorEl);

    // controls hint
    this.hint = el('div', { id: 'controls-hint' });
    this.hint.innerHTML = 'WASD / ARROWS MOVE &middot; SPACE JUMP &middot; SHIFT ROLL<br>' +
      '‏WASD / חצים — תנועה &middot; רווח — קפיצה &middot; SHIFT — גלגול';
    this.root.appendChild(this.hint);
    setTimeout(() => { this.hint.style.opacity = '0'; }, 12000);

    // build marker so it's easy to tell which version is loaded
    const ver = el('div', { id: 'ver' });
    ver.textContent = 'V10';
    this.root.appendChild(ver);

    // level indicator (top-left corner, under the clock)
    this.levelEl = el('div', { id: 'level-indicator' });
    this.root.appendChild(this.levelEl);

    // pause button — opens the pause menu (ESC also works on desktop)
    this.pauseBtn = el('button', { id: 'pause-btn', type: 'button', title: 'Pause' });
    this.pauseBtn.textContent = '❚❚';
    this.root.appendChild(this.pauseBtn);

    this._buildClock();

    // end screen
    this.endEl = el('div', { id: 'endscreen' });
    this.root.appendChild(this.endEl);

    // pause menu
    this.pauseEl = el('div', { id: 'pausescreen' });
    this.root.appendChild(this.pauseEl);

    // start screen
    this.startEl = el('div', { id: 'startscreen' });
    this.root.appendChild(this.startEl);
  }

  /** Show/update the corner "LEVEL X" indicator (null hides it). */
  setLevelIndicator(n) {
    if (!n) { this.levelEl.classList.remove('shown'); return; }
    this.levelEl.textContent = `LEVEL ${n}`;
    this.levelEl.classList.add('shown');
  }

  /** The pause button (top bar). */
  onPauseButton(fn) {
    this.pauseBtn.addEventListener('click', fn);
  }
  setPauseButtonVisible(v) {
    this.pauseBtn.classList.toggle('shown', v);
  }

  /** Pause menu: Resume + Restart from Level 1. */
  showPause(onResume, onRestart) {
    this.pauseEl.innerHTML = '';
    const title = el('div', { id: 'pause-title' });
    title.textContent = 'PAUSED';
    const resume = el('button', { class: 'menu-btn primary', type: 'button' });
    resume.textContent = 'RESUME';
    resume.addEventListener('click', onResume);
    const restart = el('button', { class: 'menu-btn secondary', type: 'button' });
    restart.textContent = 'RESTART FROM LEVEL 1';
    restart.addEventListener('click', onRestart);
    this.pauseEl.append(title, resume, restart);
    this.pauseEl.classList.add('shown');
  }
  hidePause() {
    this.pauseEl.classList.remove('shown');
  }

  /**
   * Opening menu: title, one-line premise, controls (auto desktop/mobile),
   * how-to-win, and a PLAY button. Fully responsive via clamp() in the CSS.
   */
  showStart(touch, onStart) {
    this.startEl.innerHTML = '';
    const card = el('div', { id: 'start-card' });

    const title = el('div', { id: 'start-title' });
    title.textContent = 'SPUDVENTURE';

    const premise = el('div', { id: 'start-premise' });
    premise.textContent = 'You are a potato. The kitchen wants to cook you. Survive.';

    const controls = el('div', { id: 'start-controls' });
    const head = el('div', { class: 'ctrl-head' });
    head.textContent = touch ? 'TOUCH CONTROLS' : 'CONTROLS';
    controls.appendChild(head);
    const rows = touch
      ? [['Move', ['Joystick · left']], ['Jump', ['JUMP · right']], ['Roll', ['ROLL · right']]]
      : [['Move', ['WASD', 'Arrows']], ['Jump', ['SPACE']], ['Roll', ['SHIFT']]];
    for (const [label, keys] of rows) {
      const row = el('div', { class: 'ctrl-row' });
      const l = el('span', {}); l.textContent = label;
      const k = el('span', { class: 'keys' });
      keys.forEach((key, i) => {
        if (i > 0) { const or = el('span', {}); or.textContent = 'or'; or.style.opacity = '.5'; k.appendChild(or); }
        const kb = el('span', { class: 'key' }); kb.textContent = key; k.appendChild(kb);
      });
      row.append(l, k);
      controls.appendChild(row);
    }

    const howto = el('div', { id: 'start-howto' });
    howto.textContent = 'Reach the glowing exit to clear each level.';

    const btn = el('button', { id: 'start-btn', type: 'button' });
    btn.textContent = 'PLAY';
    const start = () => {
      this.startEl.classList.remove('shown');
      setTimeout(() => { this.startEl.style.display = 'none'; }, 500);
      onStart();
    };
    btn.addEventListener('click', start);

    card.append(title, premise, controls, howto, btn);
    this.startEl.appendChild(card);
    this.startEl.style.display = 'flex';
    requestAnimationFrame(() => this.startEl.classList.add('shown'));
  }

  /**
   * Touch controls: the whole left half of the screen is a dynamic joystick
   * (it appears wherever the finger lands), plus JUMP and ROLL buttons.
   * Uses raw touch events on real touch devices — pointer events are only a
   * fallback — so it works across mobile browsers.
   * handlers: { onMove(x, z), onJump(), onRollTap(), onRunHold(held) }
   */
  initTouch(handlers) {
    this.root.classList.add('touch');
    const wrap = el('div', { id: 'touch' });

    const zone = el('div', { id: 'joy-zone' });
    const base = el('div', { id: 'joy-base' });
    const knob = el('div', { id: 'joy-knob' });
    base.appendChild(knob);
    zone.appendChild(base);
    wrap.appendChild(zone);

    const hint = el('div', { id: 'touch-hint' });
    hint.innerHTML = '‏גררי אצבע כאן כדי לזוז<br>DRAG HERE TO MOVE';
    wrap.appendChild(hint);
    setTimeout(() => { hint.style.opacity = '0'; }, 14000);

    const RADIUS = 55;
    let joyId = null, ox = 0, oy = 0;

    const startJoy = (x, y, id) => {
      joyId = id; ox = x; oy = y;
      base.style.display = 'block';
      base.style.left = `${x}px`;
      base.style.top = `${y}px`;
      knob.style.transform = 'translate(0px, 0px)';
    };
    const moveJoy = (x, y) => {
      let dx = (x - ox) / RADIUS;
      let dy = (y - oy) / RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = `translate(${dx * RADIUS * 0.7}px, ${dy * RADIUS * 0.7}px)`;
      handlers.onMove(dx, dy); // screen down = toward camera = +z
    };
    const endJoy = () => {
      joyId = null;
      base.style.display = 'none';
      handlers.onMove(0, 0);
    };

    const hasTouch = 'ontouchstart' in window;
    if (hasTouch) {
      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (joyId !== null) return;
        const t = e.changedTouches[0];
        startJoy(t.clientX, t.clientY, t.identifier);
      }, { passive: false });
      zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === joyId) moveJoy(t.clientX, t.clientY);
        }
      }, { passive: false });
      const end = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === joyId) endJoy();
        }
      };
      zone.addEventListener('touchend', end);
      zone.addEventListener('touchcancel', end);
    } else {
      zone.addEventListener('pointerdown', (e) => {
        zone.setPointerCapture(e.pointerId);
        startJoy(e.clientX, e.clientY, e.pointerId);
      });
      zone.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e.clientX, e.clientY); });
      const end = (e) => { if (e.pointerId === joyId) endJoy(); };
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', end);
    }

    const bindBtn = (btn, onDown, onUp) => {
      if (hasTouch) {
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
        if (onUp) {
          for (const ev of ['touchend', 'touchcancel']) {
            btn.addEventListener(ev, (e) => { e.preventDefault(); onUp(); }, { passive: false });
          }
        }
      } else {
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
        if (onUp) {
          for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
            btn.addEventListener(ev, () => onUp());
          }
        }
      }
    };

    const jump = el('button', { id: 'btn-jump', class: 'touch-btn', type: 'button' });
    jump.textContent = 'JUMP';
    bindBtn(jump, handlers.onJump);
    wrap.appendChild(jump);

    // tap = roll, keep holding = run
    const roll = el('button', { id: 'btn-roll', class: 'touch-btn', type: 'button' });
    roll.textContent = 'ROLL';
    bindBtn(roll, () => { handlers.onRollTap(); handlers.onRunHold(true); }, () => handlers.onRunHold(false));
    wrap.appendChild(roll);

    this.root.appendChild(wrap);
  }

  _buildClock() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('id', 'clock');
    svg.setAttribute('width', '76');
    svg.setAttribute('height', '76');
    svg.setAttribute('viewBox', '0 0 76 76');

    const face = document.createElementNS(SVG_NS, 'circle');
    setAttrs(face, { cx: 38, cy: 38, r: 35, fill: 'rgba(10,6,4,0.55)', stroke: 'rgba(240,237,232,0.5)', 'stroke-width': 2 });
    svg.appendChild(face);

    // 12 tick marks, no numbers
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = document.createElementNS(SVG_NS, 'line');
      const r1 = i % 3 === 0 ? 28 : 31;
      setAttrs(tick, {
        x1: 38 + Math.sin(a) * r1, y1: 38 - Math.cos(a) * r1,
        x2: 38 + Math.sin(a) * 33, y2: 38 - Math.cos(a) * 33,
        stroke: 'rgba(240,237,232,0.6)', 'stroke-width': i % 3 === 0 ? 2.5 : 1.2,
      });
      svg.appendChild(tick);
    }

    this.minuteHand = document.createElementNS(SVG_NS, 'line');
    setAttrs(this.minuteHand, { x1: 38, y1: 38, x2: 38, y2: 14, stroke: '#f0ede8', 'stroke-width': 2.6, 'stroke-linecap': 'round' });
    svg.appendChild(this.minuteHand);

    this.secondHand = document.createElementNS(SVG_NS, 'line');
    setAttrs(this.secondHand, { x1: 38, y1: 42, x2: 38, y2: 10, stroke: '#ff6a1a', 'stroke-width': 1.4, 'stroke-linecap': 'round' });
    svg.appendChild(this.secondHand);

    const pin = document.createElementNS(SVG_NS, 'circle');
    setAttrs(pin, { cx: 38, cy: 38, r: 2.2, fill: '#f0ede8' });
    svg.appendChild(pin);

    this.root.appendChild(svg);
  }

  loseStrip(remaining) {
    // peel the rightmost intact strip
    const idx = Math.max(0, Math.min(2, remaining));
    this.strips[idx]?.classList.add('peeled');
  }

  /** Sync strips to a health value (used when skin grows back between rounds). */
  setHealth(health) {
    this.strips.forEach((s, i) => s.classList.toggle('peeled', i >= health));
  }

  /** Big short banner flash ("LEVEL 2 · SLICK RIDE", "EXIT OPEN"...). */
  flashBanner(text, green = false) {
    const banner = el('div', { class: green ? 'round-banner green' : 'round-banner' });
    banner.textContent = text;
    this.root.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));
    setTimeout(() => {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 900);
    }, 1900);
  }

  showLevelBanner(n, name) {
    this.flashBanner(`LEVEL ${n} · ${name}`);
  }

  hideEnd() {
    this.endEl.classList.remove('shown');
    this.endEl.innerHTML = '';
  }

  setPanic(visible, level) {
    this.panicWrap.classList.toggle('visible', visible);
    if (visible) this.panicBar.style.width = `${Math.round(level * 100)}%`;
  }

  /** angleRad: screen-space angle toward the oven (0 = up). */
  setDangerArrow(angleRad, ovenDist) {
    const opacity = ovenDist > 12 ? 0 : (12 - ovenDist) / 12;
    this.arrow.style.opacity = opacity.toFixed(2);
    this.arrowPivot.style.transform = `rotate(${angleRad}rad)`;
  }

  setRage(on) { this.rageEl.classList.toggle('active', on); }

  /** phase: 'shut' | 'soon' | 'open' | null (hide). */
  setDoorStatus(phase) {
    if (!phase) { this.doorEl.style.display = 'none'; return; }
    this.doorEl.style.display = 'block';
    this.doorEl.classList.remove('shut', 'soon', 'open');
    this.doorEl.classList.add(phase);
    if (phase === 'shut') this.doorEl.innerHTML = '‏הדלת סגורה · DOOR SHUT';
    else if (phase === 'soon') this.doorEl.innerHTML = '‏מתכוננים… · GET READY';
    else this.doorEl.innerHTML = '‏רוץ לדלת! · GO!';
  }

  /** elapsed: level seconds — hands tick (discrete seconds), no smooth sweep. */
  updateClock(elapsed) {
    const s = Math.floor(elapsed);
    this.secondHand.setAttribute('transform', `rotate(${(s % 60) * 6} 38 38)`);
    this.minuteHand.setAttribute('transform', `rotate(${Math.floor(s / 60) * 6} 38 38)`);
  }

  /** Between levels: "For now." — after level 4: the real ending. */
  showWin(final = false, totalSeconds = 0) {
    this.endEl.innerHTML = '';
    const title = el('div', { class: 'end-title' });
    title.textContent = 'ESCAPED.';
    const sub = el('div', { class: 'end-sub' });
    if (final) {
      const m = Math.floor(totalSeconds / 60);
      const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
      sub.textContent = `For good. (${m}:${s})`;
      const btn = el('button', { id: 'restart-btn' });
      btn.textContent = 'PLAY AGAIN';
      btn.addEventListener('click', () => location.reload()); // clean start screen
      this.endEl.append(title, sub, btn);
      setTimeout(() => btn.classList.add('shown'), 2000);
    } else {
      sub.textContent = 'For now.';
      this.endEl.append(title, sub);
    }
    requestAnimationFrame(() => this.endEl.classList.add('shown'));
  }

  /** Death/fail screen — the button always restarts the whole run at Level 1. */
  showLose(elapsedSeconds, level = 1, onRestart = () => location.reload()) {
    this.endEl.innerHTML = '';
    const title = el('div', { class: 'end-title' });
    title.textContent = 'COOKED.';
    const m = Math.floor(elapsedSeconds / 60);
    const s = Math.floor(elapsedSeconds % 60).toString().padStart(2, '0');
    const sub = el('div', { class: 'end-sub' });
    sub.textContent = level > 1 ? `(${m}:${s} · REACHED LEVEL ${level})` : `(${m}:${s})`;
    const btn = el('button', { id: 'restart-btn' });
    btn.textContent = 'RESTART FROM LEVEL 1';
    btn.addEventListener('click', onRestart);
    this.endEl.append(title, sub, btn);
    requestAnimationFrame(() => this.endEl.classList.add('shown'));
    setTimeout(() => btn.classList.add('shown'), 2000);
  }
}

function el(tag, attrs = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function setAttrs(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
}
