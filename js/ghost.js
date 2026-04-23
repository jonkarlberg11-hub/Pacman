// ghost.js — fyra spöken med klassiska AI-beteenden

import { TILE, C, COLS, ROWS } from "./maze.js";
import { DIR, dirOpposite } from "./input.js";

const BASE_SPEED = 5.5; // celler/sekund, något långsammare än Pac-Man

export const GHOST_STATE = {
  IN_HOUSE: "in_house",     // i startboxen, väntar på release
  LEAVING: "leaving",       // på väg ut
  CHASE: "chase",
  SCATTER: "scatter",
  FRIGHTENED: "frightened",
  EATEN: "eaten",           // bara ögon, på väg hem
  FROZEN: "frozen",         // frys-powerup
};

// Standardfärger — matchar dark premium-paletten
const COLORS = {
  blinky: "#E85D75",
  pinky:  "#C58DFF",
  inky:   "#64D0F2",
  clyde:  "#F09A5A",
};

// Scatter-hörn
const SCATTER_TARGETS = {
  blinky: { col: COLS - 2, row: 0 },
  pinky:  { col: 1,        row: 0 },
  inky:   { col: COLS - 2, row: ROWS - 1 },
  clyde:  { col: 1,        row: ROWS - 1 },
};

// Släpp-fördröjning per spöke (sekunder)
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
    this.blinkyRef = blinkyRef; // Inky behöver veta var Blinky är
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
    this.globalState = GHOST_STATE.SCATTER; // växlas utifrån
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

  // Target-cell för AI baserat på personlighet
  _targetTile() {
    if (this.state === GHOST_STATE.EATEN) {
      return this.maze.ghostHouseCenter;
    }
    if (this.state === GHOST_STATE.FRIGHTENED || this.state === GHOST_STATE.FROZEN) {
      return null; // slump
    }
    if (this.globalState === GHOST_STATE.SCATTER) {
      return SCATTER_TARGETS[this.name];
    }
    // CHASE — personligheter:
    const pac = this.pacman;
    const pd = pac.dir;
    switch (this.name) {
      case "blinky":
        // Direkt jakt
        return { col: pac.col, row: pac.row };
      case "pinky":
        // 4 celler framför Pac-Man
        return { col: pac.col + pd.dx * 4, row: pac.row + pd.dy * 4 };
      case "inky": {
        // Vektor från Blinky till "2 celler framför Pac-Man", dubbelt
        const anchor = { col: pac.col + pd.dx * 2, row: pac.row + pd.dy * 2 };
        const b = this.blinkyRef ? { col: this.blinkyRef.col, row: this.blinkyRef.row } : anchor;
        return { col: anchor.col * 2 - b.col, row: anchor.row * 2 - b.row };
      }
      case "clyde": {
        // Jagar om >8 celler bort, annars scatter
        const dx = pac.col - this.col, dy = pac.row - this.row;
        const d2 = dx * dx + dy * dy;
        if (d2 > 64) return { col: pac.col, row: pac.row };
        return SCATTER_TARGETS.clyde;
      }
      default:
        return { col: pac.col, row: pac.row };
    }
  }

  // Hitta bästa nästa riktning vid korsning
  _pickDirection() {
    const target = this._targetTile();
    const candidates = [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT];

    // Spöken kan normalt inte vända 180° (utom vid state-byte — hanteras annorstädes)
    const filtered = candidates.filter((d) => {
      if (dirOpposite(d, this.dir)) return false;
      const nc = this.col + d.dx, nr = this.row + d.dy;
      // I chase/scatter får de INTE återgå genom dörren — bara i EATEN
      const allowDoor = this.state === GHOST_STATE.EATEN || this.state === GHOST_STATE.LEAVING;
      return this.maze.isGhostWalkable(nc, nr, allowDoor);
    });
    const opts = filtered.length ? filtered : [this._reverseDir()];

    // Frightened/frozen → slumpa
    if (!target) {
      return opts[Math.floor(Math.random() * opts.length)];
    }

    // Välj den som minimerar avstånd till target
    let best = opts[0], bestD = Infinity;
    for (const d of opts) {
      const nc = this.col + d.dx, nr = this.row + d.dy;
      const dd = (nc - target.col) ** 2 + (nr - target.row) ** 2;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  _reverseDir() {
    return { dx: -this.dir.dx, dy: -this.dir.dy };
  }

  // Starta LEAVING-sekvensen — snap till cellcentrum och välj första riktning.
  // Om spöket redan står på exit-cellen (Blinky) hoppar vi direkt till chase/
  // scatter och låter _pickDirection välja en giltig riktning, så han inte
  // vandrar in i väggen ovanför dörren.
  _beginLeaving() {
    this.subX = 0;
    this.subY = 0;
    const exit = this.maze.ghostExit;
    if (exit && this.col === exit.col && this.row === exit.row) {
      this.state = this.globalState || GHOST_STATE.SCATTER;
      this.dir = this._pickDirection();
      return;
    }
    this.state = GHOST_STATE.LEAVING;
    this.dir = this._leavingDirection();
  }

  // Dedikerad exit-rutt: först justera kolumn mot dörrens mitt, sen rakt upp.
  _leavingDirection() {
    const exit = this.maze.ghostExit;
    if (!exit) return DIR.UP;
    if (this.row > exit.row) {
      if (this.col < exit.col) return DIR.RIGHT;
      if (this.col > exit.col) return DIR.LEFT;
      return DIR.UP;
    }
    return DIR.UP;
  }

  // State-medveten riktningsväljare. Körs vid cellcentrum (subX=subY=0).
  _chooseDirection() {
    if (this.state === GHOST_STATE.LEAVING) {
      const exit = this.maze.ghostExit;
      const atExit = exit && this.col === exit.col && this.row === exit.row;
      const cell = this.maze.cellAt(this.col, this.row);
      if (atExit || (cell !== C.GHOST_HOME && cell !== C.DOOR)) {
        this.state = this.globalState || GHOST_STATE.SCATTER;
        return this._pickDirection();
      }
      return this._leavingDirection();
    }
    if (this.state === GHOST_STATE.EATEN) {
      const center = this.maze.ghostHouseCenter;
      if (this.col === center.col && this.row === center.row) {
        this.state = GHOST_STATE.LEAVING;
        return DIR.UP;
      }
      return this._pickDirection();
    }
    return this._pickDirection();
  }

  setFrightened(seconds) {
    if (this.state === GHOST_STATE.EATEN || this.state === GHOST_STATE.IN_HOUSE) return;
    this.state = GHOST_STATE.FRIGHTENED;
    this.frightTimer = seconds;
    this.dir = this._reverseDir(); // klassisk: vänd tvärt
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

    if (this.state === GHOST_STATE.IN_HOUSE) {
      this.releaseTimer -= dt;
      if (this.releaseTimer <= 0) {
        this._beginLeaving();
      }
      return;
    }

    if (this.state === GHOST_STATE.FRIGHTENED) {
      this.frightTimer -= dt;
      if (this.frightTimer <= 0) {
        this.state = this.globalState;
      }
    }
    if (this.state === GHOST_STATE.FROZEN) {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) {
        this.state = this.globalState;
      } else {
        return;
      }
    }

    let speed = BASE_SPEED * this.speedMult;
    if (this.state === GHOST_STATE.FRIGHTENED) speed *= 0.55;
    if (this.state === GHOST_STATE.EATEN) speed *= 2.0;
    if (this.state === GHOST_STATE.LEAVING) speed *= 0.8;

    let remaining = speed * dt;

    // Segment-stepping — snap till cellcentrum och cellgräns, så riktnings-
    // beslut alltid sker vid sub=0 (annars driftar perpendikulär sub-axel).
    while (remaining > 1e-9) {
      if (this.dir.dx === 0 && this.dir.dy === 0) break;

      const onX = this.dir.dx !== 0;
      const sub = onX ? this.subX : this.subY;
      const sign = onX ? this.dir.dx : this.dir.dy;

      const nextStop = (sub * sign < -1e-9) ? 0 : 0.5 * sign;
      const dist = Math.abs(nextStop - sub);

      if (remaining + 1e-9 < dist) {
        if (onX) this.subX += sign * remaining;
        else this.subY += sign * remaining;
        remaining = 0;
        break;
      }

      if (onX) this.subX = nextStop;
      else this.subY = nextStop;
      remaining -= dist;

      if (nextStop === 0) {
        // Vid cellcentrum — AI-beslut, subX och subY är nu exakt 0
        this.dir = this._chooseDirection();
      } else {
        // Vid cellgräns — flytta till nästa cell, behåll dir
        const newCol = this.col + this.dir.dx;
        const newRow = this.row + this.dir.dy;
        const wrapped = this.maze.wrap(newCol, newRow);
        this.col = wrapped.col;
        this.row = wrapped.row;
        this.subX -= this.dir.dx;
        this.subY -= this.dir.dy;
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
    if (this.state === GHOST_STATE.FROZEN) {
      body = "#A8E6FF";
    }

    // Klassisk spökkropp: halvcirkel topp + 3 tänder i botten.
    // Path går höger-till-vänster genom botten — inga korsande segment.
    // Bounding box (x±r, y±r) är identisk med Pac-Mans cirkel.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0, false);
    ctx.lineTo(x + r,       y + r);
    ctx.lineTo(x + r * 0.5, y + r * 0.7);
    ctx.lineTo(x,           y + r);
    ctx.lineTo(x - r * 0.5, y + r * 0.7);
    ctx.lineTo(x - r,       y + r);
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
    // Vitögon
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.arc(x + r * 0.35, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Pupiller — riktade mot rörelse
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
  // Skapar alla 4 spöken med korrekta spawn-positioner
  const spawns = maze.ghostSpawns;
  const blinky = new Ghost("blinky", maze, spawns[0], pacman);
  const pinky  = new Ghost("pinky",  maze, spawns[1], pacman);
  const inky   = new Ghost("inky",   maze, spawns[2], pacman, blinky);
  const clyde  = new Ghost("clyde",  maze, spawns[3], pacman);
  return [blinky, pinky, inky, clyde];
}
