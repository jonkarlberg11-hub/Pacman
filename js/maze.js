// maze.js — parsar textbanor, sköter kollisioner och ritning av väggar + prickar

export const TILE = 20;          // pixel per cell
export const COLS = 19;
export const ROWS = 21;

// Celltyper
export const C = {
  WALL: 0,
  EMPTY: 1,
  DOT: 2,
  PELLET: 3,
  DOOR: 4,       // spökdörr (spöken kan, spelare kan inte)
  GHOST_HOME: 5, // spökhus-golv (spelare kan inte)
  TUNNEL: 6,     // teleport-yta
};

function charToCell(ch) {
  switch (ch) {
    case "#": return C.WALL;
    case ".": return C.DOT;
    case "o": return C.PELLET;
    case "-": return C.DOOR;
    case " ": return C.EMPTY;
    case "T": return C.TUNNEL;
    case "G": return C.GHOST_HOME;
    case "P": return C.EMPTY;   // Pac-Man-startcell är tom
    default:  return C.EMPTY;
  }
}

export class Maze {
  constructor(text) {
    const rows = text.split("\n").filter((r) => r.length > 0);
    if (rows.length < ROWS) throw new Error(`Banan har ${rows.length} rader, förväntade ${ROWS}`);

    this.grid = [];
    this.pacStart = { col: 9, row: 15 };
    this.ghostHomeTiles = [];
    this.tunnelTiles = [];
    this.doorTiles = [];
    this.totalDots = 0;

    for (let r = 0; r < ROWS; r++) {
      const row = [];
      const src = rows[r];
      for (let c = 0; c < COLS; c++) {
        const ch = src[c] || " ";
        const cell = charToCell(ch);
        row.push(cell);

        if (ch === "P") this.pacStart = { col: c, row: r };
        if (ch === "G") this.ghostHomeTiles.push({ col: c, row: r });
        if (ch === "T") this.tunnelTiles.push({ col: c, row: r });
        if (ch === "-") this.doorTiles.push({ col: c, row: r });
        if (cell === C.DOT || cell === C.PELLET) this.totalDots++;
      }
      this.grid.push(row);
    }

    // Ghost-spawn: välj 4 positioner. Om färre än 4 G:n, upprepa sista.
    this.ghostSpawns = [];
    if (this.ghostHomeTiles.length === 0) {
      this.ghostSpawns = [
        { col: 9, row: 9 }, { col: 8, row: 9 }, { col: 10, row: 9 }, { col: 9, row: 10 },
      ];
    } else {
      for (let i = 0; i < 4; i++) {
        this.ghostSpawns.push(this.ghostHomeTiles[i % this.ghostHomeTiles.length]);
      }
    }

    // Bestäm ghost home center (används för eaten-mode)
    this.ghostHouseCenter = this._computeCenter(this.ghostHomeTiles.length ? this.ghostHomeTiles : this.ghostSpawns);

    // Exit-cell: rakt ovanför mittendörren — mål för spöken som lämnar huset
    if (this.doorTiles.length > 0) {
      const cols = this.doorTiles.map((t) => t.col).sort((a, b) => a - b);
      const midCol = cols[Math.floor(cols.length / 2)];
      const doorRow = this.doorTiles[0].row;
      this.ghostExit = { col: midCol, row: doorRow - 1 };
    } else {
      this.ghostExit = this.ghostHouseCenter;
    }

    // Tunnlar kopplas i par (vänster–höger). Antag exakt 2 eller 0.
    if (this.tunnelTiles.length === 2) {
      this.tunnelPair = [this.tunnelTiles[0], this.tunnelTiles[1]];
    } else {
      this.tunnelPair = null;
    }
  }

  _computeCenter(tiles) {
    if (!tiles.length) return { col: 9, row: 9 };
    let sc = 0, sr = 0;
    tiles.forEach((t) => { sc += t.col; sr += t.row; });
    return { col: Math.round(sc / tiles.length), row: Math.round(sr / tiles.length) };
  }

  cellAt(col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return C.WALL;
    return this.grid[row][col];
  }

  // Fri gång för Pac-Man
  isWalkable(col, row) {
    const cell = this.cellAt(col, row);
    return cell !== C.WALL && cell !== C.DOOR && cell !== C.GHOST_HOME;
  }

  // Fri gång för spöke i normal mode
  isGhostWalkable(col, row, allowDoor = true) {
    const cell = this.cellAt(col, row);
    if (cell === C.WALL) return false;
    if (cell === C.DOOR && !allowDoor) return false;
    return true;
  }

  // Tunnel-wrapping: returnerar ev. ny position
  wrap(col, row) {
    if (!this.tunnelPair) return { col, row };
    const [a, b] = this.tunnelPair;
    if (col < 0) return { col: b.col, row: b.row };
    if (col >= COLS) return { col: a.col, row: a.row };
    return { col, row };
  }

  // Plocka prick/pellet, returnera vad som plockades
  consumeAt(col, row) {
    const cell = this.cellAt(col, row);
    if (cell === C.DOT) {
      this.grid[row][col] = C.EMPTY;
      return "dot";
    } else if (cell === C.PELLET) {
      this.grid[row][col] = C.EMPTY;
      return "pellet";
    }
    return null;
  }

  remainingDots() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (cell === C.DOT || cell === C.PELLET) n++;
      }
    }
    return n;
  }

  // Alla tomma celler (för power-up spawn)
  emptyWalkableTiles() {
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (cell === C.EMPTY || cell === C.DOT) out.push({ col: c, row: r });
      }
    }
    return out;
  }

  // ========== Rendering ==========
  draw(ctx, time) {
    // Bakgrund
    ctx.fillStyle = "#0F1116";
    ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);

    // Väggar: rundade rektanglar fyllda + med stroke
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (cell === C.WALL) {
          this._drawWall(ctx, c, r);
        } else if (cell === C.DOOR) {
          this._drawDoor(ctx, c, r);
        }
      }
    }

    // Prickar & pellets
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (cell === C.DOT) this._drawDot(ctx, c, r);
        else if (cell === C.PELLET) this._drawPellet(ctx, c, r, time);
      }
    }
  }

  _drawWall(ctx, c, r) {
    const x = c * TILE, y = r * TILE;
    ctx.fillStyle = "#1A1D2A";
    ctx.strokeStyle = "#5865F2";
    ctx.lineWidth = 1;
    const pad = 1;
    this._roundRect(ctx, x + pad, y + pad, TILE - pad * 2, TILE - pad * 2, 3);
    ctx.fill();
    ctx.stroke();
  }

  _drawDoor(ctx, c, r) {
    const x = c * TILE, y = r * TILE;
    ctx.fillStyle = "#FFB8D1";
    ctx.fillRect(x + 2, y + TILE / 2 - 2, TILE - 4, 4);
  }

  _drawDot(ctx, c, r) {
    const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
    ctx.fillStyle = "#A8B0C8";
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawPellet(ctx, c, r, time) {
    const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
    // Pulserar
    const pulse = 0.7 + 0.3 * Math.sin(time / 250);
    ctx.fillStyle = "#FFD56B";
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

// Hjälp: ladda en bana via fetch
export async function loadMaze(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunde inte ladda bana: ${url}`);
  return await res.text();
}
