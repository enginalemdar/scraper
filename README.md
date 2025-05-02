# scraper

Bu, n8n iş akışlarıyla entegre olmak üzere tasarlanmış basit bir Node.js Express uygulamasıdır. Belirtilen bir URL'ye giderek Puppeteer (headless Chrome/Chromium) kullanarak sayfanın metin içeriğini çeker. Bu, standart HTTP isteklerinin karşılaştığı anti-bot (Cloudflare vb.) korumalarını aşmaya yardımcı olabilir.

Çekilen metin içeriği daha sonra n8n iş akışında bir AI modeli tarafından analiz edilmek üzere kullanılır.

## Kurulum

1.  Bu repoyu klonlayın: `git clone <repo-url>`
2.  Proje dizinine gidin: `cd n8n-puppeteer-scraper-agent`
3.  Bağımlılıkları yükleyin: `npm install`

## Kullanım

Uygulamayı çalıştırmak için:

```bash
npm start
