import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// --- IN-MEMORY STORAGE (No Database for this Demo) ---
let trackedTarget = null;

// --- 1. THE FRONTEND UI ---
// Serving a simple HTML page to test the flow
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Piq Prototype</title>
            <style>
                body { font-family: sans-serif; display: flex; flex-direction: column; height: 100vh; margin: 0; }
                #header { padding: 20px; background: #2c3e50; color: white; }
                #workspace { display: flex; flex: 1; overflow: hidden; }
                #sidebar { width: 300px; padding: 20px; background: #ecf0f1; border-right: 2px solid #bdc3c7; }
                iframe { flex: 1; border: none; }
                button { padding: 8px 16px; background: #3498db; color: white; border: none; cursor: pointer; }
                .log { background: #fff; padding: 10px; margin-top: 10px; border: 1px solid #ccc; height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; }
            </style>
        </head>
        <body>
            <div id="header">
                <h2>Piq PoC: Fetch -> Inject -> Track</h2>
                <input type="text" id="urlInput" value="https://example.com" size="50">
                <button onclick="loadProxy()">1. Load & Inject</button>
            </div>
            <div id="workspace">
                <div id="sidebar">
                    <h3>Status</h3>
                    <p id="targetStatus">No target selected.</p>
                    <div id="logs" class="log">Waiting for action...<br></div>
                </div>
                <!-- The iframe where we load the proxied site -->
                <iframe id="previewFrame"></iframe>
            </div>

            <script>
                const logs = document.getElementById('logs');
                function logMsg(msg) { logs.innerHTML += msg + '<br>'; logs.scrollTop = logs.scrollHeight; }

                function loadProxy() {
                    const url = document.getElementById('urlInput').value;
                    logMsg("Fetching proxy for: " + url);
                    // Load the proxy route into the iframe
                    document.getElementById('previewFrame').src = '/proxy?url=' + encodeURIComponent(url);
                }

                // Listen for messages from the Inspector injected into the iframe
                window.addEventListener('message', async (event) => {
                    if (event.data.type === 'SELECTOR_PICKED') {
                        const selector = event.data.selector;
                        const url = document.getElementById('urlInput').value;
                        
                        logMsg("2. Received Selector: <span style='color:blue'>" + selector + "</span>");
                        logMsg("3. Sending to tracking engine...");

                        // Send to our backend
                        const res = await fetch('/track', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url, selector })
                        });
                        const data = await res.json();
                        
                        document.getElementById('targetStatus').innerHTML = 
                            "<b>Tracking:</b><br>" + url + "<br><b>Selector:</b><br>" + selector;
                        
                        logMsg("Target locked. Baseline Hash: " + data.hash.substring(0, 10) + "...");
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// --- 2. THE PROXY & INJECTOR ---
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing URL");

    try {
        const response = await axios.get(targetUrl);
        const $ = cheerio.load(response.data);

        // Inject Base Tag to fix styling
        $('head').prepend(`<base href="${targetUrl}">`);

        // Inject the Mini-Inspector Script
        const inspectorScript = `
            <script>
                document.addEventListener('DOMContentLoaded', () => {
    // Remove any duplicate inspector elements from previous injections
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
        overlay.style.width = \`${rect.width}px\`;
        overlay.style.height = \`${rect.height}px\`;
        overlay.style.top = \`${rect.top + window.scrollY}px\`;
        overlay.style.left = \`${rect.left + window.scrollX}px\`;

        const tagName = element.tagName.toLowerCase();
        const classes = element.className && typeof element.className === 'string'
            ? '.' + element.className.trim().split(/\\s+/).join('.')
            : '';

        label.textContent = classes || tagName;
        pathDisplay.textContent = \`${tagName}${classes}\`;
    }

    document.addEventListener('click', (e) => {
        if (!isInspectorAlive || controls.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        alert(e.target.tagName);
    }, true);
});
            </script>
        `;
        const inspectorHTML = `<div id="inspector-overlay">
    <div id="inspector-label">div</div>
</div>

<div id="inspector-controls">
    <button id="inspector-toggle">Enable Inspector</button>
    <span id="node-path">Inspector is OFF</span>
</div>`;

        $('body').prepend(inspectorHTML);
        $('body').append(inspectorScript);

        res.send($.html());
    } catch (err) {
        res.status(500).send("Proxy error: " + err.message);
    }
});

// --- 3. THE TRACKER SETUP ---
app.post('/track', async (req, res) => {
    const { url, selector } = req.body;

    try {
        // Fetch it once right now to get the baseline hash
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const textContent = $(selector).text().trim().replace(/\\s+/g, ' ');

        const hash = crypto.createHash('sha256').update(textContent).digest('hex');

        // Save to memory
        trackedTarget = { url, selector, lastHash: hash, content: textContent };

        console.log(`[SYSTEM] Now tracking: ${selector} on ${url}`);
        res.json({ success: true, hash });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. THE BACKGROUND WORKER ---
setInterval(async () => {
    if (!trackedTarget) return; // Do nothing if no target is set

    console.log(`[WORKER] Checking ${trackedTarget.url}...`);
    try {
        const response = await axios.get(trackedTarget.url);
        const $ = cheerio.load(response.data);

        const textContent = $(trackedTarget.selector).text().trim().replace(/\\s+/g, ' ');
        const currentHash = crypto.createHash('sha256').update(textContent).digest('hex');

        if (currentHash !== trackedTarget.lastHash) {
            console.log(`\n!!! CHANGE DETECTED !!!`);
            console.log(`Old Content: "${trackedTarget.content}"`);
            console.log(`New Content: "${textContent}"\n`);

            // Update the baseline so we don't keep alerting
            trackedTarget.lastHash = currentHash;
            trackedTarget.content = textContent;
        } else {
            console.log(`[WORKER] No changes.`);
        }
    } catch (err) {
        console.error("[WORKER ERROR]", err.message);
    }
}, 5000); // Checks every 5 seconds for the demo

// --- START ---
app.listen(3000, () => {
    console.log("PoC Server running at http://localhost:3000");
});