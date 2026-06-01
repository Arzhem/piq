import express from "express";
import dns from "dns";
import { promisify } from "util";
import { URL } from "url";
import axios from "axios";
import * as cheerio from "cheerio";

import { authenticateToken } from "./auth.js";
import { getBrowser } from "./browser.js";

const router = express.Router();

const lookupAsync = promisify(dns.lookup);

function isPrivateIP(ip) {
  const privateIPRegex =
    /^(127\.)|(10\.)|(172\.1[6-9]\.)|(172\.2[0-9]\.)|(172\.3[0-1]\.)|(192\.168\.)|(::1)|(fe80:)/;
  return privateIPRegex.test(ip);
}

async function ssrfProtect(req, res, next) {
  let targetUrl = req.query.url || req.body.url;
  if (!targetUrl) return next();

  try {
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

    const parsedUrl = new URL(targetUrl);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return res.status(403).json({
        error: "Only HTTP and HTTPS protocols are allowed.",
      });
    }

    const { address } = await lookupAsync(parsedUrl.hostname);

    if (isPrivateIP(address)) {
      return res.status(403).json({
        error: "Internal networks are restricted.",
      });
    }

    next();
  } catch (err) {
    return res.status(400).json({
      error: "Invalid URL or unresolvable hostname.",
    });
  }
}

router.get("/proxy", authenticateToken, ssrfProtect, async (req, res) => {
  let targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing URL parameter.");
  }

  if (!targetUrl.includes("http")) {
    targetUrl = "https://" + targetUrl;
  }

  let context;

  try {
    const browser = getBrowser();

    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await page.waitForTimeout(1000);

    const renderedHtml = await page.content();
    await context.close();

    const inspectorCSS = `
            #inspector-overlay { background: rgba(0, 153, 255, 0.3); border: 2px solid #0099ff; position: absolute; z-index: 999999; pointer-events: none; transition: all 0.1s; }
            #inspector-label { background: #0099ff; color: white; padding: 2px 6px; font-family: monospace; font-size: 11px; position: absolute; top: -20px; left: -2px; pointer-events: none; white-space: nowrap; }
            video, iframe, embed, object { pointer-events: none !important; }
        `;

    const inspectorJS = `
            let inspectorActive = true;
            const overlay = document.getElementById('inspector-overlay');
            const label = document.getElementById('inspector-label');

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

                const rect = e.target.getBoundingClientRect();
                overlay.style.display = 'block';
                overlay.style.top = (rect.top + window.scrollY) + 'px';
                overlay.style.left = (rect.left + window.scrollX) + 'px';
                overlay.style.width = rect.width + 'px';
                overlay.style.height = rect.height + 'px';
                label.innerText = getCssSelector(e.target);
            }, true);

            document.addEventListener('click', function(e) {
                if (!inspectorActive) return;

                e.preventDefault();
                e.stopPropagation();

                window.parent.postMessage(
                  { type: 'SELECTOR_PICKED', selector: getCssSelector(e.target) },
                  '*'
                );
            }, true);
        `;

    const $ = cheerio.load(renderedHtml);

    $("head").prepend(`<base href="${targetUrl}">`);
    $("head").append(
      `<style id="piq-inspector-styles">${inspectorCSS}</style>`,
    );

    $("body").prepend(
      `<div id="inspector-overlay"><div id="inspector-label"></div></div>
       <script id="piq-inspector-script">${inspectorJS}</script>`,
    );

    res.send($.html());
  } catch (err) {
    if (context) await context.close();
    res.status(500).send("Proxy error: " + err.message);
  }
});

export default router;
