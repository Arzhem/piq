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
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

chromium.use(stealth());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 11 standard security headers to block XSS and clickjacking
app.use(helmet({ contentSecurityPolicy: false })); // allows the proxy iframe to work

// Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: "Too many requests from this IP. Please try again later." }
});

app.use(cors());
app.use(express.json());
app.use('/api/', apiLimiter);
app.use('/assets', express.static('public'));

const lookupAsync = promisify(dns.lookup);
const JWT_SECRET = process.env.JWT_SECRET;

let globalBrowser;

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

async function init() {
    try {
        const connection = await pool.getConnection();
        await connection.query('SELECT 1');
        connection.release();
        console.log('Database connection established.');

        globalBrowser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('Playwright Engine online. Awaiting instructions.');
    } catch (err) {
        console.error('Engine initialization failed:', err);
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    console.log("\nShutting down engine...");
    if (globalBrowser) await globalBrowser.close();
    process.exit();
});

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
            return res.status(403).json({ error: 'Internal networks are restricted.' });
        }
        next();
    } catch (err) {
        return res.status(400).json({ error: 'Invalid URL or unresolvable hostname.' });
    }
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) return res.status(401).json({ error: "Access denied." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid session token." });
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
        res.status(400).json({ error: 'Username is unavailable.' });
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
            res.status(401).json({ error: 'Invalid credentials.' });
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
    let { name, url, css_selector, interval } = req.body;
    if (!url.includes('http')) url = "https://" + url;
    const checkSeconds = interval || 600;

    const [result] = await pool.query(
        'INSERT INTO sites (user_id, name, url, css_selector, check_interval_seconds) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, name, url, css_selector, checkSeconds]
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

app.patch('/api/sites/:id', authenticateToken, async (req, res) => {
    try {
        const { name, check_interval_seconds } = req.body;
        await pool.query(
            'UPDATE sites SET name = ?, check_interval_seconds = ?, status = "active", consecutive_errors = 0, last_error = NULL WHERE id = ? AND user_id = ?',
            [name, check_interval_seconds, req.params.id, req.user.id]
        );
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

app.delete('/api/alerts/archive', authenticateToken, async (req, res) => {
    await pool.query('DELETE alerts FROM alerts JOIN sites ON alerts.site_id = sites.id WHERE sites.user_id = ? AND alerts.is_read = TRUE', [req.user.id]);
    res.json({ success: true });
});

app.delete('/api/alerts/:id', authenticateToken, async (req, res) => {
    await pool.query('DELETE alerts FROM alerts JOIN sites ON alerts.site_id = sites.id WHERE alerts.id = ? AND sites.user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
});

app.get('/api/proxy', authenticateToken, ssrfProtect, async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing URL parameter.");
    if (!targetUrl.includes('http')) targetUrl = "https://" + targetUrl;

    let context;
    try {
        context = await globalBrowser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 }
        });
        const page = await context.newPage();

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);

        const renderedHtml = await page.content();
        await context.close();

        const inspectorCSS = `
            #inspector-overlay { background: rgba(0, 153, 255, 0.3); border: 2px solid #0099ff; position: absolute; z-index: 999999; pointer-events: none; transition: all 0.1s; }
            #inspector-label { background: #0099ff; color: white; padding: 2px 6px; font-family: monospace; font-size: 11px; position: absolute; top: -20px; left: -2px; pointer-events: none; white-space: nowrap; }
            video, iframe, embed, object { pointer-events: none !important; }
        `;

        // strict selector generator
        const inspectorJS = `
            let inspectorActive = true;
            const overlay = document.getElementById('inspector-overlay');
            const label = document.getElementById('inspector-label');

            window.addEventListener('message', (event) => {
                if (event.data.type === 'TOGGLE_INSPECTOR') {
                    inspectorActive = event.data.active;
                    overlay.style.display = !inspectorActive ? 'none' : 'block';
                }
            });

            function getCssSelector(el) {
                if (el.tagName.toLowerCase() == "html") return "html";
                let path = [];
                while (el.nodeType === Node.ELEMENT_NODE) {
                    let selector = el.nodeName.toLowerCase();
                    if (el.id) { selector += '#' + el.id; path.unshift(selector); break; } 
                    else {
                        let sib = el.previousElementSibling;
                        let nth = 1;
                        while (sib) {
                            if (sib.nodeType === Node.ELEMENT_NODE) nth++;
                            sib = sib.previousElementSibling;
                        }
                        selector += ":nth-child("+nth+")";
                    }
                    path.unshift(selector);
                    el = el.parentNode;
                }
                return path.join(" > ");
            }

            document.addEventListener('mousemove', function(e) {
                if (!inspectorActive) return;
                if (e.target.tagName.toLowerCase() === 'body' || e.target.tagName.toLowerCase() === 'html') {
                    overlay.style.display = 'none'; return;
                }
                const rect = e.target.getBoundingClientRect();
                overlay.style.display = 'block';
                overlay.style.top = (rect.top + window.scrollY) + 'px';
                overlay.style.left = (rect.left + window.scrollX) + 'px';
                overlay.style.width = rect.width + 'px';
                overlay.style.height = rect.height + 'px';
                label.innerText = getCssSelector(e.target);
            }, true);

            window.addEventListener('scroll', function() { if (inspectorActive) overlay.style.display = 'none'; }, true);

            document.addEventListener('click', function(e) {
                if (!inspectorActive) return;
                e.preventDefault();
                e.stopPropagation();
                window.parent.postMessage({ type: 'SELECTOR_PICKED', selector: getCssSelector(e.target) }, '*');
            }, true);
        `;

        const $ = cheerio.load(renderedHtml);
        $('head').prepend(`<base href="${targetUrl}">`);
        $('head').append(`<style id="piq-inspector-styles">${inspectorCSS}</style>`);
        $('body').prepend(`<div id="inspector-overlay"><div id="inspector-label"></div></div><script id="piq-inspector-script">${inspectorJS}</script>`);

        res.send($.html());
    } catch (err) {
        if (context) await context.close();
        res.status(500).send("Proxy error: " + err.message);
    }
});

async function runWorker() {
    process.stdout.write(".");
    try {
        const [sites] = await pool.query('SELECT * FROM sites WHERE is_frozen = 0');

        for (let site of sites) {
            let context;
            try {
                const lastChecked = site.last_checked ? new Date(site.last_checked) : new Date(0);
                const intervalMs = (site.check_interval_seconds || 600) * 1000;
                if (new Date() < new Date(lastChecked.getTime() + intervalMs)) continue;

                context = await globalBrowser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                });
                const page = await context.newPage();

                await context.route('**/*.{mp4,webm,ogg,mp3,wav}', route => route.abort());
                await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

                try { await page.waitForSelector(site.css_selector, { timeout: 8000 }); }
                catch (e) { await context.close(); continue; }

                const renderedHtml = await page.content();
                await context.close();

                const $ = cheerio.load(renderedHtml);
                const target = $(site.css_selector);
                if (!target.length) continue;

                const $cleaner = cheerio.load(target.html());
                $cleaner('script, style, noscript, svg, path, meta, link, [style*="display: none"], [style*="display:none"], [aria-hidden="true"]').remove();
                let textValue = $cleaner.root().text().replace(/\s+/g, ' ').trim();

                const mediaElements = target.find('img, video source, audio source, picture source').addBack('img, video source, audio source, picture source').toArray();
                const mediaPromises = mediaElements.map(async (el) => {
                    let rawSrc = el.attribs.src || el.attribs['data-src'] || el.attribs.srcset || el.attribs.poster;
                    if (!rawSrc) return "";
                    if (rawSrc.includes(',')) rawSrc = rawSrc.split(',')[0].trim().split(' ')[0];
                    if (rawSrc.startsWith('data:')) return `|B64:${crypto.createHash('md5').update(rawSrc).digest('hex')}`;

                    try {
                        const absoluteMediaUrl = new URL(rawSrc, site.url).href;
                        const tagName = el.tagName.toLowerCase();
                        if (tagName === 'video' || tagName === 'audio' || tagName === 'source') return `|HEAVY_MEDIA:${absoluteMediaUrl}`;

                        const mediaRes = await axios.get(absoluteMediaUrl, { responseType: 'arraybuffer', timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                        const fileHash = crypto.createHash('md5').update(mediaRes.data).digest('hex');
                        const mimeType = mediaRes.headers['content-type'] || 'image/jpeg';
                        el.piqBase64Override = `data:${mimeType};base64,${Buffer.from(mediaRes.data, 'binary').toString('base64')}`;
                        return `|BIN:${fileHash}`;
                    } catch (e) { return `|URL:${rawSrc}`; }
                });

                const resolvedMedia = await Promise.all(mediaPromises);
                const newHash = crypto.createHash('sha256').update(textValue + resolvedMedia.join('')).digest('hex');

                if (site.last_hash && newHash !== site.last_hash) {
                    target.find('img, source').addBack('img, source').each((i, el) => {
                        const parsedEl = mediaElements.find(m => m === el);
                        if (parsedEl && parsedEl.piqBase64Override) {
                            el.attribs.src = parsedEl.piqBase64Override;
                            if (el.attribs.srcset) delete el.attribs.srcset;
                        } else if (el.attribs.src) {
                            el.attribs.src = new URL(el.attribs.src, site.url).href;
                        }
                    });

                    target.find('[href]').addBack('[href]').each((i, el) => { if (el.attribs.href) el.attribs.href = new URL(el.attribs.href, site.url).href; });
                    const feedHtml = $.html(target);

                    try { await pool.query('INSERT INTO alerts (site_id, captured_html) VALUES (?, ?)', [site.id, feedHtml]); }
                    catch (dbErr) {
                        console.error(`[!] DB SAVE ERROR on [${site.name}]: ${dbErr.message}`);
                        await pool.query('UPDATE sites SET last_error = "Database constraint failure. Payload too large." WHERE id = ?', [site.id]);
                        continue;
                    }
                }

                await pool.query('UPDATE sites SET last_hash = ?, last_checked = NOW(), consecutive_errors = 0, last_error = NULL WHERE id = ?', [newHash, site.id]);

            } catch (err) {
                if (context) await context.close();
                console.error(`\n[!] PLAYWRIGHT FETCH ERROR on [${site.name}]: ${err.message}`);
                const errCount = site.consecutive_errors + 1;
                await pool.query('UPDATE sites SET consecutive_errors = ?, last_error = ?, last_checked = NOW() WHERE id = ?', [errCount, err.message.substring(0, 250), site.id]);
            }
        }
    } catch (err) { console.error("\n[CRITICAL] Worker Engine Error:", err.message); }
}

async function start() {
    await runWorker();
    setTimeout(start, 5000);
}

app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.use((req, res) => {
    if (req.method === 'GET') { res.sendFile(path.join(__dirname, 'frontend/dist/index.html')); }
    else { res.status(404).json({ error: "Not found" }); }
});

await init();
app.listen(3000, () => { console.log("Server running on http://localhost:3000"); });
start();