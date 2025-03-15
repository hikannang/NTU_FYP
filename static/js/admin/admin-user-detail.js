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
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

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

// DOM Elements
const loadingOverlay = document.getElementById("loading-overlay");
const userNotFound = document.getElementById("user-not-found");
const userDetailContainer = document.getElementById("user-detail-container");
const userDetailTitle = document.getElementById("user-detail-title");
const editUserBtn = document.getElementById("edit-user-btn");

// User info elements
const userAvatar = document.getElementById("user-avatar");
const userFirstname = document.getElementById("user-firstname");
const userLastname = document.getElementById("user-lastname");
const userEmail = document.getElementById("user-email");
const userPhone = document.getElementById("user-phone");
const userRole = document.getElementById("user-role");
const userIdElement = document.getElementById("user-id");
const userCreated = document.getElementById("user-created");

// Booking elements
const bookingsContainer = document.getElementById("bookings-container");
const noBookingsMsg = document.getElementById("no-bookings");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("User Detail page loading");
  
  // Get user ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  userId = urlParams.get('id');
  
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
            await loadUserDetail();
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
  // Edit user button
  if (editUserBtn) {
    editUserBtn.addEventListener("click", handleEditUser);
  }
}

// Load user detail
async function loadUserDetail() {
  try {
    showLoading(true);
    
    // Get user document
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      userNotFound.style.display = "flex";
      userDetailContainer.style.display = "none";
      showLoading(false);
      return;
    }
    
    // Store user data globally and include the ID
    userData = {
      id: userId,
      ...userDoc.data()
    };
    
    // Update page title with user name
    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    const userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "User";
    
    if (userDetailTitle) {
      userDetailTitle.innerHTML = `
        <i class="bi bi-person"></i> 
        ${escapeHTML(userName)}
      `;
    }
    
    document.title = `${userName} | User Details`;
    
    // Load user bookings
    const bookings = await loadUserBookings();
    
    // Update UI with user data
    updateUserDetailUI(userData, bookings);
    
    showLoading(false);
  } catch (error) {
    console.error("Error loading user detail:", error);
    showError(`Failed to load user details: ${error.message}`);
    showLoading(false);
  }
}

// Load user bookings
async function loadUserBookings() {
  try {
    // Create query to get user's bookings
    let bookingsQuery;
    
    // Try to fetch bookings - first attempt with userId field
    try {
      bookingsQuery = query(
        collection(db, "bookings"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      
      const bookingsSnapshot = await getDocs(bookingsQuery);
      
      // If we have results, return them
      if (bookingsSnapshot.size > 0) {
        return bookingsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
      
      // If no results, try with userID field (different case)
      bookingsQuery = query(
        collection(db, "bookings"),
        where("userID", "==", userId),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      
      const altBookingsSnapshot = await getDocs(bookingsQuery);
      
      return altBookingsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Error in first booking query approach:", error);
      
      // If first query structure fails, try alternate structure
      // This handles cases where field names might be different
      bookingsQuery = query(
        collection(db, "bookings"),
        where("userID", "==", userId),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      
      const fallbackSnapshot = await getDocs(bookingsQuery);
      
      return fallbackSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }
  } catch (error) {
    console.error("Error loading user bookings:", error);
    showMessage("Could not load user bookings", "error");
    return [];
  }
}

// Update UI with user data
function updateUserDetailUI(userData, bookings) {
  try {
    console.log("Updating UI with user data:", userData);
    
    // Set user avatar
    if (userAvatar) {
      userAvatar.textContent = getInitials(userData.firstName, userData.lastName);
      
      // Set background color based on user role for visual distinction
      if (userData.role === "admin") {
        userAvatar.classList.add("admin-avatar");
      }
    }
    
    // Set basic user info
    if (userFirstname) {
      userFirstname.textContent = userData.firstName || 'Not provided';
    }
    
    if (userLastname) {
      userLastname.textContent = userData.lastName || 'Not provided';
    }
    
    if (userEmail) {
      userEmail.textContent = userData.email || 'Not provided';
    }
    
    if (userPhone) {
      userPhone.textContent = formatPhone(userData.phone) || 'Not provided';
    }
    
    if (userRole) {
      userRole.textContent = userData.role || 'user';
      
      // Apply special styling for admin users
      if (userData.role === "admin") {
        userRole.classList.add("admin-role");
      }
    }
    
    if (userIdElement) {
      userIdElement.textContent = userData.id || '-';
    }
    
    // Format dates
    if (userCreated) {
      const createdAt = userData.createdAt instanceof Timestamp ? 
        formatDate(userData.createdAt.toDate()) : 
        'Not available';
      userCreated.textContent = createdAt;
    }
    
    // Handle bookings
    console.log(`Found ${bookings.length} bookings for user`);
    
    if (bookings && bookings.length > 0) {
      if (bookingsContainer) {
        bookingsContainer.innerHTML = '';
        
        // Sort bookings by date if needed
        bookings.sort((a, b) => {
          const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
          const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
          return dateB - dateA; // Most recent first
        });
        
        // Display bookings
        bookings.forEach((booking) => {
          const bookingElem = createBookingElement(booking);
          bookingsContainer.appendChild(bookingElem);
        });
      }
      
      if (noBookingsMsg) {
        noBookingsMsg.style.display = 'none';
      }
    } else {
      if (bookingsContainer) {
        bookingsContainer.innerHTML = '';
      }
      
      if (noBookingsMsg) {
        noBookingsMsg.style.display = 'flex';
      }
    }
  } catch (error) {
    console.error("Error updating user detail UI:", error);
    showMessage("Failed to display user details", "error");
  }
}

// Create booking element for display
function createBookingElement(booking) {
  const elem = document.createElement('div');
  elem.className = 'booking-item';
  
  // Format dates
  const startDate = booking.startDate instanceof Timestamp ? 
    formatDate(booking.startDate.toDate()) : 
    (booking.startDate ? formatDate(new Date(booking.startDate)) : 'Not specified');
  
  const endDate = booking.endDate instanceof Timestamp ? 
    formatDate(booking.endDate.toDate()) : 
    (booking.endDate ? formatDate(new Date(booking.endDate)) : 'Not specified');
  
  const createdAt = booking.createdAt instanceof Timestamp ? 
    formatDate(booking.createdAt.toDate()) : 
    (booking.createdAt ? formatDate(new Date(booking.createdAt)) : 'Not specified');
  
  // Determine status class and icon
  let statusClass = 'pending';
  let statusIcon = 'bi-hourglass-split';
  
  if (booking.status === 'confirmed' || booking.status === 'completed') {
    statusClass = 'confirmed';
    statusIcon = 'bi-check-circle';
  } else if (booking.status === 'cancelled') {
    statusClass = 'cancelled';
    statusIcon = 'bi-x-circle';
  }
  
  // Get shortened booking ID
  const shortId = booking.id ? booking.id.substring(0, 8) + '...' : 'Unknown';
  
  // Format price with fallbacks
  let price = 'N/A';
  if (booking.totalPrice) {
    price = `$${parseFloat(booking.totalPrice).toFixed(2)}`;
  } else if (booking.price) {
    price = `$${parseFloat(booking.price).toFixed(2)}`;
  }
  
  // Get car info with fallbacks
  let carInfo = booking.carType || booking.carModel || 'Not specified';
  
  // Add color if available
  if (booking.carColor) {
    carInfo += ` (${booking.carColor})`;
  }
  
  // Create the booking element HTML
  elem.innerHTML = `
    <div class="booking-header">
      <div class="booking-title">
        <i class="bi bi-calendar-check"></i>
        Booking #${escapeHTML(shortId)}
      </div>
      <div class="booking-status ${statusClass}">
        <i class="bi ${statusIcon}"></i>
        ${escapeHTML(booking.status || 'Pending')}
      </div>
    </div>
    <div class="booking-details">
      <div class="booking-info-row">
        <div class="booking-info-item">
          <span class="info-label">Car:</span>
          <span class="info-value">${escapeHTML(carInfo)}</span>
        </div>
        <div class="booking-info-item">
          <span class="info-label">Price:</span>
          <span class="info-value">${escapeHTML(price)}</span>
        </div>
      </div>
      <div class="booking-info-row">
        <div class="booking-info-item">
          <span class="info-label">From:</span>
          <span class="info-value">${escapeHTML(startDate)}</span>
        </div>
        <div class="booking-info-item">
          <span class="info-label">To:</span>
          <span class="info-value">${escapeHTML(endDate)}</span>
        </div>
      </div>
      ${booking.pickupLocation ? `
      <div class="booking-info-row">
        <div class="booking-info-item full-width">
          <span class="info-label">Pickup Location:</span>
          <span class="info-value location-value">${escapeHTML(booking.pickupLocation)}</span>
        </div>
      </div>
      ` : ''}
      <div class="booking-created">
        <i class="bi bi-clock"></i> Booked on ${escapeHTML(createdAt)}
      </div>
    </div>
    <div class="booking-actions">
      <a href="admin-booking-detail.html?id=${booking.id}" class="view-booking-btn">
        <i class="bi bi-eye"></i> View Details
      </a>
    </div>
  `;
  
  return elem;
}

// Handle edit user button click
function handleEditUser() {
  // Navigate to edit page with user ID
  window.location.href = `admin-user-edit.html?id=${userId}`;
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

// Format date with different options
function formatDateWithOptions(date, options = {}) {
  if (!date || !(date instanceof Date) || isNaN(date)) return 'N/A';
  
  const defaultOptions = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric'
  };
  
  const mergedOptions = {...defaultOptions, ...options};
  
  try {
    return date.toLocaleDateString('en-US', mergedOptions);
  } catch (e) {
    console.error("Date formatting error:", e);
    return 'Invalid Date';
  }
}

// Format currency
function formatCurrency(amount) {
  if (amount === undefined || amount === null) return 'N/A';
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  } catch (e) {
    return `$${parseFloat(amount).toFixed(2)}`;
  }
}

// Utility function to check if a date is in the past
function isDatePast(date) {
  if (!date) return false;
  
  const now = new Date();
  
  if (date instanceof Timestamp) {
    date = date.toDate();
  } else if (!(date instanceof Date)) {
    try {
      date = new Date(date);
    } catch (e) {
      return false;
    }
  }
  
  return date < now;
}

// Get booking status class based on status and dates
function getBookingStatusClass(booking) {
  if (!booking) return 'pending';
  
  if (booking.status === 'cancelled') {
    return 'cancelled';
  } else if (booking.status === 'completed' || booking.status === 'confirmed') {
    return 'confirmed';
  } else if (booking.status === 'pending') {
    // Check if the booking dates are in the past
    const endDate = booking.endDate instanceof Timestamp ? 
      booking.endDate.toDate() : 
      new Date(booking.endDate);
    
    // If the end date is in the past but status is still pending,
    // we should highlight it differently
    if (isDatePast(endDate)) {
      return 'warning';
    }
    
    return 'pending';
  }
  
  // Default
  return 'pending';
}

// Function to group bookings by month for a better organized view
function groupBookingsByMonth(bookings) {
  const grouped = {};
  
  bookings.forEach(booking => {
    // Get created date
    let createdDate;
    if (booking.createdAt instanceof Timestamp) {
      createdDate = booking.createdAt.toDate();
    } else if (booking.createdAt) {
      createdDate = new Date(booking.createdAt);
    } else {
      createdDate = new Date(); // Fallback
    }
    
    // Format month key
    const monthKey = createdDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    
    // Add to group
    if (!grouped[monthKey]) {
      grouped[monthKey] = [];
    }
    
    grouped[monthKey].push(booking);
  });
  
  return grouped;
}

// Render bookings in a grouped format - alternative display option
function renderGroupedBookings(bookings) {
  if (!bookingsContainer) return;
  
  // Clear container
  bookingsContainer.innerHTML = '';
  
  if (!bookings || bookings.length === 0) {
    if (noBookingsMsg) {
      noBookingsMsg.style.display = 'flex';
    }
    return;
  }
  
  // Hide no bookings message
  if (noBookingsMsg) {
    noBookingsMsg.style.display = 'none';
  }
  
  // Group bookings by month
  const grouped = groupBookingsByMonth(bookings);
  
  // Sort months (most recent first)
  const sortedMonths = Object.keys(grouped).sort((a, b) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateB - dateA;
  });
  
  // Create month sections
  sortedMonths.forEach(month => {
    const monthBookings = grouped[month];
    
    // Create month header
    const monthHeader = document.createElement('div');
    monthHeader.className = 'bookings-month-header';
    monthHeader.innerHTML = `<h3>${month}</h3>`;
    
    // Create month container
    const monthContainer = document.createElement('div');
    monthContainer.className = 'bookings-month-container';
    
    // Add all bookings for this month
    monthBookings.forEach(booking => {
      const bookingElem = createBookingElement(booking);
      monthContainer.appendChild(bookingElem);
    });
    
    // Add month section to the container
    bookingsContainer.appendChild(monthHeader);
    bookingsContainer.appendChild(monthContainer);
  });
}

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
  formatDateWithOptions,
  formatCurrency,
  isDatePast,
  getBookingStatusClass,
  escapeHTML
};