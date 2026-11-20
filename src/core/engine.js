import * as THREE from 'three';
// Renderer + scene + camera + fixed-step clock with hitstop support.
// Post-processing is owned by src/world/post.js (createPost) and plugged in here.
export class Engine {
  constructor() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    document.body.prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);
    this.timeScale = 1; this.hitstop = 0; this.elapsed = 0; this.post = null;
    // iPad Safari can drop the WebGL context (GPU memory pressure / a long stall). Without this the canvas just stays
    // black: ask the browser to restore it (three.js re-uploads lazily), and if it does not come back, say so with a reload.
    this.lost = false; let lostUi = null, lostTimer = 0;
    r.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); this.lost = true; console.error('[engine] WebGL context lost');
      clearTimeout(lostTimer); lostTimer = setTimeout(() => {
        if (!this.lost || lostUi) return;
        const ja = /^ja\b/i.test(document.documentElement.lang || navigator.language || '');
        lostUi = document.createElement('div'); lostUi.className = 'wb-ctxlost';
        lostUi.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#120a06;color:#e9dcc0;font:600 17px/1.5 system-ui,sans-serif;text-align:center;padding:24px';
        lostUi.innerHTML = `<div>${ja ? '画面の描画が止まりました（端末のメモリ不足）。' : 'The display stopped (the device ran low on graphics memory).'}</div><button style="font:inherit;padding:10px 26px;border-radius:6px;border:1px solid #d9b673;background:#3a2410;color:#ffe2a0">${ja ? '再読み込み' : 'Reload'}</button>`;
        lostUi.querySelector('button').addEventListener('click', () => location.reload()); document.body.appendChild(lostUi);
      }, 2500);
    });
    r.domElement.addEventListener('webglcontextrestored', () => { this.lost = false; console.warn('[engine] WebGL context restored'); lostUi?.remove(); lostUi = null; });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      r.setSize(innerWidth, innerHeight); this.post?.setSize(innerWidth, innerHeight);
    });
  }
  // Returns gameplay dt (0 during hitstop) and raw dt.
  tick(rawDt) {
    rawDt = Math.min(rawDt, 1 / 20);
    if (this.hitstop > 0) { this.hitstop -= rawDt; return { dt: 0, rawDt }; }
    const dt = rawDt * this.timeScale; this.elapsed += dt; return { dt, rawDt };
  }
  render() { if (this.lost) return; this.post ? this.post.render() : this.renderer.render(this.scene, this.camera); }
}
