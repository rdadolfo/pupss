/* ==========================================================================
   1. GLOBAL STATE & DOM REFERENCES
   ========================================================================== */

// --- State Variables ---
let uploadedFile = null;       // Stores the CSV file the user uploads
let allRows = [];              // Master backup of all rows returned by the API
let currentTableData = [];     // The currently active rows (changes when user clicks a filter)
let currentPage = 1;           // Tracks which page of the table the user is viewing
const rowsPerPage = 10;        // Controls how many rows display per page

// --- DOM Elements ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileNameLabel = document.getElementById('fileName');


/* ==========================================================================
   2. INITIALIZATION & EVENT LISTENERS
   ========================================================================== */

/**
 * Runs instantly when the page loads. 
 * Checks if the user already processed a file recently by looking in the browser's 
 * sessionStorage. If data exists, it instantly redraws the table without hitting the server.
 */
window.addEventListener('DOMContentLoaded', () => {
    setRunBtn(false); 
    
    const saved = sessionStorage.getItem('hatedetector_results');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            const savedName = sessionStorage.getItem('hatedetector_filename') || 'previous file';

            fileNameLabel.textContent = `${savedName}  (cached)`;
            fileNameLabel.style.display = 'block';
            
            renderResults(data);
            showStatus(`✅ Showing cached results for "${savedName}". Re-upload to re-run.`);
        } catch (e) {
            sessionStorage.removeItem('hatedetector_results');
        }
    }
});

// --- Drag & Drop Listeners ---
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { 
    e.preventDefault(); 
    dropZone.classList.add('drag-over'); 
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));


/* ==========================================================================
   3. FILE PROCESSING PIPELINE
   ========================================================================== */

/**
 * Triggered when a file is dropped or selected.
 * Validates the file, updates the UI, and asks the API to preview the CSV columns.
 */
async function handleFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
        showStatus('Please select a valid .csv file.', true);
        return;
    }

    uploadedFile = file;
    fileNameLabel.textContent = `${file.name}  (${(file.size / 1024).toFixed(1)} KB)`;
    fileNameLabel.style.display = 'block';

    showStatus('Reading column headers…');
    
    const fd = new FormData();
    fd.append('file', file);

    try {
        const r = await apiFetch('/hatedetector/preview/', { method: 'POST', body: fd });
        const d = await r.json();
        
        if (d.error) { 
            showStatus(d.error, true); 
            return; 
        }
        
        populateColumns(d.headers, d.detected_column);
        showStatus(`✅ File loaded – ${d.headers.length} columns detected. Select text column and click Detect.`);
    } catch (e) {
        populateColumns([], null);
        showStatus('File loaded. Click Detect to process.');
    }

    setRunBtn(true);
}

/**
 * Takes the headers found in the CSV and populates the dropdown menu 
 * so the user can select which column contains the text to analyze.
 */
function populateColumns(headers, detected) {
    const sel = document.getElementById('columnSelect');
    sel.innerHTML = '';

    if (headers.length === 0) {
        sel.innerHTML = '<option value="">— auto-detect —</option>';
    } else {
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            if (h === detected) opt.selected = true;
            sel.appendChild(opt);
        });
    }
    sel.disabled = false;
}

/**
 * Sends the selected file and column to the Django backend to run the actual AI model.
 * Saves the result to sessionStorage upon success.
 */
async function runDetection() {
    if (!uploadedFile) return;

    setRunBtn(false, '⏳ Processing…');
    showStatus('Running hate speech detection — please wait…');

    const fd = new FormData();
    fd.append('file', uploadedFile);
    
    const col = document.getElementById('columnSelect').value;
    if (col) fd.append('text_column', col);

    try {
        const r = await apiFetch('/hatedetector/process/', { method: 'POST', body: fd });
        const d = await r.json();

        if (d.error) {
            showStatus(d.error, true);
        } else {
            sessionStorage.setItem('hatedetector_results', JSON.stringify(d));
            sessionStorage.setItem('hatedetector_filename', uploadedFile.name);

            renderResults(d);
            
            if (d.is_cached) {
                showStatus(`⚡ Instantly loaded previously saved results for column "${col}"!`);
            } else {
                showStatus(`✅ Done! Processed and saved "${uploadedFile.name}" with ${d.stats.total} rows.`);
            }
        }
    } catch (e) {
        showStatus('Server error: ' + e.message, true);
    }

    setRunBtn(true, '🔍 Detect Hate Speech');
}


/* ==========================================================================
   4. DATA RENDERING & PAGINATION
   ========================================================================== */

/**
 * Populates the top summary cards (Total, Safe, Hate, %) and unlocks the results area.
 */
function renderResults(data) {
    allRows = data.rows;

    document.getElementById('statTotal').textContent = data.stats.total;
    document.getElementById('statHate').textContent  = data.stats.hate_count;
    document.getElementById('statSafe').textContent  = data.stats.not_hate_count;
    document.getElementById('statPct').textContent   = data.stats.hate_pct + '%';

    document.getElementById('statsSection').style.display   = 'block';
    document.getElementById('resultsSection').style.display = 'block';

    initTable(allRows);
}

/**
 * Resets the frontend pagination state and triggers the first table draw.
 */
function initTable(dataRows) {
    currentTableData = dataRows; 
    currentPage = 1;            
    renderTable();              
}

/**
 * Slices the master data array based on the current page, draws the HTML rows, 
 * and calls the utility function to update the numbered pagination buttons.
 */
function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    const totalPages = Math.ceil(currentTableData.length / rowsPerPage) || 1;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedRows = currentTableData.slice(startIndex, endIndex);

    if (paginatedRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No records found.</td></tr>';
        updatePaginationUI(currentPage, totalPages, 'pageNumbers', 'prevBtn', 'nextBtn', 'goToPage');
        return;
    }

    paginatedRows.forEach(r => {
        const isHate = r.label === 'HATE';
        const pct    = Math.round(r.confidence * 100);
        const chips  = (r.highlights || []).map(w => 
            `<span class="highlight-chip">${escHtml(w)}</span>`
        ).join('') || '<span style="color:var(--muted)">—</span>';

        const tr = document.createElement('tr');
        tr.className     = isHate ? 'hate-row' : 'safe-row';
        tr.dataset.label = r.label;

        tr.innerHTML = `
            <td class="row-num">${r.row_num}</td>
            <td class="text-cell"><p>${escHtml(r.text || '')}</p></td>
            <td><span class="badge ${isHate ? 'badge-hate' : 'badge-safe'}">${r.label}</span></td>
            <td>
                <span style="font-size:.85rem;font-weight:600">${pct}%</span>
                <div class="confidence-bar">
                    <div class="confidence-fill ${isHate ? 'conf-hate' : 'conf-safe'}" style="width:${pct}%"></div>
                </div>
            </td>
            <td>${chips}</td>
        `;
        tbody.appendChild(tr);
    });

    // Delegate the button drawing to utils.js
    updatePaginationUI(
        currentPage,            
        totalPages,             
        'pageNumbers',          
        'prevBtn',              
        'nextBtn',              
        'goToPage'              
    );
}

/**
 * Re-filters the master list (allRows) based on the user's selection (Safe/Hate/All)
 * and resets the table view.
 */
function filterTable(btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const f = btn.dataset.filter;
    currentTableData = (f === 'all') ? allRows : allRows.filter(r => r.label === f);
    
    currentPage = 1;
    renderTable();
}

/** Triggered by the HTML 'Previous' and 'Next' buttons */
function changePage(direction) {
    currentPage += direction;
    renderTable();
}

/** Triggered by the numbered pagination buttons generated in utils.js */
function goToPage(pageNum) {
    currentPage = pageNum;
    renderTable();
}


/* ==========================================================================
   5. UI HELPERS & UTILITIES
   ========================================================================== */

/** Sends the user to the Django endpoint that downloads the processed CSV. */
function downloadResults() {
    window.location.href = '/hatedetector/download/';
}

/** Toggles the main action button on and off during API calls. */
function setRunBtn(enabled, label) {
    const btn = document.getElementById('runBtn');
    if (!btn) return;
    btn.disabled = !enabled;
    if (label) btn.textContent = label;
}

/** Displays success/error text messages near the upload zone. */
function showStatus(msg, isError = false) {
    const bar = document.getElementById('statusBar');
    bar.textContent = msg;
    bar.className   = isError ? 'error' : '';
    bar.style.display = 'block';
}

/** Sanitizes text output so malicious HTML/scripts inside the CSV don't execute in the browser. */
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}