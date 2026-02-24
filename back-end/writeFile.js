import fs from "fs";
import { JSDOM } from "jsdom";

/**
 * Writes the text content of a collection to a file,
 * preserving internal whitespace and newlines.
 */
export async function writeHTMLCollection(collection, writingFileName) {
    try {
        // Map each element to its raw textContent and join them with a newline
        // This preserves the internal \n and spaces of each element.
        const content = Array.from(collection)
            .map(item => item.textContent)
            .join('\n');

        if (content.trim().length < 4) {
            console.log('Response is too short or empty! Aborting...');
            return;
        }

        if (fs.existsSync(writingFileName)) {
            console.log(`Warning: ${writingFileName} already exists. Left it unchanged.`);
            return;
        }

        fs.writeFileSync(writingFileName, content, 'utf8');
        console.log(`Success: ${writingFileName} is ready.`);
    } catch (err) {
        console.error('Error writing files: ', err);
    }
}

/**
 * Fetches a page and extracts content based on a class name.
 */
export async function getPage(url, domTag) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const responseHTML = await response.text();
        const dom = new JSDOM(responseHTML);
        const mainWindow = dom.window.document;
        const domContent = mainWindow.getElementsByClassName(domTag);

        // Improved Filename Logic:
        // Removes trailing slashes, splits by '/', and grabs the last two segments
        const urlClean = url.replace(/\/$/, "");
        const urlTokens = urlClean.split('/');
        const lastPart = urlTokens.pop() || "index";
        const secondLastPart = urlTokens.length > 0 ? urlTokens.pop() : "site";

        const writingFileName = `${secondLastPart}-${lastPart}.txt`;

        console.log(`Found ${domContent.length} elements with class "${domTag}".`);
        await writeHTMLCollection(domContent, writingFileName);
    } catch (error) {
        console.error('Fetch error:', error.message);
    }
}

/**
 * Reads a file while keeping the structure,
 * only trimming the very edges of the lines.
 */
export function getSanitizedContent(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log("That file doesn't even exist, dude. Come on.");
        return "";
    }

    return fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map(line => line.trimEnd()) // Use trimEnd to keep leading indentation if desired
        .join('\n');                 // Keeps the line breaks
}