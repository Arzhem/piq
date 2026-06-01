import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

let globalBrowser;

export async function initBrowser() {
  globalBrowser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  console.log("Playwright Engine online. Awaiting instructions.");
}

export function getBrowser() {
  return globalBrowser;
}

export async function closeBrowser() {
  if (globalBrowser) {
    await globalBrowser.close();
  }
}
