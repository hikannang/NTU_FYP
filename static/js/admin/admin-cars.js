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
  orderBy,
  Timestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let currentUser = null;
let allCars = [];
let filteredCars = [];
let currentView = localStorage.getItem("carViewPreference") || "grid";
let currentFilter = "all";
let currentSort = "name-asc";
let searchQuery = "";
let carModels = {};

// DOM Elements
const loadingState = document.getElementById("loading-state");
const emptyState = document.getElementById("empty-state");
const gridView = document.getElementById("grid-view");
const listView = document.getElementById("list-view");
const searchInput = document.getElementById("search-input");
const filterSelect = document.getElementById("filter-select");
const sortSelect = document.getElementById("sort-select");
const gridViewBtn = document.getElementById("grid-view-btn");
const listViewBtn = document.getElementById("list-view-btn");
const addCarBtn = document.getElementById("add-car-btn");
const statsCardsContainer = document.getElementById("car-stats");

// Initialize the application
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Admin cars page initializing");

  try {
    // First load header and footer
    await Promise.all([
      fetch("../static/headerFooter/admin-header.html")
        .then((response) => response.text())
        .then((html) => {
          document.getElementById("header").innerHTML = html;
        }),
      fetch("../static/headerFooter/admin-footer.html")
        .then((response) => response.text())
        .then((html) => {
          document.getElementById("footer").innerHTML = html;
        }),
    ]);

    console.log("Header and footer loaded");

    // Set active sidebar item
    setActiveSidebarItem("admin-cars.html");

    // Set active sidebar item
    setActiveSidebarItem("admin-cars.html");

    // Setup event listeners for controls
    setupEventListeners();

    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Check if user is admin
          const userDoc = await getDoc(doc(db, "users", user.uid));

          if (userDoc.exists() && userDoc.data().role === "admin") {
            currentUser = {
              uid: user.uid,
              ...userDoc.data(),
            };

            console.log("Admin authenticated:", currentUser.email);

            // Update welcome message
            const welcomeMsg = document.getElementById("welcome-message");
            if (welcomeMsg) {
              welcomeMsg.textContent = currentUser.firstName || "Admin";
            }

            // Load car data
            await loadCarsData();
          } else {
            console.error("User is not an admin");
            showErrorMessage("You do not have permission to access this page");
            setTimeout(() => {
              window.location.href = "../index.html";
            }, 2000);
          }
        } catch (error) {
          console.error("Error checking admin status:", error);
          showErrorMessage(
            "Failed to verify admin permissions: " + error.message
          );
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

// Set active sidebar menu item
function setActiveSidebarItem(page) {
  document.querySelectorAll(".menu-item").forEach((item) => {
    item.classList.remove("active");
    if (item.getAttribute("href") === page) {
      item.classList.add("active");
    }
  });
}

// Setup event listeners
function setupEventListeners() {
  // Search input
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
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
      window.location.href = "admin-addCars.html";
    });
  }

    // Add at the end of your setupEventListeners function
  const emptyAddCarBtn = document.getElementById("empty-add-car-btn");
  if (emptyAddCarBtn) {
    emptyAddCarBtn.addEventListener("click", () => {
      window.location.href = "admin-addCars.html";
    });
  }
}

// Add this function to fetch car models
async function loadCarModels() {
  try {
    console.log("Loading car models data");
    
    const carModelsSnapshot = await getDocs(collection(db, "car_models"));
    
    if (!carModelsSnapshot.empty) {
      carModelsSnapshot.forEach(doc => {
        // Store models with model_name as the key
        carModels[doc.id] = doc.data();
        console.log(`Loaded car model: ${doc.id} (${doc.data().name})`);
      });
    }
    
    console.log(`Loaded ${Object.keys(carModels).length} car models`);
  } catch (error) {
    console.error("Error loading car models:", error);
  }
}

// Load cars data from Firestore
async function loadCarsData() {
  try {
    showLoading(true);
    console.log("Loading cars data from Firestore");

    await loadCarModels();

    // Get all cars
    const carsQuery = query(collection(db, "cars"));
    const carSnapshot = await getDocs(carsQuery);

    if (carSnapshot.empty) {
      console.log("No cars found in database");
      showEmptyState(true);
      updateStatCards(0, 0, 0, 0);
      return;
    }

    // Process cars
    allCars = [];
    let availableCars = 0;
    let maintenanceCars = 0;
    let unavailableCars = 0;
    let bookedCars = 0;

    carSnapshot.forEach((doc) => {
      const car = {
        id: doc.id,
        ...doc.data(),
      };

      // Add to the appropriate count
      switch (car.status) {
        case "available":
          availableCars++;
          break;
        case "maintenance":
          maintenanceCars++;
          break;
        case "unavailable":
          unavailableCars++;
          break;
        case "booked":
          bookedCars++;
          break;
      }

      allCars.push(car);
    });

    console.log(`Loaded ${allCars.length} cars`);

    // Update stat cards
    updateStatCards(
      availableCars,
      bookedCars,
      maintenanceCars,
      unavailableCars
    );

    // Apply filters and sorting
    filterAndSortCars();

    // Set initial view
    setActiveView(currentView);
  } catch (error) {
    console.error("Error loading cars data:", error);
    showErrorMessage(`Failed to load cars: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

// Enhanced getCarDisplayName function to handle both string and reference car_type
function getCarDisplayName(car) {
  // Default fallback
  let displayName = "Unknown Car";
  
  try {
    if (car.car_type) {
      // car_type might be either the model ID or a direct string
      const modelId = car.car_type;
      
      // Check if we have this model in our loaded models
      const modelData = carModels[modelId];
      
      if (modelData && modelData.name) {
        // Use the proper name from car_models collection
        displayName = modelData.name;
        
        // Add color if available in car
        if (car.car_color) {
          displayName += ` (${car.car_color})`;
        }
        // If no car_color but model has color
        else if (modelData.color) {
          displayName += ` (${modelData.color})`;
        }
      } else {  
        // Fallback: Format car_type as a readable string
        displayName = modelId
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }
    
    // Add make if available and not already part of the name
    if (car.make && !displayName.toLowerCase().includes(car.make.toLowerCase())) {
      displayName = `${car.make} ${displayName}`;
    }
    
    return displayName;
  } catch (error) {
    console.error("Error formatting car name:", error);
    return car.car_type || "Unknown Car";
  }
}

// Update statistics cards
function updateStatCards(available, booked, maintenance, unavailable) {
  const total = available + booked + maintenance + unavailable;

  // Update stats in the UI
  const availableStat = document.getElementById("available-cars");
  const bookedStat = document.getElementById("booked-cars");
  const maintenanceStat = document.getElementById("maintenance-cars");
  const totalStat = document.getElementById("total-cars");

  if (availableStat) availableStat.textContent = available;
  if (bookedStat) bookedStat.textContent = booked;
  if (maintenanceStat) maintenanceStat.textContent = maintenance;
  if (totalStat) totalStat.textContent = total;
}

// Filter and sort cars
function filterAndSortCars() {
  console.log("Filtering and sorting cars");
  console.log(
    `Filter: ${currentFilter}, Sort: ${currentSort}, Search: ${searchQuery}`
  );

  try {
    // Apply filters
    filteredCars = allCars.filter((car) => {
      // Status filter
      if (currentFilter !== "all" && car.status !== currentFilter) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const make = (car.make || "").toLowerCase();
        const model = (car.model || "").toLowerCase();
        const licensePlate = (car.license_plate || "").toLowerCase();
        const carType = (car.car_type || "").toLowerCase();
        const address = (car.address || "").toLowerCase();

        const searchTerms = searchQuery.toLowerCase().split(" ");

        // Check if all search terms match at least one field
        return searchTerms.every((term) => {
          return (
            make.includes(term) ||
            model.includes(term) ||
            licensePlate.includes(term) ||
            carType.includes(term) ||
            address.includes(term)
          );
        });
      }

      return true;
    });

    // Apply sorting
    sortCars();

    // Update the UI
    updateCarsDisplay();
  } catch (error) {
    console.error("Error filtering/sorting cars:", error);
    showErrorMessage(`Failed to process cars data: ${error.message}`);
  }
}

// Sort cars based on current sort selection
function sortCars() {
  switch (currentSort) {
    case "name-asc":
      filteredCars.sort((a, b) => {
        const nameA = `${a.make || ""} ${a.model || ""}`.trim().toLowerCase();
        const nameB = `${b.make || ""} ${b.model || ""}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
      break;

    case "name-desc":
      filteredCars.sort((a, b) => {
        const nameA = `${a.make || ""} ${a.model || ""}`.trim().toLowerCase();
        const nameB = `${b.make || ""} ${b.model || ""}`.trim().toLowerCase();
        return nameB.localeCompare(nameA);
      });
      break;

    case "status":
      filteredCars.sort((a, b) => {
        const statusPriority = {
          available: 1,
          booked: 2,
          maintenance: 3,
          unavailable: 4,
        };
        const priorityA = statusPriority[a.status] || 9999;
        const priorityB = statusPriority[b.status] || 9999;
        return priorityA - priorityB;
      });
      break;

    case "licensePlate":
      filteredCars.sort((a, b) => {
        const plateA = (a.license_plate || "").toLowerCase();
        const plateB = (b.license_plate || "").toLowerCase();
        return plateA.localeCompare(plateB);
      });
      break;
  }
}

// Update the cars display based on filtered data
function updateCarsDisplay() {
  console.log(`Displaying ${filteredCars.length} cars`);

  // Show empty state if no cars after filtering
  if (filteredCars.length === 0) {
    showEmptyState(true);
  } else {
    showEmptyState(false);
  }

  // Update grid view
  if (gridView) {
    gridView.innerHTML = "";
    filteredCars.forEach((car) => {
      const carCard = createCarCard(car);
      gridView.appendChild(carCard);
    });
  }

  // Update list view
  if (listView) {
    listView.innerHTML = "";

    // Create list header
    const listHeader = document.createElement("div");
    listHeader.className = "list-header";
    listHeader.innerHTML = `
      <div class="list-col col-image">Image</div>
      <div class="list-col col-main">Car Details</div>
      <div class="list-col col-status">Status</div>
      <div class="list-col col-specs">Specifications</div>
      <div class="list-col col-actions">Actions</div>
    `;
    listView.appendChild(listHeader);

    // Create list content container
    const listContent = document.createElement("div");
    listContent.id = "list-content";

    // Add car rows
    filteredCars.forEach((car) => {
      const carRow = createCarRow(car);
      listContent.appendChild(carRow);
    });

    listView.appendChild(listContent);
  }
}

// Create a car card for grid view
function createCarCard(car) {
  // Create card element
  const card = document.createElement("div");
  card.className = "car-card";
  card.dataset.carId = car.id;

  // Get car image path
  const carType = car.car_type || "car";
  const imagePath = `../static/images/car_images/${carType}.png`;
  const fallbackPath = "../static/images/assets/car-placeholder.jpg";

  // Get license plate or default
  const licensePlate = car.license_plate || "No Plate";

  const carName = getCarDisplayName(car);

  // Get status class
  let statusClass = car.status || "unknown";

  // Convert insurance expiry date if available
  let insuranceExpiry = "Not set";
  if (car.insurance_expiry) {
    insuranceExpiry = formatDate(car.insurance_expiry);
  }

  // Build card HTML - With updated structure
  card.innerHTML = `
    <div class="card-header">
      <div class="car-plate">${licensePlate}</div>
      <div class="car-id">ID: ${car.id}</div>
    </div>
    
    <div class="car-image">
      <img src="${imagePath}" alt="${carName}" onerror="this.onerror=null; this.src='${fallbackPath}'">
    </div>
    
    <div class="car-details">
      <div class="car-name-status">
        <h3 class="car-model">${carName}</h3>
        <span class="status-badge ${statusClass}">${capitalizeFirstLetter(
    car.status || "unknown"
  )}</span>
      </div>
      
      <div class="car-specs">
        <div class="spec-item">
          <div class="spec-icon"><i class="bi bi-people-fill"></i></div>
          <div>
            <span class="spec-value">${car.seating_capacity || "?"}</span>
            <span class="spec-label">Seats</span>
          </div>
        </div>
        
        <div class="spec-item">
          <div class="spec-icon"><i class="bi bi-fuel-pump"></i></div>
          <div>
            <span class="spec-value">${car.fuel_type || "N/A"}</span>
            <span class="spec-label">Fuel</span>
          </div>
        </div>
        
        <div class="spec-item">
          <div class="spec-icon"><i class="bi bi-shield-check"></i></div>
          <div>
            <span class="spec-value">${insuranceExpiry}</span>
            <span class="spec-label">Insurance</span>
          </div>
        </div>
        
        <div class="spec-item">
          <div class="spec-icon"><i class="bi bi-calendar-check"></i></div>
          <div>
            <span class="spec-value">${formatDate(car.service_due)}</span>
            <span class="spec-label">Service Due</span>
          </div>
        </div>
      </div>
      
      <div class="car-location">
        <i class="location-icon bi bi-geo-alt"></i>
        <span class="location-text">${car.address || "No location set"}</span>
      </div>
    </div>
    
    <div class="car-actions">
      <a href="admin-editCar.html?id=${car.id}" class="edit-btn">
        <i class="bi bi-pencil"></i> Edit
      </a>
      <button class="delete-btn" data-car-id="${car.id}">
        <i class="bi bi-trash"></i> Delete
      </button>
    </div>
  `;

  // Add event listener for delete button
  const deleteBtn = card.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      confirmDeleteCar(car.id);
    });
  }

  return card;
}

// Create a car row for list view
function createCarRow(car) {
  const row = document.createElement("div");
  row.className = "car-row";
  row.dataset.carId = car.id;

  // Get car image path
  const carType = car.car_type || "car";
  const imagePath = `../static/images/car_images/${carType}.png`;
  const fallbackPath = "../static/images/assets/car-placeholder.jpg";

  // Get license plate or default
  const licensePlate = car.license_plate || "No Plate";

  const carName = getCarDisplayName(car);

  // Format date added if available
  let dateAdded = "N/A";
  if (car.created_at) {
    dateAdded = formatDate(car.created_at);
  }

  // Build row HTML
  row.innerHTML = `
    <div class="list-col col-image">
      <img src="${imagePath}" alt="${carName}" onerror="this.onerror=null; this.src='${fallbackPath}'">
    </div>
    
    <div class="list-col col-main">
      <div class="car-plate">${licensePlate}</div>
      <div class="car-model">${carName}</div>
      <div class="car-id">ID: ${car.id}</div>
      <div class="car-location"><i class="bi bi-geo-alt"></i> ${
        car.address || "No location"
      }</div>
    </div>
    
    <div class="list-col col-status">
      <div class="status-badge ${
        car.status || "unknown"
      }">${capitalizeFirstLetter(car.status || "unknown")}</div>
      <div class="added-date">Added: ${dateAdded}</div>
    </div>
    
    <div class="list-col col-specs">
      <div class="spec-row">
        <div class="spec-icon"><i class="bi bi-people-fill"></i></div>
        <span>${car.seating_capacity || "?"} seats</span>
      </div>
      
      <div class="spec-row">
        <div class="spec-icon"><i class="bi bi-fuel-pump"></i></div>
        <span>${car.fuel_type || "N/A"}</span>
      </div>
      
      <div class="spec-row">
        <div class="spec-icon"><i class="bi bi-shield-check"></i></div>
        <span>Insurance: ${formatDate(car.insurance_expiry)}</span>
      </div>
    </div>
    
    <div class="list-col col-actions">
      <a href="admin-editCar.html?id=${
        car.id
      }" class="action-btn edit" title="Edit Car">
        <i class="bi bi-pencil"></i>
      </a>
      <button class="action-btn delete" data-car-id="${
        car.id
      }" title="Delete Car">
        <i class="bi bi-trash"></i>
      </button>
    </div>
  `;

  // Add event listener for delete button
  const deleteBtn = row.querySelector(".action-btn.delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      confirmDeleteCar(car.id);
    });
  }

  return row;
}

// Set active view (grid or list)
function setActiveView(view) {
  // Store preference
  currentView = view;
  localStorage.setItem("carViewPreference", view);

  // Update button states
  if (gridViewBtn && listViewBtn) {
    if (view === "grid") {
      gridViewBtn.classList.add("active");
      listViewBtn.classList.remove("active");
    } else {
      gridViewBtn.classList.remove("active");
      listViewBtn.classList.add("active");
    }
  }

  // Show/hide views
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

// Confirm delete car
function confirmDeleteCar(carId) {
  const car = allCars.find((c) => c.id === carId);
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
        <p>Are you sure you want to delete the following car?</p>
        
        <div class="car-summary">
          <p><strong>License Plate:</strong> ${
            car.license_plate || "No Plate"
          }</p>
          <p><strong>Car:</strong> ${car.make || ""} ${
    car.model || "Unknown"
  }</p>
          <p><strong>Status:</strong> ${capitalizeFirstLetter(
            car.status || "unknown"
          )}</p>
          <p><strong>ID:</strong> ${car.id}</p>
        </div>
        
        <p class="warning-text">
          <i class="bi bi-exclamation-triangle"></i>
          This action cannot be undone. All data associated with this car will be permanently deleted.
        </p>
      </div>
      
      <div class="modal-footer">
        <button class="secondary-btn" id="cancel-btn">Cancel</button>
        <button class="danger-btn" id="confirm-delete-btn">Delete Car</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Show modal with animation
  setTimeout(() => {
    backdrop.style.opacity = "1";
    modal.style.opacity = "1";
    modal.style.transform = "translateY(0)";
  }, 10);

  // Handle close button
  const closeBtn = modal.querySelector(".close-modal");
  closeBtn.addEventListener("click", closeModal);

  // Handle cancel button
  const cancelBtn = modal.querySelector("#cancel-btn");
  cancelBtn.addEventListener("click", closeModal);

  // Handle click outside modal
  backdrop.addEventListener("click", closeModal);

  // Handle confirm delete button
  const confirmBtn = modal.querySelector("#confirm-delete-btn");
  confirmBtn.addEventListener("click", async () => {
    try {
      // Close modal
      closeModal();

      // Show loading
      showLoading(true);

      // Delete car from Firestore
      await deleteDoc(doc(db, "cars", carId));

      console.log(`Car ${carId} deleted successfully`);

      // Remove from local data
      allCars = allCars.filter((c) => c.id !== carId);

      // Refresh display
      filterAndSortCars();

      // Show success toast
      showToast("Car deleted successfully", "success");
    } catch (error) {
      console.error(`Error deleting car ${carId}:`, error);
      showToast(`Failed to delete car: ${error.message}`, "error");
    } finally {
      showLoading(false);
    }
  });

  // Function to close modal
  function closeModal() {
    backdrop.style.opacity = "0";
    modal.style.opacity = "0";
    modal.style.transform = "translateY(20px)";

    setTimeout(() => {
      backdrop.remove();
      modal.remove();
    }, 300);
  }
}

// Show loading state
function showLoading(show) {
  if (loadingState) {
    loadingState.style.display = show ? "flex" : "none";
  }
}

// Show or hide empty state
function showEmptyState(show) {
  if (emptyState) {
    emptyState.style.display = show ? "flex" : "none";
  }
}

// Show error message
function showErrorMessage(message) {
  // Create error container
  const errorContainer = document.createElement("div");
  errorContainer.className = "error-container";
  errorContainer.innerHTML = `
    <div class="error-message">
      <i class="bi bi-exclamation-triangle"></i>
      <h3>Error</h3>
      <p>${message}</p>
      <button class="primary-btn" onclick="location.reload()">Reload Page</button>
    </div>
  `;

  // Hide loading state
  showLoading(false);

  // Add to page
  const container = document.querySelector(".container");
  if (container) {
    container.prepend(errorContainer);
  } else {
    document.body.prepend(errorContainer);
  }
}

// Update or add this formatting function in your admin-cars.js file:
function formatDate(date) {
  if (!date) return 'N/A';
  
  // Check if it's a Firestore Timestamp
  if (date instanceof Timestamp) {
    date = date.toDate();
  }
  // Check for Firestore timestamp object format
  else if (date.seconds !== undefined) {
    date = new Date(date.seconds * 1000);
  }
  // Check if it's a string, try to parse it
  else if (typeof date === 'string') {
    date = new Date(date);
  }
  
  // Check if we have a valid date
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  // Format as DD/MM/YYYY
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

// Show toast notification
function showToast(message, type = "info") {
  // Remove existing toast
  const existingToast = document.querySelector(".toast");
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  // Set icon based on type
  let icon = "info-circle";
  if (type === "success") icon = "check-circle";
  if (type === "error") icon = "exclamation-triangle";

  toast.innerHTML = `
    <i class="bi bi-${icon}"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);

  // Show toast with animation
  setTimeout(() => {
    toast.classList.add("show");

    // Hide after delay
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }, 10);
}

// Helper function to capitalize first letter
function capitalizeFirstLetter(string) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Export functions that might be needed elsewhere
export { loadCarsData, filterAndSortCars, setActiveView };
