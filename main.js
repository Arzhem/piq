import {getPage} from "./BackEnd/getPage.js";
import fs from "fs";
import jsdom, {JSDOM} from "jsdom";
import {createElement} from "jsdom/lib/jsdom/living/helpers/create-element.js";


// getPage('https://www.boards.ie/discussion/2058303621/broadband-switch-deals/p6', 'postbit-wrapper');
// compareFiles('feargantae.txt', 'Glencarraig.txt');
// writeTextDifference('./collection.txt', './collection.txt');

// compareFiles('json-a.txt', 'json-old.txt');

// getPage('https://twitchtracker.com/clips', 'clip-title');

/*fetch('https://twitchtracker.com/clips')
    .then((response) => {
        if (!response.ok) {
            throw new Error(`HTTP error, status = ${response.status}`);
        }
        console.log(response.text());
    })
    .catch(error => {
        console.error(error);
    })

// you don't f-ing understand the fetch api */

async function getWebsiteHTML(url) {
    try {
        const res = await fetch(url, {
            headers: {
                "Accept": "text/html"
            }
        });

        if(!res.ok) {throw new Error(res.statusText);}

        const dom = new JSDOM(await res.text()); // FYI: JSDOM constructor has option runScripts: "dangerously".
        const doc = dom.window.document;

        // setDocumentBase(doc, url);
        if(!doc.head) {
            console.log("Fetched resource doesn't have head. Aborting...");
            return;
        }

        const base = doc.createElement("base");

        // making sure to indicate the folder:
        base.href= url.charAt(url.length-1) !== "/" ? url+"/" : url;

        doc.head.prepend(base);
        console.log("Base set.")

        const htmlContent = dom.serialize();

        fs.writeFileSync('test/test.html', htmlContent);

        console.log("HTML is ready!");
    } catch (err) {
        console.log(err);
    }
}

function setDocumentBase(domWindowDocument, baseURL) {
    if(!domWindowDocument.head) {
        console.log("Fetched resource doesn't have head. Aborting...");
        return;
    }

    const base = domWindowDocument.createElement("base");

    // making sure to indicate the folder:
    base.href= baseURL.charAt(baseURL.length-1) !== "/" ? baseURL+"/" : baseURL;

    domWindowDocument.head.prepend(base);
    console.log("Base set.")
}

// getWebsiteHTML("https://twitchtracker.com/clips");

getWebsiteHTML('https://twitchtracker.com');
// getPage('https://www.boards.ie/discussion/2058303621/broadband-switch-deals/p7', 'postbit-wrapper');

//compareFiles('undefined-p6.txt', 'undefined-p6i.txt');