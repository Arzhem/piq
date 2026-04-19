(function() {
    const overlay = document.getElementById('inspector-overlay');
    const label = document.getElementById('inspector-label');
    let isActive = true;

    document.addEventListener('mouseover', (e) => {
        if (!isActive) return;
        const target = e.target;
        if (target.id === 'inspector-overlay' || target.id === 'inspector-label') return;

        const rect = target.getBoundingClientRect();
        overlay.style.display = 'block';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.top = (rect.top + window.scrollY) + 'px';
        overlay.style.left = (rect.left + window.scrollX) + 'px';

        let path = target.tagName.toLowerCase();
        if (target.id) path += '#' + target.id;
        else if (target.className && typeof target.className === 'string') {
            path += '.' + target.className.trim().split(/\s+/).join('.');
        }
        label.textContent = path;
    });

    document.addEventListener('click', (e) => {
        if (!isActive) return;
        e.preventDefault();
        e.stopPropagation();

        let path = e.target.tagName.toLowerCase();
        if (e.target.id) path += '#' + e.target.id;
        else if (e.target.className && typeof e.target.className === 'string') {
            path += '.' + e.target.className.trim().split(/\s+/).join('.');
        }

        // Send the selector back to Svelte
        window.parent.postMessage({ type: 'SELECTOR_PICKED', selector: path }, '*');
        isActive = false; // Turn off after click
        overlay.style.display = 'none';
        alert("Target Locked! You can now save it in the Dashboard.");
    }, true);
})();