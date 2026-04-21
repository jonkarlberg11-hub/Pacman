# Pac-Man

Modern Pac-Man byggd i vanilla JavaScript + HTML Canvas. Inga dependencies, inget byggsteg. Funkar direkt i webbläsaren på både dator och mobil.

## Så spelar du

**Mobil** — svep med fingret i den riktning du vill att Pac-Man ska gå. Svepet kan ske var som helst på skärmen.

**Dator** — piltangenter eller WASD. Mellanslag / Esc för paus.

**Mål** — ät alla prickar utan att bli fångad av spökena. Klara 3 banor på din valda svårighet för att vinna.

## Svårighetsnivåer

| | Lätt | Medel | Svår |
|---|---|---|---|
| Spöken aktiva | 2 | 4 | 4 |
| Spökfart | 70% | 100% | 110% |
| Power pellet-tid | 10 s | 6 s | 3 s |
| Liv | 3 | 3 | 2 |

## Power-ups

Utöver klassiska power pellets (gula, större) dyker dessa upp slumpmässigt efter att du ätit ett antal prickar:

- **S — Sköld** (cyan): Odödlig i 5 sekunder
- **T — Turbo** (guld): 1,6× fart i 7 sekunder
- **M — Magnet** (röd): Drar in alla prickar inom 3 rutors radie i 6 sekunder
- **F — Frys** (ljusblå): Alla spöken fryser i 4 sekunder
- **P — Superpellet** (lila): Som power pellet men dubbel tid och dubbel poäng per spök
- **Z — Slow mo** (grön): Allt utom Pac-Man går i halvfart i 8 sekunder
- **×2 — Dubbla poäng** (guld): ×2 på allt i 10 sekunder
- **R — Radar** (cyan): Visar spökens planerade rutter i 5 sekunder
- **C — Körsbär** (röd): 100+ bonuspoäng, ingen effekt
- **♥ — Extra liv** (röd): Mycket sällsynt, +1 liv

Sannolikheten varierar med svårighet: lätt nivå ger fler defensiva hjälpmedel (sköld, frys), svår nivå belönar offensiv spelstil (dubbla poäng, magnet).

## Bygg egna banor

Banorna ligger i `mazes/`-mappen som enkla textfiler. Varje bana är exakt **19 tecken bred × 21 rader hög**. Öppna en fil i valfri texteditor för att rita din egen.

### Tecken

| Tecken | Betydelse |
|---|---|
| `#` | Vägg |
| `.` | Prick (ätbar) |
| `o` | Power pellet |
| `-` | Spökdörr (spöken kan passera, spelare kan inte) |
| `G` | Spökstart-cell |
| `P` | Pac-Man startposition |
| `T` | Tunnel (teleport) |
| ` ` (mellanslag) | Tomt, ingen prick |

### Regler

- Använd alltid `#` som ytterram (första/sista raden = bara hashtags, och första/sista kolumnen på varje rad = `#` eller `T`).
- Minst en `P` (Pac-Mans startcell).
- Minst en `G` (spökens start — fler G kan spridas ut i ett "spökhus").
- Minst 4 `o` (power pellets — klassiskt i hörnen).
- Tunnlar (`T`) ska finnas i par på samma rad, ett på vänster och ett på höger sida.
- Spelaren måste kunna nå alla prickar.

### Exempel

```
###################
#o...............o#
#.##.###.#.###.##.#
#.................#
#.##.#.#####.#.##.#
#....#...#...#....#
####.###.#.###.####
   #.#   G   #.#   
####.# #---# #.####
T....  #GGG#  ....T
####.# ##### #.####
   #.#       #.#   
####.###.#.###.####
#.................#
#.##.###.#.###.##.#
#.................#
#.##.#.#####.#.##.#
#....#...#...#....#
#.###.#######.###.#
#o.......P.......o#
###################
```

Ladda om sidan i webbläsaren efter att du sparat filen — banan är aktiv direkt.

## Lägg till nya banor

Bara ändra listan i `js/game.js`:

```js
const MAZE_LIST = {
  easy:   ["easy-01", "easy-02", "easy-03"],
  medium: ["medium-01", "medium-02", "medium-03"],
  hard:   ["hard-01",   "hard-02",   "hard-03"],
};
```

Lägg till dina nya filnamn i en av listorna. Banorna spelas i listans ordning.

## Kör lokalt

Öppna `index.html` direkt i en webbläsare. Vissa webbläsare blockerar `fetch()` mot lokala filer av säkerhetsskäl — i så fall, kör en lokal server:

```bash
# Python
python3 -m http.server 8000

# Node (om du har det)
npx serve .
```

Sen öppna `http://localhost:8000` i webbläsaren.

## Deploy till GitHub Pages

1. Skapa ett nytt repo på GitHub (publikt eller privat spelar ingen roll).
2. Pusha hela innehållet av denna mapp till repots root.
3. Gå till **Settings → Pages**.
4. Välj **Branch: main** och **Folder: / (root)**. Klicka **Save**.
5. Efter ~30 sekunder finns spelet på `https://<ditt-användarnamn>.github.io/<repo-namn>/`.

## Filstruktur

```
pacman/
├── index.html          Entry med canvas och menyer
├── css/styles.css      Dark premium-temat
├── js/
│   ├── main.js         Appstart, meny-UI
│   ├── game.js         Spel-loop och state
│   ├── maze.js         Bana-parser och rendering
│   ├── pacman.js       Spelarens rörelse
│   ├── ghost.js        Spök-AI (4 personligheter)
│   ├── powerup.js      Power-up spawn och effekter
│   ├── input.js        Svep + keyboard
│   └── audio.js        Haptic feedback + ljud-stubs
├── mazes/              9 textbanor
└── README.md           Den här filen
```

## Teknisk nivå

Rent vanilla JS via ES-moduler. Ingen bundler, ingen transpilering. Funkar i alla moderna webbläsare (Safari 14+, Chrome 90+, Firefox 85+). Total kodstorlek ~2 000 rader, 0 KB extern kod.
