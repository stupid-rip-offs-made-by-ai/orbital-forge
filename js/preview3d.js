// Small rotating 3D preview of the rocket in the builder.
import * as THREE from './vendor/three.min.js';
import { Vessel } from './vessel.js';
import { buildRocket, updateRocket } from './rocketmesh.js';

export class Preview3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(4, 6, 8);
    this.scene.add(sun, new THREE.HemisphereLight(0xcfe2ff, 0x30281c, 1.1));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: 0x1d2640, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    this.ground = ground;
    this.scene.add(ground);
    this.yaw = 0.6; this.drag = null; this.group = null; this.len = 10;
    canvas.addEventListener('pointerdown', (e) => { this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.drag !== null) { this.yaw -= (e.clientX - this.drag) * 0.01; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => (this.drag = null));
    canvas.addEventListener('pointercancel', () => (this.drag = null));
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  set(ids) {
    if (this.group) this.scene.remove(this.group);
    this.group = null;
    if (!ids.length) return;
    const v = Vessel.fromIds(ids);
    this.group = buildRocket(v.parts);
    updateRocket(this.group, v, 1, 0);
    this.group.position.y = -v.minS; // stand on the ground
    this.group.userData.inner.position.y = 0;
    this.len = Math.max(3, v.length, (v.com - v.minS) + 2);
    this.scene.add(this.group);
  }

  frame() {
    const c = this.canvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h || !c.offsetParent) return;
    if (c.width !== Math.round(w * devicePixelRatio) || c.height !== Math.round(h * devicePixelRatio)) {
      this.r.setPixelRatio(Math.min(2, devicePixelRatio));
      this.r.setSize(w, h, false);
      this.cam.aspect = w / h;
      this.cam.updateProjectionMatrix();
    }
    if (this.drag === null) this.yaw += 0.006;
    const L = this.len, d = L * 2.2 + 4;
    this.cam.position.set(Math.sin(this.yaw) * d, L * 0.55, Math.cos(this.yaw) * d);
    this.cam.lookAt(0, L * 0.45, 0);
    this.r.render(this.scene, this.cam);
  }
}
