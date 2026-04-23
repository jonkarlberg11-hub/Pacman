// game.js — huvudklassen som driver spelet

import { Maze, loadMaze, TILE, COLS, ROWS, C } from "./maze.js";
import { Pacman } from "./pacman.js";
import { Ghost, GHOST_STATE, createGhostPack } from "./ghost.js";
import { PowerupManager, PU, LABELS, COLORS } from "./powerup.js";
import { InputHandler, DIR, dirEqual } from "./input.js";
import { Haptic, Sfx } from "./audio.js";

// Svårighetsparametrar
const DIFFICULTIES = {
  easy:   { activeGhosts: 2, ghostSpeed: 0.7, frightTime: 10, lives: 3, pacSpeed: 1.0 },
  medium: { activeGhosts: 4, ghostSpeed: 1.0, frightTime: 6,  lives: 3, pacSpeed: 1.0 },
  hard:   { activeGhosts: 4, ghostSpeed: 1.1, frightTime: 3,  lives: 2, pacSpeed: 1.0 },
};

// Banor i rotation per svårighet
const MAZE_LIST = {
  easy:   ["easy-01",   "easy-02",   "easy-03"],
  medium: ["medium-01", "medium-02", "medium-03"],
  hard:   ["hard-01",   "hard-02",   "hard-03"],
};

// Scatter/chase växling (sekunder)
const PHASE_SEQUENCE = [7, 20, 7, 20, 5, 99999]; // scatter, chase, scatter, chase, scatter, chase (lång)

export const STATE = {
  MENU: "menu",
  PLAYING: "playing",
  PAUSED: "paused",
  DYING: "dying",
  GAMEOVER: "gameover",
  WIN: "win",
  COMPLETE: "complete",
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = new InputHandler(canvas);
    this.input.onPauseToggle = () => this.togglePause();

    this.state = STATE.MENU;
    this.difficulty = "medium";
    this.levelIdx = 0;

    this.maze = null;
    this.pacman = null;
    this.ghosts = [];
    this.powerups = null;

    this.score = 0;
    this.lives = 3;
    this.highscore = +(localStorage.getItem("pacman_highscore") || 0);
    this.awardedExtraLives = new Set(); // vid vilka milstolpar liv utdelade
    this.ghostEatChain = 0; // 200 → 400 → 800 → 1600 när man äter flera i rad

    this.scatterChaseTimer = 0;
    this.phaseIdx = 0;
    this.globalGhostState = GHOST_STATE.SCATTER;

    this.dyingTimer = 0;
    this.startDelay = 0;
    this._frightActive = false; // för frightened-ljudloopen

    this.timeAcc = 0;
    this.lastFrame = 0;

    // Callbacks så main.js kan uppdatera UI
    this.onScoreChange = null;
    this.onLevelChange = null;
    this.onLivesChange = null;
    this.onGameOver = null;
    this.onWin = null;
    this.onComplete = null;
    this.onPowerupsChange = null;
    this.onHighscore = null;

    // Touchhantering av resize
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  // ========== Storleksanpassning ==========
  resize() {
    const maxW = Math.min(window.innerWidth - 20, 500);
    const maxH = window.innerHeight - 180; // lämna plats för HUD + liv
    const aspect = COLS / ROWS;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    this.canvas.style.width = `${Math.floor(w)}px`;
    this.canvas.style.height = `${Math.floor(h)}px`;
    this.canvas.width = COLS * TILE;
    this.canvas.height = ROWS * TILE;
  }

  // ========== Meny → start ==========
  async start(difficulty) {
    this.difficulty = difficulty;
    this.levelIdx = 0;
    this.score = 0;
    this.lives = DIFFICULTIES[difficulty].lives;
    this.awardedExtraLives = new Set();
    this.state = STATE.PLAYING;
    await this.loadLevel(0);
    this._fireHud();
    if (!this.lastFrame) this._startLoop();
  }

  async loadLevel(idx) {
    const diffMazes = MAZE_LIST[this.difficulty];
    const name = diffMazes[idx % diffMazes.length];
    const text = await loadMaze(`mazes/${name}.txt`);
    this.maze = new Maze(text);
    this.pacman = new Pacman(this.maze);
    this.pacman.speedMult = DIFFICULTIES[this.difficulty].pacSpeed;

    this.ghosts = createGhostPack(this.maze, this.pacman);
    const active = DIFFICULTIES[this.difficulty].activeGhosts;
    this.ghosts.forEach((g, i) => {
      g.speedMult = DIFFICULTIES[this.difficulty].ghostSpeed;
      if (i >= active) g.state = GHOST_STATE.IN_HOUSE, g.releaseTimer = 999999;
    });

    this.powerups = new PowerupManager(this.maze, this.difficulty);
    this.scatterChaseTimer = 0;
    this.phaseIdx = 0;
    this.globalGhostState = GHOST_STATE.SCATTER;
    this.ghostEatChain = 0;
    this.startDelay = 1.2; // kort paus så spelaren hinner se banan
    this.input.clear();
    Sfx.frightenedStop();
    this._frightActive = false;
    Sfx.intro();
    this._fireHud();
    if (this.onPowerupsChange) this.onPowerupsChange([]);
  }

  // ========== Main loop ==========
  _startLoop() {
    const loop = (now) => {
      if (!this.lastFrame) this.lastFrame = now;
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.update(dt);
      this.draw();
      requestAnimationFrame(loop);
    };
    this.lastFrame = 0;
    requestAnimationFrame(loop);
  }

  update(dt) {
    this.timeAcc += dt * 1000;

    if (this.state === STATE.PAUSED) return;
    if (this.state === STATE.MENU || this.state === STATE.GAMEOVER ||
        this.state === STATE.WIN || this.state === STATE.COMPLETE) return;

    if (this.state === STATE.DYING) {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) this._afterDeath();
      return;
    }

    if (this.startDelay > 0) {
      this.startDelay -= dt;
      return;
    }

    // Fas-tidtagning (scatter/chase)
    this.scatterChaseTimer += dt;
    const phase = PHASE_SEQUENCE[this.phaseIdx];
    if (this.scatterChaseTimer >= phase) {
      this.scatterChaseTimer = 0;
      this.phaseIdx = Math.min(this.phaseIdx + 1, PHASE_SEQUENCE.length - 1);
      this.globalGhostState = (this.phaseIdx % 2 === 0) ? GHOST_STATE.SCATTER : GHOST_STATE.CHASE;
    }

    // Pacman
    const inputDir = this.input.consumeRequested();
    const eaten = this.pacman.update(dt, inputDir);

    if (eaten === "dot") {
      this._addScore(10);
      Haptic.dot();
      Sfx.dot();
      this.powerups.onDotEaten();
    } else if (eaten === "pellet") {
      this._addScore(50);
      Haptic.pellet();
      Sfx.pellet();
      const fright = DIFFICULTIES[this.difficulty].frightTime;
      this.ghosts.forEach((g) => g.setFrightened(fright));
      this.ghostEatChain = 0;
    }

    // Power-up pickup
    const picked = this.powerups.checkPickup(this.pacman.col, this.pacman.row);
    if (picked) {
      this._applyPowerup(picked);
    }

    // Magnet: dra in prickar inom radius
    if (this.powerups.hasEffect(PU.MAGNET)) {
      this._applyMagnet();
    }

    // Uppdatera power-ups
    this.powerups.update(dt);
    this._syncPowerupEffects();

    // Spöken
    for (const g of this.ghosts) {
      g.update(dt, this.globalGhostState);
    }

    // Frightened-ljudloop: auto-start/stop baserat på om något spöke är rädd
    const anyFright = this.ghosts.some((g) => g.state === GHOST_STATE.FRIGHTENED);
    if (anyFright !== this._frightActive) {
      this._frightActive = anyFright;
      if (anyFright) Sfx.frightenedStart();
      else Sfx.frightenedStop();
    }

    // Kollisioner Pac-Man ↔ spöken
    this._checkGhostCollisions();

    // Vinst?
    if (this.maze.remainingDots() === 0) {
      this._winLevel();
    }

    // Uppdatera chips i UI
    if (this.onPowerupsChange) {
      this.onPowerupsChange(this.powerups.activeEffectList());
    }
  }

  _syncPowerupEffects() {
    // Synka pacman/ghost flags med aktiva effekter
    this.pacman.shielded = this.powerups.hasEffect(PU.SHIELD);
    this.pacman.speedMult = this.powerups.hasEffect(PU.TURBO)
      ? DIFFICULTIES[this.difficulty].pacSpeed * 1.6
      : DIFFICULTIES[this.difficulty].pacSpeed;
    this.pacman.magnet = this.powerups.hasEffect(PU.MAGNET);

    const slowActive = this.powerups.hasEffect(PU.SLOW_MO);
    const freezeActive = this.powerups.hasEffect(PU.FREEZE);
    for (const g of this.ghosts) {
      if (slowActive && g.state !== GHOST_STATE.EATEN) {
        g.speedMult = DIFFICULTIES[this.difficulty].ghostSpeed * 0.5;
      } else {
        g.speedMult = DIFFICULTIES[this.difficulty].ghostSpeed;
      }
      if (freezeActive && g.state !== GHOST_STATE.EATEN &&
          g.state !== GHOST_STATE.FROZEN && g.state !== GHOST_STATE.IN_HOUSE) {
        g.freeze(this.powerups.remainingSeconds(PU.FREEZE));
      }
    }
  }

  _applyMagnet() {
    const r = this.pacman.magnetRadius;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (dc * dc + dr * dr > r * r) continue;
        const c = this.pacman.col + dc, row = this.pacman.row + dr;
        const cell = this.maze.cellAt(c, row);
        if (cell === C.DOT) {
          this.maze.grid[row][c] = C.EMPTY;
          this._addScore(10);
          this.powerups.onDotEaten();
        }
      }
    }
  }

  _applyPowerup(type) {
    Haptic.powerup();
    Sfx.powerup();
    if (type === PU.CHERRY) {
      this._addScore(100 + this.levelIdx * 200);
      return;
    }
    if (type === PU.EXTRA_LIFE) {
      this.lives++;
      this._fireHud();
      return;
    }
    if (type === PU.SUPER_PELLET) {
      // Fungerar som power pellet fast dubbel tid
      this.powerups.applyEffect(PU.SUPER_PELLET);
      const dur = this.powerups.remainingSeconds(PU.SUPER_PELLET);
      this.ghosts.forEach((g) => g.setFrightened(dur));
      this.ghostEatChain = 0;
      return;
    }
    this.powerups.applyEffect(type);
  }

  _checkGhostCollisions() {
    for (const g of this.ghosts) {
      if (g.state === GHOST_STATE.IN_HOUSE || g.state === GHOST_STATE.EATEN) continue;
      // Kollision om samma cell
      if (g.col === this.pacman.col && g.row === this.pacman.row) {
        const isFrightened = (g.state === GHOST_STATE.FRIGHTENED || g.state === GHOST_STATE.FROZEN);
        if (isFrightened) {
          g.onEaten();
          this.ghostEatChain++;
          const base = 200 * Math.pow(2, this.ghostEatChain - 1); // 200, 400, 800, 1600
          this._addScore(base);
          Haptic.eatGhost();
          Sfx.eatGhost();
        } else if (this.pacman.shielded) {
          // Sköld räddar men förbrukas inte — vara tills timer går ut
          // Spöket studsar ej, men spelaren tar ingen skada
        } else {
          this._die();
          return;
        }
      }
    }
  }

  _die() {
    this.lives--;
    Haptic.death();
    Sfx.frightenedStop();
    this._frightActive = false;
    Sfx.death();
    this._fireHud();
    this.state = STATE.DYING;
    this.dyingTimer = 1.2;
    this.pacman.die();
  }

  _afterDeath() {
    if (this.lives <= 0) {
      this._gameOver();
      return;
    }
    // Återställ pac + spöken
    this.pacman.reset();
    this.pacman.speedMult = DIFFICULTIES[this.difficulty].pacSpeed;
    this.ghosts.forEach((g) => g.reset());
    // Återaktivera antal spöken enl svårighet
    const active = DIFFICULTIES[this.difficulty].activeGhosts;
    this.ghosts.forEach((g, i) => {
      if (i >= active) { g.state = GHOST_STATE.IN_HOUSE; g.releaseTimer = 999999; }
      g.speedMult = DIFFICULTIES[this.difficulty].ghostSpeed;
    });
    this.state = STATE.PLAYING;
    this.startDelay = 1.0;
  }

  _winLevel() {
    Haptic.win();
    Sfx.frightenedStop();
    this._frightActive = false;
    Sfx.win();
    const nextIdx = this.levelIdx + 1;
    const totalMazes = MAZE_LIST[this.difficulty].length;
    if (nextIdx >= totalMazes) {
      this.state = STATE.COMPLETE;
      this._saveHighscore();
      if (this.onComplete) this.onComplete(this.score);
    } else {
      this.state = STATE.WIN;
      this._saveHighscore();
      if (this.onWin) this.onWin(this.score, nextIdx);
    }
  }

  async nextLevel() {
    this.levelIdx++;
    this.state = STATE.PLAYING;
    await this.loadLevel(this.levelIdx);
    this._fireHud();
  }

  _gameOver() {
    this.state = STATE.GAMEOVER;
    Sfx.frightenedStop();
    this._frightActive = false;
    this._saveHighscore();
    if (this.onGameOver) this.onGameOver(this.score);
  }

  _saveHighscore() {
    if (this.score > this.highscore) {
      this.highscore = this.score;
      localStorage.setItem("pacman_highscore", String(this.highscore));
      if (this.onHighscore) this.onHighscore(this.highscore);
    }
  }

  _addScore(points) {
    const mult = this.powerups && this.powerups.hasEffect(PU.DOUBLE_SCORE) ? 2 : 1;
    this.score += points * mult;

    // Extra liv vid 10k, 50k, 100k
    for (const milestone of [10000, 50000, 100000]) {
      if (this.score >= milestone && !this.awardedExtraLives.has(milestone)) {
        this.awardedExtraLives.add(milestone);
        this.lives++;
      }
    }
    this._fireHud();
  }

  _fireHud() {
    if (this.onScoreChange) this.onScoreChange(this.score);
    if (this.onLivesChange) this.onLivesChange(this.lives);
    if (this.onLevelChange) this.onLevelChange(this.levelIdx + 1);
  }

  togglePause() {
    if (this.state === STATE.PLAYING) {
      this.state = STATE.PAUSED;
      Haptic.pause();
      if (this._frightActive) Sfx.frightenedStop();
    } else if (this.state === STATE.PAUSED) {
      this.state = STATE.PLAYING;
      Haptic.pause();
      if (this._frightActive) Sfx.frightenedStart();
    }
  }

  // ========== Rendering ==========
  draw() {
    if (!this.maze) return;
    const ctx = this.ctx;
    const t = this.timeAcc;

    this.maze.draw(ctx, t);
    this.powerups.draw(ctx, t);

    // Radar — rita linjer mot spökens mål
    if (this.powerups.hasEffect(PU.RADAR)) {
      for (const g of this.ghosts) {
        if (g.state === GHOST_STATE.IN_HOUSE) continue;
        const target = g._targetTile();
        if (!target) continue;
        const p = g.pxCenter();
        ctx.strokeStyle = g.color;
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo((target.col + 0.5) * TILE, (target.row + 0.5) * TILE);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (const g of this.ghosts) g.draw(ctx, t);

    if (this.state !== STATE.DYING) {
      this.pacman.draw(ctx, t);
    } else {
      // Dödsanimation: Pac-Man krymper
      const prog = 1 - (this.dyingTimer / 1.2);
      const { x, y } = this.pacman.pxCenter();
      const r = TILE * 0.4 * (1 - prog);
      ctx.fillStyle = "#FFD56B";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, r), prog * Math.PI, (2 - prog) * Math.PI);
      ctx.lineTo(x, y);
      ctx.fill();
    }

    if (this.startDelay > 0) {
      ctx.fillStyle = "#FFD56B";
      ctx.font = "bold 20px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("READY!", (COLS * TILE) / 2, (ROWS * TILE) / 2 + TILE * 2);
    }
  }
}
