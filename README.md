# scraper-worker

Cloudflare Worker uzerinde calisan bir scraping API'si.
`POST /scrape` ile verilen URL'i Cloudflare Browser Rendering (headless Chromium) uzerinden acip metin ve ilgili linkleri dondurur.
Browser Rendering anlik olarak kullanilamazsa otomatik olarak `fetch` tabanli fallback ile devam eder.

## Mimari

- Runtime: Cloudflare Workers
- Browser: Cloudflare Browser Rendering
- Endpointler:
  - `GET /` saglik kontrolu
  - `POST /scrape` body: `{ "url": "https://...", "selector": ".optional" }`
    - `selector` verildiginde browser mode gerekir. Browser mode basarisiz olursa endpoint hata doner.
    - `selector` verilmediginde browser mode basarisiz olursa fallback mode devreye girer.

## Kurulum

```bash
npm install
```

## Cloudflare Hazirlik

1. Cloudflare hesabinda **Browser Rendering** ozelligini etkinlestirin.
2. Lokal ortamda Cloudflare kimlik dogrulamasi yapin:

```bash
npx wrangler login
npx wrangler whoami
```

## Gelistirme

```bash
npm run dev
```

Not: Browser binding nedeniyle local emulation yerine `--remote` kullanilir.

## Deploy

```bash
npm run deploy
```

Deploy sonrasi Worker URL'inize su sekilde istek atabilirsiniz:

```bash
curl -X POST "https://<worker-subdomain>/scrape" \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com"}'
```

## Yanit Ornegi

```json
{
  "success": true,
  "url": "https://example.com/",
  "content": "...",
  "relevantLinks": [
    {
      "url": "https://example.com/about",
      "text": "About"
    }
  ]
}
```
