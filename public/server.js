import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';

dotenv.config();

const app = express();
// Render ve Vercel'den gelecek isteklere tam izin vermek için cors ayarı
app.use(cors({ origin: '*' }));
app.use(express.json());

// Port ayarı (Render kendisi otomatik port atar, bulamazsa 5000 kullanır)
const PORT = process.env.PORT || 5000;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Kullanıcı veritabanı simülasyonu (Bellekte tutulur)
const users = {};

// Kullanıcı durumunu kontrol eden uç nokta
app.post('/api/status', (req, res) => {
    const { userId } = req.body;
    if (!users[userId]) {
        users[userId] = { remainingQuestions: 10, isPremium: false };
    }
    res.json(users[userId]);
});

// Ödeme onaylama (Checkout) uç noktası
app.post('/api/checkout', (req, res) => {
    const { userId } = req.body;
    if (!users[userId]) {
        users[userId] = { remainingQuestions: 0, isPremium: false };
    }
    users[userId].isPremium = true;
    users[userId].remainingQuestions = 999999;
    
    res.json({ success: true, message: "Ödeme onaylandı! Premium mod aktif.", status: users[userId] });
});

// OpenAI Sohbet uç noktası
app.post('/api/chat', async (req, res) => {
    const { userId, query, eraId } = req.body;

    if (!users[userId]) {
        users[userId] = { remainingQuestions: 10, isPremium: false };
    }

    const user = users[userId];

    // Premium kontrolü
    if (!user.isPremium && user.remainingQuestions <= 0) {
        return res.status(429).json({ error: "Ücretsiz haklarınız bitti! Lütfen Premium'a geçiş yapın." });
    }

    // Dönem bazlı sistem talimatları (Promptlar)
    let systemPrompt = "Sen bir zaman yolculuğu rehberisin.";
    if (eraId === 'antik_misir') systemPrompt = "Sen Antik Mısır döneminde yaşayan bir bilgesin. Kullanıcıya o dönemin gizemlerini, piramitleri ve firavunları anlat.";
    if (eraId === 'ai_karakterler') systemPrompt = "Sen gelecekten gelen gelişmiş bir yapay zekasın. Kullanıcıyla teknoloji ve bilim kurgu üzerine konuş.";
    if (eraId === 'gelecekteki_ben') systemPrompt = "Sen kullanıcının 30 yıl sonraki halisin. Ona olgun, deneyimli ve bilgece tavsiyeler ver.";
    if (eraId === 'gecmisteki_ben') systemPrompt = "Sen kullanıcının çocukluk halisin. Ona saf, meraklı ve nostaljik bir dille cevap ver.";
    if (eraId === 'istedigin_karakterler') systemPrompt = "Kullanıcı tarihten veya kurgudan bir karakter seçti. Sen o karakterin kişiliğine bürünerek cevap ver.";
    if (eraId === 'kelebek_etkisi') systemPrompt = "Kullanıcı geçmişte bir şeyi değiştirdi. Sen bu değişikliğin gelecekte yaratacağı büyük zincirleme sonuçları (Kelebek Etkisini) simüle et.";
    if (eraId === 'zaman_kapsulu') systemPrompt = "Kullanıcı geleceğe bir not bırakıyor. Sen bu notu saklayan bir zaman kapsülü yapay zekasısın.";
    if (eraId === 'tarihte_ben_olsaydim') systemPrompt = "Kullanıcı tarihi bir olayda lider olsaydı ne olurdu? Sen onun kararlarına göre alternatif tarihi şekillendir.";
    if (eraId === 'kendi_senaryon') systemPrompt = "Kullanıcının yazdığı özel zaman senaryosunu canlandır ve onunla rol yapma (roleplay) oyna.";
    if (eraId === 'buyuk_patlama') systemPrompt = "Sen evrenin başlangıcındaki kozmik enerjisin. Kullanıcıya atomların, yıldızların ve zamanın başlangıcını anlat.";
    if (eraId === 'paralel_evren') systemPrompt = "Kullanıcı başka bir boyuta sıçradı. Ona tarihin tamamen farklı aktığı fantastik bir paralel evreni tasvir et.";
    if (eraId === 'karki_carki') systemPrompt = "Kullanıcıyı rastgele tehlikeli bir çağın ortasına fırlattın. Nerede olduğunu tahmin etmesini sağla.";

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query }
            ]
        });

        if (!user.isPremium) {
            user.remainingQuestions -= 10; // Her soruda hak azalt
        }

        res.json({
            reply: completion.choices[0].message.content,
            remainingQuestions: user.remainingQuestions,
            isPremium: user.isPremium
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "OpenAI sunucusuyla iletişim kurulurken bir hata oluştu." });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});