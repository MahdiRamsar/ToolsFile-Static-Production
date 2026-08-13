
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const processingDiv = document.getElementById('processing');
    const resultDiv = document.getElementById('result');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFiles({ target: { files: dt.files } });
    }, false);

    fileInput.addEventListener('change', (e) => handleFiles(e), false);

    function handleFiles(e) {
        const files = e.target.files;
        if (files.length === 0) return;
        // Simulate Processing
        dropZone.classList.add('hidden');
        processingDiv.classList.remove('hidden');
        
        // Track Event (Mock)
        console.log('File uploaded:', files[0].name);

        setTimeout(() => {
            processingDiv.classList.add('hidden');
            resultDiv.classList.remove('hidden');
            console.log('Conversion complete.');
        }, 2500);
    }
});
