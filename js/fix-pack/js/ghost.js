// ghost.js — spöken med 4 AI-profiler, states, och robust vägg-detektering

import { TILE, C, COLS, ROWS } from "./maze.js";
import { DIR, dirEqual, dirOpposite } from "./input.js";

export const GHOST_STATE = {
  IN_HOUSE: "in_house",
  LEAVING: "leaving",
  SCATTER: "scatter",
  CHASE: "chase",
  FRIGHTENED: "frightened",
  EATEN: "eaten",
  FROZEN: "frozen",
};

const BASE_SPEED = 5.5;

const GHOST_COLORS = {
  blinky: "#D65A5A",
  pinky: "#C27CBF",
  inky:  "#5CB0C2",
  clyde: "#D99855",
};

export class Ghost {
  constructor(name, maze, spawnCell, releaseDelay) {
    this.name = name;
    this.maze = maze;
    this.color = GHOST_COLORS[name] || "#888";
    this.col = spawnCell.col;
    this.row = spawnCell.row;
    this.spawn = { col: spawnCell.col, row: spawnCell.row };
    this.subX = 0;
    this.subY = 0;
    this.dir = DIR.UP;

    this.state = GHOST_STATE.IN_HOUSE;
    this.globalState = GHOST_STATE.SCATTER;
    this.releaseTimer = releaseDelay;
    this.speedMult = 1;
    this.frightTimer = 0;
    this.freezeTimer = 0;
    this.eyeT = Math.random() * 2;
  }

  reset(releaseDelay) {
    this.col = this.spawn.col;
    this.row = this.spawn.row;
    this.subX = 0;
    this.subY = 0;
    this.dir = DIR.UP;
    this.state = GHOST_STATE.IN_HOUSE;
    this.releaseTimer = releaseDelay;
    this.frightTimer = 0;
    this.freezeTimer = 0;
  }

  pxCenter() {
    return {
      x: (this.col + 0.5) * TILE + this.subX * TILE,
      y: (this.row + 0.5) * TILE + this.subY * TILE,
    };
  }

  setFrightened(duration) {
    if (this.state === GHOST_STATE.EATEN || this.state === GHOST_STATE.IN_HOUSE) return;
    this.state = GHOST_STATE.FRIGHTENED;
    this.frightTimer = duration;
    // Vänd när de blir frightened (klassiskt beteende)
    this.dir = this._reverseDir();
  }

  setFrozen(duration) {
    if (this.state === GHOST_STATE.EATEN || this.state === GHOST_STATE.IN_HOUSE) return;
    this.state = GHOST_STATE.FROZEN;
    this.freezeTimer = duration;
  }

  getEaten() {
    this.state = GHOST_STATE.EATEN;
    this.frightTimer = 0;
  }

  _reverseDir() {
    if (this.dir === DIR.UP) return DIR.DOWN;
    if (this.dir === DIR.DOWN) return DIR.UP;
    if (this.dir === DIR.LEFT) return DIR.RIGHT;
    if (this.dir === DIR.RIGHT) return DIR.LEFT;
    return DIR.NONE;
  }

  _targetTile(pacman, others) {
    // EATEN: tillbaka till huset
    if (this.state === GHOST_STATE.EATEN) {
      return this.maze.ghostHouseCenter;
    }
    // LEAVING: sikta rakt upp ovanför huset så de kommer ut genom dörren
    if (this.state === GHOST_STATE.LEAVING) {
      const c = this.maze.ghostHouseCenter;
      return { col: c.col, row: Math.max(0, c.row - 4) };
    }
    // FRIGHTENED/FROZEN: ingen target (slumpmässig rörelse)
    if (this.state === GHOST_STATE.FRIGHTENED || this.state === GHOST_STATE.FROZEN) {
      return null;
    }
    // SCATTER: hörn beroende på spöke
    if (this.state === GHOST_STATE.SCATTER) {
      switch (this.name) {
        case "blinky": return { col: COLS - 2, row: 0 };
        case "pinky":  return { col: 1, row: 0 };
        case "inky":   return { col: COLS - 2, row: ROWS - 1 };
        case "clyde":  return { col: 1, row: ROWS - 1 };
      }
    }
    // CHASE: unik AI per spöke
    const px = pacman.col, py = pacman.row;
    switch (this.name) {
      case "blinky":
        // Jagar Pac-Man direkt
        return { col: px, row: py };
      case "pinky": {
        // 4 steg framför Pac-Man
        return {
          col: px + pacman.dir.dx * 4,
          row: py + pacman.dir.dy * 4,
        };
      }
      case "inky": {
        // 2 steg framför Pac-Man + dubbelt av Blinky-offset
        const blinky = others.find((g) => g.name === "blinky");
        const ahead = { col: px + pacman.dir.dx * 2, row: py + pacman.dir.dy * 2 };
        if (!blinky) return ahead;
        return {
          col: ahead.col * 2 - blinky.col,
          row: ahead.row * 2 - blinky.row,
        };
      }
      case "clyde": {
        // Jagar Pac-Man om långt bort, scatterar annars
        const dist = Math.hypot(px - this.col, py - this.row);
        if (dist > 8) return { col: px, row: py };
        return { col: 1, row: ROWS - 1 };
      }
    }
    return { col: px, row: py };
  }

  _pickDirection(pacman, others) {
    const target = this._targetTile(pacman, others);
    const candidates = [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT];
    const allowDoor = this.state === GHOST_STATE.EATEN || this.state === GHOST_STATE.LEAVING;
    const filtered = candidates.filter((d) => {
      if (dirOpposite(d, this.dir)) return false;
      const n = this.maze.wrap(this.col + d.dx, this.row + d.dy);
      return this.maze.isGhostWalkable(n.col, n.row, allowDoor);
    });
    const opts = filtered.length ? filtered : [this._reverseDir()];
    if (!target) {
      // Slumpmässig (frightened)
      return opts[Math.floor(Math.random() * opts.length)];
    }
    let best = opts[0];
    let bestDist = Infinity;
    for (const d of opts) {
      const nc = this.col + d.dx;
      const nr = this.row + d.dy;
      const dist = (nc - target.col) * (nc - target.col) + (nr - target.row) * (nr - target.row);
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  update(dt, pacman, others, globalState) {
    this.globalState = globalState;
    this.eyeT += dt;

    // I huset: räkna ner release-timer
    if (this.state === GHOST_STATE.IN_HOUSE) {
      this.releaseTimer -= dt;
      if (this.releaseTimer <= 0) {
        this.state = GHOST_STATE.LEAVING;
        // Snap till cellmitt och välj bästa utgångsriktning (normalt UP)
        this.subX = 0;
        this.subY = 0;
        this.dir = DIR.UP;
        this.dir = this._pickDirection(pacman, others);
      }
      return;
    }

    // Timers
    if (this.state === GHOST_STATE.FRIGHTENED) {
      this.frightTimer -= dt;
      if (this.frightTimer <= 0) this.state = this.globalState;
    }
    if (this.state === GHOST_STATE.FROZEN) {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) this.state = this.globalState;
      else return;
    }

    // Fart-modifierare
    let speed = BASE_SPEED * this.speedMult;
    if (this.state === GHOST_STATE.FRIGHTENED) speed *= 0.55;
    if (this.state === GHOST_STATE.EATEN) speed *= 2.0;
    if (this.state === GHOST_STATE.LEAVING) speed *= 0.8;

    // Iterativ rörelse — alltid cellkant-till-cellkant
    let remaining = speed * dt;
    let safety = 20;

    while (remaining > 1e-6 && safety-- > 0) {
      const dx = this.dir.dx, dy = this.dir.dy;
      if (dx === 0 && dy === 0) break;

      const sub = dx !== 0 ? this.subX : this.subY;
      const dirComp = dx !== 0 ? dx : dy;
      const signedSub = sub * dirComp;

      // Spöken byter riktning endast vid cellkanter — så eventet är alltid boundary
      const eventDist = Math.max(1e-6, 0.5 - signedSub);

      const stepTaken = Math.min(remaining, eventDist);
      this.subX += dx * stepTaken;
      this.subY += dy * stepTaken;
      remaining -= stepTaken;

      if (stepTaken >= eventDist - 1e-6) {
        // Passera cellkant
        const newCol = this.col + dx;
        const newRow = this.row + dy;
        const wrapped = this.maze.wrap(newCol, newRow);
        this.col = wrapped.col;
        this.row = wrapped.row;
        this.subX = -dx * 0.5;
        this.subY = -dy * 0.5;

        // Vid ny cell: välj ny riktning baserat på state
        if (this.state === GHOST_STATE.LEAVING) {
          const curCell = this.maze.cellAt(this.col, this.row);
          if (curCell !== C.GHOST_HOME && curCell !== C.DOOR) {
            this.state = this.globalState || GHOST_STATE.SCATTER;
          }
          this.dir = this._pickDirection(pacman, others);
        } else if (this.state === GHOST_STATE.EATEN) {
          const center = this.maze.ghostHouseCenter;
          if (this.col === center.col && this.row === center.row) {
            this.state = GHOST_STATE.LEAVING;
            this.dir = DIR.UP;
          } else {
            this.dir = this._pickDirection(pacman, others);
          }
        } else {
          this.dir = this._pickDirection(pacman, others);
        }

        // Säkerhet: om vi fick NONE, stanna
        if (this.dir.dx === 0 && this.dir.dy === 0) break;
      }
    }
  }

  draw(ctx, time) {
    const { x, y } = this.pxCenter();
    const r = TILE * 0.42;
    const t = time / 100;

    const fright = this.state === GHOST_STATE.FRIGHTENED;
    const frozen = this.state === GHOST_STATE.FROZEN;
    const eaten = this.state === GHOST_STATE.EATEN;

    if (!eaten) {
      // Kropp
      let bodyColor = this.color;
      if (fright) {
        const blink = this.frightTimer < 2 && Math.floor(time / 200) % 2 === 0;
        bodyColor = blink ? "#FFFFFF" : "#2C3E8F";
      }
      if (frozen) bodyColor = "#A0C4D9";

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(x, y - 2, r, Math.PI, 0);
      // Nederkant wavy
      const wave = 3;
      const waveH = 3;
      const bottomY = y + r - 2;
      ctx.lineTo(x + r, bottomY);
      for (let i = 0; i < wave; i++) {
        const x1 = x + r - (i * 2 + 1) * (r / wave);
        const x2 = x + r - (i * 2 + 2) * (r / wave);
        ctx.lineTo(x1, bottomY - waveH + Math.sin(t + i) * 1);
        ctx.lineTo(x2, bottomY);
      }
      ctx.closePath();
      ctx.fill();

      // Frozen snowflake-glitter
      if (frozen) {
        ctx.fillStyle = "#FFFFFF";
        for (let i = 0; i < 3; i++) {
          const ang = t + i * 2;
          const sx = x + Math.cos(ang) * r * 0.6;
          const sy = y + Math.sin(ang) * r * 0.5;
          ctx.beginPath();
          ctx.arc(sx, sy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Ögon (även när EATEN är det bara ögon)
    const eyeR = r * 0.3;
    const eyeOffX = r * 0.3;
    const eyeOffY = -r * 0.1;
    if (!fright || eaten) {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.arc(x - eyeOffX, y + eyeOffY, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffX, y + eyeOffY, eyeR, 0, Math.PI * 2); ctx.fill();

      // Pupiller följer riktningen
      const px = this.dir.dx * eyeR * 0.4;
      const py = this.dir.dy * eyeR * 0.4;
      ctx.fillStyle = "#0F1116";
      ctx.beginPath(); ctx.arc(x - eyeOffX + px, y + eyeOffY + py, eyeR * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffX + px, y + eyeOffY + py, eyeR * 0.55, 0, Math.PI * 2); ctx.fill();
    } else {
      // Frightened: tecknade "skrämda ögon"
      ctx.fillStyle = "#FFD56B";
      ctx.beginPath(); ctx.arc(x - eyeOffX, y + eyeOffY, eyeR * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffX, y + eyeOffY, eyeR * 0.6, 0, Math.PI * 2); ctx.fill();
      // Mun
      ctx.strokeStyle = "#FFD56B";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y + r * 0.25);
      ctx.lineTo(x - r * 0.2, y + r * 0.1);
      ctx.lineTo(x, y + r * 0.25);
      ctx.lineTo(x + r * 0.2, y + r * 0.1);
      ctx.lineTo(x + r * 0.4, y + r * 0.25);
      ctx.stroke();
    }
  }
}

// Skapa ett standard-pack: 4 spöken med rätt release-tider
export function createGhostPack(maze) {
  const spawns = maze.ghostSpawns;
  return [
    new Ghost("blinky", maze, spawns[0], 0),
    new Ghost("pinky",  maze, spawns[1], 2),
    new Ghost("inky",   maze, spawns[2], 5),
    new Ghost("clyde",  maze, spawns[3], 8),
  ];
}
