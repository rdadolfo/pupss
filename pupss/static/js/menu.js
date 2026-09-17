document.addEventListener("DOMContentLoaded", () => {
  const triggerBtn = document.getElementById("menuTriggerBtn");
  const dropdown = document.getElementById("simpleDropdown");

  if (triggerBtn && dropdown) {
      // Toggle menu on click
      triggerBtn.addEventListener("click", function(event) {
        dropdown.classList.toggle("show-menu");
        event.stopPropagation(); 
      });

      // Close menu when clicking outside
      window.addEventListener("click", function() {
        if (dropdown.classList.contains('show-menu')) {
          dropdown.classList.remove('show-menu');
        }
      });
  }
});