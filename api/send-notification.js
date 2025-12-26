// TheBestML Push Notification API
// Vercel Serverless Function

const admin = require('firebase-admin');

// Firebase Admin SDK başlat (environment variables'dan)
let firebaseApp;

function initializeFirebase() {
    if (!firebaseApp) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
            
            if (!serviceAccount.project_id) {
                console.error('Firebase service account bulunamadı');
                return false;
            }
            
            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('Firebase Admin başlatıldı');
        } catch (e) {
            console.error('Firebase başlatma hatası:', e);
            return false;
        }
    }
    return true;
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // API Key doğrulama
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Firebase başlat
    if (!initializeFirebase()) {
        return res.status(500).json({ error: 'Firebase başlatılamadı' });
    }
    
    try {
        const { token, tokens, title, body, data, topic } = req.body;
        
        if (!title || !body) {
            return res.status(400).json({ error: 'title ve body zorunlu' });
        }
        
        const message = {
            notification: {
                title: title,
                body: body
            },
            data: data || {},
            android: {
                priority: 'high',
                notification: {
                    channelId: 'thebestml_notifications',
                    priority: 'high',
                    defaultVibrateTimings: true,
                    defaultSound: true
                }
            }
        };
        
        let response;
        
        if (topic) {
            // Topic'e gönder (tüm kullanıcılara)
            message.topic = topic;
            response = await admin.messaging().send(message);
            console.log('Topic bildirimi gönderildi:', response);
        } else if (tokens && Array.isArray(tokens) && tokens.length > 0) {
            // Birden fazla token'a gönder
            message.tokens = tokens;
            response = await admin.messaging().sendEachForMulticast(message);
            console.log('Çoklu bildirim gönderildi:', response.successCount, 'başarılı');
        } else if (token) {
            // Tek token'a gönder
            message.token = token;
            response = await admin.messaging().send(message);
            console.log('Tek bildirim gönderildi:', response);
        } else {
            return res.status(400).json({ error: 'token, tokens veya topic gerekli' });
        }
        
        return res.status(200).json({ 
            success: true, 
            response: response,
            message: 'Bildirim gönderildi'
        });
        
    } catch (error) {
        console.error('Bildirim gönderme hatası:', error);
        return res.status(500).json({ 
            error: 'Bildirim gönderilemedi', 
            details: error.message 
        });
    }
};
