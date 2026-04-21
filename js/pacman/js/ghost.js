// ghost.js — fyra spöken med klassiska AI-beteenden

import { TILE, C, COLS, ROWS } from "./maze.js";
import { DIR, dirOpposite } from "./input.js";

const BASE_SPEED = 5.5;

export const GHOST_STATE = {
  IN_HOUSE: "in_house",
  LEAVING: "leaving",
  CHASE: "chase",
  SCATTER: "scatter",
  FRIGHTENED: "frightened",
  EATEN: "eaten",
  FROZEN: "frozen",
};

const COLORS = {
  blinky: "#E85D75",
  pinky:  "#C58DFF",
  inky:   "#64D0F2",
  clyde:  "#F09A5A",
};

const SCATTER_TARGETS = {
  blinky: { col: COLS - 2, row: 0 },
  pinky:  { col: 1,        row: 0 },
  inky:   { col: COLS - 2, row: ROWS - 1 },
  clyde:  { col: 1,        row: ROWS - 1 },
};

const RELEASE_DELAY = {
  blinky: 0,
  pinky:  2,
  inky:   5,
  clyde:  8,
};

export class Ghost {
  constructor(name, maze, spawnTile, pacman, blinkyRef = null) {
    this.name = name;
    this.color = COLORS[name];
    this.maze = maze;
    this.pacman = pacman;
    this.blinkyRef = blinkyRef;
    this.spawn = spawnTile;
    this.col = spawnTile.col;
    this.row = spawnTile.row;
    this.subX = 0;
    this.subY = 0;
    this.dir = DIR.UP;
    this.state = GHOST_STATE.IN_HOUSE;
    this.releaseTimer = RELEASE_DELAY[name] || 0;
    this.speedMult = 1;
    this.frightTimer = 0;
    this.freezeTimer = 0;
    this.globalState = GHOST_STATE.SCATTER;
  }

  reset() {
    this.col = this.spawn.col;
    this.row = this.spawn.row;
    this.subX = 0;
    this.subY = 0;
    this.dir = DIR.UP;
    this.state = GHOST_STATE.IN_HOUSE;
    this.releaseTimer = RELEASE_DELAY[this.name] || 0;
    this.speedMult = 1;
    this.frightTimer = 0;
    this.freezeTimer = 0;
  }

  pxCenter() {
    return {
      x: (this.col + 0.5) * TILE + this.subX * TILE,
      y: (this.row + 0.5) * TILE + this.subY * TILE,
    };
  }

  _targetTile() {
    if (this.state === GHOST_STATE.EATEN) return this.maze.ghostHouseCenter;
    if (this.state === GHOST_STATE.FRIGHTENED || this.state === GHOST_STATE.FROZEN) return null;
    if (this.globalState === GHOST_STATE.SCATTER) return SCATTER_TARGETS[this.name];

    const pac = this.pacman;
    const pd = pac.dir;
    switch (this.name) {
      case "blinky":
        return { col: pac.col, row: pac.row };
      case "pinky":
        return { col: pac.col + pd.dx * 4, row: pac.row + pd.dy * 4 };
      case "inky": {
        const anchor = { col: pac.col + pd.dx * 2, row: pac.row + pd.dy * 2 };
        const b = this.blinkyRef ? { col: this.blinkyRef.col, row: this.blinkyRef.row } : anchor;
        return { col: anchor.col * 2 - b.col, row: anchor.row * 2 - b.row };
      }
      case "clyde": {
        const dx = pac.col - this.col, dy = pac.row - this.row;
        if (dx * dx + dy * dy > 64) return { col: pac.col, row: pac.row };
        return SCATTER_TARGETS.clyde;
      }
      default:
        return { col: pac.col, row: pac.row };
    }
  }

  // Access-rättigheter baserat på state
  _canAccess(col, row) {
    const allowDoor = this.state === GHOST_STATE.EATEN || this.state === GHOST_STATE.LEAVING;
    const allowHouse = allowDoor || this.state === GHOST_STATE.IN_HOUSE;
    return this.maze.isGhostWalkable(col, row, allowDoor, allowHouse);
  }

  // Bestäm riktning för spöke som ska ut ur huset
  _leavingDir() {
    const door = this.maze.doorCenter;
    // Ovanför dörren → klart, återgå till global state
    if (this.row < door.row) return DIR.UP;
    // Samma kolumn som dörren → upp
    if (this.col === door.col) return DIR.UP;
    // Annars sidleds mot dörren
    return this.col < door.col ? DIR.RIGHT : DIR.LEFT;
  }

  _pickDirection() {
    const target = this._targetTile();
    const candidates = [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT];

    const filtered = candidates.filter((d) => {
      if (dirOpposite(d, this.dir)) return false;
      const nc = this.col + d.dx, nr = this.row + d.dy;
      return this._canAccess(nc, nr);
    });
    let opts = filtered;
    if (!opts.length) {
      // Fastlåst — tillåt reversering som sista utväg
      opts = candidates.filter((d) => {
        const nc = this.col + d.dx, nr = this.row + d.dy;
        return this._canAccess(nc, nr);
      });
      if (!opts.length) return this.dir; // helt fast
    }

    if (!target) return opts[Math.floor(Math.random() * opts.length)];

    let best = opts[0], bestD = Infinity;
    for (const d of opts) {
      const nc = this.col + d.dx, nr = this.row + d.dy;
      const dd = (nc - target.col) ** 2 + (nr - target.row) ** 2;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  _reverseDir() { return { dx: -this.dir.dx, dy: -this.dir.dy }; }

  setFrightened(seconds) {
    if (this.state === GHOST_STATE.EATEN || this.state === GHOST_STATE.IN_HOUSE) return;
    this.state = GHOST_STATE.FRIGHTENED;
    this.frightTimer = seconds;
    this.dir = this._reverseDir();
  }

  freeze(seconds) {
    if (this.state === GHOST_STATE.EATEN) return;
    this.state = GHOST_STATE.FROZEN;
    this.freezeTimer = seconds;
  }

  onEaten() {
    this.state = GHOST_STATE.EATEN;
    this.frightTimer = 0;
  }

  update(dt, globalState) {
    this.globalState = globalState;

    // IN_HOUSE
    if (this.state === GHOST_STATE.IN_HOUSE) {
      this.releaseTimer -= dt;
      if (this.releaseTimer <= 0) {
        this.state = GHOST_STATE.LEAVING;
        this.dir = this._leavingDir();
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

    // Hastighet
    let speed = BASE_SPEED * this.speedMult;
    if (this.state === GHOST_STATE.FRIGHTENED) speed *= 0.55;
    if (this.state === GHOST_STATE.EATEN) speed *= 2.0;
    if (this.state === GHOST_STATE.LEAVING) speed *= 0.8;

    const step = speed * dt;

    // Kolla vägg framför — om inte walkable, snäpp till cellcentrum och välj ny riktning
    const nc = this.col + this.dir.dx;
    const nr = this.row + this.dir.dy;
    const wrapped = this.maze.wrap(nc, nr);
    const canGo = this._canAccess(wrapped.col, wrapped.row);

    let newSubX = this.subX + this.dir.dx * step;
    let newSubY = this.subY + this.dir.dy * step;

    if (!canGo) {
      if (this.dir.dx > 0 && newSubX > 0) newSubX = 0;
      else if (this.dir.dx < 0 && newSubX < 0) newSubX = 0;
      else if (this.dir.dy > 0 && newSubY > 0) newSubY = 0;
      else if (this.dir.dy < 0 && newSubY < 0) newSubY = 0;
      // Välj ny riktning omedelbart
      if (this.state === GHOST_STATE.LEAVING) {
        this.dir = this._leavingDir();
      } else {
        this.dir = this._pickDirection();
      }
    }

    this.subX = newSubX;
    this.subY = newSubY;

    if (Math.abs(this.subX) >= 0.5 || Math.abs(this.subY) >= 0.5) {
      const nCol = this.col + this.dir.dx;
      const nRow = this.row + this.dir.dy;
      const w = this.maze.wrap(nCol, nRow);
      this.col = w.col;
      this.row = w.row;
      this.subX -= this.dir.dx;
      this.subY -= this.dir.dy;

      // State-övergångar vid ny cell
      if (this.state === GHOST_STATE.LEAVING) {
        const door = this.maze.doorCenter;
        if (this.row < door.row) {
          this.state = this.globalState || GHOST_STATE.SCATTER;
          this.dir = this._pickDirection();
        } else {
          this.dir = this._leavingDir();
        }
      } else if (this.state === GHOST_STATE.EATEN) {
        const center = this.maze.ghostHouseCenter;
        if (this.col === center.col && this.row === center.row) {
          this.state = GHOST_STATE.LEAVING;
          this.dir = this._leavingDir();
        } else {
          this.dir = this._pickDirection();
        }
      } else {
        this.dir = this._pickDirection();
      }
    }
  }

  draw(ctx, time) {
    const { x, y } = this.pxCenter();
    const r = TILE * 0.4;

    if (this.state === GHOST_STATE.EATEN) {
      this._drawEyes(ctx, x, y, r);
      return;
    }

    let body = this.color;
    if (this.state === GHOST_STATE.FRIGHTENED) {
      const blink = this.frightTimer < 2 && Math.floor(this.frightTimer * 4) % 2 === 0;
      body = blink ? "#FFFFFF" : "#3D4EE8";
    }
    if (this.state === GHOST_STATE.FROZEN) body = "#A8E6FF";

    const wobble = (Math.sin(time / 120) + 1) / 2;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.2, r, Math.PI, 0, false);
    ctx.lineTo(x + r, y + r * 0.7);
    const n = 4;
    for (let i = n - 1; i >= 0; i--) {
      const bx = x + r - (i * 2 + 1) * (r / n);
      ctx.lineTo(bx, y + r * 0.7 + (i % 2 === 0 ? -r * 0.12 : 0));
    }
    ctx.lineTo(x - r, y + r * 0.7);
    ctx.closePath();
    ctx.fill();

    if (this.state !== GHOST_STATE.FRIGHTENED && this.state !== GHOST_STATE.FROZEN) {
      this._drawEyes(ctx, x, y, r);
    } else {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.1);
      ctx.lineTo(x - r * 0.25, y - r * 0.25);
      ctx.lineTo(x, y - r * 0.1);
      ctx.lineTo(x + r * 0.25, y - r * 0.25);
      ctx.lineTo(x + r * 0.5, y - r * 0.1);
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.4, 1.5, 0, Math.PI * 2);
      ctx.arc(x + r * 0.35, y - r * 0.4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawEyes(ctx, x, y, r) {
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.arc(x + r * 0.35, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();

    const pdx = this.dir.dx * r * 0.1;
    const pdy = this.dir.dy * r * 0.1;
    ctx.fillStyle = "#0F1116";
    ctx.beginPath();
    ctx.arc(x - r * 0.35 + pdx, y - r * 0.3 + pdy, r * 0.12, 0, Math.PI * 2);
    ctx.arc(x + r * 0.35 + pdx, y - r * 0.3 + pdy, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createGhostPack(maze, pacman) {
  const spawns = maze.ghostSpawns;
  const blinky = new Ghost("blinky", maze, spawns[0], pacman);
  const pinky  = new Ghost("pinky",  maze, spawns[1], pacman);
  const inky   = new Ghost("inky",   maze, spawns[2], pacman, blinky);
  const clyde  = new Ghost("clyde",  maze, spawns[3], pacman);
  return [blinky, pinky, inky, clyde];
}
