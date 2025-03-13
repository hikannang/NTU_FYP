// admin-cars.js - Part 1
import { db, auth } from "../common/firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global state
let currentUser = null;
let carsData = [];
let filteredCars = [];
let currentView = "grid"; // Default view
let currentFilter = "all"; // Default filter
let currentSort = "name-asc"; // Default sort

// DOM Elements
const loadingState = document.getElementById("loading-state");
const emptyState = document.getElementById("empty-state");
const gridView = document.getElementById("grid-view");
const listView = document.getElementById("list-view");
const listContent = document.getElementById("list-content");
const searchInput = document.getElementById("search-input");
const filterSelect = document.getElementById("filter-select");
const sortSelect = document.getElementById("sort-select");
const gridViewBtn = document.getElementById("grid-view-btn");
const listViewBtn = document.getElementById("list-view-btn");
const addCarBtn = document.getElementById("add-car-btn");

// Initialize the application
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Admin cars page initialized");
  
  try {
    // Load header and footer
    await loadHeaderFooter();
    
    // Add event listeners for controls
    setupEventListeners();
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Verify the user is an admin
          const userDoc = await getDoc(doc(db, "users", user.uid));
          
          if (userDoc.exists() && userDoc.data().role === "admin") {
            // Store current user
            currentUser = {
              uid: user.uid,
              ...userDoc.data()
            };
            
            console.log("Admin authenticated:", currentUser);
            
            // Load cars data
            await loadCarsData();
          } else {
            console.error("User is not an admin");
            showErrorMessage("You do not have permission to access this page");
            setTimeout(() => {
              window.location.href = "../index.html";
            }, 2000);
          }
        } catch (error) {
          console.error("Error verifying admin:", error);
          showErrorMessage("Failed to verify admin permissions: " + error.message);
        }
      } else {
        console.log("User not authenticated, redirecting to login");
        window.location.href = "../index.html";
      }
    });
    
  } catch (error) {
    console.error("Initialization error:", error);
    showErrorMessage("Failed to initialize page: " + error.message);
  }
});

// Load header and footer
async function loadHeaderFooter() {
  try {
    // Load header
    const headerResponse = await fetch("../static/headerFooter/admin-header.html");
    document.getElementById("header").innerHTML = await headerResponse.text();
    
    // Load footer
    const footerResponse = await fetch("../static/headerFooter/admin-footer.html");
    document.getElementById("footer").innerHTML = await footerResponse.text();
    
    // Setup logout button
    setTimeout(() => {
      const logoutBtn = document.getElementById("logout-button");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
          try {
            await signOut(auth);
            window.location.href = "../index.html";
          } catch (error) {
            console.error("Logout error:", error);
            alert("Failed to log out: " + error.message);
          }
        });
      }
    }, 100);
  } catch (error) {
    console.error("Error loading header/footer:", error);
    throw error;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filterAndSortCars();
    });
  }
  
  // Filter select
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      currentFilter = filterSelect.value;
      filterAndSortCars();
    });
  }
  
  // Sort select
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentSort = sortSelect.value;
      filterAndSortCars();
    });
  }
  
  // View toggle buttons
  if (gridViewBtn) {
    gridViewBtn.addEventListener("click", () => {
      setActiveView("grid");
    });
  }
  
  if (listViewBtn) {
    listViewBtn.addEventListener("click", () => {
      setActiveView("list");
    });
  }
  
  // Add car button
  if (addCarBtn) {
    addCarBtn.addEventListener("click", () => {
      window.location.href = "admin-add-car.html";
    });
  }
}

// Fetch cars data from Firestore
async function loadCarsData() {
  if (!loadingState) {
    console.error("Loading state element not found");
    return;
  }
  
  // Show loading state
  showLoading(true);
  
  try {
    console.log("Fetching cars data from Firestore");
    
    // Get cars collection reference
    const carsRef = collection(db, "cars");
    
    // Create query - can add filters and ordering here if needed
    const carsQuery = query(carsRef);
    
    // Execute query
    const querySnapshot = await getDocs(carsQuery);
    
    console.log(`Found ${querySnapshot.size} cars`);
    
    // Process query results
    carsData = [];
    
    querySnapshot.forEach((doc) => {
      const car = {
        id: doc.id,
        ...doc.data()
      };
      
      carsData.push(car);
      console.log("Loaded car:", car.id);
    });
    
    // Apply initial filtering and sorting
    filterAndSortCars();
    
    // Show the appropriate view
    setActiveView(currentView);
    
  } catch (error) {
    console.error("Error loading cars:", error);
    showErrorMessage(`Failed to load cars: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

// Filter and sort cars based on current settings
function filterAndSortCars() {
  console.log("Filtering and sorting cars");
  console.log("Current filter:", currentFilter);
  console.log("Current sort:", currentSort);
  console.log("Search query:", searchInput ? searchInput.value : "null");
  
  try {
    // Get search query
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";
    
    // Apply filters
    filteredCars = carsData.filter(car => {
      // Apply status filter
      if (currentFilter !== "all" && car.status !== currentFilter) {
        return false;
      }
      
      // Apply search query
      if (searchQuery) {
        const make = car.make || "";
        const model = car.model || "";
        const licensePlate = car.license_plate || "";
        const carType = car.car_type || "";
        const address = car.address || "";
        
        return make.toLowerCase().includes(searchQuery) ||
               model.toLowerCase().includes(searchQuery) ||
               licensePlate.toLowerCase().includes(searchQuery) ||
               carType.toLowerCase().includes(searchQuery) ||
               address.toLowerCase().includes(searchQuery);
      }
      
      return true;
    });
    
    // Apply sorting
    switch (currentSort) {
      case "name-asc":
        filteredCars.sort((a, b) => {
          const nameA = `${a.make || ""} ${a.model || ""}`;
          const nameB = `${b.make || ""} ${b.model || ""}`;
          return nameA.localeCompare(nameB);
        });
        break;
      case "name-desc":
        filteredCars.sort((a, b) => {
          const nameA = `${a.make || ""} ${a.model || ""}`;
          const nameB = `${b.make || ""} ${b.model || ""}`;
          return nameB.localeCompare(nameA);
        });
        break;
      case "status":
        filteredCars.sort((a, b) => {
          return (a.status || "").localeCompare(b.status || "");
        });
        break;
      case "date-added":
        filteredCars.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at.seconds * 1000) : new Date(0);
          const dateB = b.created_at ? new Date(b.created_at.seconds * 1000) : new Date(0);
          return dateB - dateA;
        });
        break;
    }
    
    // Update the UI
    updateCarsDisplay();
    
  } catch (error) {
    console.error("Error filtering/sorting cars:", error);
    showErrorMessage(`Failed to process cars data: ${error.message}`);
  }
}

// Show or hide loading state
function showLoading(show) {
  if (loadingState) {
    loadingState.style.display = show ? "flex" : "none";
  }
}

// Show error message
function showErrorMessage(message) {
  console.error("ERROR:", message);
  
  // Hide loading state
  showLoading(false);
  
  // Create error message container if it doesn't exist
  let errorContainer = document.getElementById("error-container");
  if (!errorContainer) {
    errorContainer = document.createElement("div");
    errorContainer.id = "error-container";
    errorContainer.className = "error-container";
    const mainElement = document.querySelector("main");
    if (mainElement) {
      mainElement.appendChild(errorContainer);
    } else {
      document.body.appendChild(errorContainer);
    }
  }
  
  // Show error message
  errorContainer.innerHTML = `
    <div class="error-message">
      <i class="bi bi-exclamation-triangle"></i>
      <p>${message}</p>
      <button onclick="window.location.reload()">Retry</button>
    </div>
  `;
  errorContainer.style.display = "block";
}

// Update the cars display based on filtered data and current view
function updateCarsDisplay() {
  console.log(`Updating display with ${filteredCars.length} cars`);
  
  // Show empty state if no cars
  if (emptyState) {
    emptyState.style.display = filteredCars.length === 0 ? "flex" : "none";
  }
  
  // Update grid view
  if (gridView) {
    // Clear existing content
    gridView.innerHTML = "";
    
    // Create car cards
    filteredCars.forEach(car => {
      const carCard = createCarCard(car);
      gridView.appendChild(carCard);
    });
  }
  
  // Update list view
  if (listContent) {
    // Clear existing content
    listContent.innerHTML = "";
    
    if (filteredCars.length > 0) {
      // Create table
      const table = document.createElement("table");
      table.className = "cars-table";
      
      // Create table header
      const thead = document.createElement("thead");
      thead.innerHTML = `
        <tr>
          <th>Image</th>
          <th>Details</th>
          <th>Status</th>
          <th>Availability</th>
          <th>Actions</th>
        </tr>
      `;
      table.appendChild(thead);
      
      // Create table body
      const tbody = document.createElement("tbody");
      
      // Add car rows
      filteredCars.forEach(car => {
        const row = createCarRow(car);
        tbody.appendChild(row);
      });
      
      table.appendChild(tbody);
      listContent.appendChild(table);
    }
  }
}

// Create a car card for grid view
function createCarCard(car) {
  // Create card container
  const card = document.createElement("div");
  card.className = "car-card";
  card.dataset.carId = car.id;
  
  // Determine car image path
  const carType = car.car_type || "car";
  const imagePath = `../static/images/car_images/${carType}.png`;
  const fallbackPath = "../static/images/assets/car-placeholder.jpg";
  
  // Create status badge based on car status
  let statusBadgeClass = "status-badge";
  let statusText = "Unknown";
  
  switch (car.status) {
    case "available":
      statusBadgeClass += " available";
      statusText = "Available";
      break;
    case "unavailable":
      statusBadgeClass += " unavailable";
      statusText = "Unavailable";
      break;
    case "maintenance":
      statusBadgeClass += " maintenance";
      statusText = "Maintenance";
      break;
    case "booked":
      statusBadgeClass += " booked";
      statusText = "Booked";
      break;
  }
  
  // Build car name
  const carName = `${car.make || ''} ${car.model || 'Car'}`.trim();
  
  // Construct card HTML
  card.innerHTML = `
    <div class="${statusBadgeClass}">${statusText}</div>
    
    <div class="car-image">
      <img src="${imagePath}" alt="${carName}" onerror="this.onerror=null; this.src='${fallbackPath}'">
    </div>
    
    <div class="car-details">
      <h3 class="car-name">${carName}</h3>
      
      <div class="car-license">${car.license_plate || 'No plate'}</div>
      
      <div class="car-specs">
        <div class="spec-item">
          <i class="bi bi-people-fill"></i>
          <span>${car.seating_capacity || '?'} seats</span>
        </div>
        <div class="spec-item">
          <i class="bi bi-fuel-pump"></i>
          <span>${car.fuel_type || 'N/A'}</span>
        </div>
      </div>
      
      <div class="car-location">
        <i class="bi bi-geo-alt"></i>
        <span>${car.address || 'No location set'}</span>
      </div>
    </div>
    
    <div class="car-actions">
      <a href="admin-edit-car.html?id=${car.id}" class="edit-btn" title="Edit Car">
        <i class="bi bi-pencil"></i> Edit
      </a>
      <button class="delete-btn" data-car-id="${car.id}" title="Delete Car">
        <i class="bi bi-trash"></i> Delete
      </button>
    </div>
  `;
  
  // Add event listener for delete button
  const deleteBtn = card.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      const carId = deleteBtn.dataset.carId;
      confirmDeleteCar(carId);
    });
  }
  
  return card;
}

// Create a car row for list view
function createCarRow(car) {
  // Create row element
  const row = document.createElement("tr");
  row.dataset.carId = car.id;
  
  // Determine car image path
  const carType = car.car_type || "car";
  const imagePath = `../static/images/car_images/${carType}.png`;
  const fallbackPath = "../static/images/assets/car-placeholder.jpg";
  
  // Create status badge HTML based on car status
  let statusBadgeClass = "status-badge";
  let statusText = "Unknown";
  
  switch (car.status) {
    case "available":
      statusBadgeClass += " available";
      statusText = "Available";
      break;
    case "unavailable":
      statusBadgeClass += " unavailable";
      statusText = "Unavailable";
      break;
    case "maintenance":
      statusBadgeClass += " maintenance";
      statusText = "Maintenance";
      break;
    case "booked":
      statusBadgeClass += " booked";
      statusText = "Booked";
      break;
  }
  
  // Format date added if available
  let dateAdded = "N/A";
  if (car.created_at && car.created_at.seconds) {
    const date = new Date(car.created_at.seconds * 1000);
    dateAdded = date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  // Construct car name
  const carName = `${car.make || ''} ${car.model || 'Car'}`.trim();
  
  // Set row HTML
  row.innerHTML = `
    <td class="car-image-cell">
      <img src="${imagePath}" alt="${carName}" onerror="this.onerror=null; this.src='${fallbackPath}'">
    </td>
    <td class="car-info-cell">
      <div class="car-name">${carName}</div>
      <div class="car-license">${car.license_plate || 'No plate'}</div>
      <div class="car-location">
        <i class="bi bi-geo-alt"></i>
        <span>${car.address || 'No location set'}</span>
      </div>
    </td>
    <td class="car-status-cell">
      <div class="${statusBadgeClass}">${statusText}</div>
      <div class="added-date">Added: ${dateAdded}</div>
    </td>
    <td class="car-specs-cell">
      <div class="spec-item">
        <i class="bi bi-people-fill"></i>
        <span>${car.seating_capacity || '?'} seats</span>
      </div>
      <div class="spec-item">
        <i class="bi bi-fuel-pump"></i>
        <span>${car.fuel_type || 'N/A'}</span>
      </div>
      <div class="spec-item">
        <i class="bi bi-speedometer2"></i>
        <span>${car.transmission || 'N/A'}</span>
      </div>
    </td>
    <td class="car-actions-cell">
      <a href="admin-edit-car.html?id=${car.id}" class="edit-btn" title="Edit Car">
        <i class="bi bi-pencil"></i> Edit
      </a>
      <button class="delete-btn" data-car-id="${car.id}" title="Delete Car">
        <i class="bi bi-trash"></i> Delete
      </button>
    </td>
  `;
  
  // Add event listener for delete button
  const deleteBtn = row.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      const carId = deleteBtn.dataset.carId;
      confirmDeleteCar(carId);
    });
  }
  
  return row;
}

// Set active view (grid or list)
function setActiveView(view) {
  // Update current view
  currentView = view;
  
  // Update view buttons
  if (gridViewBtn && listViewBtn) {
    if (view === "grid") {
      gridViewBtn.classList.add("active");
      listViewBtn.classList.remove("active");
    } else {
      gridViewBtn.classList.remove("active");
      listViewBtn.classList.add("active");
    }
  }
  
  // Show/hide appropriate view
  if (gridView && listView) {
    if (view === "grid") {
      gridView.style.display = "grid";
      listView.style.display = "none";
    } else {
      gridView.style.display = "none";
      listView.style.display = "block";
    }
  }
}

// Show confirmation dialog before deleting a car
function confirmDeleteCar(carId) {
  // Find car data
  const car = carsData.find(c => c.id === carId);
  if (!car) {
    console.error(`Car with ID ${carId} not found`);
    return;
  }
  
  // Create modal backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  document.body.appendChild(backdrop);
  
  // Create modal
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Delete Car</h3>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to delete this car?</p>
        <div class="car-summary">
          <p><strong>Make:</strong> ${car.make || 'N/A'}</p>
          <p><strong>Model:</strong> ${car.model || 'N/A'}</p>
          <p><strong>License Plate:</strong> ${car.license_plate || 'N/A'}</p>
        </div>
        <p class="warning-text">This action cannot be undone.</p>
      </div>
      <div class="modal-footer">
        <button class="cancel-btn">Cancel</button>
        <button class="confirm-delete-btn">Delete Car</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Show modal with animation
  setTimeout(() => {
    backdrop.style.opacity = "1";
    modal.style.opacity = "1";
  }, 10);
  
  // Handle close button
  const closeBtn = modal.querySelector(".close-modal");
  closeBtn.addEventListener("click", () => {
    closeModal();
  });
  
  // Handle cancel button
  const cancelBtn = modal.querySelector(".cancel-btn");
  cancelBtn.addEventListener("click", () => {
    closeModal();
  });
  
  // Handle click outside modal
  backdrop.addEventListener("click", () => {
    closeModal();
  });
  
  // Handle confirm delete button
  const confirmBtn = modal.querySelector(".confirm-delete-btn");
  confirmBtn.addEventListener("click", async () => {
    try {
      // Close modal
      closeModal();
      
      // Show loading state
      showLoading(true);
      
      // Delete car from Firestore
      await deleteDoc(doc(db, "cars", carId));
      
      console.log(`Car ${carId} deleted successfully`);
      
      // Remove car from local data
      carsData = carsData.filter(c => c.id !== carId);
      
      // Update display
      filterAndSortCars();
      
      // Show success message
      showToast("Car deleted successfully");
    } catch (error) {
      console.error(`Error deleting car ${carId}:`, error);
      showErrorMessage(`Failed to delete car: ${error.message}`);
    } finally {
      showLoading(false);
    }
  });
  
  // Function to close modal
  function closeModal() {
    backdrop.style.opacity = "0";
    modal.style.opacity = "0";
    
    setTimeout(() => {
      backdrop.remove();
      modal.remove();
    }, 300);
  }
}

// Show toast notification
function showToast(message, type = "success") {
  // Create toast if it doesn't exist
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  
  // Set toast content and type
  toast.textContent = message;
  toast.className = `toast ${type}`;
  
  // Show toast
  toast.style.display = "block";
  
  // Animate toast
  setTimeout(() => {
    toast.classList.add("show");
    
    // Hide toast after delay
    setTimeout(() => {
      toast.classList.remove("show");
      
      setTimeout(() => {
        toast.style.display = "none";
      }, 300);
    }, 3000);
  }, 10);
}

// Export functions for external use
export {
  loadCarsData,
  filterAndSortCars,
  setActiveView
};