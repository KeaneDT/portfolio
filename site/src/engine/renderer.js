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
    this.sculptRects = new Float32Array(16);
    this.sculptPoses = new Float32Array(16);

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
    this.ok = false;
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
    const names = ['uRes', 'uTime', 'uCalm', 'uA', 'uB', 'uRip', 'uO0', 'uO1', 'uO2', 'uPoolOn', 'uSurfaceNormals'];
    this.u = {};
    for (const n of names) this.u[n] = gl.getUniformLocation(prog, n);
    this.u.uSculptRect = gl.getUniformLocation(prog, 'uSculptRect[0]');
    this.u.uSculptPose = gl.getUniformLocation(prog, 'uSculptPose[0]');
    // Packed 16-bit slopes in RGBA8 work with core WebGL2 linear filtering.
    this.surfaceTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.surfaceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 0, 128, 0]));
    this.surfaceSize = 1;
    this.surfaceVersion = -1;
    this.ok = true;
    this.error = null;
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

  setSculptures(rects, poses) {
    this.sculptRects.set(rects);
    this.sculptPoses.set(poses);
  }

  render({ time, calm, sim, orb, surface }) {
    if (!this.ok || this.lost) return;
    const gl = this.gl, u = this.u;
    sim.pack(this.A, this.B);
    sim.packRipples(this.R);
    orb.pack(this.o0, this.o1, this.o2);

    const poolOn = sim.p.singlePool === true;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.surfaceTexture);
    if (surface && surface.version !== this.surfaceVersion) {
      if (surface.size !== this.surfaceSize) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, surface.size, surface.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, surface.data);
        this.surfaceSize = surface.size;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, surface.size, surface.size, gl.RGBA, gl.UNSIGNED_BYTE, surface.data);
      }
      this.surfaceVersion = surface.version;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uCalm, calm ? 1 : 0);
    gl.uniform1f(u.uPoolOn, poolOn ? 1 : 0);
    gl.uniform1i(u.uSurfaceNormals, 0);
    gl.uniform4fv(u.uA, this.A);
    gl.uniform4fv(u.uB, this.B);
    gl.uniform4fv(u.uRip, this.R);
    gl.uniform4fv(u.uO0, this.o0);
    gl.uniform4fv(u.uO1, this.o1);
    gl.uniform4fv(u.uO2, this.o2);
    gl.uniform4fv(u.uSculptRect, this.sculptRects);
    gl.uniform4fv(u.uSculptPose, this.sculptPoses);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
