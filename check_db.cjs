const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { readFileSync } = require('fs');

const serviceAccount = JSON.parse(readFileSync('c:\\Users\\Administrator\\Downloads\\cartoteca-666-firebase-adminsdk-fbsvc-df0f8829b1.json'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function checkDatabase() {
  console.log("=== FIREBASE DIAGNOSTIC ===");
  
  const usersSnapshot = await db.collection('users').get();
  console.log(`Found ${usersSnapshot.size} user(s) in database.`);
  
  for (const userDoc of usersSnapshot.docs) {
    console.log(`\n--- User UID: ${userDoc.id} ---`);
    console.log("User Data:", userDoc.data());
    
    // Check Profile
    const profileDoc = await db.collection('users').doc(userDoc.id).collection('profile').doc('current').get();
    if (profileDoc.exists) {
      console.log(`[OK] Profile found:`, profileDoc.data());
    } else {
      console.log(`[MISSING] No profile/current found!`);
    }
    
    // Check Inventory
    const invDoc = await db.collection('users').doc(userDoc.id).collection('inventory').doc('current').get();
    if (invDoc.exists) {
      console.log(`[OK] Inventory found:`, invDoc.data());
    } else {
      console.log(`[MISSING] No inventory/current found!`);
    }
    
    // Check Cards
    const cardsSnapshot = await db.collection('users').doc(userDoc.id).collection('cards').limit(5).get();
    console.log(`[CARDS] Found ${cardsSnapshot.size} cards (showing max 5).`);
    cardsSnapshot.forEach(doc => {
      console.log(`  -> Card ID: ${doc.id} | Code: ${doc.data().code || 'N/A'} | Name: ${doc.data().name}`);
    });
  }
}

checkDatabase().catch(console.error);
