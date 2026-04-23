// pacman.js — spelarens rörelse, kollisioner, rendering

import { TILE, C } from "./maze.js";
import { DIR, dirEqual, dirOpposite } from "./input.js";

// Bas-fart: celler per sekund
const BASE_SPEED = 6.5;

export class Pacman {
  constructor(maze) {
    this.maze = maze;
    const s = maze.pacStart;
    this.col = s.col;
    this.row = s.row;
    this.subX = 0;   // 0..1 framsteg mot nästa cell
    this.subY = 0;
    this.dir = DIR.NONE;
    this.pendingDir = DIR.NONE;
    this.speedMult = 1;
    this.shielded = false;
    this.magnet = false;
    this.magnetRadius = 3;
    this.dead = false;

    // Animation
    this.mouthT = 0; // 0..1 för mun-öppning
  }

  reset() {
    const s = this.maze.pacStart;
    this.col = s.col;
    this.row = s.row;
    this.subX = 0;
    this.subY = 0;
    this.dir = DIR.NONE;
    this.pendingDir = DIR.NONE;
    this.speedMult = 1;
    this.shielded = false;
    this.magnet = false;
    this.dead = false;
    this.mouthT = 0;
  }

  // Centrumpixel
  pxCenter() {
    return {
      x: (this.col + 0.5) * TILE + this.subX * TILE,
      y: (this.row + 0.5) * TILE + this.subY * TILE,
    };
  }

  canMoveInDir(dir) {
    if (dir.dx === 0 && dir.dy === 0) return false;
    const next = this.maze.wrap(this.col + dir.dx, this.row + dir.dy);
    return this.maze.isWalkable(next.col, next.row);
  }

  // Spelaren begär ny riktning (via input)
  requestDir(dir) {
    this.pendingDir = dir;
  }

  // Steg framåt med dt (sekunder)
  update(dt, inputDir) {
    if (this.dead) return null;

    // Uppdatera mun
    this.mouthT = (this.mouthT + dt * 6) % 2; // 0..2, 0-1 öppen, 1-2 stängd

    // Byt riktning om spelaren bad om det
    if (inputDir && (inputDir.dx !== 0 || inputDir.dy !== 0)) {
      this.pendingDir = inputDir;
    }

    // 180° vändning tillåts direkt (pacman snäpper)
    if ((this.pendingDir.dx !== 0 || this.pendingDir.dy !== 0) &&
        dirOpposite(this.pendingDir, this.dir)) {
      this.dir = this.pendingDir;
      this.subX = -this.subX;
      this.subY = -this.subY;
    }

    // Bootstrap: om vi står stilla (dir=NONE) och en giltig riktning finns i
    // pendingDir, adoptera den nu. Täcker spelstart och omstart efter väggstopp.
    if (this.dir.dx === 0 && this.dir.dy === 0 && this.canMoveInDir(this.pendingDir)) {
      this.dir = this.pendingDir;
    }

    const speed = BASE_SPEED * this.speedMult;
    let remaining = speed * dt;
    let eaten = null;

    // Flytta i segment — stanna vid varje beslutningspunkt (cellcentrum
    // för riktningsbyte/väggstopp, cellgräns för cellbyte). Detta gör
    // rörelsen dt-oberoende och förhindrar att man glider genom väggar.
    while (remaining > 1e-9) {
      if (this.dir.dx === 0 && this.dir.dy === 0) break;

      const onX = this.dir.dx !== 0;
      const sub = onX ? this.subX : this.subY;
      const sign = onX ? this.dir.dx : this.dir.dy;

      // Om sub har motsatt tecken mot rörelseriktningen är vi på väg mot
      // centrum (sub=0). Annars siktar vi på cellgränsen (sub = 0.5 * sign).
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
        // Vid cellcentrum — försök byta till pendingDir, annars stoppa vid vägg
        if (this.canMoveInDir(this.pendingDir)) {
          this.dir = this.pendingDir;
        } else if (!this.canMoveInDir(this.dir)) {
          this.dir = DIR.NONE;
          break;
        }
      } else {
        // Vid cellgräns — flytta till nästa cell
        const newCol = this.col + this.dir.dx;
        const newRow = this.row + this.dir.dy;
        const wrapped = this.maze.wrap(newCol, newRow);
        this.col = wrapped.col;
        this.row = wrapped.row;
        this.subX -= this.dir.dx;
        this.subY -= this.dir.dy;

        const got = this.maze.consumeAt(this.col, this.row);
        if (got) eaten = got;
      }
    }

    return eaten;
  }

  // Används vid dödsfall — enkel animation kan läggas till senare
  die() {
    this.dead = true;
    this.dir = DIR.NONE;
  }

  // Rendering
  draw(ctx, time) {
    const { x, y } = this.pxCenter();
    const r = TILE * 0.4;

    // Mun-öppning (0 stängd, 1 öppen)
    const mouthOpen = Math.abs(Math.sin(time / 80));
    const mouthAngle = mouthOpen * 0.7; // radianer

    // Baserat på riktning, rotera
    let baseAngle = 0;
    if (this.dir === DIR.RIGHT) baseAngle = 0;
    else if (this.dir === DIR.DOWN) baseAngle = Math.PI / 2;
    else if (this.dir === DIR.LEFT) baseAngle = Math.PI;
    else if (this.dir === DIR.UP) baseAngle = -Math.PI / 2;

    // Sköld — extra ring
    if (this.shielded) {
      ctx.strokeStyle = "#64D0F2";
      ctx.lineWidth = 2;
      const pulse = 1 + 0.1 * Math.sin(time / 80);
      ctx.beginPath();
      ctx.arc(x, y, r + 4 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Turbo — fart-trails
    if (this.speedMult > 1.3) {
      ctx.fillStyle = "rgba(255, 213, 107, 0.25)";
      const tx = x - this.dir.dx * 6;
      const ty = y - this.dir.dy * 6;
      ctx.beginPath();
      ctx.arc(tx, ty, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Själva Pac-Man
    ctx.fillStyle = "#FFD56B";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, baseAngle + mouthAngle, baseAngle - mouthAngle + Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Magnet-indikator
    if (this.magnet) {
      ctx.strokeStyle = "rgba(232, 93, 117, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, this.magnetRadius * TILE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
