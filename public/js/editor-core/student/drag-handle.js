import { t } from '../shared/i18n.js';

const MOVABLE_BLOCK_TAGS = new Set([
    'p',
    'h1',
    'h2',
    'ul',
    'ol',
    'blockquote',
    'div',
    'table',
]);

/**
 * Add pointer and keyboard block reordering to a contenteditable editor.
 *
 * Alt+ArrowUp/Alt+ArrowDown work while the caret is inside a top-level
 * block. The same arrows work without Alt while the drag handle is focused.
 * Programmatic moves deliberately avoid execCommand and undo shortcuts so
 * the browser remains the sole owner of the editor's native undo history.
 */
export function initDragHandle(editor, options = {}) {
    let handleEl = null;
    let currentBlock = null;
    let draggedBlock = null;
    let currentDropTarget = null;
    let currentDropClass = null;
    let draggedEmptySibling = null;
    let dropLineEl = null;
    let dragStartTimer = null;
    let destroyed = false;

    const styleEl = document.createElement('style');
    styleEl.dataset.skrivDragStyles = 'true';
    styleEl.textContent = `
        .skriv-editor-content > * {
            transition: opacity 0.15s ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
            .skriv-editor-content > * {
                transition: none;
            }
        }
    `;
    document.head.appendChild(styleEl);

    function createDropLine() {
        if (dropLineEl || destroyed) return;
        dropLineEl = document.createElement('div');
        dropLineEl.className = 'absolute h-0.5 bg-emerald-500 z-50 pointer-events-none transition-all duration-100 hidden rounded-full';
        dropLineEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(dropLineEl);
    }

    function clearDropTarget() {
        currentDropTarget = null;
        currentDropClass = null;
        if (dropLineEl) dropLineEl.classList.add('hidden');
    }

    function isEmptyBlock(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.tagName.toLowerCase() !== 'p') return false;
        const html = node.innerHTML.trim();
        return html === '' || html === '<br>' || html === '<br/>';
    }

    function getTopLevelBlock(node) {
        while (node && node !== editor && node !== document.body) {
            if (
                node.nodeType === 1
                && node.parentNode === editor
                && MOVABLE_BLOCK_TAGS.has(node.tagName.toLowerCase())
            ) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function getSelectedBlock() {
        const selection = document.getSelection?.();
        if (!selection || selection.rangeCount === 0) return null;
        if (!editor.contains(selection.anchorNode)) return null;
        return getTopLevelBlock(selection.anchorNode);
    }

    function setHandleActive(active) {
        if (!handleEl) return;
        handleEl.tabIndex = active ? 0 : -1;
        handleEl.setAttribute('aria-hidden', active ? 'false' : 'true');
        handleEl.classList.toggle('opacity-0', !active);
        handleEl.classList.toggle('pointer-events-none', !active);
    }

    function createHandle() {
        if (handleEl || destroyed) return;
        handleEl = document.createElement('button');
        handleEl.type = 'button';
        handleEl.className = 'skriv-block-drag-handle absolute z-40 w-7 h-7 flex items-center justify-center rounded text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 cursor-grab opacity-0 pointer-events-none transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';
        handleEl.innerHTML = '<svg class="w-3 h-4" aria-hidden="true" focusable="false" fill="currentColor" viewBox="0 0 16 16"><path d="M4 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm5-10a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>';
        handleEl.setAttribute('draggable', 'true');
        handleEl.setAttribute('aria-label', t('dragHandle.label'));
        handleEl.setAttribute('aria-description', t('dragHandle.keyboardHint'));
        handleEl.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
        handleEl.setAttribute('title', t('dragHandle.keyboardHint'));
        handleEl.tabIndex = -1;
        document.body.appendChild(handleEl);

        handleEl.addEventListener('dragstart', onHandleDragStart);
        handleEl.addEventListener('dragend', onHandleDragEnd);
        handleEl.addEventListener('keydown', onHandleKeyDown);
    }

    function updateHandlePosition(block) {
        if (!block || destroyed) return;
        if (!handleEl) createHandle();
        if (!handleEl) return;

        currentBlock = block;
        const rect = block.getBoundingClientRect();
        handleEl.style.left = `${rect.left + (window.scrollX || 0) - 32}px`;
        handleEl.style.top = `${rect.top + (window.scrollY || 0)}px`;
        setHandleActive(true);
    }

    function hideHandle() {
        if (!handleEl || document.activeElement === handleEl) return;
        setHandleActive(false);
    }

    function getDraggedCompanion(block) {
        return isEmptyBlock(block?.nextSibling) ? block.nextSibling : null;
    }

    function notifyMove() {
        if (typeof options.onDragDrop === 'function') options.onDragDrop();
    }

    function placeBlockRelative(block, companion, target, placeAfter) {
        if (!block || !target || block === target || companion === target) return false;

        // Avoid re-inserting a two-node group into itself at its current edge.
        if (placeAfter && target.nextSibling === block) return false;
        const nodeAfterGroup = companion?.nextSibling || block.nextSibling;
        if (!placeAfter && target === nodeAfterGroup) return false;

        const referenceNode = placeAfter ? target.nextSibling : target;
        editor.insertBefore(block, referenceNode);
        if (companion) editor.insertBefore(companion, referenceNode);
        return true;
    }

    function moveBlockByDirection(block, direction) {
        if (!block || block.parentNode !== editor) return false;

        const companion = getDraggedCompanion(block);
        const target = direction < 0
            ? block.previousElementSibling
            : (companion?.nextElementSibling || block.nextElementSibling);

        if (!target) return false;
        const moved = placeBlockRelative(block, companion, target, direction > 0);
        if (!moved) return false;

        currentBlock = block;
        updateHandlePosition(block);
        notifyMove();
        return true;
    }

    function directionForKey(event) {
        if (event.key === 'ArrowUp') return -1;
        if (event.key === 'ArrowDown') return 1;
        return 0;
    }

    function onHandleKeyDown(event) {
        const direction = directionForKey(event);
        if (!direction || event.ctrlKey || event.metaKey) return;

        event.preventDefault();
        event.stopPropagation();
        const moved = moveBlockByDirection(currentBlock, direction);
        if (!moved) return;

        handleEl?.focus({ preventScroll: true });
    }

    function onEditorKeyDown(event) {
        const direction = directionForKey(event);
        if (!direction || !event.altKey || event.ctrlKey || event.metaKey) return;

        event.preventDefault();
        event.stopPropagation();
        const block = getSelectedBlock();
        const moved = moveBlockByDirection(block, direction);
        if (!moved) return;

        // Moving a DOM node preserves a range inside that node. Do not create a
        // new selection or invoke editing commands; just retain editor focus.
        if (document.activeElement !== editor) editor.focus({ preventScroll: true });
    }

    function onHandleDragStart(event) {
        if (!currentBlock) {
            event.preventDefault();
            return;
        }

        draggedBlock = currentBlock;
        draggedEmptySibling = getDraggedCompanion(currentBlock);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', ' ');

        try {
            event.dataTransfer.setDragImage(currentBlock, 0, 0);
        } catch (_error) {
            // Some browsers do not allow arbitrary elements as a drag image.
        }

        if (dragStartTimer !== null) clearTimeout(dragStartTimer);
        dragStartTimer = setTimeout(() => {
            dragStartTimer = null;
            draggedBlock?.classList.add('opacity-30');
            draggedEmptySibling?.classList.add('opacity-30');
        }, 0);
    }

    function resetDragState() {
        if (dragStartTimer !== null) {
            clearTimeout(dragStartTimer);
            dragStartTimer = null;
        }
        draggedBlock?.classList.remove('opacity-30');
        draggedEmptySibling?.classList.remove('opacity-30');
        draggedBlock = null;
        draggedEmptySibling = null;
        clearDropTarget();
    }

    function onHandleDragEnd() {
        resetDragState();
        if (currentBlock?.parentNode === editor) updateHandlePosition(currentBlock);
    }

    function onEditorMouseMove(event) {
        const block = getTopLevelBlock(event.target);
        if (block) {
            updateHandlePosition(block);
            return;
        }

        const overHandle = handleEl && handleEl.contains(event.target);
        if (!overHandle && !editor.contains(document.activeElement)) hideHandle();
    }

    function onEditorMouseLeave(event) {
        const overHandle = handleEl && handleEl.contains(event.relatedTarget);
        if (!overHandle && !editor.contains(document.activeElement)) hideHandle();
    }

    function onEditorFocusIn(event) {
        const block = getSelectedBlock() || getTopLevelBlock(event.target);
        if (block) updateHandlePosition(block);
    }

    function onEditorClick(event) {
        const block = getTopLevelBlock(event.target) || getSelectedBlock();
        if (block) updateHandlePosition(block);
    }

    function onSelectionChange() {
        const block = getSelectedBlock();
        if (block) {
            updateHandlePosition(block);
        } else if (document.activeElement !== handleEl) {
            hideHandle();
        }
    }

    function onViewportChange() {
        if (currentBlock?.parentNode === editor && handleEl?.tabIndex === 0) {
            updateHandlePosition(currentBlock);
        }
        clearDropTarget();
    }

    function onEditorDragOver(event) {
        if (!draggedBlock) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        const targetBlock = getTopLevelBlock(event.target);
        if (!targetBlock || targetBlock === draggedBlock || targetBlock === draggedEmptySibling) {
            clearDropTarget();
            return;
        }

        const rect = targetBlock.getBoundingClientRect();
        const dropAfter = event.clientY > rect.top + rect.height / 2;
        const newClass = dropAfter ? 'skriv-drag-over-after' : 'skriv-drag-over-before';

        if (currentDropTarget === targetBlock && currentDropClass === newClass) return;
        currentDropTarget = targetBlock;
        currentDropClass = newClass;
        if (!dropLineEl) createDropLine();
        if (!dropLineEl) return;

        const lineY = dropAfter ? rect.bottom : rect.top;
        dropLineEl.style.left = `${rect.left + (window.scrollX || 0)}px`;
        dropLineEl.style.width = `${rect.width}px`;
        dropLineEl.style.top = `${lineY + (window.scrollY || 0) - 1}px`;
        dropLineEl.classList.remove('hidden');
    }

    function onEditorDragLeave(event) {
        if (draggedBlock && !editor.contains(event.relatedTarget)) clearDropTarget();
    }

    function onEditorDrop(event) {
        if (!draggedBlock) return;
        event.preventDefault();

        const block = draggedBlock;
        const companion = draggedEmptySibling;
        let targetBlock = currentDropTarget;
        let dropAfter = currentDropClass === 'skriv-drag-over-after';
        clearDropTarget();

        if (!targetBlock && document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(event.clientX, event.clientY);
            targetBlock = getTopLevelBlock(range?.startContainer);
            if (targetBlock) {
                const rect = targetBlock.getBoundingClientRect();
                dropAfter = event.clientY > rect.top + rect.height / 2;
            }
        }

        const moved = placeBlockRelative(block, companion, targetBlock, dropAfter);
        resetDragState();

        if (moved) {
            currentBlock = block;
            updateHandlePosition(block);
            notifyMove();
        }
    }

    createHandle();

    editor.addEventListener('mousemove', onEditorMouseMove);
    editor.addEventListener('mouseleave', onEditorMouseLeave);
    editor.addEventListener('focusin', onEditorFocusIn);
    editor.addEventListener('click', onEditorClick);
    editor.addEventListener('keydown', onEditorKeyDown);
    editor.addEventListener('dragover', onEditorDragOver);
    editor.addEventListener('dragleave', onEditorDragLeave);
    editor.addEventListener('drop', onEditorDrop);
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);

    function destroy() {
        if (destroyed) return;
        destroyed = true;

        editor.removeEventListener('mousemove', onEditorMouseMove);
        editor.removeEventListener('mouseleave', onEditorMouseLeave);
        editor.removeEventListener('focusin', onEditorFocusIn);
        editor.removeEventListener('click', onEditorClick);
        editor.removeEventListener('keydown', onEditorKeyDown);
        editor.removeEventListener('dragover', onEditorDragOver);
        editor.removeEventListener('dragleave', onEditorDragLeave);
        editor.removeEventListener('drop', onEditorDrop);
        document.removeEventListener('selectionchange', onSelectionChange);
        window.removeEventListener('scroll', onViewportChange, true);
        window.removeEventListener('resize', onViewportChange);

        handleEl?.removeEventListener('dragstart', onHandleDragStart);
        handleEl?.removeEventListener('dragend', onHandleDragEnd);
        handleEl?.removeEventListener('keydown', onHandleKeyDown);

        resetDragState();
        handleEl?.remove();
        dropLineEl?.remove();
        styleEl.remove();
        handleEl = null;
        dropLineEl = null;
        currentBlock = null;
    }

    return { destroy };
}
