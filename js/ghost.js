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

    // IN_HOUSE timer
    if (this.state === GHOST_STATE.IN_HOUSE) {
      this.releaseTimer -= dt;
      if (this.releaseTimer <= 0) {
        this.state = GHOST_STATE.LEAVING;
        this.dir = DIR.UP;
      }
      return;
    }

    // Timers
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
        return; // frys = ingen rörelse
      }
    }

    // Hastighet per state
    let speed = BASE_SPEED * this.speedMult;
    if (this.state === GHOST_STATE.FRIGHTENED) speed *= 0.55;
    if (this.state === GHOST_STATE.EATEN) speed *= 2.0;
    if (this.state === GHOST_STATE.LEAVING) speed *= 0.8;

    // Rör framåt
    const step = speed * dt;
    this.subX += this.dir.dx * step;
    this.subY += this.dir.dy * step;

    if (Math.abs(this.subX) >= 0.5 || Math.abs(this.subY) >= 0.5) {
      // Byt cell
      const newCol = this.col + this.dir.dx;
      const newRow = this.row + this.dir.dy;
      const wrapped = this.maze.wrap(newCol, newRow);
      this.col = wrapped.col;
      this.row = wrapped.row;
      this.subX -= this.dir.dx;
      this.subY -= this.dir.dy;

      // Vid ny cell: välj ny riktning
      if (this.state === GHOST_STATE.LEAVING) {
        // Gå tills vi är ovanför dörren och utanför huset
        if (this.maze.cellAt(this.col, this.row) !== C.GHOST_HOME &&
            this.maze.cellAt(this.col, this.row) !== C.DOOR) {
          this.state = this.globalState || GHOST_STATE.SCATTER;
        }
        this.dir = this._pickDirection();
      } else if (this.state === GHOST_STATE.EATEN) {
        // När vi är hemma: återfödas
        const center = this.maze.ghostHouseCenter;
        if (this.col === center.col && this.row === center.row) {
          this.state = GHOST_STATE.LEAVING;
          this.dir = DIR.UP;
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

    // EATEN = bara ögon
    if (this.state === GHOST_STATE.EATEN) {
      this._drawEyes(ctx, x, y, r);
      return;
    }

    // Välj färg baserat på state
    let body = this.color;
    if (this.state === GHOST_STATE.FRIGHTENED) {
      const blink = this.frightTimer < 2 && Math.floor(this.frightTimer * 4) % 2 === 0;
      body = blink ? "#FFFFFF" : "#3D4EE8";
    }
    if (this.state === GHOST_STATE.FROZEN) {
      body = "#A8E6FF";
    }

    // Kropp: rundad topp + våg-botten
    const wobble = (Math.sin(time / 120) + 1) / 2; // 0..1
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.2, r, Math.PI, 0, false);
    ctx.lineTo(x + r, y + r * 0.7);
    // Våg längs botten
    const n = 4;
    for (let i = n - 1; i >= 0; i--) {
      const bx = x + r - (i * 2 + 1) * (r / n);
      const dy = (i % 2 === 0) ? (r * 0.15 * (1 - wobble)) : (r * 0.35);
      ctx.lineTo(bx, y + r * 0.7 + (i % 2 === 0 ? -r * 0.12 : 0));
    }
    ctx.lineTo(x - r, y + r * 0.7);
    ctx.closePath();
    ctx.fill();

    // Ögon — inte i frightened mode
    if (this.state !== GHOST_STATE.FRIGHTENED && this.state !== GHOST_STATE.FROZEN) {
      this._drawEyes(ctx, x, y, r);
    } else {
      // Rädd/fryst mun
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.1);
      ctx.lineTo(x - r * 0.25, y - r * 0.25);
      ctx.lineTo(x, y - r * 0.1);
      ctx.lineTo(x + r * 0.25, y - r * 0.25);
      ctx.lineTo(x + r * 0.5, y - r * 0.1);
      ctx.stroke();
      // Ögon som prickar
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
