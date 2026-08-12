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
const MAX_WIDTH = 1200;                 // px — compress to this (HiDPI cap)
const JPEG_QUALITY = 0.82;
const MIN_RESIZE_WIDTH = 80;            // px — smallest allowed

/**
 * Compress an image file using canvas.
 * Uses WebP encoding when supported for smaller payload at 1200px resolution.
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

                const isPng = file.type === 'image/png' && w * h < 250000;
                let mimeType = 'image/jpeg';
                let quality = JPEG_QUALITY;

                if (isPng) {
                    mimeType = 'image/png';
                    quality = undefined;
                } else {
                    const testCanvas = document.createElement('canvas');
                    testCanvas.width = 1;
                    testCanvas.height = 1;
                    if (testCanvas.toDataURL('image/webp').startsWith('data:image/webp')) {
                        mimeType = 'image/webp';
                        quality = 0.82;
                    }
                }

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
 * Create a side slot placeholder element (+ Legg til innhold ved siden av).
 * @returns {HTMLElement}
 */
function createSideSlotPlaceholder(imageCount = 1, hasText = false) {
    const slot = document.createElement('div');
    slot.className = 'skriv-image-side-slot';
    slot.contentEditable = 'false';

    let chipsHtml = '';
    if (!hasText) {
        chipsHtml += `<button type="button" class="skriv-slot-chip chip-text">📝 Tekst</button>`;
    }
    if (imageCount < 3) {
        const nextImgNum = imageCount + 1;
        chipsHtml += `<button type="button" class="skriv-slot-chip chip-image">📷 Bilde ${nextImgNum}</button>`;
    }

    slot.innerHTML = `
        <div class="skriv-slot-prompt">+ Legg til side-innhold</div>
        <div class="skriv-slot-chips">${chipsHtml}</div>
    `;
    return slot;
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
    figure.tabIndex = 0;

    // Drag handle for reordering
    const dragHandle = document.createElement('div');
    dragHandle.className = 'skriv-image-drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = t('image.dragToMove');

    // Inner flex container
    const flexContainer = document.createElement('div');
    flexContainer.className = 'skriv-image-flex-container';

    // Image wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'skriv-image-wrapper';

    const img = document.createElement('img');
    img.src = base64;
    img.alt = '';
    img.style.width = '100%';
    img.draggable = false;
    img.style.webkitUserDrag = 'none';
    img.style.userSelect = 'none';

    // Single resize handle at bottom-right (se) corner
    const handles = document.createElement('div');
    handles.className = 'skriv-image-handles hidden';
    const handle = document.createElement('div');
    handle.className = 'handle handle-se';
    handle.dataset.dir = 'se';
    handles.appendChild(handle);

    // Caption
    const caption = document.createElement('figcaption');
    caption.className = 'skriv-image-caption';
    caption.contentEditable = 'true';
    caption.dataset.placeholder = t('image.captionPlaceholder');

    wrapper.appendChild(img);
    wrapper.appendChild(handles);
    wrapper.appendChild(caption);

    flexContainer.appendChild(wrapper);

    figure.appendChild(dragHandle);
    figure.appendChild(flexContainer);

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
    `;

    const buttons = [
        { key: 'delete', label: '🗑️ Slett', action: 'delete', group: 'delete' },
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

    // --- Undo / Redo History Stack ---
    const undoStack = [];
    const redoStack = [];
    const MAX_UNDO = 40;

    function saveUndoSnapshot() {
        if (!editor) return;
        const html = editor.innerHTML;
        if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== html) {
            undoStack.push(html);
            if (undoStack.length > MAX_UNDO) undoStack.shift();
            redoStack.length = 0;
        }
    }

    function handleUndoRedo(e) {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const cmd = isMac ? e.metaKey : e.ctrlKey;
        if (!cmd) return false;

        const key = e.key.toLowerCase();
        if (key === 'z') {
            if (e.shiftKey) {
                // Redo
                if (redoStack.length > 0) {
                    e.preventDefault();
                    undoStack.push(editor.innerHTML);
                    editor.innerHTML = redoStack.pop();
                    deselectAll();
                    if (onInsert) onInsert();
                    return true;
                }
            } else {
                // Undo
                if (undoStack.length > 0) {
                    e.preventDefault();
                    redoStack.push(editor.innerHTML);
                    editor.innerHTML = undoStack.pop();
                    deselectAll();
                    if (onInsert) onInsert();
                    return true;
                }
            }
        } else if (key === 'y' && !isMac) {
            // Redo on Windows/Linux (Ctrl+Y)
            if (redoStack.length > 0) {
                e.preventDefault();
                undoStack.push(editor.innerHTML);
                editor.innerHTML = redoStack.pop();
                deselectAll();
                if (onInsert) onInsert();
                return true;
            }
        }
        return false;
    }

    function ensureSidetextHandle(sidetext) {
        if (!sidetext) return;
        if (!sidetext.querySelector('.skriv-sidetext-drag-handle')) {
            const handle = document.createElement('div');
            handle.className = 'skriv-sidetext-drag-handle';
            handle.contentEditable = 'false';
            handle.innerHTML = '⋮⋮';
            handle.title = 'Dra for å flytte side eller justere vertikalt';
            sidetext.insertBefore(handle, sidetext.firstChild);
        }
    }

    function equalizeFlexRatios(figure) {
        if (!figure) return;
        const flexContainer = figure.querySelector('.skriv-image-flex-container');
        if (!flexContainer) return;

        const items = Array.from(flexContainer.querySelectorAll('.skriv-image-wrapper, .skriv-image-sidetext'));
        if (items.length === 0) return;

        const containerW = flexContainer.clientWidth || editor.clientWidth || 700;
        const count = items.length;
        const gapPx = 16 * (count - 1);
        const gapPercent = (gapPx / containerW) * 100;
        const itemPercent = Math.max(12, (100 - gapPercent) / count);

        items.forEach(item => {
            if (item.classList.contains('skriv-image-sidetext')) {
                ensureSidetextHandle(item);
            }
            item.style.flex = `0 0 ${itemPercent.toFixed(2)}%`;
            item.style.maxWidth = `${itemPercent.toFixed(2)}%`;
            item.style.width = `${itemPercent.toFixed(2)}%`;
            item.style.boxSizing = 'border-box';
        });

        const imgs = figure.querySelectorAll('.skriv-image-wrapper img');
        imgs.forEach(img => {
            img.style.width = '100%';
        });
    }

    function updateSideSlotVisibility(figure) {
        if (!figure) return;
        const mainImg = figure.querySelector('img');
        if (!mainImg) return;

        const wrappers = Array.from(figure.querySelectorAll('.skriv-image-wrapper'));
        const sideTexts = Array.from(figure.querySelectorAll('.skriv-image-sidetext'));
        let slot = figure.querySelector('.skriv-image-side-slot');

        const filledCount = wrappers.length + sideTexts.length;
        const hasText = sideTexts.length > 0;
        const imageCount = wrappers.length;

        let flexContainer = figure.querySelector('.skriv-image-flex-container');
        const figureStyle = window.getComputedStyle(figure);
        const padX = (parseFloat(figureStyle.paddingLeft) || 10) + (parseFloat(figureStyle.paddingRight) || 10);
        const innerContainerW = flexContainer ? flexContainer.clientWidth : (figure.clientWidth - padX) || (editor ? editor.clientWidth : 700) || 700;
        
        let totalFilledWidth = 0;
        wrappers.forEach(w => { 
            const img = w.querySelector('img');
            totalFilledWidth += (img ? img.offsetWidth : w.offsetWidth) || 0; 
        });
        sideTexts.forEach(t => { totalFilledWidth += (t.offsetWidth || 0); });

        const slotWidth = slot ? (slot.offsetWidth || 0) : 0;
        const availableW = Math.max(1, innerContainerW - slotWidth);
        const totalFilledPercent = innerContainerW > 0 ? (totalFilledWidth / availableW) * 100 : 100;

        // If 3 elements present OR filled items occupy >= 88% of available space, hide/remove proposal slot!
        if (filledCount >= 3 || (filledCount > 1 && totalFilledPercent >= 88)) {
            if (slot) slot.remove();
            return;
        }

        // If single image resized back near full size (>= 76%) with no side content, clean up side layout
        if (filledCount === 1 && totalFilledPercent >= 76) {
            if (slot) slot.remove();
            figure.classList.remove('skriv-layout-side', 'skriv-layout-side-reverse');
            wrappers.forEach(w => {
                w.style.flex = '';
                w.style.maxWidth = '';
                w.style.width = '';
            });
            if (totalFilledPercent >= 96) {
                mainImg.style.width = '100%';
            } else {
                mainImg.style.width = `${totalFilledWidth}px`;
            }
        } else {
            if (!figure.classList.contains('skriv-layout-side') && !figure.classList.contains('skriv-layout-side-reverse')) {
                figure.classList.add('skriv-layout-side');
            }
            
            // Convert pixel-based image width to flex percentage for the wrapper
            wrappers.forEach(w => {
                const img = w.querySelector('img');
                if (img && img.style.width && img.style.width.endsWith('px')) {
                    const imgPx = parseFloat(img.style.width) || img.offsetWidth;
                    const percent = Math.min(100, Math.max(12, (imgPx / innerContainerW) * 100));
                    w.style.flex = `0 0 ${percent.toFixed(2)}%`;
                    w.style.maxWidth = `${percent.toFixed(2)}%`;
                    w.style.width = `${percent.toFixed(2)}%`;
                    img.style.width = '100%';
                }
            });

            let flex = figure.querySelector('.skriv-image-flex-container');
            if (!flex) {
                flex = document.createElement('div');
                flex.className = 'skriv-image-flex-container';
                const wrapper = figure.querySelector('.skriv-image-wrapper');
                if (wrapper) flex.appendChild(wrapper);
                figure.appendChild(flex);
            }
            if (!slot) {
                slot = createSideSlotPlaceholder(imageCount, hasText);
                flex.appendChild(slot);
            }
            // Strict overflow safety check: if slot causes flex container overflow, remove it immediately
            if (slot && flex && flex.scrollWidth > flex.clientWidth + 5) {
                slot.remove();
            }
        }
    }

    function cleanupStraySidetexts() {
        if (!editor) return;
        editor.querySelectorAll('.skriv-image-flex-container').forEach(flex => {
            const sideTexts = flex.querySelectorAll('.skriv-image-sidetext');
            if (sideTexts.length > 1) {
                for (let i = 1; i < sideTexts.length; i++) {
                    const extraHtml = sideTexts[i].innerHTML.trim();
                    if (extraHtml && extraHtml !== '<br>') {
                        sideTexts[0].innerHTML += '<br>' + extraHtml;
                    }
                    sideTexts[i].remove();
                }
            }
        });
    }

    // Clean up stale selection state and any stray sidetext elements from rehydrated HTML
    cleanupStraySidetexts();
    editor.querySelectorAll('.skriv-image-block.selected').forEach(fig => {
        fig.classList.remove('selected');
        fig.querySelector('.skriv-image-handles')?.classList.add('hidden');
    });

    // --- Hidden file inputs for 1st and 2nd images ---
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    let targetDualImageSlot = null;
    const secondFileInput = document.createElement('input');
    secondFileInput.type = 'file';
    secondFileInput.accept = 'image/*';
    secondFileInput.style.display = 'none';
    document.body.appendChild(secondFileInput);

    secondFileInput.addEventListener('change', async () => {
        const files = secondFileInput.files;
        if (files && files.length > 0 && targetDualImageSlot) {
            const { figure, slot } = targetDualImageSlot;
            try {
                saveUndoSnapshot();
                const base64 = await compressImage(files[0]);
                const secondWrapper = document.createElement('div');
                secondWrapper.className = 'skriv-image-wrapper';

                const secondImg = document.createElement('img');
                secondImg.src = base64;
                secondImg.alt = '';
                secondImg.style.width = '100%';
                secondImg.draggable = false;

                const secondCaption = document.createElement('figcaption');
                secondCaption.className = 'skriv-image-caption';
                secondCaption.contentEditable = 'true';
                secondCaption.dataset.placeholder = 'Bildetekst bilde 2...';

                // Single resize handle at bottom-right (se) corner for 2nd image wrapper
                const secondHandles = document.createElement('div');
                secondHandles.className = 'skriv-image-handles hidden';
                const secondHandle = document.createElement('div');
                secondHandle.className = 'handle handle-se';
                secondHandle.dataset.dir = 'se';
                secondHandles.appendChild(secondHandle);

                secondWrapper.appendChild(secondImg);
                secondWrapper.appendChild(secondHandles);
                secondWrapper.appendChild(secondCaption);

                slot.replaceWith(secondWrapper);
                figure.classList.add('skriv-layout-side', 'skriv-layout-dual-image');

                equalizeFlexRatios(figure);
                updateSideSlotVisibility(figure);
                selectBlock(figure, secondWrapper);
                if (onInsert) onInsert();
            } catch (err) {
                console.error('Second image insertion failed:', err);
            }
            targetDualImageSlot = null;
        }
        secondFileInput.value = '';
    });

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
        if (toolbar) toolbar.style.display = 'none';
    }

    // --- PaperTek Custom Context Menu ---
    let activeContextMenu = null;

    function hidePaperTekContextMenu() {
        if (activeContextMenu && activeContextMenu.parentNode) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }
    }

    function deleteSelectedWrapper(targetWrapper, figure) {
        const block = selectedBlock || figure || targetWrapper?.closest('.skriv-image-block');
        if (!block) return;
        saveUndoSnapshot();

        const sideText = targetWrapper?.closest('.skriv-image-sidetext') || (targetWrapper?.classList?.contains('skriv-image-sidetext') ? targetWrapper : null);
        const wrapper = targetWrapper?.closest('.skriv-image-wrapper') || (targetWrapper?.classList?.contains('skriv-image-wrapper') ? targetWrapper : null);
        const wrappers = block.querySelectorAll('.skriv-image-wrapper');
        const sideTexts = block.querySelectorAll('.skriv-image-sidetext');

        if (sideText) {
            // Delete ONLY the side-textbox!
            sideText.remove();
            showToast('Tekstboks slettet', { duration: 1500 });
        } else if (wrapper && wrappers.length > 1) {
            // Delete ONLY the targeted image wrapper!
            wrapper.remove();
            showToast(t('image.deleted'), { duration: 1500 });
        } else {
            // Fallback: delete entire figure block
            selectedBlock = block;
            deleteSelectedBlock();
            return;
        }

        // Check remaining elements in block
        const remainingWrappers = block.querySelectorAll('.skriv-image-wrapper');
        const remainingTexts = block.querySelectorAll('.skriv-image-sidetext');

        if (remainingWrappers.length === 0 && remainingTexts.length === 0) {
            block.remove();
            deselectAll();
        } else if (remainingWrappers.length === 1 && remainingTexts.length === 0) {
            block.classList.remove('skriv-layout-side', 'skriv-layout-side-reverse', 'skriv-layout-dual-image', 'skriv-valign-center', 'skriv-valign-bottom');
            const mainWrapper = remainingWrappers[0];
            mainWrapper.style.flex = '1 1 100%';
            mainWrapper.style.width = '100%';
            mainWrapper.style.maxWidth = '100%';
            const slot = block.querySelector('.skriv-image-side-slot');
            if (slot) slot.remove();
        } else {
            updateSideSlotVisibility(block);
        }

        if (onInsert) onInsert();
    }

    function showPaperTekContextMenu(x, y, figure, targetWrapper) {
        hidePaperTekContextMenu();

        const menu = document.createElement('div');
        menu.className = 'skriv-context-menu';
        menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
        menu.style.top = `${Math.min(y, window.innerHeight - 250)}px`;

        const wrappers = figure.querySelectorAll('.skriv-image-wrapper');
        const sideTexts = figure.querySelectorAll('.skriv-image-sidetext');

        const filledCount = wrappers.length + sideTexts.length;
        const hasText = sideTexts.length > 0;
        const imageCount = wrappers.length;
        const isSideText = targetWrapper && targetWrapper.classList.contains('skriv-image-sidetext');

        let deleteLabel = 'Slett bilde';
        if (isSideText) deleteLabel = 'Slett tekstboks';
        else if (wrappers.length > 1) deleteLabel = 'Slett dette bildet';

        let itemsHtml = `
            <div class="skriv-context-header">Papertek</div>
            <div class="skriv-context-divider-teal"></div>
            <div class="skriv-context-item danger" data-action="delete-image">
                <span>🗑️</span> ${deleteLabel}
            </div>
        `;

        // Add side items (Text & Image options) as long as filledCount < 3
        if (filledCount < 3) {
            if (!hasText) {
                itemsHtml += `
                    <div class="skriv-context-item" data-action="add-text">
                        <span>📝</span> Legg til tekst på siden
                    </div>
                `;
            }
            if (imageCount < 3) {
                const nextImgNum = imageCount + 1;
                itemsHtml += `
                    <div class="skriv-context-item" data-action="add-image">
                        <span>📷</span> Legg til bilde ${nextImgNum}
                    </div>
                `;
            }
        }

        // Only show layout options (Bytt side / Vertikal justering) when there are 2 or more elements!
        if (filledCount > 1) {
            itemsHtml += `
                <div class="skriv-context-item" data-action="swap-side">
                    <span>⇄</span> Bytt side (Høyre / Venstre)
                </div>
            `;
            if (hasText) {
                itemsHtml += `
                    <div class="skriv-context-item" data-action="toggle-valign">
                        <span>↕️</span> Vertikal justering (Topp/Midt/Bunn)
                    </div>
                `;
            }
        }

        itemsHtml += `
            <div class="skriv-context-item" data-action="toggle-shadow">
                <span>◐</span> Veksle skygge
            </div>
        `;

        menu.innerHTML = itemsHtml;

        function handleMenuItemClick(e) {
            const item = e.target.closest('.skriv-context-item');
            if (!item) return;
            e.preventDefault();
            e.stopPropagation();

            const action = item.dataset.action;
            hidePaperTekContextMenu();

            if (action === 'delete-image') {
                deleteSelectedWrapper(targetWrapper, figure);
            } else if (action === 'add-text') {
                saveUndoSnapshot();
                let flex = figure.querySelector('.skriv-image-flex-container');
                if (!flex) {
                    flex = document.createElement('div');
                    flex.className = 'skriv-image-flex-container';
                    const wrapper = figure.querySelector('.skriv-image-wrapper');
                    if (wrapper) flex.appendChild(wrapper);
                    figure.appendChild(flex);
                }
                const slot = figure.querySelector('.skriv-image-side-slot');
                const sideText = document.createElement('div');
                sideText.className = 'skriv-image-sidetext';
                sideText.contentEditable = 'true';
                sideText.dataset.placeholder = 'Skriv tekst ved siden av bildet her...';
                if (slot) {
                    slot.replaceWith(sideText);
                } else {
                    flex.appendChild(sideText);
                }
                figure.classList.add('skriv-layout-side');
                equalizeFlexRatios(figure);
                updateSideSlotVisibility(figure);
                sideText.focus();
                if (onInsert) onInsert();
            } else if (action === 'add-image') {
                let flex = figure.querySelector('.skriv-image-flex-container');
                if (!flex) {
                    flex = document.createElement('div');
                    flex.className = 'skriv-image-flex-container';
                    const wrapper = figure.querySelector('.skriv-image-wrapper');
                    if (wrapper) flex.appendChild(wrapper);
                    figure.appendChild(flex);
                }
                let slot = figure.querySelector('.skriv-image-side-slot');
                if (!slot) {
                    slot = createSideSlotPlaceholder(imageCount, hasText);
                    flex.appendChild(slot);
                }
                targetDualImageSlot = { figure, slot };
                setTimeout(() => secondFileInput.click(), 10);
            } else if (action === 'swap-side') {
                saveUndoSnapshot();
                let flex = figure.querySelector('.skriv-image-flex-container');
                if (flex) {
                    const items = Array.from(flex.querySelectorAll('.skriv-image-wrapper, .skriv-image-sidetext'));
                    if (items.length >= 2) {
                        flex.appendChild(items[0]); // Move 1st item to the end
                    }
                }
                equalizeFlexRatios(figure);
                if (onInsert) onInsert();
            } else if (action === 'toggle-valign') {
                saveUndoSnapshot();
                const hasCenter = figure.classList.contains('skriv-valign-center');
                const hasBottom = figure.classList.contains('skriv-valign-bottom');
                if (!hasCenter && !hasBottom) {
                    figure.classList.add('skriv-valign-center');
                } else if (hasCenter) {
                    figure.classList.remove('skriv-valign-center');
                    figure.classList.add('skriv-valign-bottom');
                } else {
                    figure.classList.remove('skriv-valign-bottom');
                }
                if (onInsert) onInsert();
            } else if (action === 'toggle-shadow') {
                saveUndoSnapshot();
                figure.classList.toggle('skriv-image-shadow');
                if (onInsert) onInsert();
            }
        }

        menu.addEventListener('mousedown', handleMenuItemClick);
        menu.addEventListener('click', handleMenuItemClick);

        document.body.appendChild(menu);
        activeContextMenu = menu;
    }

    editor.addEventListener('contextmenu', (e) => {
        const figure = e.target.closest('.skriv-image-block');
        if (figure && editor.contains(figure)) {
            // Check if user explicitly wants native menu (e.g. holding Shift key or after clicking native option)
            if (e.shiftKey) return; // Allow native menu when holding Shift
            e.preventDefault();
            e.stopPropagation();
            const targetWrapper = e.target.closest('.skriv-image-wrapper, .skriv-image-sidetext');
            selectBlock(figure, targetWrapper);
            showPaperTekContextMenu(e.clientX, e.clientY, figure, targetWrapper);
        } else {
            hidePaperTekContextMenu();
        }
    });

    function updateToolbarState(figure) {
        if (!figure) return;
        const hasShadow = figure.classList.contains('skriv-image-shadow');
        const hasSide = figure.classList.contains('skriv-layout-side') || figure.classList.contains('skriv-layout-side-reverse');
        const hasValign = figure.classList.contains('skriv-valign-center') || figure.classList.contains('skriv-valign-bottom');

        toolbar.querySelectorAll('.skriv-image-toolbar-btn').forEach(btn => {
            const action = btn.dataset.action;
            let active = false;

            if (action === 'side-text' && hasSide) active = true;
            if (action === 'shadow' && hasShadow) active = true;
            if (action === 'valign' && hasValign) active = true;

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
                saveUndoSnapshot();
                selectedBlock.style.marginLeft = '0';
                selectedBlock.style.marginRight = 'auto';
                break;
            case 'align-center':
                saveUndoSnapshot();
                selectedBlock.style.marginLeft = 'auto';
                selectedBlock.style.marginRight = 'auto';
                break;
            case 'align-right':
                saveUndoSnapshot();
                selectedBlock.style.marginLeft = 'auto';
                selectedBlock.style.marginRight = '0';
                break;
            case 'size-small':
                saveUndoSnapshot();
                if (img) img.style.width = '40%';
                updateSideSlotVisibility(selectedBlock);
                break;
            case 'size-medium':
                saveUndoSnapshot();
                if (img) img.style.width = '65%';
                updateSideSlotVisibility(selectedBlock);
                break;
            case 'size-full':
                saveUndoSnapshot();
                if (img) img.style.width = '100%';
                updateSideSlotVisibility(selectedBlock);
                break;
            case 'side-text': {
                saveUndoSnapshot();
                let sideElement = selectedBlock.querySelector('.skriv-image-sidetext, .skriv-image-side-slot');
                const hasSide = selectedBlock.classList.contains('skriv-layout-side');
                const hasReverse = selectedBlock.classList.contains('skriv-layout-side-reverse');

                let flex = selectedBlock.querySelector('.skriv-image-flex-container');
                if (!flex) {
                    flex = document.createElement('div');
                    flex.className = 'skriv-image-flex-container';
                    const wrapper = document.createElement('div');
                    wrapper.className = 'skriv-image-wrapper';
                    const imgEl = selectedBlock.querySelector('img');
                    const handlesEl = selectedBlock.querySelector('.skriv-image-handles');
                    const capEl = selectedBlock.querySelector('figcaption');
                    if (imgEl) wrapper.appendChild(imgEl);
                    if (handlesEl) wrapper.appendChild(handlesEl);
                    if (capEl) wrapper.appendChild(capEl);
                    flex.appendChild(wrapper);
                    selectedBlock.appendChild(flex);
                }

                if (!hasSide && !hasReverse) {
                    // Activate Side Mode (Image Left / Side Slot Right)
                    selectedBlock.classList.add('skriv-layout-side');
                    if (!sideElement) {
                        sideElement = createSideSlotPlaceholder();
                        flex.appendChild(sideElement);
                    }
                    sideElement.style.display = 'flex';
                } else if (hasSide) {
                    // Swap to Side Reverse (Side Slot Left / Image Right)
                    selectedBlock.classList.remove('skriv-layout-side');
                    selectedBlock.classList.add('skriv-layout-side-reverse');
                } else {
                    // Disable Side Mode & restore standard single image
                    selectedBlock.classList.remove('skriv-layout-side-reverse');
                    if (sideElement && !sideElement.textContent.trim()) {
                        sideElement.remove();
                    } else if (sideElement) {
                        sideElement.style.display = 'none';
                    }
                }
                break;
            }
            case 'swap-sides': {
                saveUndoSnapshot();
                const hasSide = selectedBlock.classList.contains('skriv-layout-side');
                const hasReverse = selectedBlock.classList.contains('skriv-layout-side-reverse');
                let sideText = selectedBlock.querySelector('.skriv-image-sidetext');

                if (!sideText) {
                    sideText = document.createElement('div');
                    sideText.className = 'skriv-image-sidetext';
                    sideText.contentEditable = 'true';
                    sideText.dataset.placeholder = 'Skriv tekst ved siden av bildet her...';
                    let flex = selectedBlock.querySelector('.skriv-image-flex-container');
                    if (flex) flex.appendChild(sideText);
                }

                if (hasSide) {
                    selectedBlock.classList.remove('skriv-layout-side');
                    selectedBlock.classList.add('skriv-layout-side-reverse');
                    sideText.style.display = 'block';
                } else if (hasReverse) {
                    selectedBlock.classList.remove('skriv-layout-side-reverse');
                    selectedBlock.classList.add('skriv-layout-side');
                    sideText.style.display = 'block';
                } else {
                    selectedBlock.classList.add('skriv-layout-side');
                    sideText.style.display = 'block';
                }
                break;
            }
            case 'valign': {
                saveUndoSnapshot();
                const hasCenter = selectedBlock.classList.contains('skriv-valign-center');
                const hasBottom = selectedBlock.classList.contains('skriv-valign-bottom');

                if (!hasCenter && !hasBottom) {
                    selectedBlock.classList.add('skriv-valign-center');
                } else if (hasCenter) {
                    selectedBlock.classList.remove('skriv-valign-center');
                    selectedBlock.classList.add('skriv-valign-bottom');
                } else {
                    selectedBlock.classList.remove('skriv-valign-bottom');
                }
                break;
            }
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

    // --- Direct Item Drag-to-Swap (Horizontal Reordering for Images & Side Text) ---
    let itemDragState = null;

    function handleItemDragStart(e) {
        if (e.target.closest('.handle, .skriv-image-toolbar, .skriv-image-drag-handle, .skriv-image-side-slot')) return;
        if (e.target.closest('.skriv-image-caption') && document.activeElement === e.target.closest('.skriv-image-caption')) return;

        const sidetextHandle = e.target.closest('.skriv-sidetext-drag-handle');
        const sidetext = e.target.closest('.skriv-image-sidetext');

        // If clicking inside side-text BUT NOT on the drag handle, allow normal text focus & editing!
        if (sidetext && !sidetextHandle) {
            return;
        }

        const targetItem = e.target.closest('.skriv-image-wrapper, .skriv-image-sidetext');
        if (!targetItem) return;

        const figure = targetItem.closest('.skriv-image-block');
        const flexContainer = targetItem.closest('.skriv-image-flex-container');
        if (!figure || !flexContainer) return;

        itemDragState = {
            targetItem,
            flexContainer,
            figure,
            startX: e.clientX,
            startY: e.clientY,
            startMarginTop: parseFloat(targetItem.style.marginTop) || 0,
            isSidetext: !!sidetext,
            dragOffsetX: 0 // Tracks physical jumps to keep cursor locked to item
        };

        targetItem.classList.add('skriv-item-dragging');
        targetItem.style.transition = 'none';
        targetItem.style.transform = `scale(1.02) translateX(0px)`;

        document.addEventListener('mousemove', handleItemDragMove);
        document.addEventListener('mouseup', handleItemDragEnd);
    }

    function handleItemDragMove(e) {
        if (!itemDragState) return;

        const { targetItem, flexContainer, figure, startX, startY, startMarginTop, isSidetext } = itemDragState;
        // Total physical displacement of the mouse from start minus any DOM layout jumps
        let dx = e.clientX - startX + itemDragState.dragOffsetX;
        const dy = e.clientY - startY;

        // Fluid gradual vertical positioning via drag for side items with discrete guide lines
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
            if (figure.classList.contains('skriv-valign-center') || figure.classList.contains('skriv-valign-bottom')) {
                // Convert CSS alignment to explicit margins to prevent visual jumping
                const containerRect = flexContainer.getBoundingClientRect();
                flexContainer.querySelectorAll('.skriv-image-wrapper, .skriv-image-sidetext').forEach(el => {
                    const elRect = el.getBoundingClientRect();
                    const topOffset = elRect.top - containerRect.top;
                    el.style.marginTop = `${topOffset}px`;
                    if (el === targetItem) {
                        itemDragState.startMarginTop = topOffset;
                        startMarginTop = topOffset;
                    }
                });
                figure.classList.remove('skriv-valign-center', 'skriv-valign-bottom');
                updateToolbarState(figure);
                saveUndoSnapshot(); // Save state since we removed classes
            }

            let maxSiblingH = 0;
            flexContainer.querySelectorAll('.skriv-image-wrapper, .skriv-image-sidetext').forEach(el => {
                if (el !== targetItem) maxSiblingH = Math.max(maxSiblingH, el.clientHeight);
            });
            const imgH = maxSiblingH || figure.clientHeight;
            const itemH = targetItem.clientHeight || 80;
            const maxMargin = Math.max(0, imgH - itemH);
            
            // Fluid drag
            const newMarginTop = Math.max(0, Math.min(startMarginTop + dy, maxMargin));
            targetItem.style.marginTop = `${newMarginTop.toFixed(1)}px`;
            
            // Discrete snapping zones for the visual guide line ONLY
            let alignment = 'top';
            if (newMarginTop < maxMargin * 0.33) {
                alignment = 'top';
                targetItem.classList.remove('skriv-align-middle');
            } else if (newMarginTop < maxMargin * 0.66) {
                alignment = 'middle';
                targetItem.classList.add('skriv-align-middle');
            } else {
                alignment = 'bottom';
                targetItem.classList.remove('skriv-align-middle');
            }
            
            // Manage Visual Guide Line
            let guide = figure.querySelector('.skriv-alignment-guide');
            if (!guide) {
                guide = document.createElement('div');
                guide.className = 'skriv-alignment-guide';
                flexContainer.appendChild(guide);
            }
            
            // Position the guide line based on alignment relative to image height
            if (alignment === 'top') {
                guide.style.top = '0px';
            } else if (alignment === 'middle') {
                guide.style.top = `${imgH / 2}px`;
            } else {
                guide.style.top = `${imgH}px`;
            }
            
            guide.style.display = 'block';

            if (onInsert) onInsert();
        }

        // Horizontal Side-Swapping based on robust Visual Center intersection
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
            const items = Array.from(flexContainer.querySelectorAll('.skriv-image-wrapper, .skriv-image-sidetext'));
            const idx = items.indexOf(targetItem);
            if (idx === -1) return;

            const targetRect = targetItem.getBoundingClientRect();
            // The item's visual center in screen space
            const visualCenter = targetRect.left + (targetRect.width / 2) + dx;

            let canSwapRight = true;
            if (idx > 0) {
                const prevItem = items[idx - 1];
                const prevRect = prevItem.getBoundingClientRect();
                const prevCenter = prevRect.left + (prevRect.width / 2);

                if (visualCenter < prevCenter - 15) {
                    // Dragged left: swap with left sibling
                    saveUndoSnapshot();
                    flexContainer.insertBefore(targetItem, prevItem);
                    equalizeFlexRatios(figure);
                    // FLIP animation
                    const newPrevRect = prevItem.getBoundingClientRect();
                    const shiftX = prevRect.left - newPrevRect.left;
                    prevItem.style.transition = 'none';
                    prevItem.style.transform = `translateX(${shiftX}px)`;
                    prevItem.getBoundingClientRect();
                    prevItem.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
                    prevItem.style.transform = 'translateX(0)';
                    // Adjust offset
                    const newTargetRect = targetItem.getBoundingClientRect();
                    const jumpX = newTargetRect.left - targetRect.left;
                    itemDragState.dragOffsetX -= jumpX;
                    dx -= jumpX;
                    if (onInsert) onInsert();
                    canSwapRight = false; // We just swapped left, don't immediately swap right
                }
            }
            
            if (canSwapRight && idx < items.length - 1) {
                const nextItem = items[idx + 1];
                const nextRect = nextItem.getBoundingClientRect();
                const nextCenter = nextRect.left + (nextRect.width / 2);

                if (visualCenter > nextCenter + 15) {
                    // Dragged right: swap with right sibling
                    saveUndoSnapshot();

                    flexContainer.insertBefore(nextItem, targetItem);
                    equalizeFlexRatios(figure);

                    // FLIP animation for the item that was pushed aside
                    const newNextRect = nextItem.getBoundingClientRect();
                    const shiftX = nextRect.left - newNextRect.left;
                    nextItem.style.transition = 'none';
                    nextItem.style.transform = `translateX(${shiftX}px)`;
                    nextItem.getBoundingClientRect(); // force reflow
                    nextItem.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
                    nextItem.style.transform = 'translateX(0)';

                    // Adjust drag offset so targetItem stays exactly under the cursor despite DOM jump
                    const newTargetRect = targetItem.getBoundingClientRect();
                    const jumpX = newTargetRect.left - targetRect.left;
                    itemDragState.dragOffsetX -= jumpX;
                    dx -= jumpX;

                    if (onInsert) onInsert();
                }
            }
        }

        // Continually apply the updated visual transform so the dragged item follows the mouse
        targetItem.style.transform = `scale(1.02) translateX(${dx}px)`;
    }

    function handleItemDragEnd() {
        if (itemDragState) {
            const { targetItem } = itemDragState;
            targetItem.classList.remove('skriv-item-dragging');
            targetItem.classList.remove('skriv-align-middle');

            // Glide smoothly back into its natural DOM position
            targetItem.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            targetItem.style.transform = 'scale(1) translateX(0)';

            // Clean up inline styles once transition is done
            setTimeout(() => {
                if (!targetItem.classList.contains('skriv-item-dragging')) {
                    targetItem.style.transition = '';
                    targetItem.style.transform = '';
                }
            }, 300);

            if (itemDragState.figure) {
                const guide = itemDragState.figure.querySelector('.skriv-alignment-guide');
                if (guide) guide.remove();
            }
            itemDragState = null;
        }
        document.removeEventListener('mousemove', handleItemDragMove);
        document.removeEventListener('mouseup', handleItemDragEnd);
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

        // Horizontal Drag-to-Swap for Side Layout (Left <-> Right)
        const fig = dragState.figure;
        const hasSide = fig && (fig.classList.contains('skriv-layout-side') || fig.classList.contains('skriv-layout-side-reverse'));
        if (hasSide) {
            const figRect = fig.getBoundingClientRect();
            const figureX = e.clientX - figRect.left;
            const figWidth = figRect.width;

            if (figureX > figWidth * 0.55 && fig.classList.contains('skriv-layout-side-reverse')) {
                saveUndoSnapshot();
                fig.classList.remove('skriv-layout-side-reverse');
                fig.classList.add('skriv-layout-side');
                if (onInsert) onInsert();
            } else if (figureX < figWidth * 0.45 && fig.classList.contains('skriv-layout-side')) {
                saveUndoSnapshot();
                fig.classList.remove('skriv-layout-side');
                fig.classList.add('skriv-layout-side-reverse');
                if (onInsert) onInsert();
            }
        }

        // Show drop indicator for vertical reordering
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
            ensureTypingSpace();
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
        const nestedEditable = e.target.closest('.skriv-image-sidetext, .skriv-image-caption');
        if (nestedEditable && !e.target.closest('.skriv-sidetext-drag-handle, .handle')) {
            deselectAll();
            
            // Ensure contentEditable is true
            if (nestedEditable.contentEditable !== 'true') {
                nestedEditable.contentEditable = 'true';
            }

            // Ensure empty blocks contain at least a node for WebKit caret attachment
            const hasRealContent = Array.from(nestedEditable.childNodes).some(node => {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') return true;
                if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('skriv-sidetext-drag-handle')) return true;
                return false;
            });
            
            if (!hasRealContent) {
                // If it only has a non-editable handle, WebKit will silently fail to place the caret
                nestedEditable.appendChild(document.createElement('br'));
                
                // Explicitly select the new <br> so focus lands correctly in the empty box
                setTimeout(() => {
                    nestedEditable.focus();
                    const range = document.createRange();
                    range.selectNodeContents(nestedEditable);
                    range.collapse(false); // collapse to end
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }, 0);
            }

            // Allow native browser mousedown to place the caret naturally
            return;
        }

        if (e.target.closest('.handle')) {
            handleResizeStart(e);
        } else if (e.target.closest('.skriv-image-drag-handle')) {
            handleDragHandleDown(e);
        } else if (e.target.closest('.skriv-image-wrapper, .skriv-sidetext-drag-handle')) {
            handleItemDragStart(e);
        }
    });

    // --- File drop insertion indicator ---
    const fileDropIndicator = document.createElement('div');
    fileDropIndicator.className = 'skriv-image-file-drop-line';
    fileDropIndicator.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        height: 3px;
        background: #059669;
        box-shadow: 0 0 6px rgba(5, 150, 105, 0.6);
        border-radius: 2px;
        pointer-events: none;
        display: none;
        z-index: 9999;
        transition: top 0.05s ease-out;
    `;
    container.appendChild(fileDropIndicator);

    let savedRange = null;

    /**
     * Insert image at the current cursor position (or end of editor).
     * Splits paragraph if cursor is inside text block.
     */
    async function insertImageFromFile(file) {
        const error = validateFile(file);
        if (error) {
            showToast(t(error), { duration: 3000 });
            return;
        }

        try {
            saveUndoSnapshot();
            const base64 = await compressImage(file);
            const figure = createImageBlock(base64);

            const sel = window.getSelection();
            let range = null;
            if (savedRange) {
                range = savedRange;
                savedRange = null;
            } else if (sel && sel.rangeCount > 0) {
                range = sel.getRangeAt(0);
            }

            if (range && editor.contains(range.commonAncestorContainer)) {
                let block = range.startContainer;
                while (block && block !== editor && block.parentNode !== editor) {
                    block = block.parentNode;
                }

                if (block && block !== editor) {
                    const tag = block.tagName ? block.tagName.toUpperCase() : '';
                    if (tag === 'P' || /^H[1-6]$/.test(tag)) {
                        const rangeBefore = document.createRange();
                        rangeBefore.setStart(block, 0);
                        rangeBefore.setEnd(range.startContainer, range.startOffset);

                        const rangeAfter = document.createRange();
                        rangeAfter.setStart(range.endContainer, range.endOffset);
                        rangeAfter.setEnd(block, block.childNodes.length);

                        const beforeFrag = rangeBefore.extractContents();
                        const afterFrag = rangeAfter.extractContents();

                        const pBefore = document.createElement(tag.toLowerCase());
                        pBefore.appendChild(beforeFrag);

                        const pAfter = document.createElement(tag.toLowerCase());
                        pAfter.appendChild(afterFrag);

                        if (!pBefore.textContent.trim() && pBefore.children.length === 0) {
                            pBefore.remove();
                        } else if (!pBefore.textContent.trim()) {
                            pBefore.innerHTML = '<br>';
                        }

                        if (!pAfter.textContent.trim() && pAfter.children.length === 0) {
                            pAfter.innerHTML = '<br>';
                        }

                        if (pBefore.parentNode) {
                            editor.insertBefore(pBefore, block);
                        }
                        editor.insertBefore(figure, block);
                        editor.insertBefore(pAfter, block);
                        block.remove();

                        // Focus pAfter
                        const newRange = document.createRange();
                        newRange.setStart(pAfter, 0);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    } else {
                        editor.insertBefore(figure, block.nextSibling);
                    }
                } else {
                    editor.appendChild(figure);
                }
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
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            if (editor.contains(range.commonAncestorContainer)) {
                savedRange = range.cloneRange();
            }
        }
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

            let range = null;
            if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(e.clientX, e.clientY);
            } else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                if (pos) {
                    range = document.createRange();
                    range.setStart(pos.offsetNode, pos.offset);
                    range.collapse(true);
                }
            }

            if (range) {
                const rects = range.getClientRects();
                const containerRect = container.getBoundingClientRect();
                let targetY = null;
                if (rects.length > 0) {
                    targetY = rects[0].top - containerRect.top;
                } else {
                    let node = range.startContainer;
                    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
                    if (node && node.getBoundingClientRect) {
                        const r = node.getBoundingClientRect();
                        targetY = r.bottom - containerRect.top;
                    }
                }

                if (targetY !== null) {
                    fileDropIndicator.style.display = 'block';
                    fileDropIndicator.style.top = `${targetY}px`;
                }
            }
        }
    }

    function handleDragLeave(e) {
        if (!editor.contains(e.relatedTarget)) {
            editor.classList.remove('skriv-image-dragover');
            fileDropIndicator.style.display = 'none';
        }
    }

    function handleDrop(e) {
        editor.classList.remove('skriv-image-dragover');
        fileDropIndicator.style.display = 'none';
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
        if (!imageFile) return;

        e.preventDefault();

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

    // Prevent native dragging of the image block and its structural contents!
    editor.addEventListener('dragstart', (e) => {
        const figure = e.target.closest('.skriv-image-block');
        if (figure) {
            // Allow native text dragging if originating from an editable area (like side-text or caption)
            const editable = e.target.closest('.skriv-image-sidetext, .skriv-image-caption');
            if (editable && e.target.tagName !== 'IMG') {
                return;
            }
            // Prevent all other native dragging (images, wrappers) to avoid structural breakage
            e.preventDefault();
        }
    });

    // --- Click selection & deselection ---
    function selectBlock(figure, targetWrapper) {
        deselectAll();
        selectedBlock = figure;
        figure.classList.add('selected');
        figure.querySelectorAll('.skriv-image-handles').forEach(h => h.classList.remove('hidden'));
        showToolbar(figure);
    }

    function deselectAll() {
        cleanupStraySidetexts();
        // Clear JS reference
        if (selectedBlock) {
            selectedBlock.classList.remove('selected');
            selectedBlock.querySelectorAll('.skriv-image-handles').forEach(h => h.classList.add('hidden'));
            selectedBlock = null;
        }
        // Also clear any stale DOM-only selections (e.g. from rehydrated HTML)
        editor.querySelectorAll('.skriv-image-block.selected').forEach(fig => {
            fig.classList.remove('selected');
            fig.querySelectorAll('.skriv-image-handles').forEach(h => h.classList.add('hidden'));
        });
        hideToolbar();
    }

    function handleEditorClick(e) {
        // Handle clicks on side slot placeholder chips (Text or 2nd Image)
        const chipText = e.target.closest('.skriv-slot-chip.chip-text');
        const chipImage = e.target.closest('.skriv-slot-chip.chip-image');

        if (chipText) {
            e.preventDefault();
            e.stopPropagation();
            const figure = chipText.closest('.skriv-image-block');
            const slot = chipText.closest('.skriv-image-side-slot');
            if (figure && slot) {
                saveUndoSnapshot();
                const sideText = document.createElement('div');
                sideText.className = 'skriv-image-sidetext';
                sideText.contentEditable = 'true';
                sideText.dataset.placeholder = 'Skriv tekst ved siden av bildet her...';
                slot.replaceWith(sideText);
                figure.classList.add('skriv-layout-side');
                equalizeFlexRatios(figure);
                updateSideSlotVisibility(figure);
                sideText.focus();
                if (onInsert) onInsert();
            }
            return;
        }

        if (chipImage) {
            e.preventDefault();
            e.stopPropagation();
            const figure = chipImage.closest('.skriv-image-block');
            const slot = chipImage.closest('.skriv-image-side-slot');
            if (figure && slot) {
                targetDualImageSlot = { figure, slot };
                secondFileInput.click();
            }
            return;
        }

        const figure = e.target.closest('.skriv-image-block');
        if (figure && editor.contains(figure)) {
            // Don't select figure if clicking inside editable text box
            const sidetext = e.target.closest('.skriv-image-sidetext');
            if (sidetext && !e.target.closest('.skriv-sidetext-drag-handle')) {
                deselectAll();
                return;
            }
            if (e.target.closest('.skriv-image-caption, .skriv-image-side-slot')) {
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

    // Also deselect on mousedown outside editor (but NOT on toolbar, context menu or right-click)
    function handleDocumentClick(e) {
        if (e.button === 2) return; // Do NOT dismiss PaperTek Context Menu on right-click mousedown
        if (activeContextMenu && activeContextMenu.contains(e.target)) return; // DO NOT dismiss context menu when clicking inside it!

        hidePaperTekContextMenu();
        if (!editor.contains(e.target) && !toolbar.contains(e.target) && selectedBlock) {
            deselectAll();
        }
    }
    document.addEventListener('mousedown', handleDocumentClick);

    // --- Delete selected image ---
    function deleteSelectedBlock() {
        if (!selectedBlock) return;
        saveUndoSnapshot();
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
        // Intercept Enter key inside caption or sidetext to insert <br> instead of splitting container
        const editableText = e.target.closest('.skriv-image-caption, .skriv-image-sidetext');
        if (editableText && e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const br = document.createElement('br');
                range.insertNode(br);

                // Add trailing br if inserted at end so cursor moves to next line
                if (!br.nextSibling || (br.nextSibling.nodeType === Node.TEXT_NODE && !br.nextSibling.textContent)) {
                    const extraBr = document.createElement('br');
                    br.parentNode.insertBefore(extraBr, br.nextSibling);
                }

                range.setStartAfter(br);
                range.setEndAfter(br);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            if (onInsert) onInsert();
            return;
        }

        // Global Undo / Redo keybinding check (Cmd+Z / Ctrl+Z)
        if (handleUndoRedo(e)) return;

        if (!selectedBlock) return;

        // NEVER delete image block if user is typing inside an editable text element or input!
        if (e.target.isContentEditable || e.target.closest('.skriv-image-caption, .skriv-image-sidetext, input, textarea')) {
            return;
        }

        // Only delete if Backspace/Delete is pressed while explicitly focusing figure element
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedBlock();
            return;
        }

        if (e.key === 'ArrowUp' && e.altKey) {
            e.preventDefault();
            const prev = selectedBlock.previousElementSibling;
            if (prev) {
                saveUndoSnapshot();
                selectedBlock.parentNode.insertBefore(selectedBlock, prev);
                selectedBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                positionToolbar(selectedBlock);
                if (onInsert) onInsert();
            }
            return;
        }

        if (e.key === 'ArrowDown' && e.altKey) {
            e.preventDefault();
            const next = selectedBlock.nextElementSibling;
            if (next) {
                saveUndoSnapshot();
                selectedBlock.parentNode.insertBefore(selectedBlock, next.nextElementSibling);
                selectedBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                positionToolbar(selectedBlock);
                if (onInsert) onInsert();
            }
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            if (document.activeElement === selectedBlock) {
                e.preventDefault();
                const textTarget = selectedBlock.querySelector('.skriv-image-sidetext') || selectedBlock.querySelector('.skriv-image-caption') || selectedBlock.querySelector('figcaption');
                if (textTarget) {
                    textTarget.focus();
                    const range = document.createRange();
                    range.selectNodeContents(textTarget);
                    range.collapse(false);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }
    }
    // Register in capture phase on editor so Enter is intercepted BEFORE native contenteditable split
    editor.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown);
    
    function handleFocus(e) {
        if (e.target.classList && e.target.classList.contains('skriv-image-block')) {
            selectBlock(e.target);
        }
    }
    editor.addEventListener('focus', handleFocus, true);

    // --- Resize handles ---
    let resizeState = null;

    function handleResizeStart(e) {
        const handle = e.target.closest('.handle');
        if (!handle) return;

        const figure = handle.closest('.skriv-image-block');
        const wrapper = handle.closest('.skriv-image-wrapper');
        const img = wrapper?.querySelector('img') || figure?.querySelector('img');
        if (!figure || !img) return;

        e.preventDefault();
        e.stopPropagation();
        resizing = true;
        figure.classList.add('skriv-resizing');

        resizeState = {
            figure,
            wrapper,
            img,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: wrapper ? wrapper.offsetWidth : img.offsetWidth,
            dir: handle.dataset.dir,
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    }

    function handleResizeMove(e) {
        if (!resizeState) return;

        const { figure, wrapper, img, startX, startWidth, dir } = resizeState;
        let dx = e.clientX - startX;

        let flexContainer = figure.querySelector('.skriv-image-flex-container');
        const figureStyle = window.getComputedStyle(figure);
        const padX = (parseFloat(figureStyle.paddingLeft) || 10) + (parseFloat(figureStyle.paddingRight) || 10);
        const containerW = flexContainer ? flexContainer.clientWidth : (figure.clientWidth - padX) || editor.clientWidth;
        
        const targetWrapper = wrapper || figure.querySelector('.skriv-image-wrapper');
        const hasSide = figure.classList.contains('skriv-layout-side') || figure.classList.contains('skriv-layout-side-reverse');

        if (hasSide && targetWrapper) {
            // INDIVIDUAL IMAGE RESIZING: Clamp targetWrapper flex percent so sibling items NEVER leave the canvas box!
            const flexItems = Array.from(figure.querySelectorAll('.skriv-image-wrapper, .skriv-image-sidetext'));
            const otherItems = flexItems.filter(item => item !== targetWrapper);

            // Sum width percentages of all OTHER sibling items currently on the canvas
            const sumOtherPercents = otherItems.reduce((acc, sibling) => {
                const sibW = sibling.offsetWidth || 0;
                return acc + (sibW / containerW) * 100;
            }, 0);

            const count = flexItems.length;
            const gapPx = 16 * (count - 1);
            const gapPercent = (gapPx / containerW) * 100;

            // Absolute maximum flex percentage targetWrapper can consume without pushing siblings outside the box
            const maxAllowedPercent = Math.max(12, 100 - gapPercent - sumOtherPercents);

            let effectiveDx = dx;
            if (dir === 'nw' || dir === 'sw') effectiveDx = -dx;

            const requestedPx = startWidth + effectiveDx;
            const requestedPercent = (requestedPx / containerW) * 100;
            const flexPercent = Math.max(12, Math.min(requestedPercent, maxAllowedPercent));

            targetWrapper.style.flex = `0 0 ${flexPercent.toFixed(2)}%`;
            targetWrapper.style.maxWidth = `${flexPercent.toFixed(2)}%`;
            targetWrapper.style.width = `${flexPercent.toFixed(2)}%`;

            const wrapperImg = targetWrapper.querySelector('img');
            if (wrapperImg) wrapperImg.style.width = '100%';

            // Calculate total sum of flex percentages across ALL filled items
            const totalFilledPercent = flexItems.reduce((acc, item) => {
                const w = item === targetWrapper ? (flexPercent * containerW / 100) : (item.offsetWidth || 0);
                return acc + (w / containerW) * 100;
            }, 0);

            // Dynamically hide/reveal side slot placeholder based on total filled width
            const slot = figure.querySelector('.skriv-image-side-slot');
            if (slot) {
                slot.style.display = totalFilledPercent >= 82 ? 'none' : 'flex';
            }
        } else {
            // Standard single image mode: resize img width
            if (dir === 'nw' || dir === 'sw') dx = -dx;
            const newWidth = Math.max(MIN_RESIZE_WIDTH, Math.min(startWidth + dx, editor.clientWidth));
            img.style.width = `${newWidth}px`;
            
            // We NO LONGER call updateSideSlotVisibility here because restructuring the DOM 
            // and forcing synchronous layout while the user is dragging causes massive lag.
            // It will safely run on handleResizeEnd instead.
        }
    }

    function handleResizeEnd() {
        if (resizeState) {
            const { figure } = resizeState;
            resizing = false;

            updateSideSlotVisibility(figure);
            
            if (figure) figure.classList.remove('skriv-resizing');

            resizeState = null;
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
            if (onInsert) onInsert(); // trigger save after resize
        }
    }



    // --- Cleanup ---
    function destroy() {
        editor.removeEventListener('paste', handlePaste);
        editor.removeEventListener('dragover', handleDragOver);
        editor.removeEventListener('dragleave', handleDragLeave);
        editor.removeEventListener('drop', handleDrop);
        editor.removeEventListener('click', handleEditorClick);
        document.removeEventListener('mousedown', handleDocumentClick);
        hidePaperTekContextMenu();
        editor.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('mousemove', handleItemDragMove);
        document.removeEventListener('mouseup', handleItemDragEnd);
        window.removeEventListener('scroll', handleScrollResize, true);
        window.removeEventListener('resize', handleScrollResize);
        toolbar.removeEventListener('click', handleToolbarClick);
        if (toolbar.parentNode) toolbar.remove();
        if (dropIndicator?.parentNode) dropIndicator.remove();
        if (fileDropIndicator?.parentNode) fileDropIndicator.remove();
        if (dragGhost?.parentNode) dragGhost.remove();
        if (fileInput?.parentNode) fileInput.remove();
        if (secondFileInput?.parentNode) secondFileInput.remove();
        deselectAll();
    }

    function ensureTypingSpace() {
        if (editor.firstElementChild && editor.firstElementChild.tagName === 'FIGURE') {
            const p = document.createElement('p');
            p.appendChild(document.createElement('br'));
            editor.insertBefore(p, editor.firstElementChild);
        }
        if (editor.lastElementChild && editor.lastElementChild.tagName === 'FIGURE') {
            const p = document.createElement('p');
            p.appendChild(document.createElement('br'));
            editor.appendChild(p);
        }
    }

    // Run once on load to ensure initial state has padding
    setTimeout(ensureTypingSpace, 100);

    return { destroy, openFilePicker };
}
