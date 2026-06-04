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

  if (!question) {
    return response.status(400).json({
      error: "Lütfen bir soru yazın."
    });
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Sen bir tarih uzmanısın. Tüm yanıtlarını Türkçe ver. Kısa ama öğretici bir tarih yanıtı üret. Yalnızca geçerli JSON döndür ve biçim şu olsun: {"answer":"string","imageKeywords":["string","string"]}. imageKeywords alanında konuya uygun 2 veya 3 adet görsel arama terimi ver.'
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