# aitimewalk MVP Kurulum Rehberi

Bu proje, tarih sorularını Türkçe yanıtlayan ve ilgili Wikipedia görsellerini gösteren basit bir web uygulamasıdır. Aşağıdaki adımları teknik bilgisi sınırlı kullanıcılar için mümkün olduğunca net şekilde hazırladım.

## 1) GitHub'da yeni repo açın

1. [https://github.com](https://github.com) adresine giriş yapın.
2. Sağ üstten **New repository** seçin.
3. Repo adı olarak örneğin `aitimewalk-backend` yazın.
4. **Create repository** düğmesine tıklayın.

## 2) Bu klasörü GitHub'a gönderin

Bilgisayarınızda bu proje klasörünü açın ve terminalde aşağıdaki komutları çalıştırın. `GITHUB-KULLANICI-ADINIZ` ve gerekirse repo adını kendi bilgilerinizle değiştirin.

```bash
git add .
git commit -m "aitimewalk mvp"
git branch -M main
git remote add origin https://github.com/GITHUB-KULLANICI-ADINIZ/aitimewalk-backend.git
git push -u origin main
```

> Not: Eğer daha önce `origin` tanımlıysa, `git remote add origin ...` komutu hata verebilir. Bu durumda GitHub Desktop kullanabilir veya mevcut uzak depo ayarınızı kontrol edebilirsiniz.

## 3) Vercel üzerinde projeyi içe aktarın

1. [https://vercel.com](https://vercel.com) adresine gidin.
2. Hesabınıza giriş yapın.
3. **New Project** düğmesine tıklayın.
4. Az önce oluşturduğunuz GitHub reposunu bulun.
5. **Import** seçeneğine tıklayın.

## 4) Environment Variables alanına OpenAI anahtarını ekleyin

1. Vercel proje kurulum ekranında **Environment Variables** bölümünü açın.
2. Anahtar adı olarak `OPENAI_API_KEY` yazın.
3. Değer kısmına kendi OpenAI API anahtarınızı yapıştırın.
4. Kaydedin.

## 5) Deploy edin

1. **Deploy** düğmesine tıklayın.
2. Vercel birkaç dakika içinde projeyi yayına alacaktır.

## 6) Vercel adresinizi embed-snippet içine yazın

1. Yayın tamamlanınca size bir Vercel adresi verilir. Örnek: `https://aitimewalk-backend.vercel.app`
2. `public/embed-snippet.html` dosyasını açın.
3. `YOUR-VERCEL-URL` kısmını kendi proje adresinizle değiştirin.

Örnek:

```html
<iframe
  src="https://aitimewalk-backend.vercel.app/embed.html"
  width="100%"
  height="700"
  style="border:0; border-radius:24px; overflow:hidden;"
  loading="lazy"
  title="aitimewalk tarih soru-cevap aracı"
></iframe>
```

## 7) GoDaddy site düzenleyicide ekleyin

1. GoDaddy web sitesi düzenleyicisini açın.
2. Sayfanıza **Embed** veya **HTML** bileşeni ekleyin.
3. `public/embed-snippet.html` içindeki iframe kodunu kopyalayın.
4. Bu kodu GoDaddy içindeki ilgili alana yapıştırın.
5. Kaydedip yayınlayın.

## Uygulama ne yapar?

- Kullanıcıdan tarih sorusu alır.
- OpenAI ile Türkçe yanıt üretir.
- Konuyla ilgili 2-3 anahtar kelime çıkarır.
- Wikipedia üzerinden uygun görselleri bulup gösterir.

## Önemli notlar

- API anahtarını asla kodun içine yazmayın.
- Sadece Vercel ortam değişkeni olarak ekleyin.
- Günlük basit istek limiti aynı IP için 10 sorudur.
- CORS ayarı `https://aitimewalk.com` ve `http://localhost:*` için açıktır.
- 
