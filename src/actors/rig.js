import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder, GEO } from '../engine/build.js';

// Characters are a tree of joints. Each joint carries one baked mesh, so a
// whole animal is a dozen draw calls and animating it is just turning joints.
export class Rig {
  constructor(opts = {}) {
    this.root = new THREE.Group();
    this.joints = {};
    this.builders = new Map();
    this.meshes = [];
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: opts.roughness ?? 0.88,
      metalness: 0,
    });
    // A soft rim of light around the outline, the way fur catches the sun.
    // It also keeps a near-black ape readable against a dark street.
    this.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.6);
          totalEmissiveRadiance += (diffuseColor.rgb * 1.6 + vec3(0.05, 0.055, 0.07)) * rim * 0.9;
        }`
      );
    };
    this.material.customProgramCacheKey = () => 'rig-rim';
    this.ball = GEO.sphere(14, 10);
  }

  joint(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    (parent || this.root).add(g);
    this.joints[name] = g;
    this.builders.set(g, new MeshBuilder());
    return g;
  }

  // The builder that draws into a joint.
  on(joint) {
    return this.builders.get(joint);
  }

  // A smooth ellipsoid centred on (x, y, z): the building block of every animal.
  blob(joint, color, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    this.builders.get(joint).add(this.ball, color, x, y, z, sx, sy, sz, ry, rx, rz);
    return this;
  }

  finish() {
    for (const [g, mb] of this.builders) {
      if (!mb.parts.length) continue;
      // Merged here rather than with MeshBuilder.build so the round shapes
      // keep their smooth normals.
      const geo = mergeGeometries(mb.parts, false);
      for (const p of mb.parts) p.dispose();
      mb.parts = [];
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
      g.add(mesh);
      this.meshes.push(mesh);
    }
    this.builders.clear();
    return this;
  }

  // Draws the character again in a flat colour wherever a building hides it,
  // so the player never loses track of the ape behind a tower.
  addSilhouette(color = 0xff7a3c) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `
        #include <clipping_planes_pars_vertex>
        void main() {
          #include <begin_vertex>
          #include <project_vertex>
          #include <clipping_planes_vertex>
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        #include <clipping_planes_pars_fragment>
        void main() {
          #include <clipping_planes_fragment>
          if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
          gl_FragColor = vec4(uColor, 1.0);
          #include <colorspace_fragment>
        }`,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      clipping: true,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2)],
    });
    this.ghosts = [];
    for (const mesh of this.meshes) {
      const ghost = new THREE.Mesh(mesh.geometry, mat);
      ghost.renderOrder = 1;
      mesh.parent.add(ghost);
      this.ghosts.push(ghost);
    }
  }

  setFlash(amount, color = 0xffffff) {
    this.material.emissive.set(color).multiplyScalar(amount);
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
