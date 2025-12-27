// TheBestML Push Notification API
// Vercel Serverless Function

const admin = require('firebase-admin');

// Firebase Service Account
// - FIREBASE_SERVICE_ACCOUNT_B64: Base64(JSON)
// - FIREBASE_SERVICE_ACCOUNT: Raw JSON (tek satır)
const SERVICE_ACCOUNT_B64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '';
const SERVICE_ACCOUNT_RAW = process.env.FIREBASE_SERVICE_ACCOUNT || '';

// API Key (güvenlik için)
const API_KEY = process.env.API_KEY || "thebestml_push_secret_2024";

// Firebase Admin SDK başlat
let firebaseInitialized = false;

function initializeFirebase() {
    if (firebaseInitialized) {
        return true;
    }
    
    try {
        // Zaten initialize edilmiş mi kontrol et
        if (admin.apps.length > 0) {
            firebaseInitialized = true;
            return true;
        }
        
        let serviceAccountData;
        
        if (SERVICE_ACCOUNT_B64) {
            // Base64 encoded service account varsa decode et
            const decoded = Buffer.from(SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
            serviceAccountData = JSON.parse(decoded);
            console.log('Service account (B64) alındı, project_id:', serviceAccountData.project_id);
        } else if (SERVICE_ACCOUNT_RAW) {
            // Raw JSON service account
            serviceAccountData = JSON.parse(SERVICE_ACCOUNT_RAW);
            console.log('Service account (RAW) alındı, project_id:', serviceAccountData.project_id);
        } else {
            console.error('Firebase service account bulunamadı - FIREBASE_SERVICE_ACCOUNT_B64 veya FIREBASE_SERVICE_ACCOUNT env var boş');
            return false;
        }
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountData)
        });
        firebaseInitialized = true;
        console.log('Firebase Admin başlatıldı');
        return true;
    } catch (e) {
        console.error('Firebase başlatma hatası:', e.message);
        return false;
    }
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // API Key doğrulama (X-API-Key veya Authorization: Bearer)
    const apiKeyHeader = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];
    const bearerKey = (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer '))
        ? authHeader.slice('bearer '.length).trim()
        : null;
    const apiKey = apiKeyHeader || bearerKey;
    if (apiKey !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Firebase başlat
    if (!initializeFirebase()) {
        return res.status(500).json({ error: 'Firebase başlatılamadı' });
    }
    
    try {
        const { token, tokens, title, body, data, topic, all } = req.body;
        
        if (!title || !body) {
            return res.status(400).json({ error: 'title ve body zorunlu' });
        }
        
        // DATA PAYLOAD - tüm değerler STRING olmalı (FCM kuralı)
        // MyFirebaseMessagingService bu data'yı alıp bildirim gösterir
        const dataPayload = {};
        
        // Tüm değerleri string'e çevir
        dataPayload.title = String(title);
        dataPayload.body = String(body);
        dataPayload.type = String(data?.type || 'info');
        dataPayload.click_action = 'OPEN_APP';
        dataPayload.timestamp = String(Date.now());
        
        // Ek data varsa onları da string yap
        if (data) {
            Object.keys(data).forEach(key => {
                if (data[key] !== null && data[key] !== undefined) {
                    dataPayload[key] = String(data[key]);
                }
            });
        }

        const message = {
            // Notification payload - sistem tarafından gösterilir
            notification: {
                title: title,
                body: body
            },
            // Data payload - ek bilgiler için
            data: dataPayload,
            android: {
                priority: 'high',
                ttl: 86400 * 1000, // 24 saat (milisaniye)
                notification: {
                    channelId: 'thebestml_notifications',
                    priority: 'high',
                    defaultSound: true,
                    defaultVibrateTimings: true
                }
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert'
                },
                payload: {
                    aps: {
                        alert: {
                            title: title,
                            body: body
                        },
                        sound: 'default',
                        badge: 1,
                        'content-available': 1
                    }
                }
            }
        };
        
        let response;

        // Server-side: tüm kullanıcılara gönder (Firestore'dan token çek)
        if (all === true) {
            const snapshot = await admin.firestore().collection('users').get();
            const allTokens = [];

            snapshot.forEach(doc => {
                const d = doc.data() || {};
                if (d.fcmToken && typeof d.fcmToken === 'string' && d.fcmToken.length > 20) {
                    allTokens.push(d.fcmToken);
                }
            });

            const uniqueTokens = Array.from(new Set(allTokens));
            if (uniqueTokens.length === 0) {
                return res.status(200).json({
                    success: false,
                    error: 'No tokens',
                    message: 'FCM token\'ı olan kullanıcı yok'
                });
            }

            let successCount = 0;
            let failureCount = 0;
            const batchResponses = [];

            for (let i = 0; i < uniqueTokens.length; i += 500) {
                const batch = uniqueTokens.slice(i, i + 500);
                message.tokens = batch;
                const batchResp = await admin.messaging().sendEachForMulticast(message);
                batchResponses.push({
                    index: i,
                    size: batch.length,
                    successCount: batchResp.successCount,
                    failureCount: batchResp.failureCount
                });
                successCount += batchResp.successCount;
                failureCount += batchResp.failureCount;
            }

            return res.status(200).json({
                success: true,
                message: 'Bildirim gönderildi',
                audience: 'all',
                totalTokens: uniqueTokens.length,
                successCount,
                failureCount,
                batches: batchResponses
            });
        }
        
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
            return res.status(400).json({ error: 'token, tokens, topic veya all gerekli' });
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
