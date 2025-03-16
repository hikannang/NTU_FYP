import { db, auth, functions } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { 
  onAuthStateChanged,
  httpsCallable 
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let currentUser = null;
let userId = null;
let userData = null;
let originalEmail = null;
let returnUrl = null;
let hasChanges = false;

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("User Edit page loading");
  
  // Get user ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  userId = urlParams.get('id');
  returnUrl = urlParams.get('returnUrl') || `admin-user-detail.html?id=${userId}`;
  
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
            setupEventListeners();
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
  } catch (error) {
    console.error("Initialization error:", error);
    showError(`Error initializing page: ${error.message}`);
  }
});

// Load user data - FIXED IMPLEMENTATION FOR CORRECT DATA RETRIEVAL
async function loadUserData() {
  try {
    showLoading(true);
    console.log(`Loading user data for ID: ${userId}`);
    
    // Get user document from users collection
    const userRef = doc(db, "users", userId);
    const userSnapshot = await getDoc(userRef);
    
    if (!userSnapshot.exists()) {
      console.error("User document not found");
      document.getElementById("user-not-found").style.display = "flex";
      document.getElementById("edit-form-container").style.display = "none";
      showLoading(false);
      return;
    }
    
    // Store user data globally with explicit field mapping based on database structure
    const docData = userSnapshot.data();
    userData = {
      id: userId,
      firstName: docData.firstName || '',
      lastName: docData.lastName || '',
      email: docData.email || '',
      phone: docData.phone || '',
      role: docData.role || 'user',
      licenseNumber: docData.licenseNumber || '',
      licenseIssueDate: docData.licenseIssueDate || null,
      suspended: docData.suspended === true, // explicit boolean conversion
      createdAt: docData.createdAt || null,
      cardNumber: docData.cardNumber || '',
      address: docData.address || ''
    };
    
    // Log full raw data to see what we're working with
    console.log("Raw user data from Firestore:", docData);
    console.log("Processed user data:", userData);
    
    // Store original email for comparison
    originalEmail = userData.email;
    
    // Update page title with user name
    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    const userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "User";
    
    const editUserTitle = document.getElementById("edit-user-title");
    if (editUserTitle) {
      editUserTitle.innerHTML = `
        <i class="bi bi-pencil-square"></i> 
        Edit User: ${escapeHTML(userName)}
      `;
    }
    
    document.title = `Edit ${userName} | BaoCarLiao Admin`;
    
    // Direct form population with field-by-field approach
    directlyPopulateForm(userData);
    
    showLoading(false);
  } catch (error) {
    console.error("Error loading user data:", error);
    showError(`Failed to load user data: ${error.message}`);
    showLoading(false);
  }
}

// COMPLETELY REWRITTEN: Directly populate form field-by-field with debugging
function directlyPopulateForm(user) {
  console.log("Starting direct form population...");

  // Basic info fields with direct element access
  const firstNameField = document.getElementById("first-name");
  if (firstNameField) {
    firstNameField.value = user.firstName || '';
    console.log(`Set firstName: ${firstNameField.value}`);
  } else {
    console.error("first-name field not found in DOM");
  }
  
  const lastNameField = document.getElementById("last-name");
  if (lastNameField) {
    lastNameField.value = user.lastName || '';
    console.log(`Set lastName: ${lastNameField.value}`);
  } else {
    console.error("last-name field not found in DOM");
  }
  
  const emailField = document.getElementById("email");
  if (emailField) {
    emailField.value = user.email || '';
    console.log(`Set email: ${emailField.value}`);
  } else {
    console.error("email field not found in DOM");
  }
  
  const phoneField = document.getElementById("phone");
  if (phoneField) {
    phoneField.value = user.phone || '';
    console.log(`Set phone: ${phoneField.value}`);
  } else {
    console.error("phone field not found in DOM");
  }
  
  const licenseNumberField = document.getElementById("license-number");
  if (licenseNumberField) {
    licenseNumberField.value = user.licenseNumber || '';
    console.log(`Set licenseNumber: ${licenseNumberField.value}`);
  } else {
    console.error("license-number field not found in DOM");
  }
  
  // Handle license issue date with extensive debugging
  const licenseIssueDateField = document.getElementById("license-issue-date");
  if (licenseIssueDateField && user.licenseIssueDate) {
    console.log("Processing licenseIssueDate...");
    console.log("Original licenseIssueDate value:", user.licenseIssueDate);
    
    try {
      let licenseDate = null;
      
      // Handle all possible date formats
      if (user.licenseIssueDate instanceof Date) {
        licenseDate = user.licenseIssueDate;
        console.log("licenseIssueDate is a Date object");
      } 
      else if (user.licenseIssueDate.toDate && typeof user.licenseIssueDate.toDate === 'function') {
        licenseDate = user.licenseIssueDate.toDate();
        console.log("licenseIssueDate is a Firestore Timestamp, converted to:", licenseDate);
      }
      else if (user.licenseIssueDate.seconds) {
        licenseDate = new Date(user.licenseIssueDate.seconds * 1000);
        console.log("licenseIssueDate has seconds property, converted to:", licenseDate);
      }
      else if (typeof user.licenseIssueDate === 'string') {
        licenseDate = new Date(user.licenseIssueDate);
        console.log("licenseIssueDate is a string, converted to:", licenseDate);
      }
      
      // Format date for input field
      if (licenseDate && !isNaN(licenseDate)) {
        const year = licenseDate.getFullYear();
        const month = String(licenseDate.getMonth() + 1).padStart(2, '0');
        const day = String(licenseDate.getDate()).padStart(2, '0');
        licenseIssueDateField.value = `${year}-${month}-${day}`;
        console.log(`Set licenseIssueDate: ${licenseIssueDateField.value}`);
      } else {
        console.error("Could not convert to valid date");
      }
    } catch (err) {
      console.error("Error processing license date:", err);
    }
  } else {
    console.log("No license issue date to process or field not found");
  }
  
  // Set role select
  const roleSelect = document.getElementById("role");
  if (roleSelect) {
    const userRole = user.role || 'user';
    console.log(`Setting role to: "${userRole}"`);
    
    // Find matching option
    let optionFound = false;
    for (let i = 0; i < roleSelect.options.length; i++) {
      if (roleSelect.options[i].value === userRole) {
        roleSelect.selectedIndex = i;
        optionFound = true;
        console.log(`Selected existing role option at index ${i}`);
        break;
      }
    }
    
    // Add option if not found
    if (!optionFound) {
      const newOption = document.createElement('option');
      newOption.value = userRole;
      newOption.text = userRole.charAt(0).toUpperCase() + userRole.slice(1);
      newOption.selected = true;
      roleSelect.add(newOption);
      console.log(`Added new role option: ${userRole}`);
    }
  } else {
    console.error("role select field not found in DOM");
  }
  
  // Set account status
  const accountStatusToggle = document.getElementById("account-status");
  if (accountStatusToggle) {
    const isActive = !user.suspended;
    accountStatusToggle.checked = isActive;
    console.log(`Set account status toggle: ${isActive ? "active" : "suspended"}`);
    
    // Update status text
    updateStatusText();
  } else {
    console.error("account-status toggle not found in DOM");
  }
  
  // Initialize password fields
  initializePasswordFields();
  
  console.log("Form population completed");
}

// COMPLETELY REWRITTEN: Initialize password fields
function initializePasswordFields() {
  console.log("Initializing password fields");
  
  // Get password elements
  const changePasswordCheckbox = document.getElementById("change-password");
  const newPasswordField = document.getElementById("new-password");
  const confirmPasswordField = document.getElementById("confirm-password");
  
  if (!changePasswordCheckbox) {
    console.error("change-password checkbox not found");
    return;
  }
  
  if (!newPasswordField || !confirmPasswordField) {
    console.error("Password fields not found");
    return;
  }
  
  // Ensure checkbox is unchecked on page load
  changePasswordCheckbox.checked = false;
  
  // Disable password fields initially
  newPasswordField.disabled = true;
  confirmPasswordField.disabled = true;
  
  // Clear any existing values
  newPasswordField.value = '';
  confirmPasswordField.value = '';
  
  console.log("Password fields initialized");
}

// Set up event listeners with direct element references
function setupEventListeners() {
  console.log("Setting up event listeners");
  
  // Form submission
  const form = document.getElementById("edit-user-form");
  if (form) {
    form.addEventListener("submit", handleFormSubmit);
    console.log("Form submit listener added");
  } else {
    console.error("edit-user-form not found");
  }
  
  // Form input change detection
  const allInputs = document.querySelectorAll('input, select');
  allInputs.forEach(input => {
    input.addEventListener('change', () => {
      hasChanges = true;
      console.log("Form change detected");
    });
  });
  
  // FIXED: Password change toggle with direct binding
  const changePasswordCheckbox = document.getElementById("change-password");
  if (changePasswordCheckbox) {
    // Remove any existing listeners to prevent duplicates
    const newHandler = function() {
      console.log("Change password checkbox toggled: " + this.checked);
      togglePasswordFields(this.checked);
    };
    
    changePasswordCheckbox.removeEventListener("change", newHandler);
    changePasswordCheckbox.addEventListener("change", newHandler);
    console.log("Password checkbox listener added");
  } else {
    console.error("change-password checkbox not found");
  }
  
  // Account status toggle with direct reference
  const statusToggle = document.getElementById("account-status");
  if (statusToggle) {
    statusToggle.addEventListener("change", updateStatusText);
    console.log("Status toggle listener added");
  } else {
    console.error("account-status toggle not found");
  }
  
  // Delete account button
  const deleteBtn = document.getElementById("delete-account-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", confirmDeleteAccount);
    console.log("Delete button listener added");
  } else {
    console.error("delete-account-btn not found");
  }
  
  // Password visibility toggle buttons
  const toggleButtons = document.querySelectorAll(".toggle-password-btn");
  if (toggleButtons && toggleButtons.length > 0) {
    toggleButtons.forEach((btn, index) => {
      btn.addEventListener("click", togglePasswordVisibility);
      console.log(`Password toggle button ${index+1} listener added`);
    });
  } else {
    console.error("No password toggle buttons found");
  }
}

// FIXED: Toggle password fields with direct element access
function togglePasswordFields(enabled) {
  console.log(`Toggling password fields: ${enabled ? "enabled" : "disabled"}`);
  
  // Get password fields directly
  const newPasswordField = document.getElementById("new-password");
  const confirmPasswordField = document.getElementById("confirm-password");
  
  if (!newPasswordField || !confirmPasswordField) {
    console.error("Password fields not found for toggling");
    return;
  }
  
  // Enable/disable password fields
  newPasswordField.disabled = !enabled;
  confirmPasswordField.disabled = !enabled;
  
  // Reset values when disabled
  if (!enabled) {
    newPasswordField.value = '';
    confirmPasswordField.value = '';
    console.log("Password fields cleared");
  } else {
    // Focus on new password field when enabled
    setTimeout(() => {
      newPasswordField.focus();
    }, 100);
  }
  
  console.log(`Password fields ${enabled ? "enabled" : "disabled"}`);
}

// Toggle password visibility
function togglePasswordVisibility(e) {
  // Get the button and find its parent input group
  const button = e.currentTarget;
  if (!button) return;
  
  // Get the input field that's a sibling to this button
  const passwordInputGroup = button.closest('.password-input-group');
  if (!passwordInputGroup) return;
  
  const passwordInput = passwordInputGroup.querySelector('input');
  const icon = button.querySelector('i');
  
  if (!passwordInput || !icon) return;
  
  // Toggle between password and text
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.className = 'bi bi-eye-slash';
    console.log("Password visibility: shown");
  } else {
    passwordInput.type = 'password';
    icon.className = 'bi bi-eye';
    console.log("Password visibility: hidden");
  }
}

// Update account status text and styling
function updateStatusText() {
  const statusToggle = document.getElementById("account-status");
  const statusText = document.getElementById("status-text");
  const statusCard = document.getElementById("status-action-card");
  
  if (!statusToggle || !statusText) {
    console.error("Status elements not found");
    return;
  }
  
  const isActive = statusToggle.checked;
  statusText.textContent = isActive ? 'Active' : 'Suspended';
  statusText.className = `toggle-text ${isActive ? 'text-success' : 'text-warning'}`;
  
  if (statusCard) {
    statusCard.className = `action-card ${isActive ? 'active' : 'suspended'}`;
  }
  
  console.log(`Status updated to: ${isActive ? "active" : "suspended"}`);
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  console.log("Form submission started");
  
  try {
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    showLoading(true);
    
    // Gather form data
    const formData = {
      firstName: getInputValue("first-name"),
      lastName: getInputValue("last-name"),
      email: getInputValue("email").toLowerCase(),
      phone: getInputValue("phone"),
      role: getInputValue("role"),
      licenseNumber: getInputValue("license-number"),
      suspended: !document.getElementById("account-status")?.checked,
      updated_at: serverTimestamp(),
      updated_by: currentUser.uid
    };
    
    // Add license issue date if provided
    const licenseDate = document.getElementById("license-issue-date")?.value;
    if (licenseDate) {
      formData.licenseIssueDate = new Date(licenseDate);
    }
    
    console.log("Updating user with data:", formData);
    
    // Check if email has changed
    const emailChanged = originalEmail !== formData.email;
    
    // Check if password change is requested
    const changePasswordCheckbox = document.getElementById("change-password");
    const newPasswordInput = document.getElementById("new-password");
    const confirmPasswordInput = document.getElementById("confirm-password");
    
    const passwordChanged = changePasswordCheckbox?.checked && 
                           newPasswordInput?.value && 
                           confirmPasswordInput?.value && 
                           newPasswordInput.value === confirmPasswordInput.value;
    
    // Update user document in Firestore
    await updateDoc(doc(db, "users", userId), formData);
    console.log("User document updated successfully");
    
    // Handle email or password changes with Firebase Auth
    if (emailChanged || passwordChanged) {
      try {
        console.log(`Auth updates needed: Email: ${emailChanged}, Password: ${passwordChanged}`);
        
        // Call Firebase Function to update auth user
        const updateAuthUser = httpsCallable(functions, 'updateAuthUser');
        
        // Prepare data based on what changed
        const authUpdateData = { userId: userId };
        
        if (emailChanged) {
          authUpdateData.email = formData.email;
        }
        
        if (passwordChanged) {
          authUpdateData.password = newPasswordInput.value;
        }
        
        await updateAuthUser(authUpdateData);
        console.log("Auth user updated successfully");
      } catch (authError) {
        console.error("Error updating auth user:", authError);
        showMessage("User data updated, but authentication details could not be changed.", "warning");
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
    
    // Navigate back after delay
    setTimeout(() => {
      navigateBack();
    }, 1500);
    
  } catch (error) {
    console.error("Error updating user:", error);
    showMessage(`Failed to update user: ${error.message}`, "error");
    showLoading(false);
  }
}

// Validate form inputs
function validateForm() {
  console.log("Validating form");
  
  // Check required fields
  const email = getInputValue("email");
  if (!email) {
    showMessage("Email is required", "error");
    focusElement("email");
    return false;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showMessage("Please enter a valid email address", "error");
    focusElement("email");
    return false;
  }
  
  // Validate phone format if provided
  const phone = getInputValue("phone");
  if (phone) {
    // Allow formats like (123) 456-7890, 123-456-7890, 1234567890, etc.
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,3}[-\s.]?[0-9]{4,6}$/;
    if (!phoneRegex.test(phone)) {
      showMessage("Please enter a valid phone number", "error");
      focusElement("phone");
      return false;
    }
  }
  
  // Validate role
  const role = getInputValue("role");
  if (!role) {
    showMessage("Please select a role", "error");
    focusElement("role");
    return false;
  }
  
  // Password validation if changing password
  const changePassword = document.getElementById("change-password")?.checked;
  if (changePassword) {
    const newPassword = getInputValue("new-password");
    const confirmPassword = getInputValue("confirm-password");
    
    if (!newPassword) {
      showMessage("Please enter a new password", "error");
      focusElement("new-password");
      return false;
    }
    
    if (newPassword.length < 8) {
      showMessage("Password must be at least 8 characters long", "error");
      focusElement("new-password");
      return false;
    }
    
    if (newPassword !== confirmPassword) {
      showMessage("Passwords do not match", "error");
      focusElement("confirm-password");
      return false;
    }
  }
  
  return true;
}

// Helper for getting input values
function getInputValue(id) {
  const input = document.getElementById(id);
  return input ? input.value.trim() : '';
}

// Helper for focusing elements
function focusElement(id) {
  setTimeout(() => {
    document.getElementById(id)?.focus();
  }, 100);
}

// Navigate back to previous page or user detail
function navigateBack() {
  if (returnUrl) {
    window.location.href = returnUrl;
  } else {
    window.location.href = `admin-user-detail.html?id=${userId}`;
  }
}

// Confirm delete account
function confirmDeleteAccount() {
  if (confirm("Are you sure you want to delete this user account? This action cannot be undone.")) {
    deleteAccount();
  }
}

// Delete user account
async function deleteAccount() {
  try {
    showLoading(true);
    console.log(`Starting deletion process for user ID: ${userId}`);
    
    // Call Firebase Function to delete auth user
    const deleteUser = httpsCallable(functions, 'deleteUser');
    await deleteUser({ userId });
    
    showMessage("User account deleted successfully", "success");
    
    setTimeout(() => {
      window.location.href = "admin-users.html";
    }, 1500);
  } catch (error) {
    console.error("Error deleting user:", error);
    showMessage(`Failed to delete user: ${error.message}`, "error");
    showLoading(false);
  }
}

// Format phone number on input
function formatPhoneNumber(input) {
  // Get input value and remove non-digit characters
  let value = input.value.replace(/\D/g, '');
  
  // Format based on length
  if (value.length <= 3) {
    // Do nothing
  } else if (value.length <= 6) {
    value = value.replace(/^(\d{3})(\d+)/, '$1-$2');
  } else {
    value = value.replace(/^(\d{3})(\d{3})(\d+)/, '$1-$2-$3');
  }
  
  // Update input value
  input.value = value;
}

// Show loading state
function showLoading(show) {
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? "flex" : "none";
  }
}

// Show error message
function showError(message) {
  console.error(message);
  
  // Create an error banner if it doesn't exist
  let errorBanner = document.getElementById("error-banner");
  if (!errorBanner) {
    errorBanner = document.createElement("div");
    errorBanner.id = "error-banner";
    errorBanner.className = "error-banner";
    
    const container = document.querySelector(".container");
    if (container) {
      container.insertBefore(errorBanner, container.firstChild);
    } else {
      document.body.insertBefore(errorBanner, document.body.firstChild);
    }
  }
  
  errorBanner.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${message}`;
  errorBanner.style.display = "flex";
  
  // Hide loading overlay
  showLoading(false);
}

// Show toast message
function showMessage(message, type = "info") {
  console.log(`${type.toUpperCase()}: ${message}`);
  
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }
  
  // Create toast element
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  // Set icon based on type
  let icon = "info-circle";
  if (type === "success") icon = "check-circle";
  if (type === "warning") icon = "exclamation-triangle";
  if (type === "error") icon = "x-circle";
  
  toast.innerHTML = `
    <i class="bi bi-${icon}"></i>
    <span>${escapeHTML(message)}</span>
  `;
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Show toast
  setTimeout(() => {
    toast.classList.add("show");
    
    // Auto-hide after delay
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }, 10);
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

// Initialize phone input formatting
document.addEventListener("DOMContentLoaded", () => {
  const phoneInput = document.getElementById("phone");
  if (phoneInput) {
    phoneInput.addEventListener("input", function() {
      formatPhoneNumber(this);
    });
  }
  
  // Ensure password fields are properly disabled initially
  const changePasswordCheckbox = document.getElementById("change-password");
  if (changePasswordCheckbox) {
    setPasswordFieldsState(changePasswordCheckbox.checked);
  }
});

// Set up form change detection
function detectFormChanges() {
  const inputs = document.querySelectorAll("input, select, textarea");
  inputs.forEach(input => {
    input.addEventListener("input", () => {
      hasChanges = true;
    });
    
    input.addEventListener("change", () => {
      hasChanges = true;
    });
  });
}

// Check for browser navigation before unload
window.addEventListener("beforeunload", (e) => {
  if (hasChanges) {
    const message = "You have unsaved changes that will be lost if you leave this page.";
    e.returnValue = message;
    return message;
  }
});