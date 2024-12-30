import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Sign-up functionality
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Collect all the data from the multi-step form
    const firstName = document.getElementById('first-name').value.trim();
    const lastName = document.getElementById('last-name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const licenseNumber = document.getElementById('license-number').value.trim();
    const licenseIssueDate = new Date(document.getElementById('license-issue-date').value.trim()); // Convert to Date object
    const address = document.getElementById('address').value.trim();
    const cardNumber = document.getElementById('card-number').value.trim();
    const password = "defaultPassword"; // Replace with a secure password if needed

    try {
      // Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Log user data for debugging
      console.log("User created in Firebase Authentication:", user);

      // Store user data in Firestore
      const userData = {
        firstName,
        lastName,
        email,
        phone,
        licenseNumber,
        licenseIssueDate: Timestamp.fromDate(licenseIssueDate), // Convert to Firestore Timestamp
        address,
        cardNumber,
        role: "user", // Default role is "user"
        createdAt: Timestamp.now() // Use Firestore Timestamp for createdAt
      };

      console.log("User data being written to Firestore:", userData);

      await setDoc(doc(db, "users", user.uid), userData);

      alert('Signup successful! Welcome, ' + firstName + ' ' + lastName);
      signupForm.reset();
      window.location.href = "/index.html"; // Redirect to login page
    } catch (error) {
      alert('Error: ' + error.message);
      console.error("Error during signup:", error);
    }
  });
}