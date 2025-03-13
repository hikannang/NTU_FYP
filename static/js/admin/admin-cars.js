// admin-cars.js - Part 1
import { db, auth } from "../common/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global state
let currentUser = null;
let carsData = [];
let filteredCars = [];
let carTypeOptions = new Set();
let currentPage = 1;
let totalPages = 1;
let carsPerPage = 12;
let currentSortField = "license_plate";
let currentSortDirection = "asc";
let currentView = "grid"; // 'grid' or 'list'
let selectedCars = new Set();
let mapInstances = {};

// Initialize the page
document.addEventListener("DOMContentLoaded", async function() {
  console.log("Initializing admin cars page...");
  
  try {
    // Load header and footer
    document.getElementById("header").innerHTML = await fetch(
      "../static/headerFooter/admin-header.html"
    ).then(response => response.text());
    
    document.getElementById("footer").innerHTML = await fetch(
      "../static/headerFooter/admin-footer.html"
    ).then(response => response.text());
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          
          if (userDoc.exists() && userDoc.data().role === 'admin') {
            // User is authenticated as admin
            initializeApp();
          } else {
            // User is not an admin
            alert("You don't have permission to access this page");
            window.location.href = "../index.html";
          }
        } catch (error) {
          console.error("Error checking admin role:", error);
          alert("Error checking permissions. Please try again.");
        }
      } else {
        // User is not logged in
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("Initialization error:", error);
    document.body.innerHTML = `
      <div class="error-container">
        <h1>Error Loading Page</h1>
        <p>${error.message}</p>
        <button onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }
});

// Main initialization function
async function initializeApp() {
  console.log("Setting up admin cars page");
  
  // Set up event listeners
  setupEventListeners();
  
  // Load cars data
  await loadCarsData();
  
  // Initialize the view
  updateView();
}

// Set up all event listeners
function setupEventListeners() {
  // Search functionality
  const searchInput = document.getElementById("car-search");
  searchInput.addEventListener("input", handleSearch);
  
  document.getElementById("clear-search").addEventListener("click", () => {
    searchInput.value = "";
    handleSearch();
  });
  
  // Filters
  document.getElementById("status-filter").addEventListener("change", applyFilters);
  document.getElementById("car-type-filter").addEventListener("change", applyFilters);
  document.getElementById("sort-by").addEventListener("change", (e) => {
    currentSortField = e.target.value;
    applyFilters();
  });
  
  // View toggle
  document.getElementById("grid-view-btn").addEventListener("click", () => {
    setView("grid");
  });
  
  document.getElementById("list-view-btn").addEventListener("click", () => {
    setView("list");
  });
  
  // Pagination
  document.getElementById("prev-page").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      updateView();
    }
  });
  
  document.getElementById("next-page").addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      updateView();
    }
  });
  
  // Export button
  document.getElementById("export-data").addEventListener("click", exportCarsData);
  
  // Bulk actions
  document.getElementById("select-all").addEventListener("change", toggleSelectAll);
  document.getElementById("bulk-available").addEventListener("click", () => bulkUpdateStatus("available"));
  document.getElementById("bulk-maintenance").addEventListener("click", () => bulkUpdateStatus("maintenance"));
  document.getElementById("bulk-delete").addEventListener("click", confirmBulkDelete);
  
  // Modal close buttons
  document.querySelectorAll(".close-modal").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".modal").forEach(modal => {
        modal.style.display = "none";
      });
    });
  });
  
  // Delete confirmation
  document.getElementById("confirm-delete").addEventListener("click", executeDelete);
  
  // Car details modal actions
  document.getElementById("detail-edit").addEventListener("click", () => {
    // Get the currently viewed car ID
    const carId = document.getElementById("detail-edit").dataset.carId;
    window.location.href = `admin-edit-car.html?id=${carId}`;
  });
  
  document.getElementById("detail-status-toggle").addEventListener("click", toggleCarStatus);
}

// Load cars data from Firestore
async function loadCarsData() {
  try {
    console.log("Loading cars data...");
    document.getElementById("loading-state").style.display = "flex";
    document.getElementById("empty-state").style.display = "none";
    document.getElementById("grid-view").style.display = "none";
    document.getElementById("list-view").style.display = "none";
    
    const carsSnapshot = await getDocs(collection(db, "cars"));
    
    // Reset the cars array
    carsData = [];
    carTypeOptions = new Set();
    
    // Reset counters for info cards
    let availableCount = 0;
    let bookedCount = 0;
    let maintenanceCount = 0;
    
    // Process each car document
    carsSnapshot.forEach(doc => {
      const car = doc.data();
      car.id = doc.id;
      
      // Add to cars array
      carsData.push(car);
      
      // Add car type to options
      if (car.car_type) {
        carTypeOptions.add(car.car_type);
      }
      
      // Update counters
      if (car.status === "available") availableCount++;
      else if (car.status === "booked") bookedCount++;
      else if (car.status === "maintenance") maintenanceCount++;
    });
    
    // Update info cards
    document.getElementById("available-count").textContent = availableCount;
    document.getElementById("booked-count").textContent = bookedCount;
    document.getElementById("maintenance-count").textContent = maintenanceCount;
    document.getElementById("total-count").textContent = carsData.length;
    
    // Populate car type filter
    populateCarTypeFilter();
    
    // Apply filters to get the initial view
    applyFilters();
    
    console.log(`Loaded ${carsData.length} cars`);
  } catch (error) {
    console.error("Error loading cars data:", error);
    alert("Failed to load cars data. Please try again.");
  } finally {
    document.getElementById("loading-state").style.display = "none";
  }
}

// Populate car type filter dropdown
function populateCarTypeFilter() {
  const carTypeFilter = document.getElementById("car-type-filter");
  carTypeFilter.innerHTML = '<option value="all">All Types</option>';
  
  // Sort car types alphabetically
  const sortedTypes = Array.from(carTypeOptions).sort();
  
  sortedTypes.forEach(type => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    carTypeFilter.appendChild(option);
  });
}

// Handle search input
function handleSearch() {
  applyFilters();
}

// Apply all filters and sort
function applyFilters() {
  const searchTerm = document.getElementById("car-search").value.toLowerCase().trim();
  const statusFilter = document.getElementById("status-filter").value;
  const typeFilter = document.getElementById("car-type-filter").value;
  
  // Filter cars
  filteredCars = carsData.filter(car => {
    // Apply search filter
    const matchesSearch = 
      !searchTerm || 
      (car.license_plate && car.license_plate.toLowerCase().includes(searchTerm)) ||
      (car.car_type && car.car_type.toLowerCase().includes(searchTerm)) ||
      (car.address && car.address.toLowerCase().includes(searchTerm)) ||
      (car.id && car.id.toLowerCase().includes(searchTerm));
    
    // Apply status filter
    const matchesStatus = statusFilter === "all" || car.status === statusFilter;
    
    // Apply type filter
    const matchesType = typeFilter === "all" || car.car_type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });
  
  // Sort cars
  filteredCars.sort((a, b) => {
    let fieldA = a[currentSortField] || "";
    let fieldB = b[currentSortField] || "";
    
    // Handle different field types
    if (typeof fieldA === "string") {
      fieldA = fieldA.toLowerCase();
      fieldB = fieldB.toLowerCase();
    }
    
    if (currentSortDirection === "asc") {
      return fieldA > fieldB ? 1 : -1;
    } else {
      return fieldA < fieldB ? 1 : -1;
    }
  });
  
  // Reset to first page when filters change
  currentPage = 1;
  
  // Update the view
  updateView();
}

// Set view (grid or list)
function setView(view) {
  currentView = view;
  
  // Update button states
  document.getElementById("grid-view-btn").classList.toggle("active", view === "grid");
  document.getElementById("list-view-btn").classList.toggle("active", view === "list");
  
  // Update view containers
  document.getElementById("grid-view").style.display = view === "grid" ? "grid" : "none";
  document.getElementById("list-view").style.display = view === "list" ? "block" : "none";
}

// Update the cars view
function updateView() {
  // Check if we have any cars
  if (filteredCars.length === 0) {
    document.getElementById("empty-state").style.display = "flex";
    document.getElementById("grid-view").style.display = "none";
    document.getElementById("list-view").style.display = "none";
    updatePagination(0, 0);
    return;
  }
  
  document.getElementById("empty-state").style.display = "none";
  
  // Calculate pagination
  totalPages = Math.ceil(filteredCars.length / carsPerPage);
  const startIdx = (currentPage - 1) * carsPerPage;
  const endIdx = Math.min(startIdx + carsPerPage, filteredCars.length);
  const currentPageCars = filteredCars.slice(startIdx, endIdx);
  
  // Update views
  updateGridView(currentPageCars);
  updateListView(currentPageCars);
  setView(currentView);
  
  // Update pagination info
  updatePagination(startIdx + 1, endIdx);
}

// Update the grid view
function updateGridView(cars) {
  const gridContainer = document.getElementById("grid-view");
  gridContainer.innerHTML = "";
  
  cars.forEach(car => {
    const carCard = document.createElement("div");
    carCard.className = "car-card";
    carCard.dataset.id = car.id;
    
    // Format service due date for display
    let serviceDueText = "No service scheduled";
    let serviceClass = "";
    
    if (car.service_due) {
      const serviceDueDate = car.service_due instanceof Timestamp ? 
        new Date(car.service_due.seconds * 1000) : new Date(car.service_due);
      
      const today = new Date();
      const daysDiff = Math.floor((serviceDueDate - today) / (1000 * 60 * 60 * 24));
      
      serviceDueText = serviceDueDate.toLocaleDateString("en-SG", {
        day: "numeric", 
        month: "short", 
        year: "numeric"
      });
      
      if (daysDiff < 0) {
        serviceDueText += " (Overdue)";
        serviceClass = "service-alert";
      } else if (daysDiff < 14) {
        serviceDueText += " (Soon)";
        serviceClass = "service-alert";
      }
    }
    
    // Determine car status class
    const statusClass = car.status || "unknown";
    
    // Create car card content
    carCard.innerHTML = `
      <div class="car-image">
        <img src="../static/images/car-placeholder.png" alt="${car.car_type || 'Car'}">
        <div class="status-badge ${statusClass}">${capitalizeFirstLetter(car.status || "Unknown")}</div>
      </div>
      <div class="car-content">
        <h3>${car.car_type || "Unknown Car Type"}</h3>
        <p class="car-license">${car.license_plate || "No License Plate"}</p>
        <div class="car-info-grid">
          <div class="car-info-item">
            <i class="bi bi-people"></i>
            <span>${car.capacity || "N/A"}</span>
          </div>
          <div class="car-info-item">
            <i class="bi bi-geo-alt"></i>
            <span>${car.location_name || "No Location"}</span>
          </div>
          <div class="car-info-item">
            <i class="bi bi-tools"></i>
            <span class="${serviceClass}">${serviceDueText}</span>
          </div>
          <div class="car-info-item">
            <i class="bi bi-fuel-pump"></i>
            <span>${car.fuel_type || "N/A"}</span>
          </div>
        </div>
        <div class="car-actions">
          <button class="action-btn view" onclick="viewCarDetails('${car.id}')">
            <i class="bi bi-eye"></i>
          </button>
          <button class="action-btn edit" onclick="editCar('${car.id}')">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="action-btn delete" onclick="confirmDeleteCar('${car.id}', '${car.license_plate || 'Unknown'}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
    
    gridContainer.appendChild(carCard);
  });
}

// Update the list view
function updateListView(cars) {
  const listContent = document.getElementById("list-content");
  listContent.innerHTML = "";
  
  cars.forEach(car => {
    const listRow = document.createElement("div");
    listRow.className = "list-row";
    listRow.dataset.id = car.id;
    
    // Determine if this car is selected
    const isSelected = selectedCars.has(car.id);
    
    // Format service due date for display
    let serviceDueText = "Not scheduled";
    let serviceClass = "";
    
    if (car.service_due) {
      const serviceDueDate = car.service_due instanceof Timestamp ? 
        new Date(car.service_due.seconds * 1000) : new Date(car.service_due);
      
      const today = new Date();
      const daysDiff = Math.floor((serviceDueDate - today) / (1000 * 60 * 60 * 24));
      
      serviceDueText = serviceDueDate.toLocaleDateString("en-SG", {
        day: "numeric", 
        month: "short", 
        year: "numeric"
      });
      
      if (daysDiff < 0) {
        serviceDueText += " (Overdue)";
        serviceClass = "service-alert";
      } else if (daysDiff < 14) {
        serviceDueText += " (Soon)";
        serviceClass = "service-alert";
      }
    }
    
    // Create list row content
    listRow.innerHTML = `
      <div class="col-checkbox">
        <input type="checkbox" class="car-select" ${isSelected ? 'checked' : ''} 
          onchange="toggleCarSelection('${car.id}', this.checked)">
      </div>
      <div class="col-id">${car.id || ""}</div>
      <div class="col-license">${car.license_plate || "No Plate"}</div>
      <div class="col-type">${car.car_type || "Unknown"}</div>
      <div class="col-status">
        <span class="status-indicator ${car.status || 'unknown'}">${capitalizeFirstLetter(car.status || "Unknown")}</span>
      </div>
      <div class="col-service ${serviceClass}">${serviceDueText}</div>
      <div class="col-actions">
        <button class="action-btn view" onclick="viewCarDetails('${car.id}')">
          <i class="bi bi-eye"></i>
        </button>
        <button class="action-btn edit" onclick="editCar('${car.id}')">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="action-btn delete" onclick="confirmDeleteCar('${car.id}', '${car.license_plate || 'Unknown'}')">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;
    
    // Add event listener for checkbox
    const checkbox = listRow.querySelector(".car-select");
    checkbox.addEventListener("change", (e) => {
      toggleCarSelection(car.id, e.target.checked);
    });
    
    listContent.appendChild(listRow);
  });
  
  // Update bulk action visibility
  updateBulkActionsVisibility();
}

// Update pagination information
function updatePagination(from, to) {
  document.getElementById("showing-from").textContent = from;
  document.getElementById("showing-to").textContent = to;
  document.getElementById("total-items").textContent = filteredCars.length;
  
  const prevBtn = document.getElementById("prev-page");
  const nextBtn = document.getElementById("next-page");
  
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  
  // Generate page numbers
  const pageNumbers = document.getElementById("page-numbers");
  pageNumbers.innerHTML = "";
  
  // Determine which page numbers to show
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  
  if (endPage - startPage < 4 && startPage > 1) {
    startPage = Math.max(1, endPage - 4);
  }
  
  // Add first page if not in range
  if (startPage > 1) {
    addPageNumber(1);
    if (startPage > 2) {
      addEllipsis();
    }
  }
  
  // Add middle pages
  for (let i = startPage; i <= endPage; i++) {
    addPageNumber(i);
  }
  
  // Add last page if not in range
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      addEllipsis();
    }
    addPageNumber(totalPages);
  }
  
  function addPageNumber(num) {
    const btn = document.createElement("button");
    btn.className = `page-number ${num === currentPage ? "active" : ""}`;
    btn.textContent = num;
    btn.addEventListener("click", () => {
      if (num !== currentPage) {
        currentPage = num;
        updateView();
      }
    });
    pageNumbers.appendChild(btn);
  }
  
  function addEllipsis() {
    const ellipsis = document.createElement("span");
    ellipsis.className = "page-ellipsis";
    ellipsis.textContent = "...";
    pageNumbers.appendChild(ellipsis);
  }
}

// Toggle selection of a car
function toggleCarSelection(carId, isSelected) {
  if (isSelected) {
    selectedCars.add(carId);
  } else {
    selectedCars.delete(carId);
  }
  
  updateBulkActionsVisibility();
}

// Toggle selection of all cars
function toggleSelectAll(event) {
  const isChecked = event.target.checked;
  
  // Update all visible checkboxes
  document.querySelectorAll(".car-select").forEach(checkbox => {
    checkbox.checked = isChecked;
    
    const carId = checkbox.closest(".list-row").dataset.id;
    if (isChecked) {
      selectedCars.add(carId);
    } else {
      selectedCars.delete(carId);
    }
  });
  
  updateBulkActionsVisibility();
}

// Update bulk actions bar visibility
function updateBulkActionsVisibility() {
  const bulkActions = document.getElementById("bulk-actions");
  const selectedCount = document.getElementById("selected-count");
  
  if (selectedCars.size > 0) {
    bulkActions.style.display = "flex";
    selectedCount.textContent = `${selectedCars.size} car${selectedCars.size > 1 ? 's' : ''} selected`;
  } else {
    bulkActions.style.display = "none";
  }
}

// Update status of multiple cars
async function bulkUpdateStatus(status) {
  if (selectedCars.size === 0) return;
  
  try {
    const carIds = Array.from(selectedCars);
    
    // Show confirmation
    const statusText = status === "available" ? "Available" : "Maintenance";
    if (!confirm(`Are you sure you want to set ${selectedCars.size} car(s) to "${statusText}" status?`)) {
      return;
    }
    
    // Update cars
    for (const carId of carIds) {
      await updateDoc(doc(db, "cars", carId), {
        status: status,
        last_updated: Timestamp.now()
      });
    }
    
    // Clear selection
    selectedCars.clear();
    
    // Reload cars data
    await loadCarsData();
    
    // Show success message
    alert(`Successfully updated ${carIds.length} car(s) to "${statusText}" status.`);
  } catch (error) {
    console.error("Error updating car status:", error);
    alert("Failed to update car status. Please try again.");
  }
}

// Confirm delete for multiple cars
function confirmBulkDelete() {
  if (selectedCars.size === 0) return;
  
  // Show confirmation modal
  document.getElementById("delete-car-info").textContent = 
    `You are about to delete ${selectedCars.size} car${selectedCars.size > 1 ? 's' : ''} from the system.`;
  
  const deleteModal = document.getElementById("delete-modal");
  deleteModal.style.display = "flex";
  
  // Set up delete handler
  document.getElementById("confirm-delete").onclick = bulkDeleteCars;
}

// Delete multiple cars
async function bulkDeleteCars() {
  try {
    const carIds = Array.from(selectedCars);
    
    // Delete cars
    for (const carId of carIds) {
      await deleteDoc(doc(db, "cars", carId));
    }
    
    // Close modal
    document.getElementById("delete-modal").style.display = "none";
    
    // Clear selection
    selectedCars.clear();
    
    // Reload cars data
    await loadCarsData();
    
    // Show success message
    alert(`Successfully deleted ${carIds.length} car(s).`);
  } catch (error) {
    console.error("Error deleting cars:", error);
    alert("Failed to delete cars. Please try again.");
  }
}

// View car details
window.viewCarDetails = function(carId) {
  const car = carsData.find(car => car.id === carId);
  if (!car) return;
  
  // Fill car details modal
  document.getElementById("detail-car-type").textContent = car.car_type || "Unknown Car Type";
  document.getElementById("detail-license").textContent = `License Plate: ${car.license_plate || "Unknown"}`;
  
  // Update capacity
  document.getElementById("detail-capacity").textContent = car.capacity || "N/A";
  
  // Update fuel type
  document.getElementById("detail-fuel").textContent = car.fuel_type || "N/A";
  
  // Update color
  document.getElementById("detail-color").textContent = car.color || "N/A";
  
  // Update luggage
  document.getElementById("detail-luggage").textContent = car.luggage_capacity || "N/A";
  
  // Update address
  document.getElementById("detail-address").textContent = car.address || "No address provided";
  
  // Update service due date
  if (car.service_due) {
    const serviceDueDate = car.service_due instanceof Timestamp ? 
      new Date(car.service_due.seconds * 1000) : new Date(car.service_due);
    
    document.getElementById("detail-service-due").textContent = serviceDueDate.toLocaleDateString("en-SG", {
      day: "numeric", 
      month: "short", 
      year: "numeric"
    });
  } else {
    document.getElementById("detail-service-due").textContent = "Not scheduled";
  }
  
  // Update insurance expiry date
  if (car.insurance_expiry) {
    const insuranceDate = car.insurance_expiry instanceof Timestamp ? 
      new Date(car.insurance_expiry.seconds * 1000) : new Date(car.insurance_expiry);
    
    document.getElementById("detail-insurance").textContent = insuranceDate.toLocaleDateString("en-SG", {
      day: "numeric", 
      month: "short", 
      year: "numeric"
    });
  } else {
    document.getElementById("detail-insurance").textContent = "Not provided";
  }
  
  // Update special instructions
  document.getElementById("detail-directions").textContent = car.special_instructions || "No special instructions.";
  
  // Update status badge
  const statusBadge = document.getElementById("detail-status");
  statusBadge.textContent = capitalizeFirstLetter(car.status || "Unknown");
  statusBadge.className = car.status || "unknown";
  
  // Update status toggle button
  const statusToggleBtn = document.getElementById("detail-status-toggle");
  statusToggleBtn.dataset.carId = carId;
  
  if (car.status === "maintenance") {
    statusToggleBtn.innerHTML = '<i class="bi bi-check-circle"></i> Set Available';
    statusToggleBtn.className = "primary-btn";
  } else {
    statusToggleBtn.innerHTML = '<i class="bi bi-tools"></i> Set Maintenance';
    statusToggleBtn.className = "secondary-btn";
  }
  
  // Store car ID for edit button
  document.getElementById("detail-edit").dataset.carId = carId;
  
  // Initialize Google Maps
  setTimeout(() => {
    if (car.latitude && car.longitude) {
      initDetailMap(car.latitude, car.longitude);
    } else {
      // If no coordinates, try to geocode the address
      if (car.address) {
        geocodeAddress(car.address);
      } else {
        // If no address, show default map of Singapore
        initDetailMap(1.3521, 103.8198);
      }
    }
  }, 300);
  
  // Show modal
  document.getElementById("car-details-modal").style.display = "flex";
};

// Initialize map for car details modal
function initDetailMap(lat, lng) {
  const mapElement = document.getElementById("detail-map");
  
  if (!mapElement) return;
  
  const mapOptions = {
    center: { lat, lng },
    zoom: 15,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  };
  
  const map = new google.maps.Map(mapElement, mapOptions);
  
  // Add marker
  new google.maps.Marker({
    position: { lat, lng },
    map,
    animation: google.maps.Animation.DROP
  });
}

// Geocode address to coordinates
function geocodeAddress(address) {
  const geocoder = new google.maps.Geocoder();
  
  geocoder.geocode({ address: address + ", Singapore" }, (results, status) => {
    if (status === "OK" && results[0]) {
      const location = results[0].geometry.location;
      initDetailMap(location.lat(), location.lng());
    } else {
      console.error("Geocode failed:", status);
      // Fall back to default Singapore map
      initDetailMap(1.3521, 103.8198);
    }
  });
}

// Navigate to edit car page
window.editCar = function(carId) {
  window.location.href = `admin-edit-car.html?id=${carId}`;
};

// Confirm delete car
window.confirmDeleteCar = function(carId, licensePlate) {
  // Update delete modal
  document.getElementById("delete-car-info").textContent = `License Plate: ${licensePlate}`;
  
  // Set up delete button
  document.getElementById("confirm-delete").onclick = async () => {
    await deleteCar(carId);
  };
  
  // Show modal
  document.getElementById("delete-modal").style.display = "flex";
};

// Delete a car
async function deleteCar(carId) {
  try {
    await deleteDoc(doc(db, "cars", carId));
    
    // Close modal
    document.getElementById("delete-modal").style.display = "none";
    
    // Reload cars data
    await loadCarsData();
    
    // Show success message
    alert("Car deleted successfully.");
  } catch (error) {
    console.error("Error deleting car:", error);
    alert("Failed to delete car. Please try again.");
  }
}

// Toggle car status (from detail modal)
async function toggleCarStatus() {
  const button = document.getElementById("detail-status-toggle");
  const carId = button.dataset.carId;
  const car = carsData.find(c => c.id === carId);
  
  if (!car) return;
  
  // Determine new status
  const newStatus = car.status === "maintenance" ? "available" : "maintenance";
  
  try {
    // Update car status
    await updateDoc(doc(db, "cars", carId), {
      status: newStatus,
      last_updated: Timestamp.now()
    });
    
    // Close modal
    document.getElementById("car-details-modal").style.display = "none";
    
    // Reload cars data
    await loadCarsData();
    
    // Show success message
    alert(`Car status updated to ${capitalizeFirstLetter(newStatus)}.`);
  } catch (error) {
    console.error("Error updating car status:", error);
    alert("Failed to update car status. Please try again.");
  }
}

// Export cars data to CSV
function exportCarsData() {
  try {
    // Create CSV content
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Add headers
    csvContent += "ID,License Plate,Car Type,Status,Capacity,Fuel Type,Color,Service Due,Insurance Expiry,Address\n";
    
    // Add filtered cars data
    filteredCars.forEach(car => {
      // Format dates
      let serviceDue = "";
      if (car.service_due) {
        const serviceDueDate = car.service_due instanceof Timestamp ? 
          new Date(car.service_due.seconds * 1000) : new Date(car.service_due);
        serviceDue = serviceDueDate.toISOString().split('T')[0];
      }
      
      let insuranceExpiry = "";
      if (car.insurance_expiry) {
        const insuranceDate = car.insurance_expiry instanceof Timestamp ? 
          new Date(car.insurance_expiry.seconds * 1000) : new Date(car.insurance_expiry);
        insuranceExpiry = insuranceDate.toISOString().split('T')[0];
      }
      
      // Create CSV row
      csvContent += [
        car.id || "",
        car.license_plate || "",
        car.car_type || "",
        car.status || "",
        car.capacity || "",
        car.fuel_type || "",
        car.color || "",
        serviceDue,
        insuranceExpiry,
        `"${(car.address || "").replace(/"/g, '""')}"`
      ].join(",") + "\n";
    });
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `cars_export_${new Date().toISOString().split('T')[0]}.csv`);
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error exporting cars data:", error);
    alert("Failed to export cars data. Please try again.");
  }
}

// Helper function to capitalize first letter
function capitalizeFirstLetter(string) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}