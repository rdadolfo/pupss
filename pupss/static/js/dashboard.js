document.addEventListener("DOMContentLoaded", async () => {
        try {
            // This fetches data from your new API view!
            const response = await fetch('/dashboard/data'); 
            
            // If the user isn't an admin, stop here
            if (!response.ok) throw new Error("Unauthorized to view data"); 
            
        
            const data = await response.json();
        
        // 3. Inject the data into the specific HTML IDs
        // We use toLocaleString() to add nice commas to big numbers (e.g., 5,000)
        
            const hateEl = document.getElementById('stat-hate');
            if (hateEl) hateEl.innerText = data.summary.total_hate.toLocaleString();

            const safeEl = document.getElementById('stat-safe');
            if (safeEl) safeEl.innerText = data.summary.total_safe.toLocaleString();

            const reportsEl = document.getElementById('stat-reports');
            if (reportsEl) reportsEl.innerText = data.summary.total_reports.toLocaleString();

            const pctEl = document.getElementById('stat-pct');
            if (pctEl) pctEl.innerText = data.summary.overall_pct + '%';

        } catch (error) {
            console.error("Error loading dashboard data:", error);
        
            // Optional: Show an error state if the server is down
            const reportsEl = document.getElementById('stat-reports');
            if (reportsEl) reportsEl.innerText = "Error";
        }
});