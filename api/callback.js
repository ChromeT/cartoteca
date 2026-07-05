import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Inisialisasi Firebase Admin di Vercel menggunakan Environment Variable
if (!getApps().length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('✅ Firebase Admin SDK initialized inside Vercel API.');
    } else {
      console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON is missing in Vercel Environment Variables.');
    }
  } catch (err) {
    console.error('Firebase Admin Initialization Error:', err);
  }
}

export default async function handler(req, res) {
  const code = req.query.code;
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
  
  // URL saat ini (contoh: https://cartoteca.vercel.app atau http://localhost:5173)
  const BASE_URL = process.env.VITE_APP_URL || 'http://localhost:5173';
  const DISCORD_REDIRECT_URI = `${BASE_URL}/api/callback`;

  if (!code) return res.status(400).send('No code provided');

  if (!getApps().length) {
    return res.status(500).send('Firebase Admin is not configured. Please add FIREBASE_SERVICE_ACCOUNT_JSON to Vercel.');
  }

  try {
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: DISCORD_REDIRECT_URI
    });

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      return res.status(400).send(`Discord Error: ${tokenData.error_description || tokenData.error}`);
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    const userData = await userResponse.json();
    
    if (!userData || !userData.id) {
      return res.status(400).send('Failed to fetch Discord user profile');
    }

    const discordId = userData.id;

    // Optional: Kita tidak bisa langsung menyimpan profil ke db dari sini tanpa import firestore,
    // tapi kita cukup mencetak token. Firestore sync bisa dilakukan dari Frontend setelah berhasil masuk.
    const customToken = await getAuth().createCustomToken(discordId);
    
    // Kembali ke frontend membawa oleh-oleh berupa token VIP
    res.redirect(`${BASE_URL}?token=${customToken}`);

  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.status(500).send('Internal Server Error during OAuth process');
  }
}
