import {getPage} from './back-end/getPage.js'; // Added .js






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

        const htmlContext = await res.text();

        console.log("HTML is ready!")

        fs.writeFileSync('htmlhuh.html', htmlContext);
    } catch (err) {
        console.log(err);
    }
}

// getWebsiteHTML("https://twitchtracker.com/clips");

getPage('https://www.boards.ie/discussion/2058303621/broadband-switch-deals/p6', 'postbit-wrapper');
// getPage('https://www.boards.ie/discussion/2058303621/broadband-switch-deals/p7', 'postbit-wrapper');

//compareFiles('undefined-p6.txt', 'undefined-p6i.txt');