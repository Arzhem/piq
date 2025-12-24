const db = require('mariadb');
require('dotenv').config();
const pool = db.createPool({host: '127.0.0.1', user: 'TestUser', connectionLimit: 5});
const compare = require('dom-compare').compare;
const jsdom = require("jsdom");
const fs = require('fs');
const diff = require('diff');


console.log("Make sure MariaDB is running\n");

async function asyncFunction() {
    let conn;
    console.log("In func");
    try {

        conn = await pool.getConnection();
        const usedb = await conn.query(`USE test`);
        const rows = await conn.query("SELECT 1 as val");
        console.log(rows);
        // rows: [ {val: 1}, meta: ... ]

        const res = await conn.query("INSERT INTO myTable value (?, ?)", [2, "wah gwaan"]);
        console.log(res);
        // res: { affectedRows: 1, insertId: 1, warningStatus: 0 }

    } finally {
        if (conn) {
            conn.release();
            console.log("Released");
        } //release to pool
    }
}
async function writeTextDifference(pastFile, presentFile) {
    const past = fs.readFileSync(pastFile, { encoding: 'utf8' });
    const present = fs.readFileSync(presentFile, { encoding: 'utf8' });
    const difference = (diffMe, diffBy) => diffMe.split(diffBy).join("");

    const result = difference(present, past);
    fs.writeFile("./differences/diff.txt", result, (err) => { if (err) throw err; });
    console.log("that's what I'm saying...\ndunkin' spiked");
    console.log(result);
}
async function writeHTMLCollection(collection) {
    var newFileName;
    try {
        for (let item of collection) {
            var text = item.textContent.replace(/\s+/g, "\n")
            await fs.appendFileSync('collection.txt', text);
        }

        try { // unhinged. also prone to create problems with same name txt files
            fs.readFileSync('collection.txt', 'utf8', (content) => {
                if(content.length !== 0) {
                    console.log('This file isn\'t empty. I\'m appending.');
                } else {
                    console.log('File is empty. Great.');
                }
            });
            const data = fs.readFileSync('collection.txt', 'utf8');
            const words = data.trim().split(/\s+/);
            newFileName = words[3];
        } catch (err) {
            console.error("Error reading file:", err);
        }

        if(fs.existsSync(newFileName+'.txt')) {
            console.log(newFileName + ".txt already exists, dude. I'm not responsible for your problems.");
        }
        fs.renameSync('collection.txt', newFileName+'.txt');
        console.log("The file "+newFileName+".txt is ready, I guess.");
    } catch (err) {
        console.error('Error writing files: ', err);
    }
    console.log();
}
async function getPage(url) {
    // const url = "https://www.boards.ie/discussion/2058303621/broadband-switch-deals";
    try {
        const response = await fetch(url);

        if (!response.ok) throw new Error(response.statusText);

        const responseHTML = await response.text();
        let dom = new jsdom.JSDOM(responseHTML);

        let mainWindow = dom.window.document;

        let domTag = 'postbit-wrapper';
        let domContent = mainWindow.getElementsByClassName(domTag);
        await writeHTMLCollection(domContent); // manually selecting DOM

    } catch (error) { console.log(error); }
}

function getSanitizedContent(filePath) {
    return fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)           // Split by any newline type
        .map(line => line.trim())  // Remove invisible leading/trailing whitespace
        .filter(line => line.length > 0) // Remove empty lines
        .join('\n');
}

function compareFiles(path1, path2) {
    // We normalize both files here to ensure they are identical
    // in structure before the diffing starts.
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
}

async function lineByLineDifference(oldFile, newFile) {
    fs.readFile(oldFile, { encoding: 'utf8' }, (err, oldData) => {
        if (err) throw err;
        fs.readFile(newFile, { encoding: 'utf8' }, (err, newData) => {
            if (err) throw err;

            if(newData===oldData) {
                console.log('\nCommand, Viper. NO CHANGES. Proceed.')
                console.log('VIPER: Wilco, all systems normal.\n')
            } else {
                console.log(`DIFF ${oldFile} ${newFile}: There ${oldData===newData? 'have not' : 'have'} been updates.`);
                var difference = diff.diffLines(oldData, newFile,
                    {
                        ignoreWhitespace: true,
                        newlineIsToken: true
                    });

                var diffFileName = `diff-${oldFile.split('.')[0]}-${newFile.split('.')[0]}.txt`;
                console.log(difference[1]);
                //fs.writeFileSync(diffFileName, difference[0]);

                difference.forEach((part) => {
                    // 'added' is true if the line is in the new file but not the old one
                    if (part.added) {
                        process.stdout.write(`[ADDED]   | ${part.value}`);
                    }
                    // 'removed' is true if the line was in the old file but not the new one
                    else if (part.removed) {
                        process.stdout.write(`[REMOVED] | ${part.value}`);
                    }
                    // We ignore the 'unchanged' parts (where part.added/removed are undefined)
                });

                //console.log(`\n==== DIFFERENCE SAVED TO: ${diffFileName}.txt`);
            }
        })
    })
}

//getPage('https://www.boards.ie/discussion/2058303621/broadband-switch-deals/p5');
//getPage('https://www.boards.ie/discussion/2058303621/broadband-switch-deals/p6');

compareFiles('feargantae.txt', 'Glencarraig.txt');
// writeTextDifference('./collection.txt', './collection.txt');