// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-functions.js";

// Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBvSNS37RNg1L1hO7u76z1N_4pEExKbjhU",
  authDomain: "bao-car-liao.firebaseapp.com",
  projectId: "bao-car-liao",
  storageBucket: "bao-car-liao.appspot.com", 
  messagingSenderId: "584996100412",
  appId: "1:584996100412:web:b072712450169f6ec02639",
  measurementId: "G-G6XF2JEWPV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Export Firebase services
export { auth, db, storage, functions };