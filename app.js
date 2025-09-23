// Modüller
import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
puppeteer.use(StealthPlugin());

// Express uygulaması
const app = express();
app.use(express.json());

// Puppeteer browser başlat
async function launchBrowser() {
  const args = ["--no-sandbox", "--disable-setuid-sandbox"];
  if (process.env.PROXY) {
    args.push(`--proxy-server=${process.env.PROXY}`);
  }

  return await puppeteer.launch({
    headless: true,
    args
  });
}

// Redirect zincirini çözümle
async function resolveRedirects(url) {
  try {
    const resp = await axios.get(url, {
      maxRedirects: 5,
      timeout: 10000,
      validateStatus: null
    });
    return resp.request.res.responseUrl || url;
  } catch (e) {
    console.warn("Redirect çözümleme hatası:", e.message);
    return url;
  }
}

// Sayfa kazıma
async function scrapePage(url, selector) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  // User-Agent ve header’lar
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/123.0.0.0 Safari/537.36"
  );

  await page.setExtraHTTPHeaders({
    "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1"
  });

  // Redirect çöz
  const finalUrl = await resolveRedirects(url);
  console.log("🌍 Final URL:", finalUrl);

  await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

  // fallback wait
  try {
    await page.waitForSelector("body", { timeout: 5000 });
  } catch (e) {
    console.warn("⚠️ Body selector timeout, devam ediliyor...");
  }

  let content;
  if (selector) {
    content = await page.$eval(selector, (el) => el.innerText);
  } else {
    content = await page.evaluate(() => document.body.innerText);
  }

  // Linkleri topla
  const links = await page.$$eval("a[href]", (els) =>
    els.map((el) => ({
      url: el.href,
      text: el.innerText.trim()
    }))
  );

  await browser.close();

  return {
    url: finalUrl,
    content: content.slice(0, 50000), // çok büyükse truncate
    relevantLinks: dedupeRelevantLinks(links)
  };
}

// Link filtreleme
function dedupeRelevantLinks(links) {
  const keywords = [
    "about","team","pricing","product","solution","hakkimizda",
    "ekip","fiyat","urun","cozum","platform","contact","iletisim",
    "biz-kimiz","servis","kurucu","founder","yonetim","story",
    "value","careers","kariyer","price","demo","register",
    "login","giris","kaydol"
  ];

  const filtered = links.filter((l) =>
    keywords.some(
      (kw) =>
        l.url.toLowerCase().includes(kw) ||
        l.text.toLowerCase().includes(kw)
    )
  );

  return Array.from(new Map(filtered.map((i) => [i.url, i])).values());
}

// Endpointler
app.get("/", (req, res) => {
  res.send("✅ Scraper API çalışıyor. POST /scrape { url, selector? } kullan.");
});

app.post("/scrape", async (req, res) => {
  const { url, selector } = req.body;
  if (!url) return res.status(400).json({ error: true, message: "url gerekli" });

  try {
    const result = await scrapePage(url, selector);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("Scrape hatası:", e);
    res.status(500).json({ error: true, message: e.message });
  }
});

// Port
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`🚀 Scraper API ${port} portunda yayında`)
);
