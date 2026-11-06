export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noise(dur, gainValue, type = "lowpass", freq = 900, q = 0.8, sweepTo = null) {
    const c = ensure();
    if (!c || muted) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, c.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), c.currentTime + dur);
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(gainValue, c.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(filter).connect(g).connect(master);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  }

  function tone(freq, dur, gainValue, type = "sine", slideTo = null, delay = 0) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const sounds = {
    shoot() {
      noise(0.26, 0.5, "bandpass", 1300, 0.6, 220);
      tone(190, 0.28, 0.24, "sawtooth", 46);
      tone(85, 0.3, 0.22, "sine", 38);
    },
    enemyShoot() {
      noise(0.24, 0.32, "bandpass", 700, 0.7, 180);
      tone(120, 0.26, 0.18, "sawtooth", 40);
    },
    explosion() {
      noise(0.65, 0.75, "lowpass", 1400, 0.9, 90);
      tone(66, 0.55, 0.38, "sine", 28);
      tone(150, 0.2, 0.14, "square", 60);
    },
    bigExplosion() {
      noise(1.1, 0.9, "lowpass", 1800, 0.9, 50);
      tone(48, 0.9, 0.5, "sine", 22);
      tone(110, 0.35, 0.2, "sawtooth", 35);
    },
    swing() {
      noise(0.18, 0.2, "bandpass", 500, 1.6, 3200);
    },
    parry() {
      tone(1240, 0.5, 0.22, "triangle", 980);
      tone(1860, 0.42, 0.15, "sine", 1720);
      tone(2620, 0.3, 0.09, "sine", 2500);
      noise(0.16, 0.25, "highpass", 2400, 1.0, 6000);
    },
    reflect() {
      tone(700, 0.25, 0.2, "sawtooth", 2200);
      noise(0.2, 0.2, "bandpass", 1800, 1.1, 4200);
    },
    hit() {
      noise(0.22, 0.42, "lowpass", 700, 1.0, 140);
      tone(100, 0.18, 0.26, "square", 45);
    },
    hurt() {
      noise(0.3, 0.35, "lowpass", 500, 1.0, 100);
      tone(70, 0.32, 0.24, "sawtooth", 35);
    },
    empty() {
      tone(240, 0.06, 0.06, "square", 180);
    },
    count() {
      tone(520, 0.12, 0.12, "square", 500);
    },
    go() {
      tone(780, 0.28, 0.16, "square", 760);
      tone(1170, 0.4, 0.1, "triangle", 1150);
    },
    win() {
      [392, 523, 659, 784].forEach((f, i) => tone(f, 0.9, 0.14, "triangle", f, i * 0.12));
    },
    lose() {
      [330, 262, 196, 147].forEach((f, i) => tone(f, 1.1, 0.14, "sawtooth", f * 0.98, i * 0.17));
    },
    click() {
      tone(420, 0.05, 0.06, "square", 380);
    },
  };

  function play(name) {
    if (muted) return;
    const fn = sounds[name];
    if (fn) fn();
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = v ? 0 : 0.55;
  }

  return { play, unlock, setMuted, get muted() { return muted; } };
}
