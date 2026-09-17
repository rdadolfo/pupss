/**
 * Custom Promise-based Modal
 * @param {string} type - 'warning', 'delete', 'override', 'success', 'error'
 * @param {string} title - The header text
 * @param {string} message - The body HTML
 * @param {string} customBtnText - (Optional) Custom text for the confirm button
 */
function showSystemModal(type, title, message, customBtnText = null) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customModalOverlay');
        const iconEl = document.getElementById('modalIcon');
        const cancelBtn = document.getElementById('customModalCancel');
        const confirmBtn = document.getElementById('customModalConfirm');
        
        // Set Text
        document.getElementById('customModalTitle').innerHTML = title;
        document.getElementById('customModalMessage').innerHTML = message;
        
        // Configure Modal Type & Buttons
        if (type === 'warning' || type === 'delete') {
            iconEl.innerHTML = '⚠️';
            cancelBtn.style.display = 'inline-flex';
            confirmBtn.innerText = customBtnText || 'Delete Permanently'; // Dynamic Text
            confirmBtn.style.background = '#dc3545'; // Danger Red
            confirmBtn.style.borderColor = '#dc3545';
            
        } else if (type === 'override') {
            iconEl.innerHTML = '🔄';
            cancelBtn.style.display = 'inline-flex';
            confirmBtn.innerText = customBtnText || 'Confirm Override'; // Dynamic Text
            confirmBtn.style.background = 'var(--maroon-base)'; // Safe Theme Color
            confirmBtn.style.borderColor = 'var(--maroon-base)';
            
        } else {
            iconEl.innerHTML = type === 'success' ? '✅' : '❌';
            cancelBtn.style.display = 'none'; // Hide cancel for simple alerts
            confirmBtn.innerText = customBtnText || 'OK';
            confirmBtn.style.background = 'var(--primary)'; // Standard theme color
            confirmBtn.style.borderColor = 'var(--primary)';
        }

        // Show Modal
        overlay.classList.add('show');

        // Cleanup and Resolve function
        const closeAndResolve = (result) => {
            overlay.classList.remove('show');
            cancelBtn.onclick = null;
            confirmBtn.onclick = null;
            resolve(result);
        };

        // Attach Listeners
        cancelBtn.onclick = () => closeAndResolve(false);
        confirmBtn.onclick = () => closeAndResolve(true);
    });
}

// The Updated Purge Action for Admin.js
async function executePurgeAction(type, id, name) {
    const isConfirmed = await showSystemModal(
        'warning', 
        'CRITICAL WARNING!', 
        `Are you sure you want to delete the ${type} "<strong>${name}</strong>"?<br><br>This action cannot be undone.`,
        'Delete Permanently' 
    );
    
    if (!isConfirmed) return;

    const url = type === 'user' ? `/admin-setting/user/delete/${id}/` : `/admin-setting/group/delete/${id}/`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'X-CSRFToken': djangoCsrfToken, 
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest' // Always good to explicitly state this for Django
            }
        });
        const result = await response.json();

        if (response.ok && result.success) {
            
            // ─── INSTANT DOM UPDATE ADDED HERE ──────────────────────
            if (result.total_users !== undefined && document.getElementById('user-count')) {
                document.getElementById('user-count').textContent = result.total_users;
            }
            if (result.total_groups !== undefined && document.getElementById('group-count')) {
                document.getElementById('group-count').textContent = result.total_groups;
            }
            // ────────────────────────────────────────────────────────
            
            await showSystemModal('success', 'Operation Successful', result.message);
            loadDataFromServer(); // Refreshes your table
        } else {
            await showSystemModal('error', 'Operation Denied', result.error || 'Permission denied.');
        }
    } catch (err) {
        console.error(`Removal failure processing for ${type}:`, err);
        await showSystemModal('error', 'Network Failure', 'A critical network error occurred during deletion. Please try again.');
    }
}