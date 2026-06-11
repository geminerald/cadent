// Metronome functionality using Web Audio API

const TEMPO_MIN = 40;
const TEMPO_MAX = 200;

function clampTempo(value, fallback) {
    const n = parseInt(value);
    if (isNaN(n)) return fallback;
    return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, n));
}

class Metronome {
    constructor() {
        this.audioContext = null;
        this.masterGain   = null;
        this.isPlaying    = false;

        this.tempo           = this.loadInt('metronome-tempo', 120);
        this.beatsPerMeasure = 4;
        this.noteValue       = 4;
        this.soundType       = 'beep';
        this.subdivision     = 1;       // ticks per beat: 1, 2, 4, or 3 (triplets)
        this.swing           = false;   // applies to eighths & sixteenths only
        this.volume          = this.loadInt('metronome-volume', 80) / 100;

        // Bar-based tempo ramp: from startTempo, step by rampIncrement
        // every rampBars bars until endTempo is reached
        this.rampEnabled   = false;
        this.startTempo    = this.tempo;
        this.endTempo      = Math.min(this.tempo + 40, TEMPO_MAX);
        this.rampIncrement = 5;
        this.rampBars      = 4;
        this.barsSinceStep = 0;

        this.currentBeat  = 0;
        this.totalBeats   = 0;
        this.intervalId   = null;
        this.nextNoteTime = 0;

        this.setupControls();
        this.initializeControlValues();
        this.renderBeatDots();
    }

    loadInt(key, fallback) {
        const saved = parseInt(localStorage.getItem(key));
        return isNaN(saved) ? fallback : saved;
    }

    initializeControlValues() {
        document.getElementById('tempo-slider').value   = this.tempo;
        document.getElementById('tempo-number').value   = this.tempo;
        document.getElementById('start-tempo').value    = this.startTempo;
        document.getElementById('end-tempo').value      = this.endTempo;
        document.getElementById('ramp-increment').value = this.rampIncrement;
        document.getElementById('ramp-bars').value      = this.rampBars;
        document.getElementById('volume').value         = Math.round(this.volume * 100);
        document.getElementById('volume-display').textContent = `${Math.round(this.volume * 100)}%`;
    }

    ensureAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain   = this.audioContext.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.audioContext.destination);
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    // Number inputs: apply valid values as you type, then clamp and
    // normalise the display when the field is committed (blur / Enter)
    bindTempoInput(el, apply) {
        el.addEventListener('input', () => {
            const v = parseInt(el.value);
            if (!isNaN(v) && v >= TEMPO_MIN && v <= TEMPO_MAX) apply(v);
        });
        el.addEventListener('change', () => {
            const v = clampTempo(el.value, parseInt(el.defaultValue) || 120);
            el.value = v;
            apply(v);
        });
    }

    setupControls() {
        // Tempo — slider and number entry both drive the same value
        const tempoSlider = document.getElementById('tempo-slider');
        const tempoNumber = document.getElementById('tempo-number');

        const applyTempo = (value) => {
            this.tempo = value;
            localStorage.setItem('metronome-tempo', value);
            tempoSlider.value = value;
            tempoNumber.value = value;
        };

        tempoSlider.addEventListener('input', () => applyTempo(parseInt(tempoSlider.value)));
        this.bindTempoInput(tempoNumber, applyTempo);

        // Time signature
        document.getElementById('beats').addEventListener('input', (e) => {
            this.beatsPerMeasure = Math.min(12, Math.max(1, parseInt(e.target.value) || 4));
            this.renderBeatDots();
            if (this.isPlaying) this.restart();
        });

        document.getElementById('note-value').addEventListener('input', (e) => {
            this.noteValue = parseInt(e.target.value) || 4;
            if (this.isPlaying) this.restart();
        });

        // Subdivision + swing (swing only makes sense for straight pairs)
        const swingInput = document.getElementById('swing');
        document.getElementById('subdivision').addEventListener('change', (e) => {
            this.subdivision = parseInt(e.target.value) || 1;
            const swingable = this.subdivision === 2 || this.subdivision === 4;
            swingInput.disabled = !swingable;
            if (!swingable) {
                swingInput.checked = false;
                this.swing = false;
            }
        });

        swingInput.addEventListener('change', () => {
            this.swing = swingInput.checked;
        });

        // Sound type
        document.getElementById('sound').addEventListener('change', (e) => {
            this.soundType = e.target.value;
        });

        // Volume
        const volumeSlider  = document.getElementById('volume');
        const volumeDisplay = document.getElementById('volume-display');
        volumeSlider.addEventListener('input', () => {
            const v = parseInt(volumeSlider.value);
            this.volume = v / 100;
            volumeDisplay.textContent = `${v}%`;
            localStorage.setItem('metronome-volume', v);
            if (this.masterGain) this.masterGain.gain.value = this.volume;
        });

        // Start/Stop
        const startStopButton = document.getElementById('start-stop');
        startStopButton.addEventListener('click', () => {
            if (this.isPlaying) {
                this.stop();
                startStopButton.textContent = 'Start';
            } else {
                this.start();
                startStopButton.textContent = 'Stop';
            }
        });

        // Advanced options toggle
        document.getElementById('advanced-toggle').addEventListener('click', () => {
            document.getElementById('advanced-options').classList.toggle('hidden');
        });

        // Tempo ramp controls
        document.getElementById('ramp-enabled').addEventListener('change', (e) => {
            this.rampEnabled = e.target.checked;
        });

        this.bindTempoInput(document.getElementById('start-tempo'), (v) => { this.startTempo = v; });
        this.bindTempoInput(document.getElementById('end-tempo'),   (v) => { this.endTempo   = v; });

        document.getElementById('ramp-increment').addEventListener('change', (e) => {
            this.rampIncrement = Math.min(40, Math.max(1, parseInt(e.target.value) || 5));
            e.target.value = this.rampIncrement;
        });

        document.getElementById('ramp-bars').addEventListener('change', (e) => {
            this.rampBars = Math.min(64, Math.max(1, parseInt(e.target.value) || 4));
            e.target.value = this.rampBars;
        });
    }

    start() {
        this.ensureAudio();
        if (!this.audioContext) return;

        this.isPlaying     = true;
        this.currentBeat   = 0;
        this.totalBeats    = 0;
        this.barsSinceStep = 0;
        this.nextNoteTime  = this.audioContext.currentTime + 0.05;

        if (this.rampEnabled) {
            this.tempo = this.startTempo;
            this.updateTempoDisplay();
        }

        this.scheduleNotes();
    }

    stop() {
        this.isPlaying = false;
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        this.highlightDot(-1);
    }

    restart() {
        this.stop();
        this.start();
        document.getElementById('start-stop').textContent = 'Stop';
    }

    updateTempoDisplay() {
        document.getElementById('tempo-slider').value = this.tempo;
        document.getElementById('tempo-number').value = this.tempo;
    }

    // Tick positions within one beat, as fractions of the beat.
    // Swing delays every off-tick to give a 2:1 (triplet) feel.
    getTickOffsets() {
        switch (this.subdivision) {
            case 2:  return this.swing ? [0, 2 / 3] : [0, 1 / 2];
            case 3:  return [0, 1 / 3, 2 / 3];
            case 4:  return this.swing ? [0, 1 / 3, 1 / 2, 5 / 6] : [0, 1 / 4, 1 / 2, 3 / 4];
            default: return [0];
        }
    }

    // Called at each bar boundary — steps the tempo toward endTempo
    onBarStart() {
        if (!this.rampEnabled) return;
        this.barsSinceStep++;
        if (this.barsSinceStep < this.rampBars) return;
        this.barsSinceStep = 0;

        const dir = Math.sign(this.endTempo - this.startTempo);
        if (dir === 0) return;

        const stepped = this.tempo + dir * this.rampIncrement;
        const next    = dir > 0 ? Math.min(stepped, this.endTempo)
                                : Math.max(stepped, this.endTempo);
        if (next !== this.tempo) {
            this.tempo = next;
            this.updateTempoDisplay();
        }
    }

    scheduleNotes() {
        while (this.nextNoteTime < this.audioContext.currentTime + 0.1) {
            if (this.currentBeat === 0 && this.totalBeats > 0) this.onBarStart();

            const secondsPerBeat = 60 / this.tempo;
            this.getTickOffsets().forEach((offset, i) => {
                const t = this.nextNoteTime + offset * secondsPerBeat;
                if (i === 0) {
                    this.playClick(this.currentBeat === 0 ? 'accent' : 'normal', t);
                } else {
                    this.playClick('sub', t);
                }
            });

            this.scheduleVisual(this.currentBeat, this.nextNoteTime);

            this.nextNoteTime += secondsPerBeat;
            this.currentBeat = (this.currentBeat + 1) % this.beatsPerMeasure;
            this.totalBeats++;
        }

        if (this.isPlaying) {
            this.intervalId = setTimeout(() => this.scheduleNotes(), 25);
        }
    }

    playClick(type, time) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode   = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        let frequency;
        let duration = 0.1;
        let waveform = 'sine';

        switch (this.soundType) {
            case 'beep':
                frequency = type === 'accent' ? 1000 : 800;
                break;
            case 'boop':
                frequency = type === 'accent' ? 600 : 400;
                waveform = 'triangle';
                break;
            case 'click':
                frequency = type === 'accent' ? 2000 : 1500;
                duration = 0.05;
                break;
            case 'wood':
                frequency = type === 'accent' ? 300 : 250;
                waveform = 'square';
                break;
        }

        const peak = type === 'accent' ? 0.35
                   : type === 'sub'    ? 0.12
                   : 0.3;
        if (type === 'sub') duration *= 0.7;

        oscillator.type = waveform;
        oscillator.frequency.setValueAtTime(frequency, time);
        gainNode.gain.setValueAtTime(peak, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + duration);

        oscillator.start(time);
        oscillator.stop(time + duration);
    }

    // ── Beat dots ────────────────────────────────────────────────────────────

    renderBeatDots() {
        const container = document.getElementById('beat-dots');
        container.innerHTML = '';
        for (let i = 0; i < this.beatsPerMeasure; i++) {
            const dot = document.createElement('div');
            dot.className = 'beat-dot' + (i === 0 ? ' downbeat' : '');
            container.appendChild(dot);
        }
    }

    scheduleVisual(beat, time) {
        const delayMs = Math.max(0, (time - this.audioContext.currentTime) * 1000);
        setTimeout(() => {
            if (this.isPlaying) this.highlightDot(beat);
        }, delayMs);
    }

    highlightDot(beat) {
        document.querySelectorAll('.beat-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === beat);
        });
    }
}

// Initialize metronome when page loads
document.addEventListener('DOMContentLoaded', () => {
    new Metronome();
});
