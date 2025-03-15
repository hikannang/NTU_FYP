import { db, auth } from "../common/firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let currentUser = null;
let allUsers = [];
let lastVisibleUser = null;
let searchTerm = "";
let currentSort = { field: "createdAt", direction: "desc" };
let isLoading = false;
const USERS_PER_PAGE = 10;

// DOM Elements
const loadingOverlay = document.getElementById("loading-overlay");
const usersTableBody = document.getElementById("users-table-body");
const userSearchInput = document.getElementById("user-search");
const sortButtons = document.querySelectorAll(".sort-btn");
const loadMoreBtn = document.getElementById("load-more-btn");
const userStatsTotal = document.getElementById("user-stats-total");
const tableWrapper = document.getElementById("table-wrapper");
const noResultsMessage = document.getElementById("no-results-message");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("User Management page loading");

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

            // Initialize page
            initPage();
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

// Initialize page
async function initPage() {
  showLoading(true);

  try {
    await Promise.all([loadInitialUsers(), loadUserStatistics()]);

    showLoading(false);
  } catch (error) {
    console.error("Error initializing page:", error);
    showError(`Failed to load users: ${error.message}`);
  }
}

// Set up event listeners
function setupEventListeners() {
  // Search input
  if (userSearchInput) {
    userSearchInput.addEventListener(
      "input",
      debounce(handleSearchChange, 400)
    );
  }

  // Sort buttons
  sortButtons.forEach((button) => {
    button.addEventListener("click", () => handleSort(button.dataset.field));
  });

  // Load more button
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", loadMoreUsers);
  }
}

// Load initial users
async function loadInitialUsers() {
  try {
    console.log("Loading initial users");

    // Reset pagination
    lastVisibleUser = null;
    allUsers = [];

    // Build query based on current sort
    const usersQuery = buildUsersQuery();

    // Get users
    const usersSnapshot = await usersQuery;

    console.log(`Fetched ${usersSnapshot.size} users`);

    // Process results
    processUserResults(usersSnapshot);

    // Update UI
    renderUsers();

    return true;
  } catch (error) {
    console.error("Error loading users:", error);
    showMessage(`Failed to load users: ${error.message}`, "error");
    return false;
  }
}

// Load more users (pagination)
async function loadMoreUsers() {
  if (isLoading || !lastVisibleUser) return;

  try {
    isLoading = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.innerHTML = '<div class="spinner-sm"></div> Loading...';

    // Build query with startAfter for pagination
    const usersQuery = buildUsersQuery(true);

    // Get next batch of users
    const usersSnapshot = await usersQuery;

    // Process results
    processUserResults(usersSnapshot);

    // Update UI
    renderUsers();

    isLoading = false;
    loadMoreBtn.disabled = false;
    loadMoreBtn.innerHTML = "Load More";

    // Hide load more button if no more results
    if (usersSnapshot.empty || usersSnapshot.docs.length < USERS_PER_PAGE) {
      loadMoreBtn.style.display = "none";
    }
  } catch (error) {
    console.error("Error loading more users:", error);
    showMessage("Failed to load more users", "error");

    isLoading = false;
    loadMoreBtn.disabled = false;
    loadMoreBtn.innerHTML = "Load More";
  }
}

// Build Firestore query based on current sort
function buildUsersQuery(paginate = false) {
  // Start with base query
  let userQuery = collection(db, "users");
  const constraints = [];

  // Apply ordering - fixed property name to match database field
  constraints.push(orderBy(currentSort.field, currentSort.direction));

  // Apply pagination if needed
  if (paginate && lastVisibleUser) {
    constraints.push(startAfter(lastVisibleUser));
  }

  // Apply limit
  constraints.push(limit(USERS_PER_PAGE));

  // Debug log the query being built
  console.log(
    `Building query: sort by ${currentSort.field} ${currentSort.direction}, paginate: ${paginate}`
  );

  // Execute query with all constraints
  return getDocs(query(userQuery, ...constraints));
}

// Process user results from Firestore
function processUserResults(snapshot) {
  if (snapshot.empty && allUsers.length === 0) {
    // No results at all
    console.log("No users found in query results");
    showNoResults(true);
    tableWrapper.style.display = "none";
    loadMoreBtn.style.display = "none";
    return;
  }

  showNoResults(false);
  tableWrapper.style.display = "block";

  // Get the last visible document for pagination
  if (!snapshot.empty) {
    lastVisibleUser = snapshot.docs[snapshot.docs.length - 1];

    // Process users
    const newUsers = snapshot.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
      };
    });

    console.log(`Processed ${newUsers.length} user records`);

    // Apply client-side search filtering if needed
    const filteredUsers = filterUsersBySearch(newUsers, searchTerm);

    // Add to all users array
    allUsers = [...allUsers, ...filteredUsers];

    // Show or hide load more button
    if (snapshot.docs.length < USERS_PER_PAGE) {
      loadMoreBtn.style.display = "none";
    } else {
      loadMoreBtn.style.display = "block";
    }
  } else {
    // No more results
    loadMoreBtn.style.display = "none";
  }
}

// Filter users by search term (client-side)
function filterUsersBySearch(users, searchTerm) {
  if (!searchTerm) return users;

  const search = searchTerm.toLowerCase();

  return users.filter((user) => {
    const email = (user.email || "").toLowerCase();
    const firstName = (user.firstName || "").toLowerCase(); // CHANGED: firstname → firstName
    const lastName = (user.lastName || "").toLowerCase(); // CHANGED: lastname → lastName
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    const phone = (user.phone || "").toLowerCase();

    return (
      email.includes(search) ||
      firstName.includes(search) ||
      lastName.includes(search) ||
      fullName.includes(search) ||
      phone.includes(search)
    );
  });
}

// Load user statistics
async function loadUserStatistics() {
  try {
    // Total users count
    const totalSnapshot = await getDocs(collection(db, "users"));
    const totalUsers = totalSnapshot.size;

    // Update UI
    if (userStatsTotal) {
      userStatsTotal.textContent = totalUsers;
    }

    return { total: totalUsers };
  } catch (error) {
    console.error("Error loading user statistics:", error);
    return null;
  }
}

// Render users table
function renderUsers() {
  if (!usersTableBody) return;

  // Clear table first if reloading from scratch
  if (lastVisibleUser === null || allUsers.length <= USERS_PER_PAGE) {
    usersTableBody.innerHTML = "";
  }

  // Generate rows for users
  allUsers.slice(usersTableBody.children.length).forEach((user, index) => {
    const row = document.createElement("tr");

    // Format timestamps
    const createdAt =
      user.createdAt instanceof Timestamp
        ? formatDate(user.createdAt.toDate())
        : "N/A";

    // Format names properly with fallbacks
    const firstName = user.firstName || ""; // CHANGED: firstname → firstName
    const lastName = user.lastName || ""; // CHANGED: lastname → lastName
    const fullName =
      firstName || lastName ? `${firstName} ${lastName}`.trim() : "No name";

    // Generate row HTML
    row.innerHTML = `
        <td>
          <div class="user-info">
            <div class="user-avatar">${getInitials(firstName, lastName)}</div>
            <div class="user-details">
              <div class="user-name">${fullName}</div>
              <div class="user-email">${user.email || "No email"}</div>
            </div>
          </div>
        </td>
        <td>${formatPhone(user.phone) || "Not provided"}</td>
        <td>${user.role || "user"}</td>
        <td>${createdAt}</td>
        <td class="actions-cell">
          <div class="actions-wrapper">
            <button class="icon-btn view-btn" title="View User Details" data-user-id="${
              user.id
            }">
              <i class="bi bi-eye"></i>
            </button>
          </div>
        </td>
      `;

    // Add event listener for view button
    const viewBtn = row.querySelector(".view-btn");
    if (viewBtn) {
      viewBtn.addEventListener("click", () => viewUser(user.id));
    }

    usersTableBody.appendChild(row);
  });

  // Show no results message if needed
  if (allUsers.length === 0) {
    showNoResults(true);
  } else {
    showNoResults(false);
  }
}

// Handle search input change
function handleSearchChange(e) {
  const newSearchTerm = e.target.value.trim();
  
  // Update search term
  searchTerm = newSearchTerm;
  
  // Apply client-side filtering to all loaded users
  const filteredUsers = [];
  
  // If there's a search term, we need to apply filtering
  if (searchTerm) {
    // Get all loaded users and filter them
    const loadedUsers = [...allUsers]; // Copy the array to avoid modifying the original
    
    // Apply the search filter
    const filtered = filterUsersBySearch(loadedUsers, searchTerm);
    filteredUsers.push(...filtered);
    
    console.log(`Search filtering: ${filteredUsers.length} users match "${searchTerm}"`);
    
    if (filteredUsers.length === 0) {
      showNoResults(true, `No users found matching "${searchTerm}"`);
      tableWrapper.style.display = "none";
      loadMoreBtn.style.display = "none";
    } else {
      showNoResults(false);
      tableWrapper.style.display = "block";
      
      // Re-render the table with filtered users
      usersTableBody.innerHTML = '';
      allUsers = filteredUsers;
      renderUsers();
      
      // Hide load more button during search
      loadMoreBtn.style.display = "none";
    }
  } else {
    // If search is cleared, reload initial users
    loadInitialUsers();
  }
}

// Handle sort toggle
function handleSort(field) {
  // Map the field to match database structure if needed
  const fieldMapping = {
    name: "firstName",
    email: "email",
    phone: "phone",
    role: "role",
    created: "createdAt"
  };
  
  const mappedField = fieldMapping[field] || field;
  
  // Toggle direction if same field clicked again
  if (currentSort.field === mappedField) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    // Set new field and default to ascending
    currentSort.field = mappedField;
    currentSort.direction = 'asc';
  }
  
  console.log(`Sorting by ${currentSort.field} ${currentSort.direction}`);
  
  // Update sort button UI
  updateSortButtonsUI();
  
  // Reload users with new sort
  loadInitialUsers();
}

// Update sort buttons UI to reflect current sort state
function updateSortButtonsUI() {
  sortButtons.forEach(button => {
    // Remove all sort classes
    button.classList.remove('sort-asc', 'sort-desc');
    
    // Map button field to actual field being used
    const fieldMapping = {
      name: "firstName",
      email: "email",
      phone: "phone",
      role: "role",
      created: "createdAt"
    };
    
    const buttonField = button.dataset.field;
    const mappedField = fieldMapping[buttonField] || buttonField;
    
    // Add appropriate class if this is the current sort field
    if (mappedField === currentSort.field) {
      button.classList.add(`sort-${currentSort.direction}`);
      
      // Update icon
      const iconElement = button.querySelector('i');
      if (iconElement) {
        iconElement.className = `bi bi-sort-${currentSort.direction === 'asc' ? 'down' : 'up'}`;
      }
    }
  });
}

// View user details
function viewUser(userId) {
  // Navigate to user detail page
  window.location.href = `admin-user-detail.html?id=${userId}`;
}

// Show no results message
function showNoResults(show, message = "No users found matching your criteria") {
  if (!noResultsMessage) return;
  
  noResultsMessage.style.display = show ? "flex" : "none";
  noResultsMessage.querySelector('p').textContent = message;
}

// UI Helper Functions
function showLoading(show) {
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? "flex" : "none";
  }
}

function showError(message) {
  // Create error container if it doesn't exist
  let errorContainer = document.getElementById("error-container");
  if (!errorContainer) {
    errorContainer = document.createElement("div");
    errorContainer.id = "error-container";
    errorContainer.className = "error-container";
    
    // Insert at top of main content
    const main = document.querySelector("main");
    if (main && main.firstChild) {
      main.insertBefore(errorContainer, main.firstChild);
    } else {
      document.body.appendChild(errorContainer);
    }
  }
  
  errorContainer.textContent = message;
  errorContainer.style.display = "block";
  
  showLoading(false);
}

function showMessage(message, type = "info") {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }
  
  // Create toast message
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  // Set toast icon based on type
  let icon = "info-circle";
  if (type === "success") icon = "check-circle";
  if (type === "warning") icon = "exclamation-triangle";
  if (type === "error") icon = "x-circle";
  
  toast.innerHTML = `
    <i class="bi bi-${icon}"></i>
    <span>${message}</span>
  `;
  
  // Add toast to container
  toastContainer.appendChild(toast);
  
  // Show toast with animation
  setTimeout(() => {
    toast.classList.add("show");
    
    // Auto-hide after delay
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }, 10);
}

// Utility Functions
// Format date
function formatDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date)) return 'N/A';
  
  try {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric'
    });
  } catch (e) {
    console.error("Date formatting error:", e);
    return 'Invalid Date';
  }
}

// Format phone number
function formatPhone(phone) {
  if (!phone) return '';
  
  // Remove non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Format based on digit count
  if (digits.length === 8) {
    // Singapore format
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  } else if (digits.length === 10) {
    // US format
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    // US with country code
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  
  // Return original if we can't format
  return phone;
}

// Get user initials for avatar
function getInitials(firstName, lastName) {
  const first = (firstName || '').charAt(0).toUpperCase();
  const last = (lastName || '').charAt(0).toUpperCase();
  
  if (first && last) {
    return `${first}${last}`;
  } else if (first) {
    return first;
  } else if (last) {
    return last;
  }
  
  return '?';
}

// Debounce function for search input
function debounce(func, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  }
}

// User Detail Page Script
// These functions will only run on the user detail page
if (window.location.pathname.includes('admin-user-detail.html')) {
  document.addEventListener('DOMContentLoaded', () => {
    // Get user ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('id');
    
    if (userId) {
      loadUserDetail(userId);
    } else {
      showError("No user ID provided");
    }
  });
  
  async function loadUserDetail(userId) {
    try {
      showLoading(true);
      
      // Get user document
      const userDoc = await getDoc(doc(db, "users", userId));
      
      if (!userDoc.exists()) {
        showError("User not found");
        showLoading(false);
        return;
      }
      
      // Get user data and include the ID
      const userData = {
        id: userId,
        ...userDoc.data()
      };
      
      // Update page title with user name
      const firstName = userData.firstName || '';
      const lastName = userData.lastName || '';
      const userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : "User";
      
      const pageTitleElement = document.getElementById('user-detail-title');
      if (pageTitleElement) {
        pageTitleElement.innerHTML = `<i class="bi bi-person"></i> ${userName}`;
      }
      
      document.title = `${userName} | User Details`;
      
      // Load user bookings
      const bookings = await loadUserBookings(userId);
      
      // Update UI with user data
      updateUserDetailUI(userData, bookings);
      
      showLoading(false);
    } catch (error) {
      console.error("Error loading user detail:", error);
      showError(`Failed to load user details: ${error.message}`);
      showLoading(false);
    }
  }
  
  async function loadUserBookings(userId) {
    try {
      // Create query to get user's bookings
      let bookingsQuery;
      
      // Check how the booking is stored
      // Some systems use userID and some use userId, so try both
      try {
        // First try with userId (camelCase)
        bookingsQuery = query(
          collection(db, "bookings"),
          where("userId", "==", userId),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        
        const testSnapshot = await getDocs(bookingsQuery);
        
        // If no results, try with userID (camelCase + uppercase)
        if (testSnapshot.empty) {
          bookingsQuery = query(
            collection(db, "bookings"),
            where("userID", "==", userId),
            orderBy("createdAt", "desc"),
            limit(10)
          );
        }
      } catch (e) {
        // If first query fails, try the alternate form
        bookingsQuery = query(
          collection(db, "bookings"),
          where("userID", "==", userId),
          orderBy("createdAt", "desc"),
          limit(10)
        );
      }
      
      const bookingsSnapshot = await getDocs(bookingsQuery);
      
      return bookingsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Error loading user bookings:", error);
      return [];
    }
  }
  
  function updateUserDetailUI(userData, bookings) {
    try {
      // Get all needed DOM elements
      const userAvatar = document.getElementById('user-avatar');
      const userFirstname = document.getElementById('user-firstname');
      const userLastname = document.getElementById('user-lastname');
      const userEmail = document.getElementById('user-email');
      const userPhone = document.getElementById('user-phone');
      const userRole = document.getElementById('user-role');
      const userId = document.getElementById('user-id');
      const userCreated = document.getElementById('user-created');
      const userLastLogin = document.getElementById('user-last-login');
      const bookingsContainer = document.getElementById('bookings-container');
      const noBookingsMsg = document.getElementById('no-bookings');
      
      console.log("Updating UI with user data:", userData);
      
      // Set user info
      if (userAvatar) {
        userAvatar.textContent = getInitials(userData.firstName, userData.lastName);
      }
      
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
      }
      
      if (userId) {
        userId.textContent = userData.id || '---';
      }
      
      // Format dates
      if (userCreated) {
        const createdAt = userData.createdAt instanceof Timestamp ? 
          formatDate(userData.createdAt.toDate()) : 
          'Not available';
        userCreated.textContent = createdAt;
      }
      
      if (userLastLogin) {
        const lastLogin = userData.lastLogin instanceof Timestamp ? 
          formatDate(userData.lastLogin.toDate()) : 
          'Never';
        userLastLogin.textContent = lastLogin;
      }
      
      // Handle bookings
      console.log(`Found ${bookings.length} bookings for user`);
      
      if (bookings && bookings.length > 0) {
        if (bookingsContainer) {
          bookingsContainer.innerHTML = '';
          
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
  
  // Helper function to create booking elements
  function createBookingElement(booking) {
    const elem = document.createElement('div');
    elem.className = 'booking-item';
    
    // Format dates
    const startDate = booking.startDate instanceof Timestamp ? 
      formatDate(booking.startDate.toDate()) : 
      'Not specified';
    
    const endDate = booking.endDate instanceof Timestamp ? 
      formatDate(booking.endDate.toDate()) : 
      'Not specified';
    
    const createdAt = booking.createdAt instanceof Timestamp ? 
      formatDate(booking.createdAt.toDate()) : 
      'Not specified';
    
    // Determine status class
    let statusClass = 'pending';
    if (booking.status === 'confirmed') statusClass = 'confirmed';
    if (booking.status === 'cancelled') statusClass = 'cancelled';
    
    // Get shortened booking ID
    const shortId = booking.id ? booking.id.substring(0, 8) + '...' : 'Unknown';
    
    // Format price
    const price = parseFloat(booking.totalPrice || 0).toFixed(2);
    
    elem.innerHTML = `
      <div class="booking-header">
        <div class="booking-title">
          <i class="bi bi-calendar-check"></i>
          Booking #${shortId}
        </div>
        <div class="booking-status ${statusClass}">
          ${booking.status || 'Pending'}
        </div>
      </div>
      <div class="booking-details">
        <div class="booking-info-row">
          <div class="booking-info-item">
            <span class="info-label">Car:</span>
            <span class="info-value">${booking.carType || 'Not specified'}</span>
          </div>
          <div class="booking-info-item">
            <span class="info-label">Price:</span>
            <span class="info-value">$${price}</span>
          </div>
        </div>
        <div class="booking-info-row">
          <div class="booking-info-item">
            <span class="info-label">From:</span>
            <span class="info-value">${startDate}</span>
          </div>
          <div class="booking-info-item">
            <span class="info-label">To:</span>
            <span class="info-value">${endDate}</span>
          </div>
        </div>
        <div class="booking-created">
          Booked on ${createdAt}
        </div>
      </div>
    `;
    
    return elem;
  }
}

// Check if we're on the main users list page
if (!window.location.pathname.includes('admin-user-detail.html')) {
  // Update sort buttons UI on page load
  document.addEventListener('DOMContentLoaded', updateSortButtonsUI);
}