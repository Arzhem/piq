let inspectorActive = true;
const overlay = document.getElementById('inspector-overlay');
const label = document.getElementById('inspector-label');

window.addEventListener('message', (event) => {
    if (event.data.type === 'TOGGLE_INSPECTOR') {
        inspectorActive = event.data.active;
        if (!inspectorActive) {
            overlay.style.display = 'none';
            document.body.style.cursor = 'auto';
        } else {
            overlay.style.display = 'block';
        }
    }
});

function getCssSelector(el) {
    if (el.tagName.toLowerCase() == "html") return "html";
    let str = el.tagName.toLowerCase();
    str += (el.id != "") ? "#" + el.id : "";
    if (el.className) {
        let classes = el.className.split(/\s+/).filter(c => c);
        for (let i = 0; i < classes.length; i++) {
            str += "." + classes[i];
        }
    }
    return str;
}

document.addEventListener('mouseover', function(e) {
    if (!inspectorActive) return;

    // Don't highlight our own overlay
    if (e.target.id === 'inspector-overlay' || e.target.id === 'inspector-label') return;

    e.stopPropagation();
    const rect = e.target.getBoundingClientRect();

    overlay.style.display = 'block';
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    label.innerText = getCssSelector(e.target);
}, true);

document.addEventListener('click', function(e) {
    if (!inspectorActive) return;

    e.preventDefault();
    e.stopPropagation();

    const selector = getCssSelector(e.target);
    window.parent.postMessage({ type: 'SELECTOR_PICKED', selector: selector }, '*');
}, true);