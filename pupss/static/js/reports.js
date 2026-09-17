// ============================================================================
// 1. GLOBAL VARIABLES & INITIALIZATION
// ============================================================================
let barChartInstance = null;
let doughnutChartInstance = null;
let lastGraphData = null;  
let lastEntityType = null;
let currentReportMode = 'summary'; 

document.addEventListener("DOMContentLoaded", () => {
    populateFileDropdown();
    populateTopNDropdown();
    populateFacultyDropdown(); 
    initThemeObserver(); 

    setupMultiSelect('reportSelectTrigger', 'reportOptionsPanel', 'customReportSelect', 'selectAllReports', '.report-item-checkbox', updateSelectLabel);
    setupMultiSelect('facultySelectTrigger', 'facultyOptionsPanel', 'customFacultySelect', 'selectAllFaculty', '.faculty-item-checkbox', updateFacultySelectLabel);
});

// Helper: Setup Multi-Select Logic
function setupMultiSelect(triggerId, panelId, containerId, selectAllId, itemClass, updateLabelFn) {
    const trigger = document.getElementById(triggerId);
    const panel = document.getElementById(panelId);
    const selectAllCheckbox = document.getElementById(selectAllId);

    if (trigger && panel) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('show');
        });
    }

    window.addEventListener('click', (e) => {
        if (panel && panel.classList.contains('show') && !e.target.closest(`#${containerId}`)) {
            panel.classList.remove('show');
        }
    });

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            document.querySelectorAll(itemClass).forEach(cb => cb.checked = e.target.checked);
            updateLabelFn();
        });
    }
}

function getChartThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        text: isDark ? '#f0f2f5' : '#333333',
        grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
    };
}

function renderDetailedCharts(instructorName, specificGraphData) {
    document.getElementById('barChartTitle').innerText = `Offending Students for: ${instructorName}`;
    drawCharts(specificGraphData, instructorName);
}

function initThemeObserver() {
    new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme' && lastGraphData) {
                drawCharts(lastGraphData, lastEntityType);
            }
        });
    }).observe(document.documentElement, { attributes: true });
}

// Canvas Performance Patch
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, attributes) {
    if (type === '2d') attributes = { ...attributes, willReadFrequently: true };
    return originalGetContext.call(this, type, attributes);
};

// ============================================================================
// 2. UI CONTROLS & API FETCHING
// ============================================================================
function switchReportMode(mode) {
    currentReportMode = mode;
    document.getElementById('btnSummary').classList.toggle('active', mode === 'summary');
    document.getElementById('btnDetailed').classList.toggle('active', mode === 'detailed');
    
    document.getElementById('summaryControls').style.display = mode === 'summary' ? 'flex' : 'none';
    document.getElementById('detailedControls').style.display = mode === 'detailed' ? 'flex' : 'none';
}

function populateTopNDropdown() {
    const select = document.getElementById('topNSelect');
    if (!select) return;
    for (let i = 10; i <= 100; i += 10) {
        select.add(new Option(`Top ${i}`, i, false, i === 10));
    }
}

function getSelectedValues(selectAllId, itemSelector) {
    const selectAll = document.getElementById(selectAllId);
    if (selectAll && selectAll.checked) return 'all';
    const checked = Array.from(document.querySelectorAll(`${itemSelector}:checked`)).map(cb => cb.value);
    return checked.length > 0 ? checked.join(',') : 'all';
}

function updateDropdownLabel(labelId, itemClass, defaultText, allText) {
    const label = document.getElementById(labelId);
    if (!label) return;
    const checkedItems = document.querySelectorAll(`${itemClass}:checked`).length;
    const totalItems = document.querySelectorAll(itemClass).length;

    label.innerText = checkedItems === 0 ? defaultText : (checkedItems === totalItems ? allText : `${checkedItems} Selected`);
    label.style.color = checkedItems === 0 ? "var(--text-muted)" : "var(--body-fg)";
}

const updateSelectLabel = () => updateDropdownLabel('reportSelectLabel', '.report-item-checkbox', "Select Reports...", "All Processed Reports");
const updateFacultySelectLabel = () => updateDropdownLabel('facultySelectLabel', '.faculty-item-checkbox', "Select Faculty...", "All Faculty Members");

async function populateFileDropdown() {
    const container = document.getElementById('dynamicReportOptions');
    if (!container) return; 
    try {
        const res = await apiFetch('/api/dashboard-data/?page=1');
        if (res.ok) {
            const data = await res.json();
            data.table_data.forEach(report => {
                container.insertAdjacentHTML('beforeend', `
                    <label class="custom-option">
                        <input type="checkbox" class="report-item-checkbox" value="${report.id}" checked onchange="handleItemCheck('selectAllReports', '.report-item-checkbox', updateSelectLabel)">
                        <span>${report.filename} <small style="color:var(--text-muted);">(${report.date})</small></span>
                    </label>
                `);
            });
            updateSelectLabel();
        }
    } catch (e) { console.error("Error loading file list:", e); }
}

async function populateFacultyDropdown() {
    const container = document.getElementById('dynamicFacultyOptions');
    if (!container) return; 
    try {
        const res = await apiFetch('/api/get-faculty/');
        if (res.ok) {
            const data = await res.json();
            data.faculty.forEach(instructor => {
                container.insertAdjacentHTML('beforeend', `
                    <label class="custom-option">
                        <input type="checkbox" class="faculty-item-checkbox" value="${instructor}" checked onchange="handleItemCheck('selectAllFaculty', '.faculty-item-checkbox', updateFacultySelectLabel)">
                        <span>${instructor}</span>
                    </label>
                `);
            });
            updateFacultySelectLabel();
        }
    } catch (e) { console.error("Error loading faculty list:", e); }
}

function handleItemCheck(selectAllId, itemClass, updateFn) {
    document.getElementById(selectAllId).checked = document.querySelectorAll(`${itemClass}:checked`).length === document.querySelectorAll(itemClass).length;
    updateFn();
}

// ============================================================================
// 3. MAIN REPORT GENERATOR
// ============================================================================
async function generateInsightReport() {
    const fileIds = getSelectedValues('selectAllReports', '.report-item-checkbox');
    const tableHeaderRow = document.getElementById('tableHeaderRow');
    const tbody = document.getElementById('insightTableBody');
    
    document.getElementById('tableControl').style.display = "flex";
    document.getElementById('chartsContainer').style.display = "grid"; 
    document.getElementById('insightTableContainer').style.display = "block";
    document.getElementById('exportPdfBtn').style.display = "block";
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">Loading insights...</td></tr>';

    let apiUrl = '';
    if (currentReportMode === 'summary') {
        const entityType = document.getElementById('entitySelect').value;
        const topN = document.getElementById('topNSelect').value;
        apiUrl = `/api/generate-insights/?file=${fileIds}&mode=summary&entity=${entityType}&top=${topN}`;
        tableHeaderRow.innerHTML = `<th>Rank</th><th id="tableEntityHeader">Name / ID</th><th>Total</th><th>Hate Count</th><th>Safe Count</th><th>Toxicity %</th>`;
    } else {
        const targetFaculty = getSelectedValues('selectAllFaculty', '.faculty-item-checkbox');
        apiUrl = `/api/generate-insights/?file=${fileIds}&mode=detailed&faculty=${targetFaculty}`;
        tableHeaderRow.innerHTML = `
            <th style="width: 50%; text-align: left; padding-left: 15px; font-size: 1.1em;">✨ Top Representative Safe Feedback</th>
            <th style="width: 50%; text-align: left; padding-left: 15px; border-left: 1px solid var(--border-color); font-size: 1.1em;">🚨 High-Priority Areas of Concern</th>
        `;
    }

    try {
        const response = await apiFetch(apiUrl);
        const data = await response.json();
        lastGraphData = data.graph_data;
        
        if (currentReportMode === 'summary') {
            document.getElementById('instructorTabsContainer').style.display = "none";
            lastEntityType = document.getElementById('entitySelect').value;
            drawCharts(data.graph_data, lastEntityType);
            drawTable(data.table_data, lastEntityType); 
        } else {
            const tabContainer = document.getElementById('instructorTabsContainer');
            tabContainer.style.display = "flex";
            tabContainer.innerHTML = ''; 
            
            const instructors = Object.keys(data.graph_data);
            if (instructors.length > 0) {
                instructors.forEach((instructorName, index) => {
                    const btn = document.createElement('button');
                    btn.className = `btn btn-outline ${index === 0 ? 'active-tab' : ''}`; 
                    btn.innerText = instructorName;
                    
                    btn.onclick = () => {
                        document.querySelectorAll('#instructorTabsContainer .btn').forEach(b => b.classList.remove('active-tab'));
                        btn.classList.add('active-tab');
                        renderDetailedCharts(instructorName, data.graph_data[instructorName]);
                        drawDetailedTable(data.instructor_summaries[instructorName]); 
                    };
                    tabContainer.appendChild(btn);
                });
                
                const firstInstructor = instructors[0];
                renderDetailedCharts(firstInstructor, data.graph_data[firstInstructor]);
                drawDetailedTable(data.instructor_summaries[firstInstructor]);
            } else {
                drawDetailedTable(null);
            }
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color: red;">Error generating insights.</td></tr>';
    }
}

// ============================================================================
// 4. CHART & TABLE RENDERING
// ============================================================================
function drawCharts(graphData, entityType) {
    const themeColors = getChartThemeColors();
    if (barChartInstance) barChartInstance.destroy();
    if (doughnutChartInstance) doughnutChartInstance.destroy();

    document.getElementById('barChartTitle').innerText = `Top ${graphData.labels.length} by Hate Speech Volume`;

    barChartInstance = new Chart(document.getElementById('barChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: graphData.labels, 
            datasets: [{ label: 'Hate Comments', data: graphData.hate_counts, backgroundColor: 'rgba(231, 76, 60, 0.8)', borderColor: 'rgba(231, 76, 60, 1)', borderWidth: 1 }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, suggestedMax: 5, ticks: { color: themeColors.text }, grid: { color: themeColors.grid } },
                y: { ticks: { color: themeColors.text }, grid: { color: themeColors.grid } }
            },
            plugins: { legend: { labels: { color: themeColors.text } } }
        }
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    doughnutChartInstance = new Chart(document.getElementById('doughnutChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Hate Speech', 'Safe Speech'],
            datasets: [{
                data: [graphData.total_hate, graphData.total_safe],
                backgroundColor: ['rgba(231, 76, 60, 0.8)', 'rgba(46, 204, 113, 0.8)'],
                borderWidth: isDark ? 2 : 1,
                borderColor: isDark ? '#1e1e1e' : '#ffffff'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: themeColors.text } } } }
    });
}

function drawTable(tableData, entityType) {
    const tbody = document.getElementById('insightTableBody');
    tbody.innerHTML = ''; 
    document.getElementById('tableEntityHeader').innerText = entityType === 'student' ? 'Student Name / ID' : 'Professor Name / ID';

    if (tableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">No data found for this selection.</td></tr>';
        return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    tableData.forEach((row, index) => {
        tbody.insertAdjacentHTML('beforeend', `
            <tr style="${index === 0 ? (isDark ? 'background-color: rgba(231, 76, 60, 0.15);' : 'background-color: rgba(231, 76, 60, 0.05);') : ''}">
                <td><strong>#${index + 1}</strong></td>
                <td><strong>${row.name}</strong></td>
                <td>${row.total}</td>
                <td><span class="badge badge-hate">${row.hate}</span></td>
                <td><span class="badge badge-safe">${row.safe}</span></td>
                <td><strong>${row.toxicity_pct}%</strong></td>
            </tr>
        `);
    });
}

function drawDetailedTable(summaryData) {
    const tbody = document.getElementById('insightTableBody');
    if (!summaryData || typeof summaryData === 'string') {
        tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:30px; color: var(--text-muted);">${summaryData || "Please select faculty and click Generate Insights."}</td></tr>`;
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td style="vertical-align: top; padding: 30px; line-height: 1.8; font-size: 1.05rem; text-align: left;">
                ${summaryData.strengths || "No strengths identified."}
            </td>
            <td style="vertical-align: top; padding: 30px; border-left: 1px solid var(--border-color); background-color: rgba(231, 76, 60, 0.03); line-height: 1.8; font-size: 1.05rem; text-align: left;">
                ${summaryData.concerns || "No areas of concern identified."}
            </td>
        </tr>
    `;
}

function downloadPDF() {
    const button = document.getElementById('exportPdfBtn');
    button.innerHTML = "Generating PDF...";
    button.disabled = true;

    const fileIds = getSelectedValues('selectAllReports', '.report-item-checkbox');
    let exportUrl = `/api/generate-insights?file=${fileIds}&action=download`;

    if (currentReportMode === 'summary') {
        exportUrl += `&mode=summary&entity=${document.getElementById('entitySelect').value}&top=${document.getElementById('topNSelect').value}`;
    } else {
        exportUrl += `&mode=detailed&faculty=${getSelectedValues('selectAllFaculty', '.faculty-item-checkbox')}`;
    }

    window.location.href = exportUrl;
    setTimeout(() => { button.innerHTML = "📄 Download PDF Report"; button.disabled = false; }, 3000); 
}