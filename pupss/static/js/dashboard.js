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
            
            const hateEl = document.getElementById('stat-hate');
            if (hateEl) hateEl.innerText = data.summary.total_hate.toLocaleString();

            const safeEl = document.getElementById('stat-safe');
            if (safeEl) safeEl.innerText = data.summary.total_safe.toLocaleString();

            const reportsEl = document.getElementById('stat-reports');
            if (reportsEl) reportsEl.innerText = data.summary.total_reports.toLocaleString();

            const pctEl = document.getElementById('stat-pct');
            if (pctEl) pctEl.innerText = data.summary.overall_pct + '%';
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
    currentReportsPage = 1; // Reset pages when switching filters
    
    // Grab the elements
    const tableControl = document.getElementById('tableControl');
    const titleEl = document.getElementById('dynamicTableTitle');
    const recentReportsContainer = document.getElementById('recentReportsContainer');
    const deepDiveContainer = document.getElementById('reportsTableContainer');
    const toxHeader = document.getElementById('col-toxicity');

    if (tableControl) tableControl.style.display = "flex";

    if (filterType === 'all') {
        // 🌟 "ALL" CLICKED: Show Reports, Hide Deep Dive
        titleEl.innerText = "📄 All Reports Generated";
        titleEl.style.color = "#333";
        
        toxHeader.style.display = 'none';
        if (recentReportsContainer) recentReportsContainer.style.display = "block"; 
        if (deepDiveContainer) deepDiveContainer.style.display = "none";
        
        loadReportsTable(); 
    } else if (filterType === 'toxicity') {
        titleEl.innerText = "⚠️ All Reports with Toxicity Scores";
        titleEl.style.color = "#f39c12";
        
        if (toxHeader) {
            toxHeader.style.display = filterType === 'toxicity' ? 'table-cell' : 'none';
        }
        if (recentReportsContainer) recentReportsContainer.style.display = "block"; 
        if (deepDiveContainer) deepDiveContainer.style.display = "none";
        loadReportsTable(); 

    } else {
        // 🌟 "HATE/SAFE" CLICKED: Hide Reports, Show Deep Dive
        if (filterType === 'hate') {
            titleEl.innerText = "🚨 Filtered: Individual Rows (Hate Speech)";
            titleEl.style.color = "#e74c3c";
        } else if (filterType === 'safe') {
            titleEl.innerText = "✅ Filtered: Individual Rows (Safe Speech)";
            titleEl.style.color = "#2ecc71";
        }

        if (recentReportsContainer) recentReportsContainer.style.display = "none"; 
        if (deepDiveContainer) deepDiveContainer.style.display = "block";
        
        loadTableData(); 
    }
    
    // Smoothly scroll down to the table controls header so the user sees the title
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
        const colSpanCount = currentFilter === 'toxicity' ? 6 : 5;
        // 🌟 2. Apply it to the Loading State
        tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px;">⏳ Loading reports...</td></tr>`;
    try {
        const response = await apiFetch(`/api/dashboard-data/?page=${currentReportsPage}`);
        if (!response.ok) throw new Error("Server error");
        
        const data = await response.json();

        // Keep cards updated just in case new data arrived
        const hateEl = document.getElementById('stat-hate');
        if (hateEl) hateEl.innerText = data.summary.total_hate.toLocaleString();
        const safeEl = document.getElementById('stat-safe');
        if (safeEl) safeEl.innerText = data.summary.total_safe.toLocaleString();
        const reportsEl = document.getElementById('stat-reports');
        if (reportsEl) reportsEl.innerText = data.summary.total_reports.toLocaleString();
        const pctEl = document.getElementById('stat-pct');
        if (pctEl) pctEl.innerText = data.summary.overall_pct + '%';

        // Draw the Table Rows
        tbody.innerHTML = ''; 
        // 🌟 Check the current filter to set the correct column span
        const colSpanCount = currentFilter === 'toxicity' ? 6 : 5;

        if (data.table_data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align:center; padding:30px;">No reports generated yet.</td></tr>`;
        } else {
            data.table_data.forEach(report => {
                
                // 🌟 Create an empty string for the optional cell
                let toxicityCellHTML = ''; 
                
                // 🌟 If we are on the Toxicity view, calculate the % and build the cell
                if (currentFilter === 'toxicity') {
                    const total = report.hate_count + report.safe_count;
                    const pct = total > 0 ? Math.round((report.hate_count / total) * 100) : 0;
                    
                    toxicityCellHTML = `
                        <td>
                            <span style="font-size:.85rem;font-weight:600">${pct}%</span>
                            <div class="confidence-bar">
                                <div class="confidence-fill conf-hate" style="width:${pct}%"></div>
                            </div>
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
                    ${toxicityCellHTML} `;
                tbody.appendChild(tr);
            });
        }

        // Delegate pagination drawing to utils.js
        if (typeof updatePaginationUI === 'function') {
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
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">⏳ Loading data...</td></tr>';

    try {
        const response = await apiFetch(`/api/dashboard-rows/?filter=${currentFilter}&page=${currentPage}`);
        if (!response.ok) throw new Error("Server error");
        
        const data = await response.json();
        tbody.innerHTML = ''; 

        if (data.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">No rows found for this filter.</td></tr>';
        } else {
            data.rows.forEach(row => {
                const isHate = row.status.includes("Hate");
                const confPct = parseInt(row.confidence) || 0; 
                
                let chipsHtml = '<span style="color:var(--muted)">—</span>';
                if (row.hate_words && row.hate_words !== "None") {
                    const wordsArray = row.hate_words.split(',');
                    chipsHtml = wordsArray.map(w => `<span class="highlight-chip">${w.trim()}</span>`).join('');
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
                    <td>${chipsHtml}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Delegate pagination drawing to utils.js
        if (typeof updatePaginationUI === 'function') {
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color: red;">Error loading data from server.</td></tr>';
    }
}

/* ==========================================================================
   6. PAGINATION CONTROLS
   ========================================================================== */

function downloadDashboardData() {
    window.location.href = `/api/dashboard-download/?filter=${currentFilter}`;
}

// --- CONTROLS FOR DEEP DIVE TABLE ---
function changePage(direction) {
    currentPage += direction;
    loadTableData();
}

function goToPage(pageNum) {
    currentPage = pageNum;
    loadTableData();
}

// --- CONTROLS FOR REPORTS TABLE ---
function changeReportsPage(direction) {
    currentReportsPage += direction;
    loadReportsTable(); 
}

function goToReportsPage(pageNum) {
    currentReportsPage = pageNum;
    loadReportsTable();
}