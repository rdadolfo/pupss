/* ==========================================================================
   1. GLOBAL STATE
   ========================================================================== */
let currentFilter = 'all';
let currentPage = 1;          
let currentReportsPage = 1;   

/* ==========================================================================
   2. INITIALIZATION (Clean Page Load)
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    const recentReportsContainer = document.getElementById('recentReportsContainer');
    const deepDiveContainer = document.getElementById('reportsTableContainer');
    
    if (recentReportsContainer) recentReportsContainer.style.display = "none";
    if (deepDiveContainer) deepDiveContainer.style.display = "none";

    try {
        const summaryResponse = await apiFetch('/api/dashboard-data/'); 
        
        if (summaryResponse.status === 403) {
            await showSystemModal('error', 'Access Restricted', 'Your account permissions have been modified. You no longer have access to view reports. Please contact your system administrator.');
            window.location.href = '/'; 
            return;
        }

        if (summaryResponse.ok) {
            const data = await summaryResponse.json();
            if (data.summary) {
                const hateEl = document.getElementById('stat-hate');
                if (hateEl) hateEl.innerText = data.summary.total_hate.toLocaleString();
                const safeEl = document.getElementById('stat-safe');
                if (safeEl) safeEl.innerText = data.summary.total_safe.toLocaleString();
                const reportsEl = document.getElementById('stat-reports');
                if (reportsEl) reportsEl.innerText = data.summary.total_reports.toLocaleString();
                const pctEl = document.getElementById('stat-pct');
                if (pctEl) pctEl.innerText = data.summary.overall_pct + '%';
            }
        }
    } catch (error) {
        console.error("Error loading summary cards:", error);
    }
});

/* ==========================================================================
   3. TABLE FILTERING & VISIBILITY
   ========================================================================== */
function filterTable(filterType) {
    currentFilter = filterType;
    currentPage = 1; 
    currentReportsPage = 1; 
    
    const tableControl = document.getElementById('tableControl');
    const titleEl = document.getElementById('dynamicTableTitle');
    const recentReportsContainer = document.getElementById('recentReportsContainer');
    const deepDiveContainer = document.getElementById('reportsTableContainer');
    
    const toxHeader = document.getElementById('col-toxicity');
    const actionHeader = document.getElementById('col-action'); 
    const actionHeaderDeep = document.getElementById('col-action-deep'); 
    const highlightsHeader = document.getElementById('col-highlights'); 

    const hasAdminPerms = typeof canDeleteReports !== 'undefined' ? canDeleteReports : false;

    if (tableControl) tableControl.style.display = "flex";

    if (filterType === 'all') {
        titleEl.innerText = "📄 All Reports Generated";
        titleEl.style.color = "var(--body-fg)";
        
        if (toxHeader) toxHeader.style.display = 'none';
        if (actionHeader) actionHeader.style.display = hasAdminPerms ? 'table-cell' : 'none';
        if (highlightsHeader) highlightsHeader.style.display = 'table-cell';

        if (recentReportsContainer) recentReportsContainer.style.display = "block"; 
        if (deepDiveContainer) deepDiveContainer.style.display = "none";
        loadReportsTable(); 

    } else if (filterType === 'toxicity') {
        titleEl.innerText = "⚠️ All Reports with Toxicity Scores";
        titleEl.style.color = "#f39c12";
        
        if (toxHeader) toxHeader.style.display = 'table-cell';
        if (actionHeader) actionHeader.style.display = 'none'; 
        if (highlightsHeader) highlightsHeader.style.display = 'table-cell';
        
        if (recentReportsContainer) recentReportsContainer.style.display = "block"; 
        if (deepDiveContainer) deepDiveContainer.style.display = "none";
        loadReportsTable(); 

    } else {
        if (filterType === 'hate') {
            titleEl.innerText = "🚨 Filtered: Individual Rows (Hate Speech)";
            titleEl.style.color = "#e74c3c";
            if (highlightsHeader) highlightsHeader.style.display = 'table-cell'; 
            
        } else if (filterType === 'safe') {
            titleEl.innerText = "✅ Filtered: Individual Rows (Safe Speech)";
            titleEl.style.color = "#2ecc71";
            if (highlightsHeader) highlightsHeader.style.display = 'none'; 
        }

        if (actionHeaderDeep) actionHeaderDeep.style.display = hasAdminPerms ? 'table-cell' : 'none';

        if (recentReportsContainer) recentReportsContainer.style.display = "none"; 
        if (deepDiveContainer) deepDiveContainer.style.display = "block";
        loadTableData(); 
    }
    
    if (tableControl) {
        tableControl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/* ==========================================================================
   4. DATA FETCHING: RECENT REPORTS TABLE
   ========================================================================== */
async function loadReportsTable() {
    const tbody = document.getElementById('reportsTableBody'); 
    if (!tbody) return;

    const hasDeletePerms = typeof canDeleteReports !== 'undefined' ? canDeleteReports : false;
    let colSpanCount = 5; 
    if (currentFilter === 'toxicity') colSpanCount = 6;
    else if (currentFilter === 'all' && hasDeletePerms) colSpanCount = 6;
    
    tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px;">⏳ Loading reports...</td></tr>`;
    
    try {
        const response = await apiFetch(`/api/dashboard-data/?page=${currentReportsPage}`);
        
        if (response.status === 403) {
            await showSystemModal('error', 'Access Restricted', 'Your account permissions have been modified. You no longer have access to view reports. Please contact your system administrator.');
            window.location.href = '/';
            return;
        }
        if (!response.ok) throw new Error("Server error");
        
        const data = await response.json();
        const tableData = data.table_data || [];

        if (data.summary) {
            const hateEl = document.getElementById('stat-hate');
            if (hateEl) hateEl.innerText = data.summary.total_hate.toLocaleString();
            const safeEl = document.getElementById('stat-safe');
            if (safeEl) safeEl.innerText = data.summary.total_safe.toLocaleString();
            const reportsEl = document.getElementById('stat-reports');
            if (reportsEl) reportsEl.innerText = data.summary.total_reports.toLocaleString();
            const pctEl = document.getElementById('stat-pct');
            if (pctEl) pctEl.innerText = data.summary.overall_pct + '%';
        }

        // 🎯 USE THE GLOBAL RENDERER
        renderDynamicTable(tableData, 'reportsTableBody', colSpanCount, 'No reports generated yet.', (report) => {
            let toxicityCellHTML = '';
            let actionCellHTML = '';

            if (currentFilter === 'toxicity') {
                const toxPct = Math.round((report.hate_count / (report.hate_count + report.safe_count || 1)) * 100);
                toxicityCellHTML = `
                    <td>
                        <span style="font-size:.85rem;font-weight:600">${toxPct}%</span>
                        <div class="confidence-bar">
                            <div class="confidence-fill conf-hate" style="width:${toxPct}%"></div>
                        </div>
                    </td>`;
            } else if (currentFilter === 'all' && hasDeletePerms) {
                const delBtn = `<button onclick="deleteReport(${report.id}, '${report.filename.replace(/'/g, "\\'")}')" class="btn btn-outline-danger" title="Delete Report">🗑</button>`;
                actionCellHTML = `
                    <td class="action-column-wrap">
                        <div class="action-flex-container">${delBtn}</div>
                    </td>`;
            }

            return `
                <tr>
                    <td><strong>${report.filename}</strong></td>
                    <td class="row-num">${report.date}</td>
                    <td>${report.uploader}</td>
                    <td><span class="badge badge-hate">${report.hate_count}</span></td>
                    <td><span class="badge badge-safe">${report.safe_count}</span></td>
                    ${toxicityCellHTML}
                    ${actionCellHTML}
                </tr>`;
        });

        if (typeof updatePaginationUI === 'function' && data.total_pages) {
            updatePaginationUI(data.current_page, data.total_pages, 'reportsPageNumbers', 'reportsPrevBtn', 'reportsNextBtn', 'goToReportsPage');
        }

    } catch (error) {
        console.error("Error loading reports:", error);
        tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px; color: red;">Error loading reports from server.</td></tr>`;
    }
}

/* ==========================================================================
   5. DATA FETCHING: DEEP DIVE ROWS TABLE
   ========================================================================== */
async function loadTableData() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    const hasAdminPerms = typeof canDeleteReports !== 'undefined' ? canDeleteReports : false;
    let colSpanCount = 5; 
    if (currentFilter !== 'safe') colSpanCount += 1; 
    if (hasAdminPerms) colSpanCount += 1; 
    
    tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px;">⏳ Loading data...</td></tr>`;

    try {
        const response = await apiFetch(`/api/dashboard-rows/?filter=${currentFilter}&page=${currentPage}`);
        
        if (response.status === 403) {
            await showSystemModal('error', 'Access Restricted', 'Your account permissions have been modified. You no longer have access to view reports. Please contact your system administrator.');
            window.location.href = '/';
            return;
        }
        if (!response.ok) throw new Error("Server error");
        
        const data = await response.json();
        const tableRows = data.rows || [];
        
        // 🎯 USE THE GLOBAL RENDERER
        renderDynamicTable(tableRows, 'tableBody', colSpanCount, 'No rows found for this filter.', (row) => {
            const isHate = row.status.includes("Hate");
            const confPct = parseInt(row.confidence) || 0; 
            
            let chipsHtml = '<span style="color:var(--muted)">—</span>';
            if (row.hate_words && row.hate_words !== "None") {
                chipsHtml = row.hate_words.split(',').map(w => `<span class="highlight-chip">${w.trim()}</span>`).join('');
            }

            const highlightsCellHTML = currentFilter !== 'safe' ? `<td>${chipsHtml}</td>` : '';

            let actionCellHTML = '';
            if (hasAdminPerms) {
                const overrideBtn = `<button onclick="overrideRowStatus(${row.report_id}, ${row.row_num}, '${row.raw_label}')" class="btn btn-outline-gold" title="Override AI Classification">↻</button>`;
                actionCellHTML = `
                    <td class="action-column-wrap">
                        <div class="action-flex-container">${overrideBtn}</div>
                    </td>`;
            }

            return `
                <tr class="${isHate ? 'hate-row' : 'safe-row'}">
                    <td class="row-num">${row.filename}</td>
                    <td class="row-num"><strong>${row.row_num}</strong></td>
                    <td class="text-cell"><p>${row.text}</p></td>
                    <td><span class="badge ${isHate ? 'badge-hate' : 'badge-safe'}">${isHate ? 'HATE' : 'SAFE'}</span></td>
                    <td>
                        <span style="font-size:.85rem;font-weight:600">${row.confidence}</span>
                        <div class="confidence-bar">
                            <div class="confidence-fill ${isHate ? 'conf-hate' : 'conf-safe'}" style="width:${confPct}%"></div>
                        </div>
                    </td>
                    ${highlightsCellHTML}
                    ${actionCellHTML}
                </tr>`;
        });

        if (typeof updatePaginationUI === 'function' && data.total_pages) {
            updatePaginationUI(data.current_page, data.total_pages, 'pageNumbers', 'prevBtn', 'nextBtn', 'goToPage');
        }

    } catch (error) {
        console.error("Error loading rows:", error);
        tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px; color: red;">Error loading data from server.</td></tr>`;
    }
}

/* ==========================================================================
   6. PAGINATION CONTROLS
   ========================================================================== */

function downloadDashboardData() {
    window.location.href = `/api/dashboard-download/?filter=${currentFilter}`;
}

function changePage(direction) {
    currentPage += direction;
    loadTableData();
}

function goToPage(pageNum) {
    currentPage = pageNum;
    loadTableData();
}

function changeReportsPage(direction) {
    currentReportsPage += direction;
    loadReportsTable(); 
}

function goToReportsPage(pageNum) {
    currentReportsPage = pageNum;
    loadReportsTable();
}

/* ==========================================================================
   7. ADMINISTRATIVE DELETION 
   ========================================================================== */

async function deleteReport(reportId, filename) {
    const isConfirmed = await showSystemModal(
        'warning', 
        'CRITICAL WARNING!', 
        `Are you sure you want to permanently delete the report "<strong>${filename}</strong>" and all its rows?<br><br>This action cannot be undone.`,
        'Delete Report' 
    );
    
    if (!isConfirmed) return;

    try {
        const response = await apiFetch(`/api/report/delete/${reportId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();

        if (response.ok && result.success) {
            await showSystemModal('success', 'File Deleted', result.message);
            loadReportsTable(); 
        } else {
            await showSystemModal('error', 'Operation Denied', result.error || 'Permission denied.');
        }
    } catch (err) {
        console.error("Deletion error:", err);
        await showSystemModal('error', 'Network Failure', 'A critical network error occurred during deletion.');
    }
}

/* ==========================================================================
   8. ADMINISTRATIVE OVERRIDE
   ========================================================================== */

async function overrideRowStatus(reportId, rowNum, currentLabel) {
    const targetStatus = currentLabel === 'HATE' ? 'NOT HATE' : 'HATE';
    const currentColor = currentLabel === 'HATE' ? 'var(--hate)' : 'var(--safe)';
    const targetColor = targetStatus === 'HATE' ? 'var(--hate)' : 'var(--safe)';
    
    const isConfirmed = await showSystemModal(
        'override', 
        'Override AI Classification?', 
        `You are about to manually override Row #${rowNum} from <strong style="color:${currentColor}">${currentLabel}</strong> to <strong style="color:${targetColor}">${targetStatus}</strong>.`,
        `Override to ${targetStatus}` 
    );
    
    if (!isConfirmed) return;

    try {
        const response = await apiFetch(`/api/row/override/${reportId}/${rowNum}/`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();

        if (response.ok && result.success) {
            const summaryResponse = await apiFetch('/api/dashboard-data/'); 
            if (summaryResponse.ok) {
                const data = await summaryResponse.json();
                if (data.summary) {
                    const hateEl = document.getElementById('stat-hate');
                    if (hateEl) hateEl.innerText = data.summary.total_hate.toLocaleString();
                    const safeEl = document.getElementById('stat-safe');
                    if (safeEl) safeEl.innerText = data.summary.total_safe.toLocaleString();
                    const pctEl = document.getElementById('stat-pct');
                    if (pctEl) pctEl.innerText = data.summary.overall_pct + '%';
                }
            }
            loadTableData(); 
        } else {
            await showSystemModal('error', 'Override Failed', result.error || 'Permission denied.');
        }
    } catch (err) {
        console.error("Override error:", err);
        await showSystemModal('error', 'Network Failure', 'A critical network error occurred during the override.');
    }
}