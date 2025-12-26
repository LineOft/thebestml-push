# TheBestML Push Notification Server

Vercel üzerinde çalışan ücretsiz push notification sunucusu.

## Kurulum

### 1. Vercel Hesabı Oluştur
- https://vercel.com adresine git
- GitHub hesabınla giriş yap

### 2. Firebase Service Account Oluştur
1. Firebase Console'a git: https://console.firebase.google.com
2. Projenizi seçin
3. ⚙️ Ayarlar > Proje Ayarları > Hizmet Hesapları
4. "Yeni özel anahtar oluştur" butonuna tıkla
5. JSON dosyasını indir

### 3. Vercel'e Deploy Et

```bash
cd push-server
npm install -g vercel
vercel login
vercel
```

### 4. Environment Variables Ayarla
Vercel Dashboard'da:
1. Projenizi seçin
2. Settings > Environment Variables
3. Şu değişkenleri ekleyin:

- `FIREBASE_SERVICE_ACCOUNT`: İndirdiğiniz JSON dosyasının içeriği (tek satır)
- `API_KEY`: Güvenlik için rastgele bir key (örn: `thebestml_push_2024_secret`)

### 5. API Kullanımı

```javascript
// Tek kullanıcıya bildirim
fetch('https://your-project.vercel.app/api/send-notification', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'your_api_key'
    },
    body: JSON.stringify({
        token: 'user_fcm_token',
        title: '🎉 Siparişiniz Onaylandı!',
        body: 'Key aktif edildi',
        data: { type: 'order_approved' }
    })
});

// Tüm kullanıcılara bildirim (topic)
fetch('https://your-project.vercel.app/api/send-notification', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'your_api_key'
    },
    body: JSON.stringify({
        topic: 'all_users',
        title: '📢 Duyuru',
        body: 'Yeni güncelleme yayınlandı!'
    })
});
```

## Güvenlik
- API_KEY header'ı zorunludur
- CORS tüm origin'lere açıktır (admin panelden kullanmak için)
