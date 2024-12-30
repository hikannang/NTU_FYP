import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

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
    const licenseIssueDate = document.getElementById('license-issue-date').value.trim();
    const address = document.getElementById('address').value.trim();
    const cardNumber = document.getElementById('card-number').value.trim();
    const password = "defaultPassword"; // Replace with a secure password if needed

    try {
      // Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Store user data in Firestore
      await setDoc(doc(db, "users", user.uid), {
        firstName,
        lastName,
        email,
        phone,
        licenseNumber,
        licenseIssueDate,
        address,
        cardNumber,
        role: "user", // Default role is "user"
        createdAt: new Date()
      });

      alert('Signup successful! Welcome, ' + firstName + ' ' + lastName);
      signupForm.reset();
      window.location.href = "/index.html"; // Redirect to login page
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });
}