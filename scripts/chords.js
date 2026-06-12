// ── Music theory ──────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ   = 440;
const A4_INDEX  = 57;   // A4 in our semitone index system (C0 = 0)
const ROOT_BASE = 36;   // C3 — chord tones voiced from here, bass one octave below

const CHORD_TYPES = {
    // Triads
    'maj':   { suffix: '',        intervals: [0, 4, 7] },
    'min':   { suffix: 'm',       intervals: [0, 3, 7] },
    'dim':   { suffix: '°',       intervals: [0, 3, 6] },
    'aug':   { suffix: '+',       intervals: [0, 4, 8] },
    // Sevenths
    '7':     { suffix: '7',       intervals: [0, 4, 7, 10] },
    'maj7':  { suffix: 'maj7',    intervals: [0, 4, 7, 11] },
    'min7':  { suffix: 'm7',      intervals: [0, 3, 7, 10] },
    'm7b5':  { suffix: 'ø7',      intervals: [0, 3, 6, 10] },
    // Sus / Add
    'sus2':  { suffix: 'sus2',    intervals: [0, 2, 7] },
    'sus4':  { suffix: 'sus4',    intervals: [0, 5, 7] },
    'add9':  { suffix: 'add9',    intervals: [0, 4, 7, 14] },
    'add11': { suffix: 'add11',   intervals: [0, 4, 7, 17] },
    'madd9': { suffix: 'm(add9)', intervals: [0, 3, 7, 14] },
};

// attack / decay / sustain-fraction / release — seconds
const SOUND_PRESETS = {
    'keys':  { wave: 'triangle', attack: 0.005, decay: 0.35, sustain: 0.45, release: 0.5 },
    'pad':   { wave: 'sine',     attack: 0.30,  decay: 0.25, sustain: 0.80, release: 1.0 },
    'organ': { wave: 'triangle', attack: 0.008, decay: 0.04, sustain: 0.95, release: 0.25 },
};

// ── Sampled instruments (smplr) ───────────────────────────────────────────────
// Dropdown values prefixed "sf:" are General MIDI soundfont instruments played
// through the smplr sampler (loaded on demand from CDN, samples streamed).
// The synth presets above remain as offline fallbacks.

const SMPLR_URL = 'https://unpkg.com/smplr@0.26.0/dist/index.mjs';

let smplrModule = null;      // cached import() promise
const sfLoading = new Map(); // soundfont name -> load promise
const sfLoaded  = new Map(); // soundfont name -> ready instrument

function isSoundfont(value) { return value.startsWith('sf:'); }
function soundfontName(value) { return value.slice(3); }

function loadSmplr() {
    if (!smplrModule) {
        smplrModule = import(SMPLR_URL).catch(err => {
            smplrModule = null;   // allow retry on next attempt
            throw err;
        });
    }
    return smplrModule;
}

function loadSoundfont(name) {
    if (sfLoading.has(name)) return sfLoading.get(name);
    ensureAudio();
    const promise = loadSmplr()
        .then(({ Soundfont }) => {
            const inst = new Soundfont(audioCtx, { instrument: name, destination: masterGain });
            return Promise.resolve(inst.ready ?? inst.load).then(() => {
                sfLoaded.set(name, inst);
                return inst;
            });
        })
        .catch(err => {
            sfLoading.delete(name);   // allow retry on next attempt
            throw err;
        });
    sfLoading.set(name, promise);
    return promise;
}

// ── Drum machine ──────────────────────────────────────────────────────────────

const DRUM_ROWS = [
    { key: 'kick',  label: 'Kick'   },
    { key: 'snare', label: 'Snare'  },
    { key: 'hihat', label: 'Hi-Hat' },
];

// 4-beat tiles that tile to any step count
const DRUM_PRESET_TILES = {
    rock:  {
        kick:  [1,0,1,0],  // beats 1 & 3
        snare: [0,1,0,1],  // beats 2 & 4
        hihat: [1,1,1,1],  // every beat
    },
    funk:  {
        kick:  [1,0,0,1],  // 1 & 4 (syncopated)
        snare: [0,0,1,0],  // beat 3
        hihat: [1,1,0,1],  // 1, 2, 4
    },
    house: {
        kick:  [1,1,1,1],  // 4-on-floor
        snare: [0,0,1,0],  // beat 3
        hihat: [0,1,0,1],  // off-beats 2 & 4
    },
};

// ── State ─────────────────────────────────────────────────────────────────────

const PROG_KEY = 'cadentChordProgression';
const DRUM_KEY = 'cadentDrumPattern';

let progression    = [];
let bpm            = 120;
let selectedSet    = new Set();

let activeDrumSteps = 16;   // locked in at play-start from beats-per-line

function getDrumSteps() {
    return Math.max(4, Math.min(64, parseInt(document.getElementById('beats-per-line').value) || 16));
}

let drumPattern = {
    kick:  new Array(16).fill(false),
    snare: new Array(16).fill(false),
    hihat: new Array(16).fill(false),
};

function resizeDrumPattern(newSteps) {
    DRUM_ROWS.forEach(({ key }) => {
        const old = drumPattern[key];
        if (newSteps > old.length) {
            drumPattern[key] = [...old, ...new Array(newSteps - old.length).fill(false)];
        } else {
            drumPattern[key] = old.slice(0, newSteps);
        }
    });
}

// Playback — context and masterGain persist across sessions (sampled instruments
// are bound to them and their samples are decoded once); sessionGain/drumGain are
// recreated each playback so disconnecting them silences scheduled synth audio.
let audioCtx    = null;
let masterGain  = null;
let sessionGain = null;
let drumGain    = null;
let isPlaying   = false;   // true once the count-in finishes and the loop runs
let playbackArmed = false; // true from Play press until Stop — covers the count-in too
let schedulerId = null;

function ensureAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.85;
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

let nextChordTime = 0;
let playIndex     = 0;
let nextDrumTime  = 0;
let drumStep      = 0;

// Increment every time we stop/start to cancel stale async callbacks
let sessionId = 0;

// ── Pitch helpers ─────────────────────────────────────────────────────────────

function noteFreq(index) {
    return A4_FREQ * Math.pow(2, (index - A4_INDEX) / 12);
}

function chordLabel(root, type) {
    return root + CHORD_TYPES[type].suffix;
}

// Chord tones from ROOT_BASE, shifted by `octave` (±1). `inversion` moves the
// lowest n tones up an octave; the bass doubles whatever tone ends up lowest,
// one octave down. Our semitone index has C0 = 0, so MIDI = index + 12.
function getVoicing(root, type, octave = 0, inversion = 0) {
    const rootIdx   = ROOT_BASE + octave * 12 + NOTE_NAMES.indexOf(root);
    const intervals = CHORD_TYPES[type].intervals;
    const inv       = Math.min(inversion, intervals.length - 1);
    const ivs       = intervals.map((iv, i) => (i < inv ? iv + 12 : iv));
    const lowest    = Math.min(...ivs);
    const indices   = [rootIdx + lowest - 12, ...ivs.map(iv => rootIdx + iv)];
    return indices.map((idx, i) => ({
        freq:   noteFreq(idx),
        midi:   idx + 12,
        isBass: i === 0,
    }));
}

// ── Chord audio ───────────────────────────────────────────────────────────────

function scheduleNote(freq, isBass, t0, chordDuration, preset) {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(sessionGain);

    osc.type          = preset.wave;
    osc.frequency.value = freq;

    const peak    = isBass ? 0.20 : 0.14;
    const attack  = Math.min(preset.attack,  chordDuration * 0.20);
    const decay   = Math.min(preset.decay,   (chordDuration - attack) * 0.50);
    const release = Math.min(preset.release, chordDuration * 0.45);

    const t1 = t0 + attack;
    const t2 = t1 + decay;
    const t3 = t0 + chordDuration;
    const t4 = t3 + release;
    const sl = peak * preset.sustain;

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t1);
    gain.gain.linearRampToValueAtTime(sl,   t2);
    gain.gain.setValueAtTime(sl, t3);
    gain.gain.linearRampToValueAtTime(0,    t4);

    osc.start(t0);
    osc.stop(t4 + 0.05);
}

function scheduleChord(chord, startTime) {
    const sound    = document.getElementById('sound-type').value;
    const duration = chord.beats * (60 / bpm);
    const voices   = getVoicing(chord.root, chord.type, chord.octave || 0, chord.inversion || 0);

    if (isSoundfont(sound)) {
        const inst = sfLoaded.get(soundfontName(sound));
        if (inst) {
            voices.forEach(({ midi, isBass }) =>
                inst.start({
                    note:     midi,
                    velocity: isBass ? 100 : 85,
                    time:     startTime,
                    duration: duration,
                })
            );
            return duration;
        }
        // Not loaded yet (e.g. switched mid-playback) — kick off the load and
        // fall through to the synth so the loop keeps sounding meanwhile.
        loadSoundfont(soundfontName(sound)).catch(() => {});
    }

    const preset = SOUND_PRESETS[sound] || SOUND_PRESETS.keys;
    voices.forEach(({ freq, isBass }) =>
        scheduleNote(freq, isBass, startTime, duration, preset)
    );
    return duration;
}

// ── Drum synthesis ────────────────────────────────────────────────────────────

// Noise buffers are generated once per duration and reused — like a sampled
// drum hit, replaying the same noise is inaudible but avoids regenerating
// thousands of samples on every beat.
const noiseBufs = new Map();   // seconds -> AudioBuffer

function getNoiseBuf(seconds) {
    let buf = noiseBufs.get(seconds);
    if (!buf) {
        const len  = Math.ceil(audioCtx.sampleRate * seconds);
        buf  = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        noiseBufs.set(seconds, buf);
    }
    return buf;
}

function synthKick(t) {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(drumGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.35);
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.start(t);
    osc.stop(t + 0.42);

    // Short noise click for attack transient
    const src  = audioCtx.createBufferSource();
    src.buffer = getNoiseBuf(0.005);
    const g    = audioCtx.createGain();
    src.connect(g);
    g.connect(drumGain);
    g.gain.setValueAtTime(0.35, t);
    src.start(t);
}

function synthSnare(t) {
    // Noise body through a bandpass filter
    const src    = audioCtx.createBufferSource();
    src.buffer   = getNoiseBuf(0.2);
    const filter = audioCtx.createBiquadFilter();
    filter.type  = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value         = 0.7;
    const gain   = audioCtx.createGain();
    src.connect(filter);
    filter.connect(gain);
    gain.connect(drumGain);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.start(t);
    src.stop(t + 0.2);

    // Tonal snap
    const osc   = audioCtx.createOscillator();
    const oscG  = audioCtx.createGain();
    osc.connect(oscG);
    oscG.connect(drumGain);
    osc.type          = 'triangle';
    osc.frequency.value = 200;
    oscG.gain.setValueAtTime(0.5, t);
    oscG.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.start(t);
    osc.stop(t + 0.1);
}

function synthHihat(t) {
    const src    = audioCtx.createBufferSource();
    src.buffer   = getNoiseBuf(0.12);
    // Highpass at 5kHz keeps the crisp hi-hat "tick" while staying audible
    const filter = audioCtx.createBiquadFilter();
    filter.type  = 'highpass';
    filter.frequency.value = 5000;
    filter.Q.value = 0.5;
    const gain   = audioCtx.createGain();
    src.connect(filter);
    filter.connect(gain);
    gain.connect(drumGain);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.start(t);
    src.stop(t + 0.12);
}

function scheduleCountdownClick(t, accent) {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(sessionGain);
    osc.type          = 'square';
    osc.frequency.value = accent ? 1200 : 800;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.start(t);
    osc.stop(t + 0.06);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

const LOOKAHEAD   = 0.3;   // seconds ahead to schedule
const SCHED_MS    = 100;   // scheduler fire interval

function scheduleDrums() {
    const stepDur = 60 / bpm; // one beat (quarter note) per step
    while (nextDrumTime < audioCtx.currentTime + LOOKAHEAD) {
        const step = drumStep % activeDrumSteps;
        if (drumPattern.kick [step]) synthKick  (nextDrumTime);
        if (drumPattern.snare[step]) synthSnare (nextDrumTime);
        if (drumPattern.hihat[step]) synthHihat (nextDrumTime);

        const delayMs = Math.max(0, (nextDrumTime - audioCtx.currentTime) * 1000);
        const s = step, sid = sessionId;
        setTimeout(() => {
            if (sessionId !== sid) return;
            highlightDrumStep(s);
        }, delayMs);

        nextDrumTime += stepDur;
        drumStep++;
    }
}

function runScheduler() {
    // The progression can be emptied between scheduler ticks — bail out cleanly
    if (progression.length === 0) {
        stop();
        return;
    }

    // Chord scheduler
    while (nextChordTime < audioCtx.currentTime + LOOKAHEAD) {
        const chord    = progression[playIndex];
        const duration = scheduleChord(chord, nextChordTime);

        const delayMs = Math.max(0, (nextChordTime - audioCtx.currentTime) * 1000);
        const idx = playIndex, sid = sessionId;
        setTimeout(() => {
            if (sessionId !== sid) return;
            highlightChord(idx);
        }, delayMs);

        nextChordTime += duration;
        playIndex = (playIndex + 1) % progression.length;
    }

    // Drum scheduler
    scheduleDrums();

    schedulerId = setTimeout(runScheduler, SCHED_MS);
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function startCountdown() {
    const overlay = document.getElementById('countdown-overlay');
    const display = document.getElementById('countdown-number');
    const BEATS   = 4;
    const spb     = 60 / bpm;
    const sid     = sessionId;

    overlay.classList.add('active');

    // Schedule all four clicks and visual pulses up front
    const baseTime = audioCtx.currentTime + 0.05;
    for (let i = 0; i < BEATS; i++) {
        const clickTime = baseTime + i * spb;
        scheduleCountdownClick(clickTime, i === 0);

        const num     = BEATS - i;
        const delayMs = i * spb * 1000;
        setTimeout(() => {
            if (sessionId !== sid) return;
            display.textContent = num;
            display.classList.remove('pulse');
            void display.offsetWidth;
            display.classList.add('pulse');
        }, delayMs);
    }

    // When the countdown bar is done, hide overlay and start playback
    const playbackStart = baseTime + BEATS * spb;
    setTimeout(() => {
        if (sessionId !== sid) return;
        overlay.classList.remove('active');
        isPlaying     = true;
        playIndex     = 0;
        drumStep      = 0;
        nextChordTime = playbackStart;
        nextDrumTime  = playbackStart;
        runScheduler();
    }, BEATS * spb * 1000);
}

// ── Play / Stop ───────────────────────────────────────────────────────────────

async function play() {
    if (progression.length === 0) {
        alert('Add at least one chord before playing.');
        return;
    }

    sessionId++;     // invalidates any in-flight countdown/highlight callbacks

    ensureAudio();

    const playBtn = document.getElementById('play-btn');
    playBtn.disabled = true;

    // Sampled instrument selected and not yet loaded — fetch before counting in
    const sound = document.getElementById('sound-type').value;
    if (isSoundfont(sound) && !sfLoaded.has(soundfontName(sound))) {
        const sid = sessionId;
        playBtn.textContent = 'Loading…';
        playBtn.dataset.icon = '…';
        try {
            await loadSoundfont(soundfontName(sound));
        } catch {
            playBtn.textContent = '▶ Play';
            playBtn.dataset.icon = '▶';
            playBtn.disabled = false;
            alert('Couldn\'t load that instrument (check your connection). The Synth sounds work offline.');
            return;
        }
        playBtn.textContent = '▶ Play';
        playBtn.dataset.icon = '▶';
        if (sessionId !== sid) return;   // stopped while loading
    }

    sessionGain = audioCtx.createGain();
    sessionGain.gain.value = 0.85;
    sessionGain.connect(audioCtx.destination);

    drumGain = audioCtx.createGain();
    drumGain.gain.value = parseFloat(document.getElementById('drum-volume').value) / 100;
    drumGain.connect(audioCtx.destination);

    activeDrumSteps = getDrumSteps();   // lock step count for this playback session
    playbackArmed = true;

    document.getElementById('stop-btn').disabled = false;

    startCountdown();
}

function stop() {
    sessionId++;     // cancel pending countdown + highlight callbacks

    isPlaying = false;
    playbackArmed = false;
    clearTimeout(schedulerId);
    schedulerId = null;

    // Disconnecting the per-session gains silences everything already scheduled
    // (synth voices, count-in clicks, drums) without closing the context.
    if (sessionGain) { sessionGain.disconnect(); sessionGain = null; }
    if (drumGain)    { drumGain.disconnect();    drumGain    = null; }
    sfLoaded.forEach(inst => inst.stop());

    playIndex = 0;
    drumStep  = 0;
    document.getElementById('countdown-overlay').classList.remove('active');
    highlightChord(-1);
    highlightDrumStep(-1);

    document.getElementById('play-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
}

// ── Progression management ────────────────────────────────────────────────────

function saveProgression() { localStorage.setItem(PROG_KEY, JSON.stringify(progression)); }
function loadProgression()  {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || []; }
    catch { return []; }
}
function saveDrumPattern()  { localStorage.setItem(DRUM_KEY, JSON.stringify(drumPattern)); }
function loadDrumPattern()  {
    try { return JSON.parse(localStorage.getItem(DRUM_KEY)) || null; }
    catch { return null; }
}

function addChord() {
    const root      = document.getElementById('chord-root').value;
    const type      = document.getElementById('chord-type').value;
    const beats     = parseInt(document.getElementById('chord-beats').value);
    const octave    = parseInt(document.getElementById('chord-octave').value) || 0;
    // Triads cap at 2nd inversion — only four-note chords have a 3rd
    const inversion = Math.min(
        parseInt(document.getElementById('chord-inversion').value) || 0,
        CHORD_TYPES[type].intervals.length - 1
    );
    progression.push({ root, type, beats, octave, inversion });
    saveProgression();
    renderProgression();
}

// ── Common progressions ───────────────────────────────────────────────────────
// Scale degrees as semitone offsets from the selected key's root

const COMMON_PROGRESSIONS = {
    'axis':       { label: 'I–V–vi–IV (Pop Anthem)',    chords: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']] },
    'doowop':     { label: 'I–vi–IV–V (50s Doo-Wop)',   chords: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']] },
    'threechord': { label: 'I–IV–V (Three-Chord Rock)', chords: [[0, 'maj'], [5, 'maj'], [7, 'maj']] },
    'ballad':     { label: 'vi–IV–I–V (Pop Ballad)',    chords: [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']] },
    'jazz251':    { label: 'ii–V–I (Jazz Turnaround)',  chords: [[2, 'min7'], [7, '7'], [0, 'maj7']] },
    'circle':     { label: 'I–vi–ii–V (Circle)',        chords: [[0, 'maj'], [9, 'min'], [2, 'min'], [7, '7']] },
    'andalusian': { label: 'i–♭VII–♭VI–V (Andalusian)', chords: [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'maj']] },
    'blues':      { label: '12-Bar Blues (I7–IV7–V7)',
                    chords: [[0, '7'], [0, '7'], [0, '7'], [0, '7'],
                             [5, '7'], [5, '7'], [0, '7'], [0, '7'],
                             [7, '7'], [5, '7'], [0, '7'], [7, '7']] },
};

function addProgression() {
    const keyIdx = NOTE_NAMES.indexOf(document.getElementById('prog-key').value);
    const prog   = COMMON_PROGRESSIONS[document.getElementById('prog-name').value];
    if (!prog || keyIdx < 0) return;

    prog.chords.forEach(([degree, type]) => {
        progression.push({
            root:      NOTE_NAMES[(keyIdx + degree) % 12],
            type:      type,
            beats:     4,
            octave:    0,
            inversion: 0,
        });
    });
    saveProgression();
    renderProgression();
}

function shiftOctave(index, delta) {
    const chord = progression[index];
    chord.octave = Math.max(-1, Math.min(1, (chord.octave || 0) + delta));
    saveProgression();
    renderProgression();
}

function removeChord(index) {
    if (playbackArmed) stop();   // also covers the count-in, before isPlaying is set
    progression.splice(index, 1);
    selectedSet.delete(index);
    // Remap selected indices that shifted down
    const rebuilt = new Set();
    selectedSet.forEach(i => { if (i > index) rebuilt.add(i - 1); else if (i < index) rebuilt.add(i); });
    selectedSet = rebuilt;
    saveProgression();
    renderProgression();
    updateSelectionUI();
}

function duplicateChord(index) {
    progression.splice(index + 1, 0, { ...progression[index] });
    // Selected indices after the insertion point shift up by one
    const rebuilt = new Set();
    selectedSet.forEach(i => rebuilt.add(i > index ? i + 1 : i));
    selectedSet = rebuilt;
    saveProgression();
    renderProgression();
}

function duplicateSelected() {
    const indices = [...selectedSet].sort((a, b) => a - b);
    indices.forEach(i => progression.push({ ...progression[i] }));
    selectedSet.clear();
    saveProgression();
    renderProgression();
    updateSelectionUI();
}

function toggleSelect(index) {
    if (selectedSet.has(index)) selectedSet.delete(index);
    else selectedSet.add(index);
    updateSelectionUI();
    renderProgression();
}

function clearSelection() {
    selectedSet.clear();
    updateSelectionUI();
    renderProgression();
}

function clearAll() {
    if (!confirm('Clear the whole progression?')) return;
    if (playbackArmed) stop();
    progression = [];
    selectedSet.clear();
    saveProgression();
    renderProgression();
    updateSelectionUI();
}

// ── Drum UI ───────────────────────────────────────────────────────────────────

function renderDrumGrid() {
    const steps = getDrumSteps();
    const grid  = document.getElementById('drum-grid');
    grid.innerHTML = '';
    // minmax keeps each step tappable on phones — the wrapper scrolls sideways
    grid.style.gridTemplateColumns = `72px repeat(${steps}, minmax(26px, 1fr))`;

    DRUM_ROWS.forEach(({ key, label }) => {
        const lbl = document.createElement('div');
        lbl.className   = 'drum-row-label';
        lbl.textContent = label;
        grid.appendChild(lbl);

        for (let step = 0; step < steps; step++) {
            const btn = document.createElement('button');
            btn.className    = 'drum-step';
            btn.dataset.row  = key;
            btn.dataset.step = step;
            btn.dataset.group = Math.floor(step / 4) % 2;
            if (drumPattern[key][step]) btn.classList.add('active');

            btn.addEventListener('click', () => {
                drumPattern[key][step] = !drumPattern[key][step];
                btn.classList.toggle('active', drumPattern[key][step]);
                saveDrumPattern();
            });

            grid.appendChild(btn);
        }
    });
}

function applyDrumPreset(name) {
    const steps = getDrumSteps();
    if (name === 'clear') {
        DRUM_ROWS.forEach(({ key }) => { drumPattern[key] = new Array(steps).fill(false); });
    } else {
        const tiles = DRUM_PRESET_TILES[name];
        if (!tiles) return;
        DRUM_ROWS.forEach(({ key }) => {
            drumPattern[key] = Array.from({ length: steps }, (_, i) => Boolean(tiles[key][i % tiles[key].length]));
        });
    }
    saveDrumPattern();
    renderDrumGrid();
}

function highlightDrumStep(step) {
    const playhead = document.getElementById('drum-playhead');
    if (!playhead) return;
    if (step < 0) {
        playhead.style.opacity = '0';
        return;
    }
    // Use the first drum-step button at this step index to read its position.
    // offsetLeft is relative to the positioned wrapper, so it stays correct
    // when the grid is scrolled horizontally on narrow screens.
    const btn = document.querySelector(`.drum-step[data-step="${step}"]`);
    if (btn) {
        playhead.style.left    = `${btn.offsetLeft}px`;
        playhead.style.width   = `${btn.offsetWidth}px`;
        playhead.style.opacity = '1';
    }
}

// ── Progression rendering ─────────────────────────────────────────────────────

// Group chords into rows where each row totals at most `limit` beats.
// A chord too long to fit the remaining space starts the next row.
function groupByLine(chords, limit) {
    const lines = [];
    let row = [], rowBeats = 0;

    chords.forEach((chord, origIndex) => {
        if (row.length > 0 && rowBeats + chord.beats > limit) {
            lines.push(row);
            row = []; rowBeats = 0;
        }
        row.push({ ...chord, origIndex });
        rowBeats += chord.beats;
    });

    if (row.length) lines.push(row);
    return lines;
}

function renderProgression() {
    const container = document.getElementById('chord-progression');
    const emptyMsg  = document.getElementById('empty-message');
    container.innerHTML = '';

    if (progression.length === 0) {
        emptyMsg.style.display = '';
        return;
    }
    emptyMsg.style.display = 'none';

    const limit = parseInt(document.getElementById('beats-per-line').value) || 16;
    const lines = groupByLine(progression, limit);

    lines.forEach((line, lineIdx) => {
        // Bar label / separator
        const sep = document.createElement('div');
        sep.className   = 'bar-separator';
        sep.textContent = `Bar ${lineIdx + 1}`;
        container.appendChild(sep);

        // Row of chord cards
        const row = document.createElement('div');
        row.className = 'progression-row';

        line.forEach(chord => {
            const i     = chord.origIndex;
            const label = chordLabel(chord.root, chord.type);
            const beats = chord.beats;

            const meta = [];
            if (chord.inversion) meta.push(['1st', '2nd', '3rd'][Math.min(chord.inversion, 3) - 1] + ' inv');
            if (chord.octave)    meta.push(chord.octave > 0 ? '+1 oct' : '−1 oct');

            const card = document.createElement('div');
            card.className = 'chord-card'
                + (selectedSet.has(i) ? ' selected' : '');

            card.innerHTML = `
                <div class="chord-name">${label}</div>
                ${meta.length ? `<div class="chord-meta">${meta.join(' · ')}</div>` : ''}
                <div class="chord-beat-label">${beats} beat${beats !== 1 ? 's' : ''}</div>
                <div class="card-actions">
                    <button class="chord-oct-down" title="Octave down">▼</button>
                    <button class="chord-oct-up"   title="Octave up">▲</button>
                    <button class="chord-copy"     title="Duplicate">⧉</button>
                    <button class="chord-remove"   title="Remove">×</button>
                </div>
            `;

            // Click on card body (not action buttons) → toggle selection
            card.addEventListener('click', e => {
                if (e.target.closest('button')) return;
                toggleSelect(i);
            });

            card.querySelector('.chord-oct-down').addEventListener('click', () => shiftOctave(i, -1));
            card.querySelector('.chord-oct-up')  .addEventListener('click', () => shiftOctave(i, 1));
            card.querySelector('.chord-copy')    .addEventListener('click', () => duplicateChord(i));
            card.querySelector('.chord-remove')  .addEventListener('click', () => removeChord(i));

            row.appendChild(card);
        });

        container.appendChild(row);
    });
}

// Cards render in progression order, so the nth card is progression[n]
function highlightChord(index) {
    document.querySelectorAll('.chord-card').forEach((card, i) => {
        card.classList.toggle('active', i === index);
    });
}

// ── Selection UI ──────────────────────────────────────────────────────────────

function updateSelectionUI() {
    const bar   = document.getElementById('selection-actions');
    const count = document.getElementById('selection-count');
    const n     = selectedSet.size;
    bar.style.display = n > 0 ? 'flex' : 'none';
    count.textContent = `${n} selected`;
}

// ── BPM ───────────────────────────────────────────────────────────────────────

function syncBpm(value) {
    bpm = Math.min(200, Math.max(40, parseInt(value) || 120));
    document.getElementById('bpm-slider').value = bpm;
    document.getElementById('bpm-number').value = bpm;
    localStorage.setItem('chord-bpm', bpm);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Phones start with the advanced groups (voicing, common progressions)
    // collapsed; on desktop they stay open and their toggles are hidden by CSS
    if (window.matchMedia('(max-width: 640px)').matches) {
        document.querySelectorAll('details.adv-collapse[open]')
            .forEach(d => d.removeAttribute('open'));
    }

    // Restore state
    progression = loadProgression();
    const saved = loadDrumPattern();
    if (saved) drumPattern = saved;
    resizeDrumPattern(getDrumSteps());   // saved pattern may not match the default step count

    const savedBpm = parseInt(localStorage.getItem('chord-bpm'))
                  || parseInt(localStorage.getItem('metronome-tempo'))
                  || 120;
    syncBpm(savedBpm);

    renderProgression();
    renderDrumGrid();

    // BPM
    document.getElementById('bpm-slider').addEventListener('input', e => syncBpm(e.target.value));
    document.getElementById('bpm-number').addEventListener('input', e => syncBpm(e.target.value));

    // Sound — restore saved choice, persist changes, preload sampled instruments
    // on selection so Play doesn't have to wait for the download
    const soundSel   = document.getElementById('sound-type');
    const savedSound = localStorage.getItem('chord-sound');
    if (savedSound && [...soundSel.options].some(o => o.value === savedSound)) {
        soundSel.value = savedSound;
    }
    soundSel.addEventListener('change', () => {
        localStorage.setItem('chord-sound', soundSel.value);
        if (isSoundfont(soundSel.value)) {
            loadSoundfont(soundfontName(soundSel.value)).catch(() => {});
        }
    });

    // Beats per line — update chord grid AND resize/re-render drum machine
    document.getElementById('beats-per-line').addEventListener('input', () => {
        renderProgression();
        const newSteps = getDrumSteps();
        resizeDrumPattern(newSteps);
        renderDrumGrid();
    });

    // Common progressions — populate the select from the data
    const progSelect = document.getElementById('prog-name');
    Object.entries(COMMON_PROGRESSIONS).forEach(([key, { label }]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = label;
        progSelect.appendChild(opt);
    });
    document.getElementById('add-progression-btn').addEventListener('click', addProgression);

    // Chord controls
    document.getElementById('add-chord-btn')          .addEventListener('click', addChord);
    document.getElementById('play-btn')               .addEventListener('click', play);
    document.getElementById('stop-btn')               .addEventListener('click', stop);
    document.getElementById('clear-btn')              .addEventListener('click', clearAll);
    document.getElementById('duplicate-selected-btn') .addEventListener('click', duplicateSelected);
    document.getElementById('clear-selection-btn')    .addEventListener('click', clearSelection);

    // Drum volume
    const volSlider  = document.getElementById('drum-volume');
    const volDisplay = document.getElementById('drum-volume-display');
    volSlider.addEventListener('input', () => {
        const v = parseInt(volSlider.value);
        volDisplay.textContent = `${v}%`;
        if (drumGain) drumGain.gain.value = v / 100;
    });

    // Drum presets
    document.querySelectorAll('.drum-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => applyDrumPreset(btn.dataset.preset));
    });

    // Chord Progression / Drum Machine tabs — selection persists across visits
    const toolTabs  = document.querySelectorAll('.tool-tab');
    const tabPanels = {
        chords: document.getElementById('tab-panel-chords'),
        drums:  document.getElementById('tab-panel-drums'),
    };

    function selectTab(name) {
        if (!tabPanels[name]) name = 'chords';
        toolTabs.forEach(tab => {
            const active = tab.dataset.tab === name;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active);
        });
        Object.entries(tabPanels).forEach(([key, panel]) =>
            panel.classList.toggle('hidden', key !== name));
        localStorage.setItem('chord-tab', name);
    }

    toolTabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
    selectTab(localStorage.getItem('chord-tab') || 'chords');
});
