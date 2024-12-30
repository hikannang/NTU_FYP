import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Signup functionality
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent the form from refreshing the page

    // Collect all the data from the form
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();
    const firstName = document.getElementById('first-name').value.trim();
    const lastName = document.getElementById('last-name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address').value.trim();
    const licenseNumber = document.getElementById('license-number').value.trim();
    const licenseIssueDate = new Date(document.getElementById('license-issue-date').value.trim());
    const cardNumber = document.getElementById('card-number').value.trim();

    // Validate password and confirm password
    if (password !== confirmPassword) {
      alert("Passwords do not match. Please try again.");
      return;
    }

    try {
      // Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log("User created in Firebase Authentication:", user);

      // Store user data in Firestore
      const userData = {
        firstName,
        lastName,
        email,
        phone,
        address,
        licenseNumber,
        licenseIssueDate: Timestamp.fromDate(licenseIssueDate), // Convert to Firestore Timestamp
        cardNumber,
        role: "user", // Default role is "user"
        createdAt: Timestamp.now() // Use Firestore Timestamp for createdAt
      };

      console.log("User data being written to Firestore:", userData);

      await setDoc(doc(db, "users", user.uid), userData);

      // Redirect to login page after successful signup
      alert('Signup successful! Redirecting to login page...');
      window.location.href = "/index.html";
    } catch (error) {
      // Handle errors
      console.error("Error during signup:", error);

      // Display user-friendly error messages
      if (error.code === "auth/email-already-in-use") {
        alert("The email address is already in use. Please use a different email.");
      } else if (error.code === "auth/invalid-email") {
        alert("The email address is not valid. Please check and try again.");
      } else if (error.code === "auth/weak-password") {
        alert("The password is too weak. Please use a stronger password.");
      } else if (error.code === "auth/network-request-failed") {
        alert("Network error: Please check your internet connection and try again.");
      } else {
        alert("Signup failed: " + error.message);
      }
    }
  });
}