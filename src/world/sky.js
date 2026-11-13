// Custom golden-hour sky dome (gradient + sun disk + procedural clouds), matching height fog
// (installed globally via ShaderChunk overrides so every lit material shares it), distant mountains, PMREM env.
import { makeNoise2D, smoothstep, clamp } from './noise.js';

const v3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

export function skyGLSL(sunDir) {
  return `
const vec3 WB_SUN = ${v3(sunDir)};
const vec3 WB_SUNCOL = vec3(1.0, 0.70, 0.42);
vec3 wbSkyBase(vec3 rd) {
  float mu = dot(rd, WB_SUN);
  float y = max(rd.y, 0.0);
  vec3 zen = vec3(0.075, 0.17, 0.42) * 1.9;
  vec3 horSun = vec3(1.0, 0.76, 0.55) * 1.45;
  vec3 horAway = vec3(0.52, 0.60, 0.74) * 1.15;
  float side = pow(clamp(mu * 0.5 + 0.5, 0.0, 1.0), 2.5);
  vec3 hor = mix(horAway, horSun, side);
  float t = 1.0 - pow(1.0 - y, 5.0);
  vec3 c = mix(hor, zen, smoothstep(0.0, 1.0, pow(t, 0.9)));
  float m = max(mu, 0.0);
  c += WB_SUNCOL * (pow(m, 5.0) * 0.45 + pow(m, 48.0) * 1.2) * (1.0 - 0.6 * y);
  // below horizon: keep the haze tone
  c = mix(c, hor * 0.85, smoothstep(0.0, -0.15, rd.y));
  return c;
}
vec3 wbFogColor(vec3 rd) {
  vec3 d = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.25 + 0.02, rd.z));
  return wbSkyBase(d);
}
`;
}

export function installFog(THREE, sunDir, base = -2.0, falloff = 0.022) {
  const SC = THREE.ShaderChunk;
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
${skyGLSL(sunDir)}
#endif`;
  SC.fog_fragment = `#ifdef USE_FOG
{
  vec3 fogRay = vFogWorld - cameraPosition; float fogDist = length(fogRay); vec3 fogRd = fogRay / max(fogDist, 1e-4);
  #ifdef FOG_EXP2
    float fb = ${falloff.toFixed(4)};
    float fk = fogRd.y * fb;
    float fl = abs(fk) < 1e-4 ? fogDist : (1.0 - exp(-fogDist * fk)) / fk;
    float fogF = 1.0 - exp(-fogDensity * exp(-fb * (cameraPosition.y - (${base.toFixed(2)}))) * fl - fogDist * 0.00085);
  #else
    float fogF = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  vec3 fogC = wbFogColor(fogRd) * fogColor;
  // sun in-scatter makes the haze glow towards the sun
  float fmu = max(dot(fogRd, WB_SUN), 0.0);
  fogC += WB_SUNCOL * pow(fmu, 12.0) * 0.14;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, clamp(fogF, 0.0, 1.0));
}
#endif`;
}

export function createSkyDome(THREE, sunDir) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uClouds: { value: 1 }, uGround: { value: 0 } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform float uTime, uClouds, uGround;
${skyGLSL(sunDir)}
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for(int i=0;i<6;i++){ s += a * vnoise(p); p = m * p; a *= 0.5; } return s; }
void main(){
  vec3 rd = normalize(vDir);
  vec3 c = wbSkyBase(rd);
  float mu = dot(rd, WB_SUN);
  c += WB_SUNCOL * 60.0 * smoothstep(0.99962, 0.99975, mu);
  if (uClouds > 0.5 && rd.y > 0.0) {
    vec2 cp = rd.xz / (rd.y + 0.12) * 1.1 + uTime * vec2(0.006, 0.0025);
    float d = fbm(cp * 0.9 + vec2(3.1, 7.7));
    float cover = smoothstep(0.48, 0.78, d + 0.08 * sin(cp.x * 0.3));
    float d2 = fbm(cp * 0.9 + vec2(3.1, 7.7) + WB_SUN.xz * 0.12);
    float lit = clamp(0.55 + (d - d2) * 4.0, 0.0, 1.0);
    vec3 shade = mix(vec3(0.38, 0.40, 0.52), vec3(0.62, 0.55, 0.58), smoothstep(0.0, 0.5, rd.y));
    vec3 cc = mix(shade, WB_SUNCOL * 2.1, lit * lit);
    float m = max(mu, 0.0);
    cc += WB_SUNCOL * pow(m, 10.0) * 2.5 * (1.0 - cover);
    float fade = smoothstep(0.0, 0.18, rd.y);
    vec3 haze = wbFogColor(rd);
    cc = mix(haze, cc, smoothstep(0.0, 0.35, rd.y) * 0.6 + 0.4);
    c = mix(c, cc, cover * fade * 0.92);
    // high thin streaks
    float st = fbm(vec2(cp.x * 0.25, cp.y * 2.2) + 11.0);
    c += WB_SUNCOL * smoothstep(0.55, 0.8, st) * 0.18 * fade;
  }
  if (uGround > 0.5 && rd.y < 0.0) c = mix(c, vec3(0.07, 0.075, 0.045), smoothstep(0.0, -0.08, rd.y));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -1000; mesh.name = 'sky';
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}

export function buildEnvironment(THREE, renderer, sunDir) {
  const envScene = new THREE.Scene();
  const dome = createSkyDome(THREE, sunDir);
  dome.material.uniforms.uClouds.value = 0; dome.material.uniforms.uGround.value = 1;
  envScene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02, 0.1, 1000);
  pmrem.dispose(); dome.geometry.dispose(); dome.material.dispose();
  return rt.texture;
}

export function createMountains(THREE, seed, tx) {
  const N = makeNoise2D(seed + 77);
  const AS = 384, RS = 30, R0 = 235, R1 = 1900;
  const pos = [], col = [], idx = [];
  const cForest = new THREE.Color(0x24341f), cRock = new THREE.Color(0x5a5650), cSnow = new THREE.Color(0xe8e4e0), cFar = new THREE.Color(0x6a7a8c);
  const tmp = new THREE.Color();
  for (let j = 0; j <= RS; j++) {
    const tr = j / RS; const r = R0 + (R1 - R0) * Math.pow(tr, 1.35);
    for (let i = 0; i <= AS; i++) {
      const a = (i / AS) * Math.PI * 2; const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const near = smoothstep(R0, 420, r) * (1 - smoothstep(600, 900, r)); const env = smoothstep(700, 1150, r) * (1 - smoothstep(1500, R1, r));
      const rid = N.ridged(x * 0.0024 + 3, z * 0.0024 - 1, 6, 2.05, 0.5);
      const big = N.fbm(x * 0.0009, z * 0.0009, 3) * 0.5 + 0.5;
      let h = -25 + near * (30 + 30 * big + 18 * rid) + env * (40 + 300 * Math.pow(rid, 1.4) * (0.4 + big));
      pos.push(x, h, z);
      const snow = smoothstep(170, 240, h + N.noise(x * 0.02, z * 0.02) * 25);
      const rock = smoothstep(70, 160, h);
      tmp.copy(cForest).lerp(cRock, rock).lerp(cSnow, snow).lerp(cFar, smoothstep(500, 1300, r) * 0.6);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < RS; j++) for (let i = 0; i < AS; i++) {
    const a = j * (AS + 1) + i, b = a + 1, c = a + AS + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (tx) {
    // strata-banded triplanar rock, forest on gentle low slopes, snow by height AND slope
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tRock = { value: tx.rock }; sh.uniforms.tRockN = { value: tx.rockN };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMW; varying vec3 vMN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz; vMN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMW; varying vec3 vMN; uniform sampler2D tRock, tRockN; vec3 mtnN;')
        .replace('#include <color_fragment>', `
  vec3 wn = normalize(vMN);
  vec3 bw = pow(abs(wn), vec3(3.0)); bw /= (bw.x + bw.y + bw.z);
  float sc = 0.012;
  vec4 r1 = texture2D(tRock, vMW.zy * sc) * bw.x + texture2D(tRock, vMW.xz * sc) * bw.y + texture2D(tRock, vMW.xy * sc) * bw.z;
  vec4 r2 = texture2D(tRock, vMW.zy * sc * 4.1) * bw.x + texture2D(tRock, vMW.xz * sc * 4.1) * bw.y + texture2D(tRock, vMW.xy * sc * 4.1) * bw.z;
  vec3 tnx = texture2D(tRockN, vMW.zy * sc * 4.1).xyz * 2.0 - 1.0, tny = texture2D(tRockN, vMW.xz * sc * 4.1).xyz * 2.0 - 1.0, tnz = texture2D(tRockN, vMW.xy * sc * 4.1).xyz * 2.0 - 1.0;
  tnx = vec3(tnx.xy + wn.zy, abs(tnx.z) * wn.x); tny = vec3(tny.xy + wn.xz, abs(tny.z) * wn.y); tnz = vec3(tnz.xy + wn.xy, abs(tnz.z) * wn.z);
  mtnN = normalize(mix(wn, normalize(tnx.zyx * bw.x + tny.xzy * bw.y + tnz.xyz * bw.z), 0.8));
  float warp = (r1.a - 0.5) * 18.0;
  float band = sin((vMW.y + warp) * 0.22) * 0.5 + 0.5;
  vec3 strata = mix(vec3(0.30, 0.27, 0.24), vec3(0.50, 0.45, 0.38), band) * mix(0.7, 1.25, r2.a);
  strata = mix(strata, vec3(0.20, 0.19, 0.19), smoothstep(0.75, 0.95, sin((vMW.y + warp) * 0.07) * 0.5 + 0.5) * 0.6);
  float forest = (1.0 - smoothstep(55.0, 110.0, vMW.y + warp * 2.0)) * smoothstep(0.62, 0.8, wn.y);
  vec3 col = mix(strata, vec3(0.07, 0.11, 0.06) * mix(0.7, 1.2, r2.a), forest);
  float snow = smoothstep(150.0, 200.0, vMW.y + warp * 3.0) * smoothstep(0.5, 0.75, wn.y + (r2.a - 0.5) * 0.4);
  snow = max(snow, smoothstep(230.0, 290.0, vMW.y) * smoothstep(0.25, 0.45, wn.y));
  col = mix(col, vec3(0.92, 0.93, 0.96), snow);
  diffuseColor.rgb = col * mix(vec3(1.0), vColor.rgb * 1.6, 0.25);
`)
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(mtnN, 0.0)).xyz);');
    };
    mat.customProgramCacheKey = () => 'wb-mtn-v1';
  }
  const m = new THREE.Mesh(g, mat);
  m.name = 'mountains';
  return m;
}
