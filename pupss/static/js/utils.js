// --- utils.js ---
/**
 * Universal Pagination UI Updater
 * @param {number} currentPage - The active page number
 * @param {number} totalPages - The total number of pages
 * @param {string} numbersId - The HTML ID for the numbers container
 * @param {string} prevId - The HTML ID for the Previous button
 * @param {string} nextId - The HTML ID for the Next button
 * @param {string} callbackName - The name of the JS function to fire on click (e.g., 'goToPage')
 */
function updatePaginationUI(currentPage, totalPages, numbersId, prevId, nextId, callbackName) {
    // 1. Update Previous Button
    const prevBtn = document.getElementById(prevId);
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
        prevBtn.style.opacity = currentPage === 1 ? "0.5" : "1";
    }

    // 2. Update Next Button
    const nextBtn = document.getElementById(nextId);
    if (nextBtn) {
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.style.opacity = currentPage === totalPages ? "0.5" : "1";
    }

    // 3. Generate Numbered Buttons (Smart Window)
    const pageNumbersContainer = document.getElementById(numbersId);
    if (!pageNumbersContainer) return;

    pageNumbersContainer.innerHTML = ''; // Clear old numbers
    if (totalPages <= 0) return; // Safety check if there is no data

    let maxVisibleButtons = 3; // How many buttons to show at once
    let startPage = Math.max(1, currentPage - Math.floor(maxVisibleButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);

    // Adjust the start page if we are near the very end
    if (endPage - startPage + 1 < maxVisibleButtons) {
        startPage = Math.max(1, endPage - maxVisibleButtons + 1);
    }

    // A. Add "Page 1" button if we scrolled far away
    if (startPage > 1) {
        pageNumbersContainer.innerHTML += `<button onclick="${callbackName}(1)" style="padding: 6px 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">1</button>`;
        if (startPage > 2) {
            pageNumbersContainer.innerHTML += `<span style="padding: 6px 0; color: #666;">...</span>`;
        }
    }

    // B. Add the main numbered buttons
    for (let i = startPage; i <= endPage; i++) {
        const isActive = (i === currentPage);
        
        // The active page gets the custom red background, others get white
        const btnStyle = isActive
            ? `padding: 6px 12px; background: #75140c; color: white; border: 1px solid #75140c; border-radius: 4px; cursor: pointer; font-weight: bold;`
            : `padding: 6px 12px; background: #fff; color: #333; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;`;

        pageNumbersContainer.innerHTML += `<button onclick="${callbackName}(${i})" style="${btnStyle}">${i}</button>`;
    }

    // C. Add "Last Page" button if we aren't there yet
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
    // Make sure options.headers exists so we don't crash
    options.headers = options.headers || {};
    // Automatically attach the CSRF token to every request
    const csrfToken = getCookie('csrftoken');
    if (csrfToken) {
        options.headers['X-CSRFToken'] = csrfToken;
    }
    // Pass the upgraded options back to the real fetch function
    return fetch(url, options);
}