const TUNER_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_INDEX = 57;

const tunerState = {
    audioContext: null,
    analyser: null,
    stream: null,
    rafId: null,
    active: false,
    currentNote: null,
    currentCents: 0,
};

function noteNameFromIndex(index) {
    const octave = Math.floor(index / 12);
    const note = TUNER_NOTES[(index + 120) % 12];
    return `${note}${octave}`;
}

function frequencyToNoteData(frequency) {
    const indexFloat = 12 * (Math.log2(frequency / A4_FREQ)) + A4_INDEX;
    const noteIndex = Math.round(indexFloat);
    const cents = Math.floor((indexFloat - noteIndex) * 100);
    return {
        note: noteNameFromIndex(noteIndex),
        cents,
        frequency
    };
}

function autocorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.0007) return -1;

    let bestOffset = -1;
    let bestCorrelation = 0;
    const minLag = 20;
    const maxLag = Math.floor(SIZE / 2);

    for (let offset = minLag; offset < maxLag; offset++) {
        let corr = 0;
        for (let i = 0; i < maxLag; i++) {
            corr += buffer[i] * buffer[i + offset];
        }
        corr /= maxLag;

        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestOffset = offset;
        }
    }

    if (bestOffset === -1 || bestCorrelation < 0.15) return -1;

    return sampleRate / bestOffset;
}

function updateNeedle(cents) {
    const needle = document.getElementById('needle');
    const normalized = Math.max(-50, Math.min(50, cents));
    needle.style.transform = `translateX(-50%) rotate(${normalized * 0.9}deg)`;
}

function setTunerFeedback(text, success = false) {
    const feedback = document.getElementById('tuner-feedback');
    feedback.textContent = text;
    feedback.style.color = success ? '#7cff7c' : '#fbcf38';
}

function processTuner() {
    if (!tunerState.active) return;
    const buffer = new Float32Array(tunerState.analyser.fftSize);
    tunerState.analyser.getFloatTimeDomainData(buffer);
    const freq = autocorrelate(buffer, tunerState.audioContext.sampleRate);

    const noteEl = document.getElementById('tuner-note');
    const centsEl = document.getElementById('tuner-cents');
    const freqEl = document.getElementById('tuner-freq');

    if (freq > 0) {
        const noteData = frequencyToNoteData(freq);
        tunerState.currentNote = noteData.note;
        tunerState.currentCents = noteData.cents;

        noteEl.textContent = noteData.note;
        centsEl.textContent = `${noteData.cents >= 0 ? '+' : ''}${noteData.cents} cents`;
        freqEl.textContent = `Frequency: ${freq.toFixed(1)} Hz`;

        updateNeedle(noteData.cents);
        setTunerFeedback('Tuning readout is active.', Math.abs(noteData.cents) <= 5);
    } else {
        noteEl.textContent = '--';
        centsEl.textContent = '--';
        freqEl.textContent = 'Frequency: -- Hz';
        setTunerFeedback('Waiting for stable signal...', false);
        updateNeedle(0);
    }

    tunerState.rafId = requestAnimationFrame(processTuner);
}

function pauseTuner() {
    if (!tunerState.active) return;
    tunerState.active = false;
    if (tunerState.stream) tunerState.stream.getTracks().forEach(track => track.stop());
    if (tunerState.audioContext) tunerState.audioContext.close();
    if (tunerState.rafId) cancelAnimationFrame(tunerState.rafId);
    document.getElementById('tuner-start').disabled = false;
    document.getElementById('tuner-pause').disabled = true;
    setTunerFeedback('Paused. Press Start to continue.', false);
}

async function startTuner() {
    if (tunerState.active) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setTunerFeedback('Browser doesn\'t support microphone access.', false);
        return;
    }

    try {
        tunerState.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tunerState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = tunerState.audioContext.createMediaStreamSource(tunerState.stream);
        tunerState.analyser = tunerState.audioContext.createAnalyser();
        tunerState.analyser.fftSize = 2048;
        source.connect(tunerState.analyser);

        tunerState.active = true;
        document.getElementById('tuner-start').disabled = true;
        document.getElementById('tuner-pause').disabled = false;
        setTunerFeedback('Listening for notes...');

        processTuner();
    } catch (error) {
        setTunerFeedback('Microphone access denied or unavailable.', false);
        console.error(error);
    }
}

function resetTuner() {
    pauseTuner();
    tunerState.currentNote = null;
    tunerState.currentCents = 0;
    document.getElementById('tuner-note').textContent = '--';
    document.getElementById('tuner-cents').textContent = '--';
    document.getElementById('tuner-freq').textContent = 'Frequency: -- Hz';
    updateNeedle(0);
    setTunerFeedback('Reset. Press Start to begin.', false);
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tuner-start').addEventListener('click', startTuner);
    document.getElementById('tuner-pause').addEventListener('click', pauseTuner);
    document.getElementById('tuner-reset').addEventListener('click', resetTuner);
    updateNeedle(0);
});