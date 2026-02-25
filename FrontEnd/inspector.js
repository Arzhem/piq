let isInspectorAlive = false;
const toggleButton = document.getElementById('inspector-toggle');
const overlay = document.getElementById('inspector-overlay');
const label = document.getElementById('inspector-label');
const pathDisplay = document.getElementById('node-path');
const controls = document.getElementById('inspector-controls');

toggleButton.addEventListener('click', () => {
    isInspectorAlive = !isInspectorAlive;
    if(isInspectorAlive) {
        toggleButton.textContent = "Disable Inspector";
        toggleButton.classList.add('active');
        pathDisplay.textContent = "Hover over an element...";
        document.body.style.cursor = "pointer";
    } else {
        toggleButton.textContent = "Enable Inspector";
        toggleButton.classList.remove('active');
        pathDisplay.textContent = "Inspector is OFF";
        document.body.style.cursor = "default";
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isInspectorAlive) return;
    let target = e.target;
    if (controls.contains(target) || target === overlay) return;

    highlightElement(target);
});

function highlightElement(element) {
    const DOMRect = element.getBoundingClientRect();


    overlay.style.display = 'block';
    overlay.style.width = `${DOMRect.width}px`;
    overlay.style.height = `${DOMRect.height}px`;
    overlay.style.top = `${DOMRect.top}px`;
    overlay.style.left = `${DOMRect.left}px`;

    const tagName = element.tagName.toLowerCase();
    const classes = element.className ? '.' + element.className.split(' ').join('.') : '';
    const labelText = `${tagName}${classes}`;

    label.textContent = classes;
    pathDisplay.textContent = labelText
}

document.addEventListener('click', (e) => {
    if (!isInspectorAlive || controls.contains(e.target)) return;

    e.preventDefault(); // don't trigger element
    e.stopPropagation();

    alert(e.target.tagName)
}, true); // trigger before target element's handler