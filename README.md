# 🎵 Cadent

**Your one-stop shop for music practice.**

Cadent is a collection of browser-based tools for practicing musicians — a metronome, a backing-track builder, a tuner, a fretboard trainer, and a practice planner that ties them all together into guided sessions. It's a plain static site: no build step, no framework, no account. Open it and play.

---

## The Tools

| Tool | What it does |
|------|--------------|
| 🥁 **Metronome** | Adjustable tempo (40–200 BPM), any time signature, subdivisions (quarters, eighths, sixteenths, triplets) with a swing toggle, four click sounds, and per-beat visual dots. The tempo ramp can speed you up automatically — *"start at 90, add 5 BPM every 4 bars until 120"*. |
| 🎸 **Chords** | Build a chord progression (triads, sevenths, sus/add chords with inversions and octave control) and loop it as a backing track with a count-in. Pick from real sampled instruments — piano, e-piano, organ, guitar, strings, pads — or offline synth sounds. Includes one-tap common progressions (ii–V–I, 12-bar blues, …) and a step-sequencer drum machine. |
| 🎤 **Tuner** | Microphone-based chromatic tuner with a needle gauge, cents offset, and plain-language guidance ("Flat — tune up ↑"). |
| 🎼 **Fretboard** | A note-recognition game: it names a note, you find it on your instrument, the mic confirms you nailed it. Choose 5/10/15 notes or go endless, and pick Easy (any octave counts) or Advanced (E3 means E3) mode — against the clock. |
| 📋 **Planner** | Build a practice plan from scratch, or load a ready-made session by instrument (guitar, piano, bass, drums, voice — three skill levels each) or by goal (*"just play"*, *"warm up"*, *"improve my timing"*, *"I just have 10 minutes"*). Instruments and goals combine. |
| 📚 **Resources** | Tutorials, tips, and learning materials. |

### The session runner

Start a practice session from the Planner and a progress bar follows you across **every page** of the site — timer, current item, segmented progress, skip and end controls. Each practice item can link to the right tool for the job, and with **Auto-open tool** enabled, Cadent navigates there for you the moment that part of your session begins.

---

## 🚀 Getting Started

No installation, no build. Serve the folder with any static file server:

```bash
# Python
python -m http.server 8000

# Node
npx serve
```

…or just use the **Live Server** extension in VS Code. Then open `http://localhost:8000`.

> **Why not double-click `index.html`?** The microphone tools (Tuner, Fretboard) require a *secure context* — `localhost` or HTTPS — and the shared header/navbar components are fetched at runtime, which most browsers block on `file://` URLs.

**Internet note:** the sampled instruments on the Chords page stream from a CDN on first use (then cache). Everything else — including the synth sounds — works offline once loaded.

---

## 🗂 Project Structure

```
Cadent/
├── index.html              Home page
├── pages/                  One page per tool
│   ├── metronome.html
│   ├── chords.html
│   ├── tuner.html
│   ├── fretboard.html
│   ├── tracker.html        (the Planner)
│   └── resources.html
├── scripts/
│   ├── metronome.js        Click scheduling, subdivisions, tempo ramp
│   ├── chords.js           Progression builder, sampler, drum machine
│   ├── tuner.js            Autocorrelation pitch detection
│   ├── fretboard.js        Note drill + mic matching
│   ├── tracker.js          Plan building & session templates
│   ├── session.js          Cross-page session runner (loaded everywhere)
│   ├── help.js             First-visit tutorial modals
│   └── app.js              Home page niceties
├── components/
│   ├── header/             Injected header + session bar
│   └── navbar/             Injected nav (hamburger menu on mobile)
├── styles/style.css        Single stylesheet, mobile-first media queries
└── images/
```

---

## ⚙️ How It Works

- **Vanilla HTML/CSS/JS** — zero dependencies, zero build tooling. The one external library, [smplr](https://github.com/danigb/smplr) (sampled instruments), is lazy-loaded from a CDN only when a sampled sound is selected.
- **Web Audio API** everywhere — look-ahead scheduling keeps the metronome and backing tracks sample-accurate; the tuner and fretboard trainer run normalized autocorrelation over live mic input.
- **localStorage persistence** — your progressions, drum patterns, practice plans, running session, tempo, and preferences survive reloads. Sessions even survive navigating between pages mid-practice.
- **Shared components** — the header (with the session bar) and navbar are injected on every page by small loader scripts, so there's exactly one copy of each.

## 📱 Mobile

The whole site adapts to phones and tablets: a hamburger nav with the current page name, icon-only transport buttons (▶ ❚❚ ↺), advanced options tucked behind toggles, a horizontally scrollable drum grid, and first-visit tutorials per page (tap **?** to reread one).

## 🌐 Browser Support

Any modern browser (Chrome, Edge, Firefox, Safari). Needs Web Audio, and microphone permission for the Tuner and Fretboard tools.

---

© 2026 Cadent. All rights reserved.
