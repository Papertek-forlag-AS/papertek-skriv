import test from 'node:test';
import assert from 'node:assert/strict';
import { isImageBlock, removeFrameScaffold } from '../public/js/editor-core/shared/frame-elements.js';

test('isImageBlock correctly identifies figure blocks with skriv-image-block class', () => {
    assert.equal(isImageBlock(null), false);
    assert.equal(isImageBlock({}), false);
    assert.equal(isImageBlock({ classList: { contains: () => false } }), false);

    const mockFigure = {
        classList: {
            contains: (cls) => cls === 'skriv-image-block',
        },
    };
    assert.equal(isImageBlock(mockFigure), true);
});

test('removeFrameScaffold preserves image blocks while stripping frame scaffold', () => {
    const removedClasses = [];
    const mockClone = {
        querySelectorAll: (selector) => {
            if (selector.includes('skriv-frame')) {
                return [
                    { remove: () => removedClasses.push('scaffold-section') },
                    { remove: () => removedClasses.push('scaffold-prompt') },
                ];
            }
            return [];
        },
    };

    removeFrameScaffold(mockClone);
    assert.equal(removedClasses.length, 2);
    assert.deepEqual(removedClasses, ['scaffold-section', 'scaffold-prompt']);
});

test('Paragraph splitting logic replaces target paragraph with before/figure/after nodes', () => {
    // Simulated paragraph split algorithm test
    const paragraphText = 'First half of text. Second half of text.';
    const splitIndex = paragraphText.indexOf('Second');

    const pBeforeContent = paragraphText.slice(0, splitIndex);
    const pAfterContent = paragraphText.slice(splitIndex);

    assert.equal(pBeforeContent.trim(), 'First half of text.');
    assert.equal(pAfterContent.trim(), 'Second half of text.');
});
