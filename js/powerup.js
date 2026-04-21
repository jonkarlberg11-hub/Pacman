// powerup.js — power-up spawn, effekter, rendering

import { TILE, C } from "./maze.js";

export const PU = {
  SHIELD:       "shield",
  TURBO:        "turbo",
  MAGNET:       "magnet",
  FREEZE:       "freeze",
  SUPER_PELLET: "super",
  SLOW_MO:      "slowmo",
  DOUBLE_SCORE: "x2",
  RADAR:        "radar",
  CHERRY:       "cherry",
  EXTRA_LIFE:   "life",
};

const COLORS = {
  shield: "#64D0F2",
  turbo:  "#FFD56B",
  magnet: "#E85D75",
  freeze: "#A8E6FF",
  super:  "#C58DFF",
  slowmo: "#6BE87F",
  x2:     "#FFD56B",
  radar:  "#64D0F2",
  cherry: "#E85D75",
  life:   "#E85D75",
};

const LABELS = {
  shield: "Sköld",
  turbo:  "Turbo",
  magnet: "Magnet",
  freeze: "Frys",
  super:  "Superpellet",
  slowmo: "Slow mo",
  x2:     "×2 poäng",
  radar:  "Radar",
  cherry: "Körsbär",
  life:   "Extra liv",
};

// Sannolikhetsvikter per svårighet
const WEIGHTS = {
  easy: {
    shield: 22, freeze: 16, slowmo: 14, super: 12, turbo: 10,
    magnet: 8, x2: 8, radar: 4, cherry: 4, life: 2,
  },
  medium: {
    shield: 13, turbo: 13, magnet: 12, freeze: 12, slowmo: 11,
    super: 11, x2: 12, radar: 8, cherry: 6, life: 2,
  },
  hard: {
    x2: 18, magnet: 15, turbo: 14, radar: 12, super: 10,
    shield: 8, slowmo: 8, freeze: 6, cherry: 7, life: 2,
  },
};

// Effekt-tider (sekunder)
const DURATIONS = {
  shield: 5,
  turbo: 7,
  magnet: 6,
  freeze: 4,
  super: 12,   // dubbel tid vs vanlig pellet
  slowmo: 8,
  x2: 10,
  radar: 5,
};

function weightedPick(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

export class Powerup {
  constructor(type, col, row) {
    this.type = type;
    this.col = col;
    this.row = row;
    this.age = 0;       // sekunder sedan spawn
    this.maxAge = 10;   // försvinner efter 10s
  }

  update(dt) { this.age += dt; }
  isExpired() { return this.age >= this.maxAge; }

  draw(ctx, time) {
    const x = (this.col + 0.5) * TILE;
    const y = (this.row + 0.5) * TILE;
    const r = TILE * 0.35;
    const color = COLORS[this.type];
    // Pulserande ring
    const pulse = 0.5 + 0.5 * Math.sin(time / 160);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4 + 0.6 * pulse;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Fylld cirkel
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Bokstavs-hint (första bokstaven)
    ctx.fillStyle = "#0F1116";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const letter = letterFor(this.type);
    ctx.fillText(letter, x, y + 0.5);

    // Blink när snart försvinner
    if (this.maxAge - this.age < 3) {
      const blink = Math.floor((this.maxAge - this.age) * 4) % 2;
      if (blink) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#0F1116";
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      }
    }
  }
}

function letterFor(type) {
  const map = {
    shield: "S", turbo: "T", magnet: "M", freeze: "F",
    super: "P", slowmo: "Z", x2: "×2", radar: "R",
    cherry: "C", life: "♥",
  };
  return map[type] || "?";
}

// ========== Power-up manager ==========
export class PowerupManager {
  constructor(maze, difficulty) {
    this.maze = maze;
    this.difficulty = difficulty;
    this.active = [];       // Powerup-instanser i banan
    this.dotsEatenSinceLast = 0;
    this.spawnThreshold = difficulty === "easy" ? 18 : difficulty === "hard" ? 28 : 22;
    this.maxActive = 2;

    // Aktiva effekter {type, remaining}
    this.effects = {};
  }

  onDotEaten() {
    this.dotsEatenSinceLast++;
    if (this.dotsEatenSinceLast >= this.spawnThreshold && this.active.length < this.maxActive) {
      this.trySpawn();
      this.dotsEatenSinceLast = 0;
      // Variera för att inte kännas förutsägbart
      this.spawnThreshold = Math.floor(15 + Math.random() * 14);
    }
  }

  trySpawn() {
    const tiles = this.maze.emptyWalkableTiles();
    if (!tiles.length) return;
    const tile = tiles[Math.floor(Math.random() * tiles.length)];
    const type = weightedPick(WEIGHTS[this.difficulty]);
    this.active.push(new Powerup(type, tile.col, tile.row));
  }

  update(dt) {
    // Uppdatera aktiva powerups på banan
    for (const p of this.active) p.update(dt);
    this.active = this.active.filter((p) => !p.isExpired());

    // Uppdatera aktiva effekter
    for (const k in this.effects) {
      this.effects[k] -= dt;
      if (this.effects[k] <= 0) delete this.effects[k];
    }
  }

  checkPickup(col, row) {
    const idx = this.active.findIndex((p) => p.col === col && p.row === row);
    if (idx < 0) return null;
    const p = this.active[idx];
    this.active.splice(idx, 1);
    return p.type;
  }

  applyEffect(type) {
    const dur = DURATIONS[type];
    if (dur) this.effects[type] = dur;
  }

  hasEffect(type) {
    return !!this.effects[type];
  }

  remainingSeconds(type) {
    return this.effects[type] || 0;
  }

  draw(ctx, time) {
    for (const p of this.active) p.draw(ctx, time);
  }

  getLabel(type) { return LABELS[type]; }
  getColor(type) { return COLORS[type]; }
  activeEffectList() {
    return Object.entries(this.effects).map(([type, t]) => ({ type, remaining: t }));
  }
}

// Använt av game.js för att visa chips
export { LABELS, COLORS, DURATIONS };
