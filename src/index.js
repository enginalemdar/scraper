import puppeteer from "@cloudflare/puppeteer";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/123.0.0.0 Safari/537.36";

const RELEVANT_KEYWORDS = [
  "about",
  "team",
  "pricing",
  "product",
  "solution",
  "hakkimizda",
  "ekip",
  "fiyat",
  "urun",
  "cozum",
  "platform",
  "contact",
  "iletisim",
  "biz-kimiz",
  "servis",
  "kurucu",
  "founder",
  "yonetim",
  "story",
  "value",
  "careers",
  "kariyer",
  "price",
  "demo",
  "register",
  "login",
  "giris",
  "kaydol",
];
const SCRAPE_TIMEOUT_MS = 40000;
const FALLBACK_FETCH_TIMEOUT_MS = 15000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normalizeTargetUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupeRelevantLinks(links) {
  const filtered = links.filter((link) =>
    RELEVANT_KEYWORDS.some(
      (kw) =>
        link.url.toLowerCase().includes(kw) || link.text.toLowerCase().includes(kw),
    ),
  );

  return Array.from(new Map(filtered.map((item) => [item.url, item])).values());
}

async function resolveRedirects(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "user-agent": USER_AGENT,
      },
    });

    return response.url || url;
  } catch {
    return url;
  }
}

async function scrapePage(env, url, selector) {
  const browser = await puppeteer.launch(env.MYBROWSER);

  try {
    const page = await browser.newPage();

    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({
      "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      "upgrade-insecure-requests": "1",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
    });

    const finalUrl = await resolveRedirects(url);
    await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    try {
      await page.waitForSelector("body", { timeout: 5000 });
    } catch {
      // Body secilmeden de devam edilebilir.
    }

    let content;
    if (selector) {
      content = await page.$eval(selector, (el) => el.innerText);
    } else {
      content = await page.evaluate(() => document.body?.innerText || "");
    }

    const links = await page.$$eval("a[href]", (elements) =>
      elements.map((el) => ({
        url: el.href,
        text: (el.innerText || "").trim(),
      })),
    );

    return {
      url: finalUrl,
      content: content.slice(0, 50000),
      relevantLinks: dedupeRelevantLinks(links),
    };
  } finally {
    await browser.close();
  }
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtmlToText(html) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const noTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(
    noTags
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

function extractLinksFromHtml(html, baseUrl) {
  const links = [];
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1];
    const rawText = match[2] || "";
    const text = normalizeWhitespace(rawText.replace(/<[^>]+>/g, " "));
    try {
      const url = new URL(rawHref, baseUrl).toString();
      links.push({ url, text });
    } catch {
      // Gecersiz URL ise atla.
    }
  }
  return links;
}

async function scrapeWithFetch(url) {
  const finalUrl = await resolveRedirects(url);
  const response = await fetch(finalUrl, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(FALLBACK_FETCH_TIMEOUT_MS),
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  if (!response.ok) {
    throw new Error(`Fallback fetch failed with status ${response.status}`);
  }

  const html = await response.text();
  const content = stripHtmlToText(html).slice(0, 50000);
  const links = extractLinksFromHtml(html, finalUrl);

  return {
    url: response.url || finalUrl,
    content,
    relevantLinks: dedupeRelevantLinks(links),
    mode: "fallback_fetch",
  };
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function withTimeout(promise, ms) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Scrape timeout (${ms}ms)`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        "Scraper API calisiyor. POST /scrape { url, selector? } gonderin.",
        { status: 200 },
      );
    }

    if (request.method === "POST" && url.pathname === "/scrape") {
      const body = await readJsonBody(request);
      const targetUrl = normalizeTargetUrl(body?.url);
      const selector = body?.selector;

      if (!targetUrl) {
        return json({ error: true, message: "url gerekli" }, 400);
      }
      if (selector !== undefined && typeof selector !== "string") {
        return json({ error: true, message: "selector string olmali" }, 400);
      }

      try {
        const result = await withTimeout(
          scrapePage(env, targetUrl, selector),
          SCRAPE_TIMEOUT_MS,
        );
        return json({ success: true, mode: "browser_rendering", ...result });
      } catch (error) {
        if (typeof selector === "string" && selector.trim()) {
          const message =
            error instanceof Error ? error.message : "Scrape hatasi";
          const status = message.includes("Scrape timeout") ? 504 : 500;
          return json(
            {
              error: true,
              message,
              hint: "Selector kullanimi icin browser mode gereklidir.",
            },
            status,
          );
        }

        try {
          const fallbackResult = await scrapeWithFetch(targetUrl);
          return json({
            success: true,
            warning:
              "Browser Rendering basarisiz oldugu icin fallback fetch kullanildi.",
            ...fallbackResult,
          });
        } catch (fallbackError) {
          const primaryMessage =
            error instanceof Error ? error.message : "Scrape hatasi";
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : "Fallback scrape hatasi";

          return json(
            {
              error: true,
              message: primaryMessage,
              fallbackMessage,
            },
            500,
          );
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
