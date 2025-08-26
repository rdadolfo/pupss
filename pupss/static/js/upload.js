const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
const logo = document.getElementById('logo');
const idsToHide = ['hide-text', 'hide-button', 'hide-msg', 'hide-msg-info']; 

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
    logo.href = "{% static 'img/txt.png' %}" 
    fileName.style.display = 'block';
    fileName.textContent = `Uploaded: ${file.name}`;
    uploadFile(file);
  }
}

// Upload file to server
function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  fetch('/upload', {
    method: 'POST',
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => console.log('Upload successful:', data))
    .catch((error) => console.error('Upload failed:', error));
}