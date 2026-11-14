// Volcanic sky: smoky gradient dome with ash clouds, a volcano plume and eruption flashes; matching height fog
// (ShaderChunk override, like sky.js does for the town), PMREM environment, distant silhouettes, the volcano itself.
import { makeNoise2D, smoothstep, mulberry32 } from './noise.js';

const v3 = (a) => `vec3(${a.map((x) => (+x).toFixed(5)).join(', ')})`;
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

export function volcSkyGLSL(F, fog = false) {
  const S = F.sky, L = F.light;
  return `
const vec3 VS_SUN = ${v3(norm(L.sunDir))};
const vec3 VS_SUNCOL = ${v3(S.sunCol)};
const vec3 VS_GLOWDIR = ${v3(norm([S.glowDir[0], 0, S.glowDir[2]]))};
const vec3 VS_GLOWCOL = ${v3(S.glowCol)};
${fog ? '#define uFlash 0.0' : 'uniform float uFlash;'}
vec3 vsSkyBase(vec3 rd) {
  float mu = dot(rd, VS_SUN); float y = max(rd.y, 0.0);
  vec3 hor = mix(${v3(S.away)}, ${v3(S.horizon)}, pow(clamp(mu * 0.5 + 0.5, 0.0, 1.0), 2.2));
  vec3 c = mix(hor, ${v3(S.zenith)}, smoothstep(0.0, 0.7, pow(y, 0.65)));
  vec2 fl = normalize(rd.xz + 1e-5); float g = max(dot(fl, VS_GLOWDIR.xz), 0.0);
  c += VS_GLOWCOL * (pow(g, 10.0) * 0.32 + pow(g, 2.0) * 0.05) * exp(-y * 7.0) * (1.0 + uFlash * 3.0);
  float m = max(mu, 0.0);
  c += VS_SUNCOL * (pow(m, 6.0) * 0.35 + pow(m, 60.0) * 0.8) * ${(S.sunDisk).toFixed(2)};
  c = mix(c, hor * 0.7, smoothstep(0.0, -0.2, rd.y));
  return c;
}
vec3 vsFogColor(vec3 rd) {
${F.fog.cave ? `  return ${v3(F.fog.cave)} * (1.0 + uFlash * 0.6);` : `  vec3 d = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.3 + 0.02, rd.z));
  return vsSkyBase(d) * 0.92;`}
}
`;
}

export function installVolcanicFog(THREE, F) {
  const SC = THREE.ShaderChunk; const fg = F.fog;
  // eruption flashes reach the fog through scene.fog.color (refreshed for every material each frame).
  SC.fog_pars_vertex = `#ifdef USE_FOG
varying float vFogDepth; varying vec3 vFogWorld;
#endif`;
  SC.fog_vertex = `#ifdef USE_FOG
vFogDepth = - mvPosition.z;
vFogWorld = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz + cameraPosition;
#endif`;
  SC.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear; uniform float fogFar;
#endif
${volcSkyGLSL(F, true)}
#endif`;
  SC.fog_fragment = `#ifdef USE_FOG
{
  vec3 fogRay = vFogWorld - cameraPosition; float fogDist = length(fogRay); vec3 fogRd = fogRay / max(fogDist, 1e-4);
  #ifdef FOG_EXP2
    float fb = ${fg.falloff.toFixed(4)};
    float fk = fogRd.y * fb;
    float fl = abs(fk) < 1e-4 ? fogDist : (1.0 - exp(-fogDist * fk)) / fk;
    float fogF = 1.0 - exp(-fogDensity * exp(-fb * (cameraPosition.y - (${fg.base.toFixed(2)}))) * fl - fogDist * ${fg.extra.toFixed(5)});
  #else
    float fogF = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  #ifdef WB_FAR_FOG
    fogF *= WB_FAR_FOG;
  #endif
  vec3 fogC = vsFogColor(fogRd) * fogColor;
  float fmu = max(dot(fogRd, VS_SUN), 0.0);
  fogC += VS_SUNCOL * pow(fmu, 10.0) * ${F.fog.cave ? '0.0' : '0.12'};
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, clamp(fogF, 0.0, 1.0));
}
#endif`;
}

export function createVolcanicSky(THREE, F, flashUniform, opts = {}) {
  const S = F.sky, V = F.volcano;
  const vdir = V ? norm([V.x, 0, V.z]) : [0, 0, -1];
  const vdist = V ? Math.hypot(V.x, V.z) : 1;
  const plumeBase = V ? Math.atan2(V.h * 0.97, vdist) : 0; // elevation of the crater seen from the field centre
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uClouds: { value: opts.clouds === false ? 0 : 1 }, uFlash: flashUniform },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform float uTime, uClouds;
${volcSkyGLSL(F)}
float h1(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++){ s += a * vn(p); p = m * p; a *= 0.5; } return s; }
const vec2 VDIR = vec2(${vdir[0].toFixed(5)}, ${vdir[2].toFixed(5)});
void main(){
  vec3 rd = normalize(vDir);
  vec3 c = vsSkyBase(rd);
  float mu = dot(rd, VS_SUN);
  c += VS_SUNCOL * 18.0 * smoothstep(0.9993, 0.9996, mu) * ${S.sunDisk.toFixed(2)};
  if (uClouds > 0.5 && rd.y > -0.02) {
    vec2 cp = rd.xz / (max(rd.y, 0.0) + 0.1) * 0.9 + uTime * vec2(0.008, 0.003);
    float d = fbm(cp * 0.8 + vec2(3.1, 7.7)); float d2 = fbm(cp * 2.3 - 1.7);
    float cover = smoothstep(1.0 - ${S.cover.toFixed(2)} - 0.15, 1.0 - ${S.cover.toFixed(2)} + 0.25, d * 0.75 + d2 * 0.25);
    vec2 fl = normalize(rd.xz + 1e-5); float g = max(dot(fl, VS_GLOWDIR.xz), 0.0);
    float under = pow(g, 4.0) * (0.4 + uFlash * 2.5) * exp(-max(rd.y, 0.0) * 3.0);
    vec3 cc = ${v3(S.cloud)} * (0.75 + 0.5 * d2) + ${v3(S.cloudLit)} * (under + pow(max(mu, 0.0), 4.0) * 0.5 * (1.0 - d));
    float fade = smoothstep(-0.02, 0.2, rd.y);
    c = mix(c, cc, cover * fade * 0.95);
${V ? `    // the volcano's ash plume: a billowing column above the crater, sheared by the wind
    float el = asin(clamp(rd.y, -1.0, 1.0));
    float up = el - ${plumeBase.toFixed(4)};
    if (up > -0.02) {
      float az = atan(fl.x * VDIR.y - fl.y * VDIR.x, dot(fl, VDIR)); // signed azimuth from the volcano
      float shear = up * up * 1.6 + up * 0.35;
      float w = 0.045 + up * 0.55;
      float x = (az + shear) / w;
      vec2 pp = vec2(x * 1.3, up * 9.0 - uTime * 0.035);
      float bill = fbm(pp * 1.4 + vec2(0.0, -uTime * 0.02)) * 0.7 + fbm(pp * 3.7) * 0.3;
      float col = smoothstep(1.0, 0.25, abs(x) + (bill - 0.5) * 0.9) * smoothstep(-0.02, 0.03, up) * (1.0 - smoothstep(0.5, 0.95, up));
      vec3 pc = mix(vec3(0.07, 0.06, 0.06), vec3(0.3, 0.25, 0.23), bill * bill) * (0.6 + 0.6 * smoothstep(-0.5, 0.8, dot(fl, VS_SUN.xz)));
      pc += VS_GLOWCOL * (exp(-up * 6.0) * (0.55 + uFlash * 4.0) + uFlash * 0.5 * exp(-up * 3.0)) * (0.3 + bill);
      c = mix(c, pc, col * 0.96);
    }
` : ''}
  }
  // distant eruption flash lights the whole sky in the glow direction
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 40, 20), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -1000; mesh.name = 'sky';
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}

export function buildVolcanicEnvironment(THREE, renderer, F, flashUniform) {
  const envScene = new THREE.Scene();
  const dome = createVolcanicSky(THREE, F, { value: 0 }, { clouds: false });
  envScene.add(dome);
  // dark ground hemisphere with a lava glow so reflections aren't sky-blue underneath
  const g = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...F.palette.glow).multiplyScalar(0.06), side: THREE.BackSide }));
  envScene.add(g);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.04, 0.1, 1000);
  pmrem.dispose(); dome.geometry.dispose(); dome.material.dispose(); g.geometry.dispose(); g.material.dispose();
  return rt.texture;
}

// Ring of distant silhouettes (black volcanic hills or ash mesas) bridging the terrain edge to the horizon.
export function createDistantRing(THREE, seed, F, textures) {
  const D = F.distant; if (!D) return null;
  const N = makeNoise2D(seed + 77);
  const AS = 300, RS = 26, R0 = D.r0, R1 = 2000;
  const pos = [], col = [], idx = [];
  const c0 = new THREE.Color(...D.palette[0]), c1 = new THREE.Color(...D.palette[1]), tmp = new THREE.Color();
  for (let j = 0; j <= RS; j++) {
    const tr = j / RS; const r = R0 + (R1 - R0) * Math.pow(tr, 1.4);
    for (let i = 0; i <= AS; i++) {
      const a = (i / AS) * Math.PI * 2; const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const north = smoothstep(0.2, 0.95, -z / r);
      const near = smoothstep(R0, R0 + 160, r) * (1 - smoothstep(650, 950, r)), far = smoothstep(700, 1150, r) * (1 - smoothstep(1600, R1, r));
      const rid = N.ridged(x * 0.0028 + 3, z * 0.0028 - 1, 5, 2.05, 0.5), big = N.fbm(x * 0.001, z * 0.001, 3) * 0.5 + 0.5;
      let h = -30 + near * (40 + 50 * big + 30 * rid) * (1 - D.lowNorth * north) + far * (50 + 200 * Math.pow(rid, 1.3) * (0.4 + big)) * (1 - D.lowNorth * 0.6 * north);
      if (D.mesa) { const q = h / 28, f = q - Math.floor(q); h = (Math.floor(q) + smoothstep(0.7, 0.95, f)) * 28; }
      if (F.volcano) { const vd = Math.hypot(x - F.volcano.x, z - F.volcano.z); const k = smoothstep(F.volcano.r * 0.75, F.volcano.r * 1.25, vd); h = h * k - 60 * (1 - k); }
      pos.push(x, h, z);
      tmp.copy(c0).lerp(c1, smoothstep(-10, 160, h) * 0.6 + 0.2 * rid);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < RS; j++) for (let i = 0; i < AS; i++) { const a = j * (AS + 1) + i, b = a + 1, c = a + AS + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tRock = { value: textures.basalt };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMW; uniform sampler2D tRock;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 rk = texture2D(tRock, vMW.xz * 0.004) * 0.5 + texture2D(tRock, vec2(vMW.x + vMW.z, vMW.y) * 0.012) * 0.5;
  diffuseColor.rgb *= mix(0.6, 1.4, rk.r);`);
  };
  mat.customProgramCacheKey = () => 'wb-distant-v1';
  const m = new THREE.Mesh(g, mat); m.name = 'distant'; return m;
}

// The volcano: a concave cone with radial gullies, a smoking crater and glowing lava streams down its flanks.
export function createVolcano(THREE, seed, F, textures, flashUniform, timeUniform) {
  const V = F.volcano; if (!V) return null;
  const N = makeNoise2D(seed + 901); const rnd = mulberry32(seed + 5);
  const AS = 180, RS = 60;
  const pos = [], idx = [], aux = [];
  const streams = []; for (let i = 0; i < V.streams; i++) streams.push({ a: Math.PI * 0.5 + (rnd() - 0.5) * 2.4, reach: 0.45 + rnd() * 0.45, w: 0.012 + rnd() * 0.01 });
  for (let j = 0; j <= RS; j++) {
    const t = j / RS; const r = V.crater * 0.6 + (V.r - V.crater * 0.6) * Math.pow(t, 1.25);
    for (let i = 0; i <= AS; i++) {
      const a = (i / AS) * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a);
      const u = (r - V.crater) / (V.r - V.crater);
      const gul = N.ridged(a * 14, u * 2.5, 4, 2, 0.5);
      let h = V.h * Math.pow(Math.max(0, 1 - Math.max(u, 0)), 1.7) * (1 - 0.1 * gul) * (1 + 0.04 * N.noise(a * 3, 2)) + N.fbm(ca * r * 0.01, sa * r * 0.01, 4) * 28 * smoothstep(0, 0.4, u);
      if (u < 0) h = V.h - 40 * smoothstep(0, -0.4, u) + 6 * N.noise(a * 5, 1); // crater bowl rim
      h -= 260 * smoothstep(0.8, 1.0, t);
      pos.push(ca * r, h, sa * r);
      // stream mask: meandering lines running down from the crater (direction a measured toward the field)
      let s = 0;
      for (const st of streams) {
        const da = Math.atan2(Math.sin(a - st.a - 0.12 * N.noise(u * 6, st.a * 3)), Math.cos(a - st.a - 0.12 * N.noise(u * 6, st.a * 3)));
        s = Math.max(s, smoothstep(st.w * (1.5 + u * 3), 0, Math.abs(da)) * smoothstep(st.reach + 0.05, st.reach - 0.15, u) * smoothstep(-0.05, 0.02, u));
      }
      aux.push(s, u);
    }
  }
  for (let j = 0; j < RS; j++) for (let i = 0; i < AS; i++) { const a = j * (AS + 1) + i, b = a + 1, c = a + AS + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aV', new THREE.Float32BufferAttribute(aux, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  mat.defines = { WB_FAR_FOG: '0.42' };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tRock = { value: textures.basalt }; sh.uniforms.uT = timeUniform; sh.uniforms.uFl = flashUniform;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aV; varying vec2 vV; varying vec3 vMW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvV = aV; vMW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vV; varying vec3 vMW; uniform sampler2D tRock; uniform float uT, uFl;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 rk = texture2D(tRock, vMW.xz * 0.006) * 0.6 + texture2D(tRock, vMW.xy * 0.02) * 0.4;
  float ashC = smoothstep(0.75, 0.25, vV.y) * 0.6;
  diffuseColor.rgb = mix(vec3(0.018, 0.016, 0.017), vec3(0.14, 0.13, 0.128), ashC) * mix(0.5, 1.5, rk.r);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float flowT = fract(vV.y * 6.0 - uT * 0.05);
  float st = vV.x * (0.7 + 0.3 * sin(vV.y * 40.0 - uT * 0.6));
  float crater = smoothstep(0.03, -0.12, vV.y);
  totalEmissiveRadiance += vec3(1.0, 0.28, 0.04) * (st * (2.2 + 1.5 * flowT) + crater * (2.5 + uFl * 8.0)) + vec3(1.0, 0.35, 0.08) * uFl * 0.35 * smoothstep(0.6, 0.0, vV.y);`);
  };
  mat.customProgramCacheKey = () => 'wb-volcano-v1';
  const m = new THREE.Mesh(g, mat); m.position.set(V.x, -20, V.z); m.name = 'volcano';
  m.userData.crater = new THREE.Vector3(V.x, V.h - 30, V.z);
  return m;
}
