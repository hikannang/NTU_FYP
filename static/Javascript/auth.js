import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Sign-up functionality
const signupForm = document.getElementById('signup-form');
const backArrow = document.getElementById('back-arrow');
const steps = document.querySelectorAll('.step');
let currentStep = 0;

// Function to show the current step
function showStep(stepIndex) {
  steps.forEach((step, index) => {
    step.classList.remove('active');
    if (index === stepIndex) {
      step.classList.add('active');
    }
  });

  // Show or hide the back arrow
  backArrow.style.display = stepIndex > 0 ? 'inline-block' : 'none';
}

// Back arrow functionality
if (backArrow) {
  backArrow.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      showStep(currentStep);
    }
  });
}

// Handle form submission
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Collect all the data from the multi-step form
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
      window.location.href = "/index.html"; // Redirect to login page regardless of errors
      return;
    }

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
        address,
        licenseNumber,
        licenseIssueDate: Timestamp.fromDate(licenseIssueDate), // Convert to Firestore Timestamp
        cardNumber,
        role: "user", // Default role is "user"
        createdAt: Timestamp.now() // Use Firestore Timestamp for createdAt
      };

      console.log("User data being written to Firestore:", userData);

      await setDoc(doc(db, "users", user.uid), userData);

      alert('Signup successful! Welcome, ' + firstName + ' ' + lastName);
      signupForm.reset();
    } catch (error) {
      alert('Error: ' + error.message);
      console.error("Error during signup:", error);
    } finally {
      // Redirect to login page regardless of success or error
      window.location.href = "/index.html";
    }
  });
}