const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json()); // Gelen JSON istek gövdelerini ayrıştırmak için middleware

// Sunucu ortamları için önerilen argümanlarla tarayıcıyı başlatmaya yardımcı fonksiyon
async function launchBrowser() {
    // Railway veya benzeri platformlarda çalışmak için gerekli argümanlar
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Özellikle Docker ortamlarında önemli
        '--disable-gpu', // Sunucu ortamlarında genellikle GPU olmaz
        '--no-zygote',
        '--single-process', // Daha az kaynak kullanımı için bazen gerekli
        '--autoplay-policy=user-gesture-required',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-features=LangBind,AcceptCHFrame,MojoVideoCapture,ParallelDownloading',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-offer-store-unmasked-wallet-cards',
        '--disable-popup-blocking',
        '--disable-print-preview',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-speech-api',
        '--disable-sync',
        '--disable-web-security', // Dikkatli kullanılmalı, güvenlik riski taşıyabilir
        '--hide-scrollbars',
        '--ignore-gpu-blacklist',
        '--metrics-upload-endpoint=http://localhost',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-pings',
        '--password-store=basic',
        '--use-gl=swiftshader',
        '--use-mock-keychain'
    ];

    return puppeteer.launch({
        headless: "new", // Daha yeni Puppeteer versiyonları için "new" kullanın
        args: args
    });
}

// Kazıma (scrape) endpoint'i
app.post("/scrape", async (req, res) => {
    // İstek gövdesinden 'url' bilgisini al
    const { url } = req.body; // { "url": "hedef_site_url" } bekleniyor

    if (!url) {
        // 'url' bilgisi yoksa hata döndür
        return res.status(400).json({ error: true, message: "İstek gövdesinde 'url' bulunamadı." });
    }

    let browser;
    try {
        // Puppeteer tarayıcısını başlat
        browser = await launchBrowser();
        const page = await browser.newPage();

        // İsteğe bağlı: Gerçek bir tarayıcı gibi görünmek için User-Agent ayarla
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        // İsteğe bağlı: Pencere boyutunu ayarla
        await page.setViewport({ width: 1280, height: 720 });

        console.log(`🔍 Hedefe gidiliyor: ${url}`);

        // URL'ye git ve sayfanın yüklenmesini bekle
        // networkidle2: Son 500ms içinde 2'den fazla ağ bağlantısı olmadığında tetiklenir
        await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 }); // 45 saniye timeout

        // Sayfanın tüm görünür metin içeriğini al
        // Daha sonra, sadece ana içerik alanlarını seçmek için bu kısmı iyileştirebilirsiniz
        const pageTextContent = await page.evaluate(() => {
           // Tüm body metnini al
           let text = document.body.innerText;

           // İsteğe bağlı: Yaygın betik veya stil bloklarını temizleme
           // Bu çok basit bir temizliktir ve yetersiz kalabilir
           text = text.replace(/<script[^>]*>.*?<\/script>/gis, '');
           text = text.replace(/<style[^>]*>.*?<\/style>/gis, '');

           return text;
        });


        console.log(`✅ İçerik başarıyla çekildi: ${url}`);
        // Çekilen metin içeriğini HTTP yanıtı olarak geri gönder
        res.json({ success: true, url: url, content: pageTextContent });

    } catch (error) {
        console.error(`"${url}" adresi için kazıma hatası:`, error);
        // Hata durumunda hata yanıtı gönder
        res.status(500).json({
            error: true,
            message: `"${url}" adresi kazınamadı.`,
            detail: error.message // Hata detayını da gönderebilirsiniz
        });
    } finally {
        // Tarayıcının hata olsa bile kapanmasını sağla
        if (browser) {
            await browser.close();
        }
    }
});

// Temel sağlık kontrol endpoint'i
app.get("/", (req, res) => {
    res.send("✅ Puppeteer Scraper Agent çalışıyor. { \"url\": \"...\" } payload ile /scrape adresine POST isteği gönderin.");
});

const port = process.env.PORT || 3000; // Ortam değişkeninden veya varsayılan olarak 3000 portunu kullan
app.listen(port, () => console.log(`✅ Scraper agent ${port} portunda yayında.`));
