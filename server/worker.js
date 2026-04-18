const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

async function checkSite(url, selector, oldHash) {
	try {
		const {data:html} = await axios.get(url);
		const $ = cheerio.load(html);

		const target = $(selector);

		if(!target.length) {
			return {
				status: 'error',
				message: 'Selector not found'
			};
		}

		// get clean text for hashing
		const textContent = target.text().trim().replace(/\s+/g, ' ');
		const newHash = crypto.createHash('sha256').update(textContent).digest('hex');

		if (newHash !== oldHash) {
			// capture
			const snippet = target.html();
			return {
				status: 'changed',
				newHash: newHash,
				content: snippet
			};
		}

		return { status: 'no_change' };

	} catch (error) {
		return {
			status: 'error',
			message: error.message
		};
	}
}
