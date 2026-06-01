import crypto from "crypto";
import axios from "axios";
import * as cheerio from "cheerio";
import { URL } from "url";

import { pool } from "./db.js";
import { getBrowser } from "./browser.js";

export async function runWorker() {
  process.stdout.write(".");

  try {
    const [sites] = await pool.query(
      "SELECT * FROM sites WHERE is_frozen = 0",
    );

    for (let site of sites) {
      let context;

      try {
        const lastChecked = site.last_checked
          ? new Date(site.last_checked)
          : new Date(0);

        const intervalMs =
          (site.check_interval_seconds || 600) * 1000;

        if (new Date() < new Date(lastChecked.getTime() + intervalMs)) {
          continue;
        }

        const browser = getBrowser();

        context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        });

        const page = await context.newPage();

        await context.route(
          "**/*.{mp4,webm,ogg,mp3,wav}",
          (route) => route.abort(),
        );

        await page.goto(site.url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });

        try {
          await page.waitForSelector(site.css_selector, {
            timeout: 8000,
          });
        } catch {
          await context.close();
          continue;
        }

        const renderedHtml = await page.content();
        await context.close();

        const $ = cheerio.load(renderedHtml);
        const target = $(site.css_selector);

        if (!target.length) continue;

        const $cleaner = cheerio.load(target.html());

        $cleaner(
          'script, style, noscript, svg, path, meta, link, [style*="display: none"], [style*="display:none"], [aria-hidden="true"]',
        ).remove();

        let textValue = $cleaner.root().text().replace(/\s+/g, " ").trim();

        const mediaElements = target
          .find("img, video source, audio source, picture source")
          .addBack("img, video source, audio source, picture source")
          .toArray();

        const mediaPromises = mediaElements.map(async (el) => {
          let rawSrc =
            el.attribs.src ||
            el.attribs["data-src"] ||
            el.attribs.srcset ||
            el.attribs.poster;

          if (!rawSrc) return "";

          if (rawSrc.includes(",")) {
            rawSrc = rawSrc.split(",")[0].trim().split(" ")[0];
          }

          if (rawSrc.startsWith("data:")) {
            return `|B64:${crypto
              .createHash("md5")
              .update(rawSrc)
              .digest("hex")}`;
          }

          try {
            const absoluteMediaUrl = new URL(rawSrc, site.url).href;

            const tagName = el.tagName.toLowerCase();

            if (
              tagName === "video" ||
              tagName === "audio" ||
              tagName === "source"
            ) {
              return `|HEAVY_MEDIA:${absoluteMediaUrl}`;
            }

            const mediaRes = await axios.get(absoluteMediaUrl, {
              responseType: "arraybuffer",
              timeout: 10000,
              headers: { "User-Agent": "Mozilla/5.0" },
            });

            const fileHash = crypto
              .createHash("md5")
              .update(mediaRes.data)
              .digest("hex");

            const mimeType =
              mediaRes.headers["content-type"] || "image/jpeg";

            el.piqBase64Override =
              `data:${mimeType};base64,${Buffer.from(
                mediaRes.data,
                "binary",
              ).toString("base64")}`;

            return `|BIN:${fileHash}`;
          } catch {
            return `|URL:${rawSrc}`;
          }
        });

        const resolvedMedia = await Promise.all(mediaPromises);

        const newHash = crypto
          .createHash("sha256")
          .update(textValue + resolvedMedia.join(""))
          .digest("hex");

        if (site.last_hash && newHash !== site.last_hash) {
          target
            .find("img, source")
            .addBack("img, source")
            .each((i, el) => {
              const parsedEl = mediaElements.find((m) => m === el);

              if (parsedEl && parsedEl.piqBase64Override) {
                el.attribs.src = parsedEl.piqBase64Override;

                if (el.attribs.srcset) delete el.attribs.srcset;
              } else if (el.attribs.src) {
                el.attribs.src = new URL(
                  el.attribs.src,
                  site.url,
                ).href;
              }
            });

          target.find("[href]").addBack("[href]").each((i, el) => {
            if (el.attribs.href) {
              el.attribs.href = new URL(
                el.attribs.href,
                site.url,
              ).href;
            }
          });

          const feedHtml = $.html(target);

          try {
            await pool.query(
              "INSERT INTO alerts (site_id, captured_html) VALUES (?, ?)",
              [site.id, feedHtml],
            );
          } catch (dbErr) {
            await pool.query(
              'UPDATE sites SET last_error = "Database constraint failure. Payload too large." WHERE id = ?',
              [site.id],
            );
            continue;
          }
        }

        await pool.query(
          "UPDATE sites SET last_hash = ?, last_checked = NOW(), consecutive_errors = 0, last_error = NULL WHERE id = ?",
          [newHash, site.id],
        );
      } catch (err) {
        if (context) await context.close();

        const errCount = site.consecutive_errors + 1;

        await pool.query(
          "UPDATE sites SET consecutive_errors = ?, last_error = ?, last_checked = NOW() WHERE id = ?",
          [
            errCount,
            err.message.substring(0, 250),
            site.id,
          ],
        );
      }
    }
  } catch (err) {
    console.error("[CRITICAL] Worker Engine Error:", err.message);
  }
}

export function startMonitor() {
  async function loop() {
    await runWorker();
    setTimeout(loop, 5000);
  }

  loop();
}
