// admin-user-edit.js - Fixed imports
import { db, auth, functions } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { 
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import {
  httpsCallable
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-functions.js";

// Global variables
let currentUser = null;
let userId = null;
let userData = null;

// Initialize page
document.addEventListener("DOMContentLoaded", function() {
  console.log("User Edit page initializing");
  
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  userId = urlParams.get('id');
  
  if (!userId) {
    showError("No user ID provided");
    return;
  }
  
  // Setup password toggle functionality right away
  const changePasswordCheckbox = document.getElementById("change-password");
  if (changePasswordCheckbox) {
    changePasswordCheckbox.addEventListener("change", function() {
      const newPasswordField = document.getElementById("new-password");
      const confirmPasswordField = document.getElementById("confirm-password");
      
      if (newPasswordField && confirmPasswordField) {
        newPasswordField.disabled = !this.checked;
        confirmPasswordField.disabled = !this.checked;
        
        if (!this.checked) {
          newPasswordField.value = '';
          confirmPasswordField.value = '';
        }
      }
    });
  }
  
  // Setup password visibility toggle
  const toggleButtons = document.querySelectorAll(".toggle-password-btn");
  toggleButtons.forEach(btn => {
    btn.addEventListener("click", function() {
      const passwordField = this.parentElement.querySelector("input");
      const icon = this.querySelector("i");
      
      if (passwordField.type === "password") {
        passwordField.type = "text";
        icon.className = "bi bi-eye-slash";
      } else {
        passwordField.type = "password";
        icon.className = "bi bi-eye";
      }
    });
  });

  // Check authentication and load data
  onAuthStateChanged(auth, user => {
    if (user) {
      verifyAdmin(user);
    } else {
      window.location.href = "../index.html";
    }
  });
  
  // Setup form submission
  const form = document.getElementById("edit-user-form");
  if (form) {
    form.addEventListener("submit", handleSubmit);
  }
  
  // Setup account status toggle
  const statusToggle = document.getElementById("account-status");
  if (statusToggle) {
    statusToggle.addEventListener("change", function() {
      const statusText = document.getElementById("status-text");
      const statusCard = document.getElementById("status-action-card");
      const isActive = this.checked;
      
      if (statusText) {
        statusText.textContent = isActive ? "Active" : "Suspended";
        statusText.className = `toggle-text ${isActive ? "text-success" : "text-warning"}`;
      }
      
      if (statusCard) {
        statusCard.className = `action-card ${isActive ? "active" : "suspended"}`;
      }
    });
  }
  
  // Setup delete button
  const deleteBtn = document.getElementById("delete-account-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", function() {
      if (confirm("Are you sure you want to delete this account? This action cannot be undone.")) {
        deleteUser();
      }
    });
  }
});

// Verify admin status
async function verifyAdmin(user) {
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (userDoc.exists() && userDoc.data().role === "admin") {
      currentUser = {
        uid: user.uid,
        ...userDoc.data()
      };
      
      loadUserData();
    } else {
      showError("You don't have permission to access this page");
      setTimeout(() => {
        window.location.href = "../index.html";
      }, 2000);
    }
  } catch (error) {
    showError("Failed to verify permissions");
    console.error(error);
  }
}

// Load user data from Firestore
async function loadUserData() {
  showLoading(true);
  
  try {
    // Get user document
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      document.getElementById("user-not-found").style.display = "flex";
      document.getElementById("edit-form-container").style.display = "none";
      showLoading(false);
      return;
    }
    
    // Store user data
    userData = {
      id: userId,
      ...userDoc.data()
    };
    
    console.log("User data loaded:", userData);
    
    // Update page title
    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    const userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "User";
    
    document.getElementById("edit-user-title").innerHTML = `
      <i class="bi bi-pencil-square"></i> 
      Edit User: ${userName}
    `;
    
    document.title = `Edit ${userName} | Admin`;
    
    // Directly populate form fields
    populateForm();
    
    showLoading(false);
  } catch (error) {
    showError("Failed to load user data");
    console.error(error);
    showLoading(false);
  }
}

// Directly populate form fields
function populateForm() {
  // Direct access to form elements
  document.getElementById("first-name").value = userData.firstName || '';
  document.getElementById("last-name").value = userData.lastName || '';
  document.getElementById("email").value = userData.email || '';
  document.getElementById("phone").value = userData.phone || '';
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
  
  // Set role
  const roleSelect = document.getElementById("role");
  const userRole = userData.role || 'user';
  
  // Check existing options
  let foundOption = false;
  for (let i = 0; i < roleSelect.options.length; i++) {
    if (roleSelect.options[i].value === userRole) {
      roleSelect.selectedIndex = i;
      foundOption = true;
      break;
    }
  }
  
  // Add option if not found
  if (!foundOption) {
    const option = new Option(userRole, userRole);
    roleSelect.add(option);
    roleSelect.value = userRole;
  }
  
  // Set account status
  const statusToggle = document.getElementById("account-status");
  statusToggle.checked = userData.suspended !== true;
  
  // Update status text
  const statusText = document.getElementById("status-text");
  if (statusText) {
    statusText.textContent = statusToggle.checked ? "Active" : "Suspended";
    statusText.className = `toggle-text ${statusToggle.checked ? "text-success" : "text-warning"}`;
  }
  
  // Update status card
  const statusCard = document.getElementById("status-action-card");
  if (statusCard) {
    statusCard.className = `action-card ${statusToggle.checked ? "active" : "suspended"}`;
  }
  
  // Reset password fields
  document.getElementById("change-password").checked = false;
  document.getElementById("new-password").disabled = true;
  document.getElementById("confirm-password").disabled = true;
}

// Handle form submission
async function handleSubmit(e) {
  e.preventDefault();
  
  try {
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    showLoading(true);
    
    // Gather form data
    const formData = {
      firstName: document.getElementById("first-name").value.trim(),
      lastName: document.getElementById("last-name").value.trim(),
      email: document.getElementById("email").value.trim().toLowerCase(),
      phone: document.getElementById("phone").value.trim(),
      role: document.getElementById("role").value,
      licenseNumber: document.getElementById("license-number").value.trim(),
      suspended: !document.getElementById("account-status").checked,
      updatedAt: serverTimestamp()
    };
    
    // Add license date if provided
    const licenseDate = document.getElementById("license-issue-date").value;
    if (licenseDate) {
      formData.licenseIssueDate = new Date(licenseDate);
    }
    
    // Check for password change
    const changePassword = document.getElementById("change-password").checked;
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    
    // Update Firestore user document
    await updateDoc(doc(db, "users", userId), formData);
    console.log("User document updated in Firestore");
    
    // Update Authentication if password changed
    if (changePassword && newPassword && newPassword === confirmPassword) {
      try {
        console.log("Attempting to update user password...");
        // Use the Firebase Function to update the user's password
        const updateAuthUser = httpsCallable(functions, 'updateAuthUser');
        
        const result = await updateAuthUser({ 
          userId: userId, 
          password: newPassword 
        });
        
        console.log("Password update result:", result);
        
        if (result.data && result.data.error) {
          throw new Error(result.data.error);
        }
        
        console.log("Password updated successfully");
      } catch (error) {
        console.error("Error updating password:", error);
        
        // Show error but don't redirect immediately
        alert(`User updated but password change failed: ${error.message || "Unknown error"}`);
        showLoading(false);
        return;
      }
    }
    
    // Show success and redirect
    alert("User updated successfully");
    window.location.href = `admin-user-detail.html?id=${userId}`;
  } catch (error) {
    showError("Failed to update user: " + (error.message || "Unknown error"));
    console.error(error);
    showLoading(false);
  }
}

// Validate form with better password validation
function validateForm() {
  // Check email
  const email = document.getElementById("email").value.trim();
  if (!email) {
    alert("Email is required");
    document.getElementById("email").focus();
    return false;
  }
  
  // Email format validation
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    alert("Please enter a valid email address");
    document.getElementById("email").focus();
    return false;
  }
  
  // Check password match if changing password
  const changePassword = document.getElementById("change-password").checked;
  if (changePassword) {
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    
    if (!newPassword) {
      alert("Please enter a new password");
      document.getElementById("new-password").focus();
      return false;
    }
    
    // Password complexity check
    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters");
      document.getElementById("new-password").focus();
      return false;
    }
    
    // Password matching check
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      document.getElementById("confirm-password").focus();
      return false;
    }
  }
  
  return true;
}

// Delete user account
async function deleteUser() {
  showLoading(true);
  
  try {
    const deleteUser = httpsCallable(functions, 'deleteUser');
    await deleteUser({ userId: userId });
    
    alert("User deleted successfully");
    window.location.href = "admin-users.html";
  } catch (error) {
    showError("Failed to delete user");
    console.error(error);
    showLoading(false);
  }
}

// Helper functions
function showLoading(show) {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.display = show ? "flex" : "none";
  }
}

function showError(message) {
  console.error(message);
  alert(message);
  showLoading(false);
}