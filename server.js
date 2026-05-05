
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { URL, fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import cors from 'cors';
import dns from 'dns';
import { promisify } from 'util';
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.use('/assets', express.static('public'));

const lookupAsync = promisify(dns.lookup);

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

async function initDB() {
    try {
        const connection = await pool.getConnection();
        await connection.query('SELECT 1');
        connection.release();
        console.log('DB Connected!');
    } catch (err) {
        console.error('DB connection failed:', err);
        process.exit(1);
    }
}

function isPrivateIP(ip) {
    const privateIPRegex = /^(127\.)|(10\.)|(172\.1[6-9]\.)|(172\.2[0-9]\.)|(172\.3[0-1]\.)|(192\.168\.)|(::1)|(fe80:)/;
    return privateIPRegex.test(ip);
}

async function ssrfProtect(req, res, next) {
    let targetUrl = req.query.url || req.body.url;
    if (!targetUrl) return next();

    try {
        if(!targetUrl.startsWith('http')) {
            targetUrl = "https://" + targetUrl;
        }

        const parsedUrl = new URL(targetUrl);

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            return res.status(403).json({ error: 'Only HTTP and HTTPS protocols are allowed.' });
        }

        const { address } = await lookupAsync(parsedUrl.hostname);

        if (isPrivateIP(address)) {
            console.warn(`Blocked SSRF attempt to internal IP: ${address} (${parsedUrl.hostname})`);
            return res.status(403).json({ error: 'SSRF Blocked: Access to internal networks is forbidden.' });
        }

        next();
    } catch (err) {
        return res.status(400).json({ error: 'Invalid URL or unresolvable hostname.' });
    }
}

app.get('/api/sites', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sites ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error("GET /api/sites Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sites', ssrfProtect, async (req, res) => {
    let { name, url, css_selector } = req.body;

    if (!url.includes('http')) {
        url = "https://" + url;
        console.log(`Corrected url to ${url}`);
    }

    const [result] = await pool.query(
        'INSERT INTO sites (name, url, css_selector) VALUES (?, ?, ?)',
        [name, url, css_selector]
    );
    res.json({ id: result.insertId });
});

app.delete('/api/sites/:id', async (req, res) => {
    await pool.query('DELETE FROM sites WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

app.get('/api/alerts', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT alerts.*, sites.name FROM alerts JOIN sites ON alerts.site_id = sites.id ORDER BY alerts.created_at DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error("GET /api/alerts Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/alerts/:id/read', async (req, res) => {
    await pool.query('UPDATE alerts SET is_read = TRUE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

app.delete('/api/alerts', async (req, res) => {
    await pool.query('TRUNCATE TABLE alerts');
    res.json({ success: true });
});

app.get('/api/proxy', ssrfProtect, async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing URL");

    if (!targetUrl.includes('http')) {
        targetUrl = "https://" + targetUrl;
        console.log(`Corrected url to ${targetUrl}`);
    }

    try {
        const response = await axios.get(targetUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });


        // Don't use /assets on purpose - <base> can interfere and mess things up.
        const inspectorCSS = await fs.readFile(path.join(__dirname, 'public/inspector.css'), 'utf-8');
        const inspectorJS = await fs.readFile(path.join(__dirname, 'public/inspector.js'), 'utf-8');

        const $ = cheerio.load(response.data);

        $('head').prepend(`<base href="${targetUrl}">`);
        // Force absolute paths so they ignore the <base> tag
        $('head').append(`<style id="piq-inspector-styles">${inspectorCSS}</style>`);

        const inspectorUI = `
            <div id="inspector-overlay"><div id="inspector-label"></div></div>
            <script id="piq-inspector-script">${inspectorJS}</script>
        `;
        $('body').prepend(inspectorUI);

        res.send($.html());
    } catch (err) {
        res.status(500).send("Proxy error: " + err.message);
    }
});

app.patch('/api/sites/:id/freeze', async (req, res) => {
    try {
        const { is_frozen } = req.body;
        await pool.query('UPDATE sites SET is_frozen = ? WHERE id = ?', [is_frozen, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error("PATCH /api/sites/freeze Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

async function runWorker() {
    console.log("Checking active nodes...");
    try {
        const [sites] = await pool.query('SELECT * FROM sites');
        for (let site of sites) {
            try {
                const { data } = await axios.get(site.url, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5'
                    }
                });
                const $ = cheerio.load(data);
                const target = $(site.css_selector);

                if (!target.length) continue;
                if (site.is_frozen) continue;

                target.find('script, style, noscript, iframe, time, [type="hidden"], .ad-container').remove();

                // the following part is because of sites like google.com/finance
                const allowedAttributes  = ['src', 'href', 'alt', 'poster'];

                target.find('*').addBack().each((i, el) => {
                   if (el.attribs) {
                       Object.keys(el.attribs).forEach(key => {
                           if (!allowedAttributes.includes(key)) {
                               $(el).removeAttr(key);
                           }
                       });
                   }
                });

                const htmlContent = $.html(target).trim().replace(/\s+/g, ' ');
                const newHash = crypto.createHash('sha256').update(htmlContent).digest('hex');

                if (site.last_hash && newHash !== site.last_hash) {
                    console.log(`Issue on ${site.name}`);
                    await pool.query(
                        'INSERT INTO alerts (site_id, captured_html) VALUES (?, ?)',
                        [site.id, target.html()]
                    );
                }

                await pool.query(
                    'UPDATE sites SET last_hash = ? WHERE id = ?',
                    [newHash, site.id]
                );
            } catch (err) {
                console.error(`Skipping ${site.name}: ${err.message}`);
            }
        }
    } catch (err) {
        console.error("Worker error", err.message);
    }
}

app.use(express.static(path.join(__dirname, 'frontend/dist')));

app.use((req, res) => {
    if (req.method === 'GET') {
        res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
    } else {
        res.status(404).json({ error: "Not found" });
    }
}); // Express 5 just has issues with the '*' route.

await initDB();
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});

runWorker();
setInterval(runWorker, 10000);