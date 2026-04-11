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

        // Update Next/Prev buttons ---
        document.getElementById('prevBtn').disabled = data.current_page === 1;
        document.getElementById('prevBtn').style.opacity = data.current_page === 1 ? "0.5" : "1";
        
        document.getElementById('nextBtn').disabled = data.current_page === data.total_pages;
        document.getElementById('nextBtn').style.opacity = data.current_page === data.total_pages ? "0.5" : "1";

        // Generate Numbered Buttons (Smart Window) ---
        const pageNumbersContainer = document.getElementById('pageNumbers');
        pageNumbersContainer.innerHTML = ''; // Clear old numbers

        let maxVisibleButtons = 3; // How many buttons to show at once
        let startPage = Math.max(1, data.current_page - Math.floor(maxVisibleButtons / 2));
        let endPage = Math.min(data.total_pages, startPage + maxVisibleButtons - 1);

        // Adjust the start page if we are near the very end
        if (endPage - startPage + 1 < maxVisibleButtons) {
            startPage = Math.max(1, endPage - maxVisibleButtons + 1);
        }

        // A. Add "Page 1" button if we scrolled far away
        if (startPage > 1) {
            pageNumbersContainer.innerHTML += `<button onclick="goToPage(1)" style="padding: 6px 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">1</button>`;
            if (startPage > 2) {
                pageNumbersContainer.innerHTML += `<span style="padding: 6px 0; color: #666;">...</span>`;
            }
        }

        // B. Add the main numbered buttons
        for (let i = startPage; i <= endPage; i++) {
            const isActive = (i === data.current_page);
            
            // The active page gets a blue background, the others get a white background
            const btnStyle = isActive
                ? `padding: 6px 12px; background: #75140c; color: white; border: 1px solid #75140c; border-radius: 4px; cursor: pointer; font-weight: bold;`
                : `padding: 6px 12px; background: #fff; color: #333; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;`;

            pageNumbersContainer.innerHTML += `<button onclick="goToPage(${i})" style="${btnStyle}">${i}</button>`;
        }

        // C. Add "Last Page" button if we aren't there yet
        if (endPage < data.total_pages) {
            if (endPage < data.total_pages - 1) {
                pageNumbersContainer.innerHTML += `<span style="padding: 6px 0; color: #666;">...</span>`;
            }
            pageNumbersContainer.innerHTML += `<button onclick="goToPage(${data.total_pages})" style="padding: 6px 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">${data.total_pages}</button>`;
        }
    } catch (error) {
        console.error("Error loading rows:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color: red;">Error loading data from server.</td></tr>';
    }
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