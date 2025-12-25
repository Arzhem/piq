const db = require('mariadb');
require('dotenv').config();
const pool = db.createPool({host: '127.0.0.1', user: 'TestUser', connectionLimit: 5});
const compare = require('dom-compare').compare;
const jsdom = require("jsdom");
const fs = require('fs');
const diff = require('diff');
console.log("Make sure MariaDB is running\n");

async function writeHTMLCollection(collection) {
    try {
        let allWords = [];

        for (let item of collection) {
            const words = item.textContent.trim().split(/\s+/); // don't assume. not every page has whitespaces
            allWords.push(...words);
        }

        if (allWords.length < 4) {
            console.log('Not enough words to name the file!');
            return;
        }

        const newFileName = `${allWords[3]}.txt`;
        const content = allWords.join('\n');

        if (fs.existsSync(newFileName)) {
            console.log(`Warning: ${newFileName} already exists. Left it unchanged.`);
            return;
        }

        fs.writeFileSync(newFileName, content, 'utf8');

        console.log(`Success: ${newFileName} is ready with ${allWords.length} lines.`);
    } catch (err) {
        console.error('Error writing files: ', err);
    }
}

async function getPage(url, domTag) {
    // const url = "https://www.boards.ie/discussion/2058303621/broadband-switch-deals";
    try {
        const response = await fetch(url);

        if (!response.ok) throw new Error(response.statusText);

        const responseHTML = await response.text();
        let dom = new jsdom.JSDOM(responseHTML);

        let mainWindow = dom.window.document;

        //let domTag = 'postbit-wrapper';
        let domContent = mainWindow.getElementsByClassName(domTag);
        await writeHTMLCollection(domContent); // manually selecting DOM
    } catch (error) { console.log(error); }
}

function getSanitizedContent(filePath) {
    return fs.readFileSync(filePath, 'utf8', (err) => {console.log('That file prolly doesn even exist, dude. Come on\n'); })
        .split(/\r?\n/)           // Split by any newline type
        .map(line => line.trim())  // Remove invisible leading/trailing whitespace
        .filter(line => line.length > 0) // Remove empty lines
        .join('\n');
}
function compareFiles(path1, path2) {
    const oldData = getSanitizedContent(path1);
    const newData = getSanitizedContent(path2);

    const diff_l = diff.diffLines(oldData, newData, {
        ignoreWhitespace: true
    });

    let changesFound = 0;

    diff_l.forEach((part) => {
        if (part.added || part.removed) {
            const prefix = part.added ? '[ADDED]   +' : '[REMOVED] -';
            // Using trim() again here just to be safe for display
            process.stdout.write(`${prefix} ${part.value.trim()}\n`);
            changesFound++;
        }
    });

    if (changesFound === 0) {
        console.log("Files are identical after normalization.");
    }

    console.log();
}

function extractCharachterTranscript() {

}

// FYI: the following functions don't belong here.
async function getTBBTPage(url, domTag, searchedCharacter = '') {
    // const url = "https://www.boards.ie/discussion/2058303621/broadband-switch-deals";
    try {
        const response = await fetch(url);

        if (!response.ok) throw new Error(response.statusText);

        const responseHTML = await response.text();
        let dom = new jsdom.JSDOM(responseHTML);

        let mainWindow = dom.window.document;

        //let domTag = 'postbit-wrapper';
        let domContent = mainWindow.getElementsByClassName(domTag);
        await writeTBBTHTMLCollection(domContent, url, domTag, searchedCharacter, 'md'); // manually selecting DOM
    } catch (error) { console.log(error); }
}

async function writeTBBTHTMLCollection(collection, url, domTag, searchedCharacter, writingFileFormat = 'txt') {
    if (domTag === 'MsoNormal') {
        try {
            const newFileName = `${searchedCharacter.split(':')[0].toUpperCase()}-${url.split('/')[3]}.${writingFileFormat}`;
            if (fs.existsSync(newFileName)) {
                console.log(`Warning: ${newFileName} already exists. Overwriting.`);
                fs.unlinkSync(newFileName);
            }

            fs.openSync(newFileName, 'w');

            let count = 0;
            let lastCharacter = '';
            let lastScene = '';
            for (let i=0; i<collection.length; i++) {
                const words = collection[i].textContent; // don't assume. not every page has whitespaces
                const currentCharacter = words.split(' ')[0];

                if(currentCharacter === "Scene:") {
                    if(lastScene!=='') lastScene = '';
                    lastScene = words;
                }

                if(currentCharacter === searchedCharacter) {
                    count++;
                    if (writingFileFormat === 'txt') {
                        fs.appendFileSync(newFileName,
                            `[${lastScene}]\n[Prev: ${ lastCharacter==='' ? 'no one' : lastCharacter.split(':')[0]}]\n`);
                    } else if (writingFileFormat === 'md') {
                        fs.appendFileSync(newFileName,
                            `<span style="color: #696969">[${lastScene}]<br>[Prev: ${ lastCharacter==='' ? 'no one' : lastCharacter.split(':')[0]}]<br></span>\n`);
                    }
                    fs.appendFileSync(newFileName, words+'\n\n');
                }

                lastCharacter = '';
                lastCharacter = currentCharacter;
            }

            console.log(`Success: ${newFileName} is ready with ${count} moments.`);
        } catch (err) {
            console.error('Error writing files: ', err);
        }
    } else if (domTag === 'page_item') {
        try {
            fs.openSync('transcript-links.txt', 'w');
            for (let i=1; i<collection.length; i++) {
                var link = collection[i].querySelector('a').getAttribute('href');
                console.log(link);
                fs.appendFileSync('transcript-links.txt', link+'\n');
            }
        } catch (err) {
            console.error('Error writing files: ', err);
        }
    }
}

function TBBT_GetAllTranscriptsFromFor(url, character) {
    //getTBBTPage('https://bigbangtrans.wordpress.com/series-1-episode-1-pilot-episode/', 'MsoNormal', character);

    fs.readFile('transcript-links.txt', 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading the file:", err.message);
            return;
        }

        const links = data.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log(`Found ${links.length} links to process.`);

        links.forEach((link) => {
            getTBBTPage(link, 'MsoNormal', 'Howard:');
            console.log('-----------------------------------');
        });
    });
}


// getPage('https://www.boards.ie/discussion/2058303621/broadband-switch-deals/p5');
// getPage('https://www.boards.ie/discussion/2058303621/broadband-switch-deals/p6', 'postbit-wrapper');
// compareFiles('feargantae.txt', 'Glencarraig.txt');
// writeTextDifference('./collection.txt', './collection.txt');

// getAllTranscriptsFromFor('https://bigbangtrans.wordpress.com/', 'Howard:');

// getTBBTPage('https://bigbangtrans.wordpress.com/series-1-episode-1-pilot-episode/', 'MsoNormal', 'Howard:');
// TBBT_GetAllTranscriptsFromFor('https://bigbangtrans.wordpress.com/', 'Howard:');
TBBT_GetAllTranscriptsFromFor('https://bigbangtrans.wordpress.com/', 'Howard:');