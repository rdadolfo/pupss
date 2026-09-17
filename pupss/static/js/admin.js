/* ==========================================================================
   1. REGISTRATION STATE MANAGEMENT
   ========================================================================== */
let allRows = [];
let currentTableData = [];
let currentPage = 1;
const rowsPerPage = 10;
let currentViewMode = 'users';

document.addEventListener("DOMContentLoaded", () => {
    const tableWrap = document.getElementById('recentReportsContainer');
    const controls = document.getElementById('tableControl');
    if (tableWrap) tableWrap.classList.add('container-hidden');
    if (controls) controls.style.display = "none";
});

/* ==========================================================================
   2. REMOTE CALL LAYER ENGINE
   ========================================================================== */
async function loadDataFromServer() {
    const tbody = document.getElementById('TableBody');
    const endpoint = currentViewMode === 'users' ? '/api/admin-user/' : '/api/admin-group/';
    const colSpan = currentViewMode === 'users' ? 8 : 4;

    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:30px; color: var(--text-muted);">⏳ Loading assets...</td></tr>`;
    }

    try {
        // Uses global apiFetch wrapper
        const response = await apiFetch(endpoint);
        
        // SECURITY: Intercept live permission revocation
        if (response.status === 403) {
            await showSystemModal('error', 'Access Restricted', 'Your account permissions have been modified. Please contact your system administrator.');
            window.location.href = '/';
            return;
        }
        
        if (!response.ok) throw new Error(`Status error metrics: ${response.status}`);
        
        const data = await response.json();
        allRows = Array.isArray(data) ? data : (data.users || data.groups || []);
        currentTableData = [...allRows];
        currentPage = 1;
        
        renderTable();
        
    } catch (err) {
        console.error("Data load failure:", err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:30px; color: var(--hate);">Failed to load data from server.</td></tr>`;
    }
}

/* ==========================================================================
   3. VIEW TOGGLE
   ========================================================================== */
function switchViewMode(mode) {
    currentViewMode = mode;
    
    // Unhide container
    const tableWrap = document.getElementById('recentReportsContainer');
    const controls = document.getElementById('tableControl');
    if (tableWrap) tableWrap.classList.remove('container-hidden');
    if (controls) controls.style.display = "flex";

    // Set Title and Button
    const titleEl = document.getElementById('dynamicTableTitle');
    const btnEl = document.getElementById('addEntityBtn');
    
    if (mode === 'users') {
        // 🎯 Uses var(--body-fg) so it turns white in dark mode and black in light mode!
        titleEl.innerHTML = "👥 Active Directory: Users";
        titleEl.style.color = "var(--body-fg)";
        
        btnEl.innerHTML = "+ Add New User";
        btnEl.setAttribute('data-url', createUserUrl || '#');
        
        document.getElementById('TableHead').innerHTML = `
            <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last Login</th>
                <th>System Roles</th>
                <th class="action-column-wrap text-end">Action</th>
            </tr>`;
    } else {
        // 🎯 Uses var(--body-fg) so it turns white in dark mode and black in light mode!
        titleEl.innerHTML = "🛡️ Security Policy: Groups";
        titleEl.style.color = "var(--body-fg)";
        
        btnEl.innerHTML = "+ Create New Group";
        btnEl.setAttribute('data-url', createGroupUrl || '#');
        
        document.getElementById('TableHead').innerHTML = `
            <tr>
                <th>Group Name</th>
                <th>Description</th>
                <th>Members</th>
                <th class="action-column-wrap text-end">Action</th>
            </tr>`;
    }

    loadDataFromServer();
}

/* ==========================================================================
   4. DYNAMIC MATRIX VIEW DOM COMPILER
   ========================================================================== */
function renderTable() {
    const totalPages = Math.ceil(currentTableData.length / rowsPerPage) || 1;
    const colSpan = currentViewMode === 'users' ? 8 : 4;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * rowsPerPage;
    const items = currentTableData.slice(start, start + rowsPerPage);

    // 🎯 Uses the clean renderDynamicTable function
    renderDynamicTable(items, 'TableBody', colSpan, 'No operational records found.', (row) => {
        
        if (currentViewMode === 'users') {
            let groupsHTML = '';
            if (row.groups && row.groups.length > 0) {
                groupsHTML = row.groups.map(name => {
                    const style = (name === 'Admin' || name === 'Manager') ? 'bg-group-admin' : 
                                  (name === 'Auditor' || name === 'Faculty Reviewer') ? 'bg-group-reviewer' : 'bg-group-hr';
                    return `<span class="badge ${style} me-1 mb-1">${name}</span>`;
                }).join('');
            } else {
                const title = row.is_superuser ? 'SysAdmin' : row.is_staff ? 'Faculty/Staff' : 'Regular User';
                const style = row.is_superuser ? 'bg-group-admin' : row.is_staff ? 'bg-group-reviewer' : 'bg-group-hr';
                groupsHTML = `<span class="badge ${style}">${title}</span>`;
            }
            const fullName = (row.first_name || row.last_name) ? `${row.first_name} ${row.last_name}`.trim() : 'No Name Set';
            const hasUserPerms = typeof canManageUsers !== 'undefined' ? canManageUsers : false;
            const passBtn = hasUserPerms ? `<a href="/admin-setting/user/password/${row.id}/" class="btn btn-outline-gold" title="Password">🔑</a>` : '';
            const delBtn = hasUserPerms ? `<button onclick="executePurgeAction('user', ${row.id}, '${row.username}')" class="btn btn-outline-danger" title="Delete">🗑</button>` : '';

            return `
                <tr>
                    <td><strong>${fullName}</strong></td>
                    <td><code>${row.username}</code></td>
                    <td><span class="text-muted">${row.email || 'N/A'}</span></td>
                    <td><span class="badge ${row.is_active ? 'badge-safe' : 'badge-hate'}">${row.is_active ? 'Active' : 'Suspended'}</span></td>
                    <td><span class="text-muted">${new Date(row.date_joined).toLocaleDateString()}</span></td>
                    <td><span class="text-muted">${row.last_login ? new Date(row.last_login).toLocaleDateString() : 'Never'}</span></td>
                    <td><div style="display:flex; flex-wrap:wrap; gap:4px;">${groupsHTML}</div></td>
                    <td class="action-column-wrap">
                        <div class="action-flex-container">
                            <a href="/admin-setting/user/edit/${row.id}/" class="btn btn-outline-green" title="Edit">✎</a>
                            ${passBtn} ${delBtn}
                        </div>
                    </td>
                </tr>`;
        } else {
            const hasSystemPerms = typeof canManageSystem !== 'undefined' ? canManageSystem : false;
            const delBtn = hasSystemPerms ? `<button onclick="executePurgeAction('group', ${row.id}, '${row.name}')" class="btn btn-outline-danger" title="Delete">🗑</button>` : '';
            
            // 🎯 Dynamic Member Pluralization Logic (0/1 = Member, 2+ = Members)
            const mCount = row.member_count || 0;
            const mText = mCount <= 1 ? 'Member' : 'Members';
            
            return `
                <tr>
                    <td><strong>${row.name}</strong></td>
                    <td class="text-muted">${row.description || 'No descriptive summary added.'}</td>
                    <td><span class="badge badge-safe">${mCount} ${mText}</span></td>
                    <td class="action-column-wrap">
                        <div class="action-flex-container">
                            <a href="/admin-setting/group/edit/${row.id}/" class="btn btn-outline-green" title="Edit">✎</a>
                            ${delBtn}
                        </div>
                    </td>
                </tr>`;
        }
    });

    if (typeof updatePaginationUI === 'function') {
        updatePaginationUI(currentPage, totalPages, 'reportsPageNumbers', 'reportsPrevBtn', 'reportsNextBtn', 'goToPage');
    }
}

/* ==========================================================================
   5. COMPACT INTERFACE CONTROL ACTIONS
   ========================================================================== */
function changePage(dir) { currentPage += dir; renderTable(); }
function goToPage(num) { currentPage = num; renderTable(); }