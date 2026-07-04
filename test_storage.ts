import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
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
const auth = getAuth(app);
const storage = getStorage(app);

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function testUpload() {
  const email = await ask("Email: ");
  const password = await ask("Password: ");
  
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    console.log("Logged in:", userCred.user.uid);
    
    const storageRef = ref(storage, `users/${userCred.user.uid}/test.txt`);
    console.log("Uploading test file...");
    await uploadString(storageRef, "Hello World");
    
    console.log("Upload successful!");
    const url = await getDownloadURL(storageRef);
    console.log("URL:", url);
    
  } catch (err: any) {
    console.error("Upload failed!");
    console.error(err.code);
    console.error(err.message);
  }
  process.exit(0);
}

testUpload();
