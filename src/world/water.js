// Pond + stream water: PBR (env reflections, sun glints) with animated normal ripples, fresnel, depth tint, shore foam.
import { WATER_LEVEL } from './terrain.js';
import { createWaterNormal } from './textures.js';

export function createWater(THREE, scene, terrain, sunDir) {
  const tN = createWaterNormal(THREE, 5, 256);
  const uniforms = { uTime: { value: 0 }, tWN: { value: tN } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.0, transparent: true, envMapIntensity: 1.2 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aDepth; attribute vec2 aFlow; varying float vDepth; varying vec2 vFlow; varying vec3 vWW;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vDepth = aDepth; vFlow = aFlow; vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime; uniform sampler2D tWN; varying float vDepth; varying vec2 vFlow; varying vec3 vWW; vec3 waterN;`)
      .replace('#include <map_fragment>', `{
  vec2 p = vWW.xz;
  float t = uTime;
  vec2 fl = vFlow * t;
  vec3 n1 = texture2D(tWN, p * 0.09 + vec2(t * 0.012, t * 0.007) - fl * 0.09).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tWN, p * 0.23 + vec2(-t * 0.018, t * 0.021) - fl * 0.23).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(tWN, p * 0.6 + vec2(t * 0.04, -t * 0.03) - fl * 0.6).xyz * 2.0 - 1.0;
  vec2 nxy = n1.xy * 0.5 + n2.xy * 0.4 + n3.xy * 0.25 * (1.0 + length(vFlow) * 2.0);
  waterN = normalize(vec3(nxy.x * 0.35, 1.0, nxy.y * 0.35));
  float d = max(vDepth, 0.0);
  vec3 shallow = vec3(0.09, 0.19, 0.15), deep = vec3(0.012, 0.035, 0.05);
  vec3 col = mix(shallow, deep, smoothstep(0.0, 2.0, d));
  vec3 vdir = normalize(vWW - cameraPosition);
  float fres = pow(1.0 - clamp(dot(-vdir, waterN), 0.0, 1.0), 4.0);
  float a = mix(0.45, 0.9, smoothstep(0.0, 1.6, d));
  a = mix(a, 1.0, fres * 0.8);
  // shore foam
  float fn = texture2D(tWN, p * 0.5 + t * 0.02).x;
  float foam = (1.0 - smoothstep(0.02, 0.22 + 0.1 * sin(t * 1.5 + p.x), d)) * smoothstep(0.35, 0.65, fn);
  foam += smoothstep(0.8, 0.97, n3.x * 0.5 + 0.5) * min(length(vFlow), 1.0) * 0.35;
  col = mix(col, vec3(0.8, 0.82, 0.8), clamp(foam, 0.0, 1.0) * 0.7);
  a = max(a, foam * 0.8);
  a *= smoothstep(-0.02, 0.07, vDepth);
  diffuseColor = vec4(col, a);
}`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'wb-water-v1';

  const group = new THREE.Group(); group.name = 'water'; scene.add(group);
  // ---- pond ----
  {
    const R = terrain.pond.r * 1.6, S = 72;
    const g = new THREE.PlaneGeometry(R * 2, R * 2, S, S); g.rotateX(-Math.PI / 2);
    g.translate(terrain.pond.x, WATER_LEVEL, terrain.pond.z);
    const p = g.attributes.position; const depth = new Float32Array(p.count); const flow = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) depth[i] = WATER_LEVEL - terrain.getHeight(p.getX(i), p.getZ(i));
    g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1)); g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; group.add(m);
  }
  // ---- stream ribbon ----
  {
    const pts = terrain.stream; const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); const n = Math.ceil(l / 1.0);
      for (let k = 0; k < n; k++) { const t = k / n; samples.push([ax + (bx - ax) * t, az + (bz - az) * t]); }
    }
    samples.push(pts[pts.length - 1]);
    // extend into the pond
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const ddx = last[0] - prev[0], ddz = last[1] - prev[1], dl = Math.hypot(ddx, ddz);
    for (let k = 1; k <= 4; k++) samples.push([last[0] + ddx / dl * k, last[1] + ddz / dl * k]);
    // smoothed, monotonic water heights
    let ys = samples.map(([x, z]) => terrain.getHeight(x, z) + 0.42);
    for (let it = 0; it < 3; it++) ys = ys.map((y, i) => (ys[Math.max(0, i - 1)] + y * 2 + ys[Math.min(ys.length - 1, i + 1)]) / 4);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.min(ys[i], ys[i - 1]);
    ys = ys.map((y) => Math.max(y, WATER_LEVEL + 0.01));
    const W = 2.6, SEGW = 6;
    const pos = [], dep = [], flw = [], idx = [];
    for (let i = 0; i < samples.length; i++) {
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const slope = i > 0 ? Math.max(0, ys[i - 1] - ys[i]) : 0;
      const speed = 0.3 + Math.min(1.0, slope * 2);
      for (let k = 0; k <= SEGW; k++) {
        const o = (k / SEGW - 0.5) * 2 * W; const x = samples[i][0] - tz * o, z = samples[i][1] + tx * o;
        pos.push(x, ys[i], z); dep.push(ys[i] - terrain.getHeight(x, z)); flw.push(tx * speed, tz * speed);
      }
    }
    for (let i = 0; i < samples.length - 1; i++) for (let k = 0; k < SEGW; k++) {
      const a = i * (SEGW + 1) + k, b = a + 1, c = a + SEGW + 1, d = c + 1; idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flw, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; group.add(m);
    var streamSamples = samples, streamY = ys;
  }
  function waterHeightAt(x, z) {
    if (terrain.pondDist(x, z) < 1.1) return WATER_LEVEL;
    const si = terrain.streamInfo(x, z);
    if (si.d < 2.5) { let best = 1e9, y = null; for (let i = 0; i < streamSamples.length; i += 2) { const d = (streamSamples[i][0] - x) ** 2 + (streamSamples[i][1] - z) ** 2; if (d < best) { best = d; y = streamY[i]; } } return y; }
    return null;
  }
  return { update(t) { uniforms.uTime.value = t; }, waterHeightAt, group };
}
