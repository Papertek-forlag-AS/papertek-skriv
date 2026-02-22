/**
 * Image Manager — block-level image insertion, resize, and management.
 *
 * Students can add images via:
 *   1. File picker button (top bar)
 *   2. Paste from clipboard (Ctrl+V / Cmd+V)
 *   3. Drag and drop onto editor
 *
 * Images are:
 *   - Block-only (no float, no inline)
 *   - Auto-compressed (max 800px wide, JPEG 0.8 quality)
 *   - Stored as base64 in the HTML (IndexedDB)
 *   - Resizable via corner drag handles
 *   - Exported to PDF with captions
 *
 * This is a SEPARATE module so teachers can disable image editing
 * and it's easy to decide where in the frontend it should live.
 *
 * Usage:
 *   import { initImageManager } from './image-manager.js';
 *   const { destroy, openFilePicker } = initImageManager(editor, { onInsert });
 */

import { t } from '../shared/i18n.js';
import { showToast } from '../shared/toast-notification.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB raw
const MAX_WIDTH = 800;                  // px — compress to this
const JPEG_QUALITY = 0.8;
const MIN_RESIZE_WIDTH = 80;            // px — smallest allowed

/**
 * Compress an image file using canvas.
 * @param {File} file
 * @returns {Promise<string>} base64 data URL
 */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;

                // Scale down if wider than MAX_WIDTH
                if (w > MAX_WIDTH) {
                    h = Math.round((h / w) * MAX_WIDTH);
                    w = MAX_WIDTH;
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                // Use JPEG for photos, PNG for small/transparent images
                const isPng = file.type === 'image/png' && w * h < 200000; // < ~450x450
                const mimeType = isPng ? 'image/png' : 'image/jpeg';
                const quality = isPng ? undefined : JPEG_QUALITY;

                resolve(canvas.toDataURL(mimeType, quality));
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Validate file before processing.
 * @param {File} file
 * @returns {string|null} Error message key, or null if valid
 */
function validateFile(file) {
    if (!file.type.startsWith('image/')) {
        return 'image.invalidType';
    }
    if (file.size > MAX_FILE_SIZE) {
        return 'image.tooLarge';
    }
    return null;
}

/**
 * Create a figure element with image, handles, and caption.
 * @param {string} base64 - data URL
 * @returns {HTMLElement}
 */
function createImageBlock(base64) {
    const figure = document.createElement('figure');
    figure.className = 'skriv-image-block';
    figure.contentEditable = 'false';

    const img = document.createElement('img');
    img.src = base64;
    img.alt = '';
    img.style.width = '100%';
    img.draggable = false;

    // Resize handles container
    const handles = document.createElement('div');
    handles.className = 'skriv-image-handles hidden';
    for (const dir of ['nw', 'ne', 'sw', 'se']) {
        const handle = document.createElement('div');
        handle.className = `handle handle-${dir}`;
        handle.dataset.dir = dir;
        handles.appendChild(handle);
    }

    // Caption
    const caption = document.createElement('figcaption');
    caption.className = 'skriv-image-caption';
    caption.contentEditable = 'true';
    caption.dataset.placeholder = t('image.captionPlaceholder');

    figure.appendChild(img);
    figure.appendChild(handles);
    figure.appendChild(caption);

    return figure;
}

/**
 * Initialize the Image Manager.
 * @param {HTMLElement} editor - contenteditable element
 * @param {object} options
 * @param {Function} [options.onInsert] - called after image insertion (e.g. schedule auto-save)
 * @returns {{ destroy, openFilePicker }}
 */
export function initImageManager(editor, options = {}) {
    const { onInsert } = options;
    let selectedBlock = null; // currently selected image block
    let resizing = false;
    let fileInput = null;

    // --- Hidden file input ---
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    /**
     * Insert image at the current cursor position (or end of editor).
     */
    async function insertImageFromFile(file) {
        const error = validateFile(file);
        if (error) {
            showToast(t(error), { duration: 3000 });
            return;
        }

        try {
            const base64 = await compressImage(file);
            const figure = createImageBlock(base64);

            // Find insertion point
            const sel = window.getSelection();
            let insertBefore = null;

            if (sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                // Find the nearest block-level element
                let node = range.startContainer;
                while (node && node !== editor && node.parentNode !== editor) {
                    node = node.parentNode;
                }
                if (node && node !== editor) {
                    insertBefore = node.nextSibling;
                }
            }

            if (insertBefore) {
                editor.insertBefore(figure, insertBefore);
            } else {
                editor.appendChild(figure);
            }

            // Add an empty paragraph after if the figure is the last child
            if (!figure.nextElementSibling) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                editor.appendChild(p);
            }

            if (onInsert) onInsert();
        } catch (err) {
            console.error('Image insertion failed:', err);
            showToast(t('common.error'), { duration: 2000 });
        }
    }

    // --- File input handler ---
    function handleFileInputChange() {
        const files = fileInput.files;
        if (files && files.length > 0) {
            insertImageFromFile(files[0]);
        }
        fileInput.value = ''; // reset for next use
    }
    fileInput.addEventListener('change', handleFileInputChange);

    /**
     * Open the file picker dialog.
     */
    function openFilePicker() {
        fileInput.click();
    }

    // --- Paste handler ---
    function handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) insertImageFromFile(file);
                return;
            }
        }
    }
    editor.addEventListener('paste', handlePaste);

    // --- Drag and drop ---
    function handleDragOver(e) {
        if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            editor.classList.add('skriv-image-dragover');
        }
    }

    function handleDragLeave(e) {
        // Only remove class if leaving the editor entirely
        if (!editor.contains(e.relatedTarget)) {
            editor.classList.remove('skriv-image-dragover');
        }
    }

    function handleDrop(e) {
        editor.classList.remove('skriv-image-dragover');
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        // Check if any file is an image
        const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
        if (!imageFile) return;

        e.preventDefault();

        // Try to set cursor at drop position
        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        insertImageFromFile(imageFile);
    }

    editor.addEventListener('dragover', handleDragOver);
    editor.addEventListener('dragleave', handleDragLeave);
    editor.addEventListener('drop', handleDrop);

    // --- Click selection & deselection ---
    function selectBlock(figure) {
        deselectAll();
        selectedBlock = figure;
        figure.classList.add('selected');
        figure.querySelector('.skriv-image-handles')?.classList.remove('hidden');
    }

    function deselectAll() {
        if (selectedBlock) {
            selectedBlock.classList.remove('selected');
            selectedBlock.querySelector('.skriv-image-handles')?.classList.add('hidden');
            selectedBlock = null;
        }
    }

    function handleEditorClick(e) {
        const figure = e.target.closest('.skriv-image-block');
        if (figure && editor.contains(figure)) {
            // Don't select if clicking on caption
            if (e.target.closest('.skriv-image-caption')) {
                return;
            }
            e.preventDefault();
            selectBlock(figure);
        } else {
            deselectAll();
        }
    }
    editor.addEventListener('click', handleEditorClick);

    // --- Delete selected image ---
    function handleKeyDown(e) {
        if (!selectedBlock) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const next = selectedBlock.nextElementSibling || selectedBlock.previousElementSibling;
            selectedBlock.remove();
            selectedBlock = null;
            showToast(t('image.deleted'), { duration: 1500 });

            // Focus next element or ensure editor isn't empty
            if (next) {
                const range = document.createRange();
                range.selectNodeContents(next);
                range.collapse(true);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } else if (!editor.firstChild) {
                editor.innerHTML = '<p><br></p>';
                editor.firstChild.focus();
            }

            if (onInsert) onInsert(); // trigger save
        }
    }
    document.addEventListener('keydown', handleKeyDown);

    // --- Resize handles ---
    let resizeState = null;

    function handleResizeStart(e) {
        const handle = e.target.closest('.handle');
        if (!handle) return;

        const figure = handle.closest('.skriv-image-block');
        const img = figure?.querySelector('img');
        if (!figure || !img) return;

        e.preventDefault();
        e.stopPropagation();
        resizing = true;

        resizeState = {
            figure,
            img,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: img.offsetWidth,
            dir: handle.dataset.dir,
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    }

    function handleResizeMove(e) {
        if (!resizeState) return;

        const { img, startX, startWidth, dir } = resizeState;
        let dx = e.clientX - startX;

        // For left handles, invert direction
        if (dir === 'nw' || dir === 'sw') {
            dx = -dx;
        }

        const newWidth = Math.max(MIN_RESIZE_WIDTH, Math.min(startWidth + dx, editor.clientWidth));
        img.style.width = `${newWidth}px`;
    }

    function handleResizeEnd() {
        if (resizeState) {
            resizeState = null;
            resizing = false;
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
            if (onInsert) onInsert(); // trigger save after resize
        }
    }

    // Attach resize start to the editor (delegated)
    editor.addEventListener('mousedown', (e) => {
        if (e.target.closest('.handle')) {
            handleResizeStart(e);
        }
    });

    // --- Cleanup ---
    function destroy() {
        editor.removeEventListener('paste', handlePaste);
        editor.removeEventListener('dragover', handleDragOver);
        editor.removeEventListener('dragleave', handleDragLeave);
        editor.removeEventListener('drop', handleDrop);
        editor.removeEventListener('click', handleEditorClick);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        if (fileInput?.parentNode) fileInput.remove();
        deselectAll();
    }

    return { destroy, openFilePicker };
}
