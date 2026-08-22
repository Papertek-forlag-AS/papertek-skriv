import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const vendorRoot = new URL('../public/js/leksihjelp/', import.meta.url);

async function loadGenderRule() {
    const context = vm.createContext({ console, Intl });
    context.self = context;

    for (const relativePath of [
        'content/spell-check-core.js',
        'content/spell-rules/nb-gender.js',
    ]) {
        const source = await readFile(new URL(relativePath, vendorRoot), 'utf8');
        vm.runInContext(source, context, { filename: relativePath });
    }

    return context.__lexiSpellCore;
}

function norwegianGenderVocab() {
    return {
        nounGenus: new Map([
            ['kort', 'n'],
            ['tekst', 'm'],
            ['svar', 'n'],
        ]),
        validWords: new Set(),
        isAdjective: new Set(['kort']),
        knownPresens: new Set(),
        knownPreteritum: new Set(),
    };
}

test('Nynorsk gender rule treats kort as an adjective when a head noun follows', async () => {
    const core = await loadGenderRule();
    const vocab = norwegianGenderVocab();

    const correctMasculine = core.check(
        'Dette er ein kort tekst om skulen.',
        vocab,
        { lang: 'nn' },
    );
    assert.equal(
        correctMasculine.filter((finding) => finding.rule_id === 'gender').length,
        0,
        '`ein kort tekst` is correct: tekst is masculine and kort is attributive',
    );

    const wrongMasculine = core.check(
        'Dette er eit kort tekst om skulen.',
        vocab,
        { lang: 'nn' },
    );
    assert.equal(wrongMasculine.length, 1, 'the guard must not silence a real mismatch');
    assert.equal(wrongMasculine[0].fix, 'ein');
    assert.equal(wrongMasculine[0].noun_display, 'tekst');

    const correctNeuter = core.check(
        'Dette er eit kort svar.',
        vocab,
        { lang: 'nn' },
    );
    assert.equal(correctNeuter.length, 0);
});
