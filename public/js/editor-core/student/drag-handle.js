export function initDragHandle(editor, options = {}) {
    let handleEl = null;
    let currentBlock = null;
    let draggedBlock = null;
    let currentDropTarget = null;
    let currentDropClass = null;
    let draggedEmptySibling = null;
    let dropLineEl = null;

    if (!document.getElementById('skriv-drag-styles')) {
        const style = document.createElement('style');
        style.id = 'skriv-drag-styles';
        style.innerHTML = `
            /* Add baseline transition to all blocks so they snap back smoothly */
            .skriv-editor-content > * {
                transition: opacity 0.15s ease-out;
            }
        `;
        document.head.appendChild(style);
    }

    function createDropLine() {
        if (dropLineEl) return;
        dropLineEl = document.createElement('div');
        dropLineEl.className = 'absolute h-0.5 bg-emerald-500 z-50 pointer-events-none transition-all duration-100 hidden rounded-full';
        document.body.appendChild(dropLineEl);
    }

    function clearDropTarget() {
        if (currentDropTarget) {
            currentDropTarget = null;
            currentDropClass = null;
        }
        if (dropLineEl) dropLineEl.classList.add('hidden');
    }

    function isEmptyBlock(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.tagName.toLowerCase() !== 'p') return false;
        const html = node.innerHTML.trim();
        return html === '' || html === '<br>' || html === '<br/>';
    }

    function createHandle() {
        if (handleEl) return;
        handleEl = document.createElement('div');
        // Floating handle in the left margin
        handleEl.className = 'absolute z-40 w-5 h-6 flex items-center justify-center text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 cursor-grab opacity-0 transition-opacity';
        handleEl.innerHTML = `<svg class="w-3 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M4 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm5-10a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>`;
        handleEl.setAttribute('draggable', 'true');
        document.body.appendChild(handleEl);

        handleEl.addEventListener('dragstart', (e) => {
            if (!currentBlock) {
                e.preventDefault();
                return;
            }
            draggedBlock = currentBlock;
            draggedEmptySibling = null;
            if (isEmptyBlock(currentBlock.nextSibling)) {
                draggedEmptySibling = currentBlock.nextSibling;
            }
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', ' ');
            
            // Try to set drag image to the block
            try {
                e.dataTransfer.setDragImage(currentBlock, 0, 0);
            } catch (err) {}
            
            setTimeout(() => {
                if (draggedBlock) draggedBlock.classList.add('opacity-30');
                if (draggedEmptySibling) draggedEmptySibling.classList.add('opacity-30');
            }, 0);
        });

        handleEl.addEventListener('dragend', () => {
            if (draggedBlock) {
                draggedBlock.classList.remove('opacity-30');
                if (draggedEmptySibling) draggedEmptySibling.classList.remove('opacity-30');
                draggedBlock = null;
                draggedEmptySibling = null;
            }
            clearDropTarget();
        });
    }

    function updateHandlePosition(block) {
        if (!handleEl) createHandle();
        
        const rect = block.getBoundingClientRect();
        // Position handle to the left of the block
        handleEl.style.left = `${rect.left + window.scrollX - 24}px`;
        handleEl.style.top = `${rect.top + window.scrollY}px`;
        handleEl.classList.remove('opacity-0');
    }

    function hideHandle() {
        if (handleEl) {
            handleEl.classList.add('opacity-0');
        }
    }

    function getBlockFromEvent(e) {
        let node = e.target;
        while (node && node !== editor && node !== document.body) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toLowerCase();
                // We only want top-level blocks like p, h1, h2, ul, ol, blockquote, div
                if (['p', 'h1', 'h2', 'ul', 'ol', 'blockquote', 'div', 'table'].includes(tag) && node.parentNode === editor) {
                    return node;
                }
            }
            node = node.parentNode;
        }
        return null;
    }

    // Hover logic
    editor.addEventListener('mousemove', (e) => {
        const block = getBlockFromEvent(e);
        if (block) {
            currentBlock = block;
            updateHandlePosition(block);
        } else {
            // Check if mouse is over the handle itself
            const overHandle = handleEl && handleEl.contains(e.target);
            if (!overHandle) {
                hideHandle();
            }
        }
    });

    editor.addEventListener('mouseleave', (e) => {
        const overHandle = handleEl && handleEl.contains(e.relatedTarget);
        if (!overHandle) {
            hideHandle();
        }
    });

    // Drop logic in editor
    editor.addEventListener('dragover', (e) => {
        if (draggedBlock) {
            e.preventDefault(); // Necessary to allow drop
            e.dataTransfer.dropEffect = 'move';
            
            const targetBlock = getBlockFromEvent(e);
            if (targetBlock && targetBlock !== draggedBlock) {
                const rect = targetBlock.getBoundingClientRect();
                const dropAfter = e.clientY > rect.top + rect.height / 2;
                const newClass = dropAfter ? 'skriv-drag-over-after' : 'skriv-drag-over-before';
                
                if (currentDropTarget !== targetBlock || currentDropClass !== newClass) {
                    currentDropTarget = targetBlock;
                    currentDropClass = newClass;
                    
                    if (!dropLineEl) createDropLine();
                    
                    const rect = targetBlock.getBoundingClientRect();
                    const lineY = dropAfter ? rect.bottom : rect.top;
                    
                    dropLineEl.style.left = `${rect.left + window.scrollX}px`;
                    dropLineEl.style.width = `${rect.width}px`;
                    dropLineEl.style.top = `${lineY + window.scrollY - 1}px`;
                    dropLineEl.classList.remove('hidden');
                }
            } else {
                clearDropTarget();
            }
        }
    });

    editor.addEventListener('dragleave', (e) => {
        if (draggedBlock) {
            if (!editor.contains(e.relatedTarget)) {
                clearDropTarget();
            }
        }
    });

    editor.addEventListener('drop', (e) => {
        if (draggedBlock) {
            e.preventDefault();
            
            let targetBlock = currentDropTarget;
            let dropAfter = currentDropClass === 'skriv-drag-over-after';
            
            clearDropTarget();
            
            // Fallback to caret calculation if targetBlock wasn't set by hover
            if (!targetBlock) {
                if (document.caretRangeFromPoint) {
                    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
                    if (range) {
                        let node = range.startContainer;
                        while (node && node !== editor) {
                            if (node.parentNode === editor) {
                                targetBlock = node;
                                break;
                            }
                            node = node.parentNode;
                        }
                    }
                }
                if (targetBlock) {
                    const rect = targetBlock.getBoundingClientRect();
                    dropAfter = e.clientY > rect.top + rect.height / 2;
                }
            }

            if (targetBlock && targetBlock !== draggedBlock) {
                if (dropAfter) {
                    if (targetBlock.nextSibling) {
                        editor.insertBefore(draggedBlock, targetBlock.nextSibling);
                        if (draggedEmptySibling) editor.insertBefore(draggedEmptySibling, targetBlock.nextSibling);
                    } else {
                        editor.appendChild(draggedBlock);
                        if (draggedEmptySibling) editor.appendChild(draggedEmptySibling);
                    }
                } else {
                    editor.insertBefore(draggedBlock, targetBlock);
                    if (draggedEmptySibling) editor.insertBefore(draggedEmptySibling, targetBlock);
                }
                
                if (options.onDragDrop) options.onDragDrop();
            }
            
            if (draggedBlock) draggedBlock.classList.remove('opacity-30');
            if (draggedEmptySibling) draggedEmptySibling.classList.remove('opacity-30');
            draggedBlock = null;
            draggedEmptySibling = null;
            hideHandle();
        }
    });

    return {
        destroy: () => {
            if (handleEl) handleEl.remove();
            if (dropLineEl) dropLineEl.remove();
            clearDropTarget();
        }
    };
}
