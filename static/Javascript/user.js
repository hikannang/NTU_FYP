import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

const userEmailElement = document.getElementById('user-email');
const userNameElement = document.getElementById('user-name'); // Add this element to your HTML
const userPhoneElement = document.getElementById('user-phone'); // Add this element to your HTML
const userLicenseElement = document.getElementById('user-license'); // Add this element to your HTML
const userAddressElement = document.getElementById('user-address'); // Add this element to your HTML
const logoutButton = document.getElementById('logout-button');

// Ensure the user is logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Fetch user data from Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      userEmailElement.textContent = userData.email;
      userNameElement.textContent = `${userData.firstName} ${userData.lastName}`; // Display full name
      userPhoneElement.textContent = userData.phone; // Display phone number
      userLicenseElement.textContent = `License: ${userData.licenseNumber}, Issued: ${userData.licenseIssueDate}`; // Display license info
      userAddressElement.textContent = userData.address; // Display address
    } else {
      alert("No user data found!");
    }
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