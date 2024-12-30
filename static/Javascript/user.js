import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Wait for the user to be authenticated
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // User is signed in, fetch their data from Firestore
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log("User data from Firestore:", userData);

      // Update the welcome message with the user's full name
      const fullName = `${userData.firstName} ${userData.lastName}`;
      document.getElementById("user-full-name").textContent = fullName;
    } else {
      console.error("No user document found in Firestore!");
      alert("Error: User data not found. Please contact support.");
    }
  } else {
    // User is not signed in, redirect to login page
    window.location.href = "/index.html";
  }
});

// Logout functionality
const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await signOut(auth);
      alert("You have been logged out.");
      window.location.href = "/index.html"; // Redirect to login page
    } catch (error) {
      console.error("Error during logout:", error);
      alert("Logout failed: " + error.message);
    }
  });
}