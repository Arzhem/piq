import fs from "fs";
import jsdom from "jsdom";
import {writeHTMLCollection} from "./writeFile.js";

export async function getPage(url, domTag) {
    // const url = "https://www.boards.ie/discussion/2058303621/broadband-switch-deals";
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(response.statusText);

        const responseHTML = await response.text();

        let dom = new jsdom.JSDOM(responseHTML);
        let mainWindow = dom.window.document;
        let domContent = mainWindow.getElementsByClassName(domTag);
        let urlTokens = url.split('/');

        const writingFileName = `${urlTokens[urlTokens.length + 2]}-${urlTokens[urlTokens.length - 1]}`; // fd up. what if you are fetching the landing page?
        await writeHTMLCollection(domContent, writingFileName); // manually selecting DOM
    } catch (error) { console.log(error); }
}

export function getSanitizedContent(filePath) {
    return fs.readFileSync(filePath, 'utf8', (err) => {console.log('That file prolly doesn even exist, dude. Come on\n'); })
        .split(/\s+/)           // Split by any newline type
        .map(line => line.trim())  // Remove invisible leading/trailing whitespace
        .filter(line => line.length > 0) // Remove empty lines
        .join('\n');
}