import { auth, db } from "./firebase-config.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut 
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { doc, setDoc, getDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

//
// SIGNUP FUNCTIONALITY
//
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

//
// LOGIN FUNCTIONALITY
//
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent the form from refreshing the page

    // Get email and password from the form
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    try {
      // Sign in the user with Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log("User signed in:", user);

      // Fetch the user's role from Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log("User data from Firestore:", userData);

        // Check the user's role and redirect accordingly
        if (userData.role === "admin") {
          window.location.href = "./admin-dashboard.html"; // Redirect to admin dashboard
        } else {
          window.location.href = "./user-dashboard.html"; // Redirect to user dashboard
        }
      } else {
        console.error("No user document found in Firestore!");
        alert("Error: User data not found. Please contact support.");
      }
    } catch (error) {
      console.error("Error during login:", error);

      // Handle specific Firebase Authentication errors
      if (error.code === "auth/wrong-password" || error.code === "auth/user-not-found" || error.code === "auth/invalid-login-credentials") {
        alert("The current Email and Password combination does not match any of our records, please try again.");
      } else if (error.code === "auth/invalid-email") {
        alert("The email address is not valid. Please check and try again.");
      } else if (error.code === "auth/network-request-failed") {
        alert("Network error: Please check your internet connection and try again.");
      } else {
        alert("Login failed: " + error.message); // Default error message for other cases
      }
    }
  });
}

//
// LOGOUT FUNCTIONALITY
//
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