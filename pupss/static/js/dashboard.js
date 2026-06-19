/* ==========================================================================
   1. GLOBAL STATE
   ========================================================================== */
let currentFilter = 'all';
let currentPage = 1;          // Pagination for the Deep Dive Rows Table
let currentReportsPage = 1;   // Pagination for the Recent Reports Table

/* ==========================================================================
   2. INITIALIZATION (Clean Page Load)
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
   
    // 🌟 ENSURE BOTH TABLES ARE HIDDEN ON LOAD
    const recentReportsContainer = document.getElementById('recentReportsContainer');
    const deepDiveContainer = document.getElementById('reportsTableContainer');
    
    if (recentReportsContainer) recentReportsContainer.style.display = "none";
    if (deepDiveContainer) deepDiveContainer.style.display = "none";

    // Only fetch the summary numbers for the 4 cards!
    try {
        const summaryResponse = await apiFetch('/api/dashboard-data/'); 
        if (summaryResponse.ok) {
            const data = await summaryResponse.json();
            
            // Safe assignment checking
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
    
    // Grab dynamic headers
    const toxHeader = document.getElementById('col-toxicity');
    const actionHeader = document.getElementById('col-action'); // Recent Reports
    const actionHeaderDeep = document.getElementById('col-action-deep'); // 🎯 Deep Dive
    const highlightsHeader = document.getElementById('col-highlights'); 

    // Check if the user has permission to see the action columns
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

        // 🎯 Toggle the deep dive action header based on permissions
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

    // 🎯 Check permissions to dynamically calculate the colSpan
    const hasDeletePerms = typeof canDeleteReports !== 'undefined' ? canDeleteReports : false;
    let colSpanCount = 5; // Base columns
    if (currentFilter === 'toxicity') colSpanCount = 6;
    else if (currentFilter === 'all' && hasDeletePerms) colSpanCount = 6;
    
    tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px;">⏳ Loading reports...</td></tr>`;
    
    try {
        const response = await apiFetch(`/api/dashboard-data/?page=${currentReportsPage}`);
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

        tbody.innerHTML = ''; 

        if (tableData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px;">No reports generated yet.</td></tr>`;
        } else {
            tableData.forEach(report => {
                
                let toxicityCellHTML = '';
                let actionCellHTML = '';

                if (currentFilter === 'toxicity') {
                    toxicityCellHTML = `
                        <td>
                            <span style="font-size:.85rem;font-weight:600">${Math.round((report.hate_count / (report.hate_count + report.safe_count || 1)) * 100)}%</span>
                            <div class="confidence-bar">
                                <div class="confidence-fill conf-hate" style="width:${Math.round((report.hate_count / (report.hate_count + report.safe_count || 1)) * 100)}%"></div>
                            </div>
                        </td>
                    `;
                } else if (currentFilter === 'all' && hasDeletePerms) {
                    // 🎯 ONLY generate the <td> if the user has permissions
                    const delBtn = `<button onclick="deleteReport(${report.id}, '${report.filename.replace(/'/g, "\\'")}')" class="btn btn-outline-danger" title="Delete Report">🗑</button>`;
                    actionCellHTML = `
                        <td class="action-column-wrap">
                            <div class="action-flex-container">${delBtn}</div>
                        </td>
                    `;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${report.filename}</strong></td>
                    <td class="row-num">${report.date}</td>
                    <td>${report.uploader}</td>
                    <td><span class="badge badge-hate">${report.hate_count}</span></td>
                    <td><span class="badge badge-safe">${report.safe_count}</span></td>
                    ${toxicityCellHTML}
                    ${actionCellHTML}
                `;
                tbody.appendChild(tr);
            });
        }

        if (typeof updatePaginationUI === 'function' && data.total_pages) {
            updatePaginationUI(
                data.current_page,      
                data.total_pages,       
                'reportsPageNumbers',         
                'reportsPrevBtn',              
                'reportsNextBtn',              
                'goToReportsPage'            
            );
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
    
    // 🎯 Dynamically calculate colSpan based on active filters and permissions
    const hasAdminPerms = typeof canDeleteReports !== 'undefined' ? canDeleteReports : false;
    let colSpanCount = 5; // Base columns
    if (currentFilter !== 'safe') colSpanCount += 1; // Highlights
    if (hasAdminPerms) colSpanCount += 1; // Action column
    
    tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px;">⏳ Loading data...</td></tr>`;

    try {
        const response = await apiFetch(`/api/dashboard-rows/?filter=${currentFilter}&page=${currentPage}`);
        if (!response.ok) throw new Error("Server error");
        
        const data = await response.json();
        const tableRows = data.rows || [];
        
        tbody.innerHTML = ''; 

        if (tableRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px;">No rows found for this filter.</td></tr>`;
        } else {
            tableRows.forEach(row => {
                const isHate = row.status.includes("Hate");
                const confPct = parseInt(row.confidence) || 0; 
                
                let chipsHtml = '<span style="color:var(--muted)">—</span>';
                if (row.hate_words && row.hate_words !== "None") {
                    chipsHtml = row.hate_words.split(',').map(w => `<span class="highlight-chip">${w.trim()}</span>`).join('');
                }

                const highlightsCellHTML = currentFilter !== 'safe' ? `<td>${chipsHtml}</td>` : '';

                // 🎯 Generate the Action Cell ONLY if the user has permissions
                let actionCellHTML = '';
                if (hasAdminPerms) {
                    const overrideBtn = `<button onclick="overrideRowStatus(${row.report_id}, ${row.row_num}, '${row.raw_label}')" class="btn btn-outline-gold" title="Override AI Classification">↻</button>`;
                    actionCellHTML = `
                        <td class="action-column-wrap">
                            <div class="action-flex-container">${overrideBtn}</div>
                        </td>
                    `;
                }

                const tr = document.createElement('tr');
                tr.className = isHate ? 'hate-row' : 'safe-row'; 
                tr.innerHTML = `
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
                `;
                tbody.appendChild(tr);
            });
        }

        if (typeof updatePaginationUI === 'function' && data.total_pages) {
            updatePaginationUI(
                data.current_page,      
                data.total_pages,       
                'pageNumbers',          
                'prevBtn',              
                'nextBtn',              
                'goToPage'              
            );
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
        'Delete Report' // 🎯 Dynamic Button Text!
    );
    
    if (!isConfirmed) return;

    try {
        const token = typeof djangoCsrfToken !== 'undefined' ? djangoCsrfToken : getCookie('csrftoken');
        const response = await fetch(`/api/report/delete/${reportId}/`, {
            method: 'POST',
            headers: { 
                'X-CSRFToken': token, 
                'Content-Type': 'application/json' 
            }
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

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

/* ==========================================================================
   8. ADMINISTRATIVE OVERRIDE
   ========================================================================== */

async function overrideRowStatus(reportId, rowNum, currentLabel) {
    const targetStatus = currentLabel === 'HATE' ? 'NOT HATE' : 'HATE';
    
    const isConfirmed = await showSystemModal(
        'override', 
        'Override AI Classification?', 
        `You are about to manually override Row #${rowNum} from <strong style="color:var(--hate)">${currentLabel}</strong> to <strong style="color:var(--safe)">${targetStatus}</strong>.`,
        `Override to ${targetStatus}` 
    );
    
    if (!isConfirmed) return;

    try {
        const token = typeof djangoCsrfToken !== 'undefined' ? djangoCsrfToken : getCookie('csrftoken');
        
        const response = await fetch(`/api/row/override/${reportId}/${rowNum}/`, { 
            method: 'POST',
            headers: { 
                'X-CSRFToken': token, 
                'Content-Type': 'application/json' 
            }
        });
        const result = await response.json();

        if (response.ok && result.success) {
            // 🎯 Refresh the Global Dashboard Summary Cards
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
            
            // Re-render the table with the new data
            loadTableData(); 
        } else {
            await showSystemModal('error', 'Override Failed', result.error || 'Permission denied.');
        }
    } catch (err) {
        console.error("Override error:", err);
        await showSystemModal('error', 'Network Failure', 'A critical network error occurred during the override.');
    }
}