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
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.use('/assets', express.static('public'));

const lookupAsync = promisify(dns.lookup);
const JWT_SECRET = process.env.JWT_SECRET;

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
        if(!targetUrl.startsWith('http')) targetUrl = "https://" + targetUrl;
        const parsedUrl = new URL(targetUrl);

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            return res.status(403).json({ error: 'Only HTTP and HTTPS protocols are allowed.' });
        }

        const { address } = await lookupAsync(parsedUrl.hostname);

        if (isPrivateIP(address)) {
            console.warn(`Blocked SSRF attempt to internal IP: ${address}`);
            return res.status(403).json({ error: 'SSRF Blocked: Internal networks forbidden.' });
        }
        next();
    } catch (err) {
        return res.status(400).json({ error: 'Invalid URL or unresolvable hostname.' });
    }
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    // Look for the token in the header FIRST, but fall back to the query string for iframes
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) return res.status(401).json({ error: "Access denied" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.user = user;
        next();
    });
}

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);
        res.json({ success: true, userId: result.insertId });
    } catch (err) {
        res.status(400).json({ error: 'Username may already exist.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (user && await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, username: user.username });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sites', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sites', authenticateToken, ssrfProtect, async (req, res) => {
    let { name, url, css_selector } = req.body;
    if (!url.includes('http')) url = "https://" + url;

    const [result] = await pool.query(
        'INSERT INTO sites (user_id, name, url, css_selector) VALUES (?, ?, ?, ?)',
        [req.user.id, name, url, css_selector]
    );
    res.json({ id: result.insertId });
});

app.delete('/api/sites/:id', authenticateToken, async (req, res) => {
    await pool.query('DELETE FROM sites WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
});

app.patch('/api/sites/:id/freeze', authenticateToken, async (req, res) => {
    try {
        const { is_frozen } = req.body;
        await pool.query('UPDATE sites SET is_frozen = ? WHERE id = ? AND user_id = ?', [is_frozen, req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/alerts', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT alerts.*, sites.name, sites.url FROM alerts JOIN sites ON alerts.site_id = sites.id WHERE sites.user_id = ? ORDER BY alerts.created_at DESC',
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/alerts/:id/read', authenticateToken, async (req, res) => {
    await pool.query(
        'UPDATE alerts JOIN sites ON alerts.site_id = sites.id SET alerts.is_read = TRUE WHERE alerts.id = ? AND sites.user_id = ?',
        [req.params.id, req.user.id]
    );
    res.json({ success: true });
});

app.delete('/api/alerts', authenticateToken, async (req, res) => {
    await pool.query('DELETE alerts FROM alerts JOIN sites ON alerts.site_id = sites.id WHERE sites.user_id = ?', [req.user.id]);
    res.json({ success: true });
});

app.delete('/api/alerts/:id', authenticateToken, async (req, res) => {
    await pool.query('DELETE alerts FROM alerts JOIN sites ON alerts.site_id = sites.id WHERE alerts.id = ? AND sites.user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
});

app.get('/api/proxy', authenticateToken, ssrfProtect, async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing URL");
    if (!targetUrl.includes('http')) targetUrl = "https://" + targetUrl;

    try {
        const response = await axios.get(targetUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        const inspectorCSS = await fs.readFile(path.join(__dirname, 'public/inspector.css'), 'utf-8');
        const inspectorJS = await fs.readFile(path.join(__dirname, 'public/inspector.js'), 'utf-8');

        const $ = cheerio.load(response.data);
        $('head').prepend(`<base href="${targetUrl}">`);
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

async function runWorker() {
    process.stdout.write(". ");
    try {
        const [sites] = await pool.query('SELECT * FROM sites');
        for (let site of sites) {
            try {
                const { data } = await axios.get(site.url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                const $ = cheerio.load(data);
                const target = $(site.css_selector);

                if (!target.length) continue;
                if (site.is_frozen) continue;

                const $cleaner = cheerio.load(target.html());
                $cleaner('script, style, noscript, svg, path, meta, link, [style*="display: none"], [style*="display:none"], [aria-hidden="true"]').remove();
                let textValue = $cleaner.root().text().replace(/\s+/g, ' ').trim();

                const mediaElements = target.find('img, video source, audio source, picture source').addBack('img, video source, audio source, picture source').toArray();

                // Download all media on the target node simultaneously
                const mediaPromises = mediaElements.map(async (el) => {
                    let rawSrc = el.attribs.src || el.attribs['data-src'] || el.attribs.srcset;
                    if (!rawSrc) return "";

                    if (rawSrc.includes(',')) rawSrc = rawSrc.split(',')[0].trim().split(' ')[0];

                    if (rawSrc.startsWith('data:')) {
                        const fileHash = crypto.createHash('md5').update(rawSrc).digest('hex');
                        return `|B64:${fileHash}`;
                    }

                    try {
                        const absoluteMediaUrl = new URL(rawSrc, site.url).href;
                        // Increased timeout to 15s for massive NASA images
                        const mediaRes = await axios.get(absoluteMediaUrl, {
                            responseType: 'arraybuffer',
                            timeout: 15000,
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                        });
                        const fileHash = crypto.createHash('md5').update(mediaRes.data).digest('hex');
                        return `|BIN:${fileHash}`;
                    } catch (e) {
                        // If it completely fails:
                        return `|URL:${rawSrc}`;
                    }
                });

                // Wait for all simultaneous downloads to finish
                const resolvedMedia = await Promise.all(mediaPromises);
                const mediaHashString = resolvedMedia.join('');

                const contentToHash = textValue + mediaHashString;
                const newHash = crypto.createHash('sha256').update(contentToHash).digest('hex');

                if (site.last_hash && newHash !== site.last_hash) {
                    target.find('[src]').addBack('[src]').each((i, el) => { if (el.attribs.src) el.attribs.src = new URL(el.attribs.src, site.url).href; });
                    target.find('[href]').addBack('[href]').each((i, el) => { if (el.attribs.href) el.attribs.href = new URL(el.attribs.href, site.url).href; });

                    const feedHtml = $.html(target);
                    await pool.query('INSERT INTO alerts (site_id, captured_html) VALUES (?, ?)', [site.id, feedHtml]);
                }

                await pool.query('UPDATE sites SET last_hash = ? WHERE id = ?', [newHash, site.id]);
            } catch (err) {
                console.error(`Skipping ${site.name}: ${err.message}`);
            }
        }
    } catch (err) {
        console.error("Worker error", err.message);
    }
}

async function startEngine() {
    await runWorker();
    setTimeout(startEngine, 10000);
}

app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.use((req, res) => {
    if (req.method === 'GET') { res.sendFile(path.join(__dirname, 'frontend/dist/index.html')); }
    else { res.status(404).json({ error: "Not found" }); }
});

await initDB();
app.listen(3000, () => { console.log("Server running at http://localhost:3000"); });

startEngine();