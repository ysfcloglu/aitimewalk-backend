const OpenAI = require("openai");

const DAILY_LIMIT = 10;
const rateLimitStore = new Map();

function setCorsHeaders(request, response) {
  const origin = request.headers.origin || "";
  const localhostPattern = /^http:\/\/localhost(?::\d+)?$/i;
  const allowedOrigin =
    origin === "https://aitimewalk.com" || localhostPattern.test(origin)
      ? origin
      : "https://aitimewalk.com";

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getUtcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getClientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0];
  }

  return request.socket?.remoteAddress || "unknown";
}

function isRateLimited(ipAddress) {
  const dayKey = getUtcDayKey();
  const existing = rateLimitStore.get(ipAddress);

  if (!existing || existing.dayKey !== dayKey) {
    rateLimitStore.set(ipAddress, { dayKey, count: 1 });
    return false;
  }

  if (existing.count >= DAILY_LIMIT) {
    return true;
  }

  existing.count += 1;
  rateLimitStore.set(ipAddress, existing);
  return false;
}

async function fetchWikipediaImage(keyword, language) {
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("format", "json");
  url.searchParams.set("piprop", "original");
  url.searchParams.set("titles", keyword);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "aitimewalk-mvp/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Wikipedia isteği başarısız oldu: ${language}`);
  }

  const data = await response.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  const imageUrl = pages.find((page) => page?.original?.source)?.original?.source;

  return imageUrl || null;
}

async function resolveWikipediaImage(keyword) {
  const normalizedKeyword = String(keyword || "").trim();

  if (!normalizedKeyword) {
    return null;
  }

  try {
    const trImage = await fetchWikipediaImage(normalizedKeyword, "tr");

    if (trImage) {
      return {
        url: trImage,
        source: "wikipedia",
        keyword: normalizedKeyword
      };
    }
  } catch (error) {
    console.error("Türkçe Wikipedia görseli alınamadı:", error.message);
  }

  try {
    const enImage = await fetchWikipediaImage(normalizedKeyword, "en");

    if (enImage) {
      return {
        url: enImage,
        source: "wikipedia",
        keyword: normalizedKeyword
      };
    }
  } catch (error) {
    console.error("İngilizce Wikipedia görseli alınamadı:", error.message);
  }

  return null;
}

// 🎯 YENİ: Seçilen Moda Göre Yapay Zekaya Kimlik Veren Fonksiyon
function generateSystemPrompt(mode, lang) {
  const baseInstruction = ' Yanıtını kesinlikle geçerli bir JSON objesi olarak şu formatta döndür: {"answer":"string","imageKeywords":["string","string"]}. imageKeywords alanında konuya veya konsepte uygun 2 veya 3 adet Wikipedia arama terimi ver.';
  
  const isEn = lang === 'EN';
  const langText = isEn ? "Tüm yanıtlarını İngilizce (English) ver." : "Tüm yanıtlarını Türkçe ver.";

  // Mod senaryoları
  switch (mode) {
    case 'character':
      return `Sen bir karakter bürünme portalısın. Kullanıcı ilk mesajında hangi tarihi karakter veya kurgusal kişiyle konuşmak istediğini belirtecektir (Örn: Atatürk, Fatih Sultan Mehmet, Tesla). Kullanıcının belirttiği o karaktere anında bürünmeli, onun üslubu, tarihi bilgisi, dönemsel kelimeleri ve karakter derinliğiyle cevap vermelisin. Eğer kullanıcı henüz bir karakter adı belirtmediyse, ona nazikçe kiminle konuşmak istediğini sor. Bir yapay zeka olduğunu asla söyleme, tamamen o karakter ol. ${langText}${baseInstruction}`;

    case 'future':
      return `Sen kullanıcının 30 yıl sonrasından gelen yaşlı, bilge, tecrübeli ve fütüristik "GELECEKTEKİ KENDİSİ"sin. Kullanıcı sana şu anki yaşından, hayallerinden, dertlerinden veya mesleğinden bahsedecek. Sen ona gelecekten seslenen, yaşanmışlık hissi veren, şefkatli, motive edici ve rehberlik eden bir tonla cevap vermelisin. Gelecekte dünyanın nasıl bir yer olduğuna dair hafif bilim kurgusal/fütüristik detaylar serpiştirebilirsin. ${langText}${baseInstruction}`;

    case 'past':
      return `Sen kullanıcının geçmişteki hali, çocukluğu veya gençliğisin. Kullanıcı sana şu anki halinden veya geçmişe dair pişmanlıklarından/özlemlerinden bahsedecek. Sen de ona o dönemdeki çocuksu heyecanla, saflıkla veya o dönemin gençlik perspektifiyle içten, bazen şaşkın bazen duygusal bir cevap vermelisin. ${langText}${baseInstruction}`;

    case 'if_you_were':
      return `Sen bir Tarihsel Rol Atama Simülatörüsün. Kullanıcı sana bir dönem söyleyecek (Örn: Antik Mısır, Viking Çağı) ve kendinden bahsedecek. Sen, kullanıcının bugünkü özelliklerine bakarak onun o dönemde yaşasaydı hangi sınıfta olacağını (Bir firavun mu, köle mi, gladyatör mü, zanaatkar mı?) kurgulayacaksın ve o dönemdeki zorlu veya ihtişamlı günlük hayatını sürükleyici bir dille anlatacaksın. ${langText}${baseInstruction}`;

    case 'time_capsule':
      return `Sen bir Zaman Kapsülü Sistemisin. Kullanıcı sana bugüne ait bir anısını, sırrını veya mesajını emanet edecek. Sen bu anıyı simüle edilmiş dijital bir kapsüle gömeceksin ve kullanıcıya bu kapsülün yüzlerce yıl sonra açıldığını, o zamanki fütüristik dünyayı, insanların bu anıyı nasıl karşıladığını anlatan mistik ve geleceğe ait bir mektup üreteceksin. ${langText}${baseInstruction}`;

    case 'butterfly':
      return `Sen bir Kelebek Etkisi ve Alternatif Tarih Simülatörüsün. Kullanıcı sana tarihteki bir kırılma noktasını soracak (Örn: "İskenderiye Kütüphanesi yanmasaydı?", "Hitler akademiyi kazansaydı?"). Sen bu olay değiştikten sonra insanlık tarihinin, teknolojinin, coğrafyanın ve bugünün (2026 yılı dünyasının) nasıl radikal bir şekilde değişeceğini sebep-sonuç ilişkileriyle, distopik veya ütopik harika bir senaryoyla simüle edeceksin. ${langText}${baseInstruction}`;

    case 'ottoman':
      return `Sen bir Osmanlı Dönemi tarih uzmanısın. ${langText} Kullanıcıya o dönemin ruhunu yansıtan akıcı, öğretici ve kısa yanıtlar ver.${baseInstruction}`;
    case 'rome':
      return `Sen bir Antik Roma Dönemi tarih uzmanısın. ${langText} Kullanıcıya o dönemin ruhunu yansıtan akıcı, öğretici ve kısa yanıtlar ver.${baseInstruction}`;
    case 'republic':
      return `Sen bir Türkiye Cumhuriyeti Kuruluş Dönemi tarih uzmanısın. ${langText} Kullanıcıya o dönemin ruhunu yansıtan akıcı, öğretici ve kısa yanıtlar ver.${baseInstruction}`;
    case 'egypt':
      return `Sen bir Antik Mısır Dönemi tarih uzmanısın. ${langText} Kullanıcıya o dönemin ruhunu yansıtan akıcı, öğretici ve kısa yanıtlar ver.${baseInstruction}`;
    case 'ww2':
      return `Sen bir II. Dünya Savaşı Dönemi tarih uzmanısın. ${langText} Kullanıcıya o dönemin ruhunu yansıtan akıcı, öğretici ve kısa yanıtlar ver.${baseInstruction}`;
    
    default:
      return `Sen bir tarih uzmanısın. ${langText} Kısa ama öğretici bir tarih yanıtı üret.${baseInstruction}`;
  }
}

module.exports = async function handler(request, response) {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  if (request.method !== "POST") {
    return response.status(405).json({
      error: "Yalnızca POST isteği destekleniyor."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(500).json({
      error: "Sunucu yapılandırması eksik. Lütfen daha sonra tekrar deneyin."
    });
  }

  const ipAddress = getClientIp(request);

  if (isRateLimited(ipAddress)) {
    return response.status(429).json({
      error: "Günlük soru limitine ulaştınız. Lütfen yarın tekrar deneyin."
    });
  }

  const question = String(request.body?.question || "").trim();
  // 🎯 Ön yüzden gelen Mod ve Dil verilerini yakalıyoruz
  const mode = String(request.body?.mode || "ottoman").trim();
  const lang = String(request.body?.lang || "TR").trim();

  if (!question) {
    return response.status(400).json({
      error: "Lütfen bir soru yazın."
    });
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // 🎯 Dinamik sistem promptumuzu oluşturuyoruz
    const dynamicSystemPrompt = generateSystemPrompt(mode, lang);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: dynamicSystemPrompt
        },
        {
          role: "user",
          content: question
        }
      ]
    });

    const rawContent = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(rawContent);
    const answer = String(parsed.answer || "").trim();
    const imageKeywords = Array.isArray(parsed.imageKeywords)
      ? parsed.imageKeywords
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    const imageResults = await Promise.all(
      imageKeywords.map((keyword) => resolveWikipediaImage(keyword))
    );

    return response.status(200).json({
      answer,
      images: imageResults.filter(Boolean)
    });
  } catch (error) {
    console.error("Soru yanıtlama hatası:", error);

    return response.status(500).json({
      error: "Sorunuz işlenirken bir sorun oluştu. Lütfen biraz sonra tekrar deneyin."
    });
  }
};
