import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Lazy initialize Gemini API Client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment degiskeni bulunamadi. Lutfen Secrets panelinden ayarlayin.");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

/**
 * Model seçimi (29 Eylül). Sunucu ilk günden beri tek bir sabit modele
 * ("gemini-3.5-flash") bağlıydı; o ad Google'da yoksa her istek 500'e
 * düşüyordu. Artık sırayla denenir: GEMINI_MODEL (Secrets'ta verilirse),
 * sonra yedekler. Çalışan model hatırlanır.
 */
const MODEL_ADAYLARI = [
  process.env.GEMINI_MODEL,
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);
let calisanModel: string | null = null;

/** Google'ın hatasını Kemal'in okuyacağı Türkçe bir cümleye çevirir */
function hatayiAcikla(error: any): { durum: number; mesaj: string; modelYok: boolean; mesgul?: boolean } {
  const ham = String(error?.message || error || "");
  const kod = Number(error?.status || error?.code || 0);
  if (/GEMINI_API_KEY/.test(ham)) {
    return { durum: 500, modelYok: false, mesaj: "Yapay zekâ anahtarı (GEMINI_API_KEY) tanımlı değil. AI Studio'da Secrets panelinden eklenmeli." };
  }
  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(ham) || kod === 401 || kod === 403) {
    return { durum: 502, modelYok: false, mesaj: "Yapay zekâ anahtarı geçersiz ya da yetkisiz. Secrets'taki GEMINI_API_KEY yenilenmeli." };
  }
  if (/RESOURCE_EXHAUSTED|quota|rate limit/i.test(ham) || kod === 429) {
    return { durum: 429, modelYok: false, mesaj: "Yapay zekâ kotası doldu. Bir süre sonra yeniden dene." };
  }
  if (/NOT_FOUND|is not found|not supported for generateContent|unknown model/i.test(ham) || kod === 404) {
    return { durum: 502, modelYok: true, mesaj: "Yapay zekâ modeli bulunamadı." };
  }
  if (/UNAVAILABLE|overloaded|high demand|503/i.test(ham) || kod === 503) {
    return { durum: 503, modelYok: false, mesgul: true, mesaj: "Yapay zekâ modelleri şu an çok yoğun (Google tarafında). Birkaç dakika sonra yeniden dene." };
  }
  return { durum: 500, modelYok: false, mesaj: `Yapay zekâ hatası: ${ham.slice(0, 300) || "bilinmeyen"}` };
}

/** İsteği sırayla modellere dener; model yoksa bir sonrakine geçer */
async function uret(ai: GoogleGenAI, istek: { contents: string; config: any }) {
  const sira = calisanModel ? [calisanModel, ...MODEL_ADAYLARI.filter(m => m !== calisanModel)] : MODEL_ADAYLARI;
  let sonHata: any = null;
  for (const model of sira) {
    try {
      const yanit = await ai.models.generateContent({ model, ...istek });
      calisanModel = model;
      return yanit;
    } catch (e: any) {
      sonHata = e;
      const h = hatayiAcikla(e);
      // Kemal'in gördüğü: 503 "This model is currently experiencing high
      // demand". Model meşgulse kısa bir bekleyişle bir kez daha, olmazsa
      // sıradaki model.
      if (h.mesgul) {
        await new Promise(r => setTimeout(r, 1200));
        try {
          const yanit = await ai.models.generateContent({ model, ...istek });
          calisanModel = model;
          return yanit;
        } catch (e2: any) {
          sonHata = e2;
          if (!hatayiAcikla(e2).mesgul) throw e2;
        }
        console.warn(`Model meşgul: ${model}, sıradakine geçiliyor.`);
        continue;
      }
      if (!h.modelYok) throw e;
      console.warn(`Model bulunamadı: ${model}, sıradakine geçiliyor.`);
    }
  }
  throw sonHata;
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Pinterest Public RSS Feed parser proxy
app.get("/api/pinterest", async (req, res) => {
  const username = req.query.username as string;
  if (!username) {
    return res.status(400).json({ error: "username parametresi gereklidir." });
  }

  try {
    // Sosyal medya (29 Eylül gece): pano verilirse yalnız o panonun akışı
    const pano = typeof req.query.pano === "string" ? req.query.pano.trim() : "";
    const url = pano
      ? `https://www.pinterest.com/${encodeURIComponent(username.trim())}/${encodeURIComponent(pano)}.rss`
      : `https://www.pinterest.com/${encodeURIComponent(username.trim())}/feed.rss`;
    console.log("Fetching Pinterest RSS:", url);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Pinterest feedine ulasilamadi. (Durum: ${response.status})`);
    }

    const xmlText = await response.text();
    
    // Parse using simple robust regex matches
    const items: Array<{ title: string; link: string; image: string }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];
      
      const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);
      
      let title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "Pinterest Görseli";
      const link = linkMatch ? linkMatch[1].trim() : "";
      const desc = descMatch ? descMatch[1] : "";
      
      // Extract image src from description
      const imgSrcMatch = desc.match(/src="([^"]+)"/) || desc.match(/src='([^']+)'/);
      let image = imgSrcMatch ? imgSrcMatch[1] : "";
      
      // Convert Pinterest thumbnail or medium image to high-res if possible
      if (image && (image.includes("/236x/") || image.includes("/564x/"))) {
        image = image.replace("/236x/", "/originals/").replace("/564x/", "/originals/");
      }

      if (image) {
        items.push({ title, link, image });
      }
    }

    res.json({ success: true, items });
  } catch (error: any) {
    console.error("Pinterest Fetch Hatası:", error);
    res.status(500).json({ error: error.message || "Pinterest ilhamları çekilirken bir hata oluştu." });
  }
});

/**
 * Viki metinlerinin üslubu (21 Ekim, Kemal: "Viki önerilerinde inanılmaz
 * şairane yazıyor. Viki'de yazılar genel olmalı."). Eskiden bütün görevlerin
 * ortak yönergesi "edebi, bilgece, zengin" idi; viki önerileri de oradan
 * şiirsel çıkıyordu. Viki görevleri bu yönergeyi kullanır.
 */
const VIKI_USLUBU = `Üslup: Vikipedi gibi genel, nesnel ve ansiklopedik Türkçe. Kısa, olgusal cümleler; etken ve açık fiiller. Şiirsel ya da süslü anlatım, benzetme, abartı, duygusal sıfat, "gizemli", "büyülü", "kadim", "efsunlu" gibi sözcükler yok. Vikinin bir "şimdi"si yoktur: "hâlâ", "şu anda", "günümüzde", "bugün", "artık" yazma; tarihleri aralık olarak yaz ("1954–"). Verilen bilgide olmayan özel ad (kişi, yer, kurum, ürün), sayı ya da tarih uydurma; bilinmeyeni yazma, soru olarak bırak. Kemsköy yazımını koru.`;
const VIKI_SISTEMI = "Bir ada vikisinin titiz, tarafsız editörüsün. Ansiklopedik, sade, kısa ve olgusal Türkçe yazıyorsun; şiirsel dil kullanmıyorsun.";

// Gemini AI Proxy Endpoint
app.post("/api/ai", async (req, res) => {
  const { task, data } = req.body;
  if (!task) {
    return res.status(400).json({ error: "task parametresi gereklidir." });
  }

  try {
    const ai = getAI();
    let prompt = "";
    let systemInstruction = "Sen 'Kems Komuta Merkezi' için özel entegre edilmiş bir yaratıcı AI asistanısın. Kems Company bünyesindeki yaratıcı evren (Düzada, Ege estetiği, arşivsel sıcaklık) için lore, marka ve tasarım önerileri üretiyorsun. Tüm yanıtları mutlaka akıcı, bilgece ve zengin bir Türkçe ile ver. Teknik terimler yerine daha insani, sıcak ve edebi bir dil kullan.";

    switch (task) {
      case "devam-et":
        if (data.viki) {
          prompt = `Aşağıdaki viki maddesinin metnine bir paragraf ekle: mevcut metindeki bilgileri düzenle ve tamamla; yeni olgu icat etme. Sadece eklenecek paragrafı döndür (mevcut kısmı tekrar etme).
${VIKI_USLUBU}
Mevcut Metin/Konu:
"${data.text || ""}"
Önceki Bağlam/Notlar:
"${data.notes || ""}"`;
          systemInstruction = VIKI_SISTEMI;
          break;
        }
        prompt = `Aşağıdaki metni (veya konuyu) devam ettir. Edebi, sıcak, arşivsel tonda bir paragraf ekle. Sadece devam eden ek metni döndür (mevcut kısmı tekrar etme).
Mevcut Metin/Konu:
"${data.text || ""}"
Önceki Bağlam/Notlar:
"${data.notes || ""}"`;
        break;

      case "baslik-oner":
        prompt = `Aşağıdaki metin veya konu için 5 adet yaratıcı, çarpıcı ve arşiv/retro estetiğine uygun Türkçe başlık önerisi sun. Yanıtını sade bir JSON dizi formatında ver, başka hiçbir açıklama ekleme. Örnek: ["Başlık 1", "Başlık 2", "Başlık 3"]
Mevcut Metin/Notlar:
"${data.text || data.notes || ""}"`;
        systemInstruction += " Sadece saf bir JSON dizisi döndür.";
        break;

      case "ton-duzelt":
        prompt = `Aşağıdaki Türkçe metnin yazım tonunu düzelt ve daha edebi, sıcak, nostaljik ve arşivsel bir havaya sok. Sadece düzeltilmiş metnin kendisini döndür.
Mevcut Metin:
"${data.text || ""}"
İstenen Tarz: ${data.style || "Retro Arşivsel"}`;
        break;

      case "lore-bagi":
        prompt = `Mevcut metin ile adadaki diğer varlıklar arasında kanona uygun, somut ve sade bağlantılar (lore bağı) kur; şiirsel anlatım kullanma. Aşağıdaki varlıkları incele ve bu metinle nasıl ilişkilendirilebileceğine dair 2-3 adet öneri ver.
Mevcut Metin/Yazı:
"${data.text || ""}"
Kullanılabilir Varlıklar:
${JSON.stringify(data.existingEntities || [])}
Önerileri maddeler halinde yaz.`;
        break;

      case "logo-renk-cikar":
        prompt = `Şu logo açıklaması veya görsel temaya uygun, Düzada ve Kems Company marka dna'sına (lacivert, krem, mercan, ada renkleri) uyumlu 4 adet renk paleti öner. Her renk için HEX kodu ve şiirsel bir Türkçe isim ver (örneğin: #9DB0A4 - Ada Adaçayı). Yanıtı bir JSON dizisi olarak ver. Örnek: [{"hex": "#0E1C4F", "name": "Derin Deniz Laciverti"}]
Açıklama:
"${data.logoDescription || ""}"`;
        systemInstruction += " Sadece saf bir JSON dizisi döndür.";
        break;

      case "wiki-section-oner":
        prompt = `Aşağıdaki ${data.type} türündeki varlığın viki maddesi için en az 3 bölüm başlığı ve kısa içerik öner. Yanıtı JSON dizisi olarak döndür.
${VIKI_USLUBU}
Kurallar:
- Başlıklar ansiklopedik olsun (Tarihçe, Konum, Yapı, Faaliyet, Çevre, Ünlü kişiler…); türüne uygun olanları seç.
- İçerik 1-3 kısa cümle; yalnız aşağıdaki varlık notlarındaki bilgiyi kullan. Not yetersizse içeriği boş bırak ("content": "") ve başlığı Kemal'e soru olarak değil, boş bölüm olarak bırak.
- Somut, çalışılmış örnek ver: bölüm bilgi verecekse hangi cümle kalıbıyla yazılacağı belli olsun (örnek: "X, Y mahallesinde yer alan bir mekândır. 1954'ten beri faaliyettedir.") — ama örnekteki bilgi notlarda yoksa yazma.
Örnek format: [{"title": "Konum", "content": "… mahallesinde yer alır."}, {"title": "Tarihçe", "content": ""}]
Varlık Adı: "${data.title}"
Varlık Notları: "${data.notes || ""}"`;
        systemInstruction = VIKI_SISTEMI + " Sadece saf bir JSON dizisi döndür.";
        break;

      case "kunya-cikar":
        prompt = `Aşağıdaki ${data.type} türündeki varlık için künye kartı (profile) bilgilerini metinden çıkar. Değerler kısa, nesnel ve ansiklopedik olsun; şiirsel anlatım yok. Metinde olmayan bilgiyi uydurma; yeni özel ad ya da sayı yazma, o alanı yazma.
Varlık Adı: "${data.title}"
Varlık Açıklaması/Notları: "${data.notes || ""}"

İlgili varlık türüne göre SADECE aşağıdaki alanları doldur:
- Eğer tür 'kisi' veya 'karakter' ise:
  - "profession" (Meslek / Rol)
  - "personality" (Mizaç / Kişilik, örn: Melankolik, Detaycı)
  - "origin" (Köken / Soy)
  - "motivation" (Hedef / Motivasyon)
- Eğer tür 'mekân', 'dükkân' veya 'yer' ise:
  - "shopType" (İşletme / mekân türü)
  - "manager" (Sorumlu / sahibi — metinde geçmiyorsa boş bırak, ad uydurma)
  - "style" (Mimari tarz)
  - "secrets" (Önemli sırlar)
- Eğer tür 'marka' veya 'kulüp' ise:
  - "purpose" (Kuruluş amacı)
  - "leader" (Liderlik — metinde geçmiyorsa boş bırak)
  - "secrecy" (Gizlilik — sayı uydurma)
- Eğer tür 'ürün' ise:
  - "rarity" (Nadirlik)
  - "material" (Köken / malzeme)
  - "function" (Ana işlevi)

Yanıtı mutlaka ve sadece aşağıdaki saf JSON formatında döndür, başka hiçbir şey (markdown işaretlemesi vb.) ekleme:
{
  "profile": {
    "[alan_adi_1]": "önerilen değer 1",
    "[alan_adi_2]": "önerilen değer 2"
  }
}`;
        systemInstruction = VIKI_SISTEMI + " Sadece saf bir JSON nesnesi döndür.";
        break;

      // Stüdyo (29 Eylül akşamı): kitap bölümü özeti ve sonraki bölüm için fikir
      case "bolum-ozeti":
        prompt = `Aşağıdaki roman bölümünün kısa bir Türkçe özetini çıkar (en fazla 6 cümle). Metinde olmayan olay ekleme.
Bölüm:
"${data.text || ""}"`;
        break;

      case "sonraki-fikir":
        prompt = `Aşağıdaki roman bölümünden sonra hikâyenin nereye gidebileceğine dair 3 kısa fikir yaz. Yeni özel ad (kişi, yer, kurum) uydurma; yalnız metinde geçen adları kullan. Madde madde yaz.
Bölüm:
"${data.text || ""}"`;
        break;


      // Gece hazırlığı (kural istisnası, yapisal-4): günde 3 üretim önerisi.
      // Yalnız öneri tepsisine düşer; Kemal "Ekle" demeden kayda girmez.
      case "gece-onerileri":
        prompt = `Kems Company ve kurgusal Düzada adası için bugünün ${(data.yuvalar || []).length} önerisini hazırla. Her yuva için bir öneri; yuvalar: ${JSON.stringify(data.yuvalar || [])}. Cevaptaki "tur" alanı yuvanın "tur" değeri olsun.
Öneri bir iş fikridir. Kısa ve uygulanabilir olsun; ada kanonundan bir bilgiye dayansın.
Genel kurallar:
- Yeni özel ad (kişi, yer, kurum, ürün, drop adı) uydurma; yalnız aşağıda geçen adları kullan.
- Fiyat, sayı, tarih uydurma. "Hâlâ", "şu anda", "günümüzde" yazma.
- Her yuva türü için "Daha önce önerilenler" listesindeki başlıkları ve benzerlerini önerme; her gün farklı bir konu getir.
Tür kuralları:
- "viki": Aşağıdaki "Viki" listesinden BİR maddeyi seç (listenin başındakiler en boş olanlardır; sırayla farklı türlerden madde seç, hep aynı türe gitme). "bagId" alanına o maddenin "id" değerini AYNEN yaz, "bag" alanına adını yaz. "metin": maddede neyin eksik olduğunu (dolu ve boş bölümlere bak) ve Kemal'e sorulacak tek somut soruyu söyler. "bolumler": o maddenin notlarındaki bilgiyle yazılabilen en çok 2 kısa örnek bölüm [{"title","content"}]; bilgi yetmiyorsa boş dizi. Bölüm metni ansiklopedik olsun.
- "wikipedia": Aşağıdaki "Vikipedi örneği" gerçek dünyadan bir maddedir, KOPYALANMAYACAK; yalnız yapısı için örnektir. Düzada'da ona benzeyen BİR viki maddesini "Viki" listesinden seç (kulüp, köy, mahalle gibi türüne uygun), "bagId"ine id'sini yaz. "metin": örnek maddede hangi başlıklar ve hangi bilgi türleri var (konum, tarihçe, yapı, faaliyet vb.), Düzada'daki maddede hangilerinin boş olduğu ve Kemal'e sorulacak sorular. Örnekteki özel adları, sayıları, tarihleri Düzada'ya taşıma. "bolumler": boş dizi.
- "depo": Aşağıdaki "Oyun deposu" metni Dondurmacı Kızlar oyununun evren bilgisidir. "bagId" boş bırak (madde sabit: "${data.depo?.madde || ""}"). "metin": depodaki hangi evren bilgisinin (yer, dönem, sahip) vikide eksik olduğunu söyle. "bolumler": yalnız o metinde yazan bilgiyle en çok 2 kısa ansiklopedik bölüm. Oyun ayarı (fiyat, süre, oran, sayı) ASLA; oyun mekaniğinden de söz etme.
- "sosyal": gönderi fikri; "bag" bir viki ya da drop adı olabilir.
- "drop": yeni bir ürün fikri; "Ürünler" listesinde olanı yeniden önerme. "bag" bir drop adı olsun.
- "yazi": blog ya da lore yazısı fikri; "bag" ilgili viki maddesi olabilir.
${VIKI_USLUBU}
(Bu üslup viki, wikipedia ve depo yuvalarının "metin" ve "bolumler" alanları için geçerlidir; viki metni kurgu yazmaz, eksik ve sorudur.)
Daha önce önerilenler (tür: başlıklar): ${JSON.stringify(data.onceki || {})}
Viki: ${JSON.stringify(data.viki || [])}
Vikipedi örneği: ${JSON.stringify(data.wikipedia || null)}
Oyun deposu (yalnız evren bilgisi): ${JSON.stringify(data.depo || null)}
Droplar: ${JSON.stringify(data.droplar || [])}
Ürünler: ${JSON.stringify(data.urunler || [])}
Sosyal medya gönderileri: ${JSON.stringify(data.gonderiler || [])}
Yazılar: ${JSON.stringify(data.yazilar || [])}
Not defteri: ${JSON.stringify(data.notlar || [])}
Yanıtı saf JSON dizisi olarak döndür: [{"tur": "viki", "baslik": "kısa başlık", "metin": "2-4 kısa cümle", "bagId": "madde id", "bag": "madde adı", "bolumler": [{"title": "Konum", "content": "…"}]}]`;
        systemInstruction = "Bir markanın ve bir ada vikisinin sessiz asistanısın; sade, kısa, kanona bağlı öneriler veriyorsun. Viki ile ilgili metinleri ansiklopedik ve nesnel yazarsın, şiirsel dil kullanmazsın. Sadece saf bir JSON dizisi döndür.";
        break;

      // Aylık fanzin taslağı (yapisal-2, 31; yapisal-4, 29-32). Adı yok; bölümler serbest.
      case "fanzin-taslak":
        prompt = `Kems Company'nin ${data.ay || "bu ayki"} fanzini için bölüm taslakları hazırla. Temiz bir dergi gibi: 4-6 bölüm, her bölümün kısa bir başlığı ve 60-150 kelimelik metni. Fanzine ad koyma.
Kaynaklar: viki ve künye, Merch ve droplar, not defteri, Pinterest panoları, Canva / galeri görselleri ve sosyal medya hesapları (aşağıda). Her bölüm bu kaynaklardan birine dayansın.
Kurallar:
- Yeni özel ad (kişi, yer, kurum, ürün, drop adı) uydurma; yalnız aşağıda geçen adları kullan.
- Fiyat, sayı, tarih uydurma. "Hâlâ", "şu anda", "günümüzde" yazma.
- Ton sade; Kemal her bölümün tonunu sonra kendisi seçecek.
Viki: ${JSON.stringify(data.viki || [])}
Droplar: ${JSON.stringify(data.droplar || [])}
Ürünler: ${JSON.stringify(data.urunler || [])}
Not defteri: ${JSON.stringify(data.notlar || [])}
Pinterest: ${JSON.stringify(data.pinterest || [])}
Galeri: ${JSON.stringify(data.galeri || [])}
Sosyal medya: ${JSON.stringify(data.gonderiler || [])} · hesaplar: ${JSON.stringify(data.hesaplar || [])}
Kemal'in isteği: "${data.istek || ""}"
Yanıtı saf JSON dizisi olarak döndür: [{"title": "Bölüm başlığı", "content": "Bölüm metni"}]`;
        systemInstruction = "Küçük, özenli bir fanzinin editörüsün. Sade Türkçe, süssüz. Sadece saf bir JSON dizisi döndür.";
        break;

      // Mahalle metinleri (1 Ekim gece, metin soru turu). İskelet Kemal'in
      // cevaplarından; model yalnız onu ansiklopedik metne çevirir.
      case "mahalle-metinleri":
        prompt = `Düzada adasının vikisi için aşağıdaki bölümlerin her birine ansiklopedik bir metin taslağı yaz.
Kurallar:
- Yalnız her bölümün "iskelet" maddelerindeki bilgileri kullan. Yeni bilgi, olay, özel ad (kişi, yer, kurum, işletme), sayı ya da tarih ekleme; iskelette adı yazılmayanın adını koyma.
- Ton ansiklopedik: sade, nesnel, süssüz; edebi benzetme ve abartı yok. Türkçe; "Kemsköy" yazımını koru.
- Vikinin bir "şimdi"si yok: "hâlâ", "şu anda", "günümüzde", "bugün", "artık" yazma. Tarihleri aralık olarak yaz.
- Her bölüm, "paragraf" alanındaki sayıda paragraf olsun; paragrafları boş satırla ayır. İskeletin sırasını izle.
- "soylenti" doluysa o bölümde yalnız bir kez, tek cümleyle ve "Sözlü anlatıya göre" diye başlayarak yer ver; boşsa hiçbir söylenti, efsane ya da rivayet yazma.
- Başlık yazma; yalnız bölüm metni.
Bölümler: ${JSON.stringify(data.bolumler || [])}
Yanıtı saf JSON dizisi olarak döndür, her bölüm için bir nesne ve "anahtar" aynen korunsun: [{"anahtar": "merkez-tarihce", "title": "Tarihçe", "content": "Bölüm metni"}]`;
        systemInstruction = "Bir ada vikisinin titiz editörüsün. Yalnız verilen bilgilerle, ansiklopedik ve sade Türkçe yazıyorsun. Sadece saf bir JSON dizisi döndür.";
        break;

      case "mahalle-derle":
        prompt = `Düzada vikisindeki "${data.mahalle || ""}" mahallesinin maddesi zamanla tekrar eden önerilerle doldu. Aşağıdaki "oneriler" bölümlerini tek, düzenli bir hâle getir.
Kurallar:
- Yalnız verilen metinlerdeki bilgileri kullan. Yeni bilgi, olay, özel ad, sayı ya da tarih ekleme; adı yazılmayanın adını koyma.
- Her bilgi bir kez geçsin. Künyede, giriş metninde ya da "resmi" bölümlerde zaten yazan bilgiyi tekrar etme (resmi bölümler Kemal'in onayladığı metindir, onlara dokunma ve onları yeniden yazma).
- Aynı başlık iki kez olmasın. Başlıklar mümkünse "sira" listesinden olsun ve o sırayla gelsin; listede karşılığı olmayan konu için kısa, sade bir başlık kullan.
- Bir bilgi mahalleden çok "altYerler" listesindeki bir cadde, meydan ya da yer adıyla ilgiliyse ve uzunsa, o bölümü ayrı ver ve "madde" alanına o yerin adını aynen yaz; mahalle metninde o yer için en fazla tek cümlelik anım kalsın.
- Ton ansiklopedik: sade, nesnel, süssüz. Türkçe; "Kemsköy" yazımını koru.
- Vikinin bir "şimdi"si yok: "hâlâ", "şu anda", "günümüzde", "bugün", "artık" yazma. Tarihleri aralık olarak yaz.
- Söylenti, efsane ya da rivayet ancak verilen metinde varsa ve yalnız bir kez geçer.
Künye: ${JSON.stringify(data.kunye || [])}
Giriş metni: ${JSON.stringify(data.giris || "")}
Resmi bölümler (dokunma): ${JSON.stringify(data.resmi || [])}
Derlenecek öneri bölümleri: ${JSON.stringify(data.oneriler || [])}
Bölüm sırası: ${JSON.stringify(data.sira || [])}
Alt yerler: ${JSON.stringify(data.altYerler || [])}
Yanıtı saf JSON dizisi olarak döndür: [{"title": "Tarihçe", "content": "Bölüm metni"}, {"title": "Tarihçe", "content": "…", "madde": "Ada Tepesi"}]`;
        systemInstruction = "Bir ada vikisinin titiz editörüsün. Tekrarları ayıklıyor, yalnız verilen bilgilerle sade Türkçe yazıyorsun. Sadece saf bir JSON dizisi döndür.";
        break;

      case "fanzin-bolum":
        prompt = `Aşağıdaki fanzin bölümünü "${data.ton || "Sade"}" tonunda yeniden yaz. Anlamı ve adları koru; yeni özel ad, sayı, tarih ekleme. "Hâlâ", "şu anda", "günümüzde" yazma. Uzunluk aşağı yukarı aynı kalsın. Yalnız yeni metni döndür.
Bölüm başlığı: "${data.baslik || ""}"
Metin: "${data.metin || ""}"`;
        break;

      case "site-hakkinda":
        prompt = `Kems Company'nin sitesindeki "Hakkında" sayfası için 2-3 cümlelik sade bir metin taslağı yaz. Yalnız aşağıdaki bilgileri kullan; yeni özel ad, sayı, fiyat, tarih uydurma (kuruluş yılı 2025, "Made with Culture" sözü ve Düzada adı kullanılabilir). "Hâlâ", "şu anda", "günümüzde" yazma. Süslü ve abartılı olma.
Marka: "${data.baslik || "Kems Company"}"
Marka notları: "${data.notlar || ""}"
Marka kiti: ${JSON.stringify(data.kit || {})}
Kemal'in isteği: "${data.istek || ""}"
Yalnız metni döndür.`;
        break;


      case "tutarlilik-kontrolu":
        prompt = `Aşağıdaki kitap bölümü metni ile mevcut dünya lore'u (wiki) arasında herhangi bir çelişki olup olmadığını denetle. Eğer bir çelişki varsa kibarca uyar ve düzeltme öner, her şey tutarlıysa takdir et.
Bölüm Metni:
"${data.text || ""}"
Mevcut Lore / Wiki Bilgileri:
${JSON.stringify(data.wikiContext || [])}
Sonucu Türkçe olarak, yapıcı bir dille açıkla.`;
        break;

      // Günün sorusu (Paket 4): kanondaki bir boşluk için tıklamalı seçenek.
      // Seçenek yalnız aday; Kemal seçse bile önce Adaylar'a düşer.
      case "kanon-sorusu-secenek":
        prompt = `Kurgusal Düzada adasının vikisinde "${data.madde || ""}" maddesinin "${data.etiket || ""}" alanı boş.
Soru: "${data.soru || ""}"
Maddenin bilinen künyesi ve metni:
${JSON.stringify(data.baglam || {})}
Ada hakkında bilinenler:
${JSON.stringify(data.ada || "")}
Bu soruya kanonla çelişmeyen 3 kısa cevap seçeneği öner. Kurallar:
- Her seçenek en fazla 12 kelime, sade Türkçe, süs yok.
- Yeni özel ad (kişi, yer, kurum, ürün adı) uydurma; yalnız yukarıda geçen adları kullanabilirsin.
- Sayı uydurma (fiyat, nüfus, takipçi). Tarih gerekiyorsa aralık yaz ("1950'ler").
- "Hâlâ", "şu anda", "günümüzde" yazma.
Yanıtı saf JSON dizisi olarak döndür: ["seçenek 1", "seçenek 2", "seçenek 3"]`;
        systemInstruction = "Kurgusal bir evrenin vikisi için kısa, sade, kanona bağlı seçenekler öneriyorsun. Sadece saf bir JSON dizisi döndür.";
        break;

      case "merch-oner":
        // Fiyat istenmez: uydurma sayı yok (Kemal'in kuralı)
        prompt = `Aşağıdaki drop ya da tema için 3 adet Düzada estetiğine (lacivert, kiremit, krem) uygun ürün fikri üret. Her ürün için bir başlık, kısa tasarım açıklaması (desen, kumaş, kesim) ve kısa bir Türkçe slogan önerisi yaz. Fiyat, sayı ya da yeni özel ad uydurma. Yanıtı mutlaka saf bir JSON dizisi formatında döndür, başka hiçbir şey ekleme. Örnek format: [{"title": "Ürün Adı", "description": "Tasarım ve kumaş açıklaması...", "slogan": "Kısa slogan"}]
Tema/Marka Bilgisi:
"${data.brandInfo || ""}"
Kategori/Seçim: ${data.category || "hepsi"}
Ek Açıklama ve Notlar:
"${data.notes || ""}"`;
        systemInstruction += " Sadece saf bir JSON dizisi döndür.";
        break;

      default:
        return res.status(400).json({ error: "Bilinmeyen AI görevi." });
    }

    const response = await uret(ai, {
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        ...(prompt.includes("JSON") ? { responseMimeType: "application/json" } : {})
      }
    });

    const reply = response.text || "";
    res.json({ result: reply });
  } catch (error: any) {
    console.error("Gemini API Hatası:", error);
    const h = hatayiAcikla(error);
    res.status(h.durum).json({
      error: h.modelYok ? `${h.mesaj} Denenenler: ${MODEL_ADAYLARI.join(", ")}.` : h.mesaj
    });
  }
});

/**
 * Yapay zekâ sağlık kontrolü: anahtar var mı, hangi model cevap veriyor.
 * Tarayıcıda /api/ai-durum açılınca okunur.
 */
app.get("/api/ai-durum", async (_req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ anahtar: false, mesaj: hatayiAcikla(new Error("GEMINI_API_KEY")).mesaj });
  }
  try {
    await uret(getAI(), { contents: "Yalnız 'tamam' yaz.", config: { temperature: 0 } });
    res.json({ anahtar: true, calisiyor: true, model: calisanModel });
  } catch (e: any) {
    res.json({ anahtar: true, calisiyor: false, mesaj: hatayiAcikla(e).mesaj, denenenler: MODEL_ADAYLARI });
  }
});

// Vite Middleware for Development / Static serving for Production
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware mounted.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

setupVite();
