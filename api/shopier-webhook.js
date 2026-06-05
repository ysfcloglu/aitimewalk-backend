export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    
    // Shopier'dan gelen ödeme bildirimini kontrol et
    const orderId = body.ORDER_ID || body.order_id;
    const status = body.status || body.STATUS;
    const buyerEmail = body.buyer_email || body.BUYER_EMAIL;
    const amount = body.total_order_value || body.TOTAL_ORDER_VALUE;

    // Ödeme başarılıysa
    if (status === '1' || status === 'success' || status === 'completed') {
      // Buraya veritabanı veya başka bir kayıt sistemi eklenebilir
      // Şimdilik başarılı yanıt dönüyoruz
      console.log('Başarılı ödeme:', { orderId, buyerEmail, amount });
      
      return res.status(200).json({ 
        success: true,
        message: 'Ödeme alındı',
        email: buyerEmail
      });
    }

    return res.status(200).json({ success: false, message: 'Ödeme tamamlanmadı' });

  } catch (error) {
    console.error('Webhook hatası:', error);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
