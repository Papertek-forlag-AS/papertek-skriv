import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrameMarkdown } from '../public/js/editor-core/student/frame-parser.js';
import { starters as startersNb } from '../public/js/editor-core/student/spinner-data-nb.js';
import { starters as startersNn } from '../public/js/editor-core/student/spinner-data-nn.js';
import { starters as startersEn } from '../public/js/editor-core/student/spinner-data-en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Every spinner bucket a frame resolves to (explicit tag or positional
// fallback) must exist in the matching spinner-data genre for BOTH tiers.
// Without this, "flere forslag" silently serves starters from an
// unrelated bucket (e.g. closing starters under an opening heading).
for (const [lang, starters] of [['nb', startersNb], ['nn', startersNn], ['en', startersEn]]) {
    test(`every ${lang} frame bucket resolves in spinner-data-${lang}`, () => {
        const dir = join(root, 'public', 'frames', lang);
        const misses = [];
        for (const file of readdirSync(dir)) {
            if (!file.endsWith('.md')) continue;
            const genreKey = file.replace('.md', '');
            const genre = starters[genreKey];
            if (!genre) {
                misses.push(`${file}: no genre entry (falls back to generell)`);
                continue;
            }
            const frame = parseFrameMarkdown(readFileSync(join(dir, file), 'utf8'));
            for (const section of frame.sections) {
                const buckets = [section.spinnerBucket, ...section.subsections.map(s => s.spinnerBucket)];
                for (const bucket of buckets) {
                    for (const tier of ['us', 'vgs']) {
                        if (!genre[tier] || !genre[tier][bucket]) {
                            misses.push(`${file} "${section.title}" → ${bucket} missing in ${tier}`);
                        }
                    }
                }
            }
        }
        assert.deepEqual(misses, []);
    });
}
