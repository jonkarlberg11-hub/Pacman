// pacman.js — spelarens rörelse, kollisioner, rendering

import { TILE, C } from "./maze.js";
import { DIR, dirEqual, dirOpposite } from "./input.js";

const BASE_SPEED = 6.5;

export class Pacman {
  constructor(maze) {
    this.maze = maze;
    const s = maze.pacStart;
    this.col = s.col;
    this.row = s.row;
    this.subX = 0;
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

  update(dt, inputDir) {
    if (this.dead) return null;

    this.mouthT = (this.mouthT + dt * 6) % 2;

    if (inputDir && (inputDir.dx !== 0 || inputDir.dy !== 0)) {
      this.pendingDir = inputDir;
    }

    const atCenter = Math.abs(this.subX) < 0.05 && Math.abs(this.subY) < 0.05;
    if (atCenter) {
      if (this.canMoveInDir(this.pendingDir)) {
        this.dir = this.pendingDir;
      } else if (!this.canMoveInDir(this.dir)) {
        this.dir = DIR.NONE;
        this.subX = 0;
        this.subY = 0;
      }
    }

    // 180° vändning mitt i cell
    if (!atCenter && this.pendingDir && dirOpposite(this.pendingDir, this.dir)) {
      this.dir = this.pendingDir;
      this.subX = -this.subX;
      this.subY = -this.subY;
    }

    // Rörelse
    if (this.dir.dx !== 0 || this.dir.dy !== 0) {
      const speed = BASE_SPEED * this.speedMult;
      const step = speed * dt;
      const nextWalkable = this.canMoveInDir(this.dir);

      let newSubX = this.subX + this.dir.dx * step;
      let newSubY = this.subY + this.dir.dy * step;

      // Vägg i aktuell riktning → clampa vid cellmitten (subX/Y=0)
      if (!nextWalkable) {
        if (this.dir.dx > 0 && newSubX > 0) newSubX = 0;
        else if (this.dir.dx < 0 && newSubX < 0) newSubX = 0;
        else if (this.dir.dy > 0 && newSubY > 0) newSubY = 0;
        else if (this.dir.dy < 0 && newSubY < 0) newSubY = 0;
      }

      this.subX = newSubX;
      this.subY = newSubY;

      // Cell-byte när vi passerat ±0.5
      if (Math.abs(this.subX) >= 0.5 || Math.abs(this.subY) >= 0.5) {
        const newCol = this.col + this.dir.dx;
        const newRow = this.row + this.dir.dy;
        const wrapped = this.maze.wrap(newCol, newRow);
        this.col = wrapped.col;
        this.row = wrapped.row;
        this.subX -= this.dir.dx;
        this.subY -= this.dir.dy;

        return this.maze.consumeAt(this.col, this.row);
      }
    }
    return null;
  }

  die() {
    this.dead = true;
    this.dir = DIR.NONE;
  }

  draw(ctx, time) {
    const { x, y } = this.pxCenter();
    const r = TILE * 0.4;
    const mouthOpen = Math.abs(Math.sin(time / 80));
    const mouthAngle = mouthOpen * 0.7;

    let baseAngle = 0;
    if (this.dir === DIR.RIGHT) baseAngle = 0;
    else if (this.dir === DIR.DOWN) baseAngle = Math.PI / 2;
    else if (this.dir === DIR.LEFT) baseAngle = Math.PI;
    else if (this.dir === DIR.UP) baseAngle = -Math.PI / 2;

    if (this.shielded) {
      ctx.strokeStyle = "#64D0F2";
      ctx.lineWidth = 2;
      const pulse = 1 + 0.1 * Math.sin(time / 80);
      ctx.beginPath();
      ctx.arc(x, y, r + 4 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.speedMult > 1.3) {
      ctx.fillStyle = "rgba(255, 213, 107, 0.25)";
      const tx = x - this.dir.dx * 6;
      const ty = y - this.dir.dy * 6;
      ctx.beginPath();
      ctx.arc(tx, ty, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#FFD56B";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, baseAngle + mouthAngle, baseAngle - mouthAngle + Math.PI * 2);
    ctx.closePath();
    ctx.fill();

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
