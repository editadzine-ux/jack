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

    // controls hint
    this.hint = el('div', { id: 'controls-hint' });
    this.hint.innerHTML = 'WASD / ARROWS MOVE &middot; SPACE JUMP &middot; SHIFT ROLL<br>' +
      '‏WASD / חצים — תנועה &middot; רווח — קפיצה &middot; SHIFT — גלגול';
    this.root.appendChild(this.hint);
    setTimeout(() => { this.hint.style.opacity = '0'; }, 12000);

    this._buildClock();

    // end screen
    this.endEl = el('div', { id: 'endscreen' });
    this.root.appendChild(this.endEl);
  }

  /**
   * Virtual joystick + jump/roll buttons for touch devices.
   * handlers: { onMove(x, z), onJump(), onRollTap(), onRunHold(held) }
   */
  initTouch(handlers) {
    this.root.classList.add('touch');
    const wrap = el('div', { id: 'touch' });

    const base = el('div', { id: 'joy-base' });
    const knob = el('div', { id: 'joy-knob' });
    base.appendChild(knob);
    wrap.appendChild(base);

    let joyId = null;
    const setKnob = (x, y) => {
      knob.style.transform = `translate(${x}px, ${y}px)`;
    };
    const handleJoy = (e) => {
      const r = base.getBoundingClientRect();
      const half = r.width / 2;
      let dx = (e.clientX - (r.left + half)) / half;
      let dy = (e.clientY - (r.top + half)) / half;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      setKnob(dx * half * 0.65, dy * half * 0.65);
      handlers.onMove(dx, dy); // screen down = toward camera = +z
    };
    base.addEventListener('pointerdown', (e) => {
      joyId = e.pointerId;
      base.setPointerCapture(e.pointerId);
      handleJoy(e);
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) handleJoy(e); });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      setKnob(0, 0);
      handlers.onMove(0, 0);
    };
    base.addEventListener('pointerup', endJoy);
    base.addEventListener('pointercancel', endJoy);

    const jump = el('button', { id: 'btn-jump', class: 'touch-btn' });
    jump.textContent = 'JUMP';
    jump.addEventListener('pointerdown', (e) => { e.preventDefault(); handlers.onJump(); });
    wrap.appendChild(jump);

    // tap = roll, keep holding = run
    const roll = el('button', { id: 'btn-roll', class: 'touch-btn' });
    roll.textContent = 'ROLL';
    roll.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handlers.onRollTap();
      handlers.onRunHold(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      roll.addEventListener(ev, () => handlers.onRunHold(false));
    }
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

  /** elapsed: level seconds — hands tick (discrete seconds), no smooth sweep. */
  updateClock(elapsed) {
    const s = Math.floor(elapsed);
    this.secondHand.setAttribute('transform', `rotate(${(s % 60) * 6} 38 38)`);
    this.minuteHand.setAttribute('transform', `rotate(${Math.floor(s / 60) * 6} 38 38)`);
  }

  showWin() {
    this.endEl.innerHTML = '';
    const title = el('div', { class: 'end-title' });
    title.textContent = 'ESCAPED.';
    const sub = el('div', { class: 'end-sub' });
    sub.textContent = 'For now.';
    this.endEl.append(title, sub);
    requestAnimationFrame(() => this.endEl.classList.add('shown'));
  }

  showLose(elapsedSeconds) {
    this.endEl.innerHTML = '';
    const title = el('div', { class: 'end-title' });
    title.textContent = 'COOKED.';
    const m = Math.floor(elapsedSeconds / 60);
    const s = Math.floor(elapsedSeconds % 60).toString().padStart(2, '0');
    const sub = el('div', { class: 'end-sub' });
    sub.textContent = `(${m}:${s})`;
    const btn = el('button', { id: 'restart-btn' });
    btn.textContent = 'RUN AGAIN';
    btn.addEventListener('click', () => location.reload());
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
