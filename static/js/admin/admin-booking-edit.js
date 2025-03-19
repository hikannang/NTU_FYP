import { db, auth } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Debug flag - set to true to enable detailed logging
const DEBUG = true;

function debug(...args) {
  if (DEBUG) console.log(...args);
}

debug("ADMIN-BOOKING-EDIT.JS LOADED");

// Global variables
let currentUser = null;
let bookingId = null;
let booking = null;
let userData = null;
let carData = null;
let originalStatus = null;
let originalStartTime = null;
let originalEndTime = null;
let originalPrice = null;
let hasChanges = false;
let isInitialLoad = true;

// DOM Elements
let form = null;
let statusSelect = null;
let startDateInput = null;
let startTimeInput = null;
let endDateInput = null;
let endTimeInput = null;
let priceInput = null;
let notesInput = null;
let saveBtn = null;
let cancelBtn = null;
let backBtn = null;
let loadingOverlay = null;

// Initialize the page
document.addEventListener("DOMContentLoaded", async function() {
  debug("DOM loaded, initializing admin booking edit page");
  
  try {
    // Load header and footer
    document.getElementById("header").innerHTML = await fetch(
      "../static/headerFooter/admin-header.html"
    ).then(response => response.text());
    
    document.getElementById("footer").innerHTML = await fetch(
      "../static/headerFooter/admin-footer.html"
    ).then(response => response.text());
    
    // Find and store DOM elements
    form = document.getElementById("booking-edit-form");
    statusSelect = document.getElementById("booking-status");
    startDateInput = document.getElementById("start-date");
    startTimeInput = document.getElementById("start-time");
    endDateInput = document.getElementById("end-date");
    endTimeInput = document.getElementById("end-time");
    priceInput = document.getElementById("total-price");
    notesInput = document.getElementById("booking-notes");
    saveBtn = document.getElementById("save-btn");
    cancelBtn = document.getElementById("cancel-btn");
    backBtn = document.getElementById("back-btn");
    loadingOverlay = document.getElementById("loading-overlay");
    
    // Check for booking ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    bookingId = urlParams.get('id');
    
    if (!bookingId) {
      showMessage("No booking ID provided", "error");
      goBackToBookings();
      return;
    }
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get user document
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (!userDoc.exists()) {
            console.error("User document not found");
            window.location.href = "../index.html";
            return;
          }
          
          const userData = userDoc.data();
          if (userData.role !== 'admin') {
            console.warn("Non-admin user accessing admin page");
            window.location.href = "../user/user-dashboard.html";
            return;
          }
          
          currentUser = {
            uid: user.uid,
            ...userData
          };
          
          debug("Admin authenticated:", currentUser.firstName);
          
          // Now that user is authenticated, set up the page
          setupPage();
        } catch (error) {
          console.error("Error loading user data:", error);
          showMessage("Error loading user data. Please try again later.", "error");
        }
      } else {
        // Not logged in
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("Error initializing page:", error);
    showMessage("Failed to initialize the page. Please try refreshing.", "error");
  }
});

// Set up the page
async function setupPage() {
  debug("Setting up booking edit page for booking ID:", bookingId);
  
  // Load booking data
  await loadBookingData();
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up change detection
  setupChangeDetection();
}

// Load booking data from Firestore
async function loadBookingData() {
  try {
    debug("Loading booking data for ID:", bookingId);
    setLoading(true);
    
    // Get booking document
    const bookingDoc = await getDoc(doc(db, "bookings", bookingId));
    
    if (!bookingDoc.exists()) {
      showMessage("Booking not found", "error");
      goBackToBookings();
      return false;
    }
    
    booking = {
      id: bookingId,
      ...bookingDoc.data()
    };
    
    debug("Retrieved booking data:", booking);
    
    // Store original values for change detection
    originalStatus = booking.status;
    originalPrice = booking.total_price;
    
    if (booking.start_time) {
      originalStartTime = booking.start_time instanceof Timestamp ? 
        booking.start_time.toDate() : new Date(booking.start_time);
    }
    
    if (booking.end_time) {
      originalEndTime = booking.end_time instanceof Timestamp ? 
        booking.end_time.toDate() : new Date(booking.end_time);
    }
    
    // Load associated user and car data
    await loadAssociatedData();
    
    // Populate form with data
    populateForm();
    
    setLoading(false);
    return true;
  } catch (error) {
    console.error("Error loading booking data:", error);
    showMessage("Failed to load booking data", "error");
    setLoading(false);
    return false;
  }
}

// Load associated user and car data
async function loadAssociatedData() {
  try {
    debug("Loading associated data");
    
    // Get user data
    const userId = booking.user_id;
    if (userId) {
      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
          userData = {
            id: userId,
            ...userDoc.data()
          };
          debug("Retrieved user data:", userData);
        } else {
          debug("No user document found for ID:", userId);
        }
      } catch (e) {
        console.error("Error fetching user data:", e);
      }
    }
    
    // Get car data
    const carId = booking.car_id;
    if (carId) {
      try {
        const carDoc = await getDoc(doc(db, "cars", String(carId)));
        if (carDoc.exists()) {
          carData = {
            id: carId,
            ...carDoc.data()
          };
          
          // Get car model data if available
          if (carData.car_type) {
            try {
              const modelDoc = await getDoc(doc(db, "car_models", carData.car_type));
              if (modelDoc.exists()) {
                const modelData = modelDoc.data();
                carData.modelInfo = modelData;
                carData.displayName = modelData.name || carData.car_type;
              }
            } catch (e) {
              console.error("Error fetching car model:", e);
            }
          }
          
          debug("Retrieved car data:", carData);
        } else {
          debug("No car document found for ID:", carId);
        }
      } catch (e) {
        console.error("Error fetching car data:", e);
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error loading associated data:", error);
    return false;
  }
}

// Populate form with booking data
function populateForm() {
  debug("Populating form with booking data");
  
  // Set page title with booking ID
  const pageTitle = document.querySelector(".page-title");
  if (pageTitle) {
    pageTitle.textContent = `Edit Booking: ${bookingId.replace("booking_", "")}`;
  }
  
  // Set customer info
  const customerName = document.getElementById("customer-name");
  if (customerName && userData) {
    customerName.textContent = `${userData.firstName || ""} ${userData.lastName || ""}`.trim() || "Unknown";
  }
  
  const customerEmail = document.getElementById("customer-email");
  if (customerEmail && userData) {
    customerEmail.textContent = userData.email || "No email provided";
  }
  
  const customerPhone = document.getElementById("customer-phone");
  if (customerPhone && userData) {
    customerPhone.textContent = userData.phone || "No phone provided";
  }
  
  // Set car info
  const carName = document.getElementById("car-name");
  if (carName && carData) {
    carName.textContent = carData.displayName || carData.car_type || "Unknown";
  }
  
  const carLicense = document.getElementById("car-license");
  if (carLicense && carData) {
    carLicense.textContent = carData.license_plate || "No license plate";
  }
  
  // Set form values - status
  if (statusSelect && booking.status) {
    statusSelect.value = booking.status;
  }
  
  // Format dates and times
  if (booking.start_time) {
    const startDate = booking.start_time instanceof Timestamp ? 
      booking.start_time.toDate() : new Date(booking.start_time);
    
    if (startDateInput) {
      startDateInput.value = formatDateForInput(startDate);
    }
    
    if (startTimeInput) {
      startTimeInput.value = formatTimeForInput(startDate);
    }
  }
  
  if (booking.end_time) {
    const endDate = booking.end_time instanceof Timestamp ? 
      booking.end_time.toDate() : new Date(booking.end_time);
    
    if (endDateInput) {
      endDateInput.value = formatDateForInput(endDate);
    }
    
    if (endTimeInput) {
      endTimeInput.value = formatTimeForInput(endDate);
    }
  }
  
  // Set price
  if (priceInput && booking.total_price !== undefined) {
    priceInput.value = booking.total_price;
  }
  
  // Set notes
  if (notesInput) {
    notesInput.value = booking.notes || "";
  }
  
  // After a brief delay, mark initial load as complete
  setTimeout(() => {
    isInitialLoad = false;
  }, 500);
}

// Format date for input field (YYYY-MM-DD)
function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format time for input field (HH:MM)
function formatTimeForInput(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Set up event listeners
function setupEventListeners() {
  debug("Setting up event listeners");
  
  // Form submission
  if (form) {
    form.addEventListener("submit", handleFormSubmit);
  }
  
  // Cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      
      if (hasChanges) {
        if (confirm("You have unsaved changes. Are you sure you want to cancel?")) {
          goBackToBookings();
        }
      } else {
        goBackToBookings();
      }
    });
  }
  
  // Back button
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      
      if (hasChanges) {
        if (confirm("You have unsaved changes. Are you sure you want to go back?")) {
          goBackToBookings();
        }
      } else {
        goBackToBookings();
      }
    });
  }
}

// Setup change detection for form fields
function setupChangeDetection() {
  debug("Setting up change detection");
  
  // For all form inputs
  const formInputs = form.querySelectorAll('input, select, textarea');
  formInputs.forEach(input => {
    input.addEventListener('change', checkForChanges);
    input.addEventListener('input', checkForChanges);
  });
  
  // Special handling for time/date inputs that affect the same field
  if (startDateInput && startTimeInput) {
    const originalStartHandler = () => {
      checkSpecificChange('start_time', getDateTimeFromInputs(startDateInput, startTimeInput));
    };
    startDateInput.addEventListener('change', originalStartHandler);
    startTimeInput.addEventListener('change', originalStartHandler);
  }
  
  if (endDateInput && endTimeInput) {
    const originalEndHandler = () => {
      checkSpecificChange('end_time', getDateTimeFromInputs(endDateInput, endTimeInput));
    };
    endDateInput.addEventListener('change', originalEndHandler);
    endTimeInput.addEventListener('change', originalEndHandler);
  }
}

// Check if form has changes compared to original data
function checkForChanges() {
  // Skip during initial form population
  if (isInitialLoad) return;
  
  let currentHasChanges = false;
  
  // Check status
  if (statusSelect && statusSelect.value !== originalStatus) {
    currentHasChanges = true;
  }
  
  // Check price
  if (priceInput && parseFloat(priceInput.value) !== originalPrice) {
    currentHasChanges = true;
  }
  
  // Check notes
  if (notesInput && notesInput.value !== (booking.notes || "")) {
    currentHasChanges = true;
  }
  
  // Check dates and times
  if (startDateInput && startTimeInput) {
    const currentStartTime = getDateTimeFromInputs(startDateInput, startTimeInput);
    if (originalStartTime && currentStartTime && 
        Math.abs(currentStartTime - originalStartTime) > 60000) { // Allow 1 minute variance
      currentHasChanges = true;
    }
  }
  
  if (endDateInput && endTimeInput) {
    const currentEndTime = getDateTimeFromInputs(endDateInput, endTimeInput);
    if (originalEndTime && currentEndTime && 
        Math.abs(currentEndTime - originalEndTime) > 60000) { // Allow 1 minute variance
      currentHasChanges = true;
    }
  }
  
  // Update UI if changed status
  if (currentHasChanges !== hasChanges) {
    hasChanges = currentHasChanges;
    updateSaveButton();
  }
}

// Check if a specific field has changed
function checkSpecificChange(field, newValue) {
  // Skip during initial form population
  if (isInitialLoad) return;
  
  let changed = false;
  
  switch (field) {
    case 'status':
      changed = newValue !== originalStatus;
      break;
    case 'total_price':
      changed = parseFloat(newValue) !== originalPrice;
      break;
    case 'start_time':
      changed = originalStartTime && Math.abs(newValue - originalStartTime) > 60000;
      break;
    case 'end_time':
      changed = originalEndTime && Math.abs(newValue - originalEndTime) > 60000;
      break;
  }
  
  if (changed && !hasChanges) {
    hasChanges = true;
    updateSaveButton();
  } else if (!changed && checkIfOnlyThisFieldChanged()) {
    hasChanges = false;
    updateSaveButton();
  }
}

// Check if only the specified field has changed
function checkIfOnlyThisFieldChanged() {
  // Implement if needed for more complex form validation
  return false;
}

// Update save button state based on changes
function updateSaveButton() {
  if (!saveBtn) return;
  
  if (hasChanges) {
    saveBtn.disabled = false;
    saveBtn.classList.remove("disabled-btn");
    
    // Show unsaved changes indicator
    const unsavedIndicator = document.getElementById("unsaved-indicator");
    if (unsavedIndicator) {
      unsavedIndicator.style.display = "inline-block";
    }
  } else {
    saveBtn.disabled = true;
    saveBtn.classList.add("disabled-btn");
    
    // Hide unsaved changes indicator
    const unsavedIndicator = document.getElementById("unsaved-indicator");
    if (unsavedIndicator) {
      unsavedIndicator.style.display = "none";
    }
  }
}

// Helper to get Date object from separate date and time inputs
function getDateTimeFromInputs(dateInput, timeInput) {
  if (!dateInput.value || !timeInput.value) return null;
  
  const [year, month, day] = dateInput.value.split('-').map(num => parseInt(num, 10));
  const [hours, minutes] = timeInput.value.split(':').map(num => parseInt(num, 10));
  
  // Create new date (month is 0-indexed in JavaScript)
  return new Date(year, month - 1, day, hours, minutes, 0);
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  debug("Form submitted");
  
  if (!hasChanges) {
    showMessage("No changes to save", "info");
    return;
  }
  
  try {
    setLoading(true);
    
    // Collect updated data
    const updatedData = {
      updated_at: serverTimestamp()
    };
    
    // Status
    if (statusSelect && statusSelect.value !== originalStatus) {
      updatedData.status = statusSelect.value;
    }
    
    // Price
    if (priceInput && parseFloat(priceInput.value) !== originalPrice) {
      updatedData.total_price = parseFloat(priceInput.value);
    }
    
    // Notes
    if (notesInput && notesInput.value !== (booking.notes || "")) {
      updatedData.notes = notesInput.value;
    }
    
    // Start time
    if (startDateInput && startTimeInput) {
      const newStartTime = getDateTimeFromInputs(startDateInput, startTimeInput);
      if (newStartTime) {
        updatedData.start_time = Timestamp.fromDate(newStartTime);
        
        // Update duration_minutes if end time is also set
        const newEndTime = endDateInput && endTimeInput ? 
          getDateTimeFromInputs(endDateInput, endTimeInput) : null;
        if (newEndTime) {
          const durationMinutes = Math.round((newEndTime - newStartTime) / (1000 * 60));
          updatedData.duration_minutes = durationMinutes;
        }
      }
    }
    
    // End time
    if (endDateInput && endTimeInput) {
      const newEndTime = getDateTimeFromInputs(endDateInput, endTimeInput);
      if (newEndTime) {
        updatedData.end_time = Timestamp.fromDate(newEndTime);
        
        // Update duration_minutes if start time wasn't already set above
        if (!updatedData.duration_minutes && booking.start_time) {
          const startTime = booking.start_time instanceof Timestamp ? 
            booking.start_time.toDate() : new Date(booking.start_time);
          const durationMinutes = Math.round((newEndTime - startTime) / (1000 * 60));
          updatedData.duration_minutes = durationMinutes;
        }
      }
    }
    
    debug("Updating booking with data:", updatedData);
    
    // Update in the main bookings collection
    await updateDoc(doc(db, "bookings", bookingId), updatedData);
    
    // Update in timesheet collection if exists
    if (booking.car_id) {
      try {
        await updateDoc(
          doc(db, "timesheets", booking.car_id.toString(), "bookings", bookingId),
          updatedData
        );
        debug(`Updated in timesheet for car: ${booking.car_id}`);
      } catch (e) {
        console.error(`Error updating timesheet:`, e);
      }
    }
    
    // Update in user bookings collection if exists
    if (booking.user_id) {
      try {
        await updateDoc(
          doc(db, "users", booking.user_id, "bookings", bookingId),
          updatedData
        );
        debug(`Updated in user bookings for user: ${booking.user_id}`);
      } catch (e) {
        console.error(`Error updating user bookings:`, e);
      }
    }
    
    // Show success message
    showMessage("Booking updated successfully", "success");
    
    // Reset change detection
    hasChanges = false;
    updateSaveButton();
    
    // Update original values
    if (updatedData.status) originalStatus = updatedData.status;
    if (updatedData.total_price) originalPrice = updatedData.total_price;
    if (updatedData.start_time) originalStartTime = updatedData.start_time.toDate();
    if (updatedData.end_time) originalEndTime = updatedData.end_time.toDate();
    
    // Update booking object
    booking = {
      ...booking,
      ...updatedData
    };
    
    setLoading(false);
  } catch (error) {
    console.error("Error updating booking:", error);
    showMessage("Failed to update booking", "error");
    setLoading(false);
  }
}

// Navigate back to bookings page
function goBackToBookings() {
  window.location.href = "admin-bookings.html";
}

// Show a message to the user
function showMessage(message, type = "info") {
  // Create the message container if it doesn't exist
  let messageContainer = document.getElementById("message-container");
  
  if (!messageContainer) {
    messageContainer = document.createElement("div");
    messageContainer.id = "message-container";
    messageContainer.style.position = "fixed";
    messageContainer.style.bottom = "20px";
    messageContainer.style.right = "20px";
    messageContainer.style.zIndex = "1000";
    document.body.appendChild(messageContainer);
  }
  
  // Create message element
  const messageElement = document.createElement("div");
  messageElement.className = `message ${type}`;
  messageElement.style.backgroundColor = type === "error" ? "#f44336" : 
                                        type === "success" ? "#4caf50" : 
                                        "#2196f3";
  messageElement.style.color = "white";
  messageElement.style.padding = "12px 16px";
  messageElement.style.marginBottom = "10px";
  messageElement.style.borderRadius = "4px";
  messageElement.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.2)";
  messageElement.style.display = "flex";
  messageElement.style.alignItems = "center";
  messageElement.style.justifyContent = "space-between";
  messageElement.style.animation = "slideIn 0.3s ease-out forwards";
  
  messageElement.innerHTML = `
    <div>${message}</div>
    <button class="close-message" style="background: none; border: none; color: white; cursor: pointer;">
      <i class="bi bi-x"></i>
    </button>
  `;
  
  // Add close button functionality
  const closeButton = messageElement.querySelector(".close-message");
  closeButton.addEventListener("click", () => {
    messageElement.style.animation = "slideOut 0.3s ease-out forwards";
    setTimeout(() => {
      messageContainer.removeChild(messageElement);
    }, 300);
  });
  
  // Add to container
  messageContainer.appendChild(messageElement);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.style.animation = "slideOut 0.3s ease-out forwards";
      setTimeout(() => {
        if (messageElement.parentNode) {
          messageContainer.removeChild(messageElement);
        }
      }, 300);
    }
  }, 5000);
}

// Set loading state
function setLoading(isLoading) {
  if (!loadingOverlay) {
    loadingOverlay = document.getElementById("loading-overlay");
    
    if (!loadingOverlay) {
      debug("Loading overlay not found, creating one");
      loadingOverlay = document.createElement("div");
      loadingOverlay.id = "loading-overlay";
      loadingOverlay.innerHTML = `
        <div class="spinner"></div>
        <p>Loading...</p>
      `;
      loadingOverlay.style.position = "fixed";
      loadingOverlay.style.top = "0";
      loadingOverlay.style.left = "0";
      loadingOverlay.style.width = "100%";
      loadingOverlay.style.height = "100%";
      loadingOverlay.style.backgroundColor = "rgba(255, 255, 255, 0.7)";
      loadingOverlay.style.display = "none";
      loadingOverlay.style.justifyContent = "center";
      loadingOverlay.style.alignItems = "center";
      loadingOverlay.style.zIndex = "1000";
      document.body.appendChild(loadingOverlay);
    }
  }
  
  if (loadingOverlay) {
    loadingOverlay.style.display = isLoading ? "flex" : "none";
  }
}

// Utility function to capitalize first letter
function capitalizeFirst(string) {
  if (!string) return "Unknown";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Add CSS animations directly
const styleElement = document.createElement('style');
styleElement.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
  
  .disabled-btn {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  #unsaved-indicator {
    display: none;
    width: 8px;
    height: 8px;
    background-color: #ff3e1d;
    border-radius: 50%;
    margin-left: 8px;
    animation: pulse 1.5s infinite;
  }
  
  @keyframes pulse {
    0% { transform: scale(0.8); opacity: 0.8; }
    50% { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(0.8); opacity: 0.8; }
  }
`;

document.head.appendChild(styleElement);

// Exit confirmation when there are unsaved changes
window.addEventListener("beforeunload", function(e) {
  if (hasChanges) {
    const message = "You have unsaved changes. Are you sure you want to leave?";
    e.returnValue = message;
    return message;
  }
});

// Log completion of script loading
debug("Admin booking edit script fully loaded");