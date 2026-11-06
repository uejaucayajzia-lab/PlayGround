import * as THREE from "three";
import {
  clamp, fbm, lerp, makeRadialCanvas, mulberry32, randRange,
  smoothstep, TAU,
} from "./util.js";

export const ARENA = { halfX: 46, halfZ: 36 };

export const LAVA_POOLS = [
  { cx: -25, cz: 4, rx: 11.5, rz: 5.2, rot: 0.35, seed: 12 },
  { cx: 24, cz: -7, rx: 9.5, rz: 6.4, rot: -0.45, seed: 43 },
  { cx: -18, cz: 27, rx: 8.5, rz: 3.8, rot: -0.2, seed: 71 },
  { cx: 24, cz: 25, rx: 6.8, rz: 4.6, rot: 0.6, seed: 97 },
  { cx: 37, cz: 10, rx: 4.6, rz: 3.1, rot: 0.1, seed: 133 },
  { cx: 0, cz: -27, rx: 15.5, rz: 3.4, rot: 0.02, seed: 177 },
];

export function terrainHeight(x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const edge = smoothstep(0, 1, Math.max((ax - 45) / 22, (az - 34) / 18));
  const broad = (fbm(x * 0.075 + 13.2, z * 0.075 - 7.1, 4) - 0.5) * 1.15;
  const detail = (fbm(x * 0.28 - 4.4, z * 0.28 + 9.5, 3) - 0.5) * 0.22;
  const rim = Math.pow(edge, 1.55) * 9.5;
  return (broad + detail) * (0.16 + edge * 1.8) + rim;
}

function makeGround(scene) {
  const geo = new THREE.PlaneGeometry(170, 140, 170, 140);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0x3b3136);
  const cB = new THREE.Color(0x746157);
  const cC = new THREE.Color(0x8d6c52);
  const cDark = new THREE.Color(0x241c20);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.13 + 4.2, z * 0.13 - 2.4, 4);
    const n2 = fbm(x * 0.55, z * 0.55, 2);
    tmp.copy(cA).lerp(cB, smoothstep(0.28, 0.78, n)).lerp(cC, smoothstep(0.62, 0.92, n2) * 0.32);
    tmp.lerp(cDark, smoothstep(1.4, 7.0, h) * 0.75);
    const shade = 0.8 + n2 * 0.3;
    colors[i * 3] = tmp.r * shade;
    colors[i * 3 + 1] = tmp.g * shade;
    colors[i * 3 + 2] = tmp.b * shade;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.06,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);

  // Engraved arena circle.
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff6b21, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(12.1, 12.28, 128), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.24;
  scene.add(ring);
  const inner = new THREE.Mesh(new THREE.RingGeometry(11.55, 11.68, 128), ringMat.clone());
  inner.material.opacity = 0.12;
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.24;
  scene.add(inner);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1.8), ringMat.clone());
    tick.material.opacity = i % 2 ? 0.18 : 0.33;
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = -a;
    tick.position.set(Math.cos(a) * 12.9, 0.24, Math.sin(a) * 12.9);
    scene.add(tick);
  }
  return mesh;
}

function createBoulderGeometries() {
  const rng = mulberry32(9137);
  const list = [];
  for (let v = 0; v < 7; v++) {
    const geo = new THREE.IcosahedronGeometry(1, v < 4 ? 1 : 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = fbm(x * 2.2 + v * 8.3, z * 2.2 - v * 4.1 + y * 1.7, 3);
      const scale = 0.72 + n * 0.62;
      pos.setXYZ(i, x * scale, y * (scale * 0.92), z * scale);
    }
    geo.computeVertexNormals();
    list.push(geo);
  }
  return list;
}

function makeRock(scene, geos, rng, x, z, sx, sy, sz, colliderList, tint) {
  const geo = geos[Math.floor(rng() * geos.length)];
  const grey = 0.15 + rng() * 0.15;
  const color = new THREE.Color().setHSL(0.055 + rng() * 0.035, 0.12 + rng() * 0.12, grey);
  if (tint) color.lerp(new THREE.Color(tint), 0.28);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.08, flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, terrainHeight(x, z) + sy * 0.34 - 0.35, z);
  mesh.rotation.set(rng() * 0.4 - 0.2, rng() * TAU, rng() * 0.3 - 0.15);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (colliderList && sx > 1.1) {
    colliderList.push({ x, z, r: Math.min(sx, sz) * 0.68, h: sy });
  }
  return mesh;
}

function buildRockField(scene) {
  const rng = mulberry32(2287);
  const geos = createBoulderGeometries();
  const colliders = [];

  // Big rocks hugging each lava pool.
  for (const pool of LAVA_POOLS) {
    const count = Math.round((pool.rx + pool.rz) * 0.75);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rng() * 0.4;
      const off = 1.16 + rng() * 0.38;
      const x = pool.cx + Math.cos(a) * pool.rx * off;
      const z = pool.cz + Math.sin(a) * pool.rz * off;
      if (Math.abs(x) > 47 || Math.abs(z) > 37) continue;
      if (Math.hypot(x, z - 14) < 6 || Math.hypot(x, z + 14) < 6) continue;
      const s = 0.7 + rng() * 1.5;
      makeRock(scene, geos, rng, x, z, s * (0.9 + rng() * 0.5), s * (0.65 + rng() * 0.5), s, colliders, 0x5b3628);
    }
  }

  // Scattered arena boulders, kept out of the central duel lane.
  let placed = 0;
  let guard = 0;
  while (placed < 22 && guard++ < 300) {
    const x = (rng() * 2 - 1) * 43;
    const z = (rng() * 2 - 1) * 33;
    const central = Math.abs(x) < 10 && Math.abs(z) < 24;
    const spawn = Math.hypot(x, z - 14) < 7 || Math.hypot(x, z + 14) < 7;
    if (central || spawn) continue;
    if (LAVA_POOLS.some((p) => ((x - p.cx) / (p.rx * 1.5)) ** 2 + ((z - p.cz) / (p.rz * 1.7)) ** 2 < 1)) continue;
    const s = 0.55 + rng() * 1.35;
    makeRock(scene, geos, rng, x, z, s * (0.85 + rng() * 0.55), s * (0.7 + rng() * 0.55), s, colliders);
    placed++;
  }

  // Small loose gravel and rubble across the arena floor.
  for (let i = 0; i < 68; i++) {
    const x = (rng() * 2 - 1) * 44;
    const z = (rng() * 2 - 1) * 34;
    if (Math.hypot(x, z - 12) < 3 || Math.hypot(x, z + 12) < 3) continue;
    if (LAVA_POOLS.some((p) => ((x - p.cx) / (p.rx * 1.12)) ** 2 + ((z - p.cz) / (p.rz * 1.2)) ** 2 < 1)) continue;
    const s = 0.12 + rng() * 0.34;
    makeRock(scene, geos, rng, x, z, s * (0.8 + rng() * 0.6), s * 0.7, s, null, 0x3a2b25);
  }

  // Boundary cliffs.
  for (let side = -1; side <= 1; side += 2) {
    for (let z = -48; z <= 48; z += 6.2) {
      const x = side * (52 + rng() * 5);
      const s = 5.2 + rng() * 4.6;
      makeRock(scene, geos, rng, x, z + rng() * 3, s, (s * 1.15) + rng() * 4, s * 0.9, null, 0x35262d);
    }
    for (let x = -54; x <= 54; x += 6.4) {
      const z = side * (41 + rng() * 5);
      const s = 4.6 + rng() * 4.4;
      makeRock(scene, geos, rng, x + rng() * 3, z, s, (s * 1.1) + rng() * 3.4, s * 0.9, null, 0x35262d);
    }
  }

  // Distant mesas and spires.
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0x4a3038, roughness: 0.98, metalness: 0.03, flatShading: true, emissive: 0x241318, emissiveIntensity: 0.85 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + rng() * 0.2;
    const dist = 72 + rng() * 38;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const h = 14 + rng() * 22;
    const geo = new THREE.CylinderGeometry(4 + rng() * 8, 11 + rng() * 13, h, 6, 2);
    const mesh = new THREE.Mesh(geo, mesaMat);
    mesh.position.set(x, h * 0.4 - 5, z);
    mesh.rotation.y = rng() * TAU;
    scene.add(mesh);
  }

  return colliders;
}

function lavaShape(pool) {
  const shape = new THREE.Shape();
  const points = 52;
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * TAU;
    const wobble = 1
      + Math.sin(a * 3 + pool.seed) * 0.11
      + Math.sin(a * 5 - pool.seed * 0.7) * 0.07
      + Math.sin(a * 7 + pool.seed * 1.3) * 0.04;
    const x = Math.cos(a) * pool.rx * wobble;
    const y = Math.sin(a) * pool.rz * wobble;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape, 4);
}

const LAVA_VERT = /* glsl */`
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const LAVA_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vWorld;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.07 + vec2(3.1, 1.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vWorld.xz * 0.24 + uSeed;
    float t = uTime;
    float n = fbm(p * 1.4 + vec2(t * 0.10, -t * 0.07));
    float n2 = fbm(p * 3.2 - vec2(t * 0.16, t * 0.11) + 11.4);
    float veins = smoothstep(0.38, 0.72, n2 + n * 0.35);
    float hot = smoothstep(0.28, 0.82, n);
    vec3 deep = vec3(0.3, 0.025, 0.004);
    vec3 mid = vec3(0.92, 0.16, 0.008);
    vec3 hotc = vec3(1.3, 0.43, 0.07);
    vec3 col = mix(deep, mid, smoothstep(0.16, 0.7, n));
    col = mix(col, hotc, pow(veins, 1.7) * 0.95);
    col += vec3(0.8, 0.11, 0.0) * hot * 0.26;
    float pulse = 0.91 + 0.09 * sin(t * 1.5 + uSeed * 3.1 + n * 5.0);
    col *= pulse;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function buildLava(scene, glowTexture) {
  const bubbles = [];
  const lights = [];
  const glowSprites = [];
  const bubbleGeo = new THREE.IcosahedronGeometry(1, 1);
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xff5a10, emissive: 0xff4d0a, emissiveIntensity: 3.2,
    roughness: 0.25, metalness: 0.1,
  });

  for (const pool of LAVA_POOLS) {
    const geo = lavaShape(pool);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: pool.seed * 0.41 } },
      vertexShader: LAVA_VERT,
      fragmentShader: LAVA_FRAG,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = pool.rot;
    mesh.position.set(pool.cx, 0.19, pool.cz);
    scene.add(mesh);
    pool.material = mat;

    // Wide ambient glow bed.
    const glowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(pool.rx * 3.3, pool.rz * 3.1),
      new THREE.MeshBasicMaterial({
        map: glowTexture, color: 0xff4d10, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.rotation.z = pool.rot;
    glowPlane.position.set(pool.cx, 0.05, pool.cz);
    scene.add(glowPlane);
    glowSprites.push(glowPlane);

    const light = new THREE.PointLight(0xff5d16, 65, 30, 2);
    light.position.set(pool.cx, 2.2, pool.cz);
    scene.add(light);
    lights.push({ light, base: 65, seed: pool.seed });

    const count = Math.round(8 + (pool.rx + pool.rz) * 0.75);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * 0.72;
      bubbles.push({
        x: pool.cx + Math.cos(a) * pool.rx * r,
        z: pool.cz + Math.sin(a) * pool.rz * r,
        phase: Math.random(), speed: 0.16 + Math.random() * 0.24,
        size: 0.055 + Math.random() * 0.12,
      });
    }
  }

  const inst = new THREE.InstancedMesh(bubbleGeo, bubbleMat, bubbles.length);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  scene.add(inst);
  const dummy = new THREE.Object3D();

  return {
    lights, glowSprites, inst, bubbles, dummy,
    update(time) {
      for (const pool of LAVA_POOLS) pool.material.uniforms.uTime.value = time;
      for (const { light, base, seed } of lights) {
        light.intensity = base * (0.82 + Math.sin(time * 2.1 + seed) * 0.09 + Math.sin(time * 5.3 + seed * 2.0) * 0.05);
      }
      for (const g of glowSprites) {
        g.material.opacity = 0.17 + Math.sin(time * 1.4 + g.position.x) * 0.025;
      }
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const t = (time * b.speed + b.phase) % 1;
        const scale = b.size * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.7 + t * 0.8);
        const y = 0.18 + t * 0.18;
        dummy.position.set(b.x, y, b.z);
        dummy.scale.setScalar(Math.max(0.001, scale));
        dummy.rotation.set(t * 3, t * 4, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    },
  };
}

function makeCracks(scene) {
  const rng = mulberry32(5571);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff5c14, transparent: true, opacity: 0.72,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  for (let i = 0; i < 9; i++) {
    const pool = LAVA_POOLS[i % LAVA_POOLS.length];
    const a = rng() * TAU;
    const startX = pool.cx + Math.cos(a) * pool.rx * 1.08;
    const startZ = pool.cz + Math.sin(a) * pool.rz * 1.08;
    const dir = a + (rng() - 0.5) * 0.8;
    const pts = [];
    let x = startX, z = startZ;
    for (let j = 0; j < 5; j++) {
      x += Math.cos(dir + (rng() - 0.5) * 0.9) * (1.4 + rng() * 2.2);
      z += Math.sin(dir + (rng() - 0.5) * 0.9) * (1.4 + rng() * 2.2);
      pts.push(new THREE.Vector3(x, terrainHeight(x, z) + 0.06, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 14, 0.045 + rng() * 0.035, 4, false);
    scene.add(new THREE.Mesh(geo, mat));
  }
}

function makeSky(scene) {
  const geo = new THREE.SphereGeometry(420, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 top = vec3(0.022, 0.018, 0.045);
        vec3 mid = vec3(0.115, 0.045, 0.075);
        vec3 low = vec3(0.62, 0.19, 0.075);
        vec3 col = mix(low, mid, smoothstep(-0.06, 0.22, h));
        col = mix(col, top, smoothstep(0.2, 0.85, h));
        vec3 sunDir = normalize(vec3(-0.35, 0.14, -0.62));
        float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 26.0);
        col += vec3(1.4, 0.48, 0.14) * sun * 0.75;
        float haze = pow(max(0.0, 1.0 - abs(h) * 4.0), 3.0);
        col += vec3(0.32, 0.075, 0.022) * haze * 0.45;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

function makeEnvironment(scene) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#0a0814");
  g.addColorStop(0.36, "#241428");
  g.addColorStop(0.52, "#8a3a1b");
  g.addColorStop(0.58, "#ff7a35");
  g.addColorStop(0.66, "#3a1712");
  g.addColorStop(1, "#140b0c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  const sun = ctx.createRadialGradient(300, 270, 0, 300, 270, 140);
  sun.addColorStop(0, "rgba(255,225,180,1)");
  sun.addColorStop(0.3, "rgba(255,140,60,0.7)");
  sun.addColorStop(1, "rgba(255,80,20,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = `rgba(10,8,12,${0.05 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 1024, 120 + Math.random() * 160, 30 + Math.random() * 160, 8 + Math.random() * 40, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = tex;
  scene.environmentIntensity = 0.7;
}

export function createWorld(scene) {
  scene.fog = new THREE.Fog(0x180d11, 58, 190);
  makeEnvironment(scene);
  const glowCanvas = makeRadialCanvas("rgba(255,186,102,0.95)", "rgba(255,60,4,0)");
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;

  makeSky(scene);
  makeGround(scene);
  const colliders = buildRockField(scene);
  const lava = buildLava(scene, glowTexture);
  makeCracks(scene);

  const hemi = new THREE.HemisphereLight(0x9b8ab8, 0x5a2a12, 1.45);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0x6a4654, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffc79a, 2.15);
  sun.position.set(-32, 52, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -62;
  sun.shadow.camera.right = 62;
  sun.shadow.camera.top = 58;
  sun.shadow.camera.bottom = -58;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  const rim = new THREE.DirectionalLight(0x5a86ff, 0.55);
  rim.position.set(30, 24, -46);
  scene.add(rim);

  const centerFill = new THREE.PointLight(0xffb27a, 55, 90, 2);
  centerFill.position.set(0, 14, 4);
  scene.add(centerFill);

  const coolFill = new THREE.DirectionalLight(0x7fa4ff, 0.42);
  coolFill.position.set(-18, 22, 34);
  scene.add(coolFill);

  // Floating embers.
  const emberCount = 260;
  const emberPos = new Float32Array(emberCount * 3);
  const emberData = [];
  const rng = mulberry32(881);
  for (let i = 0; i < emberCount; i++) {
    const x = (rng() * 2 - 1) * 52;
    const z = (rng() * 2 - 1) * 40;
    const y = 0.4 + rng() * 11;
    emberPos.set([x, y, z], i * 3);
    emberData.push({ speed: 0.35 + rng() * 0.9, phase: rng() * TAU, drift: 0.2 + rng() * 0.4 });
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({
    map: glowTexture, color: 0xff8a3c, size: 0.17, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  scene.add(embers);

  const clock = { t: 0 };
  return {
    colliders,
    lava,
    sun,
    update(dt) {
      clock.t += dt;
      const t = clock.t;
      lava.update(t);
      const arr = emberGeo.attributes.position.array;
      for (let i = 0; i < emberCount; i++) {
        const d = emberData[i];
        arr[i * 3 + 1] += d.speed * dt;
        arr[i * 3] += Math.sin(t * 0.6 + d.phase) * d.drift * dt;
        arr[i * 3 + 2] += Math.cos(t * 0.5 + d.phase) * d.drift * dt;
        if (arr[i * 3 + 1] > 13) {
          arr[i * 3 + 1] = 0.25;
          arr[i * 3] = (Math.random() * 2 - 1) * 52;
          arr[i * 3 + 2] = (Math.random() * 2 - 1) * 40;
        }
      }
      emberGeo.attributes.position.needsUpdate = true;
      embers.material.opacity = 0.72 + Math.sin(t * 2.3) * 0.06;
    },
  };
}
