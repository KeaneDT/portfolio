const bases = [[0.22, 0.14], [0.20, 0.91], [0.28, 0.16], [0.08, 0.62]];
const yawLimit = 0.82;
const pitchLimit = 0.45;
const clamp = (value, limit) => Math.min(limit, Math.max(-limit, value));

export function initSculptures({ engine, calm = false }) {
  if (!engine.ok) return { setCalm() {}, setPaused() {}, destroy() {} };

  const rects = new Float32Array(16);
  const poses = new Float32Array(16);
  const slots = Array.from(document.querySelectorAll('[data-sculpture]'), el => ({
    el, model: Number(el.dataset.sculpture),
    visible: false, yaw: 0, pitch: 0, velocity: 0, glide: 0, phase: 0, drag: null,
  })).filter(({ model }) => Number.isInteger(model) && model >= 0 && model < bases.length);
  const listeners = new AbortController();
  const { signal } = listeners;
  let paused = false, ready = false, dirty = true, raf = 0, previous = 0;

  function syncControls() {
    document.documentElement.classList.toggle('sculptures-ready', ready);
    for (const { el } of slots) {
      if (ready) {
        el.setAttribute('role', 'slider');
        el.setAttribute('aria-valuemin', '-47');
        el.setAttribute('aria-valuemax', '47');
        el.setAttribute('aria-disabled', String(calm));
        el.tabIndex = calm ? -1 : 0;
      } else {
        for (const attr of ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-disabled', 'tabindex']) {
          el.removeAttribute(attr);
        }
      }
    }
  }

  function measure() {
    const { cssW: width, cssH: height } = engine;
    for (const slot of slots) {
      const { el, model } = slot;
      const rect = el.getBoundingClientRect();
      const i = model * 4;
      slot.visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 &&
        rect.top < height && rect.right > 0 && rect.left < width;
      rects[i] = (rect.left + rect.width / 2 - width / 2) / height;
      rects[i + 1] = (height / 2 - rect.top - rect.height / 2) / height;
      rects[i + 2] = slot.visible ? rect.width / (2 * height) : 0;
      rects[i + 3] = slot.visible ? rect.height / (2 * height) : 0;
    }
    dirty = false;
  }

  function queue() {
    if (!raf && ready && !paused && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (dirty) measure();
    const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
    let visible = false;
    for (const slot of slots) {
      const { model } = slot;
      if (!slot.visible) continue;
      visible = true;
      if (!calm && !slot.drag) {
        slot.phase = (slot.phase + dt * Math.PI / 4) % (2 * Math.PI);
        slot.glide *= Math.exp(-dt * 6);
      }
      const yaw = bases[model][0] + clamp(slot.yaw + slot.glide + 0.26 * Math.sin(slot.phase), yawLimit);
      const pitch = bases[model][1] + slot.pitch;
      const i = model * 4;
      poses[i] = Math.cos(yaw);
      poses[i + 1] = Math.sin(yaw);
      poses[i + 2] = Math.cos(pitch);
      poses[i + 3] = Math.sin(pitch);
    }
    engine.setSculptures(rects, poses);
    previous = visible && !calm ? now : 0;
    if (previous) queue();
  }

  function invalidate() { dirty = true; queue(); }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    previous = 0;
    for (const slot of slots) release(slot);
  }

  function release(slot) {
    const drag = slot.drag;
    slot.drag = null;
    slot.velocity = 0;
    if (drag && slot.el.hasPointerCapture(drag.id)) slot.el.releasePointerCapture(drag.id);
  }

  function updateValue(slot) {
    slot.el.setAttribute('aria-valuenow', String(Math.round(slot.yaw * 180 / Math.PI)));
  }

  for (const slot of slots) {
    const { el } = slot;
    updateValue(slot);
    el.addEventListener('pointerdown', e => {
      if (calm || paused || !ready || !e.isPrimary || e.button !== 0) return;
      slot.velocity = 0;
      slot.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, active: false };
    }, { signal });
    window.addEventListener('pointermove', e => {
      const drag = slot.drag;
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.active) {
        if (e.pointerType === 'touch' && Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx)) {
          release(slot);
          return;
        }
        if (Math.abs(dx) < 7) return;
        el.setPointerCapture(e.pointerId);
        drag.active = true;
        slot.yaw += slot.glide;
        slot.glide = 0;
      }
      slot.yaw = clamp(slot.yaw + dx * 0.013, yawLimit);
      slot.pitch = clamp(slot.pitch + dy * 0.009, pitchLimit);
      slot.velocity = clamp(dx * 13 / Math.max(e.timeStamp - drag.time, 10), 1.5);
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.time = e.timeStamp;
      updateValue(slot);
    }, { signal });
    window.addEventListener('pointerup', e => {
      const drag = slot.drag;
      if (!drag || drag.id !== e.pointerId) return;
      const velocity = drag.active && e.timeStamp - drag.time < 90 ? slot.velocity : 0;
      release(slot);
      if (drag.active) {
        const destination = clamp(slot.yaw + velocity / 6, yawLimit);
        slot.glide = slot.yaw - destination;
        slot.yaw = destination;
        updateValue(slot);
      }
    }, { signal });
    window.addEventListener('pointercancel', e => {
      if (slot.drag?.id === e.pointerId) release(slot);
    }, { signal });
    el.addEventListener('lostpointercapture', e => {
      if (slot.drag?.id === e.pointerId) release(slot);
    }, { signal });
    el.addEventListener('keydown', e => {
      if (calm || paused || !ready) return;
      if (e.key === 'Home') { slot.yaw = 0; slot.pitch = 0; slot.phase = 0; }
      else if (e.key === 'ArrowLeft') slot.yaw = clamp(slot.yaw - 0.12, yawLimit);
      else if (e.key === 'ArrowRight') slot.yaw = clamp(slot.yaw + 0.12, yawLimit);
      else return;
      e.preventDefault();
      slot.velocity = 0;
      slot.glide = 0;
      updateValue(slot);
      queue();
    }, { signal });
  }

  const observer = new ResizeObserver(invalidate);
  observer.observe(document.documentElement);
  for (const { el } of slots) observer.observe(el);
  window.addEventListener('resize', invalidate, { signal });
  window.addEventListener('scroll', invalidate, { capture: true, passive: true, signal });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : invalidate(), { signal });
  engine.canvas.addEventListener('webglcontextlost', () => { ready = false; stop(); syncControls(); }, { signal });
  engine.canvas.addEventListener('webglcontextrestored', () => {
    ready = engine.renderer.ok;
    for (const slot of slots) updateValue(slot);
    syncControls();
    invalidate();
  }, { signal });
  ready = slots.length > 0;
  syncControls();
  queue();

  return {
    setCalm(enabled) { calm = !!enabled; stop(); syncControls(); queue(); },
    setPaused(enabled) { paused = !!enabled; if (paused) stop(); else invalidate(); },
    destroy() {
      ready = false;
      stop();
      listeners.abort();
      observer.disconnect();
      syncControls();
      rects.fill(0);
      engine.setSculptures(rects, poses);
    },
  };
}
