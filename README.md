# Kanji Quest

A self-contained, mobile-friendly JLPT kanji review app. No backend, no
account — progress lives in your browser via `localStorage`.

## Run locally

The app is a static site, so any static file server will do:

```bash
cd app
python3 -m http.server 8000
# then open http://localhost:8000
```

It also works opened directly via `file://`, but module + fetch behaviour
is more reliable through a real server.

## Deploy to GitHub Pages

1. In the repo's GitHub settings → Pages, set the source to "Deploy from a branch".
2. Pick a branch and folder (e.g. `master` / `/app`).
3. Wait for the build to finish; the URL will be shown on the Pages settings screen.

The app uses only relative paths, so it works fine from a sub-path.

## How it works

- **SRS:** SM-2 with FSRS-inspired tweaks. Two short learning steps (1 min,
  10 min) so even a 10-minute session feels productive. Lapsed cards route
  through a re-learning step rather than dropping straight back to graduated.
- **Mastery tiers:** apprentice → guru → master → enlightened → burned.
  Derived from the current review interval.
- **Gamification:** XP per correct grade, combo bonus for streaks within a
  session, occasional "DOUBLE XP" crit cards (~10%), a daily streak counter,
  level-up curve, confetti and toasts on milestones.
- **Data:** JLPT N5–N1 kanji bundled in `data/jlpt-kanji.json`, derived
  from [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data)
  (KANJIDIC). Counts: N5 79, N4 166, N3 367, N2 367, N1 1232 — 2,211 total.

## Regenerate the kanji dataset

```bash
node app/scripts/build-data.mjs
```

Requires Node 18+ (for global `fetch`).

## File layout

```
app/
  index.html         # shell + top bar
  styles.css         # all styling
  js/
    app.js           # router, views, FX
    srs.js           # scheduling algorithm
    gamification.js  # XP, streak, combo, levels
    storage.js       # localStorage wrapper
  data/
    jlpt-kanji.json  # bundled kanji data
  scripts/
    build-data.mjs   # regenerates the dataset from upstream
```
