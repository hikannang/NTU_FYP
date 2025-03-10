import { db, auth, storage } from '../common/firebase-config.js';
import { 
    doc, 
    getDoc, 
    updateDoc, 
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { 
    onAuthStateChanged,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-storage.js";

// DOM Elements
const profileForm = document.getElementById('profile-form');
const emailForm = document.getElementById('email-form');
const passwordForm = document.getElementById('password-form');
const profilePicture = document.getElementById('profile-picture');
const profilePictureInput = document.getElementById('profile-picture-input');
const uploadPictureBtn = document.getElementById('upload-picture-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const reAuthModal = document.getElementById('reauth-modal');
const reAuthForm = document.getElementById('reauth-form');
const closeModalBtn = document.querySelectorAll('.close-modal');
const successMessage = document.getElementById('success-message');

// User data
let currentUser;
let userData;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html').then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html').then(response => response.text());
    
    // Setup logout button
    setupLogoutButton();

    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData(user.uid);
            setupEventListeners();
        } else {
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
});

function setupLogoutButton() {
    setTimeout(() => {
        const logoutButton = document.getElementById('logout-button');
        if (logoutButton) {
            logoutButton.addEventListener('click', async (event) => {
                event.preventDefault();
                try {
                    await signOut(auth);
                    window.location.href = "../index.html";
                } catch (error) {
                    console.error("Error during logout:", error);
                    alert("Logout failed: " + error.message);
                }
            });
        }
    }, 300);
}

// Load user data from Firestore
async function loadUserData(userId) {
    try {
        showLoading(true);
        
        // Get user document
        const userDoc = await getDoc(doc(db, 'users', userId));
        
        if (!userDoc.exists()) {
            showError("User profile not found.");
            return;
        }
        
        userData = userDoc.data();
        populateUserData();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showError("Failed to load user profile. Please try again.");
    } finally {
        showLoading(false);
    }
}

// Populate form fields with user data
function populateUserData() {
    // Profile information
    document.getElementById('first-name').value = userData.firstName || '';
    document.getElementById('last-name').value = userData.lastName || '';
    document.getElementById('phone').value = userData.phone || '';
    document.getElementById('address').value = userData.address || '';
    
    // License information
    document.getElementById('license-number').value = userData.licenseNumber || '';
    
    if (userData.licenseIssueDate) {
        const licenseDate = new Date(userData.licenseIssueDate.seconds * 1000);
        document.getElementById('license-issue-date').valueAsDate = licenseDate;
    }
    
    // Email
    document.getElementById('current-email').textContent = currentUser.email;
    document.getElementById('new-email').value = '';
    
    // Profile picture
    if (userData.profilePictureURL) {
        profilePicture.src = userData.profilePictureURL;
    } else {
        // Set default profile picture
        profilePicture.src = '../static/assets/images/default-profile.jpg';
    }
    
    // Update profile picture in header if exists
    const headerProfilePic = document.querySelector('.user-avatar img');
    if (headerProfilePic && userData.profilePictureURL) {
        headerProfilePic.src = userData.profilePictureURL;
    }
    
    // Set display name in header
    const welcomeMessage = document.getElementById('welcome-message');
    if (welcomeMessage) {
        welcomeMessage.textContent = `Hi, ${userData.firstName || 'User'}`;
    }
}

// Set up event listeners
function setupEventListeners() {
    // Tab navigation
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Hide all tab contents
            tabContents.forEach(content => {
                content.style.display = 'none';
            });
            
            // Remove active class from all tab buttons
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Show selected tab content and activate button
            const tabId = button.getAttribute('data-tab');
            document.getElementById(tabId).style.display = 'block';
            button.classList.add('active');
        });
    });
    
    // Profile form submission
    if (profileForm) {
        profileForm.addEventListener('submit', updateProfile);
    }
    
    // Email form submission
    if (emailForm) {
        emailForm.addEventListener('submit', updateEmailAddress);
    }
    
    // Password form submission
    if (passwordForm) {
        passwordForm.addEventListener('submit', updateUserPassword);
    }
    
    // Profile picture upload
    if (uploadPictureBtn) {
        uploadPictureBtn.addEventListener('click', () => {
            profilePictureInput.click();
        });
    }
    
    if (profilePictureInput) {
        profilePictureInput.addEventListener('change', uploadProfilePicture);
    }
    
    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }
    
    // Delete account button
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            reAuthModal.style.display = 'flex';
        });
    }
    
    // Re-authentication form
    if (reAuthForm) {
        reAuthForm.addEventListener('submit', handleReAuthentication);
    }
    
    // Close modal buttons
    closeModalBtn.forEach(button => {
        button.addEventListener('click', () => {
            reAuthModal.style.display = 'none';
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === reAuthModal) {
            reAuthModal.style.display = 'none';
        }
    });
}

// Update profile information
async function updateProfile(event) {
    event.preventDefault();
    
    try {
        showLoading(true);
        
        // Collect form data
        const updatedData = {
            firstName: document.getElementById('first-name').value.trim(),
            lastName: document.getElementById('last-name').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            address: document.getElementById('address').value.trim(),
            licenseNumber: document.getElementById('license-number').value.trim()
        };
        
        // Handle license date
        const licenseDateInput = document.getElementById('license-issue-date');
        if (licenseDateInput.value) {
            updatedData.licenseIssueDate = Timestamp.fromDate(new Date(licenseDateInput.value));
        }
        
        // Validate required fields
        if (!updatedData.firstName || !updatedData.lastName || !updatedData.phone || !updatedData.address || !updatedData.licenseNumber || !licenseDateInput.value) {
            showError("Please fill in all required fields.");
            return;
        }
        
        // Validate phone number (simple 8-digit check for Singapore)
        if (!/^\d{8}$/.test(updatedData.phone)) {
            showError("Please enter a valid 8-digit phone number.");
            return;
        }
        
        // Update user document
        await updateDoc(doc(db, 'users', currentUser.uid), updatedData);
        
        // Update local userData
        userData = { ...userData, ...updatedData };
        
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
            email: newEmail
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
        if (newPassword.length < 8) {
            showError("Password must be at least 8 characters long.");
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
        
        if (error.code === 'auth/wrong-password') {
            showError("Current password is incorrect.");
        } else if (error.code === 'auth/requires-recent-login') {
            showError("For security reasons, please log out and log back in before changing your password.");
        } else {
            showError("Failed to update password. Please try again.");
        }
    } finally {
        showLoading(false);
    }
}

// Upload profile picture
async function uploadProfilePicture(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.match('image.*')) {
        showError("Please select an image file (JPEG, PNG, etc.)");
        return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showError("Image file size must be less than 5MB.");
        return;
    }
    
    try {
        showLoading(true);
        
        // Create a reference to the storage location
        const storageRef = ref(storage, `profile-pictures/${currentUser.uid}/${file.name}`);
        
        // Upload file
        const snapshot = await uploadBytes(storageRef, file);
        
        // Get download URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        // Update user document with profile picture URL
        await updateDoc(doc(db, 'users', currentUser.uid), {
            profilePictureURL: downloadURL
        });
        
        // Update UI
        profilePicture.src = downloadURL;
        
        // Update profile picture in header if exists
        const headerProfilePic = document.querySelector('.user-avatar img');
        if (headerProfilePic) {
            headerProfilePic.src = downloadURL;
        }
        
        // Update local userData
        userData.profilePictureURL = downloadURL;
        
        // Show success message
        showSuccess("Profile picture updated successfully");
        
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        showError("Failed to upload profile picture. Please try again.");
    } finally {
        showLoading(false);
    }
}

// Handle re-authentication for secure operations
async function handleReAuthentication(event) {
    event.preventDefault();
    
    const password = document.getElementById('reauth-password').value;
    const action = reAuthForm.getAttribute('data-action');
    
    try {
        showLoading(true);
        
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        
        // Hide modal
        reAuthModal.style.display = 'none';
        
        // Perform action based on re-auth reason
        if (action === 'delete-account') {
            await deleteUserAccount();
        }
        
        // Reset form
        document.getElementById('reauth-password').value = '';
        
    } catch (error) {
        console.error('Error during re-authentication:', error);
        
        if (error.code === 'auth/wrong-password') {
            showError("Incorrect password. Please try again.");
        } else {
            showError("Re-authentication failed. Please try again.");
        }
    } finally {
        showLoading(false);
    }
}

// Delete user account
async function deleteUserAccount() {
    try {
        showLoading(true);
        
        // Check for active bookings before deleting
        const activeBookings = await checkActiveBookings();
        
        if (activeBookings > 0) {
            showError(`You have ${activeBookings} active booking(s). Please cancel all bookings before deleting your account.`);
            return;
        }
        
        // TODO: Implement account deletion logic
        // Note: This would typically involve:
        // 1. Marking the user as inactive in Firestore
        // 2. Calling Firebase Auth deleteUser method
        // 3. Cleaning up any user-specific data
        
        // For now, just log out the user
        await signOut(auth);
        window.location.href = '../index.html';
        
    } catch (error) {
        console.error('Error deleting account:', error);
        showError("Failed to delete account. Please try again.");
    } finally {
        showLoading(false);
    }
}

// Check for active bookings
async function checkActiveBookings() {
    // This is a placeholder function that should be implemented
    // based on your booking data structure
    return 0;
}

// Log out user
async function logoutUser() {
    try {
        await signOut(auth);
        window.location.href = '../index.html';
    } catch (error) {
        console.error('Error signing out:', error);
        showError("Failed to log out. Please try again.");
    }
}

// Show loading overlay
function showLoading(show) {
    if (loadingOverlay) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('error-message');
    
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        // Hide after 5 seconds
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}

// Show success message
function showSuccess(message) {
    if (successMessage) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        
        // Hide after 5 seconds
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 5000);
    }
}