const fs = require('fs');
const path = require('path');

/**
 * Cleanup Utility: Deletes empty or whitespace-only .md and .txt files in the current folder.
 * It checks for both physical file size (0 bytes) and content validity (non-whitespace).
 */
function cleanupEmptyFiles() {
    const directory = './'; // Path to the folder you want to clean

    try {
        const files = fs.readdirSync(directory);
        let deleteCount = 0;

        files.forEach(file => {
            const ext = path.extname(file).toLowerCase();

            // Only target .txt and .md files
            if (ext === '.txt' || ext === '.md') {
                const filePath = path.join(directory, file);

                try {
                    const stats = fs.statSync(filePath);

                    // 1. Check if the file is physically 0 bytes
                    if (stats.size === 0) {
                        fs.unlinkSync(filePath);
                        console.log(`[DELETED] (0 bytes): ${file}`);
                        deleteCount++;
                        return;
                    }

                    // 2. Check if the file contains only whitespaces/newlines
                    const content = fs.readFileSync(filePath, 'utf8');
                    if (!content.trim()) {
                        fs.unlinkSync(filePath);
                        console.log(`[DELETED] (Whitespace only): ${file}`);
                        deleteCount++;
                    }
                } catch (err) {
                    console.error(`Error processing individual file ${file}:`, err.message);
                }
            }
        });

        console.log(`\nCleanup complete. Total files removed: ${deleteCount}`);
    } catch (err) {
        console.error("Could not read directory:", err.message);
    }
}

// Execute the cleanup
cleanupEmptyFiles();

// I didn't want to bother with this. Gemini generated.