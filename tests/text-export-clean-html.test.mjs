import test from 'node:test';
import assert from 'node:assert/strict';
import { getCleanHTML } from '../public/js/editor-core/student/text-export.js';
import { el, text } from './helpers/mini-dom.mjs';

/**
 * Build an editor tree shaped like real frame-guide/image-manager output.
 * Class names and attributes MUST mirror what the app actually produces —
 * that contract is exactly what these tests lock down.
 */
function frameDivider(label) {
    // frame-guide.js: div.skriv-frame-divider.section-marker, contentEditable=false
    return el('div', { class: 'skriv-frame-divider section-marker', contenteditable: 'false' }, [
        el('span', { class: 'frame-divider-label' }, [text(label)]),
    ]);
}

test('getCleanHTML strips frame dividers so scaffold labels never leak into exports', () => {
    const editor = el('div', { id: 'editor' }, [
        frameDivider('Innledning'),
        el('p', {}, [text('Min innledning.')]),
        frameDivider('Hoveddel'),
        el('p', {}, [text('Min hoveddel.')]),
        frameDivider('Avslutning ✓'),
        el('p', {}, [text('Min avslutning.')]),
    ]);

    const html = getCleanHTML(editor);

    // The pupil's text survives...
    assert.ok(html.includes('Min innledning.'));
    assert.ok(html.includes('Min hoveddel.'));
    assert.ok(html.includes('Min avslutning.'));
    // ...but no scaffold label or divider markup does.
    assert.ok(!html.includes('Innledning</span>'), 'divider label leaked');
    assert.ok(!html.includes('Hoveddel</span>'), 'divider label leaked');
    assert.ok(!html.includes('skriv-frame-divider'));
    assert.ok(!html.includes('frame-divider-label'));
    assert.ok(!html.includes('contenteditable'));
});

test('getCleanHTML strips dividers even without contenteditable="false" (belt and braces)', () => {
    // If frame-guide ever drops the contenteditable attribute on dividers,
    // the explicit .skriv-frame-divider selector must still catch them.
    const editor = el('div', {}, [
        el('div', { class: 'skriv-frame-divider section-marker' }, [
            el('span', { class: 'frame-divider-label' }, [text('Innledning')]),
        ]),
        el('p', {}, [text('Tekst.')]),
    ]);
    const html = getCleanHTML(editor);
    assert.ok(html.includes('Tekst.'));
    assert.ok(!html.includes('Innledning'), 'divider label leaked without contenteditable');
});

test('getCleanHTML strips legacy data-frame scaffold and eager-scaffold sections', () => {
    const editor = el('div', {}, [
        el('div', { 'data-frame-section': '1' }, [text('scaffold section')]),
        el('div', { 'data-frame-header': '1' }, [text('scaffold header')]),
        el('div', { 'data-frame-prompt': '1' }, [text('Skriv om temaet her...')]),
        el('p', {}, [text('Ekte tekst.')]),
    ]);

    const html = getCleanHTML(editor);
    assert.ok(html.includes('Ekte tekst.'));
    assert.ok(!html.includes('scaffold'));
    assert.ok(!html.includes('Skriv om temaet her'));
});

test('getCleanHTML keeps images and captions but drops resize handles and toolbars', () => {
    const editor = el('div', {}, [
        el('p', {}, [text('Før bildet.')]),
        el('figure', { class: 'skriv-image-block', contenteditable: 'false' }, [
            el('img', { src: 'data:image/png;base64,abc', alt: 'Skisse' }),
            el('div', { class: 'skriv-resize-handle' }),
            el('div', { class: 'skriv-image-toolbar' }, [text('Slett')]),
            el('figcaption', {}, [text('Figur 1: Skissen min')]),
        ]),
        el('p', {}, [text('Etter bildet.')]),
    ]);

    const html = getCleanHTML(editor);

    assert.ok(html.includes('<img'), 'image must survive export cleaning');
    assert.ok(html.includes('Figur 1: Skissen min'), 'caption must survive');
    assert.ok(html.includes('Før bildet.') && html.includes('Etter bildet.'));
    assert.ok(!html.includes('resize-handle'));
    assert.ok(!html.includes('Slett'), 'image toolbar leaked into export');
});

test('getCleanHTML strips skriv-* classes and data-* attributes but keeps other markup', () => {
    const editor = el('div', {}, [
        el('p', { class: 'skriv-highlight important', 'data-skriv-id': '42' }, [
            el('strong', {}, [text('Fet')]),
            text(' og vanlig tekst.'),
        ]),
        el('h2', {}, [text('Overskrift')]),
    ]);

    const html = getCleanHTML(editor);

    assert.ok(html.includes('<strong>Fet</strong>'));
    assert.ok(html.includes('<h2>Overskrift</h2>'));
    assert.ok(html.includes('class="important"'), 'non-skriv classes should survive');
    assert.ok(!html.includes('skriv-highlight'));
    assert.ok(!html.includes('data-skriv-id'));
});

test('getCleanHTML leaves a plain document untouched', () => {
    const editor = el('div', {}, [
        el('p', {}, [text('Bare en helt vanlig tekst.')]),
        el('p', {}, [el('em', {}, [text('Kursiv')]), text(' også.')]),
    ]);
    assert.equal(
        getCleanHTML(editor),
        '<p>Bare en helt vanlig tekst.</p><p><em>Kursiv</em> også.</p>'
    );
});
