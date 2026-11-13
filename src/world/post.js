// Post pipeline: scene (MSAA HDR + depth) -> GTAO -> subtle bloom -> OutputPass (ACES + sRGB) -> filmic grade -> SMAA.
// `?low=1` skips GTAO, MSAA and swaps SMAA for FXAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

// Renders the scene into a dedicated HDR target that owns a depth texture (shared with GTAO), then copies to the chain.
class ScenePass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = true;
    const dt = new THREE.DepthTexture(1, 1); dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthTexture: dt });
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), depthTest: false, depthWrite: false }));
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(this.scene, this.camera);
    this.copy.material.uniforms.tDiffuse.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
  }
}

// Screen-space light shafts: radial march from each pixel towards the sun, accumulating sky (depth==1) samples.
const RaysShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uStrength: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform sampler2D tDiffuse, tDepth; uniform vec2 uSun; uniform float uStrength, uAspect; varying vec2 vUv;
void main(){
  vec4 base = texture2D(tDiffuse, vUv);
  if (uStrength <= 0.0) { gl_FragColor = base; return; }
  vec2 dir = (uSun - vUv); float len = length(dir * vec2(uAspect, 1.0));
  const int N = RAY_SAMPLES;
  vec2 stp = dir / float(N) * min(1.0, 0.85 / max(len, 1e-3));
  vec2 uv = vUv + stp * fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
  float acc = 0.0, w = 1.0;
  for (int i = 0; i < N; i++) {
    uv += stp;
    vec2 c = clamp(uv, 0.001, 0.999);
    float sky = step(0.99999, texture2D(tDepth, c).x);
    acc += sky * w; w *= 0.97;
  }
  acc /= float(N);
  float fall = 1.0 / (1.0 + len * len * 3.0);
  vec3 rays = vec3(1.0, 0.78, 0.52) * acc * fall * uStrength;
  gl_FragColor = vec4(base.rgb + rays, base.a);
}`,
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uCA: { value: 0.0016 }, uVig: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uCA, uVig; varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main(){
  vec2 d = vUv - 0.5; float r2 = dot(d, d);
  vec2 off = d * uCA * (0.4 + r2 * 3.0);
  vec3 c;
  c.r = texture2D(tDiffuse, vUv - off).r;
  c.g = texture2D(tDiffuse, vUv).g;
  c.b = texture2D(tDiffuse, vUv + off).b;
  // filmic contrast (S-curve around mid grey)
  vec3 sc = c * c * (3.0 - 2.0 * c);
  c = mix(c, sc, 0.3);
  // split toning: cool teal shadows, warm highlights
  float l = luma(c);
  vec3 shadowTint = vec3(0.93, 1.0, 1.07), highTint = vec3(1.06, 1.0, 0.91);
  c *= mix(shadowTint, vec3(1.0), smoothstep(0.0, 0.45, l));
  c *= mix(vec3(1.0), highTint, smoothstep(0.45, 1.0, l));
  // gentle saturation lift
  l = luma(c); c = mix(vec3(l), c, 1.1);
  // vignette
  float v = 1.0 - uVig * smoothstep(0.15, 0.75, r2 * 2.2);
  c *= v;
  // fine dither / grain to kill banding
  float n = fract(sin(dot(vUv * uRes + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0 * 1.5;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
};

export function createPost(game) {
  const { renderer, scene, camera, params } = game;
  const low = params.get('low') === '1';
  const w = innerWidth, h = innerHeight;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w * renderer.getPixelRatio(), h * renderer.getPixelRatio(), { type: THREE.HalfFloatType }));
  // Software rasterisers (headless SwiftShader) can't afford MSAA / full-res AO: degrade automatically.
  let soft = false;
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); soft = /swiftshader|llvmpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { /* ignore */ }
  if (params.get('hq') === '1') soft = false;
  const msaa = params.has('msaa') ? +params.get('msaa') : (low || soft ? 0 : 4);
  const scenePass = new ScenePass(scene, camera, msaa);
  composer.addPass(scenePass);
  let gtao = null;
  if (!low && !soft && params.get('ao') !== '0') {
    gtao = new GTAOPass(scene, camera, w, h, { depthTexture: scenePass.rt.depthTexture });
    gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.5, thickness: 2.0, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
    // run AO at half resolution (denoised + bilinear upsampled in the blend)
    const gs = gtao.setSize.bind(gtao); gtao.setSize = (W, H) => gs(Math.max(1, Math.floor(W / 2)), Math.max(1, Math.floor(H / 2)));
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), low ? 0.18 : 0.24, 0.55, 0.92);
  composer.addPass(bloom);
  const rays = new ShaderPass({ ...RaysShader, defines: { RAY_SAMPLES: low ? 24 : 48 } });
  rays.uniforms.tDepth.value = scenePass.rt.depthTexture;
  composer.addPass(rays);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const aa = low ? new FXAAPass() : new SMAAPass();
  composer.addPass(aa);

  function setSize(W, H) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(W, H);
    grade.uniforms.uRes.value.set(W * renderer.getPixelRatio(), H * renderer.getPixelRatio());
  }
  setSize(w, h);
  let t = 0, last = performance.now(); const _fwd = new THREE.Vector3(), _sp = new THREE.Vector3();
  return {
    composer, passes: { scenePass, gtao, bloom, rays, grade, aa },
    render() {
      const now = performance.now(); t += Math.min(0.1, (now - last) / 1000); last = now;
      grade.uniforms.uTime.value = t;
      // project the sun for the light-shaft pass; fade out when the sun is behind / far off-screen
      const sd = game.world?.sunDirection;
      if (sd) {
        camera.getWorldDirection(_fwd);
        const facing = _fwd.dot(sd);
        _sp.copy(camera.position).addScaledVector(sd, 1000).project(camera);
        rays.uniforms.uSun.value.set(_sp.x * 0.5 + 0.5, _sp.y * 0.5 + 0.5);
        const off = Math.max(Math.abs(_sp.x), Math.abs(_sp.y));
        rays.uniforms.uStrength.value = facing > 0 ? 0.55 * Math.min(1, facing * 2.5) * (1 - THREE.MathUtils.smoothstep(off, 1.2, 2.2)) : 0;
        rays.uniforms.uAspect.value = camera.aspect;
      }
      composer.render();
    },
    setSize,
  };
}
