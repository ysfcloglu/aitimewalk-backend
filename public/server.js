// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const userSessions = {};

function initSession(userId) {
    if (!userSessions[userId]) {
        userSessions[userId] = { remainingQuestions: 10, isPremium: false };
    }
    return userSessions[userId];
}

app.post('/api/status', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId gerekli.' });
    res.json(initSession(userId));
});

app.post('/api/chat', async (req, res) => {
    const { userId, query, eraId, lang } = req.body;
    
    if (!userId || !query || !eraId) {
        return res.status(400).json({ error: 'Eksik parametre.' });
    }

    const session = initSession(userId);

    if (eraId === 'future' && !session.isPremium) {
        return res.status(403).json({ 
            error: lang === 'TR' ? 'Bu boyut sadece Premium üyeler içindir!' : 'This dimension is for Premium members only!' 
        });
    }
    if (!session.isPremium && session.remainingQuestions <= 0) {
        return res.status(429).json({ 
            error: lang === 'TR' ? 'Günlük ücretsiz portal hakkınız doldu!' : 'Your daily free portal limit has expired!' 
        });
    }

    try {
        const systemInstruction = `
            Sen AITimeWalk platformunda bir zaman portalısın. 
            Seçilen Dönem/Boyut: ${eraId}.
            Yanıt vereceğin dil: ${lang === 'TR' ? 'Türkçe' : 'İngilizce'}.
            Görevin: Kullanıcıya seçilen dönemin ruhuna, tarihi gerçeklerine veya atmosferine uygun, sürükleyici ve gizemli bir şekilde yanıt vermek. Yapay zeka gibi değil, o zaman diliminin içinden konuşan bir anlatıcı gibi konuş. Yanıtları çok uzun tutma.
        `;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: query }
            ],
            max_tokens: 500,
            temperature: 0.7
        });

        if (!session.isPremium) {
            session.remainingQuestions--;
        }

        res.json({
            reply: completion.choices[0].message.content,
            remainingQuestions: session.remainingQuestions,
            isPremium: session.isPremium
        });

    } catch (error) {
        console.error('OpenAI Hatası:', error);
        res.status(500).json({ error: 'Portal dalgalanması yaşandı (OpenAI hatası), lütfen tekrar deneyin.' });
    }
});

app.post('/api/checkout', (req, res) => {
    const { userId, cardHolder, cardNumber } = req.body;
    if (!userId || !cardHolder || !cardNumber) {
        return res.status(400).json({ success: false, error: 'Eksik kart bilgileri.' });
    }

    const session = initSession(userId);
    session.isPremium = true;
    session.remainingQuestions = 999999;

    res.json({ 
        success: true, 
        message: 'Ödeme başarıyla alındı. OpenAI Premium aktif!',
        isPremium: session.isPremium
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`OpenAI destekli sunucu ${PORT} portunda aktif.`));