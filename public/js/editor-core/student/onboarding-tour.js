/**
 * Onboarding Tour — guided tooltip tour for first-time students
 * Shows spotlight + tooltip on key UI elements when explicitly requested.
 * The default editor no longer interrupts first-time writing with an automatic tour.
 */

const LS_KEY = 'skriv_tour_completed';

const DEFAULT_STEPS = [
    { selector: '#editor', text: 'Her skriver du teksten din. Start med a gi dokumentet en tittel.', position: 'bottom' },
    { selector: '#btn-structure', text: 'Velg en skriveramme for a fa hjelp med oppbygningen av teksten.', position: 'bottom' },
    { selector: '#btn-spinner', text: 'Trenger du inspirasjon? Ordspinneren gir deg setningsstartere og synonymer.', position: 'bottom' },
    { selector: '.skriv-editor-toolbar', text: 'Formater teksten med fet, kursiv, overskrifter og lister.', position: 'top' },
    { selector: '#btn-radar', text: 'Gjentakelsesradaren viser ord du bruker for ofte — dobbeltklikk for synonymer.', position: 'bottom' },
    { selector: '#btn-export', text: 'Last ned teksten som PDF, Word eller .txt nar du er ferdig.', position: 'bottom' },
    { selector: null, text: 'Tips: Trykk Ctrl+/ for a se alle tastatursnarveier. Lykke til!', position: 'center' },
];

function createInactiveTourApi(options) {
    let activeTour = null;
    return {
        destroy() {
            activeTour?.destroy();
            activeTour = null;
        },
        skip() {
            localStorage.setItem(LS_KEY, 'true');
            activeTour?.destroy();
            activeTour = null;
        },
        restart() {
            activeTour?.destroy();
            localStorage.removeItem(LS_KEY);
            activeTour = initOnboardingTour({ ...options, autoStart: true, force: true });
            return activeTour;
        },
    };
}

export function initOnboardingTour(options = {}) {
    // Tours are opt-in. Call with { autoStart: true } or use restart() from a
    // deliberate Help action; simply initializing the editor stays interruption-free.
    if (options.autoStart !== true || (!options.force && localStorage.getItem(LS_KEY))) {
        return createInactiveTourApi(options);
    }

    const steps = options.steps || DEFAULT_STEPS;
    let currentStep = 0;
    let backdrop = null;
    let spotlight = null;
    let tooltip = null;
    let styleEl = null;
    let resizeHandler = null;
    let startTimerId = null;

    // --- Inject styles ---
    styleEl = document.createElement('style');
    styleEl.textContent = `
        .skriv-tour-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.55);
            z-index: 9997;
            transition: opacity 0.3s;
            opacity: 0;
        }
        .skriv-tour-backdrop.visible { opacity: 1; }

        .skriv-tour-spotlight {
            position: fixed;
            border-radius: 8px;
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.55);
            z-index: 9998;
            pointer-events: none;
            transition: top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease;
        }

        .skriv-tour-tooltip {
            position: fixed;
            z-index: 9999;
            background: #fff;
            border-radius: 12px;
            padding: 1rem 1.25rem;
            max-width: 320px;
            min-width: 220px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.22);
            pointer-events: auto;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.25s, transform 0.25s;
        }
        .skriv-tour-tooltip.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .skriv-tour-tooltip::before {
            content: '';
            position: absolute;
            width: 12px;
            height: 12px;
            background: #fff;
            transform: rotate(45deg);
        }
        .skriv-tour-tooltip.arrow-top::before {
            top: -6px;
            left: 50%;
            margin-left: -6px;
        }
        .skriv-tour-tooltip.arrow-bottom::before {
            bottom: -6px;
            left: 50%;
            margin-left: -6px;
        }
        .skriv-tour-tooltip.arrow-none::before {
            display: none;
        }

        .skriv-tour-dots {
            display: flex;
            gap: 5px;
            justify-content: center;
            margin-bottom: 0.6rem;
        }
        .skriv-tour-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #d6d3d1;
            transition: background 0.2s;
        }
        .skriv-tour-dot.active { background: #059669; }

        .skriv-tour-text {
            margin: 0 0 0.75rem;
            font-size: 0.875rem;
            color: #1c1917;
            line-height: 1.55;
        }

        .skriv-tour-buttons {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .skriv-tour-skip {
            font-size: 0.75rem;
            color: #78716c;
            background: none;
            border: none;
            cursor: pointer;
            padding: 0.25rem 0.5rem;
        }
        .skriv-tour-skip:hover { color: #44403c; }

        .skriv-tour-next {
            font-size: 0.8rem;
            font-weight: 500;
            padding: 0.4rem 1rem;
            background: #059669;
            color: #fff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.15s;
        }
        .skriv-tour-next:hover { background: #047857; }

        @media (prefers-reduced-motion: reduce) {
            .skriv-tour-backdrop,
            .skriv-tour-spotlight,
            .skriv-tour-tooltip,
            .skriv-tour-dot,
            .skriv-tour-next {
                transition: none;
            }
        }
    `;
    document.head.appendChild(styleEl);

    // --- Create DOM elements ---
    backdrop = document.createElement('div');
    backdrop.className = 'skriv-tour-backdrop';
    document.body.appendChild(backdrop);

    spotlight = document.createElement('div');
    spotlight.className = 'skriv-tour-spotlight';
    document.body.appendChild(spotlight);

    tooltip = document.createElement('div');
    tooltip.className = 'skriv-tour-tooltip';
    document.body.appendChild(tooltip);

    // Fade in
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    // --- Positioning logic ---
    const PADDING = 8;
    const GAP = 12;

    function positionSpotlight(rect) {
        spotlight.style.top = (rect.top - PADDING) + 'px';
        spotlight.style.left = (rect.left - PADDING) + 'px';
        spotlight.style.width = (rect.width + PADDING * 2) + 'px';
        spotlight.style.height = (rect.height + PADDING * 2) + 'px';
        spotlight.style.display = 'block';
    }

    function positionTooltip(rect, position) {
        tooltip.classList.remove('arrow-top', 'arrow-bottom', 'arrow-none');

        // Reset for measurement
        tooltip.style.top = '0';
        tooltip.style.left = '0';
        tooltip.style.visibility = 'hidden';
        tooltip.style.display = 'block';

        const tipRect = tooltip.getBoundingClientRect();
        let top, left;

        if (position === 'center' || !rect) {
            // Center on screen
            top = (window.innerHeight - tipRect.height) / 2;
            left = (window.innerWidth - tipRect.width) / 2;
            tooltip.classList.add('arrow-none');
        } else if (position === 'bottom') {
            top = rect.bottom + PADDING + GAP;
            left = rect.left + rect.width / 2 - tipRect.width / 2;
            tooltip.classList.add('arrow-top');
        } else {
            // top
            top = rect.top - PADDING - GAP - tipRect.height;
            left = rect.left + rect.width / 2 - tipRect.width / 2;
            tooltip.classList.add('arrow-bottom');
        }

        // Clamp horizontal
        if (left < 12) left = 12;
        if (left + tipRect.width > window.innerWidth - 12) {
            left = window.innerWidth - tipRect.width - 12;
        }

        // Flip vertical if off-screen
        if (top < 12 && position === 'top') {
            top = rect.bottom + PADDING + GAP;
            tooltip.classList.remove('arrow-bottom');
            tooltip.classList.add('arrow-top');
        }
        if (top + tipRect.height > window.innerHeight - 12 && position === 'bottom') {
            top = rect.top - PADDING - GAP - tipRect.height;
            tooltip.classList.remove('arrow-top');
            tooltip.classList.add('arrow-bottom');
        }

        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.style.visibility = '';
    }

    // --- Render step ---
    function showStep(index) {
        const step = steps[index];
        if (!step) { complete(); return; }

        let targetEl = null;
        let rect = null;

        if (step.selector) {
            targetEl = document.querySelector(step.selector);
            if (!targetEl) {
                // Element not found — skip this step
                currentStep++;
                showStep(currentStep);
                return;
            }
            rect = targetEl.getBoundingClientRect();
            positionSpotlight(rect);
        } else {
            // No target — hide spotlight, center tooltip
            spotlight.style.display = 'none';
        }

        // Build tooltip content
        const isLast = index === steps.length - 1;
        const dots = steps.map((_, i) =>
            `<div class="skriv-tour-dot${i === index ? ' active' : ''}"></div>`
        ).join('');

        tooltip.innerHTML = `
            <div class="skriv-tour-dots">${dots}</div>
            <p class="skriv-tour-text">${step.text}</p>
            <div class="skriv-tour-buttons">
                <button class="skriv-tour-skip">${isLast ? '' : 'Hopp over'}</button>
                <button class="skriv-tour-next">${isLast ? 'Ferdig' : 'Neste'}</button>
            </div>
        `;

        // Position tooltip
        positionTooltip(rect, step.position);

        // Animate in
        tooltip.classList.remove('visible');
        requestAnimationFrame(() => tooltip.classList.add('visible'));

        // Button handlers
        const nextBtn = tooltip.querySelector('.skriv-tour-next');
        const skipBtn = tooltip.querySelector('.skriv-tour-skip');

        nextBtn.addEventListener('click', nextStep);
        if (!isLast) {
            skipBtn.addEventListener('click', skip);
        }
    }

    function nextStep() {
        currentStep++;
        if (currentStep >= steps.length) {
            complete();
        } else {
            showStep(currentStep);
        }
    }

    function complete() {
        localStorage.setItem(LS_KEY, 'true');
        cleanup();
    }

    function skip() {
        localStorage.setItem(LS_KEY, 'true');
        cleanup();
    }

    function cleanup() {
        if (startTimerId) {
            clearTimeout(startTimerId);
            startTimerId = null;
        }
        if (backdrop) { backdrop.remove(); backdrop = null; }
        if (spotlight) { spotlight.remove(); spotlight = null; }
        if (tooltip) { tooltip.remove(); tooltip = null; }
        if (styleEl) { styleEl.remove(); styleEl = null; }
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
    }

    // Reposition on resize
    resizeHandler = () => {
        if (steps[currentStep]) showStep(currentStep);
    };
    window.addEventListener('resize', resizeHandler);

    // Start tour after editor has rendered
    const delay = options.delay != null ? options.delay : 600;
    startTimerId = setTimeout(() => {
        startTimerId = null;
        showStep(0);
    }, delay);

    // Public API
    return {
        destroy: cleanup,
        skip,
        restart() {
            localStorage.removeItem(LS_KEY);
            currentStep = 0;
            // Re-inject if cleaned up
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.textContent = document.querySelector('.skriv-tour-backdrop') ? '' : '';
                // Full re-init is simpler
                return initOnboardingTour(options);
            }
            showStep(0);
        }
    };
}
