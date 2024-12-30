import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

const userEmailElement = document.getElementById('user-email');
const userNameElement = document.getElementById('user-name'); // Add this element to your HTML
const logoutButton = document.getElementById('logout-button');

// Ensure the user is logged in, but exclude signup.html
if (window.location.pathname !== '/signup.html') {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Fetch user data from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userEmailElement) userEmailElement.textContent = userData.email;
        if (userNameElement) userNameElement.textContent = `${userData.firstName} ${userData.lastName}`; // Display full name
      } else {
        alert("No user data found!");
      }
    } else {
      // Redirect to login page if not logged in
      window.location.href = "/index.html";
    }
  });
}

// Logout functionality
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