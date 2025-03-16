import { db, auth, functions } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  updatePassword,
  updateEmail,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Import utility functions
import {
  formatDate,
  formatPhone,
  safeSetLoading,
  showError,
  showMessage,
  safeText,
  safeSetDisplay,
} from "./admin-users.js";

// Global variables
let currentUser = null;
let userId = null;
let userData = null;
let originalEmail = null;
let returnUrl = null;
let hasChanges = false;

// DOM Elements
let loadingOverlay = null;
let userNotFound = null;
let editFormContainer = null;
let editUserTitle = null;
let editUserForm = null;
let unsavedChanges = null;

// Form elements
let userIdInput = null;
let firstNameInput = null;
let lastNameInput = null;
let emailInput = null;
let phoneInput = null;
let roleSelect = null;
let licenseNumberInput = null;
let licenseIssueDateInput = null;

// Password fields
let changePasswordCheckbox = null;
let passwordFields = null;
let newPasswordInput = null;
let confirmPasswordInput = null;
let passwordStrengthMeter = null;
let passwordStrengthText = null;
let passwordRequirements = null;
let togglePasswordBtns = null;

// Account status elements
let accountStatusToggle = null;
let statusText = null;

// Button elements
let cancelBtn = null;
let cancelFormBtn = null;
let saveUserBtn = null;
let deleteAccountBtn = null;
let discardChangesBtn = null;
let saveChangesBtn = null;

// Modal elements
let confirmationModal = null;
let modalTitle = null;
let modalBody = null;
let modalCancelBtn = null;
let modalConfirmBtn = null;
let modalClose = null;

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("User Edit page loading");

  // Get DOM Elements
  loadingOverlay = document.getElementById("loading-overlay");
  userNotFound = document.getElementById("user-not-found");
  editFormContainer = document.getElementById("edit-form-container");
  editUserTitle = document.getElementById("edit-user-title");
  editUserForm = document.getElementById("edit-user-form");
  unsavedChanges = document.getElementById("unsaved-changes");

  // Form elements
  userIdInput = document.getElementById("user-id");
  firstNameInput = document.getElementById("first-name");
  lastNameInput = document.getElementById("last-name");
  emailInput = document.getElementById("email");
  phoneInput = document.getElementById("phone");
  roleSelect = document.getElementById("role");
  licenseNumberInput = document.getElementById("license-number");
  licenseIssueDateInput = document.getElementById("license-issue-date");

  // Password fields
  changePasswordCheckbox = document.getElementById("change-password");
  passwordFields = document.getElementById("password-fields");
  newPasswordInput = document.getElementById("new-password");
  confirmPasswordInput = document.getElementById("confirm-password");
  passwordStrengthMeter = document.getElementById("password-strength");
  passwordStrengthText = document.getElementById("password-strength-text");
  passwordRequirements = document.querySelectorAll(".requirement");
  togglePasswordBtns = document.querySelectorAll(".toggle-password-btn");

  // Account status elements
  accountStatusToggle = document.getElementById("account-status");
  statusText = document.getElementById("status-text");

  // Button elements
  cancelBtn = document.getElementById("cancel-btn");
  cancelFormBtn = document.getElementById("cancel-form-btn");
  saveUserBtn = document.getElementById("save-user-btn");
  deleteAccountBtn = document.getElementById("delete-account-btn");
  discardChangesBtn = document.getElementById("discard-changes");
  saveChangesBtn = document.getElementById("save-changes-btn");

  // Modal elements
  confirmationModal = document.getElementById("confirmation-modal");
  modalTitle = document.getElementById("modal-title");
  modalBody = document.getElementById("modal-body");
  modalCancelBtn = document.getElementById("modal-cancel-btn");
  modalConfirmBtn = document.getElementById("modal-confirm-btn");
  modalClose = document.querySelector(".modal-close");

  // Get user ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  userId = urlParams.get("id");
  returnUrl = urlParams.get("returnUrl");

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
              ...userDoc.data(),
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
  // Form submission
  if (editUserForm) {
    editUserForm.addEventListener("submit", handleFormSubmit);
    
    // Form input change detection
    const formInputs = editUserForm.querySelectorAll("input, select");
    formInputs.forEach((input) => {
      input.addEventListener("change", handleFormChange);
    });
  }
  
  // Password change toggle - direct event attachment
  if (changePasswordCheckbox) {
    console.log("Adding event listener to password checkbox");
    changePasswordCheckbox.addEventListener("change", function() {
      console.log("Checkbox changed:", this.checked);
      togglePasswordFields();
    });
  }
  
  // Password visibility toggle buttons
  if (togglePasswordBtns && togglePasswordBtns.length > 0) {
    togglePasswordBtns.forEach((btn) => {
      btn.addEventListener("click", togglePasswordVisibility);
    });
  }
  
  // Account status toggle
  if (accountStatusToggle) {
    accountStatusToggle.addEventListener("change", updateStatusText);
  }
  
  // Delete account button
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", confirmDeleteAccount);
  }
}

// Load user data - completely rewritten to match your database structure
async function loadUserData() {
  try {
    if (!userId) {
      console.error("No user ID provided");
      showError("No user ID provided");
      return;
    }
    
    safeSetLoading(true);
    console.log(`Loading user data for ID: ${userId}`);
    
    // Get user document from correct path
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("User document not found");
      safeSetDisplay(userNotFound, "flex");
      safeSetDisplay(editFormContainer, "none");
      safeSetLoading(false);
      return;
    }
    
    // Store user data globally with exact field names from schema
    userData = {
      id: userId,
      ...userDoc.data()
    };
    
    // Log the exact data we received
    console.log("Raw user data from Firestore:", userDoc.data());
    console.log("Processed user data object:", userData);
    
    // Store original email for comparison
    originalEmail = userData.email || '';
    
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
    
    // Call the populate function directly (with debug logging)
    console.log("About to populate form fields...");
    populateFormWithDebug(userData);
    
    safeSetLoading(false);
  } catch (error) {
    console.error("Error loading user data:", error);
    showError(`Failed to load user data: ${error.message}`);
    safeSetLoading(false);
  }
}

// Enhanced populate form function with detailed debugging
function populateFormWithDebug(userData) {
  console.log("==== FORM POPULATION DEBUG ====");
  
  // Check if userData is valid
  if (!userData) {
    console.error("Cannot populate form: userData is null or undefined");
    return;
  }
  
  // Check for form elements
  console.log("Checking for form elements...");
  if (!firstNameInput) console.error("firstNameInput element not found in DOM");
  if (!lastNameInput) console.error("lastNameInput element not found in DOM");
  if (!emailInput) console.error("emailInput element not found in DOM");
  if (!phoneInput) console.error("phoneInput element not found in DOM");
  if (!roleSelect) console.error("roleSelect element not found in DOM");
  if (!licenseNumberInput) console.error("licenseNumberInput element not found in DOM");
  if (!licenseIssueDateInput) console.error("licenseIssueDateInput element not found in DOM");
  if (!accountStatusToggle) console.error("accountStatusToggle element not found in DOM");
  
  // Set user ID (hidden field)
  if (userIdInput) {
    userIdInput.value = userData.id || '';
    console.log("userIdInput set to:", userIdInput.value);
  }
  
  // Basic user information
  console.log("Setting basic user information...");
  
  // First name
  if (firstNameInput) {
    firstNameInput.value = userData.firstName || '';
    console.log(`firstName: "${userData.firstName || ''}" → field value: "${firstNameInput.value}"`);
  }
  
  // Last name
  if (lastNameInput) {
    lastNameInput.value = userData.lastName || '';
    console.log(`lastName: "${userData.lastName || ''}" → field value: "${lastNameInput.value}"`);
  }
  
  // Email
  if (emailInput) {
    emailInput.value = userData.email || '';
    console.log(`email: "${userData.email || ''}" → field value: "${emailInput.value}"`);
  }
  
  // Phone
  if (phoneInput) {
    phoneInput.value = userData.phone || '';
    console.log(`phone: "${userData.phone || ''}" → field value: "${phoneInput.value}"`);
  }
  
  // License information
  console.log("Setting license information...");
  
  // License number
  if (licenseNumberInput) {
    licenseNumberInput.value = userData.licenseNumber || '';
    console.log(`licenseNumber: "${userData.licenseNumber || ''}" → field value: "${licenseNumberInput.value}"`);
  }
  
  // License issue date
  if (licenseIssueDateInput) {
    console.log("Raw licenseIssueDate value:", userData.licenseIssueDate);
    
    let dateValue = '';
    
    try {
      if (userData.licenseIssueDate) {
        let licenseDate = null;
        
        // Handle different date formats from Firestore
        if (userData.licenseIssueDate instanceof Date) {
          licenseDate = userData.licenseIssueDate;
          console.log("licenseIssueDate is a Date object");
        } 
        else if (userData.licenseIssueDate.toDate && typeof userData.licenseIssueDate.toDate === 'function') {
          licenseDate = userData.licenseIssueDate.toDate();
          console.log("licenseIssueDate is a Firestore Timestamp");
        }
        else if (userData.licenseIssueDate.seconds) {
          licenseDate = new Date(userData.licenseIssueDate.seconds * 1000);
          console.log("licenseIssueDate has seconds property");
        }
        else if (typeof userData.licenseIssueDate === 'string') {
          licenseDate = new Date(userData.licenseIssueDate);
          console.log("licenseIssueDate is a string");
        }
        else if (typeof userData.licenseIssueDate === 'number') {
          licenseDate = new Date(userData.licenseIssueDate);
          console.log("licenseIssueDate is a number");
        }
        
        if (licenseDate && !isNaN(licenseDate)) {
          const year = licenseDate.getFullYear();
          const month = String(licenseDate.getMonth() + 1).padStart(2, '0');
          const day = String(licenseDate.getDate()).padStart(2, '0');
          dateValue = `${year}-${month}-${day}`;
          console.log(`Formatted date: ${dateValue}`);
        } else {
          console.error("Could not convert licenseIssueDate to valid Date");
        }
      }
    } catch (err) {
      console.error("Error processing license date:", err);
    }
    
    licenseIssueDateInput.value = dateValue;
    console.log(`licenseIssueDate → field value: "${licenseIssueDateInput.value}"`);
  }
  
  // Role select
  console.log("Setting role select...");
  if (roleSelect) {
    const userRole = userData.role || 'user';
    console.log(`User role from data: "${userRole}"`);
    
    // Find and select matching option
    let optionFound = false;
    for (let i = 0; i < roleSelect.options.length; i++) {
      if (roleSelect.options[i].value === userRole) {
        roleSelect.selectedIndex = i;
        optionFound = true;
        console.log(`Found matching role option at index ${i}`);
        break;
      }
    }
    
    // Add new option if not found
    if (!optionFound) {
      console.log(`No matching role option found, creating new option for "${userRole}"`);
      const newOption = document.createElement('option');
      newOption.value = userRole;
      newOption.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
      newOption.selected = true;
      roleSelect.appendChild(newOption);
    }
    
    console.log(`Role select value set to: "${roleSelect.value}"`);
  }
  
  // Account status
  console.log("Setting account status...");
  if (accountStatusToggle) {
    // Default to active if suspended is not explicitly true
    const isActive = userData.suspended !== true;
    accountStatusToggle.checked = isActive;
    console.log(`suspended: ${userData.suspended}, isActive: ${isActive}, toggle checked: ${accountStatusToggle.checked}`);
    
    // Update status text
    if (statusText) {
      statusText.textContent = isActive ? 'Active' : 'Suspended';
      statusText.className = `toggle-text ${isActive ? 'text-success' : 'text-warning'}`;
      console.log(`Status text updated to: "${statusText.textContent}"`);
    }
    
    // Update status card
    const statusCard = document.getElementById('status-action-card');
    if (statusCard) {
      statusCard.className = `action-card ${isActive ? 'active' : 'suspended'}`;
      console.log(`Status card class updated to: "${statusCard.className}"`);
    }
  }
  
  // Password fields
  console.log("Resetting password fields...");
  if (changePasswordCheckbox) {
    changePasswordCheckbox.checked = false;
    console.log("Password checkbox unchecked");
  }
  
  if (newPasswordInput) {
    newPasswordInput.value = '';
    newPasswordInput.disabled = true;
    console.log("New password field cleared and disabled");
  }
  
  if (confirmPasswordInput) {
    confirmPasswordInput.value = '';
    confirmPasswordInput.disabled = true;
    console.log("Confirm password field cleared and disabled");
  }
  
  console.log("==== FORM POPULATION COMPLETE ====");
  
  // Return true to indicate successful population
  return true;
}

// Make sure event listeners are properly set up for password toggle
function setupPasswordToggle() {
  if (changePasswordCheckbox) {
    console.log("Setting up password toggle...");
    
    // Remove existing event listeners to prevent duplicates
    changePasswordCheckbox.removeEventListener('change', togglePasswordFields);
    
    // Add fresh event listener
    changePasswordCheckbox.addEventListener('change', function() {
      console.log("Password checkbox changed to:", this.checked);
      
      // Manually set disabled state on password fields
      if (newPasswordInput) {
        newPasswordInput.disabled = !this.checked;
        console.log("New password field disabled:", newPasswordInput.disabled);
      }
      
      if (confirmPasswordInput) {
        confirmPasswordInput.disabled = !this.checked;
        console.log("Confirm password field disabled:", confirmPasswordInput.disabled);
      }
      
      // Clear password fields when disabling
      if (!this.checked) {
        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmPasswordInput) confirmPasswordInput.value = '';
        console.log("Password fields cleared");
      }
    });
    
    console.log("Password toggle setup complete");
  } else {
    console.error("Password checkbox element not found");
  }
}

// Add this to your setupEventListeners function or call directly
document.addEventListener('DOMContentLoaded', function() {
  // Wait for DOM to fully load, then set up event listeners
  setTimeout(() => {
    console.log("DOMContentLoaded - Setting up password toggle");
    setupPasswordToggle();
  }, 500);
});

// Handle form changes
function handleFormChange() {
  hasChanges = true;
  safeSetDisplay(unsavedChanges, "flex");

  // Enable save button
  if (saveUserBtn) saveUserBtn.disabled = false;
}

// Helper function to safely handle element display
function safeSetDisplay(element, displayValue) {
    if (element && element.style) {
      element.style.display = displayValue;
    }
  }

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  
  // Only include password if change-password is checked
  const changePassword = document.getElementById("change-password").checked;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  
  if (changePassword) {
    // Validate password fields
    if (!newPassword || newPassword !== confirmPassword) {
      showMessage("Passwords don't match or are empty", "error");
      return;
    }
  }
  
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
      suspended: !accountStatusToggle.checked, // This is inverse of 'active'
      updated_at: serverTimestamp(),
      updated_by: currentUser.uid,
    };

    // Add license issue date if provided
    if (licenseIssueDateInput.value) {
      formData.licenseIssueDate = new Date(licenseIssueDateInput.value);
    }

    console.log("Updating user with data:", formData);

    // Check if email has changed
    const emailChanged = originalEmail !== formData.email;

    // Check if password change is requested
    const passwordChanged =
      changePasswordCheckbox.checked &&
      newPasswordInput.value &&
      confirmPasswordInput.value &&
      newPasswordInput.value === confirmPasswordInput.value;

    // Update user document in Firestore
    await updateDoc(doc(db, "users", userId), formData);

    // Handle email or password changes with Firebase Auth
    if (emailChanged || passwordChanged) {
      try {
        // Call Firebase Function to update auth user
        const updateAuthUser = httpsCallable(functions, "updateAuthUser");

        // Prepare data based on what changed
        const authUpdateData = {
          userId: userId,
        };

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
        showMessage(
          "User data updated, but authentication details could not be changed.",
          "warning"
        );
        safeSetLoading(false);

        // Return to user detail page after delay
        setTimeout(() => {
          navigateBack();
        }, 3000);
        return;
      }
    }

    // Reset form state
    hasChanges = false;
    safeSetDisplay(unsavedChanges, "none");

    // Show success message
    showMessage("User updated successfully", "success");

    // Navigate back after delay
    setTimeout(() => {
      navigateBack();
    }, 1500);
  } catch (error) {
    console.error("Error updating user:", error);
    showMessage(`Failed to update user: ${error.message}`, "error");
    safeSetLoading(false);
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

  // Validate phone format if provided
  const phoneValue = phoneInput.value.trim();
  if (phoneValue) {
    // Allow formats like (123) 456-7890, 123-456-7890, 1234567890, etc.
    const phoneRegex =
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,3}[-\s.]?[0-9]{4,6}$/;
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
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!newPassword) {
      showMessage("Please enter a new password", "error");
      newPasswordInput.focus();
      return false;
    }

    if (newPassword.length < 8) {
      showMessage("Password must be at least 8 characters long", "error");
      newPasswordInput.focus();
      return false;
    }

    if (!validatePasswordStrength(newPassword)) {
      showMessage("Password doesn't meet the requirements", "error");
      newPasswordInput.focus();
      return false;
    }

    if (newPassword !== confirmPassword) {
      showMessage("Passwords do not match", "error");
      confirmPasswordInput.focus();
      return false;
    }
  }

  return true;
}

// Check password strength
function checkPasswordStrength() {
  if (!newPasswordInput || !passwordStrengthMeter || !passwordStrengthText)
    return;

  const password = newPasswordInput.value;
  let strength = 0;
  let status = "";

  // Update requirement indicators
  const hasLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  // Update UI for requirements
  updateRequirement("req-length", hasLength);
  updateRequirement("req-uppercase", hasUpperCase);
  updateRequirement("req-lowercase", hasLowerCase);
  updateRequirement("req-number", hasNumber);
  updateRequirement("req-special", hasSpecial);

  // Calculate strength
  if (hasLength) strength += 1;
  if (hasUpperCase) strength += 1;
  if (hasLowerCase) strength += 1;
  if (hasNumber) strength += 1;
  if (hasSpecial) strength += 1;

  // Update strength indicator
  switch (strength) {
    case 0:
    case 1:
      passwordStrengthMeter.className = "password-strength";
      passwordStrengthMeter.style.width = "10%";
      status = "Very Weak";
      break;
    case 2:
      passwordStrengthMeter.className = "password-strength weak";
      passwordStrengthMeter.style.width = "25%";
      status = "Weak";
      break;
    case 3:
      passwordStrengthMeter.className = "password-strength medium";
      passwordStrengthMeter.style.width = "50%";
      status = "Medium";
      break;
    case 4:
      passwordStrengthMeter.className = "password-strength strong";
      passwordStrengthMeter.style.width = "75%";
      status = "Strong";
      break;
    case 5:
      passwordStrengthMeter.className = "password-strength very-strong";
      passwordStrengthMeter.style.width = "100%";
      status = "Very Strong";
      break;
  }

  // Update text
  passwordStrengthText.textContent = status;

  // Check match if confirm password has text
  if (confirmPasswordInput.value) {
    checkPasswordMatch();
  }
}

// Update a requirement indicator
function updateRequirement(id, isMet) {
  const req = document.getElementById(id);
  if (req) {
    if (isMet) {
      req.classList.add("met");
    } else {
      req.classList.remove("met");
    }
  }
}

// Validate password strength for form submission
function validatePasswordStrength(password) {
  const hasLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  // Return true if password meets minimum requirements
  return (
    hasLength && (hasUpperCase || hasLowerCase) && (hasNumber || hasSpecial)
  );
}

// Check password match
function checkPasswordMatch() {
  if (!newPasswordInput || !confirmPasswordInput) return;

  const password = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const matchIndicator = document.getElementById("password-match-indicator");

  if (matchIndicator) {
    if (!confirmPassword) {
      matchIndicator.textContent = "";
      matchIndicator.className = "match-indicator";
    } else if (password === confirmPassword) {
      matchIndicator.textContent = "Passwords match";
      matchIndicator.className = "match-indicator match";
    } else {
      matchIndicator.textContent = "Passwords do not match";
      matchIndicator.className = "match-indicator no-match";
    }
  }
}

// Toggle password visibility
function togglePasswordVisibility(e) {
  const button = e.currentTarget;
  const passwordInput = button.parentElement.querySelector("input");
  const icon = button.querySelector("i");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    icon.className = "bi bi-eye-slash";
  } else {
    passwordInput.type = "password";
    icon.className = "bi bi-eye";
  }
}

// Update account status text and styling
function updateStatusText() {
    if (!accountStatusToggle || !statusText) return;
    
    const isActive = accountStatusToggle.checked;
    
    if (statusText) {
      statusText.textContent = isActive ? 'Active' : 'Suspended';
      statusText.className = `toggle-text ${isActive ? 'text-success' : 'text-warning'}`;
    }
    
    // Update status card styling if element exists
    const statusCard = document.getElementById('status-action-card');
    if (statusCard) {
      statusCard.className = `action-card ${isActive ? 'active' : 'suspended'}`;
    }
  }

// Handle cancel button click
function handleCancel() {
  if (hasChanges) {
    showConfirmation(
      "Discard Changes",
      "You have unsaved changes. Are you sure you want to leave this page?",
      discardChanges
    );
  } else {
    navigateBack();
  }
}

// Discard changes and return
function discardChanges() {
  hasChanges = false;
  navigateBack();
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
  showConfirmation(
    "Delete Account",
    `Are you sure you want to delete this user account? This action cannot be undone. All user data will be permanently deleted.`,
    deleteAccount
  );
}

// Delete user account
async function deleteAccount() {
  try {
    safeSetLoading(true);

    // Call Firebase Function to delete auth user
    const deleteUser = httpsCallable(functions, "deleteUser");
    await deleteUser({ userId: userId });

    showMessage("User account deleted successfully", "success");

    setTimeout(() => {
      window.location.href = "admin-users.html";
    }, 1500);
  } catch (error) {
    console.error("Error deleting user:", error);
    showMessage(`Failed to delete user: ${error.message}`, "error");
    safeSetLoading(false);
  }
}

// Show confirmation modal
function showConfirmation(title, message, confirmAction) {
  if (!confirmationModal || !modalTitle || !modalBody || !modalConfirmBtn)
    return;

  modalTitle.innerHTML = `<i class="bi bi-question-circle"></i> ${title}`;
  modalBody.textContent = message;

  // Set confirm action
  modalConfirmBtn.onclick = () => {
    closeModal();
    confirmAction();
  };

  // Show modal
  confirmationModal.classList.add("show");
}

// Close confirmation modal
function closeModal() {
  if (!confirmationModal) return;
  confirmationModal.classList.remove("show");
}
