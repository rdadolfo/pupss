const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
const logo = document.getElementById('logo');
const idsToHide = ['hide-text', 'hide-button', 'hide-msg', 'hide-msg-info']; 
const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

// Highlight drop zone on dragover
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('dragover');
});

// Remove highlight on dragleave
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

// Handle file drop
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragover');
  const file = event.dataTransfer.files[0];
  handleFile(file);
});

// Handle file input click
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  handleFile(file);
});

// Function to handle file upload
function handleFile(file) {
  if (file) {
    idsToHide.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = 'none';}
      });
    logo.style.display = 'block';
    fileName.style.display = 'block';
    fileName.textContent = `Uploaded: ${file.name}`;
    uploadFile(file);
  }
}

// Upload file to server
function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();
  const progressWrapper = document.getElementById("progress-wrapper");
  const progressBar = document.getElementById("progress-bar");
  const uploadMessage = document.getElementById("upload-message");

  // Reset UI
  progressWrapper.style.display = "block";
  progressBar.style.width = "0%";
  progressBar.textContent = "0%";
  uploadMessage.style.display = "none";

  // Track upload progress
  xhr.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) {
      const percentComplete = Math.round((event.loaded / event.total) * 100);
      progressBar.style.width = percentComplete + "%";
      progressBar.textContent = percentComplete + "%";
    }
  });

  // When upload finishes
  xhr.addEventListener("load", () => {
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);

      progressBar.style.width = "100%";
      progressBar.textContent = "100%";

      // Show success message
      uploadMessage.style.display = "block";
      uploadMessage.style.color = "green";
      uploadMessage.textContent = `✅ Upload finished: ${response.filename}`;

      console.log("Upload successful:", response);
    } else {
      uploadMessage.style.display = "block";
      uploadMessage.style.color = "red";
      uploadMessage.textContent = "❌ Upload failed. Please try again.";
    }
  });

  // Handle errors
  xhr.addEventListener("error", () => {
    uploadMessage.style.display = "block";
    uploadMessage.style.color = "red";
    uploadMessage.textContent = "❌ Network error during upload.";
  });

  // Open and send request
  xhr.open("POST", "/upload/");
  xhr.setRequestHeader("X-CSRFToken", csrfToken);
  xhr.send(formData);
}