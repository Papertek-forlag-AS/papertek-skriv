import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrameMarkdown } from '../public/js/editor-core/student/frame-parser.js';

test('parseFrameMarkdown parses titles, metadata, sections, and prompts', () => {
    const md = `
# Drøftingsessay
## Metadata
genre: drøfting
level: vgs

## Innledning
> Introduser temaet og problemstillingen.
- I denne teksten skal jeg drøfte...
- Temaet er aktuelt fordi...

## Hoveddel
spinner: argumentasjon
> Legg fram argumenter for og imot.
- På den ene siden...
- På den andre siden...

### Virkemidler i teksten
> Hvilke virkemidler brukes?
- Forfatteren benytter...

## Avslutning
> Oppsummer hovedpunktene og konkluder.
- Avslutningsvis kan vi se at...
    `.trim();

    const parsed = parseFrameMarkdown(md);

    assert.equal(parsed.name, 'Drøftingsessay');
    assert.equal(parsed.meta.genre, 'drøfting');
    assert.equal(parsed.meta.level, 'vgs');
    assert.equal(parsed.sections.length, 3);

    // Section 1: Innledning
    assert.equal(parsed.sections[0].title, 'Innledning');
    assert.equal(parsed.sections[0].instruction, 'Introduser temaet og problemstillingen.');
    assert.equal(parsed.sections[0].prompts.length, 2);
    assert.equal(parsed.sections[0].spinnerBucket, 'innledning');

    // Section 2: Hoveddel with explicit spinner override and subsection
    assert.equal(parsed.sections[1].title, 'Hoveddel');
    assert.equal(parsed.sections[1].spinnerBucket, 'argumentasjon');
    assert.equal(parsed.sections[1].subsections.length, 1);
    assert.equal(parsed.sections[1].subsections[0].title, 'Virkemidler i teksten');
    assert.equal(parsed.sections[1].subsections[0].spinnerBucket, 'verkemiddel');

    // Section 3: Avslutning
    assert.equal(parsed.sections[2].title, 'Avslutning');
    assert.equal(parsed.sections[2].spinnerBucket, 'avslutning');
});
