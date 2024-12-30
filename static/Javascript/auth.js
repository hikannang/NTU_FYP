import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Sign-up functionality
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    try {
      // Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Store user data in Firestore
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        role: "user", // Default role is "user"
        createdAt: new Date()
      });

      alert('Signup successful! Welcome, ' + user.email);
      signupForm.reset();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });
}

// Login functionality
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      // Log in the user
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Fetch user role from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.role === "admin") {
          // Redirect to admin dashboard
          window.location.href = "/admin-dashboard.html";
        } else {
          // Redirect to user dashboard
          window.location.href = "/user-dashboard.html";
        }
      } else {
        alert("No user data found!");
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });
}

// Logout functionality
const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await signOut(auth);
      alert('Logged out successfully!');
      window.location.href = "/index.html"; // Redirect to login page
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });
}