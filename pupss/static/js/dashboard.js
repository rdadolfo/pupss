// ── Global State ────────────────────────────────────────────────────────────
let currentFilter = 'all';
let currentPage = 1;

// ── On Page Load: Fetch Cards AND Initial Table ─────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    // Fetch the big summary numbers for the cards
    try {
        const summaryResponse = await apiFetch('/dashboard/stats');
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

    loadTableData(); // Fetch data from server for the initial table view (all rows, page 1)
})

// Triggered when a user clicks the HTML Cards
function filterTable(filterType) {
    currentFilter = filterType;
    currentPage = 1; // Always reset to page 1 when clicking a new filter
    
    // Update UI Title
    const titleEl = document.getElementById('dynamicTableTitle');
    if (filterType === 'hate') {
        titleEl.innerText = "🚨 Filtered: Individual Rows (Hate Speech)";
        titleEl.style.color = "#e74c3c";
    } else if (filterType === 'safe') {
        titleEl.innerText = "✅ Filtered: Individual Rows (Safe Speech)";
        titleEl.style.color = "#2ecc71";
    } else {
        titleEl.innerText = "📄 All Processed Rows";
        titleEl.style.color = "#333";
    }

    document.getElementById('reportsTableContainer').style.display = "block";
    loadTableData(); // Fetch data from server for the new filter and reset to page 1

    // Automatically scroll down to the table!
    reportsTableContainer.scrollIntoView({ 
        behavior: 'smooth', // Makes it a smooth glide instead of a jarring jump
        block: 'center'      // Aligns the top of the table with the top of the screen
    });
}

// Function to fetch specific rows from Django
async function loadTableData() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">⏳ Loading data...</td></tr>';

    try {
        const response = await apiFetch(`/dashboard/rows/?filter=${currentFilter}&page=${currentPage}`);
        if (!response.ok) throw new Error("Server error");
        
        const data = await response.json();
        tbody.innerHTML = ''; // Clear loading text

        if (data.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No rows found for this filter.</td></tr>';
        } else {
            // Draw the rows!
            data.rows.forEach(row => {
                const isHate = row.status.includes("Hate");
                const rowColor = isHate ? "background-color: #ffe6e6;" : ""; 

                const tr = document.createElement('tr');
                tr.style = rowColor;
                tr.innerHTML = `
                    <td style="padding: 12px; border: 1px solid #ddd; font-size: 12px;">${row.filename}</td>
                    <td style="padding: 12px; border: 1px solid #ddd;"><strong>${row.row_num}</strong></td>
                    <td style="padding: 12px; border: 1px solid #ddd;">${row.text}</td>
                    <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: ${isHate ? 'red' : 'green'};">${row.status}</td>
                    <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">${row.confidence}</td> <td style="padding: 12px; border: 1px solid #ddd; color: #d35400;">${row.hate_words}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Call the utility function:
        updatePaginationUI(
            data.current_page,      // Current page from API
            data.total_pages,       // Total pages from API
            'pageNumbers',          // ID of the numbers div
            'prevBtn',              // ID of the Previous button
            'nextBtn',              // ID of the Next button
            'goToPage'              // The function triggered when clicking a number
        );

    } catch (error) {
        console.error("Error loading rows:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color: red;">Error loading data from server.</td></tr>';
    }
}

// ── Export Dashboard Data ────────────────────────────────────────────────────
function downloadDashboardData() {
    // Redirects the browser to the URL, which instantly triggers the file download
    window.location.href = `/dashboard/download/?filter=${currentFilter}`;
}

// Triggered by the Next/Prev buttons
function changePage(direction) {
    currentPage += direction;
    loadTableData();
}

// --- Jumps directly to a specific page ---
function goToPage(pageNum) {
    currentPage = pageNum;
    loadTableData();
}