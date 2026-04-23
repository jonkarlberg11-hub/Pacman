// audio.js — haptic (vibration) + Web Audio chiptune-sfx
// Alla ljud är square-wave, inga effekter — 8-bit arkad-estetik.

const HAPTIC_OK = typeof navigator !== "undefined" && "vibrate" in navigator;

export function haptic(pattern) {
  if (!HAPTIC_OK) return;
  try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}

export const Haptic = {
  dot:       () => haptic(2),
  pellet:    () => haptic(15),
  powerup:   () => haptic([10, 30, 10]),
  eatGhost:  () => haptic([20, 40, 40]),
  death:     () => haptic([60, 40, 60, 40, 120]),
  win:       () => haptic([80, 60, 80, 60, 200]),
  pause:     () => haptic(8),
};

// ========== Web Audio SoundEngine ==========

const STORAGE_KEY = "pacman_sound";
const MASTER_GAIN = 0.22;

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = localStorage.getItem(STORAGE_KEY) !== "0";
    this._frightHandle = null;
    this._chompToggle = false;
  }

  // Kallas vid första user gesture — AudioContext kräver det.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? MASTER_GAIN : 0;
    this.master.connect(this.ctx.destination);
  }

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(on ? MASTER_GAIN : 0, t);
    }
  }

  // Schemalägg en square-wave-ton. startOffset = sekunder från now.
  tone({ freq, duration, startOffset = 0, gain = 1 }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + startOffset;
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t0);
    const g = this.ctx.createGain();
    const atk = 0.004, rel = 0.008;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + atk);
    g.gain.setValueAtTime(gain, t0 + Math.max(atk, duration - rel));
    g.gain.linearRampToValueAtTime(0, t0 + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  // Pitch-glid från fromFreq till toFreq linjärt över duration.
  bend({ fromFreq, toFreq, duration, startOffset = 0, gain = 1 }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + startOffset;
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.linearRampToValueAtTime(toFreq, t0 + duration);
    const g = this.ctx.createGain();
    const atk = 0.004, rel = 0.008;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + atk);
    g.gain.setValueAtTime(gain, t0 + Math.max(atk, duration - rel));
    g.gain.linearRampToValueAtTime(0, t0 + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  // Kedja av toner: [{freq, duration, gain?}, ...].
  sequence(notes, startOffset = 0) {
    if (!this.ctx || !this.enabled) return;
    let t = startOffset;
    for (const n of notes) {
      this.tone({ freq: n.freq, duration: n.duration, gain: n.gain, startOffset: t });
      t += n.duration;
    }
  }

  // Loop: upprepar sekvens var intervalMs. Returnerar handle för stop.
  startLoop(notes, intervalMs) {
    const handle = { stopped: false, timer: null };
    const tick = () => {
      if (handle.stopped) return;
      this.sequence(notes);
      handle.timer = setTimeout(tick, intervalMs);
    };
    tick();
    return handle;
  }

  stopLoop(handle) {
    if (!handle) return;
    handle.stopped = true;
    if (handle.timer) clearTimeout(handle.timer);
  }
}

const engine = new SoundEngine();

// ========== Toggle + UI-hook ==========

export const SoundToggle = {
  get enabled() { return engine.enabled; },
  init: () => engine.init(),
  toggle() {
    engine.setEnabled(!engine.enabled);
    if (!engine.enabled) frightenedStop();
    if (this.onChange) this.onChange(engine.enabled);
  },
  onChange: null,
};

// ========== Ljuddefinitioner ==========
// Lägg till ett nytt ljud = en ny funktion + en rad i Sfx-objektet nedan.

function chomp() {
  // Klassisk waka-waka: alternerar mellan hög och låg på varje anrop
  const hi = engine._chompToggle;
  engine._chompToggle = !engine._chompToggle;
  engine.sequence([
    { freq: hi ? 660 : 440, duration: 0.028, gain: 0.75 },
    { freq: hi ? 330 : 220, duration: 0.022, gain: 0.55 },
  ]);
}

function pellet() {
  // Längre, dovare ton med liten nedåt-bend
  engine.bend({ fromFreq: 240, toFreq: 160, duration: 0.22, gain: 0.7 });
}

function eatGhost() {
  // Snabb stigande tonserie
  const notes = [];
  const from = 200, to = 900, steps = 8;
  for (let i = 0; i < steps; i++) {
    const f = from + (to - from) * (i / (steps - 1));
    notes.push({ freq: f, duration: 0.04, gain: 0.7 });
  }
  engine.sequence(notes);
}

function death() {
  // Fallande dödsmelodi ~1.4s
  const freqs = [420, 380, 340, 300, 260, 225, 195, 165, 138, 115, 95, 78];
  const notes = freqs.map((f) => ({ freq: f, duration: 0.115, gain: 0.72 }));
  engine.sequence(notes);
}

function intro() {
  // Kort arpeggio C-E-G-C
  const C4 = 261.63, E4 = 329.63, G4 = 392.0, C5 = 523.25;
  engine.sequence([
    { freq: C4, duration: 0.12, gain: 0.6 },
    { freq: E4, duration: 0.12, gain: 0.6 },
    { freq: G4, duration: 0.12, gain: 0.6 },
    { freq: C5, duration: 0.26, gain: 0.7 },
  ]);
}

function win() {
  engine.sequence([
    { freq: 523, duration: 0.10, gain: 0.7 },
    { freq: 659, duration: 0.10, gain: 0.7 },
    { freq: 784, duration: 0.10, gain: 0.7 },
    { freq: 1046, duration: 0.28, gain: 0.8 },
  ]);
}

function frightenedStart() {
  if (engine._frightHandle) return;
  const notes = [
    { freq: 180, duration: 0.09, gain: 0.5 },
    { freq: 140, duration: 0.09, gain: 0.5 },
  ];
  engine._frightHandle = engine.startLoop(notes, 220);
}

function frightenedStop() {
  if (!engine._frightHandle) return;
  engine.stopLoop(engine._frightHandle);
  engine._frightHandle = null;
}

export const Sfx = {
  dot:              chomp,
  chomp,
  pellet,
  powerup:          pellet,      // alias — samma ljud som pellet när power-up plockas upp
  eatGhost,
  death,
  intro,
  win,
  frightenedStart,
  frightenedStop,
};
