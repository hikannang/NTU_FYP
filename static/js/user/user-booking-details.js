// user-booking-details.js
import { db, auth } from '../common/firebase-config.js';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  Timestamp, 
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize variables
let bookingId;
let carId;
let bookingData;
let carData;
let map;
let marker;
let userId;
let isAREnabled = false;

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessage = document.getElementById('error-message');
const contentContainer = document.getElementById('booking-details-content');
const arButton = document.getElementById('ar-btn');
const cancelButton = document.getElementById('cancel-btn');
const calendarButton = document.getElementById('calendar-btn');
const directionsButton = document.getElementById('directions-btn');
const cancelModal = document.getElementById('cancel-modal');
const confirmCancelButton = document.getElementById('cancel-confirm-yes');
const cancelConfirmNo = document.getElementById('cancel-confirm-no');
const closeModalButton = document.getElementById('close-modal');
const timeRemainingElement = document.getElementById('time-remaining');
const copyButton = document.getElementById('copy-btn');
const mapSection = document.getElementById('map-section');
const arNotice = document.getElementById('ar-notice');

// Update the initialization part that gets URL parameters
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Booking Details page loaded");
    
    try {
        // Load header and footer
        document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html').then(response => response.text());
        document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html').then(response => response.text());
        
        // Setup logout button
        setupLogoutButton();
        
        // Check authentication
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                console.log("User authenticated:", userId);
                
                // Get booking ID from URL
                const urlParams = new URLSearchParams(window.location.search);
                bookingId = urlParams.get('id');
                console.log("Booking ID from URL:", bookingId);
                
                if (bookingId) {
                    await loadBookingDetails();
                } else {
                    showError("No booking ID provided");
                }
            } else {
                console.log("User not authenticated, redirecting to login");
                window.location.href = "../index.html";
            }
        });
        
        // Set up event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error("Error initializing page:", error);
        showError("Error loading page");
    }
});

// Setup logout button
function setupLogoutButton() {
    setTimeout(() => {
        const logoutButton = document.querySelector('a[href="#logout"]');
        if (logoutButton) {
            console.log("Logout button found");
            logoutButton.addEventListener("click", async (event) => {
                event.preventDefault();
                try {
                    await signOut(auth);
                    window.location.href = "../index.html";
                } catch (error) {
                    console.error("Error during logout:", error);
                    alert("Logout failed: " + error.message);
                }
            });
        } else {
            console.warn("Logout button not found, trying again...");
            setTimeout(() => {
                const retryLogoutButton = document.querySelector('a[href="#logout"]');
                if (retryLogoutButton) {
                    console.log("Logout button found after delay");
                    retryLogoutButton.addEventListener("click", async (event) => {
                        event.preventDefault();
                        try {
                            await signOut(auth);
                            window.location.href = "../index.html";
                        } catch (error) {
                            console.error("Error during logout:", error);
                            alert("Logout failed: " + error.message);
                        }
                    });
                }
            }, 500);
        }
    }, 300);
}

// Helper function to show/hide loading state
function showLoading(show) {
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? 'flex' : 'none';
    }
    if (contentContainer) {
        contentContainer.style.display = show ? 'none' : 'block';
    }
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

// Helper function to show error message
function showError(message) {
    console.error("ERROR:", message);
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
    if (contentContainer) {
        contentContainer.style.display = 'none';
    }
    if (errorMessage) {
        errorMessage.style.display = 'flex';
        const errorText = errorMessage.querySelector('p');
        if (errorText) {
            errorText.textContent = message || "Sorry, we couldn't load this booking's details. Please try again later.";
        }
    }
}

// Load booking details - updated to get carId from booking
async function loadBookingDetails() {
    try {
        // Show loading state
        showLoading(true);
        
        console.log("Loading booking details for:", bookingId);
        
        // Try to get booking from user's bookings collection first
        let bookingDoc = null;
        try {
            const userBookingRef = doc(db, "users", userId, "bookings", bookingId);
            bookingDoc = await getDoc(userBookingRef);
            if (bookingDoc.exists()) {
                console.log("Booking found in user's collection");
            } else {
                console.log("Booking not found in user's collection, trying main bookings collection");
            }
        } catch (err) {
            console.warn("Error getting booking from user collection:", err);
        }
        
        // If not found in user's collection, try main bookings collection
        if (!bookingDoc || !bookingDoc.exists()) {
            try {
                const mainBookingRef = doc(db, "bookings", bookingId);
                bookingDoc = await getDoc(mainBookingRef);
            } catch (err) {
                console.warn("Error getting booking from main collection:", err);
            }
        }
        
        // Check if we found the booking
        if (!bookingDoc || !bookingDoc.exists()) {
            console.error("Booking not found in any collection:", bookingId);
            showError("Booking not found. It may have been deleted.");
            return;
        }
        
        // Get booking data
        bookingData = bookingDoc.data();
        bookingData.id = bookingId;
        
        console.log("Booking data loaded:", bookingData);
        
        // Extract car_id from booking data
        carId = bookingData.car_id;
        console.log("Car ID from booking:", carId);
        
        if (!carId) {
            console.error("No car_id in booking:", bookingId);
            showError("This booking doesn't have an associated car");
            return;
        }
        
        // Load car details
        await loadCarDetails();
        
        // Update UI with the loaded data
        updateBookingUI();
    } catch (error) {
        console.error("Error loading booking details:", error);
        showError("Failed to load booking details");
    }
}

// Load car details
async function loadCarDetails() {
    if (!carId) {
        console.error("No car ID provided");
        return false;
    }
    
    try {
        console.log("Loading car details for car ID:", carId);
        
        // Get car document
        const carRef = doc(db, "cars", carId);
        const carDoc = await getDoc(carRef);
        
        if (!carDoc.exists()) {
            console.error("Car not found:", carId);
            
            // Try to find car in cars collection using a query
            console.log("Trying to find car using query");
            const carsQuery = query(
                collection(db, "cars"),
                where("__name__", "==", carId)
            );
            
            const querySnapshot = await getDocs(carsQuery);
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                carData = doc.data();
                carData.id = doc.id;
                console.log("Car found via query:", carData);
            } else {
                // If still not found, use placeholder
                console.warn("Car not found via query either, using placeholder data");
                carData = {
                    id: carId,
                    car_type: bookingData.car_type || "car",
                    address: bookingData.pickup_location || "Location not available",
                    license_plate: "Not available",
                    seating_capacity: 5,
                    fuel_type: "Not specified",
                    large_luggage: 0,
                    small_luggage: 0
                };
            }
        } else {
            // Get car data
            carData = carDoc.data();
            carData.id = carId;
            console.log("Car data loaded:", carData);
            
            // Get car model details if available
            if (carData.car_type) {
                const modelId = carData.car_type.split('_')[0];
                try {
                    const modelRef = doc(db, "car_models", modelId);
                    const modelDoc = await getDoc(modelRef);
                    
                    if (modelDoc.exists()) {
                        carData.model_data = modelDoc.data();
                        console.log("Car model data:", carData.model_data);
                    }
                } catch (modelErr) {
                    console.warn("Error getting car model data:", modelErr);
                }
            }
        }
        
        return true;
    } catch (error) {
        console.error("Error loading car details:", error);
        carData = {
            id: carId,
            car_type: bookingData.car_type || "car",
            address: bookingData.pickup_location || "Location not available"
        };
        return false;
    }
}

// Update UI with booking and car data
function updateBookingUI() {
    try {
        console.log("Updating UI with booking and car data");
        
        // Hide loading indicator
        showLoading(false);
        
        // Convert timestamps to Date objects
        const startTime = bookingData.start_time instanceof Date ? 
                         bookingData.start_time : 
                         bookingData.start_time?.toDate ? 
                         bookingData.start_time.toDate() : 
                         new Date(bookingData.start_time);
                         
        const endTime = bookingData.end_time instanceof Date ? 
                       bookingData.end_time : 
                       bookingData.end_time?.toDate ? 
                       bookingData.end_time.toDate() : 
                       new Date(bookingData.end_time);
        
        // Format dates for display
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
        
        const formattedDate = startTime.toLocaleDateString('en-US', dateOptions);
        const formattedStartTime = startTime.toLocaleTimeString('en-US', timeOptions);
        const formattedEndTime = endTime.toLocaleTimeString('en-US', timeOptions);
        
        // Calculate booking status
        const now = new Date();
        let statusClass = 'upcoming';
        
        if (bookingData.status === 'cancelled') {
            statusClass = 'cancelled';
        } else if (now < startTime) {
            statusClass = 'upcoming';
        } else if (now >= startTime && now <= endTime) {
            statusClass = 'active';
        } else {
            statusClass = 'past';
        }
        
        // Update booking status display
        const statusElement = document.getElementById('booking-status');
        const statusIndicator = document.getElementById('booking-status-indicator');
        
        if (statusElement) {
            const statusText = bookingData.status === 'cancelled' ? 'Cancelled' :
                              statusClass === 'upcoming' ? 'Upcoming' :
                              statusClass === 'active' ? 'Active' : 'Completed';
            statusElement.textContent = statusText;
        }
        
        if (statusIndicator) {
            statusIndicator.className = `status-indicator ${statusClass}`;
        }
        
        // Update time remaining/until display
        updateTimeRemaining(now, startTime, endTime, statusClass);
        
        // Set booking ID/reference
        const bookingIdElement = document.getElementById('booking-id');
        if (bookingIdElement) {
            bookingIdElement.textContent = bookingData.id.substring(bookingData.id.length - 6);
        }
        
        // Get car display name from model_data or format it from car_type
        let carDisplayName = "Unknown Car";
        let carColor = "";
        
        if (carData.model_data && carData.model_data.name) {
            carDisplayName = carData.model_data.name;
            carColor = carData.model_data.color || "";
        } else if (carData.car_type) {
            const carTypeParts = carData.car_type.split('_');
            const modelId = carTypeParts[0];
            carColor = carTypeParts[1] || "";
            
            // Map model ID to proper name
            if (modelId === "modely") {
                carDisplayName = "Tesla Model Y";
            } else if (modelId === "model3") {
                carDisplayName = "Tesla Model 3";
            } else if (modelId === "models") {
                carDisplayName = "Tesla Model S";
            } else if (modelId === "modelx") {
                carDisplayName = "Tesla Model X";
            } else if (modelId === "vezel") {
                carDisplayName = "Honda Vezel";
            } else {
                carDisplayName = modelId.charAt(0).toUpperCase() + modelId.slice(1);
            }
        }
        
        // Format full display name with color
        if (carColor) {
            carColor = carColor.charAt(0).toUpperCase() + carColor.slice(1);
            carDisplayName = `${carDisplayName} (${carColor})`;
        }
        
        // Update car info
        const carModelElement = document.getElementById('car-model');
        if (carModelElement) {
            carModelElement.textContent = carDisplayName;
        }
        
        const carImageElement = document.getElementById('car-image');
        if (carImageElement) {
            carImageElement.src = `../static/images/car_images/${(carData.car_type || 'car').toLowerCase()}.png`;
            carImageElement.onerror = function() {
                this.src = '../static/images/assets/car-placeholder.jpg';
            };
        }
        
        // Set car specs
        const carSeatsElement = document.getElementById('car-seats');
        if (carSeatsElement) {
            carSeatsElement.textContent = `${carData.seating_capacity || '4-5'} seats`;
        }
        
        const carFuelElement = document.getElementById('car-fuel');
        if (carFuelElement) {
            carFuelElement.textContent = carData.fuel_type || 'Not specified';
        }
        
        const carLuggageElement = document.getElementById('car-luggage');
        if (carLuggageElement) {
            const largeCount = carData.large_luggage || 0;
            const smallCount = carData.small_luggage || 0;
            carLuggageElement.textContent = `${largeCount} large, ${smallCount} small`;
        }
        
        const carPlateElement = document.getElementById('car-plate');
        if (carPlateElement) {
            carPlateElement.textContent = carData.license_plate || 'Not available';
        }
        
        // Set booking details
        const bookingDateElement = document.getElementById('booking-date');
        if (bookingDateElement) {
            bookingDateElement.textContent = formattedDate;
        }
        
        const bookingTimeElement = document.getElementById('booking-time');
        if (bookingTimeElement) {
            bookingTimeElement.textContent = `${formattedStartTime} - ${formattedEndTime}`;
        }
        
        // Calculate and display duration
        const durationElement = document.getElementById('booking-duration');
        if (durationElement) {
            const durationMs = endTime - startTime;
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            
            let durationText = '';
            if (hours > 0) {
                durationText += `${hours} hour${hours !== 1 ? 's' : ''}`;
            }
            
            if (minutes > 0) {
                durationText += `${hours > 0 ? ' ' : ''}${minutes} minute${minutes !== 1 ? 's' : ''}`;
            }
            
            durationElement.textContent = durationText || 'N/A';
        }
        
        // Set price
        const priceElement = document.getElementById('booking-price');
        if (priceElement) {
            const price = bookingData.total_price || bookingData.price || 0;
            priceElement.textContent = `$${parseFloat(price).toFixed(2)}`;
        }
        
        // Set location
        const locationElement = document.getElementById('booking-location');
        if (locationElement) {
            locationElement.textContent = carData.address || bookingData.pickup_location || 'Location not available';
        }
        
        // Handle action buttons based on status
        setupActionButtons(now, startTime, endTime, statusClass);
        
        // Initialize map if we have coordinates
        if (carData.current_location) {
            console.log("Initializing map with car location");
            initializeMap();
        } else if (mapSection) {
            console.log("No location data available, hiding map section");
            mapSection.style.display = 'none';
        }
    } catch (error) {
        console.error("Error updating booking UI:", error);
        showError("Failed to display booking details");
    }
}

// Update time remaining or time until booking
function updateTimeRemaining(now, startTime, endTime, statusClass) {
    if (!timeRemainingElement) return;
    
    // Hide time remaining for cancelled or completed bookings
    if (statusClass === 'cancelled' || statusClass === 'past') {
        timeRemainingElement.style.display = 'none';
        return;
    }
    
    let timeText = '';
    
    if (statusClass === 'upcoming') {
        // Calculate time until booking starts
        const timeUntil = startTime - now;
        const daysUntil = Math.floor(timeUntil / (1000 * 60 * 60 * 24));
        const hoursUntil = Math.floor((timeUntil % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minsUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
        
        if (daysUntil > 0) {
            timeText = `Starts in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
        } else if (hoursUntil > 0) {
            timeText = `Starts in ${hoursUntil}h ${minsUntil}m`;
        } else {
            timeText = `Starts in ${minsUntil} minute${minsUntil > 1 ? 's' : ''}`;
        }
    } else if (statusClass === 'active') {
        // Calculate time remaining in booking
        const timeLeft = endTime - now;
        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
        const minsLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hoursLeft > 0) {
            timeText = `${hoursLeft}h ${minsLeft}m remaining`;
        } else {
            timeText = `${minsLeft} minute${minsLeft > 1 ? 's' : ''} remaining`;
        }
    }
    
    timeRemainingElement.textContent = timeText;
    timeRemainingElement.style.display = timeText ? 'block' : 'none';
    
    // Make the timer update automatically
    if (window.timeRemainingInterval) {
        clearInterval(window.timeRemainingInterval);
    }
    
    if (statusClass === 'active' || statusClass === 'upcoming') {
        window.timeRemainingInterval = setInterval(() => {
            updateTimeRemaining(new Date(), startTime, endTime, statusClass);
        }, 60000); // Update every minute
    }
}

// Setup action buttons based on booking status
function setupActionButtons(now, startTime, endTime, statusClass) {
    // Cancel Button - Show only for upcoming bookings
    if (cancelButton) {
        if (statusClass === 'upcoming') {
            cancelButton.style.display = 'block';
        } else {
            cancelButton.style.display = 'none';
        }
    }
    
    // AR Wayfinding Button
    if (arButton) {
        // Determine if AR should be enabled (within 30 min of start or during booking)
        const thirtyMinsBefore = new Date(startTime);
        thirtyMinsBefore.setMinutes(thirtyMinsBefore.getMinutes() - 30);
        
        isAREnabled = (now >= thirtyMinsBefore && now <= endTime);
        
        if (statusClass === 'cancelled' || statusClass === 'past') {
            arButton.style.display = 'none';
        } else if (isAREnabled) {
            arButton.style.display = 'block';
            arButton.disabled = false;
            if (arNotice) arNotice.style.display = 'none';
        } else {
            arButton.style.display = 'block';
            arButton.disabled = true;
            if (arNotice) arNotice.style.display = 'block';
        }
    }
}

// Initialize map with car location
function initializeMap() {
    if (!carData.current_location || !mapSection) return;
    
    const lat = parseFloat(carData.current_location.latitude);
    const lng = parseFloat(carData.current_location.longitude);
    
    // Validate coordinates
    if (isNaN(lat) || isNaN(lng)) {
        console.warn("Invalid coordinates in car data");
        mapSection.style.display = 'none';
        return;
    }
    
    const mapElement = document.getElementById('booking-map');
    if (!mapElement) {
        console.warn("Map element not found");
        return;
    }
    
    mapElement.style.height = '300px';
    
    // Create map
    map = new google.maps.Map(mapElement, {
        center: { lat, lng },
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true
    });
    
    // Add marker for car location
    marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        title: carData.license_plate || "Your car",
        icon: {
            url: '../static/images/assets/car-marker.png',
            scaledSize: new google.maps.Size(40, 40)
        }
    });
    
    // Add info window
    const infoWindow = new google.maps.InfoWindow({
        content: `<div class="map-info-window">
            <h4>${carData.license_plate || "Your car"}</h4>
            <p>${carData.address || "Location not available"}</p>
        </div>`
    });
    
    marker.addListener('click', () => {
        infoWindow.open(map, marker);
    });
}

// Setup all event listeners
function setupEventListeners() {
    // Cancel booking button
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            if (cancelModal) cancelModal.classList.add('active');
        });
    }
    
    // Cancel confirmation
    if (confirmCancelButton) {
        confirmCancelButton.addEventListener('click', async () => {
            await cancelBooking();
        });
    }
    
    // Cancel dismissal
    if (cancelConfirmNo) {
        cancelConfirmNo.addEventListener('click', () => {
            if (cancelModal) cancelModal.classList.remove('active');
        });
    }
    
    // Close modal
    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            if (cancelModal) cancelModal.classList.remove('active');
        });
    }
    
    // AR wayfinding button
    if (arButton) {
        arButton.addEventListener('click', () => {
            launchARWayfinding();
        });
    }
    
    // Calendar button
    if (calendarButton) {
        calendarButton.addEventListener('click', () => {
            addToCalendar();
        });
    }
    
    // Directions button
    if (directionsButton) {
        directionsButton.addEventListener('click', () => {
            getDirections();
        });
    }
    
    // Copy booking reference
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            copyBookingReference();
        });
    }
    
    // Handle window click to close modal
    window.addEventListener('click', (event) => {
        if (cancelModal && event.target === cancelModal) {
            cancelModal.classList.remove('active');
        }
    });
}

// Cancel booking function
async function cancelBooking() {
    try {
        console.log("Cancelling booking:", bookingId);
        
        // Show loading indicator in modal if possible
        const modalContent = cancelModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.innerHTML = `
                <div class="modal-loading">
                    <div class="loading-spinner"></div>
                    <p>Cancelling your booking...</p>
                </div>
            `;
        }
        
        // Update booking in main bookings collection
        const bookingRef = doc(db, "bookings", bookingId);
        await updateDoc(bookingRef, {
            status: "cancelled",
            cancelled_at: Timestamp.now(),
            cancelled_by: userId
        });
        
        // Also update in user's bookings collection if it exists
        try {
            const userBookingRef = doc(db, "users", userId, "bookings", bookingId);
            await updateDoc(userBookingRef, {
                status: "cancelled",
                cancelled_at: Timestamp.now(),
                cancelled_by: userId
            });
        } catch (err) {
            console.warn("Could not update user's booking copy:", err);
        }
        
        console.log("Booking cancelled successfully");
        
        // Show success message in modal
        if (modalContent) {
            modalContent.innerHTML = `
                <div class="modal-success">
                    <div class="success-icon">
                        <i class="bi bi-check-lg"></i>
                    </div>
                    <h3>Booking Cancelled</h3>
                    <p>Your booking has been successfully cancelled.</p>
                    <div class="modal-footer">
                        <button class="primary-btn" onclick="window.location.reload()">Okay</button>
                    </div>
                </div>
            `;
        } else {
            // If we can't update the modal, reload the page
            window.location.reload();
        }
    } catch (error) {
        console.error("Error cancelling booking:", error);
        
        // Show error in modal if possible
        const modalContent = cancelModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.innerHTML = `
                <div class="modal-error">
                    <div class="error-icon">
                        <i class="bi bi-exclamation-triangle"></i>
                    </div>
                    <h3>Cancellation Failed</h3>
                    <p>We couldn't cancel your booking. Please try again later.</p>
                    <div class="modal-footer">
                        <button class="primary-btn" onclick="cancelModal.classList.remove('active')">Okay</button>
                    </div>
                </div>
            `;
        } else {
            alert("Failed to cancel booking: " + error.message);
        }
    }
}

// Launch AR wayfinding
function launchARWayfinding() {
    if (!carData.current_location) {
        alert("Car location not available for AR navigation");
        return;
    }
    
    // Construct AR URL
    const lat = carData.current_location.latitude;
    const lng = carData.current_location.longitude;
    const arUrl = `../AR/user-ar-wayfinding.html?lat=${lat}&lng=${lng}&id=${bookingId}`;    
    // Open AR in new window
    window.open(arUrl, '_blank');
}

// Add to calendar
function addToCalendar() {
    try {
        // Convert timestamps to Date objects
        const startTime = bookingData.start_time instanceof Date ? 
                         bookingData.start_time : 
                         bookingData.start_time?.toDate ? 
                         bookingData.start_time.toDate() : 
                         new Date(bookingData.start_time);
                         
        const endTime = bookingData.end_time instanceof Date ? 
                       bookingData.end_time : 
                       bookingData.end_time?.toDate ? 
                       bookingData.end_time.toDate() : 
                       new Date(bookingData.end_time);
        
        // Format dates for calendar
        const formatDate = (date) => {
            return date.toISOString().replace(/-|:|\.\d+/g, '');
        };
        
        const start = formatDate(startTime);
        const end = formatDate(endTime);
        
        // Get car details
        const carName = carData.model_data?.name || 
                       (carData.car_type ? carData.car_type.split('_')[0] : 'Car');
        const location = carData.address || bookingData.pickup_location || '';
        
        // Create calendar URL
        const calendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=CarShare: ${carName} Booking&dates=${start}/${end}&details=Booking reference: ${bookingId.slice(-6)}&location=${encodeURIComponent(location)}`;
        
        // Open calendar in new window
        window.open(calendarUrl, '_blank');
    } catch (error) {
        console.error("Error adding to calendar:", error);
        alert("Failed to add to calendar: " + error.message);
    }
}

// Get directions
function getDirections() {
    try {
        if (!carData.current_location) {
            alert("Car location not available for directions");
            return;
        }
        
        const lat = carData.current_location.latitude;
        const lng = carData.current_location.longitude;
        
        // Create Google Maps directions URL
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        
        // Open directions in new window
        window.open(directionsUrl, '_blank');
    } catch (error) {
        console.error("Error getting directions:", error);
        alert("Failed to get directions: " + error.message);
    }
}

// Copy booking reference to clipboard
function copyBookingReference() {
    try {
        const referenceText = bookingId.slice(-6);
        navigator.clipboard.writeText(referenceText);
        
        // Show copy success indication
        const originalText = copyButton.textContent;
        copyButton.textContent = "Copied!";
        copyButton.classList.add("copied");
        
        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.classList.remove("copied");
        }, 2000);
    } catch (error) {
        console.error("Error copying booking reference:", error);
        alert("Failed to copy booking reference: " + error.message);
    }
}