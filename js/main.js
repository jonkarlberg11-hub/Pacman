// main.js — entry point, menyer, UI-bindning

import { Game, STATE } from "./game.js";
import { LABELS, COLORS } from "./powerup.js";

const $ = (sel) => document.querySelector(sel);

const canvas = $("#game");
const game = new Game(canvas);

// ========== HUD-updaters ==========
game.onScoreChange = (s) => { $("#score").textContent = s.toLocaleString("sv-SE"); };
game.onLevelChange = (lv) => { $("#level").textContent = lv; };
game.onLivesChange = (n) => {
  const dots = $("#lives-dots");
  dots.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const d = document.createElement("span");
    d.className = "life-dot";
    dots.appendChild(d);
  }
};
game.onHighscore = (hs) => { $("#highscore").textContent = hs.toLocaleString("sv-SE"); };
$("#highscore").textContent = game.highscore.toLocaleString("sv-SE");

// Power-up chips
game.onPowerupsChange = (list) => {
  const bar = $("#powerup-bar");
  bar.innerHTML = "";
  for (const { type, remaining } of list) {
    const chip = document.createElement("span");
    chip.className = "powerup-chip";
    const dot = document.createElement("span");
    dot.className = "chip-icon";
    dot.style.background = COLORS[type];
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(LABELS[type]));
    const tm = document.createElement("span");
    tm.className = "chip-time";
    tm.textContent = `${Math.ceil(remaining)}s`;
    chip.appendChild(tm);
    bar.appendChild(chip);
  }
};

// ========== Overlays ==========
const overlays = {
  start:    $("#start-menu"),
  pause:    $("#pause-menu"),
  gameover: $("#gameover-menu"),
  win:      $("#win-menu"),
  complete: $("#complete-menu"),
};
function showOverlay(key) {
  for (const k in overlays) {
    overlays[k].classList.toggle("active", k === key);
  }
}
function hideOverlays() {
  for (const k in overlays) overlays[k].classList.remove("active");
}

// ========== Startmeny ==========
let selectedDiff = "medium";
document.querySelectorAll(".difficulty-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".difficulty-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedDiff = btn.dataset.diff;
  });
});

$("#start-btn").addEventListener("click", async () => {
  hideOverlays();
  await game.start(selectedDiff);
  tryEnterFullscreen();
});

// ========== Pausmeny ==========
$("#pause-btn").addEventListener("click", () => {
  game.togglePause();
  if (game.state === STATE.PAUSED) showOverlay("pause");
});
$("#resume-btn").addEventListener("click", () => {
  if (game.state === STATE.PAUSED) {
    game.togglePause();
    hideOverlays();
  }
});
$("#restart-btn").addEventListener("click", async () => {
  hideOverlays();
  await game.start(game.difficulty);
});
$("#quit-btn").addEventListener("click", () => {
  game.state = STATE.MENU;
  showOverlay("start");
});

// ========== Game Over ==========
game.onGameOver = (final) => {
  $("#final-score").textContent = final.toLocaleString("sv-SE");
  showOverlay("gameover");
};
$("#retry-btn").addEventListener("click", async () => {
  hideOverlays();
  await game.start(game.difficulty);
});
$("#menu-btn").addEventListener("click", () => {
  game.state = STATE.MENU;
  showOverlay("start");
});

// ========== Win (bana klar) ==========
game.onWin = (final, nextIdx) => {
  $("#win-score").textContent = final.toLocaleString("sv-SE");
  $("#win-title").textContent = `Bana ${game.levelIdx + 1} klar!`;
  showOverlay("win");
};
$("#next-btn").addEventListener("click", async () => {
  hideOverlays();
  await game.nextLevel();
});
$("#win-menu-btn").addEventListener("click", () => {
  game.state = STATE.MENU;
  showOverlay("start");
});

// ========== Allt klart ==========
game.onComplete = (final) => {
  $("#complete-score").textContent = final.toLocaleString("sv-SE");
  showOverlay("complete");
};
$("#complete-menu-btn").addEventListener("click", () => {
  game.state = STATE.MENU;
  showOverlay("start");
});

// ========== Fullscreen vid behov (liggande läge) ==========
function tryEnterFullscreen() {
  if (document.fullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (req) req.call(el).catch(() => {});
}

// ========== Resize ==========
window.addEventListener("orientationchange", () => setTimeout(() => game.resize(), 150));

// Visa startmenyn vid laddning
showOverlay("start");
