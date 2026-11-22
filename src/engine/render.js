import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { sharedUniforms, detail } from './materials.js';

// Everything about how a frame is drawn lives here: renderer, sky, sun,
// shadows and post-processing. The game only calls the functions on the
// returned stage, so the look can change without touching gameplay code.
//
//   stage.renderer, stage.scene, stage.camera
//   stage.quality            'high' | 'low'
//   stage.setFocus(x, y, z)  centre the sun's shadow box on a point
//   stage.render(dt)         draw one frame
//   stage.resize()           call when the window changes size
//   stage.setScale(k)        render at a fraction of full resolution (0.4..1)

// Late afternoon over Philadelphia: the sun sits in the south-west, about a
// third of the way up the sky. North is -z and east is +x.
const SUN_ELEVATION = 36;
const SUN_AZIMUTH = 222; // degrees clockwise from north
const SKY_GAIN = 0.21;

function sunDirection() {
  const el = THREE.MathUtils.degToRad(SUN_ELEVATION);
  const az = THREE.MathUtils.degToRad(SUN_AZIMUTH);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

function makeSky(sunDir, clouds) {
  const sky = new Sky();
  // The stock shader has no brightness control; add one so the sky can be
  // balanced against sunlit walls.
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('uniform float showSunDisc;', 'uniform float showSunDisc;\n\t\tuniform float skyGain;\n\t\tuniform vec4 skyHaze;')
    // Near the horizon the sky settles into one haze colour, the same one the
    // fog uses, so far-off buildings dissolve into the sky without a seam.
    .replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      'texColor *= skyGain;\n\t\t\tfloat rawY = normalize( vWorldPosition - cameraPosition ).y;\n\t\t\ttexColor = mix( texColor, skyHaze.rgb, clamp( skyHaze.a * ( rawY < 0.0 ? 1.0 : exp( -rawY * 7.0 ) ), 0.0, 1.0 ) );\n\t\t\tgl_FragColor = vec4( texColor, 1.0 );'
    )
    // Below the horizon, repeat the horizon: no white underside when the camera is up high.
    .replace(
      'vec3 direction = normalize( vWorldPosition - cameraPosition );',
      'vec3 direction = normalize( vWorldPosition - cameraPosition );\n\t\t\tdirection = normalize( vec3( direction.x, max( direction.y, 0.02 ), direction.z ) );'
    );
  // The stock shader pins the dome to the far plane, which puts every vertex
  // exactly on a clip boundary and can smear faces across the view when the
  // camera tilts. Draw it first with no depth test instead, sized to sit
  // inside the camera's range.
  sky.material.vertexShader = sky.material.vertexShader.replace('gl_Position.z = gl_Position.w; // set z to camera.far', '');
  sky.material.depthTest = false;
  const u = sky.material.uniforms;
  u.skyGain = { value: SKY_GAIN };
  u.skyHaze = { value: new THREE.Vector4(0, 0, 0, 0) };
  u.turbidity.value = 3.4;
  u.rayleigh.value = 1.55;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.84;
  u.sunPosition.value.copy(sunDir);
  u.cloudCoverage.value = clouds ? 0.34 : 0;
  u.cloudDensity.value = 0.5;
  u.cloudElevation.value = 0.45;
  u.cloudScale.value = 0.00022;
  sky.scale.setScalar(2400);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

// What the city's glass reflects: the sky, a ground the colour of streets,
// and a ragged ring of far-off buildings so low windows mirror a skyline
// rather than an empty horizon.
function buildEnvironment(renderer, sunDir, haze) {
  const env = new THREE.Scene();
  const sky = makeSky(sunDir, true);
  sky.material.uniforms.showSunDisc.value = 0;
  sky.material.uniforms.skyHaze.value.set(haze.r, haze.g, haze.b, 1);
  env.add(sky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1100, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x35363a }));
  ground.position.y = -14;
  env.add(ground);
  const tones = [0x6d675f, 0x7a7068, 0x5b6068, 0x8a7d6c, 0x4f5660, 0x74645a];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2 + rnd() * 0.05;
    const r = 240 + rnd() * 160;
    const h = 30 + rnd() * rnd() * 170;
    // Faces away from the sun are darker, the way a real skyline reads.
    const lit = 0.55 + 0.45 * Math.max(0, -(Math.cos(a) * sunDir.x + Math.sin(a) * sunDir.z));
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(tones[k % tones.length]).multiplyScalar(lit) }));
    m.scale.set(34 + rnd() * 30, h, 34 + rnd() * 30);
    m.position.set(Math.cos(a) * r, h / 2 - 14, Math.sin(a) * r);
    m.rotation.y = -a;
    env.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0, 1, 3000);
  pmrem.dispose();
  sky.material.dispose();
  return rt.texture;
}

// Reads the sky's colour just above the horizon, away from the sun, so
// distant buildings fade into exactly the haze the sky shows.
function horizonColour(renderer, sunDir) {
  const out = new THREE.Color(0xb9cfe2);
  try {
    const scene = new THREE.Scene();
    const sky = makeSky(sunDir, false);
    sky.material.uniforms.showSunDisc.value = 0;
    scene.add(sky);
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType });
    const cam = new THREE.PerspectiveCamera(8, 1, 1, 5000);
    const buf = new Float32Array(4 * 4 * 4);
    const sum = [0, 0, 0];
    const az = Math.atan2(sunDir.x, -sunDir.z);
    const dirs = [az + Math.PI * 0.5, az + Math.PI, az + Math.PI * 1.5, az + Math.PI * 0.8, az + Math.PI * 1.2];
    const prev = renderer.getRenderTarget();
    for (const a of dirs) {
      cam.lookAt(Math.sin(a), 0.035, -Math.cos(a));
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, 4, 4, buf);
      for (let i = 0; i < 16; i++) {
        sum[0] += buf[i * 4];
        sum[1] += buf[i * 4 + 1];
        sum[2] += buf[i * 4 + 2];
      }
    }
    renderer.setRenderTarget(prev);
    const n = dirs.length * 16;
    if (sum[0] > 0 && Number.isFinite(sum[0])) out.setRGB(sum[0] / n, sum[1] / n, sum[2] / n);
    rt.dispose();
    sky.material.dispose();
  } catch {
    // Keep the fallback colour.
  }
  return out;
}

// A band of haze standing on the horizon all the way round, drawn behind the
// city. Whatever the sky does down there, the far edge of the land always
// meets the same colour the fog fades to.
function makeHorizonBand(haze) {
  const geo = new THREE.CylinderGeometry(1, 1, 1.4, 48, 1, true);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: haze } },
    vertexShader: `
      varying float vRise;
      void main() {
        vRise = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vRise;
      void main() {
        float a = vRise < 0.0 ? 1.0 : exp(-vRise * 9.0);
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const band = new THREE.Mesh(geo, mat);
  band.frustumCulled = false;
  band.renderOrder = -5;
  return band;
}

// Final touch in display space: a gentle contrast curve, a little warmth and
// a soft vignette, the way a camera would see it.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.26 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.08);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      col *= vec3(1.015, 1.0, 0.975);
      vec2 d = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(d, d) * 2.2);
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      col += (n - 0.5) / 255.0;
      gl_FragColor = vec4(col, c.a);
    }`,
};

export function createStage(canvas, opts = {}) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const quality = opts.quality || (coarse ? 'low' : 'high');
  const high = quality === 'high';
  // The city reads this when it is built, to pick lighter models on phones.
  detail.low = !high;

  // On 'high' the scene is drawn into a multisampled buffer for the
  // post-processing chain, so the canvas itself needs no antialiasing.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !high, powerPreference: 'high-performance' });
  const basePixelRatio = Math.min(devicePixelRatio, high ? 2 : 1.5);
  renderer.setPixelRatio(basePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.localClippingEnabled = true;

  const sunDir = sunDirection();
  sharedUniforms.uSunDir.value.copy(sunDir);

  const scene = new THREE.Scene();
  const haze = horizonColour(renderer, sunDir);
  const sky = makeSky(sunDir, true);
  sky.material.uniforms.skyHaze.value.set(haze.r, haze.g, haze.b, 1);
  scene.add(sky);
  const band = makeHorizonBand(haze);
  scene.add(band);
  scene.environment = buildEnvironment(renderer, sunDir, haze);
  // Clear autumn air: buildings a kilometre off are softened, not lost.
  scene.fog = new THREE.FogExp2(haze, 0.00046);
  scene.background = haze.clone();

  // Two sources of fill. The environment map lights the physically based
  // surfaces (everything on 'high', and the characters on both tiers). The
  // hemisphere light is the sky and the warm bounce off sunlit streets; on
  // 'low' the city is plain diffuse and gets all of its fill from it, so it
  // is turned up there and the environment is turned down to match.
  scene.environmentIntensity = high ? 0.5 : 0.34;
  const hemi = new THREE.HemisphereLight(high ? 0xf0e6d8 : 0xcfd8e6, 0x8a7458, high ? 0.72 : 1.25);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffdfb8, high ? 3.9 : 3.5);
  sun.castShadow = true;
  const mapSize = high ? 4096 : 1024;
  sun.shadow.mapSize.set(mapSize, mapSize);
  const sc = sun.shadow.camera;
  const span = high ? 240 : 135;
  sc.left = -span;
  sc.right = span;
  sc.top = span;
  sc.bottom = -span;
  sc.near = 20;
  sc.far = 1100;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = high ? 0.35 : 0.6;
  sun.shadow.radius = high ? 2.6 : 1.4;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(55, 1, 1, 2800);

  let composer = null;
  let gtao = null;
  if (high) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    // Ambient occlusion at half resolution: it only needs to be soft, and it
    // costs a quarter as much.
    gtao = new GTAOPass(scene, camera, size.x >> 1, size.y >> 1);
    gtao.updateGtaoMaterial({ radius: 5.5, distanceExponent: 1.4, thickness: 1.6, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 2, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.85;
    const setAoSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => setAoSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    composer.addPass(gtao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x >> 1, size.y >> 1), 0.16, 0.7, 1.15));
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
  }

  const stage = {
    renderer,
    scene,
    camera,
    quality,
    sun,
    sunDir,
    composer,
    haze,
    time: 0,
    setFocus(x, y, z) {
      // Snap the shadow box to whole texels so shadow edges do not crawl as
      // the focus point moves.
      const step = (span * 2) / mapSize;
      const fx = Math.round(x / step) * step;
      const fz = Math.round(z / step) * step;
      sun.target.position.set(fx, 0, fz);
      sun.position.set(fx + sunDir.x * 520, sunDir.y * 520, fz + sunDir.z * 520);
    },
    render(dt = 0.016) {
      stage.time += dt;
      sharedUniforms.uTime.value = stage.time;
      sky.material.uniforms.time.value = stage.time;
      sky.position.copy(camera.position);
      sky.scale.setScalar(camera.far * 1.1);
      band.position.copy(camera.position);
      band.scale.setScalar(camera.far * 0.86);
      if (composer) composer.render(dt);
      else renderer.render(scene, camera);
    },
    scale: 1,
    // Render at a fraction of full resolution (1 = full). The game lowers
    // this on devices that cannot hold their frame rate.
    setScale(k) {
      stage.scale = Math.max(0.4, Math.min(1, k));
      renderer.setPixelRatio(basePixelRatio * stage.scale);
      stage.resize();
    },
    resize() {
      const w = canvas.clientWidth || innerWidth;
      const h = canvas.clientHeight || innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(w, h);
      }
    },
  };
  stage.resize();
  stage.setFocus(0, 0, 0);
  return stage;
}
