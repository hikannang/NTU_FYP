import { db, auth } from "../common/firebase-config.js";
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

// Debug flag - set to true to enable detailed logging
const DEBUG = true;

function debug(...args) {
  if (DEBUG) console.log(...args);
}

debug("ADMIN-BOOKINGS.JS LOADED");

// Global variables
let currentUser = null;
let bookingsData = [];
let carsData = new Map();
let usersData = new Map();
let lastVisible = null;
let isLoading = false;
let isLoadingMore = false;
let currentFilter = "all";
let currentSort = "newest";
let searchTerm = "";
let searchTimeoutId = null;
let batchSize = 15;

// DOM Elements - will be initialized once DOM is loaded
let bookingsTableBody = null;
let filterSelect = null;
let sortSelect = null;
let searchInput = null;
let loadMoreBtn = null;
let loadingOverlay = null;
let noBookingsMessage = null;

// Initialize the page
document.addEventListener("DOMContentLoaded", async function () {
  debug("DOM loaded, initializing admin bookings page");

  try {
    // Load header and footer
    document.getElementById("header").innerHTML = await fetch(
      "../static/headerFooter/admin-header.html"
    ).then((response) => response.text());

    document.getElementById("footer").innerHTML = await fetch(
      "../static/headerFooter/admin-footer.html"
    ).then((response) => response.text());

    // Find and store DOM elements with correct IDs
    bookingsTableBody = document.getElementById("bookings-table-body");
    filterSelect = document.getElementById("filter-select"); // Updated ID
    sortSelect = document.getElementById("sort-select");
    searchInput = document.getElementById("search-input");
    loadMoreBtn = document.getElementById("load-more-btn");
    loadingOverlay = document.getElementById("loading-overlay");

    debug("Table body found:", bookingsTableBody);

    // DOM element validation
    if (!bookingsTableBody) {
      console.error("CRITICAL ERROR: Bookings table body not found!");
      createErrorMessage(
        "The booking table element could not be found. Please check your HTML structure."
      );
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
          if (userData.role !== "admin") {
            console.warn("Non-admin user accessing admin page");
            window.location.href = "../user/user-dashboard.html";
            return;
          }

          currentUser = {
            uid: user.uid,
            ...userData,
          };

          debug("Admin authenticated:", currentUser.firstName);

          // Now that user is authenticated, set up the page
          setupPage();
        } catch (error) {
          console.error("Error loading user data:", error);
          showMessage(
            "Error loading user data. Please try again later.",
            "error"
          );
        }
      } else {
        // Not logged in
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("Error initializing page:", error);
    createErrorMessage("Failed to initialize the page. Please try refreshing.");
  }
});

// Set up the page after authentication
function setupPage() {
  // Set up event listeners
  setupEventListeners();

  // Load initial bookings data
  loadBookingsData();

  // Set up modal close functionality
  setupModalClose();
}

// Set up event listeners
function setupEventListeners() {
  // Status filter - updated ID
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      debug(`Status filter changed to: ${filterSelect.value}`);
      currentFilter = filterSelect.value;
      loadBookingsData();
    });
  }

  // Sort select
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      debug(`Sort changed to: ${sortSelect.value}`);
      currentSort = sortSelect.value;
      loadBookingsData();
    });
  }

  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (searchTimeoutId) {
        clearTimeout(searchTimeoutId);
      }

      searchTimeoutId = setTimeout(() => {
        searchTerm = searchInput.value.trim();
        debug(`Search term: "${searchTerm}"`);
        loadBookingsData();
      }, 300);
    });
  }

  // Date range filter - updated ID
  const applyFiltersBtn = document.getElementById("apply-filters");
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener("click", () => {
      debug("Applying date filter");
      loadBookingsData();
    });
  }

  // Reset filters button
  const resetFiltersBtn = document.getElementById("reset-filters");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      debug("Resetting filters");
      // Reset form elements
      if (filterSelect) filterSelect.value = "all";
      if (sortSelect) sortSelect.value = "newest";
      if (searchInput) searchInput.value = "";
      const startDate = document.getElementById("start-date");
      if (startDate) startDate.value = "";
      const endDate = document.getElementById("end-date");
      if (endDate) endDate.value = "";

      // Reset internal state
      currentFilter = "all";
      currentSort = "newest";
      searchTerm = "";

      // Reload data
      loadBookingsData();
    });
  }

  // Clear filters button in empty state
  const clearFiltersBtn = document.getElementById("clear-filters-btn");
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      // Same as reset filters
      if (filterSelect) filterSelect.value = "all";
      if (sortSelect) sortSelect.value = "newest";
      if (searchInput) searchInput.value = "";
      const startDate = document.getElementById("start-date");
      if (startDate) startDate.value = "";
      const endDate = document.getElementById("end-date");
      if (endDate) endDate.value = "";

      currentFilter = "all";
      currentSort = "newest";
      searchTerm = "";

      loadBookingsData();
    });
  }

  // Load more button
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      debug("Loading more bookings");
      isLoadingMore = true;
      loadBookingsData();
    });
  }
}

// Enhanced search function for bookings
async function loadBookingsData() {
  try {
    debug(
      `Loading bookings with filter: ${currentFilter}, sort: ${currentSort}, search: "${searchTerm}"`
    );
    setLoading(true);

    // Build query based on filter and sort
    const bookingsRef = collection(db, "bookings");
    const queryConstraints = [];

    // Apply status filter
    if (currentFilter !== "all") {
      queryConstraints.push(where("status", "==", currentFilter));
    }

    // Apply date range filter if provided
    const startDateInput = document.getElementById("start-date");
    const endDateInput = document.getElementById("end-date");

    if (startDateInput && startDateInput.value) {
      const startDate = new Date(startDateInput.value);
      startDate.setHours(0, 0, 0, 0);
      queryConstraints.push(
        where("start_time", ">=", Timestamp.fromDate(startDate))
      );
    }

    if (endDateInput && endDateInput.value) {
      const endDate = new Date(endDateInput.value);
      endDate.setHours(23, 59, 59, 999);
      queryConstraints.push(
        where("end_time", "<=", Timestamp.fromDate(endDate))
      );
    }

    // Apply sorting
    let sortField, sortDirection;
    switch (currentSort) {
      case "oldest":
        sortField = "created_at";
        sortDirection = "asc";
        break;
      case "price-high":
        sortField = "total_price";
        sortDirection = "desc";
        break;
      case "price-low":
        sortField = "total_price";
        sortDirection = "asc";
        break;
      case "newest":
      default:
        sortField = "created_at";
        sortDirection = "desc";
        break;
    }

    queryConstraints.push(orderBy(sortField, sortDirection));

    // Apply pagination
    if (lastVisible && isLoadingMore) {
      queryConstraints.push(startAfter(lastVisible));
    } else {
      lastVisible = null;
    }

    queryConstraints.push(limit(batchSize));

    // Execute query
    const bookingsQuery = query(bookingsRef, ...queryConstraints);
    const bookingsSnapshot = await getDocs(bookingsQuery);

    debug(`Query returned ${bookingsSnapshot.size} bookings`);

    // Process bookings
    const fetchedBookings = [];

    // Track IDs we've already seen for skip checking
    const seenIds = new Set(bookingsData.map((booking) => booking.id));
    let skippedCount = 0;

    bookingsSnapshot.forEach((doc) => {
      const booking = {
        id: doc.id,
        ...doc.data(),
      };

      // Skip if we've already seen this booking
      if (isLoadingMore && seenIds.has(booking.id)) {
        skippedCount++;
        debug(`Skipping already seen booking: ${booking.id}`);
      } else {
        fetchedBookings.push(booking);
        seenIds.add(booking.id); // Add to seen set
      }
    });

    debug(
      `Processed ${bookingsSnapshot.size} bookings, skipped ${skippedCount} duplicates`
    );

    if (bookingsSnapshot.size > 0) {
      lastVisible = bookingsSnapshot.docs[bookingsSnapshot.size - 1];
      debug(`Updated lastVisible to document ID: ${lastVisible.id}`);
    }

    if (fetchedBookings.length === 0 && skippedCount > 0 && isLoadingMore) {
      debug(
        `All ${skippedCount} bookings were duplicates, automatically loading more...`
      );
      // Get more results by recursively calling this function
      return loadBookingsData();
    }

    // Apply comprehensive search if search term is provided
    let filteredBookings = fetchedBookings;
    if (searchTerm) {
      debug(`Applying search for term: "${searchTerm}"`);

      // Make sure we have user and car data for searching
      await loadAssociatedData(fetchedBookings);

      // Search the fetched bookings
      filteredBookings = await comprehensiveSearch(fetchedBookings, searchTerm);

      debug(`Search returned ${filteredBookings.length} results`);
    }

    // Update bookingsData
    if (isLoadingMore) {
      bookingsData = [...bookingsData, ...filteredBookings];
    } else {
      bookingsData = filteredBookings;
    }

    debug(`Total bookings in memory after update: ${bookingsData.length}`);

    // If not loading more and not searching, ensure we have associated data for display
    if (!isLoadingMore && !searchTerm) {
      await loadAssociatedData(bookingsData);
    }

    // Render bookings
    renderBookings(bookingsData, isLoadingMore);

    // Update load more button
    if (bookingsSnapshot.size < batchSize) {
      hideLoadMoreButton();
    } else {
      showLoadMoreButton();
    }

    // Reset loading more flag
    isLoadingMore = false;
    setLoading(false);

    return true;
  } catch (error) {
    console.error("Error loading bookings data:", error);
    showMessage("Failed to load bookings", "error");
    setLoading(false);
    isLoadingMore = false;
    return false;
  }
}

// Replace your current comprehensiveSearch function with this version:
async function comprehensiveSearch(bookings, searchTerm) {
  debug(`Performing comprehensive search for: "${searchTerm}"`);
  
  // If search term is empty, return all bookings
  if (!searchTerm || searchTerm.trim() === "") {
    return bookings;
  }
  
  const lowercaseSearchTerm = searchTerm.toLowerCase().trim();
  
  // Prepare search results
  const matches = [];
  
  // Simple search function to avoid complexity
  for (const booking of bookings) {
    let isMatch = false;
    
    // 1. Check booking ID
    if (booking.id && booking.id.toLowerCase().includes(lowercaseSearchTerm)) {
      debug(`Match found in booking ID: ${booking.id}`);
      isMatch = true;
    }
    
    // 2. Check booking status
    if (!isMatch && booking.status && booking.status.toLowerCase().includes(lowercaseSearchTerm)) {
      debug(`Match found in booking status: ${booking.status}`);
      isMatch = true;
    }
    
    // 3. Check price
    if (!isMatch && booking.total_price !== undefined) {
      const priceStr = String(booking.total_price);
      if (priceStr.includes(lowercaseSearchTerm)) {
        debug(`Match found in booking price: ${booking.total_price}`);
        isMatch = true;
      }
    }
    
    // 4. Check user data
    if (!isMatch && booking.user_id && usersData.has(booking.user_id)) {
      const userData = usersData.get(booking.user_id);
      
      if (userData) {
        // Check name
        const firstName = (userData.firstName || "").toLowerCase();
        const lastName = (userData.lastName || "").toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        
        if (firstName.includes(lowercaseSearchTerm) || 
            lastName.includes(lowercaseSearchTerm) || 
            fullName.includes(lowercaseSearchTerm)) {
          debug(`Match found in user name: ${fullName} for booking: ${booking.id}`);
          isMatch = true;
        }
        
        // Check email
        if (!isMatch && userData.email && 
            userData.email.toLowerCase().includes(lowercaseSearchTerm)) {
          debug(`Match found in user email: ${userData.email} for booking: ${booking.id}`);
          isMatch = true;
        }
      }
    }
    
    // 5. Check car data
    if (!isMatch && booking.car_id && carsData.has(booking.car_id)) {
      const carData = carsData.get(booking.car_id);
      
      if (carData) {
        // Check license plate
        if (carData.license_plate && 
            carData.license_plate.toLowerCase().includes(lowercaseSearchTerm)) {
          debug(`Match found in car license plate: ${carData.license_plate} for booking: ${booking.id}`);
          isMatch = true;
        }
        
        // Check car type
        if (!isMatch && carData.car_type && 
            carData.car_type.toLowerCase().includes(lowercaseSearchTerm)) {
          debug(`Match found in car type: ${carData.car_type} for booking: ${booking.id}`);
          isMatch = true;
        }
        
        // Check car ID
        if (!isMatch && booking.car_id.toLowerCase().includes(lowercaseSearchTerm)) {
          debug(`Match found in car ID: ${booking.car_id} for booking: ${booking.id}`);
          isMatch = true;
        }
      }
    }
    
    // Add to results if any match found
    if (isMatch) {
      matches.push(booking);
    }
  }
  
  debug(`Search found ${matches.length} matches out of ${bookings.length} bookings`);
  return matches;
}

// Check if booking fields match any search terms
function isBookingMatch(booking, searchTerms) {
  if (!booking) return false;

  // Fields to check directly
  const fieldsToCheck = {
    // Basic info
    id: String(booking.id || ""),
    status: String(booking.status || ""),

    // Price related
    total_price: String(booking.total_price || ""),
    price_per_hour: String(booking.price_per_hour || ""),

    // IDs
    car_id: String(booking.car_id || ""),
    user_id: String(booking.user_id || ""),

    // Notes and other text fields
    notes: String(booking.notes || ""),
    payment_method: String(booking.payment_method || ""),
    payment_status: String(booking.payment_status || ""),
  };

  // Check each field
  for (const [field, value] of Object.entries(fieldsToCheck)) {
    if (
      value &&
      searchTerms.some((term) => value.toLowerCase().includes(term))
    ) {
      return true;
    }
  }

  // Check dates with special handling
  const dates = {
    start_time: booking.start_time,
    end_time: booking.end_time,
    created_at: booking.created_at,
  };

  // Format dates in multiple formats for searching
  for (const [dateField, dateValue] of Object.entries(dates)) {
    if (dateValue) {
      const formattedDates = formatDateForSearch(dateValue);
      if (searchTerms.some((term) => formattedDates.includes(term))) {
        return true;
      }
    }
  }

  return false;
}

// Check if user fields match any search terms
function isUserMatch(user, searchTerms) {
  if (!user) return false;

  // Fields to check directly
  const fieldsToCheck = {
    id: String(user.id || ""),
    firstName: String(user.firstName || ""),
    lastName: String(user.lastName || ""),
    email: String(user.email || ""),
    phone: String(user.phone || ""),
  };

  // Check each field
  for (const [field, value] of Object.entries(fieldsToCheck)) {
    if (
      value &&
      searchTerms.some((term) => value.toLowerCase().includes(term))
    ) {
      return true;
    }
  }

  // Special check for full name
  const fullName = `${user.firstName || ""} ${user.lastName || ""}`
    .toLowerCase()
    .trim();
  if (fullName && searchTerms.some((term) => fullName.includes(term))) {
    return true;
  }

  return false;
}

// Check if car fields match any search terms
function isCarMatch(car, searchTerms) {
  if (!car) return false;

  // Fields to check directly
  const fieldsToCheck = {
    id: String(car.id || ""),
    car_type: String(car.car_type || ""),
    license_plate: String(car.license_plate || ""),
    car_color: String(car.car_color || ""),
    address: String(car.address || ""),
    make: String(car.make || ""),
    model: String(car.model || ""),
    displayName: String(car.displayName || ""),
  };

  // Check each field
  for (const [field, value] of Object.entries(fieldsToCheck)) {
    if (
      value &&
      searchTerms.some((term) => value.toLowerCase().includes(term))
    ) {
      return true;
    }
  }

  // Also check car model info if available
  if (car.modelInfo) {
    const modelFields = {
      name: String(car.modelInfo.name || ""),
      make: String(car.modelInfo.make || ""),
      model: String(car.modelInfo.model || ""),
      fuel_type: String(car.modelInfo.fuel_type || ""),
    };

    for (const [field, value] of Object.entries(modelFields)) {
      if (
        value &&
        searchTerms.some((term) => value.toLowerCase().includes(term))
      ) {
        return true;
      }
    }
  }

  return false;
}

// Format dates for searching
function formatDateForSearch(timestamp) {
  if (!timestamp) return "";

  let date;
  try {
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
  } catch (e) {
    debug(`Error converting timestamp to date: ${e}`);
    return "";
  }

  if (isNaN(date.getTime())) {
    return "";
  }

  // Format in multiple ways for flexible searching
  const formats = [
    // US format
    `${date.getMonth() + 1}/${date.getDate()}`,
    `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`,
    `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`,

    // ISO format
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`,

    // Month names
    `${date.toLocaleString("en-US", { month: "long" })}`,
    `${date.toLocaleString("en-US", { month: "short" })}`,

    // Year alone
    `${date.getFullYear()}`,

    // Time
    `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`,

    // Month and year
    `${date.toLocaleString("en-US", { month: "short" })} ${date.getFullYear()}`,

    // Day of month
    `${date.getDate()}`,
  ];

  return formats.join(" ").toLowerCase();
}

// Make sure loadAssociatedData is working properly:
async function loadAssociatedData(bookings) {
  debug(`Loading associated data for ${bookings.length} bookings`);

  // Create arrays to track what we need to load
  const userIdsToLoad = [];
  const carIdsToLoad = [];

  // Check what data we need to load
  bookings.forEach((booking) => {
    if (booking.user_id && !usersData.has(booking.user_id)) {
      userIdsToLoad.push(booking.user_id);
    }

    if (booking.car_id && !carsData.has(booking.car_id)) {
      carIdsToLoad.push(booking.car_id);
    }
  });

  debug(
    `Need to load ${userIdsToLoad.length} users and ${carIdsToLoad.length} cars`
  );

  // Load user data
  const userPromises = userIdsToLoad.map(async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        usersData.set(userId, userData);
      }
    } catch (error) {
      debug(`Error loading user ${userId}: ${error}`);
    }
  });

  // Load car data
  const carPromises = carIdsToLoad.map(async (carId) => {
    try {
      const carDoc = await getDoc(doc(db, "cars", carId.toString()));
      if (carDoc.exists()) {
        const carData = carDoc.data();
        carsData.set(carId, carData);
      }
    } catch (error) {
      debug(`Error loading car ${carId}: ${error}`);
    }
  });

  // Wait for all data to load
  await Promise.all([...userPromises, ...carPromises]);

  debug(
    `Finished loading associated data: ${usersData.size} users, ${carsData.size} cars`
  );
}

// Render bookings to table
function renderBookings(bookings, isAppend = false) {
  debug(`Rendering ${bookings.length} bookings, append mode: ${isAppend}`);

  if (!bookingsTableBody) {
    console.error("bookingsTableBody element not found");
    return;
  }

  if (!isAppend) {
    debug("Clearing existing table content");
    bookingsTableBody.innerHTML = "";
  }

  if (bookings.length === 0 && !isAppend) {
    debug("No bookings to show, displaying empty state");
    showNoBookingsMessage();
    return;
  }

  hideNoBookingsMessage();

  bookings.forEach((booking) => {
    const row = createBookingRow(booking);
    bookingsTableBody.appendChild(row);
  });

  debug("Finished rendering bookings");
}

// Create a booking row
function createBookingRow(booking) {
  if (!booking) {
    console.error("Attempted to create row with null booking data");
    return document.createElement("tr");
  }

  debug(`Creating row for booking: ${booking.id}`);

  const row = document.createElement("tr");
  row.className = "booking-row";
  row.dataset.id = booking.id;

  // Extract booking ID - just the numeric part excluding "booking_"
  let displayBookingId = booking.id;
  if (booking.id.startsWith("booking_")) {
    displayBookingId = booking.id.replace("booking_", "");
    debug(`Formatted booking ID to: ${displayBookingId}`);
  }

  // Get user information using exact field names from database
  const userId = booking.user_id;
  let userName = "Unknown";

  if (userId && usersData.has(userId)) {
    const userData = usersData.get(userId);
    userName = userData.firstName || "Unknown";
    debug(`Found user name: ${userName} for user ${userId}`);
  } else {
    debug(`No user data found for user ID: ${userId}`);
  }

  // Get car information using exact field names from database
  const carId = booking.car_id;
  let carName = "Unknown";
  let licensePlate = "N/A";

  if (carId && carsData.has(carId)) {
    const carData = carsData.get(carId);

    // Get license plate
    licensePlate = carData.license_plate || "N/A";

    // Get display name
    if (carData.displayName) {
      carName = carData.displayName;
    } else if (carData.car_type) {
      carName = carData.car_type;
    }

    debug(
      `Found car name: ${carName}, license: ${licensePlate} for car ${carId}`
    );
  } else {
    debug(`No car data found for car ID: ${carId}`);
  }

  // Format dates
  let startDate, endDate;
  try {
    if (booking.start_time instanceof Timestamp) {
      startDate = booking.start_time.toDate();
    } else if (
      booking.start_time &&
      typeof booking.start_time === "object" &&
      booking.start_time.seconds
    ) {
      startDate = new Date(booking.start_time.seconds * 1000);
    } else {
      startDate = new Date(booking.start_time);
    }
  } catch (e) {
    console.error(`Error parsing start date for booking ${booking.id}:`, e);
    startDate = new Date();
  }

  try {
    if (booking.end_time instanceof Timestamp) {
      endDate = booking.end_time.toDate();
    } else if (
      booking.end_time &&
      typeof booking.end_time === "object" &&
      booking.end_time.seconds
    ) {
      endDate = new Date(booking.end_time.seconds * 1000);
    } else {
      endDate = new Date(booking.end_time);
    }
  } catch (e) {
    console.error(`Error parsing end date for booking ${booking.id}:`, e);
    endDate = new Date(startDate.getTime() + 3600000);
  }

  // Format date strings
  const dateOptions = { day: "2-digit", month: "short", year: "numeric" };
  const timeOptions = { hour: "2-digit", minute: "2-digit", hour12: true };

  const formattedStartDate = startDate.toLocaleDateString("en-US", dateOptions);
  const formattedStartTime = startDate.toLocaleTimeString("en-US", timeOptions);

  const formattedEndDate = endDate.toLocaleDateString("en-US", dateOptions);
  const formattedEndTime = endDate.toLocaleTimeString("en-US", timeOptions);

  // Calculate duration
  const durationMs = endDate - startDate;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  const durationText = `${hours}h ${minutes}m`;

  // Format price
  const price = booking.total_price || 0;
  const formattedPrice = `$${parseFloat(price).toFixed(2)}`;

  // Format status
  const status = booking.status || "unknown";
  const statusClass = getStatusClass(status);
  const statusText = capitalizeFirst(status);

  // Build row HTML
  row.innerHTML = `
    <td class="booking-id">
      <span class="id-badge">${displayBookingId}</span>
    </td>
    <td>
      <div class="user-cell">
        <div class="user-info">
          <div class="user-name">${userName}</div>
          <div class="user-id">${userId || "N/A"}</div>
        </div>
      </div>
    </td>
    <td>
      <div class="car-cell">
        <div class="car-info">
          <div class="car-name">${carName}</div>
          <div class="car-plate">${licensePlate} (${carId || "N/A"})</div>
        </div>
      </div>
    </td>
    <td>
      <div class="date-cell">
        <div class="date">${formattedStartDate}</div>
        <div class="time">${formattedStartTime}</div>
      </div>
    </td>
    <td>
      <div class="date-cell">
        <div class="date">${formattedEndDate}</div>
        <div class="time">${formattedEndTime}</div>
      </div>
    </td>
    <td>
      <div class="duration-cell">${durationText}</div>
    </td>
    <td>
      <div class="price-cell">${formattedPrice}</div>
    </td>
    <td>
      <div class="status-cell">
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
    </td>
    <td>
      <div class="actions-cell">
        <button class="view-btn" title="View Details">
          <i class="bi bi-eye"></i>
        </button>
        <button class="edit-btn" title="Edit Booking">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="delete-btn" title="Delete">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </td>
  `;

  // Add event listeners to action buttons
  const viewBtn = row.querySelector(".view-btn");
  const editBtn = row.querySelector(".edit-btn");
  const deleteBtn = row.querySelector(".delete-btn");

  if (viewBtn) {
    // Make sure we're using a direct event handler, not an onclick attribute
    viewBtn.addEventListener("click", function () {
      debug(`View button clicked for booking: ${booking.id}`);
      viewBookingDetails(booking.id);
    });
  }

  if (editBtn) {
    editBtn.addEventListener("click", () => editBooking(booking.id));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => confirmDeleteBooking(booking.id));
  }

  debug(`Row created successfully for booking ${booking.id}`);
  return row;
}

// View booking details - completely regenerated function
async function viewBookingDetails(bookingId) {
  debug(`Viewing booking details for ID: ${bookingId}`);
  try {
    setLoading(true);

    // STEP 1: Find the modal element early to verify it exists
    const modal = document.getElementById("booking-modal");
    if (!modal) {
      console.error("CRITICAL ERROR: Modal element not found!");
      // Create a simple alert if modal is completely missing
      alert(
        `Cannot display booking details - modal element missing from page.`
      );
      setLoading(false);
      return;
    }

    debug("Modal element found:", modal);

    // STEP 2: Get booking data
    const bookingDoc = await getDoc(doc(db, "bookings", bookingId));

    if (!bookingDoc.exists()) {
      showMessage("Booking not found", "error");
      setLoading(false);
      return;
    }

    const booking = {
      id: bookingId,
      ...bookingDoc.data(),
    };

    debug("Retrieved booking data:", booking);

    // STEP 3: Get user and car data
    const userId = booking.user_id;
    const carId = booking.car_id;

    debug(`Looking up user: ${userId} and car: ${carId}`);

    let userData = null;
    let carData = null;

    // Get user data
    if (userId) {
      if (usersData.has(userId)) {
        userData = usersData.get(userId);
        debug("Found user data in cache:", userData);
      } else {
        debug(
          `User data not in cache, fetching from database for ID: ${userId}`
        );
        try {
          const userDoc = await getDoc(doc(db, "users", userId));
          if (userDoc.exists()) {
            userData = {
              id: userId,
              ...userDoc.data(),
            };
            usersData.set(userId, userData);
            debug("Fetched and cached user data:", userData);
          } else {
            debug(`No user document found for ID: ${userId}`);
            userData = { id: userId, firstName: "Unknown", lastName: "" };
          }
        } catch (e) {
          console.error("Error fetching user data:", e);
          userData = { id: userId, firstName: "Unknown", lastName: "" };
        }
      }
    } else {
      debug("No userId provided in booking");
      userData = { firstName: "Unknown", lastName: "" };
    }

    // Get car data
    if (carId) {
      if (carsData.has(carId)) {
        carData = carsData.get(carId);
        debug("Found car data in cache:", carData);
      } else {
        debug(`Car data not in cache, fetching from database for ID: ${carId}`);
        try {
          const carDoc = await getDoc(doc(db, "cars", String(carId)));
          if (carDoc.exists()) {
            carData = {
              id: carId,
              ...carDoc.data(),
            };

            // Get car model data if available
            if (carData.car_type) {
              try {
                const modelDoc = await getDoc(
                  doc(db, "car_models", carData.car_type)
                );
                if (modelDoc.exists()) {
                  const modelData = modelDoc.data();
                  carData.modelInfo = modelData;
                  carData.displayName = modelData.name || carData.car_type;
                }
              } catch (e) {
                console.error("Error fetching car model:", e);
              }
            }

            carsData.set(carId, carData);
            debug("Fetched and cached car data:", carData);
          } else {
            debug(`No car document found for ID: ${carId}`);
            carData = {
              id: carId,
              car_type: "Unknown Car",
              license_plate: "Unknown",
            };
          }
        } catch (e) {
          console.error("Error fetching car data:", e);
          carData = {
            id: carId,
            car_type: "Unknown Car",
            license_plate: "Unknown",
          };
        }
      }
    } else {
      debug("No carId provided in booking");
      carData = { car_type: "Unknown Car", license_plate: "Unknown" };
    }

    // STEP 4: Format dates
    let startDate, endDate, createdDate;

    try {
      if (booking.start_time instanceof Timestamp) {
        startDate = booking.start_time.toDate();
      } else if (
        typeof booking.start_time === "object" &&
        booking.start_time?.seconds
      ) {
        startDate = new Date(booking.start_time.seconds * 1000);
      } else {
        startDate = new Date(booking.start_time);
      }
    } catch (e) {
      console.error("Error parsing start date:", e);
      startDate = new Date();
    }

    try {
      if (booking.end_time instanceof Timestamp) {
        endDate = booking.end_time.toDate();
      } else if (
        typeof booking.end_time === "object" &&
        booking.end_time?.seconds
      ) {
        endDate = new Date(booking.end_time.seconds * 1000);
      } else {
        endDate = new Date(booking.end_time);
      }
    } catch (e) {
      console.error("Error parsing end date:", e);
      endDate = new Date(startDate.getTime() + 3600000); // 1 hour after start
    }

    try {
      if (booking.created_at instanceof Timestamp) {
        createdDate = booking.created_at.toDate();
      } else if (
        typeof booking.created_at === "object" &&
        booking.created_at?.seconds
      ) {
        createdDate = new Date(booking.created_at.seconds * 1000);
      } else if (booking.created_at) {
        createdDate = new Date(booking.created_at);
      } else {
        createdDate = new Date();
      }
    } catch (e) {
      console.error("Error parsing created date:", e);
      createdDate = new Date();
    }

    // STEP 5: Format for display
    const dateTimeFormat = {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };

    const formattedStartDateTime = startDate.toLocaleString(
      "en-US",
      dateTimeFormat
    );
    const formattedEndDateTime = endDate.toLocaleString(
      "en-US",
      dateTimeFormat
    );
    const formattedCreatedDate = createdDate.toLocaleDateString("en-US");

    // Calculate duration
    const durationMs = endDate - startDate;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    // STEP 6: Verify modal elements exist before updating
    const modalTitle = document.querySelector(
      "#booking-modal .modal-header h2"
    );
    const modalBody = document.getElementById("modal-body");

    if (!modalBody) {
      console.error("Modal body element not found!");
      showMessage(
        "Could not display booking details - modal body missing",
        "error"
      );
      setLoading(false);
      return;
    }

    // STEP 7: Update the modal content
    debug("Updating modal content");

    // Update title if present
    if (modalTitle) {
      modalTitle.textContent = `Booking Details: ${bookingId.replace(
        "booking_",
        ""
      )}`;
    }

    // Build detailed HTML content
    modalBody.innerHTML = `
      <div class="booking-details-grid">
        <!-- Booking Info Section -->
        <div class="details-section">
          <h4><i class="bi bi-info-circle"></i> Booking Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Status</div>
              <div class="info-value">
                <span class="status-badge ${getStatusClass(booking.status)}">
                  ${capitalizeFirst(booking.status || "Unknown")}
                </span>
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">Created On</div>
              <div class="info-value">${formattedCreatedDate}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Price</div>
              <div class="info-value">$${(booking.total_price || 0).toFixed(
                2
              )}</div>
            </div>
          </div>
        </div>
        
        <!-- Customer Info Section -->
        <div class="details-section">
          <h4><i class="bi bi-person"></i> Customer Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Name</div>
              <div class="info-value">${userData.firstName || "Unknown"} ${
      userData.lastName || ""
    }</div>
            </div>
            <div class="info-item">
              <div class="info-label">Customer ID</div>
              <div class="info-value">${userId || "Unknown"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Email</div>
              <div class="info-value">${userData.email || "Not provided"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Phone</div>
              <div class="info-value">${userData.phone || "Not provided"}</div>
            </div>
          </div>
        </div>
        
        <!-- Vehicle Information -->
        <div class="details-section">
          <h4><i class="bi bi-car-front"></i> Vehicle Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Vehicle Model</div>
              <div class="info-value">${
                carData.displayName || carData.car_type || "Unknown"
              }</div>
            </div>
            <div class="info-item">
              <div class="info-label">Car ID & License</div>
              <div class="info-value">${carId || "Unknown"}(${
      carData.license_plate || "N/A"
    })</div>
            </div>
            <div class="info-item">
              <div class="info-label">Color</div>
              <div class="info-value">${
                carData.car_color || "Not specified"
              }</div>
            </div>
          </div>
        </div>
        
        <!-- Time Information -->
        <div class="details-section">
          <h4><i class="bi bi-clock"></i> Time Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Start</div>
              <div class="info-value">${formattedStartDateTime}</div>
            </div>
            <div class="info-item">
              <div class="info-label">End</div>
              <div class="info-value">${formattedEndDateTime}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Duration</div>
              <div class="info-value">${hours}h ${minutes}m</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // STEP 8: Set up the modal action buttons
    const editBtn = document.getElementById("edit-booking-btn");
    if (editBtn) {
      // For anchor tags, update the href
      if (editBtn.tagName.toLowerCase() === "a") {
        editBtn.href = `admin-booking-edit.html?id=${bookingId}`;
      } else {
        // For buttons, set the click handler
        editBtn.onclick = () => {
          window.location.href = `admin-booking-edit.html?id=${bookingId}`;
        };
      }
    }

    // STEP 9: Show the modal with multiple display techniques
    debug("Showing modal with visibility checks");

    // First make sure it's in the document
    if (!document.body.contains(modal)) {
      document.body.appendChild(modal);
      debug("Modal was missing from DOM, added it to body");
    }

    // Multiple techniques to ensure visibility
    modal.style.display = "flex";
    modal.style.visibility = "visible";
    modal.style.opacity = "1";
    modal.classList.add("active");

    // Force a reflow
    void modal.offsetWidth;

    // Check if modal is visible
    setTimeout(() => {
      const style = window.getComputedStyle(modal);
      debug("Modal visibility status:", {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
      });

      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        console.error("Modal is still not visible despite settings!");

        // Last resort - direct HTML injection
        const emergencyModal = document.createElement("div");
        emergencyModal.style.position = "fixed";
        emergencyModal.style.top = "0";
        emergencyModal.style.left = "0";
        emergencyModal.style.width = "100%";
        emergencyModal.style.height = "100%";
        emergencyModal.style.backgroundColor = "rgba(0,0,0,0.5)";
        emergencyModal.style.zIndex = "9999";
        emergencyModal.style.display = "flex";
        emergencyModal.style.justifyContent = "center";
        emergencyModal.style.alignItems = "center";

        emergencyModal.innerHTML = `
          <div style="background: white; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 20px; border-radius: 8px;">
            <h2>Booking Details: ${bookingId.replace("booking_", "")}</h2>
            ${modalBody.innerHTML}
            <div style="margin-top: 20px; text-align: right;">
              <button id="emergency-close" style="padding: 8px 16px; margin-right: 10px;">Close</button>
              <button id="emergency-edit" style="padding: 8px 16px; background: #1976d2; color: white; border: none;">Edit</button>
            </div>
          </div>
        `;

        document.body.appendChild(emergencyModal);
        document
          .getElementById("emergency-close")
          .addEventListener("click", () => {
            document.body.removeChild(emergencyModal);
          });
        document
          .getElementById("emergency-edit")
          .addEventListener("click", () => {
            window.location.href = `admin-booking-edit.html?id=${bookingId}`;
          });
      }
    }, 100);

    setLoading(false);
  } catch (error) {
    console.error("Error viewing booking details:", error);
    showMessage("Failed to load booking details", "error");
    setLoading(false);

    // Show error details in alert for debugging
    if (DEBUG) {
      alert(
        `Error viewing booking details: ${error.message}\n\nCheck console for details.`
      );
    }
  }
}

// Edit booking - redirect to edit page
function editBooking(bookingId) {
  debug(`Editing booking: ${bookingId}`);
  window.location.href = `admin-booking-edit.html?id=${bookingId}`;
}

// Confirm delete booking
function confirmDeleteBooking(bookingId) {
  debug(`Confirming delete for booking: ${bookingId}`);

  if (
    confirm(
      "Are you sure you want to delete this booking? This action cannot be undone."
    )
  ) {
    deleteBooking(bookingId);
  }
}

// Delete booking
async function deleteBooking(bookingId) {
  debug(`Deleting booking: ${bookingId}`);
  try {
    setLoading(true);

    // Get booking data first to get car_id and user_id
    const bookingDoc = await getDoc(doc(db, "bookings", bookingId));

    if (!bookingDoc.exists()) {
      showMessage("Booking not found", "error");
      setLoading(false);
      return;
    }

    const bookingData = bookingDoc.data();
    const carId = bookingData.car_id;
    const userId = bookingData.user_id;

    // Delete from main bookings collection
    await deleteDoc(doc(db, "bookings", bookingId));
    debug(`Deleted from main bookings collection: ${bookingId}`);

    // Delete from timesheet if car_id exists
    if (carId) {
      try {
        await deleteDoc(
          doc(db, "timesheets", carId.toString(), "bookings", bookingId)
        );
        debug(`Deleted from timesheet for car: ${carId}`);
      } catch (e) {
        console.error(`Error deleting from timesheet: ${e}`);
      }
    }

    // Delete from user bookings if user_id exists
    if (userId) {
      try {
        await deleteDoc(
          doc(db, "users", userId.toString(), "bookings", bookingId)
        );
        debug(`Deleted from user bookings for user: ${userId}`);
      } catch (e) {
        console.error(`Error deleting from user bookings: ${e}`);
      }
    }

    // Refresh bookings data
    await loadBookingsData();

    showMessage("Booking deleted successfully", "success");
    setLoading(false);

    // Close modal if open
    const modal = document.getElementById("booking-modal");
    if (modal && modal.style.display === "flex") {
      modal.style.display = "none";
    }
  } catch (error) {
    console.error("Error deleting booking:", error);
    showMessage("Failed to delete booking", "error");
    setLoading(false);
  }
}

// Show status update options
function showStatusUpdateOptions(bookingId, currentStatus) {
  debug(`Showing status update options for booking: ${bookingId}`);

  // Create status options dialog
  const statusOptions = ["upcoming", "active", "completed", "cancelled"];

  // Filter out current status
  const options = statusOptions.filter((status) => status !== currentStatus);

  // Create dialog
  let dialogHTML = `
    <div class="status-update-dialog">
      <h3>Update Booking Status</h3>
      <p>Current status: <span class="status-badge ${getStatusClass(
        currentStatus
      )}">${capitalizeFirst(currentStatus)}</span></p>
      <div class="status-options">
  `;

  options.forEach((status) => {
    dialogHTML += `
      <button class="status-option ${getStatusClass(
        status
      )}" data-status="${status}">
        ${capitalizeFirst(status)}
      </button>
    `;
  });

  dialogHTML += `
      </div>
      <div class="dialog-actions">
        <button class="cancel-btn">Cancel</button>
      </div>
    </div>
  `;

  // Create dialog container
  const dialogContainer = document.createElement("div");
  dialogContainer.className = "dialog-overlay";
  dialogContainer.innerHTML = dialogHTML;
  document.body.appendChild(dialogContainer);

  // Add event listeners
  const statusButtons = dialogContainer.querySelectorAll(".status-option");
  statusButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const newStatus = button.dataset.status;
      updateBookingStatus(bookingId, newStatus);
      document.body.removeChild(dialogContainer);
    });
  });

  const cancelBtn = dialogContainer.querySelector(".cancel-btn");
  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(dialogContainer);
  });
}

// Update booking status
async function updateBookingStatus(bookingId, newStatus) {
  debug(`Updating booking ${bookingId} status to ${newStatus}`);
  try {
    setLoading(true);

    // Get booking data first
    const bookingDoc = await getDoc(doc(db, "bookings", bookingId));

    if (!bookingDoc.exists()) {
      showMessage("Booking not found", "error");
      setLoading(false);
      return;
    }

    const bookingData = bookingDoc.data();
    const carId = bookingData.car_id;
    const userId = bookingData.user_id;

    // Update in main bookings collection
    await updateDoc(doc(db, "bookings", bookingId), {
      status: newStatus,
      updated_at: serverTimestamp(),
    });
    debug(`Updated status in main bookings collection: ${bookingId}`);

    // Update in timesheet if car_id exists
    if (carId) {
      try {
        await updateDoc(
          doc(db, "timesheets", carId.toString(), "bookings", bookingId),
          {
            status: newStatus,
            updated_at: serverTimestamp(),
          }
        );
        debug(`Updated status in timesheet for car: ${carId}`);
      } catch (e) {
        console.error(`Error updating timesheet: ${e}`);
      }
    }

    // Update in user bookings if user_id exists
    if (userId) {
      try {
        await updateDoc(
          doc(db, "users", userId.toString(), "bookings", bookingId),
          {
            status: newStatus,
            updated_at: serverTimestamp(),
          }
        );
        debug(`Updated status in user bookings for user: ${userId}`);
      } catch (e) {
        console.error(`Error updating user bookings: ${e}`);
      }
    }

    // Refresh bookings data
    await loadBookingsData();

    // If modal is open, refresh it
    if (document.getElementById("booking-modal").style.display === "flex") {
      await viewBookingDetails(bookingId);
    }

    showMessage(
      `Booking status updated to ${capitalizeFirst(newStatus)}`,
      "success"
    );
    setLoading(false);
  } catch (error) {
    console.error("Error updating booking status:", error);
    showMessage("Failed to update booking status", "error");
    setLoading(false);
  }
}

// Export bookings data to CSV
function exportBookingsData() {
  debug("Exporting bookings data to CSV");

  try {
    // Create header row
    let csv =
      "Booking ID,Customer,Car,Start Date,End Date,Duration,Price,Status\n";

    // Add data rows
    bookingsData.forEach((booking) => {
      const userId = booking.user_id;
      const carId = booking.car_id;

      // Get user name
      let userName = "Unknown";
      if (userId && usersData.has(userId)) {
        const userData = usersData.get(userId);
        userName =
          `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
          "Unknown";
      }

      // Get car name
      let carName = "Unknown";
      if (carId && carsData.has(carId)) {
        const carData = carsData.get(carId);
        carName = carData.displayName || carData.car_type || "Unknown";
      }

      // Format dates
      const startDate =
        booking.start_time instanceof Timestamp
          ? booking.start_time.toDate()
          : new Date(booking.start_time);

      const endDate =
        booking.end_time instanceof Timestamp
          ? booking.end_time.toDate()
          : new Date(booking.end_time);

      const formattedStartDate = startDate.toISOString();
      const formattedEndDate = endDate.toISOString();

      // Calculate duration
      const durationMs = endDate - startDate;
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      const durationText = `${hours}h ${minutes}m`;

      // Clean customer and car names for CSV
      const cleanUserName = userName.replace(/,/g, " ");
      const cleanCarName = carName.replace(/,/g, " ");

      // Add row
      csv += `${
        booking.id
      },${cleanUserName},${cleanCarName},${formattedStartDate},${formattedEndDate},${durationText},$${
        booking.total_price || 0
      },${booking.status || "unknown"}\n`;
    });

    // Create download link
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `bookings_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showMessage("Bookings data exported successfully", "success");
  } catch (error) {
    console.error("Error exporting bookings data:", error);
    showMessage("Failed to export bookings data", "error");
  }
}

// Setup modal close functionality
function setupModalClose() {
  const closeButtons = document.querySelectorAll(".close-modal");
  const modal = document.getElementById("booking-modal");

  if (!modal) {
    debug("Modal element not found");
    return;
  }

  closeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      modal.style.display = "none";
    });
  });

  // Close when clicking outside the modal content
  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });
}

// Create an error message element
function createErrorMessage(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.style.padding = "20px";
  errorDiv.style.margin = "20px";
  errorDiv.style.backgroundColor = "#ffebee";
  errorDiv.style.border = "1px solid #ef5350";
  errorDiv.style.borderRadius = "4px";
  errorDiv.style.color = "#b71c1c";
  errorDiv.style.fontSize = "16px";

  errorDiv.innerHTML = `
    <h3 style="margin-top: 0; color: #c62828;">Error</h3>
    <p>${message}</p>
  `;

  const adminContent = document.querySelector(".admin-content");
  if (adminContent) {
    adminContent.prepend(errorDiv);
  } else {
    document.body.prepend(errorDiv);
  }
}

// Show a message to the user
function showMessage(message, type = "info") {
  // Create the message element if it doesn't exist
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

  // Create message
  const messageElement = document.createElement("div");
  messageElement.className = `message ${type}`;
  messageElement.style.backgroundColor =
    type === "error" ? "#f44336" : "#4caf50";
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
    <button class="close-message" style="background: none; border: none; color: white; cursor: pointer; margin-left: 16px;">
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

// Show no bookings message
function showNoBookingsMessage() {
  debug("Showing no bookings message");

  // Hide table
  const table = document.getElementById("bookings-table");
  if (table) {
    table.style.display = "none";
  }

  // Show or create message
  let noBookingsMessage = document.getElementById("no-bookings-message");

  if (!noBookingsMessage) {
    noBookingsMessage = document.createElement("div");
    noBookingsMessage.id = "no-bookings-message";
    noBookingsMessage.className = "no-bookings-message";

    noBookingsMessage.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-calendar-x"></i>
        <h3>No Bookings Found</h3>
        <p>No bookings match your current filters.</p>
      </div>
    `;

    const tableContainer = document.querySelector(".bookings-table-container");
    if (tableContainer) {
      tableContainer.appendChild(noBookingsMessage);
    } else {
      const adminContent = document.querySelector(".admin-content");
      if (adminContent) {
        adminContent.appendChild(noBookingsMessage);
      }
    }
  }

  noBookingsMessage.style.display = "block";
}

// Hide no bookings message
function hideNoBookingsMessage() {
  debug("Hiding no bookings message");

  const noBookingsMessage = document.getElementById("no-bookings-message");
  if (noBookingsMessage) {
    noBookingsMessage.style.display = "none";
  }

  const table = document.getElementById("bookings-table");
  if (table) {
    table.style.display = "table";
  }
}

// Show load more button
function showLoadMoreButton() {
  debug("Showing load more button");

  if (loadMoreBtn) {
    loadMoreBtn.style.display = "flex";
  }
}

// Hide load more button
function hideLoadMoreButton() {
  debug("Hiding load more button");

  if (loadMoreBtn) {
    loadMoreBtn.style.display = "none";
  }
}

// Utility function to capitalize first letter
function capitalizeFirst(string) {
  if (!string) return "Unknown";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Get class for status
function getStatusClass(status) {
  if (!status) return "status-unknown";

  switch (status.toLowerCase()) {
    case "upcoming":
      return "status-upcoming";
    case "active":
      return "status-active";
    case "completed":
      return "status-completed";
    case "cancelled":
      return "status-cancelled";
    default:
      return "status-unknown";
  }
}

// Get user initials
function getUserInitials(user) {
  if (!user || (!user.firstName && !user.lastName)) {
    return "?";
  }

  const firstInitial = user.firstName ? user.firstName.charAt(0) : "";
  const lastInitial = user.lastName ? user.lastName.charAt(0) : "";

  return (firstInitial + lastInitial).toUpperCase() || "?";
}

// Add CSS animations directly
const styleElement = document.createElement("style");
styleElement.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
  
  .status-update-dialog {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    width: 90%;
    max-width: 450px;
  }
  
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
  }
  
  .status-options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
    margin: 20px 0;
  }
  
  .status-option {
    padding: 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
  }
  
  .status-option:hover {
    filter: brightness(0.9);
  }
  
  .status-option.status-upcoming {
    background-color: rgba(33, 150, 243, 0.15);
    color: #1976d2;
  }
  
  .status-option.status-active {
    background-color: rgba(76, 175, 80, 0.15);
    color: #388e3c;
  }
  
  .status-option.status-completed {
    background-color: rgba(96, 125, 139, 0.15);
    color: #455a64;
  }
  
  .status-option.status-cancelled {
    background-color: rgba(244, 67, 54, 0.15);
    color: #d32f2f;
  }
  
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }
  
  .cancel-btn {
    padding: 8px 16px;
    background: #f5f5f5;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .cancel-btn:hover {
    background: #e0e0e0;
  }
`;

document.head.appendChild(styleElement);

// Log completion of script loading
debug("Admin bookings script fully loaded");
