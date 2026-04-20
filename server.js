import 'dotenv/config';
import mysql from 'mysql2/promise';
import { URL } from 'url';
import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import fs from 'fs/promises';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

let trackedTarget = null;

app.use('/assets', express.static('public'));

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

// just for testing: ensuring the connection works
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

// TODO: SSRF middleware

// crud routes
app.get('/api/sites', async (req, res) => {
   const [rows] = await pool.query(
       'SELECT * FROM sites ORDER BY created_at DESC'
   );
   res.json(rows);
});

app.post('/api/sites', async (req, res) => {
   const { name, url, css_selector } = req.body;
   const [result] = await poo.query(
       'INSERT INTO sites (name, url, css_selector) VALUES (?, ?, ?)',
       [name, url, css_selector]
   );
   res.json({
       id: result.insertId
   });
});

app.delete('/api/sites/:id', async (req, res) => {
   await pool.query(
       'DELETE FROM sites WHERE id = ?',
       [req.params.id]
   );
   res.json({
       success: true
   });
});

app.get('/api/alerts', async (req, res) => {
   const [rows] = await pool.query(
       'SELECT alerts.*, sites.name FROM alerts JOIN sites ON alerts.site_id = sites.id ORDER BY alerts.created_at DESC'
   );
   res.json(rows);
});

app.delete('/api/alerts', async (req, res) => {
   await pool.query(
       'TRUNCATE TABLE alerts'
   );
   res.json({ success: true });
});

app.get('/api/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing URL");

    try {
        if(!targetUrl.includes('http')) {
            targetUrl = "https://" + targetUrl; // what if its http? and targetUrl not being const?
            console.log(`Corrected url to ${targetUrl}`);
        }

        const response = await axios.get(targetUrl, {
            timeout: 10000,
            headers: {'User-Agent': 'piq/0.1'}
        });

        const $ = cheerio.load(response.data);

        $('head').prepend(`<base href="${targetUrl}">`);
        $('head').append(`<link rel="stylesheet" href="http://localhost:3000/assets/inspector.css">`)

        const inspectorUI = `
            <div id="inspector-overlay"><div id="inspector-label"></div></div>
            <script src="http://localhost:3000/assets/inspector.js"></script>
        `;
        $('body').prepend(inspectorUI);

        res.send($.html());
    } catch (err) {
        res.status(500).send("Proxy error: " + err.message);
    }
});

/*
app.post('/track', async (req, res) => {
    const { url, selector } = req.body;

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const textContent = $(selector).text().trim().replace(/\\s+/g, ' ');

        const hash = crypto.createHash('sha256').update(textContent).digest('hex');

        trackedTarget = { url, selector, lastHash: hash, content: textContent };

        console.log(`[SYSTEM] Now tracking: ${selector} on ${url}`);
        res.json({ success: true, hash });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
*/

setInterval(async () => {
    if (!trackedTarget) return;

    console.log(`Checking ${trackedTarget.url}...`);
    try {
        const [sites] = await pool.query('SELECT * FROM sites');
        for (let site of sites) {
            try {
                const { data } = await axios.get(site.url, { timeout: 10000 });
                const $ = cheerio.load(data);
                const target = $(site.css_selector);

                if (!target.length) continue;

                const textContent = target.text().trim().replace(/\s+/g, ' ');
                const newHash = crypto.createHash('sha256').update(textContent).digest('hex');

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
}, 10000);

await initDB();
app.listen(3000, () => {
    console.log("PoC Server running at http://localhost:3000");
});