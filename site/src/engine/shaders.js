export const VERT = `#version 300 es
void main() {
  // fullscreen triangle, no buffers
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * One pass does everything:
 *   1. metaball field with an analytic gradient -> exact dome normals (no finite differences)
 *   2. procedural studio environment for chrome reflections
 *   3. raymarched orb (placeholder for the head) composited on top
 *   4. tone map + grain
 *
 * Blob data:  uA[i] = (x, y, radius, stretch)   uB[i] = (dirX, dirY, 0, 0)
 * Orb data:   uO0 = (x, y, R, visible)  uO1 = (yaw, pitch, bulge, bulgeAngle)  uO2 = (m0, m1, m2, clay)
 * Ripples:    uRip[k] = (x, y, age, amp)
 */
export const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uScroll;   // radians, rotates the environment so reflections slide as you scroll
uniform float uCalm;     // 0..1
uniform vec2  uPtr;      // pointer in world space
uniform float uPtrOn;
uniform vec4  uA[32];
uniform vec4  uB[32];
uniform vec4  uRip[8];
uniform vec4  uO0, uO1, uO2;

const float PI = 3.14159265;
const float KF = 1.6;   // field falloff: >1 keeps blobs compact so distant ones do not bloat each other

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// ---------------------------------------------------------------- environment
// Chrome is mostly contrast: deep black with a few hard-edged white shapes. Boxes are defined in
// (azimuth, height) space so their edges stay crisp when reflected.
float rectMask(float v, float c, float hw, float soft) { return smoothstep(soft, 0.0, abs(v - c) - hw); }

vec3 env(vec3 d) {
  float c = cos(uScroll), s = sin(uScroll);
  d = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  float y = d.y;
  float az = atan(d.x, d.z);

  vec3 col = mix(vec3(0.0015, 0.0018, 0.0026), vec3(0.030, 0.036, 0.050), smoothstep(-0.1, 1.0, y));

  // horizon line + a thinner echo below it
  col += vec3(1.0, 1.0, 1.0) * 2.2 * rectMask(y, 0.09, 0.012, 0.03);
  col += vec3(0.65, 0.78, 1.0) * 0.9 * rectMask(y, -0.20, 0.008, 0.03) * (0.5 + 0.5 * cos(az * 2.0));

  // key softbox (upper left) and a tall strip (right)
  col += vec3(1.0, 0.98, 0.95) * 3.4 * rectMask(az, -0.75, 0.30, 0.03) * rectMask(y, 0.60, 0.17, 0.04);
  col += vec3(0.78, 0.88, 1.0) * 2.6 * rectMask(az, 0.95, 0.06, 0.02) * rectMask(y, 0.10, 0.60, 0.04);

  // warm rim from behind, seen at grazing angles
  col += vec3(1.0, 0.80, 0.64) * 0.9 * rectMask(abs(az), 3.0, 0.10, 0.22) * rectMask(y, 0.0, 0.35, 0.25);

  // floor card: faint bright band so the lower half of a sphere is not a black hole
  col += vec3(0.55, 0.6, 0.7) * 0.7 * rectMask(y, -0.58, 0.05, 0.06);

  // a small light on a slow orbit so even a still frame has a moving glint
  float oa = uTime * 0.25;
  col += vec3(1.0) * 2.0 * rectMask(az, oa - 3.14159 * floor(oa / 6.28318 + 0.5) * 2.0, 0.035, 0.02) * rectMask(y, 0.32, 0.06, 0.03);

  if (uPtrOn > 0.5) {
    vec3 pd = normalize(vec3(uPtr * 1.6, 0.75));
    col += vec3(0.9, 0.95, 1.0) * 2.0 * pow(max(dot(d, pd), 0.0), 90.0);
  }
  return col;
}

// ---------------------------------------------------------------- blobs
vec2 rippleGrad(vec2 p) {
  vec2 n = vec2(0.0);
  for (int k = 0; k < 8; k++) {
    vec4 r = uRip[k];
    if (r.w <= 0.0) continue;
    vec2 d = p - r.xy;
    float dl = length(d) + 1e-4;
    float ring = dl - r.z * 0.55;
    float e = exp(-ring * ring * 240.0) * r.w;
    n += d / dl * sin(ring * 70.0) * e * 0.35;
  }
  return n * (1.0 - 0.85 * uCalm);
}

// returns coverage in .a, premultiplied colour in .rgb; also writes signed distance (>0 inside)
vec4 blobs(vec2 p, float px, out float sdOut) {
  float f = 0.0, rs = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 32; i++) {
    vec4 a = uA[i];
    if (a.z <= 0.0) continue;
    vec2 d = p - a.xy;
    vec2 e = uB[i].xy;
    vec2 pe = vec2(-e.y, e.x);
    float l = 1.0 + a.w;            // stretch along velocity, squeeze across (area preserving)
    float pp = dot(d, e), qq = dot(d, pe);
    float q2 = max(pp * pp / (l * l) + qq * qq * l * l, 1e-6);
    float w = pow(a.z * a.z / q2, KF);
    f += w;
    rs += w * a.z;
    g -= (KF * w / q2) * (2.0 * pp / (l * l) * e + 2.0 * qq * l * l * pe);
  }
  if (f < 1e-4) { sdOut = -1.0; return vec4(0.0); }

  float sd = (f - 1.0) / (length(g) + 1e-5);   // ~ distance to the iso-surface in world units
  sdOut = sd;
  float cov = smoothstep(-px, px, sd);
  if (cov <= 0.0) return vec4(0.0);

  // dome height H = sqrt(1 - 1/f) gives exact sphere normals for a single blob and smooth necks for many
  float H = sqrt(max(1.0 - pow(f, -1.0 / KF), 0.0));
  float Reff = rs / f;
  vec2 gH = g * pow(f, -1.0 / KF - 1.0) / (2.0 * KF * max(H, 0.05));
  vec2 n2 = -gH * Reff + rippleGrad(p);
  vec3 n = normalize(vec3(n2, 1.0));

  vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);
  vec3 col = env(refl) * vec3(0.93, 0.96, 1.0);
  float fres = pow(1.0 - n.z, 3.0);
  col += vec3(0.55, 0.62, 0.75) * fres * 0.12;
  // thin dark contour right at the silhouette keeps the metal separated from bright backgrounds
  col *= mix(0.55, 1.0, smoothstep(0.0, px * 3.0, sd));
  return vec4(col * cov, cov);
}

// ---------------------------------------------------------------- orb (head placeholder)
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float orbSDF(vec3 q) {
  float R = uO0.z;
  float r = length(q);
  vec3 n = q / max(r, 1e-5);
  float m0 = uO2.x, m1 = uO2.y, m2 = uO2.z, clay = uO2.w;

  // low-order wobble modes (excited by motion + pointer impacts in OrbSim)
  float disp = m0 * (n.x * n.x - n.y * n.y) + m1 * 2.0 * n.x * n.y + m2 * (n.z * n.z - 0.33);

  // lean toward the pointer
  vec3 bd = vec3(cos(uO1.w), sin(uO1.w), 0.0);
  disp += uO1.z * pow(max(dot(n, bd), 0.0), 2.5);

  // skin: ridges that rotate with yaw, so you can read the rotation on a symmetric sphere
  vec3 qy = q;
  qy.xz = rot(uO1.x) * qy.xz;
  float lon = atan(qy.x, qy.z);
  float lat = asin(clamp(qy.y / max(r, 1e-5), -1.0, 1.0));
  float ridge = sin(lon * 4.0) * sin(lat * 6.0 + 0.5);
  disp += mix(0.014, 0.024, clay) * ridge;

  return r - R * (1.0 + disp);
}

vec3 orbNormal(vec3 q) {
  vec2 k = vec2(1.0, -1.0);
  float h = 0.0015;
  return normalize(k.xyy * orbSDF(q + k.xyy * h) + k.yyx * orbSDF(q + k.yyx * h) +
                   k.yxy * orbSDF(q + k.yxy * h) + k.xxx * orbSDF(q + k.xxx * h));
}

vec4 orb(vec2 p, float px) {
  float R = uO0.z;
  if (R < 0.004) return vec4(0.0);
  vec2 rel = p - uO0.xy;
  if (dot(rel, rel) > R * R * 2.4) return vec4(0.0);

  float t = 0.0, dmin = 1e3;
  vec3 ro = vec3(rel, R * 2.0);
  bool hit = false;
  vec3 q = ro;
  for (int i = 0; i < 56; i++) {
    q = ro + vec3(0.0, 0.0, -t);
    float d = orbSDF(q);
    dmin = min(dmin, d);
    if (d < R * 0.0012) { hit = true; break; }
    t += d * 0.75;
    if (t > R * 4.0) break;
  }
  float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, px * 1.5, dmin);
  if (cov <= 0.0) return vec4(0.0);

  vec3 n = hit ? orbNormal(q) : normalize(vec3(rel, 0.0) + vec3(0.0, 0.0, 1e-3));
  vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);
  float clay = uO2.w;

  vec3 chrome = env(refl) * vec3(0.93, 0.96, 1.0);
  float fres = pow(1.0 - max(n.z, 0.0), 3.0);
  chrome += vec3(0.55, 0.62, 0.75) * fres * 0.12;

  // matte clay: soft key light, cool fill, subtle subsurface warmth on the terminator
  vec3 L = normalize(vec3(-0.45, 0.65, 0.6));
  float dif = max(dot(n, L), 0.0);
  float wrap = clamp((dot(n, L) + 0.4) / 1.4, 0.0, 1.0);
  vec3 clayCol = vec3(0.58, 0.56, 0.55) * (0.10 + 0.9 * dif) + vec3(0.55, 0.30, 0.22) * 0.18 * wrap * (1.0 - dif);
  clayCol += vec3(0.20, 0.24, 0.32) * fres * 0.8;

  vec3 col = mix(chrome, clayCol, clay);
  return vec4(col * cov, cov);
}

// ---------------------------------------------------------------- main
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float px = 1.0 / uRes.y;

  // background: near black with a very faint cool lift towards the top and a vignette
  vec3 bg = vec3(0.0022, 0.0025, 0.0033) + vec3(0.0016, 0.0020, 0.0032) * (p.y + 0.5);
  bg *= 1.0 - 0.45 * dot(p * vec2(0.8, 1.1), p * vec2(0.8, 1.1));

  float sd;
  vec4 b = blobs(p, px, sd);
  // faint cast glow around metal so it feels lit in the room
  float halo = exp(min(sd, 0.0) * 16.0) * 0.012 * (1.0 - uCalm * 0.5);
  vec3 col = bg + vec3(0.55, 0.62, 0.75) * halo;
  col = col * (1.0 - b.a) + b.rgb;

  vec4 o = orb(p, px);
  col = col * (1.0 - o.a) + o.rgb;

  // tone map (extended Reinhard) + grain
  col = col * (1.0 + col / 9.0) / (1.0 + col);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * (1.5 / 255.0);
  outColor = vec4(col, 1.0);
}`;
