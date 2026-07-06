import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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
  const state = req.query.state; // idToken (opsional untuk mode tautkan akun)
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
    const db = getFirestore();
    let targetUid = discordId;

    if (state) {
      // MODE TAUTKAN AKUN (LINKING)
      try {
        const decodedToken = await getAuth().verifyIdToken(state);
        targetUid = decodedToken.uid;
        
        await db.collection('discord_links').doc(discordId).set({
          uid: targetUid,
          linkedAt: new Date().getTime()
        }, { merge: true });
        console.log(`✅ Berhasil menghubungkan Discord ${discordId} ke UID ${targetUid}`);
      } catch (verifyErr) {
        console.error('Invalid ID Token during linking:', verifyErr);
        return res.status(401).send('Gagal menghubungkan: Sesi tidak valid atau kedaluwarsa.');
      }
    } else {
      // MODE LOGIN BIASA
      const linkDoc = await db.collection('discord_links').doc(discordId).get();
      if (linkDoc.exists && linkDoc.data().uid) {
        targetUid = linkDoc.data().uid;
        console.log(`✅ Login via Discord ${discordId}, menggunakan UID asli ${targetUid}`);
      } else {
        targetUid = discordId; // Belum ditautkan, pakai discordId sebagai UID default
      }
    }

    const customToken = await getAuth().createCustomToken(targetUid);
    
    // Kembali ke frontend membawa token VIP
    res.redirect(`${BASE_URL}?token=${customToken}`);

  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.status(500).send('Internal Server Error during OAuth process');
  }
}
