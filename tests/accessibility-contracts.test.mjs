import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initOnboardingTour } from '../public/js/editor-core/student/onboarding-tour.js';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('frame guide uses semantic accordion controls and mobile-only overlay behavior', async () => {
    const source = await readSource('../public/js/editor-core/student/frame-guide.js');

    assert.match(source, /const header = document\.createElement\('button'\)/);
    assert.match(source, /const subHeader = document\.createElement\('button'\)/);
    assert.match(source, /setAttribute\('aria-expanded'/);
    assert.match(source, /setAttribute\('aria-controls'/);
    assert.match(source, /window\.matchMedia\('\(min-width: 769px\)'\)/);
    assert.match(source, /panelVisible && useSideBySideLayout/);
    assert.match(source, /container\.style\.paddingLeft = panelVisible && useSideBySideLayout/);
    assert.doesNotMatch(source, /editor\.style\.marginLeft = panelVisible/);
});

test('floating toolbar is localized and exposes roving keyboard navigation', async () => {
    const source = await readSource('../public/js/editor-core/student/editor-toolbar.js');

    assert.match(source, /t\('editorToolbar\.label'\)/);
    assert.match(source, /setToolbarTabStop\(btnBold\)/);
    assert.match(source, /e\.key === 'ArrowRight'/);
    assert.match(source, /e\.key === 'Escape'/);
    assert.doesNotMatch(source, /setAttribute\('aria-label', 'Formatting'\)/);
});

test('mobile editor actions have compact visual labels and stable accessible names', async () => {
    const [writer, css] = await Promise.all([
        readSource('../public/js/app/standalone-writer.js'),
        readSource('../public/css/main.css'),
    ]);

    assert.match(writer, /id="btn-structure"[^>]+aria-label=/);
    assert.match(writer, /id="btn-insights"[^>]+aria-label=/);
    assert.match(writer, /id="btn-leksihjelp"[^>]+aria-label=/);
    assert.match(writer, /id="btn-export"[^>]+aria-label=/);
    assert.match(writer, /class="btn-label"/);
    assert.match(css, /#btn-export \.btn-label\s*\{\s*display: none/);
    assert.match(css, /\.skriv-leksihjelp \.lh-lang-hint\s*\{[^}]*left: 8px !important;[^}]*right: 8px !important;/s);
});

test('motivational metrics and onboarding tour are opt-in defaults', async () => {
    const [progress, tour] = await Promise.all([
        readSource('../public/js/editor-core/student/writing-progress.js'),
        readSource('../public/js/editor-core/student/onboarding-tour.js'),
    ]);

    assert.match(progress, /options\.showPace === true/);
    assert.match(progress, /options\.showStreak === true/);
    assert.match(tour, /options\.autoStart !== true/);
});

test('default onboarding initialization is interruption-free and needs no DOM', () => {
    const api = initOnboardingTour();
    assert.equal(typeof api.destroy, 'function');
    assert.equal(typeof api.restart, 'function');
    api.destroy();
});

test('main stylesheet contains a reduced-motion fallback', async () => {
    const css = await readSource('../public/css/main.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /scroll-behavior: auto/);
});

test('version timeline preview is a localized, keyboard-contained dialog', async () => {
    const source = await readSource('../public/js/editor-core/student/version-history.js');

    assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="version-preview-title"/);
    assert.match(source, /event\.key === 'Escape'/);
    assert.match(source, /event\.key !== 'Tab'/);
    assert.match(source, /getOverlayFocusableElements/);
    assert.match(source, /overlayReturnFocus = previouslyFocused/);
    assert.match(source, /returnFocus\?\.isConnected/);
    assert.match(source, /querySelector\('\.version-btn-close'\)\?\.focus\(\)/);
    assert.match(source, /getDateLocale\(\)/);
    assert.doesNotMatch(source, /versions\.wordsLabel/);
    assert.doesNotMatch(source, />Spill av</);
    assert.doesNotMatch(source, /Snapshot \$\{/);
    assert.doesNotMatch(source, /Akkurat nå/);
});

test('Leksihjelp language choices reuse the app locale names', async () => {
    const source = await readSource('../public/js/app/leksihjelp-settings.js');

    assert.match(source, /const LANGS = \['nb', 'nn', 'en', 'de', 'es', 'fr'\]/);
    assert.match(source, /t\(`language\.\$\{id\}`\)/);
    assert.match(source, /const langName = t\(`language\.\$\{lang\}`\)/);
    assert.doesNotMatch(source, /\{ id: 'nb', label:/);
});

test('the skip link has a safe fallback and follows the initialized UI locale', async () => {
    const [index, main] = await Promise.all([
        readSource('../public/index.html'),
        readSource('../public/js/app/main.js'),
    ]);

    assert.match(index, /data-i18n-key="a11y\.skipToContent">Hopp til innhold<\/a>/);
    assert.match(main, /document\.documentElement\.lang = getCurrentLanguage\(\)/);
    assert.match(main, /skipLink\.textContent = t\('a11y\.skipToContent'\)/);
});
