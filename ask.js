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
  if (existing.count >= DAILY_LIMIT) return true;
  existing.count += 1;
  rateLimitStore.set(ipAddress, existing);
  return false;
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

  const ipAddress = getClientIp(request);
  if (isRateLimited(ipAddress)) {
    return response.status(429).json({ error: "Günlük soru limitine ulaştınız. Lütfen yarın tekrar deneyin." });
  }

  const question = String(request.body?.question || "").trim();
  const systemPrompt = String(request.body?.system || "Sen yardımcı bir tarih uzmanısın. Türkçe yanıt ver.").trim();

  if (!question) {
    return response.status(400).json({ error: "Lütfen bir soru yazın." });
  }

  const history = Array.isArray(request.body?.history) ? request.body.history : [];

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const messages = [
      ...history,
      { role: "user", content: question }
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ]
    });

    const answer = completion.choices?.[0]?.message?.content || "Bir hata oluştu.";

    return response.status(200).json({ answer });
  } catch (error) {
    console.error("Soru yanıtlama hatası:", error);
    return response.status(500).json({ error: "Sorunuz işlenirken bir sorun oluştu. Lütfen biraz sonra tekrar deneyin." });
  }
};
