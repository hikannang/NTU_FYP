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
  serverTimestamp,
  deleteDoc
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
let originalNotes = null;
let hasChanges = false;
let isInitialLoad = true;
let hourlyRate = 15; // Default hourly rate in dollars, adjust as needed
let durationDisplay = null;
let priceDisplay = null;

// DOM Elements
let form = null;
let statusSelect = null;
let startDateInput = null;
let startTimeHourInput = null;
let startTimeMinuteInput = null;
let endDateInput = null;
let endTimeHourInput = null;
let endTimeMinuteInput = null;
let priceInput = null;
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
    startTimeHourInput = document.getElementById("start-time-hour");
    startTimeMinuteInput = document.getElementById("start-time-minute");
    endDateInput = document.getElementById("end-date");
    endTimeHourInput = document.getElementById("end-time-hour");
    endTimeMinuteInput = document.getElementById("end-time-minute");
    priceInput = document.getElementById("total-price");
    saveBtn = document.getElementById("save-btn");
    cancelBtn = document.getElementById("cancel-btn");
    backBtn = document.getElementById("back-btn");
    loadingOverlay = document.getElementById("loading-overlay");
    durationDisplay = document.getElementById("duration-display");
    priceDisplay = document.getElementById("price-display");
    
    // Initialize hour selects
    populateHourSelects();
    
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
  
  // Set up modal close functionality
  setupModalClose();
}

// Function to populate hours in the selects (00-23)
function populateHourSelects() {
  const hourSelects = [startTimeHourInput, endTimeHourInput];
  
  hourSelects.forEach(select => {
    if (select) {
      select.innerHTML = ''; // Clear existing options
      
      // Add hours (00-23)
      for (let i = 0; i < 24; i++) {
        const hour = i.toString().padStart(2, '0');
        const option = document.createElement('option');
        option.value = hour;
        option.textContent = hour;
        select.appendChild(option);
      }
    }
  });
  
  // Ensure minute selects have only 00, 15, 30, 45
  const minuteSelects = [startTimeMinuteInput, endTimeMinuteInput];
  
  minuteSelects.forEach(select => {
    if (select) {
      select.innerHTML = ''; // Clear existing options
      
      // Add only the allowed minute values
      const allowedMinutes = ['00', '15', '30', '45'];
      allowedMinutes.forEach(minute => {
        const option = document.createElement('option');
        option.value = minute;
        option.textContent = minute;
        select.appendChild(option);
      });
    }
  });
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
    originalNotes = booking.notes || "";
    
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
    const displayId = bookingId.replace("booking_", "");
    pageTitle.innerHTML = `<i class="bi bi-calendar-check"></i> Edit Booking: ${displayId}`;
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
  
  const carId = document.getElementById("car-id");
  if (carId && carData) {
    carId.textContent = `Car ID: ${carData.id || "Unknown"}`;
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
    
    // Set hour and minute separately with 15-minute increments
    if (startTimeHourInput) {
      startTimeHourInput.value = String(startDate.getHours()).padStart(2, '0');
    }
    
    if (startTimeMinuteInput) {
      // Round minutes to nearest 15-minute interval
      const minutes = startDate.getMinutes();
      let roundedMinutes;
      
      if (minutes < 8) {
        roundedMinutes = '00';
      } else if (minutes < 23) {
        roundedMinutes = '15';
      } else if (minutes < 38) {
        roundedMinutes = '30';
      } else if (minutes < 53) {
        roundedMinutes = '45';
      } else {
        roundedMinutes = '00';
        // Add an hour if we round up to the next hour
        if (startTimeHourInput) {
          let hour = parseInt(startTimeHourInput.value, 10);
          hour = (hour + 1) % 24;
          startTimeHourInput.value = hour.toString().padStart(2, '0');
        }
      }
      
      startTimeMinuteInput.value = roundedMinutes;
    }
  }
  
  if (booking.end_time) {
    const endDate = booking.end_time instanceof Timestamp ? 
      booking.end_time.toDate() : new Date(booking.end_time);
    
    if (endDateInput) {
      endDateInput.value = formatDateForInput(endDate);
    }
    
    // Set hour and minute separately with 15-minute increments
    if (endTimeHourInput) {
      endTimeHourInput.value = String(endDate.getHours()).padStart(2, '0');
    }
    
    if (endTimeMinuteInput) {
      // Round minutes to nearest 15-minute interval
      const minutes = endDate.getMinutes();
      let roundedMinutes;
      
      if (minutes < 8) {
        roundedMinutes = '00';
      } else if (minutes < 23) {
        roundedMinutes = '15';
      } else if (minutes < 38) {
        roundedMinutes = '30';
      } else if (minutes < 53) {
        roundedMinutes = '45';
      } else {
        roundedMinutes = '00';
        // Add an hour if we round up to the next hour
        if (endTimeHourInput) {
          let hour = parseInt(endTimeHourInput.value, 10);
          hour = (hour + 1) % 24;
          endTimeHourInput.value = hour.toString().padStart(2, '0');
        }
      }
      
      endTimeMinuteInput.value = roundedMinutes;
    }
  }
  
  // Set price
  if (priceInput && booking.total_price !== undefined) {
    priceInput.value = booking.total_price;
  }
  
  // After a brief delay, mark initial load as complete
  setTimeout(() => {
    updateDurationAndPrice();
    isInitialLoad = false;
    debug("Initial form load complete");
  }, 500);
}

// Format date for input field (YYYY-MM-DD)
function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      handleCancel();
    });
  }
  
  // Back button
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleCancel();
    });
  }
  
  // Additional actions
  const sendReceiptBtn = document.getElementById("send-receipt-btn");
  if (sendReceiptBtn) {
    sendReceiptBtn.addEventListener("click", sendReceipt);
  }
  
  const updateStatusBtn = document.getElementById("update-status-btn");
  if (updateStatusBtn) {
    updateStatusBtn.addEventListener("click", showStatusUpdateOptions);
  }
  
  const deleteBookingBtn = document.getElementById("delete-booking-btn");
  if (deleteBookingBtn) {
    deleteBookingBtn.addEventListener("click", showDeleteConfirmation);
  }
  
  // Status modal buttons
  const statusOptions = document.querySelectorAll(".status-option");
  statusOptions.forEach(option => {
    option.addEventListener("click", () => {
      const newStatus = option.dataset.status;
      updateBookingStatus(newStatus);
      closeModal('status-modal');
    });
  });
  
  // Delete confirmation modal
  const confirmDeleteBtn = document.getElementById("confirm-delete");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", deleteBooking);
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
  if (startDateInput && startTimeHourInput && startTimeMinuteInput) {
    const originalStartHandler = () => {
      checkSpecificChange('start_time', getDateTimeFromSplitInputs(
        startDateInput, 
        startTimeHourInput, 
        startTimeMinuteInput
      ));
    };
    startDateInput.addEventListener('change', originalStartHandler);
    startTimeHourInput.addEventListener('change', originalStartHandler);
    startTimeMinuteInput.addEventListener('change', originalStartHandler);
  }
  
  if (endDateInput && endTimeHourInput && endTimeMinuteInput) {
    const originalEndHandler = () => {
      checkSpecificChange('end_time', getDateTimeFromSplitInputs(
        endDateInput, 
        endTimeHourInput, 
        endTimeMinuteInput
      ));
    };
    endDateInput.addEventListener('change', originalEndHandler);
    endTimeHourInput.addEventListener('change', originalEndHandler);
    endTimeMinuteInput.addEventListener('change', originalEndHandler);
  }
  
  // Add duration and price calculation to time inputs
  const timeInputs = [startDateInput, startTimeHourInput, startTimeMinuteInput,
                     endDateInput, endTimeHourInput, endTimeMinuteInput];
                     
  timeInputs.forEach(input => {
    if (input) {
      input.addEventListener('change', () => {
        updateDurationAndPrice();
        checkForChanges();
      });
    }
  });
}

// Helper to get Date object from separate date, hour and minute inputs
function getDateTimeFromSplitInputs(dateInput, hourInput, minuteInput) {
  if (!dateInput.value || !hourInput.value || !minuteInput.value) return null;
  
  const [year, month, day] = dateInput.value.split('-').map(num => parseInt(num, 10));
  const hours = parseInt(hourInput.value, 10);
  const minutes = parseInt(minuteInput.value, 10);
  
  // Create new date (month is 0-indexed in JavaScript)
  return new Date(year, month - 1, day, hours, minutes, 0);
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
  
  // Check dates and times
  if (startDateInput && startTimeHourInput && startTimeMinuteInput) {
    const currentStartTime = getDateTimeFromSplitInputs(
      startDateInput, 
      startTimeHourInput, 
      startTimeMinuteInput
    );
    if (originalStartTime && currentStartTime) {
      const startTimeDiff = Math.abs(currentStartTime - originalStartTime);
      if (startTimeDiff > 60000) { // Allow 1 minute variance
        currentHasChanges = true;
      }
    }
  }
  
  if (endDateInput && endTimeHourInput && endTimeMinuteInput) {
    const currentEndTime = getDateTimeFromSplitInputs(
      endDateInput, 
      endTimeHourInput, 
      endTimeMinuteInput
    );
    if (originalEndTime && currentEndTime) {
      const endTimeDiff = Math.abs(currentEndTime - originalEndTime);
      if (endTimeDiff > 60000) { // Allow 1 minute variance
        currentHasChanges = true;
      }
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
      if (originalStartTime && newValue) {
        changed = Math.abs(newValue - originalStartTime) > 60000;
      }
      break;
    case 'end_time':
      if (originalEndTime && newValue) {
        changed = Math.abs(newValue - originalEndTime) > 60000;
      }
      break;
  }
  
  if (changed && !hasChanges) {
    hasChanges = true;
    updateSaveButton();
  }
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
    
    // Also update the bottom save button if it exists
    const saveBtnBottom = document.getElementById("save-btn-bottom");
    if (saveBtnBottom) {
      saveBtnBottom.disabled = false;
      saveBtnBottom.classList.remove("disabled-btn");
    }
  } else {
    saveBtn.disabled = true;
    saveBtn.classList.add("disabled-btn");
    
    // Hide unsaved changes indicator
    const unsavedIndicator = document.getElementById("unsaved-indicator");
    if (unsavedIndicator) {
      unsavedIndicator.style.display = "none";
    }
    
    // Also update the bottom save button if it exists
    const saveBtnBottom = document.getElementById("save-btn-bottom");
    if (saveBtnBottom) {
      saveBtnBottom.disabled = true;
      saveBtnBottom.classList.add("disabled-btn");
    }
  }
}

// Handle cancel action
function handleCancel() {
  if (hasChanges) {
    if (confirm("You have unsaved changes. Are you sure you want to cancel?")) {
      goBackToBookings();
    }
  } else {
    goBackToBookings();
  }
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
    
    // Start time
    if (startDateInput && startTimeHourInput && startTimeMinuteInput) {
      const newStartTime = getDateTimeFromSplitInputs(
        startDateInput, 
        startTimeHourInput, 
        startTimeMinuteInput
      );
      
      if (newStartTime) {
        updatedData.start_time = Timestamp.fromDate(newStartTime);
        
        // Update duration_minutes if end time is also set
        const newEndTime = endDateInput && endTimeHourInput && endTimeMinuteInput ? 
          getDateTimeFromSplitInputs(endDateInput, endTimeHourInput, endTimeMinuteInput) : null;
          
        if (newEndTime) {
          const durationMinutes = Math.round((newEndTime - newStartTime) / (1000 * 60));
          updatedData.duration_minutes = durationMinutes;
        }
      }
    }
    
    // End time
    if (endDateInput && endTimeHourInput && endTimeMinuteInput) {
      const newEndTime = getDateTimeFromSplitInputs(
        endDateInput, 
        endTimeHourInput, 
        endTimeMinuteInput
      );
      
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
    if (updatedData.total_price !== undefined) originalPrice = updatedData.total_price;
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

// Update booking status
async function updateBookingStatus(newStatus) {
  if (newStatus === booking.status) {
    showMessage(`Booking is already marked as ${newStatus}`, "info");
    return;
  }
  
  try {
    setLoading(true);
    
    const updateData = {
      status: newStatus,
      updated_at: serverTimestamp()
    };
    
    // Update main bookings collection
    await updateDoc(doc(db, "bookings", bookingId), updateData);
    
    // Update timesheet if car_id exists
    if (booking.car_id) {
      try {
        await updateDoc(
          doc(db, "timesheets", booking.car_id.toString(), "bookings", bookingId),
          updateData
        );
      } catch (e) {
        console.error("Error updating timesheet:", e);
      }
    }
    
    // Update user bookings if user_id exists
    if (booking.user_id) {
      try {
        await updateDoc(
          doc(db, "users", booking.user_id, "bookings", bookingId),
          updateData
        );
      } catch (e) {
        console.error("Error updating user bookings:", e);
      }
    }
    
    // Update status in form
    if (statusSelect) {
      statusSelect.value = newStatus;
    }
    
    // Update original status and booking object
    originalStatus = newStatus;
    booking.status = newStatus;
    
    showMessage(`Booking status updated to ${newStatus}`, "success");
    setLoading(false);
  } catch (error) {
    console.error("Error updating booking status:", error);
    showMessage("Failed to update booking status", "error");
    setLoading(false);
  }
}

// Delete booking
async function deleteBooking() {
  try {
    setLoading(true);
    
    // Delete from main bookings collection
    await deleteDoc(doc(db, "bookings", bookingId));
    
    // Delete from timesheet if car_id exists
    if (booking.car_id) {
      try {
        await deleteDoc(doc(db, "timesheets", booking.car_id.toString(), "bookings", bookingId));
      } catch (e) {
        console.error("Error deleting from timesheet:", e);
      }
    }
    
    // Delete from user bookings if user_id exists
    if (booking.user_id) {
      try {
        await deleteDoc(doc(db, "users", booking.user_id, "bookings", bookingId));
      } catch (e) {
        console.error("Error deleting from user bookings:", e);
      }
    }
    
    showMessage("Booking deleted successfully", "success");
    
    // Redirect to bookings page after short delay
    setTimeout(() => {
      goBackToBookings();
    }, 1000);
  } catch (error) {
    console.error("Error deleting booking:", error);
    showMessage("Failed to delete booking", "error");
    setLoading(false);
  }
}

// Setup modal functionality
function setupModalClose() {
  const modals = document.querySelectorAll(".modal");
  const closeButtons = document.querySelectorAll(".close-modal");
  
  closeButtons.forEach(button => {
    button.addEventListener("click", () => {
      const modal = button.closest(".modal");
      if (modal) {
        closeModal(modal.id);
      }
    });
  });
  
  // Close when clicking outside the modal content
  window.addEventListener("click", event => {
    modals.forEach(modal => {
      if (event.target === modal) {
        closeModal(modal.id);
      }
    });
  });
}

// Close modal
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "none";
  }
}

// Show delete confirmation modal
function showDeleteConfirmation() {
  document.getElementById("delete-modal").style.display = "flex";
}

// Show status update options
function showStatusUpdateOptions() {
  document.getElementById("status-modal").style.display = "flex";
}

// Send receipt
function sendReceipt() {
  showMessage("Email receipt functionality will be available soon", "info");
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
  
  messageElement.innerHTML = `
    <div class="message-content">
      <span>${message}</span>
    </div>
    <button class="close-message">
      <i class="bi bi-x"></i>
    </button>
  `;
  
  // Add close button functionality
  const closeButton = messageElement.querySelector(".close-message");
  closeButton.addEventListener("click", () => {
    messageElement.style.animation = "slideOut 0.3s ease-out forwards";
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageContainer.removeChild(messageElement);
      }
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

// Exit confirmation when there are unsaved changes
window.addEventListener("beforeunload", function(e) {
  if (hasChanges) {
    const message = "You have unsaved changes. Are you sure you want to leave?";
    e.returnValue = message;
    return message;
  }
});

// Add this function to calculate and display duration and price
function updateDurationAndPrice() {
  // Skip if we're still in initial load
  if (isInitialLoad) return;
  
  // Skip if we don't have all the necessary elements
  if (!startDateInput || !startTimeHourInput || !startTimeMinuteInput || 
      !endDateInput || !endTimeHourInput || !endTimeMinuteInput ||
      !durationDisplay || !priceDisplay) return;
  
  // Get start and end times
  const startDateTime = getDateTimeFromSplitInputs(
    startDateInput, 
    startTimeHourInput, 
    startTimeMinuteInput
  );
  
  const endDateTime = getDateTimeFromSplitInputs(
    endDateInput, 
    endTimeHourInput, 
    endTimeMinuteInput
  );
  
  // Skip if dates are invalid
  if (!startDateTime || !endDateTime) return;
  
  // Calculate duration in milliseconds
  let durationMs = endDateTime - startDateTime;
  
  // Handle negative duration (end before start)
  if (durationMs < 0) {
    durationDisplay.innerHTML = `<i class="bi bi-exclamation-triangle"></i> End time is before start time`;
    priceDisplay.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Invalid duration`;
    return;
  }
  
  // Convert to hours and minutes
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  // Format duration text
  const durationText = durationHours > 0 ? 
    `${durationHours}h ${durationMinutes}m` : 
    `${durationMinutes}m`;
  
  // Calculate price (rounded to two decimal places)
  const durationInHours = durationHours + (durationMinutes / 60);
  const price = Math.ceil(durationInHours * hourlyRate * 100) / 100;
  
  // Update displays
  durationDisplay.innerHTML = `<i class="bi bi-clock"></i> Duration: <span class="calc-value">${durationText}</span>`;
  priceDisplay.innerHTML = `<i class="bi bi-tag"></i> Estimated Price: <span class="calc-value">$${price.toFixed(2)}</span>`;
  
  // Update price input if it exists
  if (priceInput) {
    priceInput.value = price.toFixed(2);
  }
}