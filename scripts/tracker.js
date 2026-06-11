// Practice Planner — plan building, templates and the session start modal.
// The running session itself (timer, header bar, skip/end, auto-switch) is
// handled by the shared runner in session.js, which exposes window.CadentSession.

// Helper function to safely get DOM elements
function getElement(id) {
    return document.getElementById(id);
}

// Main DOM references (non-header elements, always exist)
const plannerForm = getElement('planner-form');
const itemInput = getElement('practice-item');
const categoryInput = getElement('practice-category');
const durationInput = getElement('practice-duration');
const pageInput = getElement('practice-page');
const practiceItems = getElement('practice-items');
const summaryTotal = getElement('summary-total');
const summaryCompleted = getElement('summary-completed');
const summaryRemaining = getElement('summary-remaining');
const summaryTime = getElement('summary-time');
const clearCompletedButton = getElement('clear-completed');
const clearAllButton = getElement('clear-all');
const startSessionButton = getElement('start-session');
const endSessionButton = getElement('end-session');

// Modal elements
const sessionModal = getElement('session-modal');
const modalBackdrop = sessionModal ? sessionModal.querySelector('.modal-backdrop') : null;
const modalItemsList = getElement('modal-items-list');
const modalTotalTime = getElement('modal-total-time');
const modalBackBtn = getElement('modal-back');
const modalConfirmBtn = getElement('modal-confirm');

const STORAGE_KEY = 'cadentPracticePlanner';

function sessionActive() {
    return !!(window.CadentSession && window.CadentSession.isActive());
}

function toolLabel(page) {
    return page && window.CadentSession ? window.CadentSession.toolLabel(page) : null;
}

function toolUrl(page) {
    return page && window.CadentSession ? window.CadentSession.toolUrl(page) : null;
}

// ── Practice session templates ────────────────────────────────────────────────
// Recommended sessions per instrument and level. Categories must match the
// options in the Custom form (scales, technique, repertoire, theory,
// ear-training, sight-reading, other). Durations are minutes. `page` is the
// Cadent tool page recommended for that item (see TOOL_PAGES in session.js).

const PRACTICE_TEMPLATES = {
    guitar: {
        beginner: {
            name: 'Campfire Foundations',
            tagline: 'Nail the open chords and strumming that every song circle runs on.',
            items: [
                { text: 'Spider-walk finger warm-up', category: 'technique', duration: 5, page: 'metronome' },
                { text: 'Open chord changes: G, C, D, Em', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Strumming pattern: D-D-U-U-D-U', category: 'technique', duration: 5, page: 'metronome' },
                { text: 'C major scale, first position', category: 'scales', duration: 5, page: 'fretboard' },
                { text: 'Learn a 3-chord song', category: 'repertoire', duration: 10, page: 'chords' },
            ],
        },
        intermediate: {
            name: 'Barre Chord Bootcamp',
            tagline: 'Drill barre shapes, pentatonics and your first proper lead lines.',
            items: [
                { text: 'Chromatic warm-up with metronome', category: 'technique', duration: 5, page: 'metronome' },
                { text: 'Barre chord changes: F and Bm shapes', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Minor pentatonic, positions 1 & 2', category: 'scales', duration: 10, page: 'fretboard' },
                { text: '12-bar blues rhythm in A', category: 'repertoire', duration: 10, page: 'chords' },
                { text: 'Improvise over a backing track', category: 'repertoire', duration: 10, page: 'chords' },
                { text: 'Interval recognition: 3rds and 5ths', category: 'ear-training', duration: 5 },
            ],
        },
        advanced: {
            name: 'Fretboard Conqueror',
            tagline: 'Modes, technique burners and improvisation across the whole neck.',
            items: [
                { text: 'Alternate picking burner at top tempo', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Three-notes-per-string major modes', category: 'scales', duration: 15, page: 'fretboard' },
                { text: 'Chord-tone soloing over a ii–V–I', category: 'theory', duration: 15, page: 'chords' },
                { text: 'Transcribe a solo phrase by ear', category: 'ear-training', duration: 15 },
                { text: 'Repertoire polish: hardest section, slow to fast', category: 'repertoire', duration: 15, page: 'metronome' },
            ],
        },
    },
    piano: {
        beginner: {
            name: 'Ivory Liftoff',
            tagline: 'Get both hands moving and play your first real piece.',
            items: [
                { text: 'Five-finger warm-up, both hands', category: 'technique', duration: 5, page: 'metronome' },
                { text: 'C major scale, hands separately', category: 'scales', duration: 5, page: 'metronome' },
                { text: 'Basic triads: C, F and G', category: 'theory', duration: 5, page: 'chords' },
                { text: 'Simple piece: right hand, then hands together', category: 'repertoire', duration: 15 },
                { text: 'Note-naming flashcards', category: 'sight-reading', duration: 5 },
            ],
        },
        intermediate: {
            name: 'Hands in Harmony',
            tagline: 'Scales around the circle, smooth voice leading and stronger reading.',
            items: [
                { text: 'Hanon exercises 1–3 with metronome', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Major scales around the circle of fifths, hands together', category: 'scales', duration: 10, page: 'metronome' },
                { text: 'Chord inversions and voice leading', category: 'theory', duration: 10, page: 'chords' },
                { text: 'Current piece: slow practice on trouble spots', category: 'repertoire', duration: 15, page: 'metronome' },
                { text: 'Sight-read one new short piece', category: 'sight-reading', duration: 10 },
            ],
        },
        advanced: {
            name: 'The Virtuoso Circuit',
            tagline: 'A full technical circuit plus deep interpretive work on repertoire.',
            items: [
                { text: 'Scales in 3rds and 6ths, arpeggio circuit', category: 'scales', duration: 15, page: 'metronome' },
                { text: 'Octave and trill technique', category: 'technique', duration: 15, page: 'metronome' },
                { text: 'Repertoire: interpretation and dynamics pass', category: 'repertoire', duration: 20 },
                { text: 'Harmonic analysis of your current piece', category: 'theory', duration: 10, page: 'chords' },
                { text: 'Play progressions by ear, then transpose', category: 'ear-training', duration: 15, page: 'chords' },
            ],
        },
    },
    bass: {
        beginner: {
            name: 'Low-End Launchpad',
            tagline: 'Lock in with the metronome and learn your first bass line.',
            items: [
                { text: 'Finger permutation warm-up', category: 'technique', duration: 5, page: 'metronome' },
                { text: 'Major scale, one octave', category: 'scales', duration: 5, page: 'fretboard' },
                { text: 'Root notes through a chord chart', category: 'theory', duration: 5, page: 'chords' },
                { text: 'Steady eighth-note groove with metronome', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Learn a simple bass line', category: 'repertoire', duration: 10 },
            ],
        },
        intermediate: {
            name: 'Pocket Builder',
            tagline: 'Ghost notes, walking lines and grooves that sit deep in the pocket.',
            items: [
                { text: 'Plucking-hand speed and string crossing', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Major and minor pentatonics, two octaves', category: 'scales', duration: 10, page: 'fretboard' },
                { text: 'Groove with ghost notes over a drum loop', category: 'technique', duration: 10, page: 'chords' },
                { text: 'Walking bass over a 12-bar blues', category: 'theory', duration: 10, page: 'chords' },
                { text: 'Transcribe a bass line by ear', category: 'ear-training', duration: 10 },
            ],
        },
        advanced: {
            name: 'The Groove Architect',
            tagline: 'Slap chops, odd meters and walking lines over changes.',
            items: [
                { text: 'Slap and pop workout', category: 'technique', duration: 15, page: 'metronome' },
                { text: 'Modes through the cycle of fourths', category: 'scales', duration: 15, page: 'fretboard' },
                { text: 'Walking lines over a jazz standard', category: 'repertoire', duration: 15, page: 'chords' },
                { text: 'Solo construction: chord tones and approach notes', category: 'theory', duration: 10, page: 'chords' },
                { text: 'Odd-meter grooves in 5/4 and 7/8', category: 'technique', duration: 15, page: 'metronome' },
            ],
        },
    },
    drums: {
        beginner: {
            name: 'Stick Control Starter',
            tagline: 'Clean strokes, your first rock beat and playing along to music.',
            items: [
                { text: 'Single and double stroke rolls', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Basic rock beat: kick, snare and hi-hats', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Quarter and eighth note reading', category: 'sight-reading', duration: 5 },
                { text: 'Play along to a slow song', category: 'repertoire', duration: 10 },
            ],
        },
        intermediate: {
            name: 'The Groove Machine',
            tagline: 'Paradiddles around the kit, ghost notes and fills that land on 1.',
            items: [
                { text: 'Paradiddle inversions around the kit', category: 'technique', duration: 10, page: 'metronome' },
                { text: '16th-note grooves with ghost notes', category: 'technique', duration: 15, page: 'metronome' },
                { text: 'Fills that resolve cleanly to beat 1', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Syncopated reading chart', category: 'sight-reading', duration: 5 },
                { text: 'Play along: medium-tempo track', category: 'repertoire', duration: 10 },
            ],
        },
        advanced: {
            name: 'Polyrhythm Laboratory',
            tagline: 'Layer 3-over-4, survive odd time and steal vocabulary from the greats.',
            items: [
                { text: 'Flam and drag rudiments at tempo', category: 'technique', duration: 15, page: 'metronome' },
                { text: '3-over-4 and 5-over-4 polyrhythms', category: 'theory', duration: 15, page: 'metronome' },
                { text: 'Linear fills and quads', category: 'technique', duration: 10, page: 'metronome' },
                { text: 'Odd-time grooves in 7/8 and 5/4', category: 'technique', duration: 15, page: 'metronome' },
                { text: 'Transcribe a drum break', category: 'ear-training', duration: 15 },
            ],
        },
    },
    voice: {
        beginner: {
            name: 'Find Your Voice',
            tagline: 'Breath support, gentle warm-ups and singing in tune with confidence.',
            items: [
                { text: 'Breathing and posture: diaphragm work', category: 'technique', duration: 5 },
                { text: 'Lip trills and sirens warm-up', category: 'technique', duration: 5 },
                { text: 'Major scale on solfège', category: 'scales', duration: 5, page: 'tuner' },
                { text: 'Pitch matching against a keyboard', category: 'ear-training', duration: 5, page: 'tuner' },
                { text: 'Sing a simple song with backing', category: 'repertoire', duration: 10, page: 'chords' },
            ],
        },
        intermediate: {
            name: 'The Range Builder',
            tagline: 'Smooth out your break and shape phrases like you mean them.',
            items: [
                { text: 'Extended warm-up: trills, hums and vowels', category: 'technique', duration: 10 },
                { text: 'Scales and arpeggios through your break', category: 'scales', duration: 10, page: 'tuner' },
                { text: 'Interval singing: 3rds up to octaves', category: 'ear-training', duration: 10, page: 'tuner' },
                { text: 'Song work: phrasing and dynamics', category: 'repertoire', duration: 15, page: 'chords' },
            ],
        },
        advanced: {
            name: 'Stage-Ready',
            tagline: 'Agility runs, register blending and a full performance run-through.',
            items: [
                { text: 'Full vocal warm-up and agility runs', category: 'technique', duration: 10 },
                { text: 'Belt, mix and head voice transitions', category: 'technique', duration: 15, page: 'tuner' },
                { text: 'Sight-singing new melodies', category: 'sight-reading', duration: 10 },
                { text: 'Harmonising by ear over a recording', category: 'ear-training', duration: 10, page: 'chords' },
                { text: 'Performance run-through, record and review', category: 'repertoire', duration: 15 },
            ],
        },
    },
};

// Goal-based sessions for the "I want to…" row. These combine with the
// instrument row: each item can carry per-instrument `variants` that override
// its text and/or tool page, so "Drums + Warm up" reads like a drum session.
// With no instrument (Custom) the base items are used as-is.

const INSTRUMENT_LABELS = {
    guitar: 'Guitar',
    piano:  'Piano',
    bass:   'Bass',
    drums:  'Drums',
    voice:  'Voice',
};

const GOAL_TEMPLATES = {
    'just-play': {
        name: 'The Garage Jam',
        tagline: 'No drills, no homework — tune up, loop a progression and play.',
        items: [
            { text: 'Quick tune-up', category: 'other', duration: 2, page: 'tuner', variants: {
                piano: { text: 'Posture and bench setup', page: null },
                drums: { text: 'Kit setup and quick tune', page: null },
                voice: { text: 'Gentle hum to wake the voice', page: null },
            } },
            { text: 'Loosen up: free noodling', category: 'technique', duration: 5, variants: {
                drums: { text: 'Loosen up: free play around the kit' },
                voice: { text: 'Loosen up: sirens and slides' },
            } },
            { text: 'Jam over a backing track', category: 'repertoire', duration: 15, page: 'chords', variants: {
                drums: { text: 'Play along with the drum machine groove' },
                voice: { text: 'Sing over a looped progression' },
            } },
            { text: 'Play your favourite songs', category: 'repertoire', duration: 18 },
        ],
    },
    'warm-up': {
        name: 'The Wake-Up Call',
        tagline: 'Fifteen focused minutes to get your hands and ears ready.',
        items: [
            { text: 'Stretch and posture reset', category: 'other', duration: 3 },
            { text: 'Slow chromatic walk with the click', category: 'technique', duration: 5, page: 'metronome', variants: {
                piano: { text: 'Slow five-finger patterns with the click' },
                drums: { text: 'Slow singles and doubles with the click' },
                voice: { text: 'Lip trills up and down with the click' },
            } },
            { text: 'Scale ladders, building speed', category: 'scales', duration: 5, page: 'fretboard', variants: {
                piano: { text: 'Scale ladders, hands together', page: 'metronome' },
                drums: { text: 'Accent patterns, building speed', page: 'metronome' },
                voice: { text: 'Five-note scales through your range', page: 'tuner' },
            } },
            { text: 'Arpeggio finisher', category: 'scales', duration: 2, variants: {
                drums: { text: 'Roll crescendo finisher' },
                voice: { text: 'Arpeggio slides finisher' },
            } },
        ],
    },
    'improve-timing': {
        name: 'The Pocket Clinic',
        tagline: 'Metronome work that tightens your inner clock.',
        items: [
            { text: 'Quarter notes locked to the click', category: 'technique', duration: 5, page: 'metronome', variants: {
                voice: { text: 'Phrases locked to the click' },
            } },
            { text: 'Subdivision switching: 8ths, 16ths, triplets', category: 'technique', duration: 8, page: 'metronome' },
            { text: 'Swing feel workout', category: 'technique', duration: 5, page: 'metronome' },
            { text: 'Tempo ramp challenge', category: 'technique', duration: 7, page: 'metronome' },
            { text: 'Groove along with the drum machine', category: 'technique', duration: 5, page: 'chords', variants: {
                drums: { text: 'Trade grooves with the drum machine' },
                voice: { text: 'Rhythmic phrasing over the drum machine' },
            } },
        ],
    },
    'ten-minutes': {
        name: 'The Ten-Minute Tune-Up',
        tagline: 'Short on time? Make every one of those minutes count.',
        items: [
            { text: 'Tune up, fast', category: 'other', duration: 1, page: 'tuner', variants: {
                piano: { text: 'Quick posture and hand warm-up', page: null },
                drums: { text: 'Quick kit check', page: null },
                voice: { text: 'Quick hum and lip trill', page: null },
            } },
            { text: 'Two-minute warm-up', category: 'technique', duration: 2, page: 'metronome' },
            { text: 'One scale, perfectly clean', category: 'scales', duration: 3, page: 'fretboard', variants: {
                piano: { text: 'One scale, perfectly even', page: 'metronome' },
                drums: { text: 'One rudiment, perfectly clean', page: 'metronome' },
                voice: { text: 'One scale, perfectly in tune', page: 'tuner' },
            } },
            { text: 'Rescue one trouble spot', category: 'repertoire', duration: 4 },
        ],
    },
    'train-ears': {
        name: 'The Ear Gym',
        tagline: 'Interval drills and sing-backs to sharpen your listening.',
        items: [
            { text: 'Interval recognition drills', category: 'ear-training', duration: 8 },
            { text: 'Sing it back: match pitches', category: 'ear-training', duration: 7, page: 'tuner' },
            { text: 'Pick out a melody by ear', category: 'ear-training', duration: 10, page: 'chords', variants: {
                drums: { text: 'Echo rhythms: listen and play back', page: 'metronome' },
            } },
        ],
    },
};

// Apply an instrument's variants to a goal template's items
function resolveGoalItems(goal, instrument) {
    return goal.items.map(item => {
        const variant = (instrument && item.variants) ? item.variants[instrument] : null;
        return {
            text: variant && variant.text ? variant.text : item.text,
            category: item.category,
            duration: item.duration,
            page: variant && 'page' in variant ? variant.page : (item.page || null),
        };
    });
}

// Template menu state + DOM refs
const templateInstruments = getElement('template-instruments');
const templateGoals       = getElement('template-goals');
const templateLevels      = getElement('template-levels');
const templatePreview     = getElement('template-preview');
const levelRow            = getElement('level-row');

let selectedInstrument = 'custom';
let selectedLevel      = 'beginner';
let selectedGoal       = null;

// The active template combines both pill rows: a goal flavoured by the chosen
// instrument, an instrument's leveled session when no goal is set, or null
// for plain Custom (which shows the build-your-own form instead).
function getActiveTemplate() {
    const instrument = selectedInstrument !== 'custom' ? selectedInstrument : null;

    if (selectedGoal) {
        const goal = GOAL_TEMPLATES[selectedGoal];
        return {
            name: goal.name,
            tagline: goal.tagline,
            badge: instrument ? INSTRUMENT_LABELS[instrument] : null,
            items: resolveGoalItems(goal, instrument),
        };
    }
    if (instrument) {
        const template = PRACTICE_TEMPLATES[instrument][selectedLevel];
        return { name: template.name, tagline: template.tagline, badge: null, items: template.items };
    }
    return null;
}

function renderTemplateMenu() {
    if (!templatePreview) return;

    const template = getActiveTemplate();
    // Levels only apply to an instrument's own full sessions, not goal combos
    levelRow.classList.toggle('hidden', !(selectedInstrument !== 'custom' && !selectedGoal));
    plannerForm.classList.toggle('hidden', !(selectedInstrument === 'custom' && !selectedGoal));

    if (!template) {
        templatePreview.innerHTML = `
            <div class="template-placeholder">
                <h4>Custom Session</h4>
                <p>Build your own plan with the form below — or pick an instrument, a goal, or both on the left to preview a ready-made session here.</p>
            </div>
        `;
        return;
    }

    const total = template.items.reduce((sum, item) => sum + item.duration, 0);

    templatePreview.innerHTML = `
        <div class="template-preview-header">
            <h4>${template.name}${template.badge ? ` <span class="template-badge">${template.badge}</span>` : ''}</h4>
            <span class="template-total">${total} min</span>
        </div>
        <p class="template-tagline">${template.tagline}</p>
        <ul class="template-items">
            ${template.items.map(item => `
                <li>
                    <span>${item.text}</span>
                    <span class="template-item-meta">${item.category.replace('-', ' ')}${toolLabel(item.page) ? ' · ' + toolLabel(item.page) : ''} · ${item.duration} min</span>
                </li>`).join('')}
        </ul>
        <button type="button" id="load-template-btn">Load This Plan</button>
    `;

    getElement('load-template-btn').addEventListener('click', loadActiveTemplate);
}

function loadActiveTemplate() {
    if (sessionActive()) {
        alert('End the current practice session before loading a new plan.');
        return;
    }

    const template = getActiveTemplate();
    if (!template) return;

    const fullName = template.badge ? `${template.name} — ${template.badge}` : template.name;
    const existing = loadPracticeItems();
    if (existing.length > 0 &&
        !confirm(`Replace your current plan (${existing.length} item${existing.length === 1 ? '' : 's'}) with "${fullName}"?`)) {
        return;
    }

    const items = template.items.map(item => ({
        text: item.text,
        category: item.category,
        duration: item.duration,
        page: item.page || null,
        completed: false,
        created: new Date().toISOString(),
    }));
    savePracticeItems(items);
    renderPracticeItems();
}

function setupTemplateMenu() {
    if (!templateInstruments || !templateGoals || !templateLevels) return;

    // The two rows combine: an instrument flavours the selected goal.
    // Choosing Custom clears the goal (back to the build-your-own form),
    // and clicking the active goal pill toggles it off.
    templateInstruments.addEventListener('click', (event) => {
        const pill = event.target.closest('.template-pill');
        if (!pill) return;
        selectedInstrument = pill.dataset.instrument;
        if (selectedInstrument === 'custom') selectedGoal = null;
        templateInstruments.querySelectorAll('.template-pill')
            .forEach(p => p.classList.toggle('active', p === pill));
        if (!selectedGoal) {
            templateGoals.querySelectorAll('.template-pill')
                .forEach(p => p.classList.remove('active'));
        }
        renderTemplateMenu();
    });

    templateGoals.addEventListener('click', (event) => {
        const pill = event.target.closest('.template-pill');
        if (!pill) return;
        selectedGoal = selectedGoal === pill.dataset.goal ? null : pill.dataset.goal;
        templateGoals.querySelectorAll('.template-pill')
            .forEach(p => p.classList.toggle('active', selectedGoal !== null && p === pill));
        renderTemplateMenu();
    });

    templateLevels.addEventListener('click', (event) => {
        const pill = event.target.closest('.level-pill');
        if (!pill) return;
        selectedLevel = pill.dataset.level;
        templateLevels.querySelectorAll('.level-pill')
            .forEach(p => p.classList.toggle('active', p === pill));
        renderTemplateMenu();
    });
}

// ── Plan storage ──────────────────────────────────────────────────────────────

function loadPracticeItems() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Invalid planner data', e);
        return [];
    }
}

function savePracticeItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function getTotalSessionMinutes() {
    const items = loadPracticeItems();
    return items.reduce((total, item) => total + (item.duration || 0), 0);
}

// ── Session start/end (delegates to the shared runner) ───────────────────────

function updateSessionButtons() {
    const items = loadPracticeItems();
    const hasItems = items.length > 0;

    startSessionButton.style.display = hasItems && !sessionActive() ? 'inline-block' : 'none';
    endSessionButton.style.display = sessionActive() ? 'inline-block' : 'none';
}

const categoryColors = {
    'scales': '#a5ffcb',
    'technique': '#60ff97',
    'repertoire': '#99ff66',
    'theory': '#ffff66',
    'ear-training': '#ffcc66',
    'sight-reading': '#ff9966',
    'other': '#b8fff2'
};

function showSessionModal() {
    const items = loadPracticeItems();
    if (items.length === 0) {
        alert('Add some practice items first!');
        return;
    }

    // Populate modal with items
    if (modalItemsList) {
        modalItemsList.innerHTML = '';
        items.forEach((item) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'modal-item';

            const categoryColor = categoryColors[item.category] || '#b8fff2';

            itemDiv.innerHTML = `
                <div class="modal-item-info">
                    <span class="modal-item-text">${item.text}</span>
                    <span class="modal-item-category" style="border-color: ${categoryColor}; background: ${categoryColor}20; color: ${categoryColor}">${item.category.replace('-', ' ')}</span>
                    ${toolLabel(item.page) ? `<span class="modal-item-tool">${toolLabel(item.page)}</span>` : ''}
                </div>
                <div class="modal-item-duration">${item.duration || 0} min</div>
            `;

            modalItemsList.appendChild(itemDiv);
        });
    }

    // Update total time
    const totalMinutes = getTotalSessionMinutes();
    if (modalTotalTime) {
        modalTotalTime.textContent = totalMinutes;
    }

    // Show modal
    if (sessionModal) {
        sessionModal.style.display = 'flex';
    }
}

function closeSessionModal() {
    if (sessionModal) {
        sessionModal.style.display = 'none';
    }
}

function confirmSessionStart() {
    const items = loadPracticeItems();
    if (items.length === 0) {
        closeSessionModal();
        return;
    }

    if (window.CadentSession) window.CadentSession.begin();

    closeSessionModal();
    renderPracticeItems();
}

function startPracticeSession() {
    showSessionModal();
}

function endPracticeSession() {
    if (window.CadentSession) window.CadentSession.end(true);
}

// ── Plan rendering ────────────────────────────────────────────────────────────

function renderPracticeItems() {
    const items = loadPracticeItems();
    practiceItems.innerHTML = '';

    if (items.length === 0) {
        practiceItems.innerHTML = '<p class="empty-state">No practice items planned yet. Add some above!</p>';
    } else {
        const inSession = sessionActive();
        items.forEach((item, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `practice-item ${item.completed ? 'completed' : ''}`;

            const categoryColor = categoryColors[item.category] || '#b8fff2';
            const url = toolUrl(item.page);

            itemDiv.innerHTML = `
                <div class="item-header">
                    <input type="checkbox" class="item-checkbox" data-index="${index}" ${item.completed ? 'checked' : ''} ${inSession ? 'disabled' : ''}>
                    <span class="item-text">${item.text}</span>
                    ${url ? `<a class="item-tool" href="${url}" title="Open ${toolLabel(item.page)}">${toolLabel(item.page)} ↗</a>` : ''}
                    <span class="item-category" style="background-color: ${categoryColor}">${item.category.replace('-', ' ')}</span>
                    ${item.duration ? `<span class="item-duration">${item.duration}min</span>` : ''}
                </div>
                <button class="delete-item" data-index="${index}" ${inSession ? 'style="display: none;"' : ''}>×</button>
            `;

            practiceItems.appendChild(itemDiv);
        });
    }

    updateSummary();
    updateSessionButtons();
}

function updateSummary() {
    const items = loadPracticeItems();
    const total = items.length;
    const completed = items.filter(item => item.completed).length;
    const remaining = total - completed;
    const totalTime = items.reduce((sum, item) => sum + (item.duration || 0), 0);

    summaryTotal.textContent = total;
    summaryCompleted.textContent = completed;
    summaryRemaining.textContent = remaining;
    summaryTime.textContent = totalTime;
}

function resetForm() {
    plannerForm.reset();
}

// Set up all event listeners - called after DOM and header are ready
function setupEventListeners() {
    setupTemplateMenu();

    // The shared session runner fires this on start/end/skip/item-completion
    window.addEventListener('cadent-session-change', () => {
        renderPracticeItems();
    });

    if (plannerForm) {
        plannerForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const item = {
                text: itemInput.value.trim(),
                category: categoryInput.value,
                duration: durationInput.value ? Number(durationInput.value) : null,
                page: pageInput && pageInput.value ? pageInput.value : null,
                completed: false,
                created: new Date().toISOString()
            };

            if (!item.text || !item.category) {
                alert('Please enter a practice item and select a category.');
                return;
            }

            const items = loadPracticeItems();
            items.push(item);
            savePracticeItems(items);

            renderPracticeItems();
            resetForm();
        });
    }

    if (practiceItems) {
        practiceItems.addEventListener('change', (event) => {
            if (event.target.classList.contains('item-checkbox') && !sessionActive()) {
                const index = parseInt(event.target.dataset.index);
                const items = loadPracticeItems();
                if (items[index]) {
                    items[index].completed = event.target.checked;
                    savePracticeItems(items);
                    renderPracticeItems();
                }
            }
        });

        practiceItems.addEventListener('click', (event) => {
            if (event.target.classList.contains('delete-item') && !sessionActive()) {
                const index = parseInt(event.target.dataset.index);
                const items = loadPracticeItems();
                items.splice(index, 1);
                savePracticeItems(items);
                renderPracticeItems();
            }
        });
    }

    if (startSessionButton) {
        startSessionButton.addEventListener('click', startPracticeSession);
    }

    if (endSessionButton) {
        endSessionButton.addEventListener('click', endPracticeSession);
    }

    if (clearCompletedButton) {
        clearCompletedButton.addEventListener('click', () => {
            if (sessionActive()) {
                alert('Cannot clear completed items during an active session. End the session first.');
                return;
            }

            const items = loadPracticeItems();
            const remainingItems = items.filter(item => !item.completed);
            if (remainingItems.length < items.length) {
                savePracticeItems(remainingItems);
                renderPracticeItems();
            }
        });
    }

    if (clearAllButton) {
        clearAllButton.addEventListener('click', () => {
            if (sessionActive()) {
                alert('Cannot clear all items during an active session. End the session first.');
                return;
            }

            if (!confirm('Clear all practice items? This cannot be undone.')) return;
            localStorage.removeItem(STORAGE_KEY);
            renderPracticeItems();
        });
    }

    // Modal button listeners
    if (modalBackBtn) {
        modalBackBtn.addEventListener('click', closeSessionModal);
    }

    if (modalConfirmBtn) {
        modalConfirmBtn.addEventListener('click', confirmSessionStart);
    }

    // Close modal when clicking on backdrop
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', closeSessionModal);
    }
}

// Initialize when DOM is ready
function initializeUI() {
    resetForm();
    renderTemplateMenu();
    renderPracticeItems();
}

// Set up event listeners and UI when document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Give header time to load asynchronously
        setTimeout(() => {
            setupEventListeners();
            initializeUI();
        }, 100);
    });
} else {
    // DOM already loaded (unlikely but handle it)
    setTimeout(() => {
        setupEventListeners();
        initializeUI();
    }, 100);
}
