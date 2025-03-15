import { db, auth, functions } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
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

// Import utility functions from admin-users.js
import { 
  formatDate, 
  formatPhone, 
  getInitials, 
  showLoading, 
  showError, 
  showMessage 
} from "./admin-users.js";

// Global variables
let currentUser = null;
let userId = null;
let userData = null;
let originalEmail = null;
let returnUrl = null;

// DOM Elements
const loadingOverlay = document.getElementById("loading-overlay");
const userNotFound = document.getElementById("user-not-found");
const editFormContainer = document.getElementById("edit-form-container");
const editUserTitle = document.getElementById("edit-user-title");
const editUserForm = document.getElementById("edit-user-form");

// Form elements
const userIdInput = document.getElementById("user-id");
const firstNameInput = document.getElementById("first-name");
const lastNameInput = document.getElementById("last-name");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const roleSelect = document.getElementById("role");

// Password fields
const changePasswordCheckbox = document.getElementById("change-password");
const passwordFields = document.getElementById("password-fields");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const togglePasswordBtns = document.querySelectorAll(".toggle-password-btn");

// Button elements
const cancelBtn = document.getElementById("cancel-btn");
const cancelFormBtn = document.getElementById("cancel-form-btn");
const saveUserBtn = document.getElementById("save-user-btn");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("User Edit page loading");
  
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

// Set up event listeners
function setupEventListeners() {
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
  togglePasswordBtns.forEach(btn => {
    btn.addEventListener("click", togglePasswordVisibility);
  });
}

// Load user data
async function loadUserData() {
  try {
    showLoading(true);
    
    // Get user document
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      userNotFound.style.display = "flex";
      editFormContainer.style.display = "none";
      showLoading(false);
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
        Edit User: ${escapeHTML(userName)}
      `;
    }
    
    document.title = `Edit ${userName} | BaoCarLiao Admin`;
    
    // Populate form
    populateForm(userData);
    
    showLoading(false);
  } catch (error) {
    console.error("Error loading user data:", error);
    showError(`Failed to load user data: ${error.message}`);
    showLoading(false);
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
  
  // Reset password fields
  if (changePasswordCheckbox) changePasswordCheckbox.checked = false;
  if (passwordFields) passwordFields.style.display = 'none';
  if (newPasswordInput) newPasswordInput.value = '';
  if (confirmPasswordInput) confirmPasswordInput.value = '';
}

// Toggle password fields visibility
function togglePasswordFields() {
  if (passwordFields) {
    passwordFields.style.display = changePasswordCheckbox.checked ? 'block' : 'none';
    
    // Reset password fields when hiding
    if (!changePasswordCheckbox.checked) {
      if (newPasswordInput) newPasswordInput.value = '';
      if (confirmPasswordInput) confirmPasswordInput.value = '';
    }
  }
}

// Toggle password visibility
function togglePasswordVisibility(e) {
  const button = e.currentTarget;
  const passwordInput = button.parentElement.querySelector('input');
  const icon = button.querySelector('i');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.className = 'bi bi-eye-slash';
  } else {
    passwordInput.type = 'password';
    icon.className = 'bi bi-eye';
  }
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  
  try {
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    showLoading(true);
    
    // Gather form data
    const formData = {
      firstName: firstNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      email: emailInput.value.trim().toLowerCase(),
      phone: phoneInput.value.trim(),
      role: roleSelect.value,
      updated_at: serverTimestamp(),
      updated_by: currentUser.uid
    };
    
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
        showLoading(false);
        return;
      }
      
      if (newPassword !== confirmPassword) {
        showMessage("Passwords do not match", "error");
        showLoading(false);
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
        showLoading(false);
        
        // Return to user detail page after delay
        setTimeout(() => {
          navigateBack();
        }, 3000);
        return;
      }
    }
    
    // Show success message
    showMessage("User updated successfully", "success");
    
    // Remove unsaved changes flag
    window.onbeforeunload = null;
    
    // Return to previous page after delay
    setTimeout(() => {
      navigateBack();
    }, 1500);
    
  } catch (error) {
    console.error("Error updating user:", error);
    showMessage(`Failed to update user: ${error.message}`, "error");
    showLoading(false);
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
  if (hasUnsavedChanges()) {
    if (confirm("You have unsaved changes. Are you sure you want to leave this page?")) {
      navigateBack();
    }
  } else {
    navigateBack();
  }
}

// Check if form has unsaved changes
function hasUnsavedChanges() {
  // Compare current values with original data
  if (!userData) return false;
  
  if (firstNameInput.value.trim() !== (userData.firstName || '')) return true;
  if (lastNameInput.value.trim() !== (userData.lastName || '')) return true;
  if (emailInput.value.trim().toLowerCase() !== (userData.email || '').toLowerCase()) return true;
  if (phoneInput.value.trim() !== (userData.phone || '')) return true;
  if (roleSelect.value !== (userData.role || 'user')) return true;
  if (changePasswordCheckbox.checked) return true;
  
  return false;
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
  
  // Validate phone format if provided
  const phoneValue = phoneInput.value.trim();
  if (phoneValue) {
    // Allow formats like (123) 456-7890, 123-456-7890, 1234567890, etc.
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,3}[-\s.]?[0-9]{4,6}$/;
    if (!phoneRegex.test(phoneValue)) {
      showMessage("Please enter a valid phone number", "error");
      phoneInput.focus();
      return false;
    }
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

// Format phone number on input
if (phoneInput) {
  phoneInput.addEventListener('input', function(e) {
    // Get input value and remove non-digit characters
    let input = this.value.replace(/\D/g, '');
    
    // Format based on length
    if (input.length <= 3) {
      // Do nothing
    } else if (input.length <= 6) {
      input = input.replace(/^(\d{3})(\d+)/, '$1-$2');
    } else {
      input = input.replace(/^(\d{3})(\d{3})(\d+)/, '$1-$2-$3');
    }
    
    // Update input value
    this.value = input;
  });
}

// Security - Escape HTML to prevent XSS
function escapeHTML(str) {
  if (!str || typeof str !== 'string') return '';
  
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Handle beforeunload event to warn about unsaved changes
window.addEventListener('beforeunload', function(e) {
  if (hasUnsavedChanges()) {
    // Standard message (most browsers will show their own message)
    const message = 'You have unsaved changes. Are you sure you want to leave this page?';
    e.returnValue = message;
    return message;
  }
});

// Prevent accidental form submission with Enter key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
    // Allow Enter in textareas
    if (!e.target.form || e.target.form !== editUserForm) {
      e.preventDefault();
    }
  }
});

// Listen for error events globally and handle them
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  showMessage("An unexpected error occurred. Please try again.", "error");
});

// Listen for unhandled promise rejections globally
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showMessage("An unexpected error occurred with a background task. Please try again.", "error");
});

// Export key functions for reuse in other modules
export {
  validateForm,
  escapeHTML,
  hasUnsavedChanges
};