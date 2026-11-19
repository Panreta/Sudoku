# 🍬 Sudoku Sprinkles

A cute, colorful Sudoku game. It's plain HTML, CSS and JavaScript with no build step, so it runs on any static host.

## Features

- **Three levels:** 🐣 Easy (~40 clues), 🐱 Medium (~32), 🐲 Hard (~25–27)
- **Every puzzle is checked by a robot first.** A random full grid is built, cells are removed in symmetric pairs as long as only one solution remains, and then a backtracking solver plays the puzzle from scratch. The game hands it to you only if the solver's answer matches the intended solution and exactly one solution exists. The 🤖 chip shows how many guesses the solver needed.
- **Helpers:**
  - ✏️ **Notes** – pencil in your own candidates
  - 🪄 **Auto-notes** – fill every empty cell with the numbers that could legally go there
  - 🔦 **Where can a number go?** – tap a number to light up every cell it could still fit in
  - 👀 **Peek** – select an empty cell to see what could fit there
  - 💡 **Hint**, ↩️ **Undo**, 🧽 **Erase**
- Each digit has its own color, wrong entries wiggle, there's confetti when you win, and your progress is saved in the browser.
- Keyboard: `1`–`9` place, `N` notes, `Backspace` erase, `Z` undo, `H` hint, arrow keys move.

## Run locally

```sh
npm start          # serves the folder (or: python3 -m http.server)
npm test           # generator & solver tests (Node 20+)
```

ES modules don't load over `file://`, so open it through a local server.

## Deploy

`.github/workflows/pages.yml` runs the tests and publishes the site to GitHub Pages on every push to `main`. To turn it on, go to **Settings → Pages → Source** and pick **GitHub Actions**.

## Layout

| File | Purpose |
| --- | --- |
| `src/sudoku.js` | Engine: generator, backtracking solver, solution counter, candidates |
| `src/app.js` | UI state, rendering, input |
| `index.html`, `style.css` | Page and styles |
| `test/sudoku.test.js` | Checks that generated puzzles are solvable and unique |
