import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('c:\\Users\\Administrator\\Downloads\\cartoteca-666-firebase-adminsdk-fbsvc-df0f8829b1.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function migrateCards() {
  console.log('🤖 Memulai Operasi Sapu Bersih Database...');
  let migratedCount = 0;

  try {
    const usersSnapshot = await db.collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const cardsSnapshot = await db.collection('users').doc(uid).collection('cards').get();
      
      for (const cardDoc of cardsSnapshot.docs) {
        const docId = cardDoc.id;
        const cardData = cardDoc.data();
        
        // Deteksi jika ID Dokumen (Acak) TIDAK SAMA dengan Kode Kartu aslinya
        if (cardData.code && docId !== cardData.code) {
          console.log(`⚠️ Menemukan Kartu Terlantar: Nama [${cardData.name || 'Unknown'}] - Kode Asli [${cardData.code}] namun bersembunyi di ID Acak [${docId}]`);
          
          const correctDocRef = db.collection('users').doc(uid).collection('cards').doc(cardData.code);
          const correctDoc = await correctDocRef.get();
          
          if (correctDoc.exists) {
            console.log(`   ✅ ID Asli sudah ada. Menggabungkan data (Merge)...`);
            await correctDocRef.set(cardData, { merge: true });
          } else {
            console.log(`   ✨ Memindahkan kartu ke ID Asli (${cardData.code})...`);
            await correctDocRef.set(cardData);
          }
          
          console.log(`   🗑️ Menghapus ID Acak Lama (${docId})...\n`);
          await db.collection('users').doc(uid).collection('cards').doc(docId).delete();
          migratedCount++;
        }
      }
    }
    console.log(`🎉 Operasi Selesai! Sebanyak ${migratedCount} kartu ber-ID acak berhasil dibersihkan dan diselamatkan!`);
    process.exit(0);
  } catch (error) {
    console.error('Terjadi kesalahan:', error);
    process.exit(1);
  }
}

migrateCards();
