import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// TODO: Ganti dengan kredensial Firebase Project milik Anda sendiri
// Konfigurasi ini bisa didapatkan dari Console Firebase -> Project Settings -> General -> Web Apps
const firebaseConfig = {
  apiKey: "AIzaSyBXAjaBrB8eAyMajlCvVJe_9prohjk3EJk",
  authDomain: "cartoteca-666.firebaseapp.com",
  projectId: "cartoteca-666",
  storageBucket: "cartoteca-666.firebasestorage.app",
  messagingSenderId: "49269578015",
  appId: "1:49269578015:web:00375818ad112e0173382a",
  measurementId: "G-4126PD132D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
// Gunakan long-polling untuk mengatasi masalah blocking WebChannel (misal: di Firefox ETP / uBlock)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;
