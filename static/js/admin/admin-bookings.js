// admin-bookings.js - Part 1

import { db, auth, functions } from "../common/firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let currentUser = null;
let bookingsData = [];
let carsData = new Map();
let usersData = new Map();
let lastVisible = null;
let isLoading = false;
let currentFilter = "all";
let currentSort = "newest";
let searchTerm = "";
let batchSize = 15;

// DOM Elements
let bookingsContainer = null;
let bookingsTable = null;
let bookingsTableBody = null;
let filterSelect = null;
let sortSelect = null;
let searchInput = null;
let loadMoreBtn = null;
let loadingOverlay = null;
let noBookingsMessage = null;
let bookingModal = null;

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Bookings page initializing");
  
  // Initialize DOM elements
  initializeElements();
  
  // Check authentication
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        console.log("Checking Firebase configuration...");
        
        // Verify admin status
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists() && userDoc.data().role === "admin") {
          currentUser = {
            uid: user.uid,
            ...userDoc.data()
          };
          
          console.log("Admin authenticated:", currentUser.email);
          
          // Initialize page data
          await loadBookingsData();
          setupEventListeners();
        } else {
          console.error("User is not an admin");
          showMessage("You don't have permission to access this page", "error");
          setTimeout(() => {
            window.location.href = "../index.html";
          }, 2000);
        }
      } catch (error) {
        console.error("Authentication error:", error);
        showMessage("Failed to verify admin permissions", "error");
      }
    } else {
      console.log("User not authenticated, redirecting to login");
      window.location.href = "../index.html";
    }
  });
});

// Initialize DOM elements
function initializeElements() {
  bookingsContainer = document.getElementById("bookings-container");
  bookingsTable = document.getElementById("bookings-table");
  bookingsTableBody = document.getElementById("bookings-table-body");
  filterSelect = document.getElementById("filter-select");
  sortSelect = document.getElementById("sort-select");
  searchInput = document.getElementById("search-input");
  loadMoreBtn = document.getElementById("load-more-btn");
  loadingOverlay = document.getElementById("loading-overlay");
  noBookingsMessage = document.getElementById("no-bookings-message");
  bookingModal = document.getElementById("booking-modal");
  
  console.log("DOM elements initialized:", {
    bookingsContainer: !!bookingsContainer,
    bookingsTable: !!bookingsTable,
    bookingsTableBody: !!bookingsTableBody,
    filterSelect: !!filterSelect,
    sortSelect: !!sortSelect,
    searchInput: !!searchInput,
    loadMoreBtn: !!loadMoreBtn,
    loadingOverlay: !!loadingOverlay,
    noBookingsMessage: !!noBookingsMessage,
    bookingModal: !!bookingModal
  });
}

// Set up event listeners
function setupEventListeners() {
  // Filter change
  if (filterSelect) {
    filterSelect.addEventListener("change", handleFilterChange);
  }
  
  // Sort change
  if (sortSelect) {
    sortSelect.addEventListener("change", handleSortChange);
  }
  
  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", debounce(handleSearch, 500));
  }
  
  // Load more button
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", loadMoreBookings);
  }
  
  // Modal close buttons
  const closeButtons = document.querySelectorAll(".close-modal");
  closeButtons.forEach(button => {
    button.addEventListener("click", closeModal);
  });
  
  // Close modal when clicking outside
  window.addEventListener("click", (event) => {
    if (event.target === bookingModal) {
      closeModal();
    }
  });
  
  // Apply filters button
  const applyFiltersBtn = document.getElementById("apply-filters");
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener("click", () => {
      loadBookingsData();
    });
  }
  
  // Reset filters button
  const resetFiltersBtn = document.getElementById("reset-filters");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", resetFilters);
  }
  
  // Clear filters button
  const clearFiltersBtn = document.getElementById("clear-filters-btn");
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", resetFilters);
  }
  
  // Initialize date range pickers
  initializeDateRangePickers();
}

// Initialize date range pickers
function initializeDateRangePickers() {
  const startDateInput = document.getElementById("start-date");
  const endDateInput = document.getElementById("end-date");
  
  if (startDateInput && endDateInput) {
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    startDateInput.valueAsDate = thirtyDaysAgo;
    endDateInput.valueAsDate = today;
  }
}

// Reset filters
function resetFilters() {
  if (filterSelect) filterSelect.value = "all";
  if (sortSelect) sortSelect.value = "newest";
  if (searchInput) searchInput.value = "";
  
  const startDateInput = document.getElementById("start-date");
  const endDateInput = document.getElementById("end-date");
  
  if (startDateInput && endDateInput) {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    startDateInput.valueAsDate = thirtyDaysAgo;
    endDateInput.valueAsDate = today;
  }
  
  currentFilter = "all";
  currentSort = "newest";
  searchTerm = "";
  
  loadBookingsData();
}

// Load bookings data
async function loadBookingsData(isLoadMore = false) {
  try {
    if (isLoading) return;
    
    setLoading(true);
    console.log("Loading bookings data...");
    
    if (!isLoadMore) {
      bookingsData = [];
      lastVisible = null;
      if (bookingsTableBody) {
        bookingsTableBody.innerHTML = "";
      }
    }
    
    // Create query with debug logging
    let bookingsQuery = createBookingsQuery();
    console.log("Bookings query created with filter:", currentFilter, "sort:", currentSort);
    
    // Execute query
    console.log("Executing Firestore query...");
    const querySnapshot = await getDocs(bookingsQuery);
    console.log("Query executed, results:", querySnapshot.size);
    
    if (querySnapshot.empty && !isLoadMore) {
      console.log("No bookings found matching criteria");
      showNoBookingsMessage();
      setLoading(false);
      return;
    }
    
    // Update last visible document for pagination
    lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
    
    // Process bookings
    const newBookings = [];
    for (const doc of querySnapshot.docs) {
      const bookingData = {
        id: doc.id,
        ...doc.data()
      };
      
      // Ensure critical properties exist
      if (!bookingData.carID) {
        console.warn(`Booking ${bookingData.id} is missing carID`);
        bookingData.carID = "unknown";
      }
      
      if (!bookingData.userID) {
        console.warn(`Booking ${bookingData.id} is missing userID`);
        bookingData.userID = "unknown";
      }
      
      console.log("Processing booking:", bookingData.id, bookingData);
      newBookings.push(bookingData);
    }
    
    // Load associated data
    console.log("Loading associated data for", newBookings.length, "bookings");
    await loadAssociatedData(newBookings);
    
    // Add to main array
    bookingsData = [...bookingsData, ...newBookings];
    
    // Render bookings
    console.log("Rendering", newBookings.length, "bookings");
    renderBookings(newBookings, isLoadMore);
    
    // Show/hide load more button
    if (querySnapshot.docs.length < batchSize) {
      hideLoadMoreButton();
    } else {
      showLoadMoreButton();
    }
    
    setLoading(false);
  } catch (error) {
    console.error("Error loading bookings:", error);
    showMessage(`Failed to load bookings data: ${error.message}`, "error");
    setLoading(false);
  }
}

// Create bookings query based on filters
function createBookingsQuery() {
  let bookingsRef = collection(db, "bookings");
  let constraints = [];
  
  // Apply filters
  if (currentFilter !== "all") {
    constraints.push(where("status", "==", currentFilter));
  }
  
  // Apply search if provided
  if (searchTerm) {
    // Search by booking ID if it looks like an ID
    if (searchTerm.match(/^\d+$/)) {
      constraints.push(where("bookingID", ">=", searchTerm));
      constraints.push(where("bookingID", "<=", searchTerm + "\uf8ff"));
    }
  }
  
  // Apply date range if provided
  const startDateInput = document.getElementById("start-date");
  const endDateInput = document.getElementById("end-date");
  
  if (startDateInput && startDateInput.value) {
    const startDate = new Date(startDateInput.value);
    startDate.setHours(0, 0, 0, 0);
    constraints.push(where("start_time", ">=", Timestamp.fromDate(startDate)));
  }
  
  if (endDateInput && endDateInput.value) {
    const endDate = new Date(endDateInput.value);
    endDate.setHours(23, 59, 59, 999);
    constraints.push(where("start_time", "<=", Timestamp.fromDate(endDate)));
  }
  
  // Apply sorting
  let sortField = "created_at";
  let sortDirection = "desc";
  
  switch (currentSort) {
    case "newest":
      sortField = "created_at";
      sortDirection = "desc";
      break;
    case "oldest":
      sortField = "created_at";
      sortDirection = "asc";
      break;
    case "start-date-asc":
      sortField = "start_time";
      sortDirection = "asc";
      break;
    case "start-date-desc":
      sortField = "start_time";
      sortDirection = "desc";
      break;
    case "price-high":
      sortField = "total_price";
      sortDirection = "desc";
      break;
    case "price-low":
      sortField = "total_price";
      sortDirection = "asc";
      break;
  }
  
  // Create the query
  let bookingsQuery;
  
  if (constraints.length > 0) {
    bookingsQuery = query(
      bookingsRef,
      ...constraints,
      orderBy(sortField, sortDirection),
      limit(batchSize)
    );
  } else {
    bookingsQuery = query(
      bookingsRef,
      orderBy(sortField, sortDirection),
      limit(batchSize)
    );
  }
  
  // Add start after for pagination
  if (lastVisible) {
    bookingsQuery = query(
      bookingsQuery,
      startAfter(lastVisible)
    );
  }
  
  return bookingsQuery;
}

// Load associated car and user data
async function loadAssociatedData(bookings) {
  try {
    console.log("Starting to load associated data");
    
    // Get unique car IDs and user IDs (with null/undefined check)
    const carIds = [...new Set(bookings.filter(b => b.carID).map(b => b.carID))];
    const userIds = [...new Set(bookings.filter(b => b.userID).map(b => b.userID))];
    
    console.log("Car IDs to fetch:", carIds);
    console.log("User IDs to fetch:", userIds);
    
    // Load car data if not already loaded
    for (const carId of carIds) {
      if (!carsData.has(carId)) {
        try {
          console.log(`Fetching car with ID: ${carId}`);
          // Convert to string as needed for Firestore
          const carIdString = String(carId);
          
          // Get car data
          const carDoc = await getDoc(doc(db, "cars", carIdString));
          
          if (carDoc.exists()) {
            const carData = {
              id: carId,
              ...carDoc.data()
            };
            console.log(`Car data fetched:`, carData);
            
            // Get car model data if available
            if (carData.car_type) {
              try {
                console.log(`Fetching model data for car_type: ${carData.car_type}`);
                const modelDoc = await getDoc(doc(db, "car_models", carData.car_type));
                
                if (modelDoc.exists()) {
                  // Add model info to car data
                  const modelData = modelDoc.data();
                  carData.modelInfo = modelData;
                  
                  // Set display name using the name from car_models and color from cars
                  const modelName = modelData.name || carData.car_type;
                  const color = carData.car_color || '';
                  carData.displayName = color ? `${modelName} (${color})` : modelName;
                  
                  console.log(`Car with ID ${carId} display name set to: ${carData.displayName}`);
                } else {
                  console.log(`No model found for car_type: ${carData.car_type}`);
                  carData.displayName = carData.car_type || "Unknown";
                }
              } catch (modelErr) {
                console.error(`Error loading model data:`, modelErr);
                carData.displayName = carData.car_type || "Unknown";
              }
            } else {
              carData.displayName = "Unknown Model";
            }
            
            // Store car data
            carsData.set(carId, carData);
            console.log(`Car data for ID ${carId} stored in cache`);
          }
        } catch (err) {
          console.error(`Error loading car data for ID ${carId}:`, err);
        }
      }
    }
    
    // Load user data if not already loaded
    for (const userId of userIds) {
      if (!usersData.has(userId)) {
        try {
          console.log(`Fetching user with ID: ${userId}`);
          const userDoc = await getDoc(doc(db, "users", userId));
          
          if (userDoc.exists()) {
            const userData = {
              id: userId,
              ...userDoc.data()
            };
            usersData.set(userId, userData);
            console.log(`User data for ID ${userId} stored:`, userData);
          } else {
            console.log(`No user document found for ID ${userId}`);
            // Create placeholder user data with ID shown
            usersData.set(userId, { id: userId, firstName: "Unknown" });
          }
        } catch (err) {
          console.error(`Error loading user data for ID ${userId}:`, err);
        }
      }
    }
    
    console.log("Associated data loading complete");
  } catch (error) {
    console.error("Error in loadAssociatedData:", error);
  }
}

// Render bookings to table
function renderBookings(bookings, isAppend = false) {
  if (!bookingsTableBody) {
    console.error("bookingsTableBody element not found");
    return;
  }
  
  if (!isAppend) {
    bookingsTableBody.innerHTML = "";
  }
  
  if (bookings.length === 0 && !isAppend) {
    showNoBookingsMessage();
    return;
  }
  
  hideNoBookingsMessage();
  
  bookings.forEach(booking => {
    const row = createBookingRow(booking);
    bookingsTableBody.appendChild(row);
  });
  
  // Initialize tooltips
  initializeTooltips();
}

// Create a single booking row
function createBookingRow(booking) {
  if (!booking) {
    console.error("Attempted to create row with null booking data");
    return document.createElement("tr"); // Return empty row
  }
  
  console.log(`Creating row for booking: ${booking.id}`);
  
  const row = document.createElement("tr");
  row.className = "booking-row";
  row.dataset.id = booking.id;
  
  // Get associated data
  const user = booking.userID ? (usersData.get(booking.userID) || {}) : {};
  const car = booking.carID ? (carsData.get(booking.carID) || {}) : {};
  
  console.log(`User data for booking ${booking.id}:`, user);
  console.log(`Car data for booking ${booking.id}:`, car);
  
  // Extract booking ID - just the numeric part excluding "booking_"
  let displayBookingId = "";
  if (booking.bookingID) {
    displayBookingId = booking.bookingID.replace(/^booking_/, '');
    console.log(`Displaying bookingID as: ${displayBookingId}`);
  } else {
    // If no bookingID field, use document ID (first 13 characters)
    displayBookingId = booking.id.substring(0, 13);
    console.log(`Using document ID as fallback: ${displayBookingId}`);
  }
  
  // Format dates with error handling
  let startDate, endDate;
  try {
    startDate = booking.start_time instanceof Timestamp ? 
      booking.start_time.toDate() : 
      new Date(booking.start_time);
  } catch (e) {
    console.error("Error parsing start date:", e);
    startDate = new Date();
  }
  
  try {
    endDate = booking.end_time instanceof Timestamp ? 
      booking.end_time.toDate() : 
      new Date(booking.end_time);
  } catch (e) {
    console.error("Error parsing end date:", e);
    endDate = new Date(startDate.getTime() + 60*60*1000);
  }
  
  // Calculate duration
  let hours = 0;
  let minutes = 0;
  try {
    const durationMs = endDate - startDate;
    hours = Math.floor(durationMs / (1000 * 60 * 60));
    minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  } catch (e) {
    console.error("Error calculating duration:", e);
  }
  
  // Format status class
  const statusClass = getStatusClass(booking.status);
  
  // Build row HTML
  try {
    row.innerHTML = `
      <td class="booking-id">
        <span class="id-badge">${displayBookingId}</span>
      </td>
      <td>
        <div class="user-cell">
          <div class="user-avatar">${getUserInitials(user)}</div>
          <div class="user-info">
            <div class="user-name">${user.firstName || 'Unknown'}</div>
            <div class="user-id">${booking.userID || ''}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="car-cell">
          <div class="car-icon"><i class="bi bi-car-front-fill"></i></div>
          <div class="car-info">
            <div class="car-name">${car.displayName || car.car_type || 'Unknown'}</div>
            <div class="car-plate">${booking.carID}(${car.license_plate || 'N/A'})</div>
          </div>
        </div>
      </td>
      <td>
        <div class="date-cell">
          <div class="date">${formatDate(startDate)}</div>
          <div class="time">${formatTime(startDate)}</div>
        </div>
      </td>
      <td>
        <div class="date-cell">
          <div class="date">${formatDate(endDate)}</div>
          <div class="time">${formatTime(endDate)}</div>
        </div>
      </td>
      <td>
        <div class="duration-cell">
          ${hours > 0 ? `${hours}h` : ''} ${minutes}m
        </div>
      </td>
      <td>
        <div class="price-cell">$${formatPrice(booking.total_price)}</div>
      </td>
      <td>
        <div class="status-cell">
          <span class="status-badge ${statusClass}">${formatStatus(booking.status)}</span>
        </div>
      </td>
      <td>
        <div class="actions-cell">
          <button class="view-btn" data-id="${booking.id}" data-tooltip="View Details">
            <i class="bi bi-eye"></i>
          </button>
          <button class="edit-btn" data-id="${booking.id}" data-tooltip="Edit Booking">
            <i class="bi bi-pencil"></i>
          </button>
          <div class="dropdown">
            <button class="dropdown-toggle" data-tooltip="More Actions">
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <div class="dropdown-menu">
              <button class="dropdown-item status-btn" data-status="active" data-id="${booking.id}">
                <i class="bi bi-check-circle"></i> Mark Active
              </button>
              <button class="dropdown-item status-btn" data-status="completed" data-id="${booking.id}">
                <i class="bi bi-check2-all"></i> Mark Completed
              </button>
              <button class="dropdown-item status-btn" data-status="cancelled" data-id="${booking.id}">
                <i class="bi bi-x-circle"></i> Mark Cancelled
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item delete-btn" data-id="${booking.id}">
                <i class="bi bi-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      </td>
    `;
    
    console.log("Row created successfully");
  } catch (error) {
    console.error("Error creating booking row:", error);
    row.innerHTML = `
      <td colspan="9" class="error-cell">
        Error loading booking data: ${error.message}
      </td>
    `;
  }
  
  // Add event listeners to row buttons
  try {
    addRowEventListeners(row);
  } catch (error) {
    console.error("Error adding row event listeners:", error);
  }
  
  return row;
}

// Add event listeners to row buttons
function addRowEventListeners(row) {
  const viewBtn = row.querySelector(".view-btn");
  const editBtn = row.querySelector(".edit-btn");
  const statusBtns = row.querySelectorAll(".status-btn");
  const deleteBtn = row.querySelector(".delete-btn");
  const dropdownToggle = row.querySelector(".dropdown-toggle");
  
  if (viewBtn) {
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const bookingId = viewBtn.dataset.id;
      viewBookingDetails(bookingId);
    });
  }
  
  if (editBtn) {
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const bookingId = editBtn.dataset.id;
      editBooking(bookingId);
    });
  }
  
  if (statusBtns) {
    statusBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const bookingId = btn.dataset.id;
        const newStatus = btn.dataset.status;
        updateBookingStatus(bookingId, newStatus);
      });
    });
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const bookingId = deleteBtn.dataset.id;
      confirmDeleteBooking(bookingId);
    });
  }
  
  if (dropdownToggle) {
    dropdownToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDropdown(dropdownToggle);
    });
  }
}

// Toggle dropdown menu
function toggleDropdown(button) {
  // Close all other dropdowns first
  closeAllDropdowns();
  
  // Toggle this dropdown
  const dropdown = button.closest(".dropdown");
  if (dropdown) {
    dropdown.classList.toggle("show");
  }
}

// Close all dropdowns
function closeAllDropdowns() {
  const openDropdowns = document.querySelectorAll(".dropdown.show");
  openDropdowns.forEach(dropdown => {
    dropdown.classList.remove("show");
  });
}

// View booking details
async function viewBookingDetails(bookingId) {
  try {
    setLoading(true);
    console.log(`Loading booking details for ID: ${bookingId}`);
    
    // Find booking in our data
    let booking = bookingsData.find(b => b.id === bookingId);
    
    if (!booking) {
      // If not found in our data, fetch it
      console.log("Booking not found in local data, fetching from Firestore");
      const bookingDoc = await getDoc(doc(db, "bookings", bookingId));
      
      if (!bookingDoc.exists()) {
        showMessage("Booking not found", "error");
        setLoading(false);
        return;
      }
      
      booking = {
        id: bookingDoc.id,
        ...bookingDoc.data()
      };
      
      // Load associated data if needed
      if (booking.carID && !carsData.has(booking.carID)) {
        try {
          console.log(`Fetching car with ID: ${booking.carID} for modal`);
          const carDoc = await getDoc(doc(db, "cars", String(booking.carID)));
          
          if (carDoc.exists()) {
            const carData = {
              id: booking.carID,
              ...carDoc.data()
            };
            
            // Get car model data
            if (carData.car_type) {
              try {
                const modelDoc = await getDoc(doc(db, "car_models", carData.car_type));
                if (modelDoc.exists()) {
                  const modelData = modelDoc.data();
                  carData.modelInfo = modelData;
                  
                  // Set display name
                  const modelName = modelData.name || carData.car_type;
                  const color = carData.car_color || '';
                  carData.displayName = color ? `${modelName} (${color})` : modelName;
                }
              } catch (modelErr) {
                console.error("Error loading car model:", modelErr);
                carData.displayName = carData.car_type || "Unknown";
              }
            } else {
              carData.displayName = "Unknown Model";
            }
            
            carsData.set(booking.carID, carData);
            console.log(`Car data loaded for modal:`, carData);
          }
        } catch (err) {
          console.error("Error loading car details:", err);
        }
      }
      
      if (booking.userID && !usersData.has(booking.userID)) {
        try {
          console.log(`Fetching user with ID: ${booking.userID} for modal`);
          const userDoc = await getDoc(doc(db, "users", booking.userID));
          
          if (userDoc.exists()) {
            const userData = {
              id: booking.userID,
              ...userDoc.data()
            };
            usersData.set(booking.userID, userData);
            console.log(`User data loaded for modal:`, userData);
          }
        } catch (err) {
          console.error("Error loading user details:", err);
        }
      }
    }
    
    // Get associated data from the collections
    const user = booking.userID ? (usersData.get(booking.userID) || {}) : {};
    const car = booking.carID ? (carsData.get(booking.carID) || {}) : {};
    
    // Format dates with error handling
    let startDate, endDate;
    try {
      startDate = booking.start_time instanceof Timestamp ? 
        booking.start_time.toDate() : 
        new Date(booking.start_time);
    } catch (e) {
      console.error("Error parsing start date:", e);
      startDate = new Date();
    }
    
    try {
      endDate = booking.end_time instanceof Timestamp ? 
        booking.end_time.toDate() : 
        new Date(booking.end_time);
    } catch (e) {
      console.error("Error parsing end date:", e);
      endDate = new Date(startDate.getTime() + 60*60*1000);
    }
    
    // Format status
    const statusClass = getStatusClass(booking.status);
    const formattedStatus = formatStatus(booking.status);
    
    // Extract booking ID without "booking_" prefix
    let displayBookingId = booking.bookingID ? booking.bookingID.replace(/^booking_/, '') : booking.id;
    
    // Populate modal
    const modalTitle = document.getElementById("modal-title");
    const modalBody = document.getElementById("modal-body");
    
    // Set up edit button href
    const editBookingBtn = document.getElementById("edit-booking-btn");
    if (editBookingBtn) {
      editBookingBtn.href = `admin-booking-edit.html?id=${booking.id}`;
    }
    
    if (modalTitle) {
      modalTitle.innerHTML = `
        <i class="bi bi-calendar3"></i>
        Booking #${displayBookingId}
      `;
    }
    
    if (modalBody) {
      // Get model details if available
      const modelInfo = car.modelInfo || {};
      
      modalBody.innerHTML = `
        <div class="modal-sections">
          <!-- Contact Information Section -->
          <div class="modal-section">
            <h4><i class="bi bi-person-circle"></i> Contact Information</h4>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Customer Name</div>
                <div class="info-value">${user.firstName || ''} ${user.lastName || ''}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Customer ID</div>
                <div class="info-value user-id-value">${booking.userID || ''}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Email</div>
                <div class="info-value">${user.email || 'Not provided'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Phone</div>
                <div class="info-value">${user.phone || 'Not provided'}</div>
              </div>
              ${user.licenseNumber ? `
              <div class="info-item">
                <div class="info-label">License Number</div>
                <div class="info-value">${user.licenseNumber}</div>
              </div>
              ` : ''}
            </div>
          </div>
          
          <!-- Vehicle Information Section -->
          <div class="modal-section">
            <h4><i class="bi bi-car-front"></i> Vehicle Information</h4>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Vehicle Model</div>
                <div class="info-value">${car.displayName || car.car_type || 'Unknown'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Car ID & License</div>
                <div class="info-value">${booking.carID}(${car.license_plate || 'N/A'})</div>
              </div>
              ${car.car_color ? `
              <div class="info-item">
                <div class="info-label">Color</div>
                <div class="info-value">
                  <span class="car-color-dot" style="background-color: ${colorNameToHex(car.car_color)}"></span>${car.car_color}
                </div>
              </div>
              ` : ''}
              ${car.fuel_type ? `
              <div class="info-item">
                <div class="info-label">Fuel Type</div>
                <div class="info-value">${car.fuel_type}</div>
              </div>
              ` : ''}
              ${modelInfo.seating_capacity ? `
              <div class="info-item">
                <div class="info-label">Seating Capacity</div>
                <div class="info-value">${modelInfo.seating_capacity} seats</div>
              </div>
              ` : ''}
            </div>
          </div>
          
          <!-- Booking Details Section -->
          <div class="modal-section">
            <h4><i class="bi bi-clock-history"></i> Booking Details</h4>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Booking ID</div>
                <div class="info-value">
                  <span class="id-badge">${displayBookingId}</span>
                </div>
              </div>
              <div class="info-item">
                <div class="info-label">Status</div>
                <div class="info-value">
                  <span class="status-badge ${statusClass}">${formattedStatus}</span>
                </div>
              </div>
              <div class="info-item">
                <div class="info-label">Start Time</div>
                <div class="info-value">
                  ${formatDate(startDate)} at ${formatTime(startDate)}
                </div>
              </div>
              <div class="info-item">
                <div class="info-label">End Time</div>
                <div class="info-value">
                  ${formatDate(endDate)} at ${formatTime(endDate)}
                </div>
              </div>
              <div class="info-item">
                <div class="info-label">Duration</div>
                <div class="info-value">
                  ${formatDuration(startDate, endDate)}
                </div>
              </div>
              <div class="info-item">
                <div class="info-label">Price</div>
                <div class="info-value price-value">
                  $${formatPrice(booking.total_price)}
                </div>
              </div>
              ${booking.created_at ? `
              <div class="info-item">
                <div class="info-label">Created At</div>
                <div class="info-value">
                  ${formatDateTime(booking.created_at)}
                </div>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }
    
    // Show modal
    openModal();
    
    setLoading(false);
  } catch (error) {
    console.error("Error viewing booking details:", error);
    showMessage("Failed to load booking details", "error");
    setLoading(false);
  }
}

// Update booking status
async function updateBookingStatus(bookingId, newStatus) {
  try {
    setLoading(true);
    console.log(`Updating booking ${bookingId} status to ${newStatus}`);
    
    // Update status in Firestore
    await updateDoc(doc(db, "bookings", bookingId), {
      status: newStatus,
      updated_at: serverTimestamp()
    });
    
    // Update local data
    const bookingIndex = bookingsData.findIndex(b => b.id === bookingId);
    if (bookingIndex !== -1) {
      bookingsData[bookingIndex].status = newStatus;
      
      // Update UI
      const row = document.querySelector(`.booking-row[data-id="${bookingId}"]`);
      if (row) {
        const statusCell = row.querySelector(".status-badge");
        if (statusCell) {
          statusCell.className = `status-badge ${getStatusClass(newStatus)}`;
          statusCell.textContent = formatStatus(newStatus);
        }
      }
    }
    
    showMessage(`Booking status updated to ${formatStatus(newStatus)}`, "success");
    setLoading(false);
  } catch (error) {
    console.error("Error updating booking status:", error);
    showMessage("Failed to update booking status", "error");
    setLoading(false);
  }
}

// Confirm delete booking
function confirmDeleteBooking(bookingId) {
  if (confirm("Are you sure you want to delete this booking? This action cannot be undone.")) {
    deleteBooking(bookingId);
  }
}

// Delete booking
async function deleteBooking(bookingId) {
  try {
    setLoading(true);
    console.log(`Deleting booking ${bookingId}`);
    
    // Delete booking in Firestore
    await deleteDoc(doc(db, "bookings", bookingId));
    
    // Remove from local data
    bookingsData = bookingsData.filter(b => b.id !== bookingId);
    
    // Remove from UI
    const row = document.querySelector(`.booking-row[data-id="${bookingId}"]`);
    if (row) {
      row.classList.add("fade-out");
      setTimeout(() => {
        row.remove();
        
        // Show no bookings message if no bookings left
        if (bookingsData.length === 0) {
          showNoBookingsMessage();
        }
      }, 300);
    }
    
    showMessage("Booking deleted successfully", "success");
    setLoading(false);
  } catch (error) {
    console.error("Error deleting booking:", error);
    showMessage("Failed to delete booking", "error");
    setLoading(false);
  }
}

// Edit booking - redirect to edit page
function editBooking(bookingId) {
  window.location.href = `admin-booking-edit.html?id=${bookingId}`;
}

// Handle filter change
function handleFilterChange(event) {
  currentFilter = event.target.value;
  loadBookingsData();
}

// Handle sort change
function handleSortChange(event) {
  currentSort = event.target.value;
  loadBookingsData();
}

// Handle search
function handleSearch(event) {
  searchTerm = event.target.value.trim();
  loadBookingsData();
}

// Handle date range change
function handleDateRangeChange() {
  // This gets called when date inputs change
  // Actual reload happens when Apply button is clicked
  console.log("Date range changed");
}

// Load more bookings
function loadMoreBookings() {
  loadBookingsData(true);
}

// Open modal
function openModal() {
  if (bookingModal) {
    bookingModal.classList.add("show");
    document.body.style.overflow = "hidden";
  }
}

// Close modal
function closeModal() {
  if (bookingModal) {
    bookingModal.classList.remove("show");
    document.body.style.overflow = "";
  }
}

// Show/hide UI elements
function showNoBookingsMessage() {
  if (noBookingsMessage) {
    noBookingsMessage.style.display = "flex";
  }
  hideLoadMoreButton();
}

function hideNoBookingsMessage() {
  if (noBookingsMessage) {
    noBookingsMessage.style.display = "none";
  }
}

function showLoadMoreButton() {
  if (loadMoreBtn) {
    loadMoreBtn.style.display = "block";
  }
}

function hideLoadMoreButton() {
  if (loadMoreBtn) {
    loadMoreBtn.style.display = "none";
  }
}

function setLoading(show) {
  isLoading = show;
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? "flex" : "none";
  }
}

// Utility functions
function getUserInitials(user) {
  if (!user) return "?";
  
  try {
    if (user.firstName && user.lastName) {
      return (user.firstName.charAt(0) + user.lastName.charAt(0)).toUpperCase();
    } else if (user.firstName) {
      return user.firstName.charAt(0).toUpperCase();
    } else if (user.lastName) {
      return user.lastName.charAt(0).toUpperCase();
    } else if (user.email) {
      return user.email.charAt(0).toUpperCase();
    } else {
      return "?";
    }
  } catch (error) {
    console.error("Error getting user initials:", error);
    return "?";
  }
}

function formatDate(date) {
  if (!date) return "N/A";
  
  try {
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid Date";
  }
}

function formatTime(date) {
  if (!date) return "N/A";
  
  try {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error("Error formatting time:", error);
    return "Invalid Time";
  }
}

function formatDateTime(timestamp) {
  if (!timestamp) return "N/A";
  
  try {
    let date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error("Error formatting datetime:", error);
    return "Invalid Date/Time";
  }
}

function formatPrice(price) {
  if (price === undefined || price === null) return "0.00";
  
  try {
    return Number(price).toFixed(2);
  } catch (error) {
    return "0.00";
  }
}

function formatStatus(status) {
  if (!status) return "Unknown";
  
  // Capitalize first letter
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDuration(startDate, endDate) {
  if (!startDate || !endDate) return "Unknown";
  
  try {
    const durationMs = endDate - startDate;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    let result = "";
    if (hours > 0) {
      result += `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    
    if (minutes > 0 || hours === 0) {
      if (result) result += " ";
      result += `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
    
    return result;
  } catch (error) {
    console.error("Error formatting duration:", error);
    return "Unknown";
  }
}

function getStatusClass(status) {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'status-active';
    case 'upcoming':
      return 'status-upcoming';
    case 'completed':
      return 'status-completed';
    case 'cancelled':
      return 'status-cancelled';
    case 'pending':
      return 'status-pending';
    case 'confirmed':
      return 'status-confirmed';
    default:
      return 'status-default';
  }
}

// Convert color name to hex
function colorNameToHex(colorName) {
  if (!colorName) return "#cccccc";
  
  const colors = {
    "white": "#ffffff",
    "black": "#000000",
    "blue": "#0d6efd",
    "red": "#dc3545",
    "green": "#198754",
    "yellow": "#ffc107",
    "silver": "#adb5bd",
    "gray": "#6c757d",
  };
  
  return colors[colorName?.toLowerCase()] || "#cccccc";
}

// Initialize tooltips
function initializeTooltips() {
  const tooltipElements = document.querySelectorAll('[data-tooltip]');
  
  tooltipElements.forEach(element => {
    element.addEventListener('mouseenter', showTooltip);
    element.addEventListener('mouseleave', hideTooltip);
  });
}

function showTooltip(event) {
  const element = event.currentTarget;
  const tooltipText = element.getAttribute('data-tooltip');
  
  if (!tooltipText) return;
  
  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = tooltipText;
  document.body.appendChild(tooltip);
  
  // Position tooltip
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
  tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
  
  // Store tooltip reference
  element.tooltip = tooltip;
}

function hideTooltip(event) {
  const element = event.currentTarget;
  if (element.tooltip) {
    element.tooltip.remove();
    element.tooltip = null;
  }
}

// Debounce function for search input
function debounce(func, delay) {
  let timeout;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

// Show message toast
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
  toast.className = `toast ${type}`;
  
  // Create icon based on type
  let icon = "info-circle";
  if (type === "success") icon = "check-circle";
  if (type === "error") icon = "exclamation-circle";
  if (type === "warning") icon = "exclamation-triangle";
  
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="bi bi-${icon}"></i>
    </div>
    <div class="toast-content">${message}</div>
    <button class="toast-close">
      <i class="bi bi-x"></i>
    </button>
  `;
  
  // Add close functionality
  const closeBtn = toast.querySelector(".toast-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      toast.classList.add("toast-hiding");
      setTimeout(() => {
        toast.remove();
      }, 300);
    });
  }
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.add("toast-show");
  }, 10);
  
  // Auto-remove after delay
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add("toast-hiding");
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }
  }, 5000);
}

// Listen for storage events (for multi-tab coordination)
window.addEventListener("storage", (event) => {
  if (event.key === "bookingsRefresh") {
    loadBookingsData();
  }
});