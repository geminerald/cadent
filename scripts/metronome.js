// Metronome functionality using Web Audio API

class Metronome {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        // Load tempo from localStorage, default to 120
        this.tempo = this.loadTempo();
        this.beatsPerMeasure = 4;
        this.noteValue = 4;
        this.soundType = 'beep';
        this.startTempo = this.tempo;
        this.endTempo = this.tempo;
        this.rampDuration = 0; // in minutes
        this.rampStartTime = 0;
        this.currentBeat = 0;
        this.intervalId = null;
        this.nextNoteTime = 0;

        this.initAudio();
        this.setupControls();
        this.initializeControlValues();
    }

    loadTempo() {
        const savedTempo = localStorage.getItem('metronome-tempo');
        return savedTempo ? parseInt(savedTempo) : 120;
    }

    saveTempo(tempo) {
        localStorage.setItem('metronome-tempo', tempo);
    }

    initializeControlValues() {
        // Set initial values from localStorage
        document.getElementById('tempo-slider').value = this.tempo;
        document.getElementById('tempo-number').value = this.tempo;
        document.getElementById('start-tempo').value = this.tempo;
        document.getElementById('end-tempo').value = this.tempo;
    }

    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error('Web Audio API not supported');
        }
    }

    setupControls() {
        // Tempo controls
        const tempoSlider = document.getElementById('tempo-slider');
        const tempoNumber = document.getElementById('tempo-number');

        const syncTempo = (source) => {
            const value = parseInt(source.value);
            if (value >= 40 && value <= 200) {
                this.tempo = value;
                this.saveTempo(value);
                tempoSlider.value = value;
                tempoNumber.value = value;
                // Update advanced options if not ramping
                if (this.rampDuration <= 0) {
                    document.getElementById('start-tempo').value = value;
                    document.getElementById('end-tempo').value = value;
                    this.startTempo = value;
                    this.endTempo = value;
                }
            }
        };

        tempoSlider.addEventListener('input', (e) => syncTempo(e.target));
        tempoNumber.addEventListener('input', (e) => syncTempo(e.target));

        // Time signature
        const beatsInput = document.getElementById('beats');
        const noteValueInput = document.getElementById('note-value');

        beatsInput.addEventListener('input', (e) => {
            this.beatsPerMeasure = parseInt(e.target.value) || 4;
            if (this.isPlaying) {
                this.restart();
            }
        });

        noteValueInput.addEventListener('input', (e) => {
            this.noteValue = parseInt(e.target.value) || 4;
            if (this.isPlaying) {
                this.restart();
            }
        });

        // Sound type
        const soundSelect = document.getElementById('sound');
        soundSelect.addEventListener('change', (e) => {
            this.soundType = e.target.value;
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
        const advancedToggle = document.getElementById('advanced-toggle');
        const advancedOptions = document.getElementById('advanced-options');
        advancedToggle.addEventListener('click', () => {
            advancedOptions.classList.toggle('hidden');
        });

        // Tempo ramp controls
        const startTempoInput = document.getElementById('start-tempo');
        const endTempoInput = document.getElementById('end-tempo');
        const rampDurationInput = document.getElementById('ramp-duration');

        startTempoInput.addEventListener('input', (e) => {
            this.startTempo = parseInt(e.target.value) || 120;
        });

        endTempoInput.addEventListener('input', (e) => {
            this.endTempo = parseInt(e.target.value) || 120;
        });

        rampDurationInput.addEventListener('input', (e) => {
            this.rampDuration = parseFloat(e.target.value) || 0;
        });
    }

    start() {
        if (!this.audioContext) return;

        this.isPlaying = true;
        this.currentBeat = 0;
        this.nextNoteTime = this.audioContext.currentTime;
        this.rampStartTime = this.audioContext.currentTime;

        // If using ramp, use start tempo, otherwise use current tempo
        if (this.rampDuration > 0) {
            this.tempo = this.startTempo;
        }

        // Update UI
        document.getElementById('tempo-slider').value = this.tempo;
        document.getElementById('tempo-number').value = this.tempo;

        this.scheduleNotes();
    }

    stop() {
        this.isPlaying = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.updateVisualIndicator(-1);
    }

    restart() {
        this.stop();
        this.start();
    }

    getCurrentTempo() {
        if (this.rampDuration <= 0 || this.startTempo === this.endTempo) {
            return this.tempo;
        }

        const elapsed = this.audioContext.currentTime - this.rampStartTime;
        const rampTimeSeconds = this.rampDuration * 60;
        const progress = Math.min(elapsed / rampTimeSeconds, 1);

        return Math.round(this.startTempo + (this.endTempo - this.startTempo) * progress);
    }

    scheduleNotes() {
        const currentTempo = this.getCurrentTempo();
        const secondsPerBeat = 60 / currentTempo;

        while (this.nextNoteTime < this.audioContext.currentTime + 0.1) {
            this.playClick(this.currentBeat === 0 ? 'accent' : 'normal');
            this.updateVisualIndicator(this.currentBeat);
            
            // Update the displayed tempo if ramping
            if (this.rampDuration > 0) {
                document.getElementById('tempo-slider').value = currentTempo;
                document.getElementById('tempo-number').value = currentTempo;
            }
            
            this.nextNoteTime += secondsPerBeat;
            this.currentBeat = (this.currentBeat + 1) % this.beatsPerMeasure;
        }

        if (this.isPlaying) {
            this.intervalId = setTimeout(() => this.scheduleNotes(), 25);
        }
    }

    playClick(type) {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

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

        oscillator.type = waveform;
        oscillator.frequency.setValueAtTime(frequency, this.nextNoteTime);
        gainNode.gain.setValueAtTime(0.3, this.nextNoteTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.nextNoteTime + duration);

        oscillator.start(this.nextNoteTime);
        oscillator.stop(this.nextNoteTime + duration);
    }

    updateVisualIndicator(beat) {
        const indicator = document.getElementById('beat-indicator');
        if (beat === -1) {
            indicator.className = '';
            return;
        }

        indicator.className = beat === 0 ? 'accent' : 'normal';
        setTimeout(() => {
            indicator.className = '';
        }, 100);
    }
}

// Initialize metronome when page loads
document.addEventListener('DOMContentLoaded', () => {
    new Metronome();
});