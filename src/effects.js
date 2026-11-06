import * as THREE from "three";
import { makeRadialCanvas, makeRingCanvas } from "./util.js";

const MAX_PARTICLES = 900;

export function createEffects(scene) {
  const sparkCanvas = makeRadialCanvas("rgba(255,255,255,1)", "rgba(255,255,255,0)");
  const sparkTexture = new THREE.CanvasTexture(sparkCanvas);
  sparkTexture.colorSpace = THREE.SRGBColorSpace;
  const ringTexture = new THREE.CanvasTexture(makeRingCanvas());
  ringTexture.colorSpace = THREE.SRGBColorSpace;

  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  positions.fill(-999);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    map: sparkTexture, size: 0.32, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true,
    sizeAttenuation: true, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({
      alive: false, life: 0, maxLife: 1, drag: 1, gravity: 0,
      vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, size: 1,
    });
  }
  let cursor = 0;

  const explosionLight = new THREE.PointLight(0xff7a2a, 0, 26, 2);
  scene.add(explosionLight);
  let explosionLightT = 0;

  const activeRings = [];
  const activeSlashes = [];
  const texts = [];
  const textCache = new Map();

  const tmpColor = new THREE.Color();
  const tmpVec = new THREE.Vector3();
  const dummy = new THREE.Object3D();

  function spawnParticle(x, y, z, vx, vy, vz, color, life, size, gravity = -8, drag = 0.9) {
    const i = cursor;
    const p = particles[i];
    cursor = (cursor + 1) % MAX_PARTICLES;
    p.alive = true;
    p.life = life;
    p.maxLife = life;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.gravity = gravity;
    p.drag = drag;
    p.r = color.r; p.g = color.g; p.b = color.b;
    p.size = size;
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
  }

  function burst(pos, colorHex, count = 24, power = 9, life = 0.8, gravity = -10, size = 1) {
    const color = tmpColor.set(colorHex);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = power * (0.25 + Math.random() * 0.75);
      spawnParticle(
        pos.x, pos.y, pos.z,
        Math.sin(phi) * Math.cos(theta) * sp,
        Math.abs(Math.cos(phi)) * sp * 0.9 + 2,
        Math.sin(phi) * Math.sin(theta) * sp,
        color, life * (0.55 + Math.random() * 0.7),
        size * (0.5 + Math.random()), gravity, 50,
      );
    }
  }

  function trail(pos, colorHex, size = 0.5) {
    const color = tmpColor.set(colorHex);
    spawnParticle(
      pos.x + (Math.random() - 0.5) * 0.12,
      pos.y + (Math.random() - 0.5) * 0.12,
      pos.z + (Math.random() - 0.5) * 0.12,
      (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 0.5 + 0.5,
      (Math.random() - 0.5) * 0.8,
      color, 0.34 + Math.random() * 0.25, size, 2.2, 10,
    );
  }

  function flash(pos, colorHex = 0xffa04a, size = 5) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sparkTexture, color: colorHex, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(pos);
    sprite.scale.setScalar(size);
    scene.add(sprite);
    activeRings.push({ sprite, t: 0, dur: 0.24, from: size * 0.5, to: size * 1.8, fade: true });
  }

  function shockwave(pos, colorHex = 0xffa04a, size = 10) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringTexture, color: colorHex, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(pos);
    sprite.scale.setScalar(1);
    scene.add(sprite);
    activeRings.push({ sprite, t: 0, dur: 0.5, from: 1, to: size, fade: true });
  }

  function explode(pos, colorHex = 0xff7a2a, big = false) {
    burst(pos, 0xffc266, big ? 46 : 26, big ? 16 : 10, big ? 1.2 : 0.8, -9, big ? 1.7 : 1.1);
    burst(pos, colorHex, big ? 30 : 16, big ? 12 : 8, big ? 1 : 0.65, -6, big ? 1.2 : 0.85);
    shockwave(pos, colorHex, big ? 12 : 6.5);
    flash(pos, 0xffb15a, big ? 9 : 5);
    explosionLight.position.copy(pos);
    explosionLight.position.y += 0.8;
    explosionLight.color.set(colorHex);
    explosionLightT = big ? 0.45 : 0.28;
    explosionLight.intensity = big ? 260 : 120;
  }

  function slash(position, yaw, colorHex, scale = 1) {
    const group = new THREE.Group();
    group.position.copy(position);
    group.position.y += 1.35;
    group.rotation.y = yaw - 0.5;
    const geo = new THREE.TorusGeometry(1.35 * scale, 0.06 * scale, 4, 34, Math.PI * 1.35);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const arc = new THREE.Mesh(geo, mat);
    arc.rotation.x = -Math.PI / 2;
    group.add(arc);
    const mat2 = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Mesh(new THREE.TorusGeometry(1.35 * scale, 0.2 * scale, 4, 34, Math.PI * 1.35), mat2);
    glow.rotation.x = -Math.PI / 2;
    group.add(glow);
    scene.add(group);
    activeSlashes.push({ group, t: 0, dur: 0.34, mats: [mat, mat2], baseYaw: group.rotation.y });
  }

  function makeTextTexture(text, color, fontSize = 76) {
    const key = `${text}|${color}|${fontSize}`;
    if (textCache.has(key)) return textCache.get(key);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 512; canvas.height = 160;
    ctx.clearRect(0, 0, 512, 160);
    ctx.font = `900 ${fontSize}px Orbitron, Arial Black, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 84);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `900 ${Math.max(20, fontSize * 0.82)}px Orbitron, Arial Black, sans-serif`;
    ctx.globalAlpha = 0.35;
    ctx.fillText(text, 256, 82);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    textCache.set(key, tex);
    return tex;
  }

  function floatingText(pos, text, color = "#7df7ff", scale = 1) {
    const tex = makeTextTexture(text, color);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    }));
    sprite.position.copy(pos);
    sprite.position.y += 2.35;
    sprite.scale.set(4.2 * scale, 1.32 * scale, 1);
    scene.add(sprite);
    texts.push({ sprite, t: 0, dur: 1.15, baseY: sprite.position.y });
  }

  function update(dt) {
    // Particles.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        positions[i * 3 + 1] = -999;
        continue;
      }
      const dragF = Math.exp(-p.drag * dt);
      p.vx *= dragF; p.vz *= dragF;
      p.vy += p.gravity * dt;
      positions[i * 3] += p.vx * dt;
      positions[i * 3 + 1] += p.vy * dt;
      positions[i * 3 + 2] += p.vz * dt;
      const k = Math.min(1, p.life / (p.maxLife * 0.6));
      colors[i * 3] = p.r * k;
      colors[i * 3 + 1] = p.g * k;
      colors[i * 3 + 2] = p.b * k;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    if (explosionLightT > 0) {
      explosionLightT -= dt;
      explosionLight.intensity *= Math.pow(0.01, dt);
      if (explosionLightT <= 0) explosionLight.intensity = 0;
    }

    for (let i = activeRings.length - 1; i >= 0; i--) {
      const r = activeRings[i];
      r.t += dt;
      const u = Math.min(1, r.t / r.dur);
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - u, 3));
      r.sprite.scale.setScalar(s);
      r.sprite.material.opacity = (1 - u) * 0.9;
      if (u >= 1) {
        scene.remove(r.sprite);
        r.sprite.material.dispose();
        activeRings.splice(i, 1);
      }
    }

    for (let i = activeSlashes.length - 1; i >= 0; i--) {
      const s = activeSlashes[i];
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      s.group.rotation.y = s.baseYaw + u * 2.1;
      s.group.scale.setScalar(0.9 + u * 0.35);
      s.mats[0].opacity = (1 - u) * 0.95;
      s.mats[1].opacity = (1 - u) * 0.2;
      if (u >= 1) {
        scene.remove(s.group);
        s.group.traverse((o) => {
          if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
        });
        activeSlashes.splice(i, 1);
      }
    }

    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      const u = Math.min(1, t.t / t.dur);
      t.sprite.position.y = t.baseY + u * 1.4;
      t.sprite.material.opacity = u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
      const pop = u < 0.12 ? 0.65 + u * 3 : 1;
      t.sprite.scale.set(4.2 * pop, 1.32 * pop, 1);
      if (u >= 1) {
        scene.remove(t.sprite);
        t.sprite.material.dispose();
        texts.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const p of particles) { p.alive = false; }
    positions.fill(-999);
    geo.attributes.position.needsUpdate = true;
    for (const r of activeRings) { scene.remove(r.sprite); r.sprite.material.dispose(); }
    activeRings.length = 0;
    for (const s of activeSlashes) {
      scene.remove(s.group);
      s.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    activeSlashes.length = 0;
    for (const t of texts) { scene.remove(t.sprite); t.sprite.material.dispose(); }
    texts.length = 0;
    explosionLight.intensity = 0;
    explosionLightT = 0;
  }

  return {
    points, explode, burst, trail, flash, shockwave, slash, floatingText, update, clear,
    get particleCount() { return particles.filter((p) => p.alive).length; },
  };
}

export function createRocketMesh(owner, glowTexture) {
  const isPlayer = owner === "player";
  const color = isPlayer ? 0x7df7ff : 0xff6a2a;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x9ee9f2 : 0x4a302a,
    emissive: color, emissiveIntensity: 2.0, metalness: 0.65, roughness: 0.3,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.42, 8), bodyMat);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), bodyMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.3;
  group.add(tip);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x1a171c, metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.18), finMat);
    fin.position.z = -0.16;
    fin.rotation.z = (i / 3) * Math.PI * 2;
    fin.position.x = Math.cos((i / 3) * Math.PI * 2) * 0.12;
    fin.position.y = Math.sin((i / 3) * Math.PI * 2) * 0.12;
    group.add(fin);
  }
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(1.25);
  group.add(glow);
  group.userData.glowMat = glowMat;
  group.userData.bodyMat = bodyMat;
  return group;
}
