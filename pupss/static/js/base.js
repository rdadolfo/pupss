function updateFavicon(theme) {
    const favicon = document.getElementById('favicon');
        if (favicon) {
            // 2. Use the global variables we defined in base.html!
            favicon.href = theme === 'dark' ? FAVICON_DARK_URL : FAVICON_LIGHT_URL;
        }
    }

function updateThemeButtonText(theme) {
    const btn = document.getElementById('globalThemeToggleBtn');
        if (btn) {
            btn.innerHTML = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
        }
    }

function toggleGlobalTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('pupss-theme', targetTheme);
            
    updateThemeButtonText(targetTheme);
    updateFavicon(targetTheme);
}

        // Ensure visuals match the <head> script on a fresh load
document.addEventListener("DOMContentLoaded", () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    updateThemeButtonText(currentTheme);
    updateFavicon(currentTheme);
});

        // 🌟 THE BFCache FIX: Wake up and check storage when the Back/Cancel button is used
window.addEventListener('pageshow', (event) => {
    if (event.persisted) { // event.persisted means the page was pulled from the frozen cache
        const savedTheme = localStorage.getItem('pupss-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const activeTheme = savedTheme || (prefersDark ? 'dark' : 'light');
                
                // Force the page to update to the true current theme
        document.documentElement.setAttribute('data-theme', activeTheme);
        updateThemeButtonText(activeTheme);
        updateFavicon(activeTheme);
    }
});

        // Track OS adjustments on the fly
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('pupss-theme')) {
        const systemTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', systemTheme);
        updateThemeButtonText(systemTheme);
        updateFavicon(systemTheme);
    }
});
