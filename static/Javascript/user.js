import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

const userEmailElement = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');

// Ensure the user is logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Display the user's email
    userEmailElement.textContent = user.email;
  } else {
    // Redirect to login page if not logged in
    window.location.href = "/index.html";
  }
});

// Logout functionality
logoutButton.addEventListener('click', async () => {
  try {
    await signOut(auth);
    alert('Logged out successfully!');
    window.location.href = "/index.html"; // Redirect to login page
  } catch (error) {
    alert('Error: ' + error.message);
  }
});