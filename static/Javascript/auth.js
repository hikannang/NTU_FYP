import { auth } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Sign-up functionality
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        alert('Signup successful! Welcome, ' + user.email);
        signupForm.reset();
      })
      .catch((error) => {
        alert('Error: ' + error.message);
      });
  });
}

// Login functionality
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        alert('Login successful! Welcome back, ' + user.email);
        loginForm.reset();
      })
      .catch((error) => {
        alert('Error: ' + error.message);
      });
  });
}

// Logout functionality
const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    signOut(auth)
      .then(() => {
        alert('Logged out successfully!');
        window.location.href = "/index.html"; // Redirect to login page
      })
      .catch((error) => {
        alert('Error: ' + error.message);
      });
  });
}