import fs from "fs";
import { JSDOM } from "jsdom";
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

async function getWebsiteHTML(url) {
    try {
        const res = await fetch(url, { headers: { "Accept": "text/html" } });
        if (!res.ok) throw new Error(res.statusText);

        const dom = new JSDOM(await res.text());
        const doc = dom.window.document;

        if (!doc.head) {
            console.log("No <head>. Aborting...");
            return;
        }

        const base = doc.createElement("base");
        base.href = url.endsWith("/") ? url : url + "/";
        doc.head.prepend(base);

        // Ensure the directory exists before writing
        if (!fs.existsSync('test')){
            fs.mkdirSync('test');
        }

        fs.writeFileSync('test/test1.html', dom.serialize());
        console.log("HTML is ready!");
    } catch (err) {
        console.error("getWebsiteHTML error:", err);
    }
}

async function injectInspector(filePath) {
    try {
        let html = await fs.promises.readFile(filePath, "utf-8");

        // strip any previously injected inspector elements
        html = html.replace(/<style id="inspector-style">[\s\S]*?<\/style>/gi, '');
        html = html.replace(/<div id="inspector-overlay">[\s\S]*?<\/div>\s*<\/div>/gi, '');
        html = html.replace(/<div id="inspector-controls">[\s\S]*?<\/div>\s*<\/div>/gi, '');
        html = html.replace(/<script id="inspector-script">[\s\S]*?<\/script>/gi, '');

        const cssContent = await fs.promises.readFile("./FrontEnd/inspector.css", "utf-8");
        html = html.replace(/<\/head>/i, `<style id="inspector-style">\n${cssContent}\n</style>\n</head>`);
        console.log("Style injected.");

        const scriptContent = await fs.promises.readFile("./FrontEnd/inspector.js", "utf-8");
        const injection = `
<div id="inspector-overlay">
    <div id="inspector-label">div</div>
</div>
<div id="inspector-controls">
    <button id="inspector-toggle">Enable Inspector</button>
    <span id="node-path">Inspector is OFF</span>
</div>
<script id="inspector-script">
${scriptContent}
</script>`;

        html = html.replace(/<\/body>/i, `${injection}\n</body>`);
        console.log("Inspector HTML + script injected.");

        await fs.promises.writeFile(filePath, html, "utf-8");
        console.log("Done. Written to", filePath);
    } catch (err) {
        console.error("injectInspector error:", err);
    }
}

function setDocumentBase(domWindowDocument, baseURL) {
    if (!domWindowDocument.head) {
        console.log("Fetched resource doesn't have head. Aborting...");
        return;
    }

    const base = domWindowDocument.createElement("base");
    base.href = baseURL.charAt(baseURL.length - 1) !== "/" ? baseURL + "/" : baseURL;
    domWindowDocument.head.prepend(base);
    console.log("Base set.");
}

async function run() {
    // await getWebsiteHTML('https://example.com');
    await injectInspector('test/test1.html');
}

async function scrapeAndHash(url, selector) {
    try {
        console.log(`Fetching ${url}...`);
        const response = await axios.get(url, {
            // some sites apparently block requests without a user-agent
            headers: { 'User-Agent': 'piq/0.1' }
        });

        const $ = cheerio.load(response.data);
        const target = $(selector);

        if (!target.length) {
            console.log(`Selector '${selector}' found 0 elements on the page.`);
            return null;
        }

        // cleaning from weird formatting/spacing
        const cleanText = target.text().trim().replace(/\s+/g, ' ');
        const htmlSnippet = target.html();

        const hash = crypto.createHash('sha256').update(cleanText).digest('hex');

        return { hash, cleanText, htmlSnippet };
    } catch (error) {
        console.error(`Fetch failed: ${error.message}`);
        return null;
    }
}

// just some mock data
const myTarget = {
    url: 'http://quotes.toscrape.com/random',
    selector: '.text',
    lastHash: null
};

async function runTest() {
    console.log("=== PIQ START ===");

    const baseline = await scrapeAndHash(myTarget.url, myTarget.selector);

    if (baseline) {
        myTarget.lastHash = baseline.hash;
        console.log(`Extracted Text: "${baseline.cleanText}"`);
        console.log(`Baseline Hash: ${baseline.hash}`);
    } else {
        console.log("Failed. Could not establish baseline. Exiting.");
        return;
    }

    let checkCount = 1; // just simulating, hold on
    const interval = setInterval(async () => {
        console.log(`\nCHECK#${checkCount}> Checking target...`);
        const currentData = await scrapeAndHash(myTarget.url, myTarget.selector);

        if (currentData) {
            if (currentData.hash !== myTarget.lastHash) {
                console.log(`Change detected!`);
                console.log(`New Hash: ${currentData.hash}`);
                console.log(`New HTML to show in UI: \n${currentData.htmlSnippet}`);

                // update db so we don't alert again for the same change
                myTarget.lastHash = currentData.hash;
            } else {
                console.log(`[202] No changes detected. Hashes match.`);
            }
        }

        checkCount++;

        // so it doesn't check forever:
        if (checkCount > 3) {
            clearInterval(interval);
            console.log("\n=== TEST COMPLETE ===");
        }
    }, 3000);
}

// Execute the test
runTest();