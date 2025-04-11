// user-profile.js - User Profile Management
import { db, auth, storage } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  signOut
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-storage.js";

// Global variables
let currentUser = null;
let userData = null;
let userId = null;

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  try {
    console.log("User Profile page initializing");

    // Load header and footer
    await loadHeaderFooter();
    
    // Set up UI components that don't require authentication
    setupTabNavigation();
    setupPasswordToggles();
    setupToastClosing();
    setupModalClosing();
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        userId = user.uid;
        console.log("User authenticated:", userId);

        // Load user data
        await loadUserData(userId);
        
        // Setup event listeners for forms
        setupEventListeners();
      } else {
        // Redirect to login if not authenticated
        console.log("User not authenticated, redirecting to login");
        window.location.href = '../index.html';
      }
    });
  } catch (error) {
    console.error("Error initializing user profile page:", error);
    showError("Failed to initialize page: " + error.message);
  }
});

// Load header and footer
async function loadHeaderFooter() {
  try {
    // Load header
    const headerResponse = await fetch("../static/headerFooter/user-header.html");
    if (!headerResponse.ok) {
      throw new Error(`Failed to load header: ${headerResponse.status}`);
    }
    document.getElementById("header").innerHTML = await headerResponse.text();

    // Load footer
    const footerResponse = await fetch("../static/headerFooter/user-footer.html");
    if (!footerResponse.ok) {
      throw new Error(`Failed to load footer: ${footerResponse.status}`);
    }
    document.getElementById("footer").innerHTML = await footerResponse.text();

    // Setup logout button in header
    setupLogoutButton();
  } catch (error) {
    console.error("Error loading header/footer:", error);
    // Don't fail completely, just log the error
  }
}

// Set up tab navigation
function setupTabNavigation() {
  console.log("Setting up tab navigation");
  
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  
  console.log(`Found ${tabButtons.length} tab buttons and ${tabContents.length} tab contents`);
  
  tabButtons.forEach(button => {
    button.addEventListener("click", function() {
      const tabId = this.getAttribute("data-tab");
      console.log(`Tab clicked: ${tabId}`);
      
      // Remove active class from all tabs
      tabButtons.forEach(btn => btn.classList.remove("active"));
      tabContents.forEach(content => content.classList.remove("active"));
      
      // Add active class to clicked tab
      this.classList.add("active");
      const activeContent = document.getElementById(tabId);
      if (activeContent) {
        activeContent.classList.add("active");
        console.log(`Tab content activated: ${tabId}`);
      } else {
        console.error(`Tab content not found: ${tabId}`);
      }
    });
  });
}

// Set up password toggles
function setupPasswordToggles() {
  const toggleButtons = document.querySelectorAll(".toggle-password-btn");
  toggleButtons.forEach(button => {
    button.addEventListener("click", function() {
      const passwordInput = this.parentElement.querySelector("input");
      const icon = this.querySelector("i");
      
      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        icon.className = "bi bi-eye-slash";
      } else {
        passwordInput.type = "password";
        icon.className = "bi bi-eye";
      }
    });
  });
}

// Set up toast closing
function setupToastClosing() {
  const closeButtons = document.querySelectorAll(".close-toast");
  closeButtons.forEach(button => {
    button.addEventListener("click", function() {
      const toast = this.closest(".toast");
      if (toast) {
        toast.classList.remove("show");
      }
    });
  });
}

// Set up modal closing
function setupModalClosing() {
  const closeModalBtn = document.getElementById("close-modal");
  const reAuthModal = document.getElementById("re-auth-modal");
  
  if (closeModalBtn && reAuthModal) {
    closeModalBtn.addEventListener("click", () => {
      reAuthModal.style.display = "none";
    });
    
    // Close modal when clicking outside
    window.addEventListener("click", (e) => {
      if (e.target === reAuthModal) {
        reAuthModal.style.display = "none";
      }
    });
  }
}

// Setup logout button
function setupLogoutButton() {
  const logoutBtn = document.getElementById("logout-button");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await logoutUser();
      } catch (error) {
        console.error("Error during logout:", error);
        showError("Failed to log out. Please try again.");
      }
    });
  }
}

// Load user data from Firestore
async function loadUserData(userId) {
  try {
    showLoading(true);

    // Get user document
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      showError("User data not found");
      showLoading(false);
      return;
    }
    
    // Store user data
    userData = {
      id: userId,
      ...userDoc.data()
    };
    
    console.log("User data loaded:", userData);
    
    // Populate form with user data
    populateUserData();
    
    showLoading(false);
  } catch (error) {
    console.error("Error loading user data:", error);
    showError("Failed to load user data: " + error.message);
    showLoading(false);
  }
}

// Populate form fields with user data
function populateUserData() {
  // Personal information
  document.getElementById("first-name").value = userData.firstName || '';
  document.getElementById("last-name").value = userData.lastName || '';
  document.getElementById("phone").value = userData.phone || '';
  document.getElementById("address").value = userData.address || '';
  
  // Profile name and email
  document.getElementById("profile-name").textContent = 
    `${userData.firstName || ''} ${userData.lastName || ''}`;
  document.getElementById("current-email").textContent = userData.email || '';
  
  // License information
  document.getElementById("license-number").value = userData.licenseNumber || '';
  
  // Handle license date
  if (userData.licenseIssueDate) {
    let licenseDate = null;
    
    try {
      // Handle different date formats
      if (userData.licenseIssueDate.toDate) {
        licenseDate = userData.licenseIssueDate.toDate();
      } else if (userData.licenseIssueDate.seconds) {
        licenseDate = new Date(userData.licenseIssueDate.seconds * 1000);
      } else if (typeof userData.licenseIssueDate === 'string') {
        licenseDate = new Date(userData.licenseIssueDate);
      } else if (userData.licenseIssueDate instanceof Date) {
        licenseDate = userData.licenseIssueDate;
      }
      
      if (licenseDate && !isNaN(licenseDate)) {
        const year = licenseDate.getFullYear();
        const month = String(licenseDate.getMonth() + 1).padStart(2, '0');
        const day = String(licenseDate.getDate()).padStart(2, '0');
        document.getElementById("license-issue-date").value = `${year}-${month}-${day}`;
      }
    } catch (err) {
      console.error("Error with license date:", err);
    }
  }
  
  // Set member since date
  if (userData.createdAt) {
    try {
      let createdDate;
      if (userData.createdAt.toDate) {
        createdDate = userData.createdAt.toDate();
      } else if (userData.createdAt.seconds) {
        createdDate = new Date(userData.createdAt.seconds * 1000);
      } else {
        createdDate = new Date(userData.createdAt);
      }
      
      const options = { month: 'long', year: 'numeric' };
      document.getElementById("account-since").textContent = createdDate.toLocaleDateString('en-US', options);
    } catch (err) {
      console.error("Error formatting creation date:", err);
    }
  }
  
  // Payment information (last 4 digits only for security)
  if (userData.cardNumber) {
    const lastFourDigits = userData.cardNumber.slice(-4);
    document.getElementById("card-number").placeholder = `**** **** **** ${lastFourDigits}`;
  }
  
  // Profile picture if available
  if (userData.profilePicture) {
    const profilePicPreview = document.getElementById("profile-pic-preview");
    if (profilePicPreview) {
      profilePicPreview.src = userData.profilePicture;
    }
  }
}

// Set up event listeners
function setupEventListeners() {
  // Profile update form
  const profileForm = document.getElementById("profile-form");
  if (profileForm) {
    profileForm.addEventListener("submit", updateProfile);
  }
  
  // Email update form
  const emailForm = document.getElementById("email-form");
  if (emailForm) {
    emailForm.addEventListener("submit", updateEmailAddress);
  }
  
  // Password update form
  const passwordForm = document.getElementById("password-form");
  if (passwordForm) {
    passwordForm.addEventListener("submit", updateUserPassword);
  }
  
  // Payment information update form
  const paymentForm = document.getElementById("payment-form");
  if (paymentForm) {
    paymentForm.addEventListener("submit", updatePaymentInfo);
  }
  
  // Profile picture upload
  const profilePicInput = document.getElementById("profile-pic-input");
  if (profilePicInput) {
    profilePicInput.addEventListener("change", uploadProfilePicture);
  }
  
  // Delete account button
  const deleteAccountBtn = document.getElementById("delete-account-btn");
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete your account? This action cannot be undone!")) {
        deleteUserAccount();
      }
    });
  }
  
  // Re-authentication form
  const reAuthForm = document.getElementById("re-auth-form");
  if (reAuthForm) {
    reAuthForm.addEventListener("submit", handleReAuthentication);
  }
}

// Update profile information
async function updateProfile(event) {
  event.preventDefault();
  
  try {
    showLoading(true);
    
    // Gather form data
    const updatedData = {
      firstName: document.getElementById("first-name").value.trim(),
      lastName: document.getElementById("last-name").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      address: document.getElementById("address").value.trim(),
      licenseNumber: document.getElementById("license-number").value.trim(),
      updatedAt: serverTimestamp()
    };
    
    // Add license date if provided
    const licenseDate = document.getElementById("license-issue-date").value;
    if (licenseDate) {
      updatedData.licenseIssueDate = new Date(licenseDate);
    }
    
    // Validate phone number
    if (!/^\d{8}$/.test(updatedData.phone)) {
      showError("Please enter a valid 8-digit phone number.");
      showLoading(false);
      return;
    }
    
    // Update user document
    await updateDoc(doc(db, 'users', currentUser.uid), updatedData);
    
    // Update local userData
    userData = { ...userData, ...updatedData };
    
    // Update displayed name
    document.getElementById("profile-name").textContent = 
      `${updatedData.firstName} ${updatedData.lastName}`;
    
    // Show success message
    showSuccess("Profile updated successfully");
    
    // Update header if name changed
    const welcomeMessage = document.getElementById('welcome-message');
    if (welcomeMessage) {
      welcomeMessage.textContent = `Hi, ${updatedData.firstName}`;
    }
    
  } catch (error) {
    console.error('Error updating profile:', error);
    showError("Failed to update profile. Please try again.");
  } finally {
    showLoading(false);
  }
}

// Update email address
async function updateEmailAddress(event) {
  event.preventDefault();
  
  try {
    const newEmail = document.getElementById('new-email').value.trim();
    const password = document.getElementById('current-password-email').value;
    
    // Validate email
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      showError("Please enter a valid email address.");
      return;
    }
    
    // Check if email is the same as current
    if (newEmail === currentUser.email) {
      showError("The new email is the same as your current email.");
      return;
    }
    
    showLoading(true);
    
    // Re-authenticate user
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    
    // Update email in Firebase Auth
    await updateEmail(currentUser, newEmail);
    
    // Update email in Firestore
    await updateDoc(doc(db, 'users', currentUser.uid), {
      email: newEmail,
      updatedAt: serverTimestamp()
    });
    
    // Update local userData
    userData.email = newEmail;
    
    // Reset form
    document.getElementById('new-email').value = '';
    document.getElementById('current-password-email').value = '';
    
    // Update displayed email
    document.getElementById('current-email').textContent = newEmail;
    
    // Show success message
    showSuccess("Email updated successfully");
    
  } catch (error) {
    console.error('Error updating email:', error);
    
    // Handle specific errors
    if (error.code === 'auth/wrong-password') {
      showError("Incorrect password. Please try again.");
    } else if (error.code === 'auth/email-already-in-use') {
      showError("This email is already in use by another account.");
    } else if (error.code === 'auth/requires-recent-login') {
      showError("For security reasons, please log out and log back in before changing your email.");
    } else {
      showError("Failed to update email. Please try again.");
    }
  } finally {
    showLoading(false);
  }
}

// Update password
async function updateUserPassword(event) {
  event.preventDefault();
  
  try {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // Validate password match
    if (newPassword !== confirmPassword) {
      showError("New passwords do not match.");
      return;
    }
    
    // Validate password strength
    if (newPassword.length < 6) {
      showError("Password must be at least 6 characters long.");
      return;
    }
    
    showLoading(true);
    
    // Re-authenticate user
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
    
    // Update password in Firebase Auth
    await updatePassword(currentUser, newPassword);
    
    // Reset form
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    
    // Show success message
    showSuccess("Password updated successfully");
    
  } catch (error) {
    console.error('Error updating password:', error);
    
    // Handle specific errors
    if (error.code === 'auth/wrong-password') {
      showError("Current password is incorrect. Please try again.");
    } else if (error.code === 'auth/weak-password') {
      showError("The password is too weak. Please use a stronger password.");
    } else if (error.code === 'auth/requires-recent-login') {
      showError("For security reasons, please log out and log back in before changing your password.");
    } else {
      showError("Failed to update password. Please try again.");
    }
  } finally {
    showLoading(false);
  }
}

// Update payment information
async function updatePaymentInfo(event) {
  event.preventDefault();
  
  try {
    const cardNumber = document.getElementById('card-number').value.trim().replace(/\s/g, '');
    const cardExpiry = document.getElementById('card-expiry').value.trim();
    const cardCvv = document.getElementById('card-cvv').value.trim();
    
    // Validate card details
    if (cardNumber && cardNumber.length !== 16) {
      showError("Please enter a valid 16-digit card number.");
      return;
    }
    
    if (cardExpiry && !/^\d{2}\/\d{2}$/.test(cardExpiry)) {
      showError("Please enter a valid expiry date (MM/YY).");
      return;
    }
    
    if (cardCvv && !/^\d{3}$/.test(cardCvv)) {
      showError("Please enter a valid 3-digit CVV.");
      return;
    }
    
    showLoading(true);
    
    // Update payment info in Firestore
    if (cardNumber) {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        cardNumber: cardNumber,
        cardExpiry: cardExpiry,
        updatedAt: serverTimestamp()
      });
      
      // Update local userData
      userData.cardNumber = cardNumber;
      userData.cardExpiry = cardExpiry;
      
      // Reset form
      document.getElementById('card-number').value = '';
      document.getElementById('card-expiry').value = '';
      document.getElementById('card-cvv').value = '';
      
      // Update placeholder to show last 4 digits
      const lastFourDigits = cardNumber.slice(-4);
      document.getElementById('card-number').placeholder = `**** **** **** ${lastFourDigits}`;
      
      // Show success message
      showSuccess("Payment information updated successfully");
    } else {
      showError("Please enter a valid card number.");
    }
    
  } catch (error) {
    console.error('Error updating payment information:', error);
    showError("Failed to update payment information. Please try again.");
  } finally {
    showLoading(false);
  }
}

// Upload profile picture
async function uploadProfilePicture(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Check file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    showError("Profile picture must be less than 2MB.");
    return;
  }
  
  // Check file type
  if (!file.type.match('image.*')) {
    showError("Please select an image file.");
    return;
  }
  
  try {
    showLoading(true);
    
    // Create a storage reference
    const storageRef = ref(storage, `profile_pictures/${currentUser.uid}`);
    
    // Upload file
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    // Register observers
    uploadTask.on(
      'state_changed', 
      (snapshot) => {
        // Progress
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log('Upload progress: ' + progress.toFixed(0) + '%');
      },
      (error) => {
        // Error
        console.error('Error uploading profile picture:', error);
        showError("Failed to upload profile picture. Please try again.");
        showLoading(false);
      },
      async () => {
        // Complete
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        
        // Update user document with profile picture URL
        await updateDoc(doc(db, 'users', currentUser.uid), {
          profilePicture: downloadURL,
          updatedAt: serverTimestamp()
        });
        
        // Update preview
        const profilePicPreview = document.getElementById('profile-pic-preview');
        if (profilePicPreview) {
          profilePicPreview.src = downloadURL;
        }
        
        // Update local userData
        userData.profilePicture = downloadURL;
        
        // Show success message
        showSuccess("Profile picture updated successfully");
        showLoading(false);
      }
    );
    
  } catch (error) {
    console.error('Error in profile picture upload:', error);
    showError("Failed to upload profile picture. Please try again.");
    showLoading(false);
  }
}

// Handle re-authentication for secure operations
async function handleReAuthentication(event) {
  event.preventDefault();
  
  try {
    const password = document.getElementById('auth-password').value;
    
    if (!password) {
      showError("Please enter your password.");
      return;
    }
    
    showLoading(true);
    
    // Re-authenticate user
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    
    // Hide re-auth modal
    const reAuthModal = document.getElementById('re-auth-modal');
    if (reAuthModal) {
      reAuthModal.style.display = 'none';
    }
    
    // Reset password field
    document.getElementById('auth-password').value = '';
    
    // Execute the pending action
    if (window.pendingAction) {
      await window.pendingAction();
      window.pendingAction = null;
    }
    
  } catch (error) {
    console.error('Error in re-authentication:', error);
    
    if (error.code === 'auth/wrong-password') {
      showError("Incorrect password. Please try again.");
    } else {
      showError("Authentication failed. Please try again.");
    }
  } finally {
    showLoading(false);
  }
}

// Delete user account
async function deleteUserAccount() {
  try {
    // Check for active bookings first
    const hasActiveBookings = await checkActiveBookings();
    
    if (hasActiveBookings) {
      showError("You cannot delete your account while you have active bookings. Please cancel or complete all bookings first.");
      return;
    }
    
    // Show re-authentication modal
    const reAuthModal = document.getElementById('re-auth-modal');
    if (reAuthModal) {
      reAuthModal.style.display = 'flex';
    }
    
    // Set the pending action
    window.pendingAction = async () => {
      showLoading(true);
      
      try {
        // Delete user document from Firestore
        await deleteDoc(doc(db, 'users', currentUser.uid));
        
        // Delete user auth account
        await deleteUser(currentUser);
        
        // Redirect to home page
        alert("Your account has been deleted. You will be redirected to the home page.");
        window.location.href = '../index.html';
        
      } catch (error) {
        console.error('Error deleting account:', error);
        showError("Failed to delete account. Please try again or contact support.");
        showLoading(false);
      }
    };
    
  } catch (error) {
    console.error('Error in account deletion process:', error);
    showError("An error occurred. Please try again.");
  }
}

// Check for active bookings
async function checkActiveBookings() {
  try {
    // Query for active bookings by this user
    const bookingsRef = collection(db, "bookings");
    const q = query(
      bookingsRef,
      where("user_id", "==", currentUser.uid),
      where("status", "==", "active")
    );
    
    const bookingsSnapshot = await getDocs(q);
    return !bookingsSnapshot.empty;
    
  } catch (error) {
    console.error('Error checking for active bookings:', error);
    return false;
  }
}

// Log out user
async function logoutUser() {
  try {
    await signOut(auth);
    window.location.href = '../index.html';
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

// Show loading overlay
function showLoading(show) {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }
}

// Show error message
function showError(message) {
  const errorToast = document.getElementById('error-toast');
  const errorMessage = document.getElementById('error-message');
  
  if (errorToast && errorMessage) {
    errorMessage.textContent = message;
    errorToast.classList.add('show');
    
    setTimeout(() => {
      errorToast.classList.remove('show');
    }, 5000);
  } else {
    alert(message);
  }
}

// Show success message
function showSuccess(message) {
  const successToast = document.getElementById('success-toast');
  const successMessage = document.getElementById('success-message');
  
  if (successToast && successMessage) {
    successMessage.textContent = message;
    successToast.classList.add('show');
    
    setTimeout(() => {
      successToast.classList.remove('show');
    }, 5000);
  } else {
    alert(message);
  }
}