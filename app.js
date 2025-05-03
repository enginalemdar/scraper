// Gerekli modülleri içe aktar
const express = require("express");
const puppeteer = require("puppeteer");

// Express uygulamasını başlat
const app = express();
// JSON formatındaki istek gövdelerini ayrıştırmak için middleware kullan
app.use(express.json());

// Sunucu ortamları için önerilen argümanlarla Puppeteer tarayıcısını başlatan yardımcı fonksiyon
// Bu fonksiyon, Puppeteer'ın Docker veya Railway gibi ortamlarda stabil çalışmasına yardımcı olur.
async function launchBrowser() {
    const args = [
        '--no-sandbox', // Güvenlik sandbox'ını devre dışı bırak (genellikle server ortamlarında gerekir)
        '--disable-setuid-sandbox', // setuid sandbox'ını devre dışı bırak
        '--disable-dev-shm-usage', // /dev/shm kullanımını devre dışı bırak (Docker'da yaygın sorunları önler)
        '--disable-gpu', // GPU hızlandırmasını devre dışı bırak (sunucu ortamlarında GPU genellikle olmaz)
        '--no-zygote', // Zygote sürecini devre dışı bırak (bazı ortamlarda başlatma sorunlarını çözebilir)
        '--single-process', // Tek süreç modunu zorla (kaynakları azaltabilir, ancak stabiliteyi etkileyebilir)
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
        '--disable-setuid-sandbox',
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
        headless: "new", // Daha yeni Puppeteer versiyonları için önerilen headless modu
        args: args
    });
}

// Web kazıma (scrape) işlemini yapacak POST endpoint'i
app.post("/scrape", async (req, res) => {
    // İstek gövdesinden 'url' parametresini al
    const { url } = req.body; // Örnek JSON gövdesi: { "url": "hedef_site_url" }

    // URL parametresinin sağlanıp sağlanmadığını kontrol et
    if (!url) {
        // URL yoksa 400 Bad Request hatası döndür
        return res.status(400).json({ error: true, message: "İstek gövdesinde 'url' parametresi bulunamadı." });
    }

    let browser; // Puppeteer tarayıcı nesnesi için değişken
    try {
        // Puppeteer tarayıcısını başlat
        browser = await launchBrowser();
        // Yeni bir tarayıcı sayfası aç
        const page = await browser.newPage();

        // İsteğe bağlı: Sayfayı gerçek bir tarayıcı gibi göstermek için User-Agent ve Viewport ayarla
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 720 });

        console.log(`🔍 Hedefe gidiliyor: ${url}`);

        // Belirtilen URL'ye git. İlk sayfa yüklemesini networkidle2 ile bekle.
        // networkidle2: Son 500 milisaniye içinde 2'den fazla ağ bağlantısı yoksa tetiklenir.
        // timeout: Sayfa yüklenmezse veya bekleme süresi aşılırsa hata fırlatır (45 saniye).
        await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

        // --- Dinamik İçeriğin Yüklenmesini Bekleme ---
        // Burası, JavaScript ile yüklenen içeriği beklemek için kritik.
        // Sayfadaki linklerin veya ana içeriğin yüklendiğini belirten bir selector bekleyebiliriz.
        // 'body a[href]' genel bir selector olabilir, ancak çok erken de tetiklenebilir.
        // Daha spesifik bir selector (örn: '.main-content a' veya '.footer a') bulmak daha iyidir.
        // Eğer spesifik selector yoksa veya bulmak zorsa, kaba bir süre beklemek (waitForTimeout)
        // veya yaygın bir içerik selector'ünü beklemek bir seçenek olabilir.

        // ÖRNEK SELECTOR: Sayfadaki herhangi bir linkin (a[href]) veya ana içerik alanının (.main, article, body) görünmesini bekleyebiliriz.
        // 'body a[href]' en basit olanıdır, bir linkin görünmesi genellikle JS'in çalıştığını gösterir.
        // Ancak daha robust bir site için, sitenin ana içerik alanının selector'ünü beklemek daha iyidir.
        const selectorToWaitFor = 'body a[href]'; // Veya hedef siteye özgü bir selector deneyin, örn: '.main-content', 'article', '.footer a'

        try {
             // Belirtilen selector'ün sayfada görünmesini bekle
             // Timeout, beklenen elementin hiç yüklenmemesi durumunda hata vermesi için
             await page.waitForSelector(selectorToWaitFor, { timeout: 15000 }); // Selector'un gelmesi için 15 saniye bekle
             console.log(`✅ Selector bulundu veya timeout aşıldı: ${selectorToWaitFor}`);
             // Timeout aşılsa bile burada catch'e düşmüyoruz, sadece uyarı logu yazıyoruz
        } catch (e) {
             console.warn(`⚠️ Beklenen selector bulunamadı veya timeout aşıldı (${selectorToWaitFor}): ${e.message}`);
             // Selector bulunamasa bile (örn: site yapısı farklıysa),
             // sayfanın yüklenmiş olabileceği varsayımıyla işleme devam et
        }

        // --- Bekleme Sonu ---


        // Sayfanın tüm görünür metin içeriğini al (hala page.evaluate kullanabiliriz)
        // Bekleme işleminden sonra evaluate çalıştığı için, dinamik içerik metne dahil edilmiş olur.
        const pageTextContent = await page.evaluate(() => {
           const text = document.body.innerText;
           // İsteğe bağlı basit metin temizlikleri
           // innerText zaten script ve style etiketlerinin içeriğini almaz, ancak bazen ek temizlik gerekebilir
           return text;
        });

        // --- İlgili Linkleri Bulma ve Filtreleme (Node.js Bağlamında) ---
        // Bu kısım bekleme işleminden sonra çalışır, bu sayede dinamik linklerin DOM'da olması beklenir.
        const relevantLinks = []; // İlgili linkleri tutacak dizi
        try {
            // Sayfadaki href özniteliği olan tüm link (a) elementlerinin ElementHandle'larını al
            const linkElements = await page.$$('a[href]');

            console.log(`Found ${linkElements.length} total link elements after waiting.`); // Debug için toplam link sayısı

            // Her bir link elementi üzerinde döngü yap
            for (const linkElement of linkElements) {
                let href = null;
                let linkText = '';

                try {
                    // ElementHandle'dan href ve innerText özelliklerini çekmek için evaluate kullan
                    href = await page.evaluate(el => el.getAttribute('href'), linkElement);
                    linkText = await page.evaluate(el => el.innerText ? el.innerText.trim() : '', linkElement);

                    // Linkin geçerli bir URL olduğundan ve aynı domainde (site içinde) olduğundan emin ol
                    if (!href) {
                         continue; // Href özniteliği olmayan linkleri atla
                    }

                    // Göreli (relative) URL'leri geçerli sayfa URL'sine göre tam (absolute) URL'ye çevir
                    const absoluteUrl = new URL(href, page.url()).href; // page.url() Puppeteer'ın mevcut URL'sini verir


                    // Aynı sayfadaki çapa (anchor) linkleri (#) veya boş/kendini referans alan linkleri filtrele
                    if (absoluteUrl === page.url() || absoluteUrl === page.url() + '/' || absoluteUrl.endsWith('#') || absoluteUrl === '') {
                        continue; // Bu linkleri atla
                    }


                    // Sadece belirli anahtar kelimeler içeren linkleri dahil et (hem URL'de hem link metninde ara)
                    const lowerHref = absoluteUrl.toLowerCase();
                    const lowerLinkText = linkText.toLowerCase();

                    // Anahtar kelimeler listesi - burayı genişletebilirsiniz!
                    // AI'ın aradığı bilgilere (kurucu, ürün, fiyat, pazar) ulaşmasını sağlayacak potansiyel linkleri hedefleyin.
                    const keywords = [
                         'about', 'team', 'pricing', 'product', 'solution', 'hakkimizda',
                         'ekip', 'fiyatlar', 'urunler', 'cozumler', 'platform', 'contact',
                         'iletisim', 'biz-kimiz', 'servisler', 'kurucu', 'founder', 'yonetim',
                         'story', 'value', 'careers', 'kariyer', 'price', 'demo', 'register',
                         'login', 'giris', 'kaydol'
                    ];

                    // URL veya link metni anahtar kelimelerden birini içeriyorsa ilgili kabul et
                    const isRelevant = keywords.some(keyword =>
                        lowerHref.includes(keyword) || lowerLinkText.includes(keyword)
                    );

                    if (isRelevant) {
                        relevantLinks.push({ url: absoluteUrl, text: linkText });
                        // console.log("Added relevant link:", { url: absoluteUrl, text: linkText }); // Debug için
                    }
                } catch (e) {
                    // Link işleme sırasında oluşabilecek hataları yakala (URL formatı vb.)
                    console.error(`Link işleme hatası (href: ${href}, metin: ${linkText.substring(0, 50)}...):`, e.message);
                }
            }

            // Aynı URL'ye sahip yinelenen linkleri listeden kaldır (URL'ye göre benzersizleştir)
            const uniqueLinks = Array.from(new Map(relevantLinks.map(item => [item.url, item])).values());
            console.log(`Found ${uniqueLinks.length} unique relevant links after filtering.`); // Debug için

            // relevantLinks artık uniqueLinks olacak
            relevantLinks.length = 0; // Diziyi boşalt
            relevantLinks.push(...uniqueLinks); // Benzersiz linkleri ekle

        } catch (e) {
            // Link elementlerini bulma veya döngü sırasında genel bir hata
            console.error("Link elementlerini bulma veya işleme sırasında genel hata:", e.message);
             // Hata olsa bile boş bir liste ile devam et
        }
        // --- Link Bulma ve Filtreleme Sonu ---


        // İşlem başarılı olduysa konsola log yaz ve yanıtı gönder
        console.log(`✅ İçerik başarıyla çekildi ve ${relevantLinks.length} ilgili link bulundu: ${url}`);
        res.json({
            success: true, // Başarı durumu
            url: url, // Kazınan URL
            content: pageTextContent, // Sayfanın metin içeriği
            relevantLinks: relevantLinks // Bulunan ilgili linkler listesi
        });

    } catch (error) {
        // Herhangi bir hata oluşursa (sayfa yüklenememesi, timeout, selector bulunamaması vb.)
        console.error(`"${url}" adresi için kazıma hatası:`, error);
        // Hata yanıtı gönder (500 Internal Server Error)
        res.status(500).json({
            error: true, // Hata durumu
            message: `"${url}" adresi kazınamadı.`, // Kullanıcıya gösterilecek mesaj
            detail: error.message // Hatanın teknik detayı
        });
    } finally {
        // Tarayıcı nesnesi varsa (başlatılmışsa), işlem başarılı olsa da hata olsa da kapat
        if (browser) {
            await browser.close();
        }
    }
});

// Uygulamanın ayakta olduğunu kontrol etmek için basit bir GET endpoint'i
app.get("/", (req, res) => {
    res.send("✅ Puppeteer Scraper Agent çalışıyor. { \"url\": \"...\" } payload ile /scrape adresine POST isteği gönderin.");
});

// Uygulamayı dinlemeye başla. Portu ortam değişkeninden veya varsayılan olarak 3000 olarak al.
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Scraper agent ${port} portunda yayında.`));
