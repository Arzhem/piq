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

// Generates a strictly unique DOM path
function getCssSelector(el) {
    if (el.tagName.toLowerCase() == "html") return "html";
    let path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break;
        } else {
            let sib = el, nth = 1;
            while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() == selector) nth++;
            }
            if (nth != 1) selector += ":nth-of-type("+nth+")";
        }
        path.unshift(selector);
        el = el.parentNode;
    }
    return path.join(" > ");
}

document.addEventListener('mouseover', function(e) {
    if (!inspectorActive) return;
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