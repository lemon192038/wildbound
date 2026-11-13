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
  render() { this.post ? this.post.render() : this.renderer.render(this.scene, this.camera); }
}
