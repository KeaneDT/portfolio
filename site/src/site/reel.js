/**
 * Infinite reel. Native scrolling, one visual twin of the first section at the end.
 * When the twin reaches the same spot the original had, we jump back by exactly one loop height.
 * The jump is invisible because the twin is pixel-identical and the metal progress is modular.
 *
 * Known limit: it loops downward only. Scrolling up past the very top stops at the top.
 * (Upward looping would need a second twin and a start offset; see docs/04-scroll-and-reel.md.)
 */
export function createReel(root) {
  const sections = Array.from(root.querySelectorAll('.sec:not(.sec--clone)'));
  const clone = root.querySelector('.sec--clone');
  let centers = [];
  let loopH = 1;

  function measure() {
    const y0 = window.scrollY;
    centers = sections.map((s) => {
      const r = s.getBoundingClientRect();
      return r.top + y0 + r.height / 2;
    });
    const cr = clone.getBoundingClientRect();
    loopH = cr.top + y0;
    // the clone sits where section 0 would be one loop later
    centers.push(centers[0] + loopH);
  }

  /** continuous section index in [0, N) based on where the viewport centre sits between section centres */
  function progress() {
    const N = sections.length;
    const y = window.scrollY + window.innerHeight / 2;
    if (y <= centers[0]) return 0;
    for (let i = 0; i < N; i++) {
      if (y < centers[i + 1]) return i + (y - centers[i]) / (centers[i + 1] - centers[i]);
    }
    return 0;
  }

  /** call each frame */
  function tick() {
    if (window.scrollY >= loopH - 1) window.scrollTo(0, window.scrollY - loopH);
  }

  function scrollToSection(i) {
    const s = sections[i];
    if (!s) return;
    const r = s.getBoundingClientRect();
    // Tall content should open at its heading rather than halfway down the section.
    const offset = r.height > window.innerHeight + 1 ? 0 : r.height / 2 - window.innerHeight / 2;
    const top = r.top + window.scrollY + offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  measure();
  return { measure, progress, tick, scrollToSection, get loopHeight() { return loopH; }, get count() { return sections.length; } };
}
