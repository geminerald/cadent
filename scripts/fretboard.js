const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_INDEX = 57; // C0 index at 0

const targetNotes = [
    'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2', 'C3', 'C#3', 'D3', 'D#3', 'E3',
    'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4'
];

const state = {
    audioContext: null,
    analyser: null,
    stream: null,
    active: false,
    currentTarget: null,
    drillPlan: [],
    stepIndex: 0,
    maxSteps: 5,
    startTime: null,
    elapsedTime: 0,
    timerInterval: null,
    rafId: null
};

function noteNameFromIndex(index) {
    const octave = Math.floor(index / 12);
    const note = NOTE_NAMES[index % 12];
    return `${note}${octave}`;
}

function noteIndexFromName(name) {
    const match = name.match(/^([A-G]#?)(\d+)$/);
    if (!match) return null;
    const [_, note, octave] = match;
    const noteIdx = NOTE_NAMES.indexOf(note);
    if (noteIdx < 0) return null;
    return noteIdx + 12 * Number(octave);
}

function frequencyToNoteName(freq) {
    if (freq <= 0) return null;
    const indexFloat = 12 * (Math.log2(freq / A4_FREQ)) + A4_INDEX;
    const index = Math.round(indexFloat);
    const cents = Math.floor((indexFloat - index) * 100);
    return {
        name: noteNameFromIndex(index),
        cents
    };
}

function autocorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.0007) return -1; // allow quieter input without losing too much noise

    // normalize buffer in place for better sensitivity and stable pitch detection
    for (let i = 0; i < SIZE; i++) {
        buffer[i] = buffer[i] / (rms + 0.0001);
    }

    let bestOffset = -1;
    let bestCorrelation = 0;
    let correlation;
    const minLag = 20;
    const maxLag = Math.floor(SIZE / 2);

    for (let offset = minLag; offset < maxLag; offset++) {
        let corr = 0;
        for (let i = 0; i < maxLag; i++) {
            corr += buffer[i] * buffer[i + offset];
        }
        corr = corr / maxLag;

        if (corr > bestCorrelation) {
            bestCorrelation = corr;
            bestOffset = offset;
        }
    }

    if (bestOffset === -1 || bestCorrelation < 0.15) {
        return -1;
    }

    // Quadratic interpolation for more accuracy around the best offset
    if (bestOffset > 0 && bestOffset < maxLag - 1) {
        const x1 = bestCorrelation;
        let x2;
        let x3;

        // x2 = corr(bestOffset), x1 = corr(bestOffset-1), x3 = corr(bestOffset+1)
        const getCorr = (offset) => {
            let sum = 0;
            for (let i = 0; i < maxLag; i++) {
                sum += buffer[i] * buffer[i + offset];
            }
            return sum / maxLag;
        };

        x2 = getCorr(bestOffset - 1);
        x3 = getCorr(bestOffset + 1);

        const shift = (x3 - x2) / (2 * (2 * x1 - x2 - x3));

        if (!Number.isNaN(shift)) {
            return sampleRate / (bestOffset + shift);
        }
    }

    return sampleRate / bestOffset;
}

function generateDrillPlan() {
    const randomNotes = [...targetNotes].sort(() => Math.random() - 0.5);
    return randomNotes.slice(0, state.maxSteps);
}

function getNextTarget() {
    if (state.stepIndex >= state.drillPlan.length) return null;
    return state.drillPlan[state.stepIndex];
}

function updateTarget() {
    const targetEl = document.getElementById('target-note');
    if (!state.currentTarget) {
        targetEl.textContent = 'Press Start';
        return;
    }
    targetEl.textContent = state.currentTarget;
}

function markDrillComplete() {
    const targetEl = document.getElementById('target-note');
    targetEl.textContent = 'All done!';
    setFeedback('Great work! You have completed the drill.', true);
}

function updateChecklist() {
    const checkboxes = document.querySelectorAll('#progress-checkboxes input');
    checkboxes.forEach((input, i) => {
        input.checked = i < state.stepIndex;
    });
}

function updateTimer() {
    let elapsed = state.elapsedTime;
    if (state.active && state.startTime) {
        elapsed += (performance.now() - state.startTime) / 1000;
    }
    document.getElementById('drill-time').textContent = `Time: ${elapsed.toFixed(2)}s`;
}

function updateProgress() {
    const list = document.getElementById('progress-list');
    if (!list) {
        return;
    }
    list.innerHTML = '';
    targetNotes.forEach(note => {
        const item = document.createElement('li');
        item.textContent = note;
        item.style.color = state.solved.has(note) ? '#7cff7c' : '#e4f9ff';
        item.style.opacity = state.solved.has(note) ? '1' : '0.55';
        list.appendChild(item);
    });
}

function setFeedback(text, isSuccess = false) {
    const feedback = document.getElementById('feedback');
    feedback.textContent = text;
    feedback.style.color = isSuccess ? '#7cff7c' : '#fbcf38';
}

function processAudio() {
    if (!state.active) return;
    const buffer = new Float32Array(state.analyser.fftSize);
    state.analyser.getFloatTimeDomainData(buffer);
    const freq = autocorrelate(buffer, state.audioContext.sampleRate);

    const detectedElement = document.getElementById('detected-note');

    if (freq > 0) {
        const detected = frequencyToNoteName(freq);
        if (detected) {
            // require a small absolute frequency certainty buffer, but still accept quieter sounds
            const confidenceNote = Math.abs(detected.cents) <= 40;
            const target = state.currentTarget;
            const targetIndex = noteIndexFromName(target);
            const detectedIndex = noteIndexFromName(detected.name);
            detectedElement.textContent = `${detected.name} (${detected.cents >= 0 ? '+' : ''}${detected.cents} cents)`;

            if (target && targetIndex !== null && detectedIndex !== null) {
                if (detected.name === target && confidenceNote) {
                    setFeedback(`Correct: ${detected.name} marked done!`, true);
                    state.stepIndex += 1;
                    updateChecklist();

                    // card animation on success
                    const targetCard = document.querySelector('.note-card:nth-child(1)');
                    const checkboxInput = document.querySelector(`#progress-checkboxes input:nth-child(${state.stepIndex})`);
                    if (targetCard) {
                        targetCard.classList.add('explode');
                        setTimeout(() => targetCard.classList.remove('explode'), 500);
                    }
                    if (checkboxInput) {
                        checkboxInput.classList.add('checked-glow');
                        setTimeout(() => checkboxInput.classList.remove('checked-glow'), 500);
                    }

                    if (state.stepIndex >= state.maxSteps) {
                        state.currentTarget = null;
                        markDrillComplete();
                        stopDrill();
                        const finalTime = ((performance.now() - state.startTime) / 1000).toFixed(2);
                        setFeedback(`Success! completed in ${finalTime}s`, true);
                        return;
                    }

                    state.currentTarget = getNextTarget();
                    updateTarget();
                } else {
                    const direction = detectedIndex < targetIndex ? 'higher' : 'lower';
                    setFeedback(`${detected.name} is too ${direction}. Keep trying for ${target}.`);
                }
            } else {
                setFeedback(`Listening: detected ${detected.name}.`);
            }
        }
    } else {
        detectedElement.textContent = '--';
        setFeedback('No clear note detected yet. Play a note clearly.');
    }

    state.rafId = requestAnimationFrame(processAudio);
}

async function startDrill() {
    if (state.active) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setFeedback('Web Audio API getUserMedia is not supported in this browser.', false);
        return;
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasMic = devices.some(d => d.kind === 'audioinput');
        if (!hasMic) {
            setFeedback('No microphone device detected. Please plug in a mic and refresh.', false);
            return;
        }

        state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = state.audioContext.createMediaStreamSource(state.stream);
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 2048;
        source.connect(state.analyser);

        state.active = true;
        if (!state.drillPlan.length || state.stepIndex === 0) {
            state.drillPlan = generateDrillPlan();
            state.stepIndex = 0;
        }

        if (!state.startTime) {
            state.startTime = performance.now();
        }

        if (state.timerInterval) {
            clearInterval(state.timerInterval);
        }
        state.timerInterval = setInterval(updateTimer, 100);

        if (!state.currentTarget) {
            state.currentTarget = getNextTarget();
        }

        updateTarget();
        updateChecklist();
        updateProgress();
        setFeedback('Listening... play the target note now.');

        document.getElementById('start-drill').disabled = true;
        document.getElementById('pause-drill').disabled = false;

        processAudio();
    } catch (error) {
        const msg = error && error.name ? `${error.name}: ${error.message}` : 'Microphone access denied or not available.';
        setFeedback(`Mic error: ${msg}`, false);
        console.error('Mic access error:', error);
    }
}

function stopDrill() {
    if (!state.active) return;
    state.active = false;

    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
    }
    if (state.audioContext) {
        state.audioContext.close();
    }
    if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
    }

    if (state.startTime) {
        state.elapsedTime += (performance.now() - state.startTime) / 1000;
        state.startTime = null;
    }

    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }

    document.getElementById('start-drill').disabled = false;
    document.getElementById('pause-drill').disabled = true;
    setFeedback('Paused: press Start Drill to resume.');
}

function resetDrill() {
    stopDrill();
    state.solved.clear();
    state.stepIndex = 0;
    state.startTime = null;
    state.elapsedTime = 0;
    state.currentTarget = null;
    state.drillPlan = [];
    updateChecklist();
    updateTarget();
    setFeedback('Drill reset. Press Start Drill to begin again.');
    document.getElementById('drill-time').textContent = 'Time: 0.00s';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-drill').addEventListener('click', startDrill);
    document.getElementById('pause-drill').addEventListener('click', stopDrill);
    document.getElementById('reset-drill').addEventListener('click', resetDrill);

    state.currentTarget = null;
    updateTarget();
    updateProgress();
});