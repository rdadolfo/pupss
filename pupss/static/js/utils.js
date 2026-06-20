// --- utils.js ---

/**
 * 🎯 GLOBAL TABLE RENDERER
 * Automatically handles empty states, array looping, and DOM insertion.
 * * @param {Array} dataArray - The array of objects to render.
 * @param {string} tbodyId - The ID of the <tbody> to populate.
 * @param {number} colSpan - How many columns the "empty/loading" message should span.
 * @param {string} emptyMsg - The text to show if the array is empty.
 * @param {Function} rowBuilderFn - A callback function that takes a 'row' object and returns an HTML string for the <tr>.
 */
function renderDynamicTable(dataArray, tbodyId, colSpan, emptyMsg, rowBuilderFn) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.innerHTML = ''; // Clear existing rows

    // Handle Empty State
    if (!dataArray || dataArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:30px; color: var(--text-muted);">${emptyMsg}</td></tr>`;
        return;
    }

    // Build and insert rows
    const htmlString = dataArray.map(row => rowBuilderFn(row)).join('');
    tbody.insertAdjacentHTML('beforeend', htmlString);
}

/**
 * Universal Pagination UI Updater
 */
function updatePaginationUI(currentPage, totalPages, numbersId, prevId, nextId, callbackName) {
    const prevBtn = document.getElementById(prevId);
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
        prevBtn.style.opacity = currentPage === 1 ? "0.5" : "1";
    }

    const nextBtn = document.getElementById(nextId);
    if (nextBtn) {
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.style.opacity = currentPage === totalPages ? "0.5" : "1";
    }

    const pageNumbersContainer = document.getElementById(numbersId);
    if (!pageNumbersContainer) return;

    pageNumbersContainer.innerHTML = ''; 
    if (totalPages <= 0) return; 

    let maxVisibleButtons = 3; 
    let startPage = Math.max(1, currentPage - Math.floor(maxVisibleButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);

    if (endPage - startPage + 1 < maxVisibleButtons) {
        startPage = Math.max(1, endPage - maxVisibleButtons + 1);
    }

    if (startPage > 1) {
        pageNumbersContainer.innerHTML += `<button onclick="${callbackName}(1)" style="padding: 6px 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">1</button>`;
        if (startPage > 2) {
            pageNumbersContainer.innerHTML += `<span style="padding: 6px 0; color: #666;">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const isActive = (i === currentPage);
        const btnStyle = isActive
            ? `padding: 6px 12px; background: #75140c; color: white; border: 1px solid #75140c; border-radius: 4px; cursor: pointer; font-weight: bold;`
            : `padding: 6px 12px; background: #fff; color: #333; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;`;

        pageNumbersContainer.innerHTML += `<button onclick="${callbackName}(${i})" style="${btnStyle}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageNumbersContainer.innerHTML += `<span style="padding: 6px 0; color: #666;">...</span>`;
        }
        pageNumbersContainer.innerHTML += `<button onclick="${callbackName}(${totalPages})" style="padding: 6px 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">${totalPages}</button>`;
    }
}

// 1. Standard Django helper to grab the CSRF cookie
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

// 2. 🌟 THE WRAPPER: Use this instead of standard fetch()
async function apiFetch(url, options = {}) {
    options.headers = options.headers || {};
    const csrfToken = getCookie('csrftoken');
    if (csrfToken) {
        options.headers['X-CSRFToken'] = csrfToken;
    }
    return fetch(url, options);
}