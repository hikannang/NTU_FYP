// admin-user-edit.js - Updated with fixes
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

  // Form input change detection
  const formInputs = editUserForm.querySelectorAll("input, select, textarea");
  formInputs.forEach((input) => {
    input.addEventListener("change", handleFormChange);
    input.addEventListener("input", handleFormChange);
  });

  // Password change toggle
  if (changePasswordCheckbox) {
    changePasswordCheckbox.addEventListener("change", togglePasswordFields);
  }

  // Password strength checking
  if (newPasswordInput) {
    newPasswordInput.addEventListener("input", checkPasswordStrength);
  }

  // Password match checking
  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener("input", checkPasswordMatch);
  }

  // Password visibility toggle buttons
  if (togglePasswordBtns) {
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

  // Unsaved changes banner buttons
  if (discardChangesBtn) {
    discardChangesBtn.addEventListener("click", discardChanges);
  }

  if (saveChangesBtn) {
    saveChangesBtn.addEventListener("click", () => {
      if (editUserForm) {
        editUserForm.dispatchEvent(new Event("submit"));
      }
    });
  }

  // Modal buttons
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", closeModal);
  }

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
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
      ...userDoc.data(),
    };

    console.log("User data loaded:", userData);

    // Store original email for comparison
    originalEmail = userData.email;

    // Update page title with user name
    const firstName = userData.firstName || "";
    const lastName = userData.lastName || "";
    const userName =
      firstName || lastName ? `${firstName} ${lastName}`.trim() : "User";

    if (editUserTitle) {
      editUserTitle.innerHTML = `
        <i class="bi bi-pencil-square"></i> 
        Edit User: ${safeText(userName)}
      `;
    }

    document.title = `Edit ${userName} | Admin Dashboard`;

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
  if (firstNameInput) firstNameInput.value = userData.firstName || "";
  if (lastNameInput) lastNameInput.value = userData.lastName || "";
  if (emailInput) emailInput.value = userData.email || "";
  if (phoneInput) phoneInput.value = userData.phone || "";

  // Set license information
  if (licenseNumberInput)
    licenseNumberInput.value = userData.licenseNumber || "";

  if (licenseIssueDateInput && userData.licenseIssueDate) {
    let licenseDate;

    if (userData.licenseIssueDate instanceof Date) {
      licenseDate = userData.licenseIssueDate;
    } else if (userData.licenseIssueDate.toDate) {
      licenseDate = userData.licenseIssueDate.toDate();
    } else if (typeof userData.licenseIssueDate === "string") {
      licenseDate = new Date(userData.licenseIssueDate);
    }

    if (licenseDate && !isNaN(licenseDate)) {
      // Format date as YYYY-MM-DD for input[type="date"]
      const year = licenseDate.getFullYear();
      const month = String(licenseDate.getMonth() + 1).padStart(2, "0");
      const day = String(licenseDate.getDate()).padStart(2, "0");
      licenseIssueDateInput.value = `${year}-${month}-${day}`;
    }
  }

  // Set role select
  if (roleSelect) {
    const userRole = userData.role || "user";

    // Find and select the option with the matching value
    for (let i = 0; i < roleSelect.options.length; i++) {
      if (roleSelect.options[i].value === userRole) {
        roleSelect.options[i].selected = true;
        break;
      }
    }

    // If no matching option, add one
    if (
      !Array.from(roleSelect.options).some(
        (option) => option.value === userRole
      )
    ) {
      const newOption = document.createElement("option");
      newOption.value = userRole;
      newOption.textContent =
        userRole.charAt(0).toUpperCase() + userRole.slice(1);
      newOption.selected = true;
      roleSelect.appendChild(newOption);
    }
  }

  // Set account status
  if (accountStatusToggle) {
    // Default to active if suspended is not specifically set to true
    const isActive = userData.suspended !== true;
    accountStatusToggle.checked = isActive;
    updateStatusText();
  }

  // Reset password fields
  if (changePasswordCheckbox) changePasswordCheckbox.checked = false;
  if (passwordFields) safeSetDisplay(passwordFields, "none");
  if (newPasswordInput) newPasswordInput.value = "";
  if (confirmPasswordInput) confirmPasswordInput.value = "";
  if (passwordStrengthMeter) {
    passwordStrengthMeter.style.width = "0%";
    passwordStrengthMeter.className = "password-strength";
  }

  // Reset form change state
  hasChanges = false;
  safeSetDisplay(unsavedChanges, "none");
}

// Toggle password fields visibility
function togglePasswordFields() {
  if (!passwordFields || !changePasswordCheckbox) return;

  const isChecked = changePasswordCheckbox.checked;

  // Update aria-expanded attribute
  changePasswordCheckbox.setAttribute(
    "aria-expanded",
    isChecked ? "true" : "false"
  );

  safeSetDisplay(passwordFields, isChecked ? "block" : "none");

  // Enable/disable password fields based on toggle
  if (newPasswordInput) newPasswordInput.disabled = !isChecked;
  if (confirmPasswordInput) confirmPasswordInput.disabled = !isChecked;

  // Reset password fields when hiding
  if (!isChecked) {
    if (newPasswordInput) newPasswordInput.value = "";
    if (confirmPasswordInput) confirmPasswordInput.value = "";
    if (passwordStrengthMeter) {
      passwordStrengthMeter.style.width = "0%";
      passwordStrengthMeter.className = "password-strength";
    }

    // Reset requirement indicators
    if (passwordRequirements) {
      passwordRequirements.forEach((req) => {
        req.classList.remove("met");
      });
    }

    // Reset match indicator
    const matchIndicator = document.getElementById("password-match-indicator");
    if (matchIndicator) {
      matchIndicator.textContent = "";
      matchIndicator.className = "match-indicator";
    }
  }

  // Mark form as changed
  handleFormChange();
}

// Handle form changes
function handleFormChange() {
  hasChanges = true;
  safeSetDisplay(unsavedChanges, "flex");

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

function updateStatusText() {
  if (!accountStatusToggle || !statusText) return;

  const isActive = accountStatusToggle.checked;
  statusText.textContent = isActive ? "Active" : "Suspended";
  statusText.className = `toggle-text ${
    isActive ? "text-success" : "text-warning"
  }`;

  // Add status card styling
  const statusCard = document.getElementById("status-action-card");
  if (statusCard) {
    statusCard.className = `action-card ${isActive ? "active" : "suspended"}`;
  }

  handleFormChange();
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
