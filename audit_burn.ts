import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import * as readline from "readline";

const firebaseConfig = {
  apiKey: "AIzaSyBXAjaBrB8eAyMajlCvVJe_9prohjk3EJk",
  authDomain: "cartoteca-666.firebaseapp.com",
  projectId: "cartoteca-666",
  storageBucket: "cartoteca-666.firebasestorage.app",
  messagingSenderId: "49269578015",
  appId: "1:49269578015:web:00375818ad112e0173382a",
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {});
const auth = getAuth(app);

const burnCodes = [
  "vlnb5mf", "vlnh7gs", "vln8jg0", "vln43gz", "vln7l7j", "vln8j42", "vln2m1d",
  "vln206z", "vlnhh61", "vln5561", "vlnfwh7", "vlnrhgr", "vln88l4", "vlnpflg", "vln5nm8",
  "vlnktb8", "vlnvf36", "vln5fth", "vlnbs89", "vlnqs6x", "vlnqd81", "vlnbd8q", "vln2wj2",
  "vlnbwrn", "vln02pq", "vln8jc8", "vln7xgb", "vlnnx0s", "vlnp5kg", "vln14qn", "vln0s7g",
  "vln5lnl", "vlnlq26", "vlnjkzt", "vln83gc"
];

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log(`\n🔍 CARTOTECA BURN AUDIT`);
  console.log(`Checking ${burnCodes.length} card codes from your ktag burn command...\n`);
  
  const email = await ask("📧 Email akun Cartoteca Anda: ");
  const password = await ask("🔑 Password: ");
  
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;
    console.log(`\n✅ Login berhasil! UID: ${uid}\n`);
    
    const cardsSnap = await getDocs(collection(db, 'users', uid, 'cards'));
    const allCards: any[] = [];
    cardsSnap.forEach(d => allCards.push({ id: d.id, ...d.data() }));
    
    console.log(`📊 Total cards in database: ${allCards.length}\n`);
    
    const ghostCards = allCards.filter(c => burnCodes.includes(c.code?.toLowerCase()));
    const missingFromBurn = burnCodes.filter(code => !allCards.find(c => c.code?.toLowerCase() === code));
    
    console.log(`🔥 === GHOST CARDS (burn-tagged tapi MASIH di database) ===`);
    if (ghostCards.length === 0) {
      console.log("✅ Tidak ada! Semua kartu burn sudah terhapus dengan benar.\n");
    } else {
      console.log(`⚠️  Ditemukan ${ghostCards.length} kartu hantu:\n`);
      ghostCards.forEach(c => {
        console.log(`  🗑️  ${c.code} | ${c.name} | ${c.series} | ${c.condition}`);
      });
      console.log();
    }
    
    console.log(`✅ === SUDAH TERHAPUS DENGAN BENAR ===`);
    console.log(`  ${missingFromBurn.length} dari ${burnCodes.length} kartu sudah terhapus.\n`);
    
    // Cards with burn tag  
    const burnTagged = allCards.filter(c => c.tags && c.tags.toLowerCase().includes('burn'));
    if (burnTagged.length > 0) {
      console.log(`🏷️  === KARTU DENGAN TAG "burn" MASIH DI DATABASE ===`);
      console.log(`  Ditemukan ${burnTagged.length} kartu:\n`);
      burnTagged.forEach(c => {
        console.log(`  🗑️  ${c.code} | ${c.name} | ${c.series} | ${c.condition}`);
      });
    } else {
      console.log(`🏷️  Tidak ada kartu dengan tag "burn" di database.`);
    }
    
  } catch (err: any) {
    console.error("❌ Error:", err.message);
  }
  
  process.exit(0);
}

main();
