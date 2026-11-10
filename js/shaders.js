// Custom shader materials (all support the logarithmic depth buffer).
import * as THREE from './vendor/three.min.js';

const VHEAD = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const FHEAD = '#include <common>\n#include <logdepthbuf_pars_fragment>\n';

export function plumeMaterial(c1, c2, intensity) {
  return new THREE.ShaderMaterial({
    uniforms: { uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) }, uIntensity: { value: intensity } },
    vertexShader: VHEAD + `
      varying vec2 vUv; varying float vRim;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vRim = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: FHEAD + `
      uniform vec3 uC1; uniform vec3 uC2; uniform float uIntensity;
      varying vec2 vUv; varying float vRim;
      void main() {
        float t = 1.0 - vUv.y;               // 0 at nozzle, 1 at tail
        float a = pow(1.0 - t, 1.6) * smoothstep(0.0, 0.06, t + 0.02) * pow(vRim, 1.3) * uIntensity;
        vec3 c = mix(uC2, uC1, smoothstep(0.0, 0.5, t));
        gl_FragColor = vec4(c * a * 1.6, a);
        #include <logdepthbuf_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function particleMaterial(map, additive) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uScale: { value: 500 } },
    vertexShader: VHEAD + `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      uniform float uScale;
      varying float vA; varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 1.5, 900.0);
        vA = aAlpha; vC = aColor;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: FHEAD + `
      uniform sampler2D uMap; varying float vA; varying vec3 vC;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vC * t.rgb, t.a * vA);
        if (gl_FragColor.a < 0.003) discard;
        #include <logdepthbuf_fragment>
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** Sky dome: a big inverted sphere that follows the camera. */
export function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uUp: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSkyF: { value: 1 },
      uZenith: { value: new THREE.Color(0x2c6fd6) }, uHorizon: { value: new THREE.Color(0xa9d4ff) },
    },
    vertexShader: VHEAD + `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: FHEAD + `
      uniform vec3 uUp; uniform vec3 uSun; uniform float uSkyF; uniform vec3 uZenith; uniform vec3 uHorizon;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = dot(d, uUp);
        vec3 c = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
        c = mix(c, uHorizon * 0.75, smoothstep(0.0, -0.3, h));
        float sd = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.85, 0.6) * (pow(sd, 400.0) * 3.0 + pow(sd, 12.0) * 0.25);
        float a = uSkyF * (h > -0.02 ? 1.0 : 1.0);
        gl_FragColor = vec4(c, a);
        #include <logdepthbuf_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
  });
}

/** Fresnel rim glow for the atmosphere seen from space. */
export function atmoMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: 1 } },
    vertexShader: VHEAD + `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: FHEAD + `
      uniform vec3 uColor; uniform float uFade;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = pow(f, 2.5) * 1.3 * uFade;
        gl_FragColor = vec4(uColor * a, a);
        #include <logdepthbuf_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false,
  });
}
