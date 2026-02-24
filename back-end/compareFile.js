import {getSanitizedContent} from "./getPage";

const diff = require("diff");

export function compareFiles(path1, path2) {
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