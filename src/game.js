import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createWorld, terrainHeight, ARENA } from "./world.js";
import {
  animateRobot, createRobot, faceYaw, getRobotChest, pointRobotAt, setRobotFlash,
} from "./robots.js";
import { createEffects, createRocketMesh } from "./effects.js";
import { createAudio } from "./audio.js";
import { clamp, damp, dampAngle, lerp, makeRadialCanvas, smoothstep } from "./util.js";

const PLAYER_MAX_HP = 110;
const ENEMY_MAX_HP = 120;
const FIRE_CD = 1.05;
const SWORD_CD = 0.52;
const PLAYER_SPEED = 5.9;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const FORWARD_Z = new THREE.Vector3(0, 0, 1);

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export class Game {
  constructor() {
    this.canvas = document.getElementById("stage");
    this.menuEl = document.getElementById("menu");
    this.hudEl = document.getElementById("hud");
    this.loadingEl = document.getElementById("loading");
    this.endEl = document.getElementById("endScreen");
    this.startBtn = document.getElementById("startBtn");
    this.restartBtn = document.getElementById("restartBtn");
    this.menuBtn = document.getElementById("menuBtn");
    this.muteBtn = document.getElementById("muteBtn");
    this.fireBtn = document.getElementById("fireBtn");
    this.swordBtn = document.getElementById("swordBtn");
    this.moveZone = document.getElementById("moveZone");
    this.stickBase = document.getElementById("stickBase");
    this.stickKnob = document.getElementById("stickKnob");
    this.countdownEl = document.getElementById("countdown");
    this.reticleEl = document.getElementById("reticle");
    this.hintEl = document.getElementById("hint");
    this.hintText = document.getElementById("hintText");
    this.toastEl = document.getElementById("toast");
    this.damageFlashEl = document.getElementById("damageFlash");
    this.parryFlashEl = document.getElementById("parryFlash");
    this.playerHpFill = document.getElementById("playerHpFill");
    this.playerHpText = document.getElementById("playerHpText");
    this.enemyHpFill = document.getElementById("enemyHpFill");
    this.playerCard = this.playerHpFill.closest(".player-card");
    this.playerStateEl = document.getElementById("playerState");
    this.timeText = document.getElementById("timeText");
    this.parryText = document.getElementById("parryText");
    this.fireCd = document.getElementById("fireCd");
    this.swordCd = document.getElementById("swordCd");
    this.endEyebrow = document.getElementById("endEyebrow");
    this.endTitle = document.getElementById("endTitle");
    this.endSub = document.getElementById("endSub");
    this.endTime = document.getElementById("endTime");
    this.endParries = document.getElementById("endParries");
    this.endDamage = document.getElementById("endDamage");

    this.isTouch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    this.audio = createAudio();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: "high-performance",
      alpha: false, stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);

    this.world = createWorld(this.scene);
    this.effects = createEffects(this.scene);

    const glowTex = new THREE.CanvasTexture(makeRadialCanvas("rgba(255,220,180,1)", "rgba(255,90,20,0)"));
    glowTex.colorSpace = THREE.SRGBColorSpace;
    this.rocketGlowTexture = glowTex;

    this.player = createRobot("player");
    this.enemy = createRobot("enemy");
    this.scene.add(this.player.root, this.enemy.root);

    this.player.root.position.set(-3, terrainHeight(-3, 10), 10);
    this.player.root.rotation.y = Math.PI;
    this.enemy.root.position.set(3, terrainHeight(3, -10), -10);
    this.enemy.root.rotation.y = 0;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.46, 0.42, 0.8);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);

    this.state = "menu";
    this.time = 0;
    this.matchTime = 0;
    this.lastCount = 4;
    this.countdownT = 0;
    this.parries = 0;
    this.damageDealt = 0;
    this.playerHealth = PLAYER_MAX_HP;
    this.enemyHealth = ENEMY_MAX_HP;
    this.playerDead = false;
    this.enemyDead = false;
    this.overT = 0;
    this.endShown = false;
    this.slowT = 0;
    this.shake = 0;
    this.endWin = false;

    this.camYaw = Math.PI;
    this.aimPitch = -0.035;
    this.camDist = this.camera.aspect < 1 ? 10.2 : 8.3;
    this.shoulderOffset = this.camera.aspect < 1 ? 1.0 : 1.75;
    this._portraitLayout = this.camera.aspect < 1;
    this.aimPoint = new THREE.Vector3();
    this.lookPoint = new THREE.Vector3();

    this.playerVel = new THREE.Vector3();
    this.enemyVel = new THREE.Vector3();
    this.moveInput = new THREE.Vector2();
    this.keys = new Set();
    this.joystick = { active: false, pointerId: null, x: 0, y: 0 };
    this.lookTouch = { active: false, pointerId: null, x: 0, y: 0 };
    this.pointerLocked = false;
    this.fireHeld = false;
    this.wantFire = false;
    this.wantSword = false;
    this.playerFireCd = 0;
    this.playerSwordCd = 0;
    this.playerSwordT = 0;
    this.playerRecoil = 0;
    this.playerParriedThisSwing = false;
    this.enemyFireCd = 2.0;
    this.enemyParryCd = 0;
    this.enemySwordT = 0;
    this.enemyRecoil = 0;
    this.enemyStrafeDir = 1;
    this.enemyThink = 0;
    this.enemyParryToggle = false;
    this.enemyHitCd = 0;
    this.rockets = [];
    this.debugParryTarget = null;
    this.hintTimer = 0;
    this.hintShownForParry = false;
    this.lastHud = {};

    this.menuAngle = 0.2;
    this.clock = new THREE.Clock();

    this.bindEvents();
    this.resetMatch(false);
    this.stageMenuPose();
    this.updateCamera(0);
    this.initHud();

    this.renderer.setAnimationLoop(() => this.loop());

    window.addEventListener("load", () => {
      setTimeout(() => this.loadingEl.classList.add("is-hidden"), 280);
    });
    if (document.readyState === "complete") {
      setTimeout(() => this.loadingEl.classList.add("is-hidden"), 280);
    }
  }

  bindEvents() {
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.onResize(), 250));
    window.addEventListener("contextmenu", (e) => e.preventDefault());

    this.startBtn.addEventListener("click", () => this.startMatch());
    this.restartBtn.addEventListener("click", () => this.startMatch());
    this.menuBtn.addEventListener("click", () => this.goMenu());
    this.muteBtn.addEventListener("click", () => {
      this.audio.unlock();
      const muted = !this.audio.muted;
      this.audio.setMuted(muted);
      this.muteBtn.classList.toggle("is-muted", muted);
      if (!muted) this.audio.play("click");
    });

    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Space") { this.fireHeld = true; this.wantFire = true; }
      if (e.code === "KeyF" || e.code === "KeyE") { this.wantSword = true; }
      if (e.code === "KeyP" && this.state !== "menu") this.togglePause?.();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Space") this.fireHeld = false;
    });

    window.addEventListener("blur", () => { this.fireHeld = false; this.keys.clear(); });

    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.pointerLocked && this.state === "playing") this.showToast("RATÓN CAPTURADO", false, 0.7);
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.pointerLocked) return;
      this.applyLook(e.movementX, e.movementY, 0.00215);
    });

    this.canvas.addEventListener("pointerdown", (e) => {
      this.audio.unlock();
      if (e.pointerType === "mouse") {
        if (this.state !== "playing") return;
        if (this.pointerLocked) {
          if (e.button === 0) { this.fireHeld = true; this.wantFire = true; }
          if (e.button === 2) this.wantSword = true;
        } else if (e.button === 0) {
          this.canvas.requestPointerLock?.();
        } else if (e.button === 2) {
          this.wantSword = true;
        }
        return;
      }
      if (this.lookTouch.active) return;
      this.lookTouch.active = true;
      this.lookTouch.pointerId = e.pointerId;
      this.lookTouch.x = e.clientX;
      this.lookTouch.y = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId);
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") return;
      if (!this.lookTouch.active || e.pointerId !== this.lookTouch.pointerId) return;
      const dx = e.clientX - this.lookTouch.x;
      const dy = e.clientY - this.lookTouch.y;
      this.lookTouch.x = e.clientX;
      this.lookTouch.y = e.clientY;
      this.applyLook(dx, dy, 0.0052);
    });

    const endLook = (e) => {
      if (e.pointerId === this.lookTouch.pointerId) {
        this.lookTouch.active = false;
        this.lookTouch.pointerId = null;
      }
    };
    this.canvas.addEventListener("pointerup", endLook);
    this.canvas.addEventListener("pointercancel", endLook);

    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.fireHeld = false;
    });

    this.canvas.addEventListener("wheel", (e) => {
      if (this.state === "menu") return;
      e.preventDefault();
      this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.7, 6.2, 11.5);
    }, { passive: false });

    // Virtual joystick.
    const startStick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.audio.unlock();
      this.joystick.active = true;
      this.joystick.pointerId = e.pointerId;
      const rect = this.stickBase.getBoundingClientRect();
      this.joystick.cx = rect.left + rect.width / 2;
      this.joystick.cy = rect.top + rect.height / 2;
      this.moveStick(e.clientX, e.clientY);
      this.moveZone.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!this.joystick.active || e.pointerId !== this.joystick.pointerId) return;
      e.preventDefault();
      this.moveStick(e.clientX, e.clientY);
    };
    const end = (e) => {
      if (e.pointerId !== this.joystick.pointerId) return;
      this.joystick.active = false;
      this.joystick.pointerId = null;
      this.moveInput.set(0, 0);
      this.stickKnob.style.transform = "translate(0px, 0px)";
    };
    this.moveZone.addEventListener("pointerdown", startStick);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);

    const pressFire = (e) => {
      e.preventDefault(); e.stopPropagation();
      this.audio.unlock();
      this.fireHeld = true;
      this.wantFire = true;
      this.fireBtn.classList.add("is-pressed");
    };
    const releaseFire = () => { this.fireHeld = false; this.fireBtn.classList.remove("is-pressed"); };
    this.fireBtn.addEventListener("pointerdown", pressFire);
    this.fireBtn.addEventListener("pointerup", releaseFire);
    this.fireBtn.addEventListener("pointercancel", releaseFire);
    this.fireBtn.addEventListener("pointerleave", releaseFire);

    this.swordBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.audio.unlock();
      this.wantSword = true;
      this.swordBtn.classList.add("is-pressed");
      setTimeout(() => this.swordBtn.classList.remove("is-pressed"), 130);
    });
  }

  applyLook(dx, dy, sens) {
    if (this.state === "menu") return;
    this.camYaw += dx * sens;
    this.aimPitch = clamp(this.aimPitch - dy * sens * 0.85, -0.32, 0.42);
  }

  moveStick(x, y) {
    const dx = x - this.joystick.cx;
    const dy = y - this.joystick.cy;
    const max = 44;
    const len = Math.hypot(dx, dy);
    const scale = len > max ? max / len : 1;
    const kx = dx * scale;
    const ky = dy * scale;
    this.stickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    this.moveInput.set(kx / max, -ky / max);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    const portrait = this.camera.aspect < 1;
    this.shoulderOffset = portrait ? 1.0 : 1.75;
    if (portrait !== this._portraitLayout) {
      this._portraitLayout = portrait;
      this.camDist = portrait ? 10.2 : 7.8;
    }
  }

  resetMatch(showHud = true) {
    this.playerHealth = PLAYER_MAX_HP;
    this.enemyHealth = ENEMY_MAX_HP;
    this.playerDead = false;
    this.enemyDead = false;
    this.player.root.position.set(-3, terrainHeight(-3, 10), 10);
    this.enemy.root.position.set(3, terrainHeight(3, -10), -10);
    const facing = Math.atan2(this.enemy.root.position.x - this.player.root.position.x, this.enemy.root.position.z - this.player.root.position.z);
    this.player.root.rotation.set(0, facing, 0);
    this.enemy.root.rotation.set(0, facing + Math.PI, 0);
    this.player.body.position.y = 0;
    this.enemy.body.position.y = 0;
    this.player.deadT = 0;
    this.enemy.deadT = 0;
    this.player.hitFlash = 0;
    this.enemy.hitFlash = 0;
    this.playerVel.set(0, 0, 0);
    this.enemyVel.set(0, 0, 0);
    this.moveInput.set(0, 0);
    this.stickKnob.style.transform = "translate(0px, 0px)";
    this.playerFireCd = 0;
    this.playerSwordCd = 0;
    this.playerSwordT = 0;
    this.playerRecoil = 0;
    this.enemyFireCd = 2.2;
    this.enemyParryCd = 0;
    this.enemySwordT = 0;
    this.enemyRecoil = 0;
    this.enemyThink = 0;
    this.enemyHitCd = 0;
    this.enemyParryToggle = false;
    this.parries = 0;
    this.damageDealt = 0;
    this.matchTime = 0;
    this.slowT = 0;
    this.shake = 0;
    this.overT = 0;
    this.endShown = false;
    this.clearRockets();
    this.effects.clear();
    this.camYaw = Math.atan2(this.enemy.root.position.x - this.player.root.position.x, this.enemy.root.position.z - this.player.root.position.z);
    this.aimPitch = -0.035;
    this.camDist = this.camera.aspect < 1 ? 10.2 : 7.8;
    this.hintShownForParry = false;
    this.lastHud = {};
    if (showHud) {
      this.hudEl.classList.add("is-live");
      this.hudEl.setAttribute("aria-hidden", "false");
    }
    this.updateHud(true);
    this.updateCamera(0);
  }

  startMatch() {
    this.audio.unlock();
    this.audio.play("click");
    this.menuEl.classList.add("is-hidden");
    this.endEl.classList.remove("is-show", "is-win", "is-lose");
    this.endEl.setAttribute("aria-hidden", "true");
    this.resetMatch(true);
    this.state = "countdown";
    this.countdownT = 3.0;
    this.lastCount = 4;
    this.showToast("DUELO INICIADO", false, 1);
    this.showHint("Mira al cohete y pulsa ESPADA para devolverlo", 6);
    this.countdownEl.classList.remove("is-show", "is-go");
  }

  goMenu() {
    this.state = "menu";
    this.hudEl.classList.remove("is-live");
    this.hudEl.setAttribute("aria-hidden", "true");
    this.endEl.classList.remove("is-show", "is-win", "is-lose");
    this.endEl.setAttribute("aria-hidden", "true");
    this.menuEl.classList.remove("is-hidden");
    this.clearRockets();
    this.effects.clear();
    this.playerDead = false;
    this.enemyDead = false;
    this.stageMenuPose();
    this.menuAngle = 0;
    this.audio.play("click");
  }

  stageMenuPose() {
    const px = -1.2, pz = 4.8;
    const ex = 0.9, ez = 0.1;
    this.player.root.position.set(px, terrainHeight(px, pz), pz);
    this.enemy.root.position.set(ex, terrainHeight(ex, ez), ez);
    const playerYaw = Math.atan2(ex - px, ez - pz);
    const enemyYaw = Math.atan2(px - ex, pz - ez);
    this.player.root.rotation.set(0, playerYaw, 0);
    this.enemy.root.rotation.set(0, enemyYaw, 0);
    this.player.root.rotation.z = 0;
    this.enemy.root.rotation.z = 0;
    this.player.body.position.y = 0;
    this.enemy.body.position.y = 0;
    this.player.deadT = 0;
    this.enemy.deadT = 0;
    this.enemyVel.set(0, 0, 0);
  }

  initHud() {
    this.playerHpFill.style.width = "100%";
    this.enemyHpFill.style.width = "100%";
  }

  showToast(text, hot = false, duration = 1) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove("is-show", "is-hot");
    void this.toastEl.offsetWidth;
    if (hot) this.toastEl.classList.add("is-hot");
    this.toastEl.classList.add("is-show");
  }

  showHint(text, duration) {
    this.hintText.textContent = text;
    this.hintEl.classList.add("is-show");
    this.hintTimer = duration;
  }

  hideHint() {
    this.hintEl.classList.remove("is-show");
    this.hintTimer = 0;
  }

  showCountdown(text, go = false) {
    this.countdownEl.textContent = text;
    this.countdownEl.classList.remove("is-show", "is-go");
    void this.countdownEl.offsetWidth;
    if (go) this.countdownEl.classList.add("is-go");
    this.countdownEl.classList.add("is-show");
  }

  flashElement(el, opacity, fadeMs) {
    el.style.transition = "none";
    el.style.opacity = String(opacity);
    void el.offsetWidth;
    el.style.transition = `opacity ${fadeMs}ms ease-out`;
    el.style.opacity = "0";
  }

  spawnRocket(owner, origin, dir) {
    const mesh = createRocketMesh(owner, this.rocketGlowTexture);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const speed = owner === "player" ? 38 : 25;
    const rocket = {
      mesh,
      owner,
      pos: origin.clone(),
      prev: origin.clone(),
      vel: dir.clone().normalize().multiplyScalar(speed),
      life: 0,
      parries: 0,
      damage: owner === "player" ? 22 : 14,
      radius: 0.85,
      enemyWillParry: owner === "player" ? this.enemyParryToggle : false,
      trailColor: owner === "player" ? 0x7df7ff : 0xff752a,
    };
    if (owner === "player") this.enemyParryToggle = !this.enemyParryToggle;
    this.rockets.push(rocket);
    return rocket;
  }

  clearRockets() {
    for (const r of this.rockets) this.removeRocket(r);
    this.rockets.length = 0;
  }

  removeRocket(rocket) {
    this.scene.remove(rocket.mesh);
    rocket.mesh.traverse((o) => {
      if (o.isSprite) {
        o.material.dispose();
      } else if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    const i = this.rockets.indexOf(rocket);
    if (i >= 0) this.rockets.splice(i, 1);
  }

  setRocketOwner(rocket, owner) {
    rocket.owner = owner;
    const color = owner === "player" ? 0x7df7ff : 0xff5a1f;
    const bodyMat = rocket.mesh.userData.bodyMat;
    const glowMat = rocket.mesh.userData.glowMat;
    bodyMat.emissive.set(color);
    bodyMat.color.set(owner === "player" ? 0x9ee9f2 : 0x4a302a);
    glowMat.color.set(color);
    rocket.trailColor = color;
  }

  getPlayerChest(out = new THREE.Vector3()) {
    return getRobotChest(this.player, out);
  }

  getEnemyChest(out = new THREE.Vector3()) {
    return getRobotChest(this.enemy, out);
  }

  firePlayer() {
    if (this.state !== "playing" || this.playerFireCd > 0 || this.playerDead) return;
    this.playerFireCd = FIRE_CD;
    this.playerRecoil = 1;
    this.audio.play("shoot");

    const muzzle = this.player.muzzle.getWorldPosition(_v1);
    this.camera.getWorldDirection(_v2);
    this.aimPoint.copy(this.camera.position).addScaledVector(_v2, 90);
    const dir = _v3.copy(this.aimPoint).sub(muzzle).normalize();

    // Generous aim assist: if the shot is roughly toward the rival, snap to its chest.
    const enemyChest = this.getEnemyChest(new THREE.Vector3());
    const toEnemy = enemyChest.clone().sub(muzzle);
    const dist = toEnemy.length();
    if (dist < 55) {
      toEnemy.normalize();
      const dot = dir.dot(toEnemy);
      if (dot > 0.94) {
        const lead = this.enemyVel.clone().multiplyScalar(Math.min(0.3, dist / (38 * 2)));
        const aim = enemyChest.clone().add(lead).sub(muzzle).normalize();
        dir.lerp(aim, 0.88).normalize();
      }
    }
    const rocket = this.spawnRocket("player", muzzle, dir);
    rocket.pos.copy(muzzle);
    this.effects.flash(muzzle, 0x9ff7ff, 2.6);
    this.effects.burst(muzzle, 0x7df7ff, 8, 5, 0.3, -2, 0.55);
    this.shake = Math.max(this.shake, 0.045);
    this.playerFireCd = FIRE_CD;
  }

  fireEnemy() {
    if (this.enemyDead) return;
    const muzzle = this.enemy.muzzle.getWorldPosition(_v1);
    const target = this.getPlayerChest(_v2).clone();
    target.y = 1.6;
    const dist = target.distanceTo(muzzle);
    const lead = this.playerVel.clone().multiplyScalar(dist / 25 * 0.28);
    const dir = target.add(lead).sub(muzzle).normalize();
    dir.x += (Math.random() - 0.5) * 0.045;
    dir.y += (Math.random() - 0.5) * 0.03;
    dir.z += (Math.random() - 0.5) * 0.045;
    dir.normalize();
    this.spawnRocket("enemy", muzzle, dir);
    this.enemyRecoil = 1;
    this.audio.play("enemyShoot");
    this.effects.flash(muzzle, 0xff9a4a, 2.2);
    this.effects.burst(muzzle, 0xff6a2a, 7, 4.5, 0.28, -2, 0.5);
  }

  playerSword() {
    if (this.state !== "playing" || this.playerSwordCd > 0 || this.playerDead) return;
    this.playerSwordCd = SWORD_CD;
    this.playerSwordT = 0.36;
    this.playerParriedThisSwing = false;
    this.audio.play("swing");
    this.effects.slash(this.player.root.position.clone(), this.camYaw, 0x7df7ff, 1);
    this.shake = Math.max(this.shake, 0.02);

    const toEnemy = this.enemy.root.position.clone().sub(this.player.root.position);
    toEnemy.y = 0;
    const d = toEnemy.length();
    if (d < 3.7 && !this.enemyDead) {
      toEnemy.normalize();
      const fwd = _v1.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
      if (fwd.dot(toEnemy) > 0.3) {
        this.damageEnemy(15, this.getEnemyChest(new THREE.Vector3()));
        this.enemyVel.addScaledVector(toEnemy, 3.2);
        this.effects.burst(this.getEnemyChest(new THREE.Vector3()), 0xaef8ff, 18, 7, 0.5, -7, 0.8);
        this.audio.play("hit");
      }
    }
  }

  enemySword() {
    if (this.enemyDead || this.playerDead) return;
    this.enemySwordT = 0.4;
    this.audio.play("swing");
    this.effects.slash(this.enemy.root.position.clone(), this.enemy.root.rotation.y, 0xff5a25, 1);
    const toPlayer = this.player.root.position.clone().sub(this.enemy.root.position);
    toPlayer.y = 0;
    const d = toPlayer.length();
    if (d < 3.4) {
      toPlayer.normalize();
      const fwd = _v1.set(Math.sin(this.enemy.root.rotation.y), 0, Math.cos(this.enemy.root.rotation.y));
      if (fwd.dot(toPlayer) > 0.15) this.damagePlayer(11, this.getPlayerChest(new THREE.Vector3()));
    }
  }

  findParryableRocket() {
    const chest = this.getPlayerChest(_v1);
    const camDir = this.camera.getWorldDirection(_v2);
    for (const r of this.rockets) {
      if (r.owner !== "enemy") continue;
      const dist = r.pos.distanceTo(chest);
      if (dist > 9.5 || dist < 0.4) continue;
      _v3.copy(r.pos).sub(this.camera.position);
      if (_v3.dot(camDir) <= 0) continue;
      _v3.copy(r.pos).project(this.camera);
      if (_v3.z < -1 || _v3.z > 1) continue;
      if (Math.abs(_v3.x) < 0.58 && Math.abs(_v3.y) < 0.62) return r;
    }
    return null;
  }

  reflectRocket(rocket, by) {
    if (by === "player") {
      const target = this.getEnemyChest(new THREE.Vector3());
      const lead = this.enemyVel.clone().multiplyScalar(0.06);
      const dir = target.add(lead).sub(rocket.pos).normalize();
      this.setRocketOwner(rocket, "player");
      rocket.vel.copy(dir).multiplyScalar(48);
      rocket.damage = 34;
      rocket.parries += 1;
      rocket.enemyWillParry = false;
      this.parries += 1;
      this.playerParriedThisSwing = true;
      this.slowT = 0.34;
      this.shake = Math.max(this.shake, 0.13);
      this.audio.play("parry");
      this.audio.play("reflect");
      this.effects.flash(rocket.pos, 0xbdfbff, 6);
      this.effects.shockwave(rocket.pos, 0x7df7ff, 8);
      this.effects.burst(rocket.pos, 0xd8ffff, 26, 10, 0.5, -2, 1.1);
      this.effects.floatingText(this.player.root.position, "¡PARRY!", "#8ffaff", 1);
      this.flashElement(this.parryFlashEl, 0.85, 420);
      this.showToast("¡PARRY!", false, 1);
      this.hideHint();
      this.retryParryHint = true;
    } else {
      const target = this.getPlayerChest(new THREE.Vector3());
      const dir = target.sub(rocket.pos).normalize();
      this.setRocketOwner(rocket, "enemy");
      rocket.vel.copy(dir).multiplyScalar(43);
      rocket.damage = 20;
      rocket.parries += 1;
      rocket.enemyWillParry = false;
      this.enemyParryCd = 1.4;
      this.audio.play("parry");
      this.effects.flash(rocket.pos, 0xffb36b, 4.4);
      this.effects.shockwave(rocket.pos, 0xff7a2a, 6);
      this.effects.burst(rocket.pos, 0xffc27a, 18, 8, 0.45, -3, 0.9);
      this.effects.floatingText(this.enemy.root.position, "BLOQUEO", "#ffb36b", 0.9);
      this.showToast("EL RIVAL BLOQUEÓ TU COHETE", true, 1);
      this.shake = Math.max(this.shake, 0.05);
    }
  }

  damageEnemy(amount, pos) {
    if (this.enemyDead) return;
    this.enemyHealth = Math.max(0, this.enemyHealth - amount);
    this.damageDealt += amount;
    setRobotFlash(this.enemy, 0.95);
    this.effects.floatingText(pos.clone().setY(pos.y + 0.3), `-${amount}`, "#ffd08a", 0.72);
    this.effects.burst(pos, 0xffb267, 16, 7, 0.5, -6, 0.8);
    this.audio.play("hit");
    this.shake = Math.max(this.shake, 0.06);
    if (this.enemyHealth <= 0) this.finishMatch(true);
    else this.updateHud(true);
  }

  damagePlayer(amount, pos) {
    if (this.playerDead) return;
    this.playerHealth = Math.max(0, this.playerHealth - amount);
    setRobotFlash(this.player, 0.9);
    this.effects.floatingText(pos.clone(), `-${amount}`, "#ff8a7a", 0.72);
    this.effects.burst(pos, 0xff6b4a, 14, 6, 0.45, -6, 0.75);
    this.audio.play("hurt");
    this.shake = Math.max(this.shake, 0.16);
    this.flashElement(this.damageFlashEl, 0.95, 520);
    this.updateHud(true);
    if (this.playerHealth <= 0) this.finishMatch(false);
  }

  finishMatch(win) {
    if (this.state !== "playing") return;
    this.state = "over";
    this.endWin = win;
    this.overT = 0;
    this.endShown = false;
    this.fireHeld = false;
    const chest = win ? this.getEnemyChest(new THREE.Vector3()) : this.getPlayerChest(new THREE.Vector3());
    this.effects.explode(chest, win ? 0xff7a2a : 0x7dcfff, true);
    setTimeout(() => {
      if (this.state !== "over") return;
      this.effects.explode(chest.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.2, (Math.random() - 0.5) * 3)), 0xff9a3a, false);
    }, 380);
    if (win) {
      this.enemyDead = true;
      this.enemyHealth = 0;
      this.audio.play("bigExplosion");
      setTimeout(() => this.audio.play("win"), 700);
      this.showToast("RIVAL DESTRUIDO", true, 1.2);
      this.effects.floatingText(this.enemy.root.position, "K.O.", "#ffb15a", 1.2);
    } else {
      this.playerDead = true;
      this.playerHealth = 0;
      this.audio.play("bigExplosion");
      setTimeout(() => this.audio.play("lose"), 700);
      this.showToast("SISTEMA CRÍTICO", true, 1.2);
      this.effects.floatingText(this.player.root.position, "K.O.", "#8fdfff", 1.2);
    }
    this.endEl.classList.remove("is-win", "is-lose");
    this.endEl.classList.add(win ? "is-win" : "is-lose");
    this.clearRockets();
    this.hideHint();
    this.reticleEl.classList.remove("is-parry");
    this.updateHud(true);
  }

  showEndScreen() {
    if (this.endShown) return;
    this.endShown = true;
    const win = this.endWin;
    this.endEyebrow.textContent = win ? "ARENA DESPEJADA" : "UNIDAD FUERA DE COMBATE";
    this.endTitle.textContent = win ? "VICTORIA" : "DERROTA";
    this.endSub.textContent = win ? "VULCANO-02 ha caído. El sector es tuyo." : "CENTINELA-01 ha sido destruido. Reintenta.";
    this.endTime.textContent = formatTime(this.matchTime);
    this.endParries.textContent = String(this.parries);
    this.endDamage.textContent = String(this.damageDealt);
    this.endEl.classList.add("is-show");
    this.endEl.setAttribute("aria-hidden", "false");
    this.hudEl.classList.remove("is-live");
    this.hudEl.setAttribute("aria-hidden", "true");
    this.audio.play("click");
  }

  updatePlayer(dt, canMove) {
    if (this.playerDead) {
      this.playerVel.multiplyScalar(Math.exp(-8 * dt));
      this.player.root.position.x += this.playerVel.x * dt;
      this.player.root.position.z += this.playerVel.z * dt;
      this.clampToArena(this.player.root.position);
      return;
    }

    let ix = 0;
    let iz = 0;
    if (canMove) {
      if (this.keys.has("KeyA")) ix -= 1;
      if (this.keys.has("KeyD")) ix += 1;
      if (this.keys.has("KeyW")) iz += 1;
      if (this.keys.has("KeyS")) iz -= 1;
      if (this.joystick.active) {
        ix += this.moveInput.x;
        iz += this.moveInput.y;
      }
    }
    // Arrow keys look around on desktop.
    if (canMove) {
      const lookSpeed = 1.65 * dt;
      if (this.keys.has("ArrowLeft")) this.camYaw -= lookSpeed;
      if (this.keys.has("ArrowRight")) this.camYaw += lookSpeed;
      if (this.keys.has("ArrowUp")) this.aimPitch = clamp(this.aimPitch + lookSpeed * 0.5, -0.32, 0.42);
      if (this.keys.has("ArrowDown")) this.aimPitch = clamp(this.aimPitch - lookSpeed * 0.5, -0.32, 0.42);
    }

    const inputLen = Math.hypot(ix, iz);
    if (inputLen > 1) { ix /= inputLen; iz /= inputLen; }
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = PLAYER_SPEED * (sprint ? 1.26 : 1);
    const fwd = _v1.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = _v2.set(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    const desired = _v3.copy(fwd).multiplyScalar(iz * speed).addScaledVector(right, ix * speed);
    const accel = inputLen > 0.05 ? 13 : 9;
    this.playerVel.x = damp(this.playerVel.x, desired.x, accel, dt);
    this.playerVel.z = damp(this.playerVel.z, desired.z, accel, dt);

    this.player.root.position.x += this.playerVel.x * dt;
    this.player.root.position.z += this.playerVel.z * dt;
    this.resolveCollisions(this.player.root.position, 0.48);
    this.clampToArena(this.player.root.position);
    this.player.root.position.y = terrainHeight(this.player.root.position.x, this.player.root.position.z);

    faceYaw(this.player, this.camYaw, dt, 18);
    if (inputLen > 0.05 && (sprint || ix !== 0)) {
      // Slight lean while sprinting.
      this.player.torso.rotation.z = damp(this.player.torso.rotation.z, -ix * 0.035, 6, dt);
    } else {
      this.player.torso.rotation.z = damp(this.player.torso.rotation.z, 0, 6, dt);
    }
  }

  updateEnemy(dt) {
    if (this.debugFreezeAI) {
      this.enemyVel.set(0, 0, 0);
      pointRobotAt(this.enemy, this.player.root.position, dt, 8);
      return;
    }
    if (this.enemyDead) {
      this.enemyVel.multiplyScalar(Math.exp(-7 * dt));
      this.enemy.root.position.x += this.enemyVel.x * dt;
      this.enemy.root.position.z += this.enemyVel.z * dt;
      this.clampToArena(this.enemy.root.position);
      return;
    }
    const toPlayer = _v1.copy(this.player.root.position).sub(this.enemy.root.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const dir = toPlayer.clone().normalize();

    this.enemyThink -= dt;
    if (this.enemyThink <= 0) {
      this.enemyThink = 1.8 + Math.random() * 2.6;
      if (Math.random() < 0.55) this.enemyStrafeDir *= -1;
    }

    const strafe = _v2.set(-dir.z, 0, dir.x).multiplyScalar(this.enemyStrafeDir);
    let move = new THREE.Vector3();
    if (dist > 22) move.add(dir).multiplyScalar(1.0);
    else if (dist < 9) move.addScaledVector(dir, -0.9);
    else move.addScaledVector(dir, (dist - 15) * 0.07);
    move.addScaledVector(strafe, 0.55 + Math.sin(this.time * 0.9) * 0.18);
    if (move.lengthSq() > 1) move.normalize();
    const speed = 3.5;
    this.enemyVel.x = damp(this.enemyVel.x, move.x * speed, 5, dt);
    this.enemyVel.z = damp(this.enemyVel.z, move.z * speed, 5, dt);
    this.enemy.root.position.x += this.enemyVel.x * dt;
    this.enemy.root.position.z += this.enemyVel.z * dt;
    this.resolveCollisions(this.enemy.root.position, 0.5);
    this.clampToArena(this.enemy.root.position);
    this.enemy.root.position.y = terrainHeight(this.enemy.root.position.x, this.enemy.root.position.z);

    pointRobotAt(this.enemy, this.player.root.position, dt, 5.5);

    this.enemyFireCd -= dt;
    this.enemyParryCd -= dt;
    this.enemySwordT = Math.max(0, this.enemySwordT - dt);
    if (this.state === "playing" && this.enemyFireCd <= 0 && dist < 42 && dist > 4.6) {
      this.enemyFireCd = 2.35 + Math.random() * 1.4;
      this.fireEnemy();
    }
    if (this.state === "playing" && dist < 3.15 && this.enemyHitCd <= 0) {
      this.enemyHitCd = 1.35;
      this.enemySword();
    }
    this.enemyHitCd -= dt;
  }

  resolveCollisions(pos, radius) {
    for (const c of this.world.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  clampToArena(pos) {
    pos.x = clamp(pos.x, -ARENA.halfX + 1, ARENA.halfX - 1);
    pos.z = clamp(pos.z, -ARENA.halfZ + 1, ARENA.halfZ - 1);
  }

  updateRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.prev.copy(r.pos);
      r.pos.addScaledVector(r.vel, dt);
      r.life += dt;
      r.mesh.position.copy(r.pos);
      _v1.copy(r.pos).add(r.vel);
      r.mesh.lookAt(_v1);
      r.mesh.rotateZ(r.life * 8);
      this.effects.trail(r.pos, r.trailColor, 0.38);

      // Enemy parry attempt.
      if (this.state === "playing" && r.owner === "player" && r.enemyWillParry && this.enemyParryCd <= 0 && !this.enemyDead) {
        const chest = this.getEnemyChest(_v1);
        const dist = r.pos.distanceTo(chest);
        if (dist < 7.2 && r.vel.dot(_v2.copy(chest).sub(r.pos)) > 0) {
          this.enemySwordT = 0.34;
          this.reflectRocket(r, "enemy");
          continue;
        }
      }

      // Terrain / bounds / lifetime.
      const ground = terrainHeight(r.pos.x, r.pos.z) + 0.22;
      if (r.pos.y < ground) {
        this.effects.explode(r.pos.clone().setY(ground + 0.15), r.trailColor, false);
        this.audio.play("explosion");
        this.removeRocket(r);
        continue;
      }
      if (r.life > 4.2 || Math.abs(r.pos.x) > 62 || Math.abs(r.pos.z) > 52) {
        this.removeRocket(r);
        continue;
      }

      // Hit detection against the opposing robot.
      const target = r.owner === "player" ? this.getEnemyChest(_v1) : this.getPlayerChest(_v1);
      const hit = this.segmentPointDistance(r.prev, r.pos, target) < r.radius + 0.52;
      if (hit) {
        const hitPos = target.clone();
        const parried = r.parries > 0;
        this.effects.explode(hitPos, r.trailColor, parried);
        this.audio.play("explosion");
        this.shake = Math.max(this.shake, 0.1);
        if (r.owner === "player") this.damageEnemy(r.damage, hitPos);
        else this.damagePlayer(r.damage, hitPos);
        if (this.rockets.includes(r)) this.removeRocket(r);
        if (this.state !== "playing") break;
        continue;
      }
    }
  }

  segmentPointDistance(a, b, p) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
    const denom = abx * abx + aby * aby + abz * abz;
    const t = denom > 0 ? clamp((apx * abx + apy * aby + apz * abz) / denom, 0, 1) : 0;
    const cx = a.x + abx * t - p.x;
    const cy = a.y + aby * t - p.y;
    const cz = a.z + abz * t - p.z;
    return Math.sqrt(cx * cx + cy * cy + cz * cz);
  }

  updateCombat(dt) {
    this.playerFireCd = Math.max(0, this.playerFireCd - dt);
    this.playerSwordCd = Math.max(0, this.playerSwordCd - dt);
    this.playerSwordT = Math.max(0, this.playerSwordT - dt);
    this.playerRecoil = damp(this.playerRecoil, 0, 12, dt);
    this.playerSwordCd = Math.max(0, this.playerSwordCd - dt);
    this.enemyRecoil = damp(this.enemyRecoil, 0, 12, dt);

    if (this.wantSword) {
      this.wantSword = false;
      this.playerSword();
    }
    if ((this.fireHeld || this.wantFire) && this.playerFireCd <= 0) {
      this.wantFire = false;
      this.firePlayer();
    }
    this.wantFire = false;

    // Sword parry window.
    if (this.playerSwordT > 0 && !this.playerParriedThisSwing) {
      const r = this.findParryableRocket();
      if (r) {
        this.reflectRocket(r, "player");
      }
    }

    // Reticle warning.
    const parryable = this.findParryableRocket();
    this.reticleEl.classList.toggle("is-parry", !!parryable);
    if (parryable && !this.hintShownForParry) {
      this.hintShownForParry = true;
      this.showHint("¡Cohete a la vista! Mira al proyectil y pulsa ESPADA", 3.5);
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hideHint();
    }
  }

  updateCamera(dt) {
    if (this.state === "menu") {
      this.menuAngle += dt;
      const sway = Math.sin(this.menuAngle * 0.16) * 0.55;
      const rise = Math.cos(this.menuAngle * 0.12) * 0.14;
      this.camera.position.set(2.2 + sway, 4.45 + rise, 13.4);
      this.camera.lookAt(-5.0, 1.55, 2.2);
      return;
    }
    const playerPos = this.player.root.position;
    const fwd = _v1.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = _v2.set(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    const base = _v3.copy(playerPos).add(new THREE.Vector3(0, 1.55, 0));
    const camTarget = base.clone().addScaledVector(right, this.shoulderOffset);

    const elev = 0.16;
    const desired = new THREE.Vector3()
      .copy(camTarget)
      .addScaledVector(fwd, -this.camDist * Math.cos(elev))
      .add(new THREE.Vector3(0, this.camDist * Math.sin(elev), 0));

    const ground = terrainHeight(desired.x, desired.z) + 0.55;
    if (desired.y < ground) desired.y = ground;
    desired.x = clamp(desired.x, -60, 60);
    desired.z = clamp(desired.z, -50, 50);

    if (this.shake > 0.001) {
      const s = this.shake;
      desired.x += (Math.random() - 0.5) * s * 1.6;
      desired.y += (Math.random() - 0.5) * s * 1.2;
      desired.z += (Math.random() - 0.5) * s * 1.6;
    }

    this.camera.position.copy(desired);
    this.lookPoint.copy(base).addScaledVector(fwd, 26).add(new THREE.Vector3(0, 0.7 + this.aimPitch * 18, 0));
    this.camera.lookAt(this.lookPoint);
    this.shake = damp(this.shake, 0, 8, dt);

    // Used for the bazooka's visual tilt.
    const muzzle = this.player.muzzle.getWorldPosition(new THREE.Vector3());
    this.camera.getWorldDirection(_v2);
    this.aimPoint.copy(this.camera.position).addScaledVector(_v2, 90);
    const dir = this.aimPoint.sub(muzzle).normalize();
    this.playerAimPitch = Math.asin(clamp(dir.y, -1, 1));
  }

  updateHud(force = false) {
    const php = this.playerHealth / PLAYER_MAX_HP;
    const ehp = this.enemyHealth / ENEMY_MAX_HP;
    if (force || this.lastHud.php !== php) {
      this.playerHpFill.style.width = `${Math.max(0, php) * 100}%`;
      this.playerHpText.textContent = String(Math.ceil(this.playerHealth));
      this.lastHud.php = php;
    }
    if (force || this.lastHud.ehp !== ehp) {
      this.enemyHpFill.style.width = `${Math.max(0, ehp) * 100}%`;
      this.lastHud.ehp = ehp;
    }
    const t = formatTime(this.matchTime);
    if (this.lastHud.time !== t) { this.timeText.textContent = t; this.lastHud.time = t; }
    if (this.lastHud.parries !== this.parries) {
      this.parryText.textContent = String(this.parries);
      this.lastHud.parries = this.parries;
    }

    const fireReady = 1 - clamp(this.playerFireCd / FIRE_CD, 0, 1);
    this.fireBtn.style.setProperty("--cd", String(1 - fireReady));
    this.fireBtn.classList.toggle("is-cooling", fireReady < 0.94);
    const swordReady = 1 - clamp(this.playerSwordCd / SWORD_CD, 0, 1);
    this.swordBtn.style.setProperty("--cd", String(1 - swordReady));
    this.swordBtn.classList.toggle("is-cooling", swordReady < 0.94);

    this.playerCard.classList.toggle("is-hurt", php < 0.34);
    const parryable = this.reticleEl.classList.contains("is-parry");
    let label = "SISTEMAS OK";
    if (this.playerDead) label = "FUERA DE COMBATE";
    else if (php < 0.34) label = "DAÑO CRÍTICO";
    else if (parryable) label = "PARRY DISPONIBLE";
    else if (this.playerFireCd > 0.1) label = "RECARGANDO";
    if (this.lastHud.label !== label) { this.playerStateEl.textContent = label; this.lastHud.label = label; }
  }

  loop() {
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    this.time += rawDt;
    let dt = rawDt;
    if (this.slowT > 0) {
      this.slowT = Math.max(0, this.slowT - rawDt);
      dt *= 0.36;
    }

    this.world.update(dt);
    this.effects.update(dt);

    if (this.state === "menu") {
      animateRobot(this.player, dt, { speed: 0, aimPitch: 0, swing: -1, recoil: 0, dead: false }, this.time);
      animateRobot(this.enemy, dt, { speed: 0, aimPitch: 0, swing: -1, recoil: 0, dead: false }, this.time);
      this.updateCamera(dt);
    } else if (this.state === "countdown") {
      this.countdownT -= rawDt;
      const n = Math.ceil(this.countdownT);
      if (n !== this.lastCount && n >= 1) {
        this.lastCount = n;
        this.showCountdown(String(n));
        this.audio.play("count");
      }
      if (this.countdownT <= 0) {
        this.state = "playing";
        this.showCountdown("¡PELEA!", true);
        this.audio.play("go");
        this.showToast("¡PELEA!", true, 0.9);
      }
      this.updatePlayer(dt, false);
      this.updateCamera(dt);
      this.animateCombatants(dt);
      this.updateHud();
    } else if (this.state === "playing") {
      this.matchTime += rawDt;
      this.updatePlayer(dt, true);
      this.updateEnemy(dt);
      this.updateCamera(dt);
      this.updateCombat(dt);
      this.updateRockets(dt);
      this.updateHud();
      this.animateCombatants(dt);
    } else if (this.state === "over") {
      this.overT += rawDt;
      this.updatePlayer(dt, false);
      this.updateEnemy(dt);
      this.updateCamera(dt);
      this.updateHud();
      this.animateCombatants(dt);
      if (this.overT > 1.45) this.showEndScreen();
    }

    if (this.state === "menu") {
      // Menu idle animation is handled above.
    }

    this.composer.render();
  }

  animateCombatants(dt) {
    const playerSwing = this.playerSwordT > 0 ? 1 - this.playerSwordT / 0.36 : -1;
    const enemySwing = this.enemySwordT > 0 ? 1 - this.enemySwordT / 0.4 : -1;
    animateRobot(this.player, dt, {
      speed: Math.hypot(this.playerVel.x, this.playerVel.z),
      aimPitch: this.playerAimPitch || 0,
      swing: playerSwing,
      recoil: this.playerRecoil,
      dead: this.playerDead,
    }, this.time);
    animateRobot(this.enemy, dt, {
      speed: Math.hypot(this.enemyVel.x, this.enemyVel.z),
      aimPitch: 0,
      swing: enemySwing,
      recoil: this.enemyRecoil,
      dead: this.enemyDead,
    }, this.time);
    if (!this.enemyDead && this.state !== "menu") {
      // Keep the cannon aimed at the player's elevation.
      const dy = this.getPlayerChest(_v1).y - this.getEnemyChest(_v2).y;
      const d = Math.hypot(this.player.root.position.x - this.enemy.root.position.x, this.player.root.position.z - this.enemy.root.position.z);
      this.enemy.bazooka.rotation.x = damp(this.enemy.bazooka.rotation.x, -Math.atan2(dy, Math.max(1, d)), 6, dt);
    }
  }
}

export function boot() {
  const game = new Game();
  window.__duel = {
    game,
    start: () => game.startMatch(),
    menu: () => game.goMenu(),
    state: () => game.state,
    win: () => game.finishMatch(true),
    lose: () => game.finishMatch(false),
    setupParry: () => {
      if (game.state !== "playing") {
        game.startMatch();
        game.state = "playing";
        game.countdownT = 0;
        game.updateHud(true);
      }
      game.camYaw = Math.atan2(game.enemy.root.position.x - game.player.root.position.x, game.enemy.root.position.z - game.player.root.position.z);
      game.aimPitch = -0.03;
      game.updateCamera(0.016);
      const dir = new THREE.Vector3(Math.sin(game.camYaw), 0, Math.cos(game.camYaw));
      const origin = game.getPlayerChest(new THREE.Vector3())
        .addScaledVector(dir, 4.6)
        .add(new THREE.Vector3(0, 0.08, 0));
      const rocket = game.spawnRocket("enemy", origin, dir.clone().negate());
      game.debugParryTarget = rocket;
      game.wantSword = true;
      return { id: game.rockets.length, dist: origin.distanceTo(game.player.root.position) };
    },
    parryResult: () => {
      const r = game.debugParryTarget;
      return r ? { owner: r.owner, parries: r.parries, alive: game.rockets.includes(r), parriesStat: game.parries } : null;
    },
    freezeAI: (v = true) => { game.debugFreezeAI = v; if (v) game.enemyVel.set(0, 0, 0); return v; },
    placeEnemy: (x, z, facePlayer = true) => {
      game.enemy.root.position.set(x, terrainHeight(x, z), z);
      if (facePlayer) {
        game.enemy.root.rotation.y = Math.atan2(game.player.root.position.x - x, game.player.root.position.z - z);
      }
    },
    spawnAt: (owner, front, speed = 20) => {
      const dir = new THREE.Vector3(Math.sin(game.camYaw), 0, Math.cos(game.camYaw));
      const origin = game.getPlayerChest(new THREE.Vector3()).addScaledVector(dir, front);
      const r = game.spawnRocket(owner, origin, owner === "enemy" ? dir.clone().negate() : dir);
      r.vel.normalize().multiplyScalar(speed);
      return !!r;
    },
  };
  return game;
}
