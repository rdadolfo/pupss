// ── State ───────────────────────────────────────────────────────────────────
let uploadedFile = null;
let allRows      = [];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click',    () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave',() => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

// ── On page load: restore last results from sessionStorage ───────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Always start with button disabled — no file is loaded yet after refresh
  setRunBtn(false);

  const saved = sessionStorage.getItem('hatedetector_results');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      const savedName = sessionStorage.getItem('hatedetector_filename') || 'previous file';

      // Restore filename label
      document.getElementById('fileName').textContent = `${savedName}  (cached)`;
      document.getElementById('fileName').style.display = 'block';

      // Restore results table
      renderResults(data);
      showStatus(`✅ Showing cached results for "${savedName}". Re-upload to re-run.`);
    } catch (e) {
      sessionStorage.removeItem('hatedetector_results');
    }
  }
});

// ── handleFile ───────────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file || !file.name.endsWith('.csv')) {
    showStatus('Please select a valid .csv file.', true);
    return;
  }

  uploadedFile = file;
  document.getElementById('fileName').textContent = `${file.name}  (${(file.size / 1024).toFixed(1)} KB)`;
  document.getElementById('fileName').style.display = 'block';

  // Preview columns
  showStatus('Reading column headers…');
  const fd = new FormData();
  fd.append('file', file);

  try {
      const r = await apiFetch('/hatedetector/preview/', { 
        method: 'POST', 
        body: fd
      });

    const d = await r.json();
    if (d.error) { showStatus(d.error, true); return; }
    populateColumns(d.headers, d.detected_column);
    showStatus(`✅ File loaded – ${d.headers.length} columns detected. Select text column and click Detect.`);
  } catch (e) {
    populateColumns([], null);
    showStatus('File loaded. Click Detect to process.');
  }

  // ✅ FIX: was incorrectly set to `true` — button should be ENABLED after file loads
  setRunBtn(true);
}

// ── populateColumns ──────────────────────────────────────────────────────────
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

// ── runDetection ─────────────────────────────────────────────────────────────
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
      // ✅ Save results + filename to sessionStorage so they survive a refresh
      sessionStorage.setItem('hatedetector_results',  JSON.stringify(d));
      sessionStorage.setItem('hatedetector_filename', uploadedFile.name);

      renderResults(d);
      // 👈 NEW LOGIC: Check the flag from Django!
      if (d.is_cached) {
          // Message for files already in the database
          showStatus(`⚡ Instantly loaded previously saved results for column "${col}"!`);
        } else {
          // Message for brand new files
          showStatus(`✅ Done! Processed and saved "${uploadedFile.name}" with ${d.stats.total} rows.`);
      }
    }

  } catch (e) {
    showStatus('Server error: ' + e.message, true);
  }

  setRunBtn(true, '🔍 Detect Hate Speech');
}

// ── renderResults ────────────────────────────────────────────────────────────
function renderResults(data) {
  allRows = data.rows;

  document.getElementById('statTotal').textContent = data.stats.total;
  document.getElementById('statHate').textContent  = data.stats.hate_count;
  document.getElementById('statSafe').textContent  = data.stats.not_hate_count;
  document.getElementById('statPct').textContent   = data.stats.hate_pct + '%';

  document.getElementById('statsSection').style.display   = 'block';
  document.getElementById('resultsSection').style.display = 'block';

  renderTable(allRows);
}

// ── renderTable ──────────────────────────────────────────────────────────────
function renderTable(rows) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  rows.forEach(r => {
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
}

// ── filterTable ──────────────────────────────────────────────────────────────
function filterTable(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const f        = btn.dataset.filter;
  const filtered = f === 'all' ? allRows : allRows.filter(r => r.label === f);
  renderTable(filtered);
}

// ── downloadResults ──────────────────────────────────────────────────────────
function downloadResults() {
  window.location.href = '/hatedetector/download/';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Enable or disable the Run button, with optional label change */
function setRunBtn(enabled, label) {
  const btn = document.getElementById('runBtn');
  if (!btn) return;
  btn.disabled    = !enabled;
  if (label) btn.textContent = label;
}

function showStatus(msg, isError = false) {
  const bar = document.getElementById('statusBar');
  bar.textContent = msg;
  bar.className   = isError ? 'error' : '';
  bar.style.display = 'block';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
