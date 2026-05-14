let inspectorActive = true;
const overlay = document.getElementById('inspector-overlay');
const label = document.getElementById('inspector-label');

overlay.style.pointerEvents = 'none';
label.style.pointerEvents = 'none';
overlay.style.position = 'absolute';
overlay.style.zIndex = '999999';

window.addEventListener('message', (event) => {
    if (event.data.type === 'TOGGLE_INSPECTOR') {
        inspectorActive = event.data.active;
        overlay.style.display = !inspectorActive ? 'none' : 'block';
    }
});

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

document.addEventListener('mousemove', function(e) {
    if (!inspectorActive) return;
    if (e.target.tagName.toLowerCase() === 'body' || e.target.tagName.toLowerCase() === 'html') {
        overlay.style.display = 'none';
        return;
    }
    const rect = e.target.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    label.innerText = getCssSelector(e.target);
}, true);

window.addEventListener('scroll', function() {
    if (inspectorActive) overlay.style.display = 'none';
}, true);

// Intercept ALL interaction events before the video can process them
['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt => {
    document.addEventListener(evt, function(e) {
        if (!inspectorActive) return;
        e.preventDefault();
        e.stopPropagation();

        if (evt === 'click') {
            const selector = getCssSelector(e.target);
            window.parent.postMessage({ type: 'SELECTOR_PICKED', selector: selector }, '*');
        }
    }, true); // 'true' forces the capture phase
});