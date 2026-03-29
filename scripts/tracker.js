// Helper function to safely get DOM elements
function getElement(id) {
    return document.getElementById(id);
}

// Main DOM references (non-header elements, always exist)
const plannerForm = getElement('planner-form');
const itemInput = getElement('practice-item');
const categoryInput = getElement('practice-category');
const durationInput = getElement('practice-duration');
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

// Header elements (loaded asynchronously, check before use)
let currentRoutine = null;
let sessionTimer = null;
let timerToggle = null;
let timerEndBtn = null;
let currentItemText = null;
let nextItemBtn = null;
let sessionProgress = null;
let progressElapsed = null;
let progressTotal = null;

function updateHeaderReferences() {
    currentRoutine = getElement('current-routine');
    sessionTimer = getElement('session-timer');
    timerToggle = getElement('timer-toggle');
    timerEndBtn = getElement('timer-end-btn');
    currentItemText = getElement('current-item-text');
    nextItemBtn = getElement('next-item');
    sessionProgress = getElement('session-progress');
    progressElapsed = getElement('progress-elapsed');
    progressTotal = getElement('progress-total');
}

const STORAGE_KEY = 'cadentPracticePlanner';
const SESSION_KEY = 'cadentPracticeSession';

// Session state
let currentItemIndex = 0;
let sessionStartTime = null;
let sessionElapsedTime = 0;
let timerInterval = null;
let isTimerRunning = false;
let isSessionActive = false;
let previousSegmentIndex = -1; // Track previous segment for completion detection
let isSessionTimeComplete = false; // Track if total session time has been reached

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

function loadSessionState() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Invalid session data', e);
        return null;
    }
}

function saveSessionState(state) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        ...state,
        isTimerRunning: isTimerRunning
    }));
}

function clearSessionState() {
    localStorage.removeItem(SESSION_KEY);
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatMinutes(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function getTotalSessionMinutes() {
    const items = loadPracticeItems();
    return items.reduce((total, item) => total + (item.duration || 0), 0);
}

function renderProgressSegments() {
    if (!sessionProgress) return;
    
    const items = loadPracticeItems();
    sessionProgress.innerHTML = ''; // Clear existing segments
    
    const totalMinutes = getTotalSessionMinutes();
    const totalSeconds = totalMinutes * 60;
    
    if (totalSeconds === 0) return;
    
    const colors = ['0', '1', '2', '3', '4', '5']; // Color variant indices
    
    items.forEach((item, index) => {
        const segment = document.createElement('div');
        segment.className = 'progress-segment';
        segment.setAttribute('data-index', index);
        segment.setAttribute('data-color', colors[index % colors.length]);
        segment.title = `${item.text} (${item.duration || 0} min)`;
        
        // Create background
        const background = document.createElement('div');
        background.className = 'segment-background';
        
        // Create fill
        const fill = document.createElement('div');
        fill.className = 'segment-fill';
        
        segment.appendChild(background);
        segment.appendChild(fill);
        sessionProgress.appendChild(segment);
    });
}

function updateProgressBar() {
    if (!sessionProgress || !progressElapsed || !progressTotal || !isSessionActive) {
        return;
    }

    const totalMinutes = getTotalSessionMinutes();
    const totalSeconds = totalMinutes * 60;

    // Update progress text
    progressElapsed.textContent = formatMinutes(sessionElapsedTime);
    progressTotal.textContent = formatMinutes(totalSeconds);

    // Check if session time is complete
    if (sessionElapsedTime >= totalSeconds && !isSessionTimeComplete) {
        isSessionTimeComplete = true;
        
        // Show End Session button and hide Pause button
        if (timerToggle) {
            timerToggle.style.display = 'none';
        }
        if (timerEndBtn) {
            timerEndBtn.style.display = 'block';
        }
        
        // Trigger session complete animation
        const progressContainer = sessionProgress.parentElement;
        if (progressContainer) {
            progressContainer.classList.add('session-complete');
        }
    }

    // Determine which segment is active and update fill progress
    const items = loadPracticeItems();
    let elapsedInSegments = 0;
    let newSegmentIndex = -1;
    
    items.forEach((item, index) => {
        const itemSeconds = (item.duration || 0) * 60;
        const segmentStart = elapsedInSegments;
        const segmentEnd = elapsedInSegments + itemSeconds;
        
        const segment = sessionProgress.querySelector(`[data-index="${index}"]`);
        if (segment) {
            const fill = segment.querySelector('.segment-fill');
            
            // Calculate fill percentage for this segment
            let fillPercentage = 0;
            if (sessionElapsedTime >= segmentEnd) {
                // Segment is complete
                fillPercentage = 100;
            } else if (sessionElapsedTime > segmentStart) {
                // Segment is partially complete
                fillPercentage = ((sessionElapsedTime - segmentStart) / itemSeconds) * 100;
            }
            // else segment hasn't started, fillPercentage stays 0
            
            if (fill) {
                fill.style.width = fillPercentage + '%';
            }
            
            // Check if we're currently in this segment
            if (sessionElapsedTime >= segmentStart && sessionElapsedTime < segmentEnd) {
                segment.classList.add('active');
                newSegmentIndex = index; // Update current item index
                currentItemIndex = index;
            } else {
                segment.classList.remove('active');
            }
        }
        
        elapsedInSegments = segmentEnd;
    });

    // Detect segment transitions for flash effect
    if (previousSegmentIndex !== newSegmentIndex && previousSegmentIndex >= 0 && newSegmentIndex >= 0) {
        // We've moved to a new segment, trigger flash on the completed segment
        const completedSegment = sessionProgress.querySelector(`[data-index="${previousSegmentIndex}"]`);
        if (completedSegment) {
            completedSegment.classList.remove('flash-complete');
            // Trigger reflow to restart animation
            void completedSegment.offsetWidth;
            completedSegment.classList.add('flash-complete');
        }
    }
    previousSegmentIndex = newSegmentIndex;
}

function updateTimer() {
    if (isTimerRunning) {
        sessionElapsedTime = Math.floor((Date.now() - sessionStartTime) / 1000);
        sessionTimer.textContent = formatTime(sessionElapsedTime);
        updateProgressBar();
    }
}

function startTimer() {
    if (!isTimerRunning) {
        isTimerRunning = true;
        sessionStartTime = Date.now() - (sessionElapsedTime * 1000);
        timerInterval = setInterval(updateTimer, 1000);
        timerToggle.textContent = 'Pause';
        timerToggle.classList.add('active');
    }
}

function pauseTimer() {
    if (isTimerRunning) {
        isTimerRunning = false;
        clearInterval(timerInterval);
        timerInterval = null;
        timerToggle.textContent = 'Resume';
        timerToggle.classList.remove('active');
    }
}

function resetTimer() {
    isTimerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    sessionElapsedTime = 0;
    sessionTimer.textContent = '00:00:00';
    timerToggle.textContent = 'Start';
    timerToggle.classList.remove('active');
}

function getCurrentItem() {
    const items = loadPracticeItems();
    if (items.length === 0) return null;

    // Find the first incomplete item
    const incompleteItem = items.find(item => !item.completed);
    if (incompleteItem) {
        currentItemIndex = items.indexOf(incompleteItem);
        return incompleteItem;
    }

    // If all items are complete, return the last item
    currentItemIndex = items.length - 1;
    return items[currentItemIndex];
}

function updateCurrentRoutine() {
    const items = loadPracticeItems();
    const currentItem = getCurrentItem();

    if (!isSessionActive || items.length === 0 || !currentItem) {
        currentRoutine.style.display = 'none';
        return;
    }

    currentRoutine.style.display = 'flex';
    currentItemText.textContent = currentItem.text;

    // Update next button state
    const hasNextIncomplete = items.slice(currentItemIndex + 1).some(item => !item.completed);
    nextItemBtn.disabled = !hasNextIncomplete;
}

function updateSessionButtons() {
    const items = loadPracticeItems();
    const hasItems = items.length > 0;

    startSessionButton.style.display = hasItems && !isSessionActive ? 'inline-block' : 'none';
    endSessionButton.style.display = isSessionActive ? 'inline-block' : 'none';
}

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

            const categoryColors = {
                'scales': '#a5ffcb',
                'technique': '#60ff97',
                'repertoire': '#99ff66',
                'theory': '#ffff66',
                'ear-training': '#ffcc66',
                'sight-reading': '#ff9966',
                'other': '#b8fff2'
            };

            const categoryColor = categoryColors[item.category] || '#b8fff2';

            itemDiv.innerHTML = `
                <div class="modal-item-info">
                    <span class="modal-item-text">${item.text}</span>
                    <span class="modal-item-category" style="border-color: ${categoryColor}; background: ${categoryColor}20; color: ${categoryColor}">${item.category.replace('-', ' ')}</span>
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

    isSessionActive = true;
    currentItemIndex = 0;
    previousSegmentIndex = -1; // Reset segment tracking
    isSessionTimeComplete = false; // Reset time completion flag

    // Reset any previous session state
    resetTimer();

    // Reset button visibility
    if (timerToggle) {
        timerToggle.style.display = 'block';
    }
    if (timerEndBtn) {
        timerEndBtn.style.display = 'none';
    }

    // Render progress segments
    renderProgressSegments();

    // Save session state
    saveSessionState({
        isActive: true,
        startTime: null, // Timer not started yet
        elapsedTime: 0,
        currentIndex: 0
    });

    updateCurrentRoutine();
    updateProgressBar();
    updateSessionButtons();

    // Close modal
    closeSessionModal();
}

function startPracticeSession() {
    showSessionModal();
}

function endPracticeSession() {
    if (!confirm('End the current practice session?')) return;

    isSessionActive = false;
    isSessionTimeComplete = false;
    resetTimer();
    clearSessionState();

    // Reset button visibility
    if (timerToggle) {
        timerToggle.style.display = 'block';
    }
    if (timerEndBtn) {
        timerEndBtn.style.display = 'none';
    }

    // Reset progress bar
    if (sessionProgress) {
        sessionProgress.innerHTML = '';
        const progressContainer = sessionProgress.parentElement;
        if (progressContainer) {
            progressContainer.classList.remove('session-complete');
        }
    }

    updateCurrentRoutine();
    updateSessionButtons();
}

function renderPracticeItems() {
    const items = loadPracticeItems();
    practiceItems.innerHTML = '';

    if (items.length === 0) {
        practiceItems.innerHTML = '<p class="empty-state">No practice items planned yet. Add some above!</p>';
    } else {
        items.forEach((item, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `practice-item ${item.completed ? 'completed' : ''}`;

            const categoryColors = {
                'scales': '#a5ffcb',
                'technique': '#60ff97',
                'repertoire': '#99ff66',
                'theory': '#ffff66',
                'ear-training': '#ffcc66',
                'sight-reading': '#ff9966',
                'other': '#b8fff2'
            };

            const categoryColor = categoryColors[item.category] || '#b8fff2';

            itemDiv.innerHTML = `
                <div class="item-header">
                    <input type="checkbox" class="item-checkbox" data-index="${index}" ${item.completed ? 'checked' : ''} ${isSessionActive ? 'disabled' : ''}>
                    <span class="item-text">${item.text}</span>
                    <span class="item-category" style="background-color: ${categoryColor}">${item.category.replace('-', ' ')}</span>
                    ${item.duration ? `<span class="item-duration">${item.duration}min</span>` : ''}
                </div>
                <button class="delete-item" data-index="${index}" ${isSessionActive ? 'style="display: none;"' : ''}>×</button>
            `;

            practiceItems.appendChild(itemDiv);
        });
    }

    updateSummary();
    updateCurrentRoutine();
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

// Initialize session state on page load
function initializeSession() {
    const sessionState = loadSessionState();
    if (sessionState && sessionState.isActive) {
        isSessionActive = true;
        sessionElapsedTime = sessionState.elapsedTime || 0;
        currentItemIndex = sessionState.currentIndex || 0;

        // Render progress segments for resumed session
        renderProgressSegments();

        // Resume timer state
        if (sessionState.startTime) {
            sessionStartTime = sessionState.startTime;
            if (sessionState.isTimerRunning) {
                startTimer();
            } else {
                // Timer was paused, update display but don't start
                sessionTimer.textContent = formatTime(sessionElapsedTime);
                timerToggle.textContent = 'Resume';
            }
        }

        updateCurrentRoutine();
        updateProgressBar();
    }
    updateSessionButtons();
}

// Set up all event listeners - called after DOM and header are ready
function setupEventListeners() {
    // Update header references (in case they were loaded after initial script load)
    updateHeaderReferences();

    if (plannerForm) {
        plannerForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const item = {
                text: itemInput.value.trim(),
                category: categoryInput.value,
                duration: durationInput.value ? Number(durationInput.value) : null,
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
            if (event.target.classList.contains('item-checkbox') && !isSessionActive) {
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
            if (event.target.classList.contains('delete-item') && !isSessionActive) {
                const index = parseInt(event.target.dataset.index);
                const items = loadPracticeItems();
                items.splice(index, 1);
                savePracticeItems(items);
                renderPracticeItems();
            }
        });
    }

    if (timerToggle) {
        timerToggle.addEventListener('click', () => {
            if (isTimerRunning) {
                pauseTimer();
            } else {
                startTimer();
            }

            // Save session state
            saveSessionState({
                isActive: isSessionActive,
                startTime: sessionStartTime,
                elapsedTime: sessionElapsedTime,
                currentIndex: currentItemIndex
            });
        });
    }

    if (nextItemBtn) {
        nextItemBtn.addEventListener('click', () => {
            const items = loadPracticeItems();
            const currentItem = getCurrentItem();

            if (currentItem && !currentItem.completed) {
                // Mark current item as completed
                const currentIndex = items.indexOf(currentItem);
                items[currentIndex].completed = true;
                savePracticeItems(items);
            }

            // Move to next incomplete item
            renderPracticeItems();

            // Save session state
            saveSessionState({
                isActive: isSessionActive,
                startTime: sessionStartTime,
                elapsedTime: sessionElapsedTime,
                currentIndex: currentItemIndex
            });
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
            if (isSessionActive) {
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
            if (isSessionActive) {
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

    if (timerEndBtn) {
        timerEndBtn.addEventListener('click', endPracticeSession);
    }

    // Close modal when clicking on backdrop
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', closeSessionModal);
    }
}

// Initialize when DOM is ready
function initializeUI() {
    resetForm();
    renderPracticeItems();
    initializeSession();
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
