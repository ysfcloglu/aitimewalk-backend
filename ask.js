const OpenAI = require("openai");
const DAILY_LIMIT_FREE = 3;
const DAILY_LIMIT_PREMIUM = 1000; // pratikte sınırsız; çok yüksek bir tavan
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

function isRateLimited(ipAddress, dailyLimit) {
  const dayKey = getUtcDayKey();
  const existing = rateLimitStore.get(ipAddress);
  if (!existing || existing.dayKey !== dayKey) {
    rateLimitStore.set(ipAddress, { dayKey, count: 1 });
    return false;
  }
  if (existing.count >= dailyLimit) return true;
  existing.count += 1;
  rateLimitStore.set(ipAddress, existing);
  return false;
}

// Premium kullanıcılar için zenginleştirilmiş sistem prompt'u.
// Kullanıcının gönderdiği `system` alanı varsa onu temel alır,
// ama üstüne karakter canlandırma / atmosfer / detay talimatları ekler.
function buildPremiumSystemPrompt(baseSystemPrompt) {
  return `${baseSystemPrompt}

Sen gelişmiş bir tarihsel zaman yolculuğu deneyimi sunan bir yapay zekâsın. Premium modda olduğun için yanıtların standart moddan çok daha zengin ve sürükleyici olmalı. Şu kurallara uy:

1. Mümkün olduğunda, konuşulan döneme veya kişiye ait bir karakterin ağzından, o döneme uygun bir üslup ve ses tonuyla yanıt ver (resmiyet, deyimler, dönemsel referanslar gibi detaylarla).
2. Sadece kuru bilgi verme; küçük duyusal ve atmosferik detaylar ekle (dönemin sesleri, kokuları, günlük yaşamı, insanların o olaya nasıl tepki verdiği gibi).
3. Tarihsel doğruluğa özen göster; bilinmeyen veya tartışmalı noktalarda bunu açıkça belirt, asla kesin gibi sunma.
4. Yanıtların standart moda kıyasla daha detaylı ve katmanlı olsun, ama gereksiz uzatma yapma; her cümle bir şey katmalı.
5. Kullanıcı bir senaryo veya karakterle konuşma isterse, o karaktere tutarlı bir şekilde bürün ve diyaloğu canlı tut.
6. Türkçe yanıt ver.`;
}

module.exports = async function handler(request, response) {
  setCorsHeaders(request, response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Yalnızca POST isteği destekleniyor." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return response.status(500).json({ error: "Sunucu yapılandırması eksik." });
  }

  // Not: isPremium şu an istemci (frontend) tarafından gönderiliyor ve
  // sunucu tarafında doğrulanmıyor. Bu, ileride backend'de gerçek bir
  // abonelik kontrolüyle değiştirilmeli (bkz. konuşmamızdaki güvenlik notu).
  const isPremium = Boolean(request.body?.isPremium);

  const ipAddress = getClientIp(request);
  const dailyLimit = isPremium ? DAILY_LIMIT_PREMIUM : DAILY_LIMIT_FREE;
  if (isRateLimited(ipAddress, dailyLimit)) {
    return response.status(429).json({ error: "Günlük soru limitine ulaştınız. Lütfen yarın tekrar deneyin." });
  }

  const question = String(request.body?.question || "").trim();
  const rawSystemPrompt = String(request.body?.system || "Sen yardımcı bir tarih uzmanısın. Türkçe yanıt ver.").trim();
  if (!question) {
    return response.status(400).json({ error: "Lütfen bir soru yazın." });
  }

  const history = Array.isArray(request.body?.history) ? request.body.history : [];

  const systemPrompt = isPremium ? buildPremiumSystemPrompt(rawSystemPrompt) : rawSystemPrompt;
  const model = isPremium ? "gpt-4o" : "gpt-4o-mini";
  const temperature = isPremium ? 0.9 : 0.7;
  const maxTokens = isPremium ? 900 : 400;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const messages = [
      ...history,
      { role: "user", content: question }
    ];
    const completion = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ]
    });
    const answer = completion.choices?.[0]?.message?.content || "Bir hata oluştu.";
    return response.status(200).json({ answer, model, isPremium });
  } catch (error) {
    console.error("Soru yanıtlama hatası:", error);
    return response.status(500).json({ error: "Sorunuz işlenirken bir sorun oluştu. Lütfen biraz sonra tekrar deneyin." });
  }
};
