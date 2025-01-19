// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBvSNS37RNg1L1hO7u76z1N_4pEExKbjhU",
    authDomain: "bao-car-liao.firebaseapp.com",
    projectId: "bao-car-liao",
    storageBucket: "bao-car-liao.firebasestorage.app",
    messagingSenderId: "584996100412",
    appId: "1:584996100412:web:b072712450169f6ec02639",
    measurementId: "G-G6XF2JEWPV"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const signupForm = document.getElementById('signup-form');

signupForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      // Signed up successfully
      const user = userCredential.user;
      alert('Signup successful! Welcome, ' + user.email);
      signupForm.reset();
    })
    .catch((error) => {
      // Handle errors
      alert('Error: ' + error.message);
    });
});

const loginForm = document.getElementById('login-form');

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      // Logged in successfully
      const user = userCredential.user;
      alert('Login successful! Welcome back, ' + user.email);
      loginForm.reset();
    })
    .catch((error) => {
      // Handle errors
      alert('Error: ' + error.message);
    });
});