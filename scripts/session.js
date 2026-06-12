// Shared practice-session runner.
//
// Drives the session bar that the header component injects on every page:
// timer, segmented progress, current item with its tool-page link, skip and
// end controls, and optional auto-switching to each item's recommended page.
// The Practice Planner (tracker.js) builds the plan; this script runs it, so
// a session keeps going while the user moves between Cadent's tool pages.

(function () {
    const STORAGE_KEY = 'cadentPracticePlanner';
    const SESSION_KEY = 'cadentPracticeSession';
    const AUTO_KEY    = 'cadentAutoSwitchTool';

    const IS_PAGE_FOLDER = window.location.pathname.includes('/pages/');

    // Tool pages a practice item can point at via its `page` key
    const TOOL_PAGES = {
        metronome: { label: 'Metronome',    file: 'metronome.html' },
        chords:    { label: 'Chord Player', file: 'chords.html' },
        fretboard: { label: 'Fretboard',    file: 'fretboard.html' },
        tuner:     { label: 'Tuner',        file: 'tuner.html' },
        resources: { label: 'Resources',    file: 'resources.html' },
    };

    function toolUrl(pageKey) {
        const tool = TOOL_PAGES[pageKey];
        if (!tool) return null;
        return IS_PAGE_FOLDER ? tool.file : `pages/${tool.file}`;
    }

    function currentPageKey() {
        const file = window.location.pathname.split('/').pop() || 'index.html';
        return file.replace('.html', '');
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let els     = null;   // header bar elements, grabbed once the header is injected
    let wired   = false;
    let active  = false;
    let running = false;
    let startTime   = null;   // Date.now() baseline while the timer runs
    let elapsed     = 0;      // seconds into the session
    let prevSegment = -1;
    let complete    = false;
    let tickId      = null;

    function loadItems() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
        catch { return []; }
    }
    function saveItems(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

    function loadState() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
        catch { return null; }
    }
    function saveState() {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            isActive: active,
            startTime: startTime,
            elapsedTime: elapsed,
            isTimerRunning: running,
        }));
    }
    function clearState() { localStorage.removeItem(SESSION_KEY); }

    function autoSwitchEnabled() { return localStorage.getItem(AUTO_KEY) === 'true'; }

    // Other scripts (the planner page) listen for this to re-render their UI
    function notifyChange() {
        window.dispatchEvent(new CustomEvent('cadent-session-change'));
    }

    // ── Time helpers ──────────────────────────────────────────────────────────
    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    function formatMinutes(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // Plan items mapped to time windows: [{ start, end, item }] in seconds
    function segmentBounds() {
        let t = 0;
        return loadItems().map(item => {
            const start = t;
            t += (item.duration || 0) * 60;
            return { start, end: t, item };
        });
    }
    function totalSeconds() {
        const segs = segmentBounds();
        return segs.length ? segs[segs.length - 1].end : 0;
    }
    function segmentAt(time) {
        const segs = segmentBounds();
        for (let i = 0; i < segs.length; i++) {
            if (time >= segs[i].start && time < segs[i].end) return i;
        }
        return -1;
    }

    // ── Header bar rendering ──────────────────────────────────────────────────
    function grabEls() {
        const bar = document.getElementById('current-routine');
        if (!bar) return false;
        els = {
            bar,
            progress:   document.getElementById('session-progress'),
            elapsed:    document.getElementById('progress-elapsed'),
            total:      document.getElementById('progress-total'),
            timer:      document.getElementById('session-timer'),
            toggle:     document.getElementById('timer-toggle'),
            endBtn:     document.getElementById('timer-end-btn'),
            itemText:   document.getElementById('current-item-text'),
            itemLink:   document.getElementById('current-item-link'),
            next:       document.getElementById('next-item'),
            autoSwitch: document.getElementById('auto-switch-tool'),
        };
        return true;
    }

    function ensureEls() {
        if (els) return true;
        if (!grabEls()) return false;
        if (!wired) {
            wireControls();
            wired = true;
        }
        return true;
    }

    // Keeps the toggle's text and its mobile icon (data-icon) in step
    function setToggleLabel(label) {
        els.toggle.textContent = label;
        els.toggle.dataset.icon = label === 'Pause' ? '❚❚' : '▶';
    }

    function showBar() {
        els.bar.style.display = 'flex';
        els.endBtn.style.display = 'inline-block';   // always available during a session
        els.toggle.style.display = 'inline-block';
        els.next.disabled = false;
        els.progress.parentElement.classList.remove('session-complete');
        els.autoSwitch.checked = autoSwitchEnabled();
    }
    function hideBar() {
        els.bar.style.display = 'none';
    }

    function renderSegments() {
        els.progress.innerHTML = '';
        loadItems().forEach((item, index) => {
            const segment = document.createElement('div');
            segment.className = 'progress-segment';
            segment.dataset.index = index;
            segment.dataset.color = index % 6;
            segment.title = `${item.text} (${item.duration || 0} min)`;
            segment.innerHTML = '<div class="segment-background"></div><div class="segment-fill"></div>';
            els.progress.appendChild(segment);
        });
    }

    function updateCurrentItem(segIdx, segs = segmentBounds()) {
        if (segIdx < 0 || !segs[segIdx]) return;
        const item = segs[segIdx].item;
        els.itemText.textContent = item.text;

        const url = toolUrl(item.page);
        if (url && currentPageKey() !== item.page) {
            els.itemLink.href = url;
            els.itemLink.textContent = `Open ${TOOL_PAGES[item.page].label} ↗`;
            els.itemLink.style.display = 'inline';
        } else {
            els.itemLink.style.display = 'none';
        }
    }

    function flash(index) {
        const segment = els.progress.querySelector(`[data-index="${index}"]`);
        if (!segment) return;
        segment.classList.remove('flash-complete');
        void segment.offsetWidth;   // restart the animation
        segment.classList.add('flash-complete');
    }

    function markCompletedUpTo(index) {
        const items = loadItems();
        let changed = false;
        for (let i = 0; i <= index && i < items.length; i++) {
            if (!items[i].completed) {
                items[i].completed = true;
                changed = true;
            }
        }
        if (changed) {
            saveItems(items);
            notifyChange();
        }
    }

    function maybeAutoSwitch(item) {
        if (!autoSwitchEnabled()) return;
        const url = toolUrl(item.page);
        if (url && currentPageKey() !== item.page) {
            saveState();
            window.location.href = url;
        }
    }

    function updateBar() {
        // Runs twice a second — compute the segment list once and reuse it
        const segs  = segmentBounds();
        const total = segs.length ? segs[segs.length - 1].end : 0;

        els.timer.textContent   = formatTime(elapsed);
        els.elapsed.textContent = formatMinutes(Math.min(elapsed, total));
        els.total.textContent   = formatMinutes(total);

        let segIdx = -1;
        segs.forEach((seg, index) => {
            const el = els.progress.querySelector(`[data-index="${index}"]`);
            if (!el) return;
            const len = seg.end - seg.start;
            let pct = 0;
            if (elapsed >= seg.end) pct = 100;
            else if (elapsed > seg.start && len > 0) pct = ((elapsed - seg.start) / len) * 100;
            el.querySelector('.segment-fill').style.width = pct + '%';

            const isActiveSeg = elapsed >= seg.start && elapsed < seg.end;
            el.classList.toggle('active', isActiveSeg);
            if (isActiveSeg) segIdx = index;
        });

        // Live segment transition: complete what came before, then move on
        if (segIdx !== prevSegment && segIdx >= 0) {
            if (prevSegment >= 0 && segIdx > prevSegment) {
                markCompletedUpTo(segIdx - 1);
                flash(prevSegment);
            }
            prevSegment = segIdx;
            updateCurrentItem(segIdx, segs);
            maybeAutoSwitch(segs[segIdx].item);
        }

        if (!complete && total > 0 && elapsed >= total) onComplete();
    }

    function onComplete() {
        complete = true;
        stopTicking();
        running = false;
        elapsed = totalSeconds();
        markCompletedUpTo(loadItems().length - 1);

        els.timer.textContent = formatTime(elapsed);
        els.itemText.textContent = 'Session complete! 🎉';
        els.itemLink.style.display = 'none';
        els.next.disabled = true;
        els.toggle.style.display = 'none';
        els.progress.parentElement.classList.add('session-complete');
        saveState();
    }

    // ── Timer ─────────────────────────────────────────────────────────────────
    function tick() {
        elapsed = Math.floor((Date.now() - startTime) / 1000);
        updateBar();
    }
    function stopTicking() {
        if (tickId) {
            clearInterval(tickId);
            tickId = null;
        }
    }

    function startTimer() {
        if (running || complete) return;
        const wasAtZero = elapsed === 0;
        running = true;
        startTime = Date.now() - elapsed * 1000;
        tickId = setInterval(tick, 500);
        setToggleLabel('Pause');
        els.toggle.classList.add('active');
        saveState();

        // Kicking off the session counts as entering the first stage
        if (wasAtZero) {
            const segs = segmentBounds();
            const idx = segmentAt(0);
            if (idx >= 0) maybeAutoSwitch(segs[idx].item);
        }
    }

    function pauseTimer() {
        if (running) elapsed = Math.floor((Date.now() - startTime) / 1000);
        running = false;
        stopTicking();
        setToggleLabel(elapsed > 0 ? 'Resume' : 'Start');
        els.toggle.classList.remove('active');
        saveState();
    }

    // Skip to the start of the next segment, completing the current one
    function skip() {
        if (!active || complete) return;
        const segs = segmentBounds();
        const idx = segmentAt(elapsed);
        if (idx < 0) return;
        elapsed = segs[idx].end;
        if (running) startTime = Date.now() - elapsed * 1000;
        markCompletedUpTo(idx);
        updateBar();
        saveState();
    }

    // ── Session lifecycle ─────────────────────────────────────────────────────
    function begin() {
        stopTicking();   // in case a previous session's timer is still running
        active = true;
        running = false;
        complete = false;
        elapsed = 0;
        startTime = null;
        prevSegment = -1;
        saveState();

        if (!ensureEls()) return;
        showBar();
        renderSegments();
        setToggleLabel('Start');
        els.toggle.classList.remove('active');
        prevSegment = segmentAt(0);
        updateCurrentItem(prevSegment);
        updateBar();
        notifyChange();
    }

    function end(askConfirm) {
        if (askConfirm && !confirm('End the current practice session?')) return;
        active = false;
        running = false;
        complete = false;
        stopTicking();
        elapsed = 0;
        startTime = null;
        prevSegment = -1;
        clearState();
        if (els) hideBar();
        notifyChange();
    }

    function wireControls() {
        els.toggle.addEventListener('click', () => {
            if (running) pauseTimer();
            else startTimer();
        });
        els.next.addEventListener('click', skip);
        els.endBtn.addEventListener('click', () => end(true));
        els.autoSwitch.addEventListener('change', () => {
            localStorage.setItem(AUTO_KEY, els.autoSwitch.checked);
        });
    }

    // Resume a session persisted by a previous page (or page load)
    function init() {
        if (!ensureEls()) return;

        const state = loadState();
        if (!state || !state.isActive) return;

        active  = true;
        elapsed = state.elapsedTime || 0;
        if (state.isTimerRunning && state.startTime) {
            startTime = state.startTime;
            elapsed = Math.floor((Date.now() - startTime) / 1000);
        }

        showBar();
        renderSegments();

        // Pre-set the segment so loading a page never triggers an auto-switch
        prevSegment = segmentAt(elapsed);
        updateCurrentItem(prevSegment);
        updateBar();

        if (complete) {
            // updateBar() detected an already-finished session
        } else if (state.isTimerRunning && state.startTime) {
            running = true;
            tickId = setInterval(tick, 500);
            setToggleLabel('Pause');
            els.toggle.classList.add('active');
        } else {
            setToggleLabel(elapsed > 0 ? 'Resume' : 'Start');
        }

        notifyChange();
    }

    // Public API for the planner page
    window.CadentSession = {
        isActive: () => active,
        begin,
        end,
        toolUrl,
        toolLabel: (pageKey) => (TOOL_PAGES[pageKey] ? TOOL_PAGES[pageKey].label : null),
    };

    // The header is fetched and injected asynchronously
    if (document.getElementById('current-routine')) {
        init();
    } else {
        document.addEventListener('cadent-header-ready', init);
    }
})();
