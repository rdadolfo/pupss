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