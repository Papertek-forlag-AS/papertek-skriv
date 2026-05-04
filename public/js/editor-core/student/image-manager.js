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
 *   - Reorderable via drag handle
 *   - Alignable/sizable via floating toolbar
 *
 * This is a SEPARATE module so teachers can disable image editing
 * and it's easy to decide where in the frontend it should live.
 *
 * Usage:
 *   import { initImageManager } from './image-manager.js';
 *   const { destroy, openFilePicker } = initImageManager(editor, container, { onInsert });
 */

import { t } from '../shared/i18n.js';
import { showToast } from '../shared/toast-notification.js';
import { isFrameElement } from '../shared/frame-elements.js';

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
 * Create a figure element with image, handles, drag handle, and caption.
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

    // Drag handle for reordering
    const dragHandle = document.createElement('div');
    dragHandle.className = 'skriv-image-drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = t('image.dragToMove');

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

    figure.appendChild(dragHandle);
    figure.appendChild(img);
    figure.appendChild(handles);
    figure.appendChild(caption);

    return figure;
}

/**
 * Create the floating toolbar element.
 * @returns {HTMLElement}
 */
function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'skriv-image-toolbar';
    toolbar.style.cssText = `
        position: absolute;
        display: none;
        z-index: 1000;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        padding: 4px 6px;
        gap: 2px;
        align-items: center;
        white-space: nowrap;
        font-size: 13px;
    `;

    const buttons = [
        { key: 'alignLeft', label: '⬅', action: 'align-left', group: 'align' },
        { key: 'alignCenter', label: '⬛', action: 'align-center', group: 'align' },
        { key: 'alignRight', label: '➡', action: 'align-right', group: 'align' },
        { key: 'separator1', separator: true },
        { key: 'sizeSmall', label: 'S', action: 'size-small', group: 'size' },
        { key: 'sizeMedium', label: 'M', action: 'size-medium', group: 'size' },
        { key: 'sizeFull', label: 'F', action: 'size-full', group: 'size' },
        { key: 'separator2', separator: true },
        { key: 'shadow', label: '◐', action: 'shadow', group: 'shadow' },
        { key: 'separator3', separator: true },
        { key: 'delete', label: '✕', action: 'delete', group: 'delete' },
    ];

    for (const btn of buttons) {
        if (btn.separator) {
            const sep = document.createElement('span');
            sep.style.cssText = 'width:1px;height:20px;background:#e5e7eb;margin:0 4px;';
            toolbar.appendChild(sep);
            continue;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'skriv-image-toolbar-btn';
        button.dataset.action = btn.action;
        button.dataset.group = btn.group;
        button.textContent = btn.label;
        button.title = t(`image.${btn.key}`);
        button.style.cssText = `
            border: none;
            background: transparent;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 13px;
            line-height: 1;
            color: #374151;
            transition: background 0.15s;
        `;
        toolbar.appendChild(button);
    }

    return toolbar;
}

/**
 * Initialize the Image Manager.
 * @param {HTMLElement} editor - contenteditable element
 * @param {HTMLElement} container - parent container (non-contenteditable) for toolbar positioning
 * @param {object} options
 * @param {Function} [options.onInsert] - called after image insertion (e.g. schedule auto-save)
 * @returns {{ destroy, openFilePicker }}
 */
export function initImageManager(editor, container, options = {}) {
    // Backwards compat: if container is a plain object, treat it as options
    if (container && typeof container === 'object' && !(container instanceof HTMLElement)) {
        options = container;
        container = editor.parentElement;
    }
    if (!container) container = editor.parentElement;

    const { onInsert } = options;
    let selectedBlock = null; // currently selected image block
    let resizing = false;
    let fileInput = null;

    // Clean up stale selection state from rehydrated HTML
    editor.querySelectorAll('.skriv-image-block.selected').forEach(fig => {
        fig.classList.remove('selected');
        fig.querySelector('.skriv-image-handles')?.classList.add('hidden');
    });

    // --- Hidden file input ---
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // --- Floating Toolbar ---
    const toolbar = createToolbar();
    container.style.position = container.style.position || 'relative';
    container.appendChild(toolbar);

    function positionToolbar() {
        if (!selectedBlock || toolbar.style.display === 'none') return;

        const figRect = selectedBlock.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const top = figRect.top - containerRect.top - toolbar.offsetHeight - 8;
        const left = figRect.left - containerRect.left + (figRect.width / 2) - (toolbar.offsetWidth / 2);

        toolbar.style.top = `${Math.max(0, top)}px`;
        toolbar.style.left = `${Math.max(0, Math.min(left, containerRect.width - toolbar.offsetWidth))}px`;
    }

    function showToolbar(figure) {
        toolbar.style.display = 'flex';
        updateToolbarState(figure);
        // Position after display so offsetWidth/Height are available
        requestAnimationFrame(() => positionToolbar());
    }

    function hideToolbar() {
        toolbar.style.display = 'none';
    }

    function updateToolbarState(figure) {
        if (!figure) return;
        const img = figure.querySelector('img');
        if (!img) return;

        // Determine current alignment
        const ml = figure.style.marginLeft;
        const mr = figure.style.marginRight;
        let currentAlign = 'center'; // default
        if (ml === '0px' || ml === '0') currentAlign = 'left';
        else if (mr === '0px' || mr === '0') currentAlign = 'right';

        // Determine current size
        const w = img.style.width;
        let currentSize = 'full';
        if (w === '40%') currentSize = 'small';
        else if (w === '65%') currentSize = 'medium';

        // Determine shadow state
        const hasShadow = figure.classList.contains('skriv-image-shadow');

        // Update button states
        toolbar.querySelectorAll('.skriv-image-toolbar-btn').forEach(btn => {
            const action = btn.dataset.action;
            let active = false;

            if (action === 'align-left' && currentAlign === 'left') active = true;
            if (action === 'align-center' && currentAlign === 'center') active = true;
            if (action === 'align-right' && currentAlign === 'right') active = true;
            if (action === 'size-small' && currentSize === 'small') active = true;
            if (action === 'size-medium' && currentSize === 'medium') active = true;
            if (action === 'size-full' && currentSize === 'full') active = true;
            if (action === 'shadow' && hasShadow) active = true;

            btn.style.background = active ? '#059669' : 'transparent';
            btn.style.color = active ? '#fff' : '#374151';
        });
    }

    function handleToolbarClick(e) {
        const btn = e.target.closest('.skriv-image-toolbar-btn');
        if (!btn || !selectedBlock) return;

        e.preventDefault();
        e.stopPropagation();

        const action = btn.dataset.action;
        const img = selectedBlock.querySelector('img');

        switch (action) {
            case 'align-left':
                selectedBlock.style.marginLeft = '0';
                selectedBlock.style.marginRight = 'auto';
                break;
            case 'align-center':
                selectedBlock.style.marginLeft = 'auto';
                selectedBlock.style.marginRight = 'auto';
                break;
            case 'align-right':
                selectedBlock.style.marginLeft = 'auto';
                selectedBlock.style.marginRight = '0';
                break;
            case 'size-small':
                if (img) img.style.width = '40%';
                break;
            case 'size-medium':
                if (img) img.style.width = '65%';
                break;
            case 'size-full':
                if (img) img.style.width = '100%';
                break;
            case 'shadow':
                selectedBlock.classList.toggle('skriv-image-shadow');
                break;
            case 'delete':
                deleteSelectedBlock();
                return; // Don't update toolbar after delete
        }

        updateToolbarState(selectedBlock);
        positionToolbar();
        if (onInsert) onInsert(); // trigger save
    }

    toolbar.addEventListener('click', handleToolbarClick);

    // Reposition on scroll/resize
    function handleScrollResize() {
        if (selectedBlock) positionToolbar();
    }
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('resize', handleScrollResize);

    // --- Drag-to-Reorder ---
    let dragState = null;
    let dragGhost = null;
    let dropIndicator = null;

    function createDropIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'skriv-image-drop-indicator';
        indicator.style.cssText = `
            position: absolute;
            left: 0;
            right: 0;
            height: 3px;
            background: #2563eb;
            border-radius: 2px;
            pointer-events: none;
            display: none;
            z-index: 999;
        `;
        container.appendChild(indicator);
        return indicator;
    }

    dropIndicator = createDropIndicator();

    function handleDragHandleDown(e) {
        const handle = e.target.closest('.skriv-image-drag-handle');
        if (!handle) return;

        const figure = handle.closest('.skriv-image-block');
        if (!figure || !editor.contains(figure)) return;

        e.preventDefault();
        e.stopPropagation();

        // Create ghost
        dragGhost = figure.cloneNode(true);
        dragGhost.style.cssText = `
            position: fixed;
            opacity: 0.6;
            pointer-events: none;
            z-index: 10000;
            width: ${figure.offsetWidth}px;
            transform: rotate(1deg);
        `;
        document.body.appendChild(dragGhost);

        dragState = {
            figure,
            startY: e.clientY,
            offsetX: e.clientX - figure.getBoundingClientRect().left,
            offsetY: e.clientY - figure.getBoundingClientRect().top,
        };

        // Position ghost initially
        dragGhost.style.left = `${e.clientX - dragState.offsetX}px`;
        dragGhost.style.top = `${e.clientY - dragState.offsetY}px`;

        figure.style.opacity = '0.3';

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }

    function handleDragMove(e) {
        if (!dragState) return;

        // Move ghost
        dragGhost.style.left = `${e.clientX - dragState.offsetX}px`;
        dragGhost.style.top = `${e.clientY - dragState.offsetY}px`;

        // Find drop position
        const children = Array.from(editor.children);
        let closestEl = null;
        let closestDist = Infinity;
        let insertBefore = true;

        for (const child of children) {
            if (child === dragState.figure) continue;
            if (isFrameElement(child)) continue;

            const rect = child.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const dist = Math.abs(e.clientY - midY);

            if (dist < closestDist) {
                closestDist = dist;
                closestEl = child;
                insertBefore = e.clientY < midY;
            }
        }

        // Show drop indicator
        if (closestEl) {
            const containerRect = container.getBoundingClientRect();
            const elRect = closestEl.getBoundingClientRect();
            const indicatorY = insertBefore
                ? elRect.top - containerRect.top - 2
                : elRect.bottom - containerRect.top + 2;

            dropIndicator.style.display = 'block';
            dropIndicator.style.top = `${indicatorY}px`;
            dragState.dropTarget = closestEl;
            dragState.insertBefore = insertBefore;
        } else {
            dropIndicator.style.display = 'none';
            dragState.dropTarget = null;
        }
    }

    function handleDragEnd(e) {
        if (!dragState) return;

        const { figure, dropTarget, insertBefore } = dragState;

        // Move the figure to new position
        if (dropTarget && dropTarget !== figure) {
            if (insertBefore) {
                editor.insertBefore(figure, dropTarget);
            } else {
                editor.insertBefore(figure, dropTarget.nextSibling);
            }
            if (onInsert) onInsert(); // trigger save
        }

        // Cleanup
        figure.style.opacity = '';
        if (dragGhost?.parentNode) dragGhost.remove();
        dragGhost = null;
        dropIndicator.style.display = 'none';
        dragState = null;

        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
    }

    editor.addEventListener('mousedown', (e) => {
        if (e.target.closest('.skriv-image-drag-handle')) {
            handleDragHandleDown(e);
        }
    });

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

    // --- Drag and drop (file insertion) ---
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
        showToolbar(figure);
    }

    function deselectAll() {
        // Clear JS reference
        if (selectedBlock) {
            selectedBlock.classList.remove('selected');
            selectedBlock.querySelector('.skriv-image-handles')?.classList.add('hidden');
            selectedBlock = null;
        }
        // Also clear any stale DOM-only selections (e.g. from rehydrated HTML)
        editor.querySelectorAll('.skriv-image-block.selected').forEach(fig => {
            fig.classList.remove('selected');
            fig.querySelector('.skriv-image-handles')?.classList.add('hidden');
        });
        hideToolbar();
    }

    function handleEditorClick(e) {
        const figure = e.target.closest('.skriv-image-block');
        if (figure && editor.contains(figure)) {
            // Don't select if clicking on caption
            if (e.target.closest('.skriv-image-caption')) {
                deselectAll();
                return;
            }
            // Don't select if clicking drag handle (handled separately)
            if (e.target.closest('.skriv-image-drag-handle')) return;
            e.preventDefault();
            selectBlock(figure);
        } else {
            deselectAll();
        }
    }
    editor.addEventListener('click', handleEditorClick);

    // Also deselect on mousedown outside editor (but NOT on toolbar)
    function handleDocumentClick(e) {
        if (!editor.contains(e.target) && !toolbar.contains(e.target) && selectedBlock) {
            deselectAll();
        }
    }
    document.addEventListener('mousedown', handleDocumentClick);

    // --- Delete selected image ---
    function deleteSelectedBlock() {
        if (!selectedBlock) return;
        const next = selectedBlock.nextElementSibling || selectedBlock.previousElementSibling;
        selectedBlock.remove();
        selectedBlock = null;
        hideToolbar();
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

    function handleKeyDown(e) {
        if (!selectedBlock) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedBlock();
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
        document.removeEventListener('mousedown', handleDocumentClick);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        window.removeEventListener('scroll', handleScrollResize, true);
        window.removeEventListener('resize', handleScrollResize);
        toolbar.removeEventListener('click', handleToolbarClick);
        if (toolbar.parentNode) toolbar.remove();
        if (dropIndicator?.parentNode) dropIndicator.remove();
        if (dragGhost?.parentNode) dragGhost.remove();
        if (fileInput?.parentNode) fileInput.remove();
        deselectAll();
    }

    return { destroy, openFilePicker };
}
