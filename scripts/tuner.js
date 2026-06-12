const TUNER_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_INDEX = 57;

// Minimum RMS amplitude to be considered a played note rather than background noise.
const MIN_RMS = 0.005;

// Autocorrelation quality floor — lower frequencies produce weaker correlation
// peaks so a more lenient threshold is needed to catch them.
const MIN_CORRELATION = 0.15;

// The same note name must be detected for this many consecutive frames
// before it registers on the display. At ~60fps, 15 frames ≈ 0.25 s.
const STABILITY_FRAMES = 15;

// After this many consecutive frames with no signal, the display clears.
// 20 frames ≈ 0.33 s.
const SILENCE_FRAMES = 20;

const tunerState = {
    audioContext: null,
    analyser: null,
    analysisBuffer: null,   // reused each frame instead of reallocating
    stream: null,
    rafId: null,
    active: false,
};

// Gate / stability state — all reset together via resetGate()
let candidateNote = null;  // note being evaluated
let candidateFrames = 0;   // how many consecutive frames it has held
let confirmedNote = null;  // note currently shown on screen
let silenceFrames = 0;     // consecutive frames without a detected pitch
let smoothedCents = 0;     // EMA-smoothed cents offset for confirmed note

function resetGate() {
    candidateNote = null;
    candidateFrames = 0;
    confirmedNote = null;
    silenceFrames = 0;
    smoothedCents = 0;
}

// ─── Pitch maths ────────────────────────────────────────────────────────────

function noteNameFromIndex(index) {
    const octave = Math.floor(index / 12);
    const note = TUNER_NOTES[(index + 120) % 12];
    return `${note}${octave}`;
}

function frequencyToNoteData(frequency) {
    const indexFloat = 12 * (Math.log2(frequency / A4_FREQ)) + A4_INDEX;
    const noteIndex = Math.round(indexFloat);
    const cents = Math.round((indexFloat - noteIndex) * 100);
    return { note: noteNameFromIndex(noteIndex), cents, frequency };
}

// ─── Autocorrelation with normalization + quadratic interpolation ────────────

function autocorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / SIZE);

    // Volume gate — ignore anything quieter than the noise floor
    if (rms < MIN_RMS) return -1;

    // Normalize before correlating: flattens the envelope so the algorithm
    // locks onto the *periodicity* of the wave rather than amplitude peaks,
    // which helps the fundamental win over strong overtones.
    for (let i = 0; i < SIZE; i++) buffer[i] /= (rms + 0.0001);

    let bestOffset = -1;
    let bestCorrelation = 0;
    const minLag = 20;
    const maxLag = Math.floor(SIZE / 2);

    for (let offset = minLag; offset < maxLag; offset++) {
        let corr = 0;
        for (let i = 0; i < maxLag; i++) corr += buffer[i] * buffer[i + offset];
        corr /= maxLag;
        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestOffset = offset;
        }
    }

    if (bestOffset === -1 || bestCorrelation < MIN_CORRELATION) return -1;

    // Quadratic interpolation for sub-sample accuracy around the correlation peak
    if (bestOffset > 0 && bestOffset < maxLag - 1) {
        const getCorr = (o) => {
            let s = 0;
            for (let i = 0; i < maxLag; i++) s += buffer[i] * buffer[i + o];
            return s / maxLag;
        };
        const x1 = bestCorrelation;
        const x2 = getCorr(bestOffset - 1);
        const x3 = getCorr(bestOffset + 1);
        const shift = (x3 - x2) / (2 * (2 * x1 - x2 - x3));
        if (!Number.isNaN(shift)) return sampleRate / (bestOffset + shift);
    }

    return sampleRate / bestOffset;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

function updateNeedle(cents) {
    const needle = document.getElementById('needle');
    const clamped = Math.max(-50, Math.min(50, cents));
    needle.style.transform = `translateX(-50%) rotate(${clamped * 0.9}deg)`;
    const abs = Math.abs(clamped);
    if (abs <= 5) {
        needle.style.background = '#00ff88';
        needle.style.boxShadow = '0 0 12px rgba(0, 255, 136, 0.9)';
    } else if (abs <= 20) {
        needle.style.background = '#fbcf38';
        needle.style.boxShadow = '0 0 10px rgba(251, 207, 56, 0.7)';
    } else {
        needle.style.background = '#ff4d4d';
        needle.style.boxShadow = '0 0 10px rgba(255, 77, 77, 0.7)';
    }
}

function setTunerFeedback(text, color) {
    const el = document.getElementById('tuner-feedback');
    el.textContent = text;
    el.style.color = color || '#5a7a8a';
}

function clearDisplay() {
    document.getElementById('tuner-note').textContent = '--';
    document.getElementById('tuner-cents').textContent = '--';
    document.getElementById('tuner-freq').textContent = '-- Hz';
    updateNeedle(0);
    setTunerFeedback('Listening… play a note clearly.');
    confirmedNote = null;
}

// ─── Main audio loop ──────────────────────────────────────────────────────────

function processTuner() {
    if (!tunerState.active) return;

    const buffer = tunerState.analysisBuffer;
    tunerState.analyser.getFloatTimeDomainData(buffer);
    const freq = autocorrelate(buffer, tunerState.audioContext.sampleRate);

    if (freq <= 0) {
        // No usable pitch this frame — count silence and eventually clear display
        silenceFrames++;
        if (silenceFrames >= SILENCE_FRAMES) {
            clearDisplay();
            candidateNote = null;
            candidateFrames = 0;
        }
        tunerState.rafId = requestAnimationFrame(processTuner);
        return;
    }

    silenceFrames = 0;
    const { note, cents } = frequencyToNoteData(freq);

    if (note === candidateNote) {
        candidateFrames++;
    } else {
        // Different note detected — start a fresh run for this new candidate.
        // Do NOT update the confirmed display yet; the old reading stays visible
        // until the new note has proven itself stable.
        candidateNote = note;
        candidateFrames = 1;
    }

    if (candidateFrames >= STABILITY_FRAMES) {
        if (note !== confirmedNote) {
            // Note has changed and is now stable — switch over and reset EMA
            confirmedNote = note;
            smoothedCents = cents;
        } else {
            // Same note, smooth the cents with an exponential moving average
            // (alpha 0.7 = fairly smooth needle, still tracks real changes)
            smoothedCents = Math.round(0.7 * smoothedCents + 0.3 * cents);
        }

        const displayCents = smoothedCents;
        document.getElementById('tuner-note').textContent = confirmedNote;
        document.getElementById('tuner-cents').textContent = `${displayCents >= 0 ? '+' : ''}${displayCents}¢`;
        document.getElementById('tuner-freq').textContent = `${freq.toFixed(1)} Hz`;
        updateNeedle(displayCents);

        const abs = Math.abs(displayCents);
        if (abs <= 5) {
            setTunerFeedback('In Tune ✓', '#00ff88');
        } else if (displayCents < 0) {
            setTunerFeedback(`Flat — tune up ↑  (${abs}¢ low)`, '#fbcf38');
        } else {
            setTunerFeedback(`Sharp — tune down ↓  (${abs}¢ high)`, '#fbcf38');
        }
    }
    // While candidateFrames < STABILITY_FRAMES: keep the last confirmed reading
    // visible. This prevents any flicker during brief transients.

    tunerState.rafId = requestAnimationFrame(processTuner);
}

// ─── Controls ────────────────────────────────────────────────────────────────

function pauseTuner() {
    if (!tunerState.active) return;
    tunerState.active = false;
    if (tunerState.stream) tunerState.stream.getTracks().forEach(t => t.stop());
    if (tunerState.audioContext) tunerState.audioContext.close();
    if (tunerState.rafId) cancelAnimationFrame(tunerState.rafId);
    resetGate();
    document.getElementById('tuner-start').disabled = false;
    document.getElementById('tuner-pause').disabled = true;
    setTunerFeedback('Paused. Press Start to continue.');
}

async function startTuner() {
    if (tunerState.active) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setTunerFeedback('Browser doesn\'t support microphone access.', '#ff4d4d');
        return;
    }
    try {
        tunerState.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tunerState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = tunerState.audioContext.createMediaStreamSource(tunerState.stream);
        tunerState.analyser = tunerState.audioContext.createAnalyser();
        tunerState.analyser.fftSize = 4096;
        tunerState.analysisBuffer = new Float32Array(tunerState.analyser.fftSize);
        source.connect(tunerState.analyser);

        tunerState.active = true;
        resetGate();
        document.getElementById('tuner-start').disabled = true;
        document.getElementById('tuner-pause').disabled = false;
        setTunerFeedback('Listening… play a note clearly.');

        processTuner();
    } catch (error) {
        setTunerFeedback('Microphone access denied or unavailable.', '#ff4d4d');
        console.error(error);
    }
}

function resetTuner() {
    pauseTuner();
    document.getElementById('tuner-note').textContent = '--';
    document.getElementById('tuner-cents').textContent = '--';
    document.getElementById('tuner-freq').textContent = '-- Hz';
    updateNeedle(0);
    setTunerFeedback('Reset. Press Start to begin.');
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tuner-start').addEventListener('click', startTuner);
    document.getElementById('tuner-pause').addEventListener('click', pauseTuner);
    document.getElementById('tuner-reset').addEventListener('click', resetTuner);
    updateNeedle(0);
});
