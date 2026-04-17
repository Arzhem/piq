document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#inspector-overlay:not(:last-of-type)').forEach(el => el.remove());
    document.querySelectorAll('#inspector-controls:not(:last-of-type)').forEach(el => el.remove());

    let isInspectorAlive = false;
    const toggleButton = document.getElementById('inspector-toggle');
    const overlay = document.getElementById('inspector-overlay');
    const label = document.getElementById('inspector-label');
    const pathDisplay = document.getElementById('node-path');
    const controls = document.getElementById('inspector-controls');

    if (!toggleButton) { console.error('Inspector: toggle button not found'); return; }

    toggleButton.addEventListener('click', () => {
        isInspectorAlive = !isInspectorAlive;
        if (isInspectorAlive) {
            toggleButton.textContent = "Disable Inspector";
            toggleButton.classList.add('active');
            pathDisplay.textContent = "Hover over an element...";
            document.body.style.cursor = "pointer";
        } else {
            toggleButton.textContent = "Enable Inspector";
            toggleButton.classList.remove('active');
            pathDisplay.textContent = "Inspector is OFF";
            document.body.style.cursor = "default";
            overlay.style.display = 'none';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isInspectorAlive) return;
        const target = e.target;
        if (controls.contains(target) || target === overlay) return;
        highlightElement(target);
    });

    function highlightElement(element) {
        const rect = element.getBoundingClientRect();

        overlay.style.display = 'block';
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.top = `${rect.top + window.scrollY}px`;
        overlay.style.left = `${rect.left + window.scrollX}px`;

        const tagName = element.tagName.toLowerCase();
        const classes = element.className && typeof element.className === 'string'
            ? '.' + element.className.trim().split(/\s+/).join('.')
            : '';

        label.textContent = classes || tagName;
        pathDisplay.textContent = `${tagName}${classes}`;
    }

    document.addEventListener('click', (e) => {
        if (!isInspectorAlive || controls.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        alert(e.target.tagName);
    }, true);
});