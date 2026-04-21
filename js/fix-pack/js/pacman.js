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
    this.subX = 0;   // -0.5..0.5 position inom cellen i rörelseriktningen
    this.subY = 0;
    this.dir = DIR.NONE;
    this.pendingDir = DIR.NONE;
    this.speedMult = 1;
    this.shielded = false;
    this.magnet = false;
    this.magnetRadius = 3;
    this.dead = false;

    this.mouthT = 0;
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

  requestDir(dir) {
    this.pendingDir = dir;
  }

  // Rörelse med iterativ sub-stegsupplösning — garanterar att vi aldrig passerar en vägg.
  update(dt, inputDir) {
    if (this.dead) return null;
    this.mouthT = (this.mouthT + dt * 6) % 2;

    if (inputDir && (inputDir.dx !== 0 || inputDir.dy !== 0)) {
      this.pendingDir = inputDir;
    }

    // Stationär? Försök starta
    if (this.dir.dx === 0 && this.dir.dy === 0) {
      if (this.canMoveInDir(this.pendingDir)) {
        this.dir = this.pendingDir;
      } else {
        return null;
      }
    }

    // 180°-vändning tillåten när som helst
    if (dirOpposite(this.pendingDir, this.dir)) {
      this.dir = this.pendingDir;
      this.subX = -this.subX;
      this.subY = -this.subY;
    }

    const speed = BASE_SPEED * this.speedMult;
    let remaining = speed * dt;
    let eaten = null;
    let safety = 20;

    while (remaining > 1e-6 && safety-- > 0) {
      const dx = this.dir.dx, dy = this.dir.dy;
      if (dx === 0 && dy === 0) break;

      // "Signed sub" i rörelseriktningen: -0.5 vid cellkant, 0 vid mitten, 0.5 vid utkant
      const sub = dx !== 0 ? this.subX : this.subY;
      const dirComp = dx !== 0 ? dx : dy;
      const signedSub = sub * dirComp;

      let eventDist, eventType;
      if (signedSub < -1e-6) {
        eventDist = -signedSub;
        eventType = "center";
      } else {
        eventDist = 0.5 - signedSub;
        eventType = "boundary";
      }
      if (eventDist <= 1e-6) eventDist = 1e-6;

      const stepTaken = Math.min(remaining, eventDist);
      this.subX += dx * stepTaken;
      this.subY += dy * stepTaken;
      remaining -= stepTaken;

      if (stepTaken >= eventDist - 1e-6) {
        if (eventType === "center") {
          // Snap exakt till centrum
          this.subX = 0;
          this.subY = 0;

          // Försök byta till önskad riktning
          if (this.canMoveInDir(this.pendingDir)) {
            this.dir = this.pendingDir;
          }
          // Om aktuell dir inte längre går — stanna
          if (!this.canMoveInDir(this.dir)) {
            this.dir = DIR.NONE;
            break;
          }
        } else {
          // Passera cellkant — gå in i nästa cell
          const newCol = this.col + dx;
          const newRow = this.row + dy;
          const wrapped = this.maze.wrap(newCol, newRow);
          this.col = wrapped.col;
          this.row = wrapped.row;
          this.subX = -dx * 0.5;
          this.subY = -dy * 0.5;

          const ate = this.maze.consumeAt(this.col, this.row);
          if (ate) eaten = ate;
        }
      }
    }

    return eaten;
  }

  die() {
    this.dead = true;
    this.dir = DIR.NONE;
  }

  draw(ctx, time) {
    const { x, y } = this.pxCenter();
    const r = TILE * 0.4;

    // Mun-animation
    const mouthOpen = Math.abs(Math.sin(time / 80));
    const mouthAngle = mouthOpen * 0.7;

    let baseAngle = 0;
    if (this.dir === DIR.RIGHT) baseAngle = 0;
    else if (this.dir === DIR.DOWN) baseAngle = Math.PI / 2;
    else if (this.dir === DIR.LEFT) baseAngle = Math.PI;
    else if (this.dir === DIR.UP) baseAngle = -Math.PI / 2;

    // Sköld
    if (this.shielded) {
      ctx.strokeStyle = "#64D0F2";
      ctx.lineWidth = 2;
      const pulse = 1 + 0.1 * Math.sin(time / 80);
      ctx.beginPath();
      ctx.arc(x, y, r + 4 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Turbo
    if (this.speedMult > 1.3) {
      ctx.fillStyle = "rgba(255, 213, 107, 0.25)";
      const tx = x - this.dir.dx * 6;
      const ty = y - this.dir.dy * 6;
      ctx.beginPath();
      ctx.arc(tx, ty, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Kropp
    ctx.fillStyle = "#FFD56B";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, baseAngle + mouthAngle, baseAngle - mouthAngle + Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Magnet
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
