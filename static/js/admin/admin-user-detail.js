// admin-user-detail.js - Part 1
import { db, auth } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Import utility functions from admin-users.js
import {
  formatDate,
  formatPhone,
  getInitials,
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
let userBookings = [];
let currentFilter = "all";

// DOM Elements - initialize as null
let loadingOverlay = null;
let userNotFound = null;
let userDetailContainer = null;
let userDetailTitle = null;
let editUserBtn = null;
let bookingsFilter = null;

// User info elements
let userAvatar = null;
let userFullname = null;
let userRoleBadge = null;
let userEmail = null;
let userPhone = null;
let userIdElement = null;
let userCreated = null;

// Booking stats elements
let totalBookingsElement = null;
let activeBookingsElement = null;
let completedBookingsElement = null;
let cancelledBookingsElement = null;

// Booking elements
let bookingsContainer = null;
let noBookingsMsg = null;
let bookingsLoading = null;

// Modal elements
let bookingModal = null;
let modalTitle = null;
let modalBody = null;
let modalCloseBtn = null;
let modalClose = null;
let viewBookingBtn = null;

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("User Detail page loading");

  // Get all DOM elements safely
  loadingOverlay = document.getElementById("loading-overlay");
  userNotFound = document.getElementById("user-not-found");
  userDetailContainer = document.getElementById("user-detail-container");
  userDetailTitle = document.getElementById("user-detail-title");
  editUserBtn = document.getElementById("edit-user-btn");
  bookingsFilter = document.getElementById("bookings-filter");

  // User info elements
  userAvatar = document.getElementById("user-avatar");
  userFullname = document.getElementById("user-fullname");
  userRoleBadge = document.getElementById("user-role-badge");
  userEmail = document.getElementById("user-email");
  userPhone = document.getElementById("user-phone");
  userIdElement = document.getElementById("user-id");
  userCreated = document.getElementById("user-created");

  // Booking stats elements
  totalBookingsElement = document.getElementById("total-bookings");
  activeBookingsElement = document.getElementById("active-bookings");
  completedBookingsElement = document.getElementById("completed-bookings");
  cancelledBookingsElement = document.getElementById("cancelled-bookings");

  // Booking elements
  bookingsContainer = document.getElementById("bookings-container");
  noBookingsMsg = document.getElementById("no-bookings");
  bookingsLoading = document.querySelector(".bookings-loading");

  // Modal elements
  bookingModal = document.getElementById("booking-modal");
  modalTitle = document.getElementById("modal-title");
  modalBody = document.getElementById("modal-body");
  modalCloseBtn = document.getElementById("modal-close-btn");
  modalClose = document.querySelector(".modal-close");
  viewBookingBtn = document.getElementById("view-booking-btn");

  // Get user ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  userId = urlParams.get("id");

  if (!userId) {
    showError("No user ID provided");
    safeSetDisplay(userDetailContainer, "none");
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
            await loadUserDetail();
          } else {
            console.error("User is not an admin");
            showError("You don't have permission to access this page");
            safeSetDisplay(userDetailContainer, "none");
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
  // Edit user button
  if (editUserBtn) {
    editUserBtn.addEventListener("click", handleEditUser);
  }

  // Bookings filter
  if (bookingsFilter) {
    bookingsFilter.addEventListener("change", filterBookings);
  }

  // Modal close buttons
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (bookingModal && e.target === bookingModal) {
      closeModal();
    }
  });
}

// Load user detail
async function loadUserDetail() {
  try {
    safeSetLoading(true);

    // Get user document
    const userDoc = await getDoc(doc(db, "users", userId));

    if (!userDoc.exists()) {
      safeSetDisplay(userNotFound, "flex");
      safeSetDisplay(userDetailContainer, "none");
      safeSetLoading(false);
      return;
    }

    // Store user data globally and include the ID
    userData = {
      id: userId,
      ...userDoc.data(),
    };

    console.log("User data loaded:", userData);

    // Update page title with user name
    const firstName = userData.firstName || "";
    const lastName = userData.lastName || "";
    const userName =
      firstName || lastName ? `${firstName} ${lastName}`.trim() : "User";

    if (userDetailTitle) {
      userDetailTitle.innerHTML = `
        <i class="bi bi-person"></i> 
        ${safeText(userName)}
      `;
    }

    document.title = `${userName} | User Details`;

    // Load user bookings
    await loadUserBookings();

    // Update UI with user data
    updateUserDetailUI();

    safeSetLoading(false);
  } catch (error) {
    console.error("Error loading user detail:", error);
    showError(`Failed to load user details: ${error.message}`);
    safeSetLoading(false);
  }
}

// Load user bookings with multiple approaches
async function loadUserBookings() {
  try {
    console.log("Loading bookings for user ID:", userId);

    // Show bookings loading state
    if (bookingsLoading) bookingsLoading.style.display = "flex";

    // Reset bookings array
    userBookings = [];

    // Attempt multiple approaches to find bookings

    // Approach 1: Try bookings as a subcollection of users
    try {
      const userBookingsRef = collection(db, "users", userId, "bookings");
      const userBookingsSnapshot = await getDocs(userBookingsRef);

      if (!userBookingsSnapshot.empty) {
        console.log(
          `Found ${userBookingsSnapshot.size} bookings in user subcollection`
        );
        userBookingsSnapshot.forEach((doc) => {
          userBookings.push({
            id: doc.id,
            source: "user-subcollection",
            ...doc.data(),
          });
        });
      }
    } catch (err) {
      console.log("Error or no bookings in user subcollection:", err);
    }

    // Approach 2: Try top-level bookings collection
    try {
      const topLevelBookingsQuery = query(
        collection(db, "bookings"),
        where("userID", "==", userId)
      );

      const topLevelSnapshot = await getDocs(topLevelBookingsQuery);

      if (!topLevelSnapshot.empty) {
        console.log(
          `Found ${topLevelSnapshot.size} bookings in top-level collection`
        );
        topLevelSnapshot.forEach((doc) => {
          userBookings.push({
            id: doc.id,
            source: "top-level",
            ...doc.data(),
          });
        });
      }
    } catch (err) {
      console.log("Error or no bookings in top-level collection:", err);
    }

    // Approach 3: Try timesheets collection with car bookings
    try {
      // Get all car documents in timesheets
      const timesheetsSnapshot = await getDocs(collection(db, "timesheets"));

      let foundBookings = 0;

      // For each car, search for bookings by this user
      for (const carDoc of timesheetsSnapshot.docs) {
        const carId = carDoc.id;

        try {
          const bookingsQuery = query(
            collection(db, "timesheets", carId, "bookings"),
            where("userID", "==", userId)
          );

          const carBookingsSnapshot = await getDocs(bookingsQuery);

          if (!carBookingsSnapshot.empty) {
            // Get car data for full context
            const carData = carDoc.data();

            carBookingsSnapshot.forEach((bookingDoc) => {
              const bookingData = bookingDoc.data();

              // Add car details to booking data
              userBookings.push({
                id: bookingDoc.id,
                carId: carId,
                source: "timesheet",
                // Add car details from parent document
                carMake: carData.make || null,
                carModel: carData.model || null,
                carYear: carData.year || null,
                carColor: carData.color || null,
                carPlate: carData.license_plate || carData.licensePlate || null,
                ...bookingData,
              });

              foundBookings++;
            });
          }
        } catch (err) {
          // Skip errors for individual cars
          console.log(`Error fetching bookings for car ${carId}:`, err);
        }
      }

      if (foundBookings > 0) {
        console.log(`Found ${foundBookings} bookings in timesheets`);
      }
    } catch (err) {
      console.log("Error or no bookings in timesheets:", err);
    }

    // Process all found bookings
    console.log(`Total bookings found: ${userBookings.length}`);

    if (userBookings.length > 0) {
      // Sort by start time (most recent first)
      userBookings.sort((a, b) => {
        // Get start times with fallbacks
        const aTime = getDateFromField(
          a.start_time || a.startDate || a.startTime || a.start
        );
        const bTime = getDateFromField(
          b.start_time || b.startDate || b.startTime || b.start
        );

        // Sort from newest to oldest
        return bTime - aTime;
      });

      // Update booking statuses based on current time
      updateBookingStatuses();

      // Update statistics
      updateBookingStats();

      // Render all bookings
      renderBookings(userBookings);
    } else {
      // No bookings found
      safeSetDisplay(noBookingsMsg, "flex");
      safeSetDisplay(bookingsContainer, "none");
    }

    // Hide loading state
    if (bookingsLoading) bookingsLoading.style.display = "none";

    return userBookings;
  } catch (error) {
    console.error("Error loading user bookings:", error);
    showMessage("Could not load booking history", "error");

    // Hide loading state
    if (bookingsLoading) bookingsLoading.style.display = "none";

    return [];
  }
}

// Update booking statuses based on dates
function updateBookingStatuses() {
  const now = new Date();
  let statusesUpdated = false;

  userBookings.forEach((booking) => {
    // Skip if status is already cancelled
    if (booking.status === "cancelled") return;

    // Get start and end times with various field name fallbacks
    const startTime = getDateFromField(
      booking.start_time ||
        booking.startDate ||
        booking.startTime ||
        booking.start
    );
    const endTime = getDateFromField(
      booking.end_time || booking.endDate || booking.endTime || booking.end
    );

    // Skip if we don't have valid dates
    if (!startTime || !endTime) return;

    let newStatus = booking.status;

    // Determine status based on dates
    if (endTime < now) {
      newStatus = "completed";
    } else if (startTime <= now && endTime >= now) {
      newStatus = "active";
    } else if (startTime > now) {
      newStatus = "upcoming";
    }

    // Update status if changed
    if (newStatus !== booking.status) {
      console.log(
        `Updating booking ${booking.id} status from ${
          booking.status || "undefined"
        } to ${newStatus}`
      );
      booking.status = newStatus;
      statusesUpdated = true;

      // Also update in database if we know the source path
      updateBookingStatusInDb(booking);
    }
  });

  if (statusesUpdated) {
    updateBookingStats();
  }
}

// Helper to safely get Date object from various field formats
function getDateFromField(field) {
  if (!field) return null;

  try {
    if (field instanceof Timestamp) {
      return field.toDate();
    } else if (field instanceof Date) {
      return field;
    } else if (typeof field === "string") {
      return new Date(field);
    } else if (typeof field === "number") {
      return new Date(field);
    }
  } catch (e) {
    console.error("Error parsing date:", e);
  }

  return null;
}

// Update booking status in database
async function updateBookingStatusInDb(booking) {
  // Only update if we have source path information
  if (!booking.id) return;

  try {
    let docRef;

    // Determine correct document reference based on source
    if (booking.source === "user-subcollection") {
      docRef = doc(db, "users", userId, "bookings", booking.id);
    } else if (booking.source === "top-level") {
      docRef = doc(db, "bookings", booking.id);
    } else if (booking.source === "timesheet" && booking.carId) {
      docRef = doc(db, "timesheets", booking.carId, "bookings", booking.id);
    } else {
      console.log("Cannot update booking status: Unknown source path");
      return;
    }

    // Update the document
    await updateDoc(docRef, {
      status: booking.status,
      updated_at: serverTimestamp(),
      updated_by: currentUser.uid,
    });

    console.log(
      `Updated booking ${booking.id} status to ${booking.status} in database`
    );
  } catch (error) {
    console.error(`Failed to update booking ${booking.id} status:`, error);
  }
}

// Update booking statistics
function updateBookingStats() {
  let active = 0;
  let completed = 0;
  let cancelled = 0;
  let upcoming = 0;

  userBookings.forEach((booking) => {
    if (booking.status === "active") active++;
    else if (booking.status === "completed") completed++;
    else if (booking.status === "cancelled") cancelled++;
    else if (booking.status === "upcoming") upcoming++;
  });

  // Update UI elements
  if (totalBookingsElement)
    totalBookingsElement.textContent = userBookings.length;
  if (activeBookingsElement)
    activeBookingsElement.textContent = active + upcoming;
  if (completedBookingsElement)
    completedBookingsElement.textContent = completed;
  if (cancelledBookingsElement)
    cancelledBookingsElement.textContent = cancelled;
}

// Filter bookings based on selected filter
function filterBookings() {
  if (!bookingsFilter) return;

  currentFilter = bookingsFilter.value;
  console.log(`Filtering bookings by: ${currentFilter}`);

  if (!userBookings || userBookings.length === 0) {
    safeSetDisplay(noBookingsMsg, "flex");
    return;
  }

  let filteredBookings = [];

  if (currentFilter === "all") {
    filteredBookings = userBookings;
  } else if (currentFilter === "active") {
    filteredBookings = userBookings.filter(
      (b) => b.status === "active" || b.status === "upcoming"
    );
  } else if (currentFilter === "completed") {
    filteredBookings = userBookings.filter((b) => b.status === "completed");
  } else if (currentFilter === "cancelled") {
    filteredBookings = userBookings.filter((b) => b.status === "cancelled");
  }

  if (filteredBookings.length === 0) {
    safeSetDisplay(noBookingsMsg, "flex");
    safeSetDisplay(bookingsContainer, "none");
  } else {
    safeSetDisplay(noBookingsMsg, "none");
    safeSetDisplay(bookingsContainer, "block");
    renderBookings(filteredBookings);
  }
}

// Update UI with user data
function updateUserDetailUI() {
  if (!userData) return;

  try {
    // Set user avatar
    if (userAvatar) {
      userAvatar.textContent = getInitials(
        userData.firstName,
        userData.lastName
      );

      // Set background color based on user role for visual distinction
      if (userData.role === "admin") {
        userAvatar.classList.add("admin-avatar");
      }
    }

    // Set user fullname
    if (userFullname) {
      const firstName = userData.firstName || "";
      const lastName = userData.lastName || "";
      userFullname.textContent =
        firstName || lastName ? `${firstName} ${lastName}`.trim() : "No name";
    }

    // Set role badge
    if (userRoleBadge) {
      userRoleBadge.textContent = userData.role || "user";
      userRoleBadge.className =
        "profile-role " + (userData.role === "admin" ? "admin-badge" : "");
    }

    // Set basic user info
    if (userEmail) {
      userEmail.textContent = userData.email || "Not provided";
    }

    if (userPhone) {
      userPhone.textContent = formatPhone(userData.phone) || "Not provided";
    }

    if (userIdElement) {
      userIdElement.textContent = userData.id || "-";
    }

    // Format dates
    if (userCreated) {
      const createdAt =
        userData.createdAt instanceof Timestamp
          ? formatDate(userData.createdAt.toDate())
          : "Not available";
      userCreated.textContent = createdAt;
    }
  } catch (error) {
    console.error("Error updating user detail UI:", error);
    showMessage("Failed to display user details", "error");
  }
}

// Render bookings
function renderBookings(bookings) {
  if (!bookingsContainer) return;

  // Clear container
  bookingsContainer.innerHTML = "";

  // Render each booking
  bookings.forEach((booking) => {
    const bookingElem = createBookingElement(booking);
    bookingsContainer.appendChild(bookingElem);
  });
}

// Create booking element for display
function createBookingElement(booking) {
  const elem = document.createElement("div");
  elem.className = "booking-card";
  elem.dataset.id = booking.id;

  // Get booking dates with fallbacks
  const startTime = getDateFromField(
    booking.start_time ||
      booking.startDate ||
      booking.startTime ||
      booking.start
  );
  const endTime = getDateFromField(
    booking.end_time || booking.endDate || booking.endTime || booking.end
  );

  // Format dates
  const startDate = startTime ? formatDetailedDate(startTime) : "Not specified";
  const endDate = endTime ? formatDetailedDate(endTime) : "Not specified";
  const duration =
    startTime && endTime ? formatDuration(startTime, endTime) : "N/A";

  // Get car details with fallbacks
  const carInfo =
    booking.carMake && booking.carModel
      ? `${booking.carMake} ${booking.carModel}`
      : booking.carType || booking.car_type || "Vehicle";

  const carYear = booking.carYear || "";
  const carColor = booking.carColor || "";
  const carPlate = booking.carPlate || booking.license_plate || "";

  // Format price with fallbacks
  const price = booking.total_price || booking.totalPrice || booking.price || 0;
  const formattedPrice = formatCurrency(price);

  // Determine status class and icon
  const statusInfo = getStatusInfo(booking.status);

  // Create the booking element HTML with full booking ID
  elem.innerHTML = `
    <div class="booking-header">
      <div class="booking-id">#${booking.id}</div>
      <div class="booking-status ${statusInfo.className}">
        <i class="bi ${statusInfo.icon}"></i>
        ${booking.status || "Pending"}
      </div>
    </div>
    
    <div class="booking-content">
      <div class="booking-car">
        <i class="bi bi-car-front"></i>
        <div class="car-details">
          <div class="car-model">${safeText(
            carYear ? `${carYear} ${carInfo}` : carInfo
          )}</div>
          <div class="car-meta">
            ${
              carColor
                ? `<span class="car-color">${safeText(carColor)}</span>`
                : ""
            }
            ${
              carPlate
                ? `<span class="car-plate">${safeText(carPlate)}</span>`
                : ""
            }
          </div>
        </div>
      </div>
      
      <div class="booking-time">
        <div class="time-item">
          <i class="bi bi-calendar-check"></i>
          <div class="time-range">
            <div class="time-start">${safeText(startDate)}</div>
            <div class="time-end">to ${safeText(endDate)}</div>
          </div>
        </div>
        <div class="time-duration">
          <i class="bi bi-clock"></i>
          <span>${safeText(duration)}</span>
        </div>
      </div>
      
      <div class="booking-price">
        <i class="bi bi-tag"></i>
        <span>${safeText(formattedPrice)}</span>
      </div>
    </div>
    
    <div class="booking-footer">
      <button class="view-details-btn" data-id="${booking.id}">
        View Details
      </button>
    </div>
  `;

  // Add event listener for view details button
  const viewDetailsBtn = elem.querySelector(".view-details-btn");
  if (viewDetailsBtn) {
    viewDetailsBtn.addEventListener("click", () => showBookingDetails(booking));
  }

  return elem;
}

// Show booking details in modal
function showBookingDetails(booking) {
  if (!bookingModal || !modalTitle || !modalBody || !viewBookingBtn) return;

  // Set modal title with full booking ID
  modalTitle.innerHTML = `
 <i class="bi bi-calendar3"></i>
 Booking #${booking.id}
  `;

  // Get all necessary booking details
  const startTime = getDateFromField(
    booking.start_time ||
      booking.startDate ||
      booking.startTime ||
      booking.start
  );
  const endTime = getDateFromField(
    booking.end_time || booking.endDate || booking.endTime || booking.end
  );
  const createdTime = getDateFromField(booking.created_at || booking.createdAt);

  // Format dates
  const startDate = startTime ? formatDetailedDate(startTime) : "Not specified";
  const endDate = endTime ? formatDetailedDate(endTime) : "Not specified";
  const createdDate = createdTime
    ? formatDetailedDate(createdTime)
    : "Not specified";
  const duration =
    startTime && endTime ? formatDuration(startTime, endTime) : "N/A";

  // Get car details with fallbacks
  const carInfo =
    booking.carMake && booking.carModel
      ? `${booking.carMake} ${booking.carModel}`
      : booking.carType || booking.car_type || "Vehicle";

  const carYear = booking.carYear || "";
  const carColor = booking.carColor || "";
  const carPlate = booking.carPlate || booking.license_plate || "";

  // Format price with fallbacks
  const price = booking.total_price || booking.totalPrice || booking.price || 0;
  const formattedPrice = formatCurrency(price);

  // Get status info
  const statusInfo = getStatusInfo(booking.status);

  // Set modal content
  modalBody.innerHTML = `
    <div class="modal-status ${statusInfo.className}">
      <i class="bi ${statusInfo.icon}"></i>
      <span>${booking.status || "Pending"}</span>
    </div>
    
    <div class="modal-section">
      <h4>Booking Information</h4>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Start Time</div>
          <div class="info-value">${safeText(startDate)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">End Time</div>
          <div class="info-value">${safeText(endDate)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Duration</div>
          <div class="info-value">${safeText(duration)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Created</div>
          <div class="info-value">${safeText(createdDate)}</div>
        </div>
      </div>
    </div>
    
    <div class="modal-section">
      <h4>Vehicle Details</h4>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Vehicle</div>
          <div class="info-value">${safeText(
            carYear ? `${carYear} ${carInfo}` : carInfo
          )}</div>
        </div>
        ${
          carColor
            ? `
        <div class="info-item">
          <div class="info-label">Color</div>
          <div class="info-value">${safeText(carColor)}</div>
        </div>`
            : ""
        }
        ${
          carPlate
            ? `
        <div class="info-item">
          <div class="info-label">License Plate</div>
          <div class="info-value">${safeText(carPlate)}</div>
        </div>`
            : ""
        }
      </div>
    </div>
    
    <div class="modal-section">
      <h4>Payment Details</h4>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Total Price</div>
          <div class="info-value price-value">${safeText(formattedPrice)}</div>
        </div>
        ${
          booking.hourly_rate
            ? `
        <div class="info-item">
          <div class="info-label">Hourly Rate</div>
          <div class="info-value">${safeText(
            formatCurrency(booking.hourly_rate)
          )}</div>
        </div>`
            : ""
        }
        ${
          booking.payment_method
            ? `
        <div class="info-item">
          <div class="info-label">Payment Method</div>
          <div class="info-value">${safeText(booking.payment_method)}</div>
        </div>`
            : ""
        }
      </div>
    </div>
    
    ${
      booking.notes
        ? `
    <div class="modal-section">
      <h4>Additional Notes</h4>
      <div class="booking-notes">${safeText(booking.notes)}</div>
    </div>`
        : ""
    }
  `;

  // Set up view full details button
  if (viewBookingBtn) {
    // If we know the car ID, include it in the URL
    if (booking.carId) {
      viewBookingBtn.onclick = () =>
        (window.location.href = `admin-booking-detail.html?id=${booking.id}&carId=${booking.carId}`);
    } else {
      viewBookingBtn.onclick = () =>
        (window.location.href = `admin-booking-detail.html?id=${booking.id}`);
    }
  }

  // Show modal
  bookingModal.style.display = "flex";

  // Add animation class after a small delay (for transition effect)
  setTimeout(() => {
    if (bookingModal) bookingModal.classList.add("show");
  }, 10);
}

// Close modal
function closeModal() {
  if (!bookingModal) return;

  bookingModal.classList.remove("show");

  // Wait for transition to finish before hiding
  setTimeout(() => {
    if (bookingModal) bookingModal.style.display = "none";
  }, 300);
}

// Handle edit user button click
function handleEditUser() {
  // Navigate to edit page with user ID
  window.location.href = `admin-user-edit.html?id=${userId}`;
}

// Helper functions
// Get status info (class name and icon)
function getStatusInfo(status) {
  switch (status) {
    case "active":
      return {
        className: "status-active",
        icon: "bi-play-circle",
      };
    case "upcoming":
      return {
        className: "status-upcoming",
        icon: "bi-calendar-event",
      };
    case "completed":
      return {
        className: "status-completed",
        icon: "bi-check-circle",
      };
    case "cancelled":
      return {
        className: "status-cancelled",
        icon: "bi-x-circle",
      };
    case "confirmed":
      return {
        className: "status-confirmed",
        icon: "bi-check-circle",
      };
    default:
      return {
        className: "status-pending",
        icon: "bi-hourglass-split",
      };
  }
}

// Format date with more detail
function formatDetailedDate(date) {
  if (!date) return "N/A";

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format duration between two dates
function formatDuration(startDate, endDate) {
  if (!startDate || !endDate) return "N/A";

  const durationMs = endDate - startDate;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  } else if (minutes === 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  } else {
    return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} min`;
  }
}

// Format currency
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return "$0.00";

  const num = parseFloat(amount);
  if (isNaN(num)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

// Security - Escape HTML to prevent XSS
function escapeHTML(str) {
  if (!str || typeof str !== "string") return "";

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Global error handling
window.addEventListener("error", (event) => {
  console.error("Global error in user detail page:", event.error);
  if (
    event.error &&
    event.error.message &&
    event.error.message.includes("Cannot read properties of null")
  ) {
    console.warn("Prevented null reference error");
    event.preventDefault();
  }
});
