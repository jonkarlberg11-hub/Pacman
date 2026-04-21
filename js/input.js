// input.js — svep-detektion + tangentbord. Publikt API: currentDirection.

export const DIR = {
  NONE:  { dx: 0,  dy: 0 },
  UP:    { dx: 0,  dy: -1 },
  DOWN:  { dx: 0,  dy: 1 },
  LEFT:  { dx: -1, dy: 0 },
  RIGHT: { dx: 1,  dy: 0 },
};

const SWIPE_THRESHOLD = 24; // px innan det räknas som svep

export class InputHandler {
  constructor(canvas) {
    this.requested = DIR.NONE;  // spelaren vill gå hit
    this.paused = false;
    this.onPauseToggle = null;

    // Keyboard
    window.addEventListener("keydown", (e) => this._onKeyDown(e));

    // Touch — lyssna på hela fönstret, inte bara canvas, så svep fungerar runtom också
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchActive = false;
    const target = document.getElementById("app") || document.body;
    target.addEventListener("touchstart", (e) => this._onTouchStart(e), { passive: false });
    target.addEventListener("touchmove", (e) => this._onTouchMove(e), { passive: false });
    target.addEventListener("touchend", (e) => this._onTouchEnd(e), { passive: false });
  }

  _onKeyDown(e) {
    switch (e.key) {
      case "ArrowUp":    case "w": case "W": this.requested = DIR.UP;    e.preventDefault(); break;
      case "ArrowDown":  case "s": case "S": this.requested = DIR.DOWN;  e.preventDefault(); break;
      case "ArrowLeft":  case "a": case "A": this.requested = DIR.LEFT;  e.preventDefault(); break;
      case "ArrowRight": case "d": case "D": this.requested = DIR.RIGHT; e.preventDefault(); break;
      case " ":          case "Escape":
        if (this.onPauseToggle) this.onPauseToggle();
        e.preventDefault();
        break;
    }
  }

  _onTouchStart(e) {
    // Bara block om touch är på själva spelytan, inte på knappar/menyer
    const target = e.target;
    if (target.closest("button") || target.closest(".overlay")) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this._touchStartX = t.clientX;
    this._touchStartY = t.clientY;
    this._touchActive = true;
  }

  _onTouchMove(e) {
    if (!this._touchActive) return;
    // Förhindra scroll
    if (e.cancelable) e.preventDefault();

    const t = e.touches[0];
    const dx = t.clientX - this._touchStartX;
    const dy = t.clientY - this._touchStartY;
    const adx = Math.abs(dx), ady = Math.abs(dy);

    if (adx < SWIPE_THRESHOLD && ady < SWIPE_THRESHOLD) return;

    if (adx > ady) {
      this.requested = dx > 0 ? DIR.RIGHT : DIR.LEFT;
    } else {
      this.requested = dy > 0 ? DIR.DOWN : DIR.UP;
    }

    // Återställ för att tillåta en ny svep-gest utan att lyfta fingret
    this._touchStartX = t.clientX;
    this._touchStartY = t.clientY;
  }

  _onTouchEnd() { this._touchActive = false; }

  consumeRequested() {
    // Anropas av game-loopen; vi returnerar det senast önskade men nollställer inte — spelaren håller
    // kvar riktningen tills nästa input kommer.
    return this.requested;
  }

  clear() { this.requested = DIR.NONE; }
}

export function dirEqual(a, b) { return a.dx === b.dx && a.dy === b.dy; }
export function dirOpposite(a, b) { return a.dx === -b.dx && a.dy === -b.dy && (a.dx !== 0 || a.dy !== 0); }
