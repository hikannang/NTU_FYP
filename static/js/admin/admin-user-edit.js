// admin-user-edit.js - Part 1
import { db, auth, functions } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { 
  onAuthStateChanged,
  EmailAuthProvider,
  updatePassword,
  reauthenticateWithCredential,
  updateEmail,
  signInWithEmailAndPassword,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Import utility functions
import { 
  formatDate, 
  formatPhone, 
  getInitials, 
  safeSetLoading, 
  showError, 
  showMessage,
  safeText,
  safeSetDisplay
} from "./admin-users.js";

// Global variables
let currentUser = null;
let userId = null;
let userData = null;
let originalEmail = null;
let returnUrl = null;
let hasChanges = false;

// DOM Elements - initialize as null
let loadingOverlay = null;
let userNotFound = null;
let editFormContainer = null;
let editUserTitle = null;
let editUserForm = null;

// Form elements
let userIdInput = null;
let firstNameInput = null;
let lastNameInput = null;
let emailInput = null;
let phoneInput = null;
let roleSelect = null;
let licenseNumberInput = null;
let licenseIssueDateInput = null;

// Account status
let accountStatusSelect = null;

// Password fields
let changePasswordCheckbox = null;
let passwordFields = null;
let newPasswordInput = null;
let confirmPasswordInput = null;
let togglePasswordBtns = null;
let generatePasswordBtn = null;
let passwordStrengthMeter = null;

// Button elements
let cancelBtn = null;
let cancelFormBtn = null;
let saveUserBtn = null;
let deleteUserBtn = null;
let confirmDeleteBtn = null;

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("User Edit page loading");
  
  // Get all DOM elements
  initializeElements();
  
  // Get user ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  userId = urlParams.get('id');
  returnUrl = urlParams.get('returnUrl');
  
  if (!userId) {
    showError("No user ID provided");
    return;
  }
  
  try {
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Verify admin status
          const userDoc = await getDoc(doc(db, "users", user.uid));
          
          if (userDoc.exists() && userDoc.data().role === "admin") {
            currentUser = {
              uid: user.uid,
              ...userDoc.data()
            };
            
            console.log("Admin authenticated:", currentUser.email);
            
            // Initialize page with user data
            await loadUserData();
          } else {
            console.error("User is not an admin");
            showError("You don't have permission to access this page");
            setTimeout(() => {
              window.location.href = "../index.html";
            }, 2000);
          }
        } catch (error) {
          console.error("Authentication error:", error);
          showError("Failed to verify admin permissions");
        }
      } else {
        console.log("User not authenticated, redirecting to login");
        window.location.href = "../index.html";
      }
    });
    
    // Setup event listeners
    setupEventListeners();
    
  } catch (error) {
    console.error("Initialization error:", error);
    showError(`Error initializing page: ${error.message}`);
  }
});

// Initialize all DOM elements
function initializeElements() {
  // Main elements
  loadingOverlay = document.getElementById("loading-overlay");
  userNotFound = document.getElementById("user-not-found");
  editFormContainer = document.getElementById("edit-form-container");
  editUserTitle = document.getElementById("edit-user-title");
  editUserForm = document.getElementById("edit-user-form");
  
  // Form inputs
  userIdInput = document.getElementById("user-id");
  firstNameInput = document.getElementById("first-name");
  lastNameInput = document.getElementById("last-name");
  emailInput = document.getElementById("email");
  phoneInput = document.getElementById("phone");
  roleSelect = document.getElementById("role");
  licenseNumberInput = document.getElementById("license-number");
  licenseIssueDateInput = document.getElementById("license-issue-date");
  
  // Account status
  accountStatusSelect = document.getElementById("account-status");
  
  // Password fields
  changePasswordCheckbox = document.getElementById("change-password");
  passwordFields = document.getElementById("password-fields");
  newPasswordInput = document.getElementById("new-password");
  confirmPasswordInput = document.getElementById("confirm-password");
  togglePasswordBtns = document.querySelectorAll(".toggle-password-btn");
  generatePasswordBtn = document.getElementById("generate-password-btn");
  passwordStrengthMeter = document.getElementById("password-strength");
  
  // Button elements
  cancelBtn = document.getElementById("cancel-btn");
  cancelFormBtn = document.getElementById("cancel-form-btn");
  saveUserBtn = document.getElementById("save-user-btn");
  deleteUserBtn = document.getElementById("delete-user-btn");
  confirmDeleteBtn = document.getElementById("confirm-delete-btn");
}

// Set up event listeners
function setupEventListeners() {
  // Form change detection
  if (editUserForm) {
    const formInputs = editUserForm.querySelectorAll('input, select');
    formInputs.forEach(input => {
      input.addEventListener('change', markFormChanged);
      input.addEventListener('input', markFormChanged);
    });
  }
  
  // Cancel buttons
  if (cancelBtn) {
    cancelBtn.addEventListener("click", handleCancel);
  }
  
  if (cancelFormBtn) {
    cancelFormBtn.addEventListener("click", handleCancel);
  }
  
  // Form submission
  if (editUserForm) {
    editUserForm.addEventListener("submit", handleFormSubmit);
  }
  
  // Password change toggle
  if (changePasswordCheckbox) {
    changePasswordCheckbox.addEventListener("change", togglePasswordFields);
  }
  
  // Password visibility toggle buttons
  if (togglePasswordBtns) {
    togglePasswordBtns.forEach(btn => {
      btn.addEventListener("click", togglePasswordVisibility);
    });
  }
  
  // Generate password button
  if (generatePasswordBtn) {
    generatePasswordBtn.addEventListener("click", generateRandomPassword);
  }
  
  // Password strength meter
  if (newPasswordInput && passwordStrengthMeter) {
    newPasswordInput.addEventListener("input", updatePasswordStrength);
  }
  
  // Delete user button
  if (deleteUserBtn) {
    deleteUserBtn.addEventListener("click", showDeleteConfirmation);
  }
  
  // Confirm delete button
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", handleDeleteUser);
  }
  
  // Phone formatting
  if (phoneInput) {
    phoneInput.addEventListener('input', formatPhoneInput);
  }
  
  // License date formatting
  if (licenseIssueDateInput) {
    licenseIssueDateInput.addEventListener('input', formatDateInput);
  }
}

// Load user data
async function loadUserData() {
  try {
    safeSetLoading(true);
    
    // Get user document
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      safeSetDisplay(userNotFound, "flex");
      safeSetDisplay(editFormContainer, "none");
      safeSetLoading(false);
      return;
    }
    
    // Store user data globally and include the ID
    userData = {
      id: userId,
      ...userDoc.data()
    };
    
    // Store original email for comparison
    originalEmail = userData.email;
    
    // Update page title with user name
    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    const userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "User";
    
    if (editUserTitle) {
      editUserTitle.innerHTML = `
        <i class="bi bi-pencil-square"></i> 
        Edit User: ${safeText(userName)}
      `;
    }
    
    document.title = `Edit ${userName} | BaoCarLiao Admin`;
    
    // Populate form with user data
    populateForm(userData);
    
    safeSetLoading(false);
  } catch (error) {
    console.error("Error loading user data:", error);
    showError(`Failed to load user data: ${error.message}`);
    safeSetLoading(false);
  }
}

// Populate form with user data
function populateForm(userData) {
  // Set hidden user ID
  if (userIdInput) userIdInput.value = userData.id;
  
  // Set text inputs
  if (firstNameInput) firstNameInput.value = userData.firstName || '';
  if (lastNameInput) lastNameInput.value = userData.lastName || '';
  if (emailInput) emailInput.value = userData.email || '';
  if (phoneInput) phoneInput.value = userData.phone || '';
  
  // Set license information
  if (licenseNumberInput) licenseNumberInput.value = userData.licenseNumber || '';
  
  // Format and set license date if available
  if (licenseIssueDateInput) {
    const licenseDate = getDateObject(userData.licenseIssueDate || userData.licenseDate);
    if (licenseDate) {
      // Format as YYYY-MM-DD for date input
      const year = licenseDate.getFullYear();
      const month = String(licenseDate.getMonth() + 1).padStart(2, '0');
      const day = String(licenseDate.getDate()).padStart(2, '0');
      licenseIssueDateInput.value = `${year}-${month}-${day}`;
    } else {
      licenseIssueDateInput.value = '';
    }
  }
  
  // Set role select
  if (roleSelect) {
    // Default to 'user' if no role is specified
    const userRole = userData.role || 'user';
    
    // Find and select the option with the matching value
    const options = Array.from(roleSelect.options);
    const matchingOption = options.find(option => option.value === userRole);
    
    if (matchingOption) {
      matchingOption.selected = true;
    } else {
      // If no matching option, add one
      const newOption = document.createElement('option');
      newOption.value = userRole;
      newOption.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
      newOption.selected = true;
      roleSelect.appendChild(newOption);
    }
  }
  
  // Set account status
  if (accountStatusSelect) {
    // Default to 'active' if not specified
    const accountStatus = userData.status || 'active';
    
    // Find and select the option with the matching value
    const options = Array.from(accountStatusSelect.options);
    const matchingOption = options.find(option => option.value === accountStatus);
    
    if (matchingOption) {
      matchingOption.selected = true;
    }
  }
  
  // Reset password fields
  if (changePasswordCheckbox) changePasswordCheckbox.checked = false;
  if (passwordFields) safeSetDisplay(passwordFields, 'none');
  if (newPasswordInput) newPasswordInput.value = '';
  if (confirmPasswordInput) confirmPasswordInput.value = '';
}

// Toggle password fields visibility
function togglePasswordFields() {
  if (!passwordFields) return;
  
  const isChecked = changePasswordCheckbox.checked;
  safeSetDisplay(passwordFields, isChecked ? 'block' : 'none');
  
  // Reset password fields when hiding
  if (!isChecked) {
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
    if (passwordStrengthMeter) {
      passwordStrengthMeter.style.width = '0%';
      passwordStrengthMeter.className = 'password-strength';
    }
  }
  
  // Mark form as changed
  markFormChanged();
}

// Toggle password visibility
function togglePasswordVisibility(e) {
  const button = e.currentTarget;
  const passwordInput = button.closest('.password-input-group').querySelector('input');
  const icon = button.querySelector('i');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.className = 'bi bi-eye-slash';
  } else {
    passwordInput.type = 'password';
    icon.className = 'bi bi-eye';
  }
}

// Generate random secure password
function generateRandomPassword() {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let password = "";
  
  // Ensure at least one of each: uppercase, lowercase, number, symbol
  password += charset.match(/[A-Z]/)[0]; // Add one uppercase
  password += charset.match(/[a-z]/)[0]; // Add one lowercase
  password += charset.match(/[0-9]/)[0]; // Add one number
  password += charset.match(/[!@#$%^&*()_+]/)[0]; // Add one symbol
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  
  // Shuffle the password characters
  password = password.split('').sort(() => 0.5 - Math.random()).join('');
  
  // Set password in both fields
  if (newPasswordInput) newPasswordInput.value = password;
  if (confirmPasswordInput) confirmPasswordInput.value = password;
  
  // Update strength meter
  updatePasswordStrength();
  
  // Mark form changed
  markFormChanged();
  
  // Show success message
  showMessage("Secure password generated", "success");
}

// Update password strength meter
function updatePasswordStrength() {
  if (!newPasswordInput || !passwordStrengthMeter) return;
  
  const password = newPasswordInput.value;
  let strength = 0;
  
  // Empty password
  if (!password) {
    passwordStrengthMeter.style.width = '0%';
    passwordStrengthMeter.className = 'password-strength';
    return;
  }
  
  // Length check
  if (password.length >= 8) strength += 25;
  if (password.length >= 10) strength += 10;
  
  // Character variety checks
  if (/[A-Z]/.test(password)) strength += 15; // Has uppercase
  if (/[a-z]/.test(password)) strength += 15; // Has lowercase
  if (/[0-9]/.test(password)) strength += 15; // Has number
  if (/[^A-Za-z0-9]/.test(password)) strength += 20; // Has special char
  
  // Update meter
  passwordStrengthMeter.style.width = `${strength}%`;
  
  // Update class based on strength
  if (strength < 40) {
    passwordStrengthMeter.className = 'password-strength weak';
  } else if (strength < 70) {
    passwordStrengthMeter.className = 'password-strength medium';
  } else {
    passwordStrengthMeter.className = 'password-strength strong';
  }
}

// Format phone input
function formatPhoneInput(e) {
  // Get input value and remove non-digit characters
  let input = e.target.value.replace(/\D/g, '');
  
  // Format based on length
  let formatted = '';
  if (input.length <= 3) {
    formatted = input;
  } else if (input.length <= 6) {
    formatted = `${input.slice(0, 3)}-${input.slice(3)}`;
  } else {
    formatted = `${input.slice(0, 3)}-${input.slice(3, 6)}-${input.slice(6, 10)}`;
  }
  
  // Update input value
  e.target.value = formatted;
}

// Format date input
function formatDateInput(e) {
  // Use HTML5 date input format (handled by browser)
  // This just ensures the date format will be valid
}

// Helper to convert various date formats to Date object
function getDateObject(dateValue) {
  if (!dateValue) return null;
  
  try {
    if (dateValue instanceof Date) return dateValue;
    
    if (dateValue.seconds && dateValue.nanoseconds) {
      // Firestore Timestamp
      return new Date(dateValue.seconds * 1000);
    }
    
    // String or number
    return new Date(dateValue);
  } catch (error) {
    console.error("Error parsing date:", error);
    return null;
  }
}

// Mark form as having changes
function markFormChanged() {
  hasChanges = true;
  
  // Enable save button
  if (saveUserBtn) saveUserBtn.disabled = false;
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  
  try {
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    safeSetLoading(true);
    
    // Gather form data
    const formData = {
      firstName: firstNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      email: emailInput.value.trim().toLowerCase(),
      phone: phoneInput.value.trim(),
      role: roleSelect.value,
      licenseNumber: licenseNumberInput.value.trim(),
      status: accountStatusSelect.value,
      updated_at: serverTimestamp(),
      updated_by: currentUser.uid
    };
    
    // Handle license issue date
    if (licenseIssueDateInput.value) {
      try {
        // Convert date string to Firebase timestamp
        const licenseDate = new Date(licenseIssueDateInput.value);
        formData.licenseIssueDate = licenseDate;
      } catch (err) {
        console.error("Invalid license date format:", err);
      }
    }
    
    console.log("Updating user with data:", formData);
    
    // Check if email has changed
    const emailChanged = originalEmail !== formData.email;
    let passwordChanged = false;
    
    // Handle password change if requested
    if (changePasswordCheckbox.checked) {
      passwordChanged = true;
      
      // Validate password fields
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;
      
      // Password validation
      if (newPassword.length < 6) {
        showMessage("Password must be at least 6 characters long", "error");
        safeSetLoading(false);
        return;
      }
      
      if (newPassword !== confirmPassword) {
        showMessage("Passwords do not match", "error");
        safeSetLoading(false);
        return;
      }
    }
    
    // Update user document in Firestore
    await updateDoc(doc(db, "users", userId), formData);
    console.log("User document updated successfully");
    
    // Handle email or password changes (requires special Firebase Auth operations)
    if (emailChanged || passwordChanged) {
      try {
        // Call a Firebase Function to update Auth user
        // This should be implemented on your Firebase backend
        const updateAuthUser = httpsCallable(functions, 'updateAuthUser');
        
        await updateAuthUser({
          userId: userId,
          email: emailChanged ? formData.email : null,
          password: passwordChanged ? newPasswordInput.value : null
        });
        
        console.log("Auth user updated successfully");
      } catch (authError) {
        console.error("Error updating auth user:", authError);
        showMessage("User info updated, but authentication details could not be changed. Please contact technical support.", "warning");
        safeSetLoading(false);
        
        // Return to user detail page after delay
        setTimeout(() => {
          navigateBack();
        }, 3000);
        return;
      }
    }
    
    // Show success message
    showMessage("User updated successfully", "success");
    
    // Reset unsaved changes flag
    hasChanges = false;
    
    // Return to previous page after delay
    setTimeout(() => {
      navigateBack();
    }, 1500);
    
  } catch (error) {
    console.error("Error updating user:", error);
    showMessage(`Failed to update user: ${error.message}`, "error");
    safeSetLoading(false);
  }
}

// Show delete confirmation
function showDeleteConfirmation() {
  // Show confirmation modal
  const deleteModal = document.getElementById("delete-modal");
  if (deleteModal) {
    deleteModal.style.display = "flex";
    setTimeout(() => {
      deleteModal.classList.add("show");
    }, 10);
  }
}

// Cancel delete
function cancelDelete() {
  // Hide confirmation modal
  const deleteModal = document.getElementById("delete-modal");
  if (deleteModal) {
    deleteModal.classList.remove("show");
    setTimeout(() => {
      deleteModal.style.display = "none";
    }, 300);
  }
}

// Handle user deletion
async function handleDeleteUser() {
  try {
    safeSetLoading(true);
    
    // First, delete the Firestore document
    await deleteDoc(doc(db, "users", userId));
    
    // Then, call Firebase Function to delete auth user
    try {
      const deleteAuthUser = httpsCallable(functions, 'deleteAuthUser');
      await deleteAuthUser({ userId: userId });
    } catch (authError) {
      console.error("Error deleting auth user:", authError);
      showMessage("User document deleted, but auth user could not be deleted. Please check Firebase console.", "warning");
    }
    
    // Show success message
    showMessage("User deleted successfully", "success");
    
    // Reset unsaved changes flag
    hasChanges = false;
    
    // Hide delete modal
    cancelDelete();
    
    // Redirect to users list
    setTimeout(() => {
      window.location.href = "admin-users.html";
    }, 1500);
    
  } catch (error) {
    console.error("Error deleting user:", error);
    showMessage(`Failed to delete user: ${error.message}`, "error");
    safeSetLoading(false);
  }
}

// Navigate back to the previous page or to user detail
function navigateBack() {
  if (returnUrl) {
    window.location.href = returnUrl;
  } else {
    window.location.href = `admin-user-detail.html?id=${userId}`;
  }
}

// Handle cancel button click
function handleCancel() {
  if (hasChanges) {
    if (confirm("You have unsaved changes. Are you sure you want to leave this page?")) {
      navigateBack();
    }
  } else {
    navigateBack();
  }
}

// Validate form inputs
function validateForm() {
  // Check required fields
  if (!emailInput.value.trim()) {
    showMessage("Email is required", "error");
    emailInput.focus();
    return false;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailInput.value.trim())) {
    showMessage("Please enter a valid email address", "error");
    emailInput.focus();
    return false;
  }
  
  // Validate role
  if (!roleSelect.value) {
    showMessage("Please select a role", "error");
    roleSelect.focus();
    return false;
  }
  
  // Password validation if changing password
  if (changePasswordCheckbox.checked) {
    if (!newPasswordInput.value) {
      showMessage("Please enter a new password", "error");
      newPasswordInput.focus();
      return false;
    }
    
    if (newPasswordInput.value.length < 6) {
      showMessage("Password must be at least 6 characters long", "error");
      newPasswordInput.focus();
      return false;
    }
    
    if (newPasswordInput.value !== confirmPasswordInput.value) {
      showMessage("Passwords do not match", "error");
      confirmPasswordInput.focus();
      return false;
    }
  }
  
  return true;
}

// Prevent accidental form submission with Enter key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
    // Allow Enter in textareas
    if (!e.target.form || e.target.form !== editUserForm) {
      e.preventDefault();
    }
  }
});

// Warn about unsaved changes
window.addEventListener('beforeunload', function(e) {
  if (hasChanges) {
    // Standard message (most browsers will show their own message)
    const message = 'You have unsaved changes. Are you sure you want to leave this page?';
    e.returnValue = message;
    return message;
  }
});

// Global error handling
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  if (event.error && event.error.message && event.error.message.includes("Cannot read properties of null")) {
    console.warn("Prevented null reference error");
    event.preventDefault();
  }
});