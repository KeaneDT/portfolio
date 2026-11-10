import { VERT, FRAG } from './shaders.js';
import { MAX_BLOBS, MAX_RIPPLES } from './sim.js';

/** Thin WebGL2 wrapper. Exposes `ok` and `error` so the page can fall back gracefully. */
export class Renderer {
  constructor(canvas, { preserve = false } = {}) {
    this.canvas = canvas;
    this.ok = false;
    this.error = null;
    this.lost = false;
    this.A = new Float32Array(MAX_BLOBS * 4);
    this.B = new Float32Array(MAX_BLOBS * 4);
    this.R = new Float32Array(MAX_RIPPLES * 4);
    this.o0 = new Float32Array(4); this.o1 = new Float32Array(4); this.o2 = new Float32Array(4);

    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: preserve,
    });
    if (!gl) { this.error = 'WebGL2 not available'; return; }
    this.gl = gl;

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this._init(); });
    this._init();
  }

  _init() {
    const gl = this.gl;
    const vs = this._shader(gl.VERTEX_SHADER, VERT);
    const fs = this._shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.error = 'Link failed: ' + gl.getProgramInfoLog(prog);
      return;
    }
    this.prog = prog;
    this.vao = gl.createVertexArray();
    const names = ['uRes', 'uTime', 'uScroll', 'uCalm', 'uPtr', 'uPtrOn', 'uA', 'uB', 'uRip', 'uO0', 'uO1', 'uO2'];
    this.u = {};
    for (const n of names) this.u[n] = gl.getUniformLocation(prog, n);
    this.ok = true;
  }

  _shader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      this.error = (type === gl.VERTEX_SHADER ? 'VS: ' : 'FS: ') + gl.getShaderInfoLog(s);
      return null;
    }
    return s;
  }

  /** Match the backing store to the CSS size. scale<1 renders fewer pixels (the canvas is stretched by CSS). */
  resize(cssW, cssH, dpr, scale) {
    const w = Math.max(2, Math.round(cssW * dpr * scale));
    const h = Math.max(2, Math.round(cssH * dpr * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  render({ time, scroll, calm, ptr, sim, orb }) {
    if (!this.ok || this.lost) return;
    const gl = this.gl, u = this.u;
    sim.pack(this.A, this.B);
    sim.packRipples(this.R);
    orb.pack(this.o0, this.o1, this.o2);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uScroll, scroll);
    gl.uniform1f(u.uCalm, calm ? 1 : 0);
    gl.uniform2f(u.uPtr, ptr.x, ptr.y);
    gl.uniform1f(u.uPtrOn, ptr.present ? 1 : 0);
    gl.uniform4fv(u.uA, this.A);
    gl.uniform4fv(u.uB, this.B);
    gl.uniform4fv(u.uRip, this.R);
    gl.uniform4fv(u.uO0, this.o0);
    gl.uniform4fv(u.uO1, this.o1);
    gl.uniform4fv(u.uO2, this.o2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
