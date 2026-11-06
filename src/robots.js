import * as THREE from "three";
import { damp, dampAngle, lerp, makeRadialCanvas, smoothstep } from "./util.js";

const OUTLINE = 0x0b0b10;

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt, rb, h, seg, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function sphere(r, mat, x = 0, y = 0, z = 0, scale) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), mat);
  mesh.position.set(x, y, z);
  if (scale) mesh.scale.copy(scale);
  mesh.castShadow = true;
  return mesh;
}

function outline(mesh, opacity = 0.42) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 34),
    new THREE.LineBasicMaterial({ color: OUTLINE, transparent: true, opacity }),
  );
  edges.raycast = () => {};
  mesh.add(edges);
  return mesh;
}

export function createRobot(kind = "player") {
  const isPlayer = kind === "player";
  const palette = isPlayer
    ? { armor: 0x8494a8, secondary: 0x2b3240, accent: 0xff6b16, visor: 0x7df7ff, metal: 0xaebdce }
    : { armor: 0x7e343c, secondary: 0x27191f, accent: 0xff3b1c, visor: 0xff6a45, metal: 0xa35b5c };

  const matArmor = new THREE.MeshStandardMaterial({ color: palette.armor, metalness: 0.5, roughness: 0.4, envMapIntensity: 0.9 });
  const matMetal = new THREE.MeshStandardMaterial({ color: palette.metal, metalness: 0.68, roughness: 0.28, envMapIntensity: 1.05 });
  const matSecondary = new THREE.MeshStandardMaterial({ color: palette.secondary, metalness: 0.52, roughness: 0.44, envMapIntensity: 1.0 });
  const matAccent = new THREE.MeshStandardMaterial({
    color: palette.accent, emissive: palette.accent, emissiveIntensity: 1.65,
    metalness: 0.4, roughness: 0.35,
  });
  const matVisor = new THREE.MeshBasicMaterial({ color: palette.visor, toneMapped: false });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x101116, metalness: 0.6, roughness: 0.55 });
  const mats = [matArmor, matMetal, matSecondary, matAccent, matVisor, matDark];
  for (const m of mats) m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Pelvis and waist.
  const pelvis = outline(box(0.68, 0.26, 0.44, matSecondary, 0, 1.02, 0), 0.5);
  body.add(pelvis);
  body.add(box(0.5, 0.18, 0.36, matDark, 0, 1.18, 0));

  // Torso.
  const torso = new THREE.Group();
  torso.position.y = 1.36;
  body.add(torso);

  const chest = outline(box(0.98, 0.78, 0.58, matArmor, 0, 0.34, 0), 0.55);
  torso.add(chest);
  torso.add(box(0.54, 0.3, 0.1, matAccent, 0, 0.38, 0.33));
  const core = sphere(0.1, matVisor, 0, 0.34, 0.36);
  torso.add(core);
  torso.add(box(0.7, 0.12, 0.5, matSecondary, 0, 0.69, 0));
  torso.add(box(0.84, 0.18, 0.5, matMetal, 0, 0.02, 0));
  torso.add(box(0.32, 0.12, 0.06, matDark, -0.24, 0.16, 0.31));
  torso.add(box(0.32, 0.12, 0.06, matDark, 0.24, 0.16, 0.31));

  // Head.
  const head = new THREE.Group();
  head.position.y = 0.86;
  torso.add(head);
  const neck = cyl(0.12, 0.14, 0.16, 8, matDark, 0, -0.06, 0);
  head.add(neck);
  const skull = outline(box(0.5, 0.44, 0.48, matArmor, 0, 0.2, 0), 0.6);
  head.add(skull);
  head.add(box(0.42, 0.09, 0.06, matVisor, 0, 0.23, 0.26));
  head.add(box(0.36, 0.08, 0.05, matDark, 0, 0.08, 0.25));
  head.add(box(0.12, 0.06, 0.06, matAccent, 0, 0.33, 0.26));
  head.add(box(0.07, 0.26, 0.07, matMetal, 0.2, 0.5, -0.02));
  head.add(sphere(0.04, matAccent, 0.2, 0.64, -0.02));
  head.add(box(0.08, 0.1, 0.24, matSecondary, -0.28, 0.2, 0));
  head.add(box(0.08, 0.1, 0.24, matSecondary, 0.28, 0.2, 0));

  // Back thrusters.
  for (const sx of [-0.23, 0.23]) {
    const thruster = cyl(0.1, 0.13, 0.42, 8, matMetal, sx, 0.35, -0.34);
    thruster.rotation.x = 0.06;
    torso.add(thruster);
    torso.add(cyl(0.075, 0.075, 0.08, 8, matAccent, sx, 0.13, -0.34));
  }

  // Shoulders and arms.
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.68, 0.52, 0);
    const pauldron = sphere(0.28, matArmor, 0, 0.05, 0, new THREE.Vector3(1.05, 0.8, 1.1));
    outline(pauldron, 0.55);
    arm.add(pauldron);
    arm.add(box(0.2, 0.44, 0.22, matSecondary, 0, -0.32, 0));
    arm.add(sphere(0.105, matMetal, 0, -0.58, 0));
    arm.add(box(0.17, 0.4, 0.18, matArmor, 0, -0.81, 0));
    arm.add(box(0.2, 0.16, 0.23, matDark, 0, -1.05, 0));
    arm.add(box(0.24, 0.07, 0.28, matAccent, 0, -0.61, 0.02));
    return arm;
  }

  const armL = makeArm(-1);
  const armR = makeArm(1);
  torso.add(armL, armR);

  // Sword in the left hand.
  const sword = new THREE.Group();
  sword.position.set(0, -1.12, 0.06);
  armL.add(sword);
  const grip = cyl(0.045, 0.05, 0.26, 8, matDark, 0, -0.1, 0);
  sword.add(grip);
  sword.add(box(0.3, 0.06, 0.1, matMetal, 0, -0.23, 0));
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xcffaff, emissive: palette.visor, emissiveIntensity: 1.7,
    metalness: 0.9, roughness: 0.16,
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1.42, 0.17), bladeMat);
  blade.position.set(0, -0.96, 0);
  blade.castShadow = true;
  sword.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 4), bladeMat);
  tip.position.set(0, -1.81, 0);
  tip.rotation.z = Math.PI;
  tip.rotation.y = Math.PI / 4;
  sword.add(tip);
  const guard = box(0.14, 0.08, 0.16, matAccent, 0, -0.23, 0);
  sword.add(guard);
  const swordGlowTexture = new THREE.CanvasTexture(makeRadialCanvas(
    `rgba(${isPlayer ? "120,246,255" : "255,120,74"},0.85)`,
    `rgba(${isPlayer ? "30,200,255" : "255,40,10"},0)`,
  ));
  swordGlowTexture.colorSpace = THREE.SRGBColorSpace;
  const swordGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: swordGlowTexture, color: palette.visor, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  swordGlow.position.set(0, -0.92, 0.02);
  swordGlow.scale.set(0.5, 1.55, 1);
  sword.add(swordGlow);
  sword.rotation.x = -0.35;

  // Shoulder-mounted bazooka.
  const bazooka = new THREE.Group();
  bazooka.position.set(0.5, 0.62, 0.02);
  torso.add(bazooka);
  const tube = cyl(0.18, 0.2, 1.48, 12, matArmor, 0, 0, 0.3);
  tube.rotation.x = Math.PI / 2;
  bazooka.add(tube);
  for (const z of [-0.18, 0.18, 0.58]) {
    const band = cyl(0.215, 0.215, 0.07, 12, matSecondary, 0, 0, z + 0.3);
    band.rotation.x = Math.PI / 2;
    bazooka.add(band);
  }
  const muzzleRing = cyl(0.21, 0.21, 0.12, 12, matDark, 0, 0, 1.06);
  muzzleRing.rotation.x = Math.PI / 2;
  bazooka.add(muzzleRing);
  const rear = cyl(0.17, 0.21, 0.28, 12, matSecondary, 0, 0, -0.52);
  rear.rotation.x = Math.PI / 2;
  bazooka.add(rear);
  bazooka.add(box(0.09, 0.22, 0.34, matAccent, 0, 0.18, 0.36));
  bazooka.add(box(0.13, 0.08, 0.42, matDark, -0.12, 0.12, 0.34));
  const rearGlow = cyl(0.11, 0.14, 0.07, 10, matAccent, 0, 0, -0.69);
  rearGlow.rotation.x = Math.PI / 2;
  bazooka.add(rearGlow);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 1.16);
  bazooka.add(muzzle);

  // Legs.
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.3, 1.02, 0);
    leg.add(box(0.3, 0.46, 0.32, matSecondary, 0, -0.24, 0));
    leg.add(sphere(0.12, matMetal, 0, -0.5, 0));
    const shin = box(0.25, 0.44, 0.28, matArmor, 0, -0.73, 0);
    leg.add(shin);
    leg.add(box(0.27, 0.07, 0.3, matAccent, 0, -0.56, 0.01));
    leg.add(box(0.32, 0.16, 0.5, matDark, 0, -0.98, 0.09));
    leg.add(box(0.24, 0.05, 0.1, matMetal, 0, -0.94, 0.36));
    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  body.add(legL, legR);

  // Chest emblem.
  const emblem = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.23, 20), matAccent);
  emblem.position.set(0.52, 0.35, 0.305);
  torso.add(emblem);

  if (!isPlayer) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    ctx.shadowColor = "rgba(255,70,30,0.95)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(255,120,70,0.95)";
    ctx.beginPath();
    ctx.moveTo(64, 92);
    ctx.lineTo(34, 42);
    ctx.lineTo(94, 42);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,245,230,0.9)";
    ctx.beginPath();
    ctx.moveTo(64, 82);
    ctx.lineTo(46, 50);
    ctx.lineTo(82, 50);
    ctx.closePath();
    ctx.fill();
    const markerTex = new THREE.CanvasTexture(c);
    markerTex.colorSpace = THREE.SRGBColorSpace;
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: markerTex, transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
    }));
    marker.position.set(0, 3.25, 0);
    marker.scale.set(0.52, 0.52, 1);
    root.add(marker);
    root.userData.marker = marker;
  }

  const robot = {
    kind,
    root,
    body,
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    sword,
    bazooka,
    muzzle,
    bladeMat,
    mats,
    walkPhase: 0,
    hitFlash: 0,
    deadT: 0,
    baseBodyY: 0,
  };
  root.userData.robot = robot;
  return robot;
}

export function setRobotFlash(robot, amount = 0.9) {
  robot.hitFlash = amount;
}

export function getRobotForward(robot, out = new THREE.Vector3()) {
  return out.set(0, 0, 1).applyQuaternion(robot.root.quaternion);
}

export function getRobotChest(robot, out = new THREE.Vector3()) {
  out.set(0, 1.75, 0.1);
  return robot.root.localToWorld(out);
}

const _v = new THREE.Vector3();

export function animateRobot(robot, dt, state, time) {
  const { speed = 0, aimPitch = 0, swing = -1, recoil = 0, dead = false } = state;
  const moving = speed > 0.35;
  const intensity = Math.min(1, speed / 4.6);

  if (moving) robot.walkPhase += dt * (5.4 + speed * 1.55);
  const phase = robot.walkPhase;
  const amp = moving ? 0.58 * intensity : 0;
  const sin = Math.sin(phase);

  robot.legL.rotation.x = damp(robot.legL.rotation.x, sin * amp, 14, dt);
  robot.legR.rotation.x = damp(robot.legR.rotation.x, -sin * amp, 14, dt);
  robot.armR.rotation.x = damp(robot.armR.rotation.x, -sin * amp * 0.48 - 0.04, 12, dt);
  robot.armR.rotation.z = damp(robot.armR.rotation.z, 0.04, 8, dt);

  const bob = moving ? Math.abs(Math.sin(phase)) * 0.045 * intensity : Math.sin(time * 1.8) * 0.012;
  robot.body.position.y = damp(robot.body.position.y, bob, 12, dt);

  robot.torso.rotation.y = damp(robot.torso.rotation.y, 0, 8, dt);
  robot.head.rotation.y = damp(robot.head.rotation.y, Math.sin(time * 0.7) * 0.05, 2, dt);
  robot.head.rotation.x = damp(robot.head.rotation.x, -aimPitch * 0.15, 6, dt);

  const bazookaAim = -aimPitch * 0.62;
  robot.bazooka.rotation.x = damp(robot.bazooka.rotation.x, bazookaAim, 9, dt);
  robot.bazooka.position.z = damp(robot.bazooka.position.z, 0.02 - recoil * 0.19, 16, dt);

  // Left sword arm: idle sway, or a diagonal slash.
  if (swing >= 0 && swing <= 1) {
    const wind = smoothstep(0, 0.25, swing);
    const cut = smoothstep(0.2, 0.62, swing);
    const recover = smoothstep(0.62, 1, swing);
    const y = lerp(0.35, -0.05, wind) + (-1.3 + 0.05) * cut + (1.25) * recover;
    const x = lerp(-0.12, -0.9, wind) + 0.45 * cut + 0.45 * recover;
    const z = lerp(0.16, 0.55, cut) - 0.4 * recover;
    robot.armL.rotation.y = y;
    robot.armL.rotation.x = x;
    robot.armL.rotation.z = z;
    robot.sword.rotation.x = lerp(-0.35, -0.05, cut);
  } else {
    robot.armL.rotation.y = damp(robot.armL.rotation.y, 0.08, 8, dt);
    robot.armL.rotation.x = damp(robot.armL.rotation.x, -0.12 + Math.sin(time * 1.5) * 0.025, 6, dt);
    robot.armL.rotation.z = damp(robot.armL.rotation.z, 0.5, 6, dt);
    robot.sword.rotation.x = damp(robot.sword.rotation.x, -0.35, 6, dt);
  }

  if (dead) {
    robot.deadT = Math.min(1, robot.deadT + dt * 1.9);
    const t = robot.deadT;
    robot.root.rotation.z = lerp(0, -1.28, t * t);
    robot.body.position.y = lerp(robot.body.position.y, -0.62 * t, 0.15);
    robot.head.rotation.x = lerp(0, 0.4, t);
    robot.armL.rotation.x = lerp(robot.armL.rotation.x, -0.6, t * 0.3);
    robot.armR.rotation.x = lerp(robot.armR.rotation.x, 0.7, t * 0.3);
  } else {
    robot.deadT = 0;
    robot.root.rotation.z = damp(robot.root.rotation.z, 0, 6, dt);
  }

  // Hit flash.
  if (robot.root.userData.marker) {
    robot.root.userData.marker.position.y = 3.2 + Math.sin(time * 2.1) * 0.09;
  }

  if (robot.hitFlash > 0) {
    robot.hitFlash = Math.max(0, robot.hitFlash - dt * 3.2);
    const f = robot.hitFlash;
    for (const m of robot.mats) {
      if (m.emissive) {
        m.emissive.setRGB(
          Math.min(1, (m.userData.baseEmissive?.r ?? 0) + f * 1.4),
          Math.min(1, (m.userData.baseEmissive?.g ?? 0) + f * 0.5),
          Math.min(1, (m.userData.baseEmissive?.b ?? 0) + f * 0.35),
        );
      }
    }
    robot.bladeMat.emissiveIntensity = 1.7 + f * 4;
  } else {
    for (const m of robot.mats) {
      if (m.emissive && m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive);
    }
    robot.bladeMat.emissiveIntensity = 1.7;
  }
}

export function pointRobotAt(robot, worldPoint, dt, turnSpeed = 12) {
  _v.copy(worldPoint).sub(robot.root.position);
  const target = Math.atan2(_v.x, _v.z);
  robot.root.rotation.y = dampAngle(robot.root.rotation.y, target, turnSpeed, dt);
}

export function faceYaw(robot, yaw, dt, turnSpeed = 14) {
  robot.root.rotation.y = dampAngle(robot.root.rotation.y, yaw, turnSpeed, dt);
}
