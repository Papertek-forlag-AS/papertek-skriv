/**
 * Table manager for contenteditable editor.
 *
 * Features:
 *   - Insert table dialog with visual grid picker (2-6 rows/cols)
 *   - Tab / Shift+Tab navigates between cells
 *   - On-select toolbar: Add row, Add column, Delete row, Delete column, Delete table
 *   - Each cell is contenteditable within the table structure
 *   - Tables are block-level, non-floatable
 *
 * Self-contained: injects own CSS, cleans up on destroy().
 */

import { t } from '../shared/i18n.js';

const GRID_SIZE = 6;
const MIN_ROWS = 2;
const MIN_COLS = 2;

export function initTableManager(editor, container, options = {}) {
    let toolbar = null;
    let selectedTable = null;
    let styleEl = null;
    let dialog = null;
    let savedRange = null;

    // --- Inject self-contained CSS ---
    styleEl = document.createElement('style');
    styleEl.textContent = `
.skriv-table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 0.875rem;
    table-layout: fixed;
}
.skriv-table th,
.skriv-table td {
    border: 1px solid #d6d3d1;
    padding: 0.5rem 0.75rem;
    text-align: left;
    min-width: 60px;
    outline: none;
    vertical-align: top;
    word-wrap: break-word;
}
.skriv-table th {
    background: #f5f5f4;
    font-weight: 600;
    color: #44403c;
}
.skriv-table td:focus,
.skriv-table th:focus {
    box-shadow: inset 0 0 0 2px #059669;
}
.skriv-table-toolbar {
    position: absolute;
    z-index: 1000;
    display: flex;
    gap: 2px;
    background: #fff;
    border: 1px solid #d6d3d1;
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    font-size: 13px;
}
.skriv-table-toolbar button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border: none;
    background: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: #44403c;
    white-space: nowrap;
}
.skriv-table-toolbar button:hover {
    background: #f5f5f4;
}
.skriv-table-toolbar button.danger:hover {
    background: #fef2f2;
    color: #dc2626;
}
.skriv-table-dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
}
.skriv-table-dialog {
    background: #fff;
    border-radius: 12px;
    padding: 20px 24px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    min-width: 220px;
}
.skriv-table-dialog h3 {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;
    color: #1c1917;
}
.skriv-table-grid {
    display: grid;
    grid-template-columns: repeat(${GRID_SIZE}, 28px);
    grid-template-rows: repeat(${GRID_SIZE}, 28px);
    gap: 3px;
    margin-bottom: 10px;
}
.skriv-table-grid-cell {
    width: 28px;
    height: 28px;
    border: 1.5px solid #e7e5e4;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.08s, border-color 0.08s;
}
.skriv-table-grid-cell.active {
    background: #ecfdf5;
    border-color: #059669;
}
.skriv-table-dialog-label {
    text-align: center;
    font-size: 13px;
    color: #57534e;
    min-height: 20px;
}
/* Dark mode */
.dark .skriv-table th {
    background: #292524;
    color: #d6d3d1;
}
.dark .skriv-table th,
.dark .skriv-table td {
    border-color: #44403c;
}
.dark .skriv-table td:focus,
.dark .skriv-table th:focus {
    box-shadow: inset 0 0 0 2px #34d399;
}
.dark .skriv-table-toolbar {
    background: #1c1917;
    border-color: #44403c;
}
.dark .skriv-table-toolbar button {
    color: #d6d3d1;
}
.dark .skriv-table-toolbar button:hover {
    background: #292524;
}
.dark .skriv-table-toolbar button.danger:hover {
    background: #451a03;
    color: #fca5a5;
}
.dark .skriv-table-dialog {
    background: #1c1917;
}
.dark .skriv-table-dialog h3 {
    color: #e7e5e4;
}
.dark .skriv-table-grid-cell {
    border-color: #44403c;
}
.dark .skriv-table-grid-cell.active {
    background: #064e3b;
    border-color: #34d399;
}
.dark .skriv-table-dialog-label {
    color: #a8a29e;
}
`;
    document.head.appendChild(styleEl);

    // --- Insert table dialog with grid picker ---
    function showInsertDialog() {
        if (dialog) return;

        // Save current selection before focus is lost to the dialog
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        } else {
            savedRange = null;
        }

        const overlay = document.createElement('div');
        overlay.className = 'skriv-table-dialog-overlay';

        const box = document.createElement('div');
        box.className = 'skriv-table-dialog';

        const title = document.createElement('h3');
        title.textContent = t('table.insertTitle') || 'Sett inn tabell';
        box.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'skriv-table-grid';

        const label = document.createElement('div');
        label.className = 'skriv-table-dialog-label';

        let hoverRows = 0;
        let hoverCols = 0;

        // Create grid cells
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const cell = document.createElement('div');
                cell.className = 'skriv-table-grid-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.addEventListener('mouseenter', () => {
                    hoverRows = r + 1;
                    hoverCols = c + 1;
                    updateGridHighlight(grid, hoverRows, hoverCols);
                    label.textContent = `${hoverRows} × ${hoverCols}`;
                });
                cell.addEventListener('click', () => {
                    const rows = Math.max(MIN_ROWS, hoverRows);
                    const cols = Math.max(MIN_COLS, hoverCols);
                    closeDialog();
                    insertTable(rows, cols);
                });
                grid.appendChild(cell);
            }
        }

        box.appendChild(grid);
        box.appendChild(label);
        overlay.appendChild(box);

        // Close on overlay click or Escape
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDialog();
        });
        const escHandler = (e) => {
            if (e.key === 'Escape') closeDialog();
        };
        document.addEventListener('keydown', escHandler);

        function closeDialog() {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
            dialog = null;
        }

        (document.fullscreenElement || document.body).appendChild(overlay);
        dialog = overlay;
    }

    function updateGridHighlight(grid, rows, cols) {
        const cells = grid.querySelectorAll('.skriv-table-grid-cell');
        cells.forEach(cell => {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            cell.classList.toggle('active', r < rows && c < cols);
        });
    }

    // --- Insert table ---
    function insertTable(rows, cols) {
        editor.focus();

        const sel = window.getSelection();
        if (savedRange) {
            sel.removeAllRanges();
            sel.addRange(savedRange);
            savedRange = null;
        }

        const table = document.createElement('table');
        table.className = 'skriv-table';
        table.setAttribute('contenteditable', 'false');

        // Create thead with header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        for (let c = 0; c < cols; c++) {
            const th = document.createElement('th');
            th.setAttribute('contenteditable', 'true');
            th.innerHTML = '<br>';
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create tbody with data rows (rows - 1 because first row is header)
        const tbody = document.createElement('tbody');
        for (let r = 0; r < rows - 1; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < cols; c++) {
                const td = document.createElement('td');
                td.setAttribute('contenteditable', 'true');
                td.innerHTML = '<br>';
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        // Insert at cursor position
        let insertBefore = null;
        if (sel.rangeCount > 0) {
            let node = sel.getRangeAt(0).startContainer;
            while (node && node !== editor && node.parentNode !== editor) {
                node = node.parentNode;
            }
            if (node && node !== editor) insertBefore = node.nextSibling;
        }

        if (insertBefore) {
            editor.insertBefore(table, insertBefore);
        } else {
            editor.appendChild(table);
        }

        // Ensure paragraph after table
        if (!table.nextElementSibling) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editor.appendChild(p);
        }

        if (options.onInsert) options.onInsert();

        // Focus first cell
        const firstCell = table.querySelector('th, td');
        if (firstCell) focusCell(firstCell);
    }

    // --- Tab navigation between cells ---
    function handleKeyDown(e) {
        if (e.key !== 'Tab') return;
        const cell = getActiveCell();
        if (!cell) return;
        const table = cell.closest('.skriv-table');
        if (!table || !editor.contains(table)) return;

        e.preventDefault();
        const cells = Array.from(table.querySelectorAll('th, td'));
        const idx = cells.indexOf(cell);

        if (e.shiftKey) {
            // Shift+Tab: go backward
            if (idx > 0) {
                focusCell(cells[idx - 1]);
            }
        } else {
            // Tab: go forward
            if (idx < cells.length - 1) {
                focusCell(cells[idx + 1]);
            } else {
                // At last cell: add new row and focus first cell of new row
                const newRow = addRow(table);
                if (newRow) focusCell(newRow.cells[0]);
            }
        }
    }

    // --- Cell focus helper ---
    function focusCell(cell) {
        if (!cell) return;
        cell.focus();
        const range = document.createRange();
        range.selectNodeContents(cell);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function getActiveCell() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        let node = sel.getRangeAt(0).startContainer;
        while (node && node !== editor) {
            if (node.nodeName === 'TD' || node.nodeName === 'TH') return node;
            node = node.parentNode;
        }
        return null;
    }

    // --- Table toolbar ---
    function createToolbar() {
        const bar = document.createElement('div');
        bar.className = 'skriv-table-toolbar';

        const buttons = [
            { label: t('table.addRow') || '+ Rad', action: () => { if (selectedTable) { addRow(selectedTable); if (options.onInsert) options.onInsert(); } } },
            { label: t('table.addCol') || '+ Kolonne', action: () => { if (selectedTable) { addColumn(selectedTable); if (options.onInsert) options.onInsert(); } } },
            { label: t('table.delRow') || '− Rad', action: () => { if (selectedTable) { deleteRow(selectedTable); if (options.onInsert) options.onInsert(); } } },
            { label: t('table.delCol') || '− Kolonne', action: () => { if (selectedTable) { deleteColumn(selectedTable); if (options.onInsert) options.onInsert(); } } },
            { label: t('table.delTable') || 'Slett tabell', action: () => { if (selectedTable) { deleteTable(selectedTable); } }, danger: true },
        ];

        buttons.forEach(({ label, action, danger }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            if (danger) btn.className = 'danger';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                action();
            });
            bar.appendChild(btn);
        });

        return bar;
    }

    function showToolbar(table) {
        hideToolbar();
        toolbar = createToolbar();
        const scrollParent = editor.closest('.overflow-y-auto') || container || editor.parentElement;
        scrollParent.style.position = 'relative';
        scrollParent.appendChild(toolbar);
        positionToolbar(table);
    }

    function positionToolbar(table) {
        if (!toolbar || !table) return;
        const scrollParent = toolbar.parentElement;
        const tableRect = table.getBoundingClientRect();
        const parentRect = scrollParent.getBoundingClientRect();

        const top = tableRect.top - parentRect.top + scrollParent.scrollTop - toolbar.offsetHeight - 6;
        const left = tableRect.left - parentRect.left;

        toolbar.style.position = 'absolute';
        toolbar.style.top = `${Math.max(0, top)}px`;
        toolbar.style.left = `${Math.max(0, left)}px`;
    }

    function hideToolbar() {
        if (toolbar) {
            toolbar.remove();
            toolbar = null;
        }
    }

    // --- Add/remove rows/columns ---
    function addRow(table) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return null;
        const colCount = table.querySelector('tr')?.cells.length || 1;
        const tr = document.createElement('tr');
        for (let c = 0; c < colCount; c++) {
            const td = document.createElement('td');
            td.setAttribute('contenteditable', 'true');
            td.innerHTML = '<br>';
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
        return tr;
    }

    function addColumn(table) {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const isHeader = row.parentElement.tagName === 'THEAD';
            const cell = document.createElement(isHeader ? 'th' : 'td');
            cell.setAttribute('contenteditable', 'true');
            cell.innerHTML = '<br>';
            row.appendChild(cell);
        });
    }

    function deleteRow(table) {
        const cell = getActiveCell();
        const tbody = table.querySelector('tbody');
        if (!tbody || tbody.rows.length <= 1) return;

        let targetRow = null;
        if (cell) {
            targetRow = cell.closest('tr');
            // Don't delete header row
            if (targetRow && targetRow.parentElement.tagName === 'THEAD') return;
        }
        if (!targetRow) {
            // Delete last row
            targetRow = tbody.lastElementChild;
        }
        if (targetRow) targetRow.remove();
    }

    function deleteColumn(table) {
        const rows = table.querySelectorAll('tr');
        const colCount = rows[0]?.cells.length || 0;
        if (colCount <= 1) return;

        // Determine which column: active cell or last
        const cell = getActiveCell();
        let colIdx = colCount - 1;
        if (cell && table.contains(cell)) {
            colIdx = Array.from(cell.parentElement.cells).indexOf(cell);
        }

        rows.forEach(row => {
            if (row.cells[colIdx]) row.cells[colIdx].remove();
        });
    }

    function deleteTable(table) {
        hideToolbar();
        selectedTable = null;
        // Focus paragraph after table or create one
        const next = table.nextElementSibling;
        table.remove();
        if (next) {
            const range = document.createRange();
            range.selectNodeContents(next);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        if (options.onInsert) options.onInsert();
    }

    // --- Click/focus handling for toolbar ---
    function handleClick(e) {
        const table = e.target.closest('.skriv-table');
        if (table && editor.contains(table)) {
            selectedTable = table;
            showToolbar(table);
        } else if (selectedTable && !toolbar?.contains(e.target)) {
            hideToolbar();
            selectedTable = null;
        }
    }

    // Reposition toolbar on scroll
    function handleScroll() {
        if (selectedTable && toolbar) {
            positionToolbar(selectedTable);
        }
    }

    const scrollParent = editor.closest('.overflow-y-auto') || container || editor.parentElement;

    // --- Table Resizing ---
    let isResizing = false;
    let resizeTarget = null;
    let startX = 0;
    let startWidth = 0;

    function handleMouseMove(e) {
        if (isResizing && resizeTarget) {
            e.preventDefault();
            const diff = e.clientX - startX;
            resizeTarget.style.width = `${Math.max(40, startWidth + diff)}px`;
            return;
        }

        const th = e.target.closest('th');
        if (!th) {
            if (editor.style.cursor === 'col-resize') editor.style.cursor = '';
            return;
        }

        const rect = th.getBoundingClientRect();
        // Detect right edge (within 8px)
        if (Math.abs(e.clientX - rect.right) < 8) {
            editor.style.cursor = 'col-resize';
            th.dataset.resizeEdge = 'right';
        } else {
            if (editor.style.cursor === 'col-resize') editor.style.cursor = '';
            delete th.dataset.resizeEdge;
        }
    }

    function handleMouseDown(e) {
        const th = e.target.closest('th');
        if (th && editor.style.cursor === 'col-resize' && th.dataset.resizeEdge === 'right') {
            e.preventDefault(); // Prevent text selection
            isResizing = true;
            resizeTarget = th;
            startX = e.clientX;
            startWidth = th.getBoundingClientRect().width;

            // Fix all column widths explicitly before resizing so other columns don't spontaneously change
            const table = th.closest('table');
            if (table.style.width !== 'auto') {
                const headers = Array.from(table.querySelectorAll('th'));
                headers.forEach(h => {
                    h.style.width = `${h.getBoundingClientRect().width}px`;
                });
                table.style.width = 'auto'; // Remove 100% width so columns dictate width
            }
        }
    }

    function handleGlobalMouseUp(e) {
        if (isResizing) {
            isResizing = false;
            resizeTarget = null;
            editor.style.cursor = '';
            if (options.onInsert) options.onInsert();
        }
    }

    // --- Attach event listeners ---
    editor.addEventListener('keydown', handleKeyDown);
    editor.addEventListener('click', handleClick);
    editor.addEventListener('mousemove', handleMouseMove);
    editor.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    if (scrollParent) scrollParent.addEventListener('scroll', handleScroll);

    function destroy() {
        editor.removeEventListener('keydown', handleKeyDown);
        editor.removeEventListener('click', handleClick);
        editor.removeEventListener('mousemove', handleMouseMove);
        editor.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        if (scrollParent) scrollParent.removeEventListener('scroll', handleScroll);
        hideToolbar();
        if (dialog) { dialog.remove(); dialog = null; }
        if (styleEl) { styleEl.remove(); styleEl = null; }
    }

    return { destroy, showInsertDialog, insertTable };
}
