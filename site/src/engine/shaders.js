export const VERT = `#version 300 es
void main() {
  // fullscreen triangle, no buffers
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * One pass does everything:
 *   1. legacy metaball field or a continuous radial pool with analytic normals
 *   2. procedural studio environment for chrome reflections
 *   3. raymarched orb (placeholder for the head) composited on top
 *   4. tone map + grain
 *
 * Blob data:  uA[i] = (x, y, radius, stretch)   uB[i] = (dirX, dirY, joinWeight, restLength)
 * Pool mode:  uA[0..23] are Gaussian centerline samples; uA[31] is the cursor Gaussian
 * Orb data:   uO0 = (x, y, R, visible)  uO1 = (yaw, pitch, bulge, bulgeAngle)  uO2 = (m0, m1, m2, clay)
 * Ripples:    uRip[k] = (x, y, age, amp)
 */
export const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uCalm;     // 0..1
uniform float uPoolOn;
uniform sampler2D uSurfaceNormals; // packed signed x/y height gradients in RG/BA
uniform vec4  uA[32];
uniform vec4  uB[32];
uniform vec4  uRip[8];
uniform vec4  uO0, uO1, uO2;
uniform vec4  uSculptRect[4]; // center and half-size, in the same world units as p
uniform vec4  uSculptPose[4]; // yaw cosine/sine, pitch cosine/sine

const float PI = 3.14159265;
const float KF = 1.6;   // field falloff: >1 keeps blobs compact so distant ones do not bloat each other

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// ---------------------------------------------------------------- environment
// Chrome reads from broad gradients and a few controlled reflection cards.
vec3 env(vec3 d) {
  float y = d.y;
  float az = atan(d.x, d.z);

  float upper = smoothstep(-0.75, 0.95, y);
  vec3 col = mix(vec3(0.0050, 0.0048, 0.0045), vec3(0.020, 0.019, 0.017), upper);

  // A softbox falls away quickly from the camera-facing normal, leaving the body dark.
  float keyAz = atan(sin(az + 0.70), cos(az + 0.70));
  float key = exp(-0.5 * (keyAz * keyAz / 0.0625 + (y - 0.50) * (y - 0.50) / 0.0324));
  float keyCore = (1.0 - smoothstep(0.18, 0.24, abs(keyAz)))
    * (1.0 - smoothstep(0.14, 0.20, abs(y - 0.50)));
  col += vec3(1.0, 0.98, 0.95) * (3.0 * key + 8.5 * keyCore);

  // Tall warm-white card with a soft shoulder and one narrow reflection core.
  float stripAz = atan(sin(az - 0.82), cos(az - 0.82));
  float stripSoft = exp(-0.5 * (stripAz * stripAz / 0.0049 + y * y / 0.36));
  float stripCore = exp(-pow(abs(stripAz) / 0.04, 4.0) - pow(abs(y) / 0.48, 8.0));
  col += vec3(1.0, 0.99, 0.96) * (2.0 * stripSoft + 7.0 * stripCore);

  // A low-energy back card keeps grazing reflections readable without a horizon band.
  float backAz = atan(sin(az - PI), cos(az - PI));
  float rim = exp(-0.5 * (backAz * backAz / 0.70 + (y + 0.02) * (y + 0.02) / 0.22));
  col += vec3(1.0, 0.93, 0.84) * 0.34 * rim;

  return col;
}

// ---------------------------------------------------------------- blobs
float edgeJoin(int i) {
  if (i < 0 || i >= 23) return 0.0;
  vec4 a = uA[i], b = uA[i + 1];
  if (a.z <= 0.0 || b.z <= 0.0) return 0.0;
  vec2 ab = b.xy - a.xy;
  if (dot(ab, ab) < 1e-7) return 0.0;
  float raw = uB[i].z;
  return raw > 0.0 ? min(raw, 1.0) : 0.0;
}

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

    float joinOut = edgeJoin(i);
    float joinIn = i > 0 ? edgeJoin(i - 1) : 0.0;
    float pointWeight = 1.0 - max(joinIn, joinOut);
    if (pointWeight > 0.0) {
      vec2 d = p - a.xy;
      vec2 e = uB[i].xy;
      float e2 = dot(e, e);
      e = e2 > 1e-6 ? e * inversesqrt(e2) : vec2(1.0, 0.0);
      vec2 pe = vec2(-e.y, e.x);
      float l = clamp(1.0 + a.w, 0.25, 4.0); // stretch along velocity, squeeze across (area preserving)
      float pp = dot(d, e), qq = dot(d, pe);
      float q2 = max(pp * pp / (l * l) + qq * qq * l * l, 1e-6);
      float w = pow(a.z * a.z / q2, KF) * pointWeight;
      f += w;
      rs += w * a.z;
      g -= (KF * w / q2) * (2.0 * pp / (l * l) * e + 2.0 * qq * l * l * pe);
    }

    if (joinOut > 0.0) {
      vec4 b = uA[i + 1];
      vec2 ab = b.xy - a.xy;
      float len2 = dot(ab, ab);
      float len = sqrt(max(len2, 1e-7));
      float rawH = dot(p - a.xy, ab) / max(len2, 1e-7);
      float h = clamp(rawH, 0.0, 1.0);
      vec2 dSeg = p - (a.xy + h * ab);
      float rest = uB[i].w;
      float neck = rest > 1e-5 ? sqrt(clamp(rest / len, 0.3, 1.3)) : 1.0;
      float rA = a.z * neck, rB = b.z * neck;
      float r = max(mix(rA, rB, h), 1e-5);
      float qSeg = max(dot(dSeg, dSeg), 1e-6);
      float wSeg = pow(r * r / qSeg, KF) * joinOut;
      vec2 dh = rawH > 0.0 && rawH < 1.0 ? ab / max(len2, 1e-7) : vec2(0.0);
      vec2 gradLog = 2.0 * (rB - rA) / r * dh - 2.0 * dSeg / qSeg;
      f += wSeg;
      rs += wSeg * r;
      g += KF * wSeg * gradLog;
    }
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
  float normalHeight = mix(1.0, 0.62, smoothstep(0.05, 0.72, H));
  vec3 n = normalize(vec3(n2, normalHeight));

  vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);
  vec3 col = env(refl) * vec3(1.0, 0.99, 0.97);
  float fres = pow(1.0 - n.z, 3.0);
  col += vec3(0.67, 0.62, 0.56) * fres * 0.10;
  // thin dark contour right at the silhouette keeps the metal separated from bright backgrounds
  col *= mix(0.55, 1.0, smoothstep(0.0, px * 3.0, sd));
  return vec4(col * cov, cov);
}

// ---------------------------------------------------------------- continuous pool
vec4 poolSurface(vec2 p, float px, out float sdOut) {
  const float iso = 0.36787944;
  float field = 0.0, radiusSum = 0.0;
  vec2 fieldGrad = vec2(0.0);
  for (int i = 0; i < 24; i++) {
    vec4 node = uA[i];
    if (node.z <= 1e-4) continue;
    float radius = clamp(node.z, 0.01, 0.35);
    float arc = uB[i].w;
    if (i == 23 && arc <= 0.0) arc = uB[22].w;
    vec2 tangent = uA[min(i + 1, 23)].xy - uA[max(i - 1, 0)].xy;
    float tangentLength = length(tangent);
    tangent = tangentLength > 1e-5 ? tangent / tangentLength : vec2(0.0, 1.0);
    vec2 across = vec2(-tangent.y, tangent.x);
    // Long strokes remain continuous even when their controls spread during a scroll morph.
    float straightness = smoothstep(0.1, 0.6, tangentLength / max(arc, 0.001));
    float alongRadius = mix(radius, max(radius, min(arc * 0.8, radius * 2.5)), straightness);
    float arcWeight = clamp(max(arc, 0.001) / (alongRadius * 1.77245), 0.015, 1.0);
    vec2 delta = p - node.xy;
    float invR2 = 1.0 / (radius * radius);
    float invAlong2 = 1.0 / (alongRadius * alongRadius);
    float along = dot(delta, tangent), crosswise = dot(delta, across);
    float contribution = exp(-along * along * invAlong2 - crosswise * crosswise * invR2) * arcWeight;
    field += contribution;
    radiusSum += contribution * radius;
    fieldGrad += -2.0 * contribution * (along * invAlong2 * tangent + crosswise * invR2 * across);
  }

  // The cursor is another field contribution, so it shares the same continuous boundary and normals.
  vec4 cursor = uA[31];
  if (cursor.z > 1e-4) {
    float radius = cursor.z;
    vec2 delta = p - cursor.xy;
    vec2 axis = uB[31].xy;
    float axisLength2 = dot(axis, axis);
    axis = axisLength2 > 1e-6 ? axis * inversesqrt(axisLength2) : vec2(1.0, 0.0);
    vec2 perpendicular = vec2(-axis.y, axis.x);
    float stretch = 1.0 + clamp(cursor.w, 0.0, 0.45);
    float along = dot(delta, axis);
    float across = dot(delta, perpendicular);
    float q2 = along * along / (stretch * stretch) + across * across * stretch * stretch;
    float invR2 = 1.0 / (radius * radius);
    float contribution = exp(-q2 * invR2);
    field += contribution;
    radiusSum += contribution * radius;
    fieldGrad += -2.0 * invR2 * contribution * (
      along / (stretch * stretch) * axis + across * stretch * stretch * perpendicular);
  }

  float gradLength = max(length(fieldGrad), 1e-4);
  float sd = (iso - field) / gradLength;
  vec2 outGradient = -fieldGrad / gradLength;
  sdOut = sd;
  float cov = 1.0 - smoothstep(-px, px, sd);
  if (cov <= 0.0) return vec4(0.0);

  // One shallow rolled surface spans the ribbon width; it has no individual control-node domes.
  float bevelWidth = clamp(radiusSum / max(field, 1e-5), 0.045, 0.24);
  float thickness = bevelWidth * 0.32;
  float edge = clamp(-sd / bevelWidth, 0.0, 1.0);
  float heightRoot = sqrt(max(1.0 - (1.0 - edge) * (1.0 - edge), 0.02));
  float heightSlope = thickness * (1.0 - edge) / (bevelWidth * heightRoot);
  vec2 uv = vec2(p.x / (uRes.x / uRes.y) + 0.5, 0.5 - p.y);
  vec4 packedNormal = texture(uSurfaceNormals, uv);
  vec2 surfaceGradient = vec2(
    ((packedNormal.r * 65280.0 + packedNormal.g * 255.0) / 65535.0) * 2.0 - 1.0,
    ((packedNormal.b * 65280.0 + packedNormal.a * 255.0) / 65535.0) * 2.0 - 1.0);
  vec2 n2 = outGradient * heightSlope - surfaceGradient;
  vec3 n = normalize(vec3(n2, 1.0));
  vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);
  vec3 F0 = vec3(0.94, 0.93, 0.91);
  vec3 fresnel = F0 + (1.0 - F0) * pow(1.0 - max(n.z, 0.0), 5.0);
  vec3 col = env(refl) * fresnel;
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

  vec3 chrome = env(refl) * vec3(1.0, 0.99, 0.97);
  float fres = pow(1.0 - max(n.z, 0.0), 3.0);
  chrome += vec3(0.67, 0.62, 0.56) * fres * 0.10;

  // matte clay: soft key light, cool fill, subtle subsurface warmth on the terminator
  vec3 L = normalize(vec3(-0.45, 0.65, 0.6));
  float dif = max(dot(n, L), 0.0);
  float wrap = clamp((dot(n, L) + 0.4) / 1.4, 0.0, 1.0);
  vec3 clayCol = vec3(0.58, 0.56, 0.55) * (0.10 + 0.9 * dif) + vec3(0.55, 0.30, 0.22) * 0.18 * wrap * (1.0 - dif);
  clayCol += vec3(0.20, 0.24, 0.32) * fres * 0.8;

  vec3 col = mix(chrome, clayCol, clay);
  return vec4(col * cov, cov);
}

// ---------------------------------------------------------------- role sculptures
float roundedBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float torus(vec3 p, float radius, float tube) {
  return length(vec2(length(p.xy) - radius, p.z)) - tube;
}

float sculptureSDF(int model, vec3 p) {
  if (model == 0) {
    vec3 mid = p;
    mid.xz = rot(1.08) * mid.xz;
    vec3 inner = p;
    inner.yz = rot(-1.03) * inner.yz;
    return min(min(torus(p, 0.84, 0.058), torus(mid, 0.69, 0.052)),
               min(torus(inner, 0.53, 0.052), length(p) - 0.29));
  }

  if (model == 1) {
    // Mirror the leaves about a shared spine, with their outer edges raised.
    vec3 leaf = vec3(abs(p.x), p.y, p.z);
    leaf.xy = rot(0.25) * leaf.xy;
    leaf.x -= 0.44;
    float cover = roundedBox(leaf + vec3(0.0, 0.075, 0.0), vec3(0.42, 0.026, 0.57), 0.028);
    float pages = roundedBox(leaf - vec3(0.0, 0.015, 0.0), vec3(0.37, 0.037, 0.51), 0.042);
    float leafLine = roundedBox(leaf - vec3(0.0, 0.093, 0.0), vec3(0.34, 0.010, 0.48), 0.025);
    float spine = roundedBox(p + vec3(0.0, 0.066, 0.0), vec3(0.022, 0.028, 0.55), 0.04);
    return min(min(cover, spine), min(pages, leafLine));
  }

  if (model == 2) {
    float rim = torus(p, 0.74, 0.145);
    float shoulder = torus(p - vec3(0.0, 0.0, 0.11), 0.64, 0.064);
    float hub = length(vec3(p.xy, p.z * 1.5)) / 1.5 - 0.174;
    vec3 spoke = p;
    float spokes = 1.0;
    const mat2 turn = mat2(0.5, -0.8660254, 0.8660254, 0.5);
    for (int i = 0; i < 3; i++) {
      spokes = min(spokes, roundedBox(spoke, vec3(0.63, 0.039, 0.052), 0.034));
      spoke.xy = turn * spoke.xy;
    }
    return min(min(rim, shoulder), min(hub, spokes));
  }

  vec3 board = p - vec3(0.0, 0.21, 0.0);
  board.xz = rot(0.7853982) * board.xz;
  float top = roundedBox(board, vec3(0.65, 0.028, 0.65), 0.036);
  vec2 crownSides = vec2(length(p.xz) - 0.42, abs(p.y + 0.026) - 0.164);
  float crown = length(max(crownSides, 0.0)) + min(max(crownSides.x, crownSides.y), 0.0) - 0.077;
  vec3 cord = p - vec3(0.72, 0.04, 0.15);
  float tassel = roundedBox(cord, vec3(0.017, 0.17, 0.018), 0.02);
  float fringe = roundedBox(cord + vec3(0.0, 0.23, 0.0), vec3(0.031, 0.067, 0.03), 0.022);
  return min(min(top, crown), min(tassel, fringe));
}

vec4 sculptures(vec2 p, float px) {
  for (int model = 0; model < 4; model++) {
    vec4 rect = uSculptRect[model];
    vec2 rel = p - rect.xy;
    if (rect.z <= 0.0 || any(greaterThan(abs(rel), rect.zw))) continue;
    float size = min(rect.z, rect.w) * 0.91;
    rel /= size;
    float radiusSq = 1.20 * 1.20 - dot(rel, rel);
    if (radiusSq <= 0.0) return vec4(0.0);

    // Enter at the bounding sphere so small silhouettes get the full march budget.
    float z = sqrt(radiusSq);
    vec4 pose = uSculptPose[model];
    mat2 yaw = mat2(pose.x, -pose.y, pose.y, pose.x);
    mat2 pitch = mat2(pose.z, -pose.w, pose.w, pose.z);
    vec3 q = vec3(rel, z);
    vec3 ray = vec3(0.0, 0.0, -1.0);
    q.yz = pitch * q.yz;
    q.xz = yaw * q.xz;
    ray.yz = pitch * ray.yz;
    ray.xz = yaw * ray.xz;

    float travel = 0.0;
    float edge = clamp(px / size, 0.003, 0.08);
    vec3 nearest = q;
    float nearestDistance = 1.0;
    for (int step = 0; step < 36; step++) {
      vec3 samplePoint = q + travel * ray;
      float d = sculptureSDF(model, samplePoint);
      if (d < nearestDistance) {
        nearest = samplePoint;
        nearestDistance = d;
      }
      if (d <= 0.002) break;
      travel += d;
      if (travel > z * 2.0) break;
    }
    float coverage = 1.0 - smoothstep(0.002, edge, nearestDistance);
    if (coverage <= 0.0) return vec4(0.0);

    vec2 k = vec2(0.002, -0.002);
    vec3 n = normalize(k.xyy * sculptureSDF(model, nearest + k.xyy) +
                       k.yyx * sculptureSDF(model, nearest + k.yyx) +
                       k.yxy * sculptureSDF(model, nearest + k.yxy) +
                       k.xxx * sculptureSDF(model, nearest + k.xxx));
    n.xz = transpose(yaw) * n.xz;
    n.yz = transpose(pitch) * n.yz;
    float fresnel = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    vec3 reflection = env(reflect(vec3(0.0, 0.0, -1.0), n));
    vec3 metal = reflection + vec3(0.11, 0.12, 0.14) * (0.2 + fresnel);
    return vec4(metal * coverage, coverage);
  }
  return vec4(0.0);
}

// ---------------------------------------------------------------- main
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float px = 1.0 / uRes.y;

  // background: near black with a very faint cool lift towards the top and a vignette
  vec3 bg = vec3(0.0022, 0.0025, 0.0033) + vec3(0.0016, 0.0020, 0.0032) * (p.y + 0.5);
  bg *= 1.0 - 0.45 * dot(p * vec2(0.8, 1.1), p * vec2(0.8, 1.1));

  vec4 sculpture = sculptures(p, px);
  vec3 col = bg;
  if (sculpture.a >= 1.0) {
    col = sculpture.rgb;
  } else if (uPoolOn > 0.5) {
    float poolSd;
    vec4 pool = poolSurface(p, px, poolSd);
    float halo = exp(-max(poolSd, 0.0) * 16.0) * 0.006 * (1.0 - uCalm * 0.5);
    col += vec3(0.58, 0.54, 0.55) * halo;
    col = col * (1.0 - pool.a) + pool.rgb;
  } else {
    float sd;
    vec4 b = blobs(p, px, sd);
    // faint cast glow around legacy metal so it feels lit in the room
    float halo = exp(min(sd, 0.0) * 16.0) * 0.012 * (1.0 - uCalm * 0.5);
    col += vec3(0.55, 0.62, 0.75) * halo;
    col = col * (1.0 - b.a) + b.rgb;

    vec4 o = orb(p, px);
    col = col * (1.0 - o.a) + o.rgb;
  }

  if (sculpture.a < 1.0) col = col * (1.0 - sculpture.a) + sculpture.rgb;

  // tone map (extended Reinhard) + grain
  col = col * (1.0 + col / 9.0) / (1.0 + col);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy) - 0.5) * (0.45 / 255.0);
  outColor = vec4(col, 1.0);
}`;
