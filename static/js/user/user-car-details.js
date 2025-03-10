// user-car-details.js
import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize global variables
let carId;
let carData;
let map;
let marker;
let hourlyRate = 8.50; // Default price, can be updated based on car type

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessage = document.getElementById('error-message');
const contentContainer = document.getElementById('car-details-content');
const bookingForm = document.querySelector('.booking-form');

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html').then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html').then(response => response.text());
    
    // Setup logout button
    setupLogoutButton();

    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Get car ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            carId = urlParams.get('id');
            
            if (!carId) {
                showError("No car specified. Please go back and select a car.");
                return;
            }
            
            // Load car details
            await loadCarDetails();
            
            // Set minimum date for booking to today
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('pickup-date').min = today;
            document.getElementById('pickup-date').value = today;
            
            // Set up event listeners
            setupEventListeners();
        } else {
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
});

function setupLogoutButton() {
    setTimeout(() => {
        const logoutButton = document.getElementById('logout-button');
        if (logoutButton) {
            logoutButton.addEventListener('click', async (event) => {
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
    }, 300);
}

// Load car details from Firestore
async function loadCarDetails() {
    try {
        // Show loading indicator
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        contentContainer.style.display = 'none';
        
        // Get car document
        const carDoc = await getDoc(doc(db, 'cars', carId));
        
        if (!carDoc.exists()) {
            showError("Car not found. It may have been removed.");
            return;
        }
        
        // Store car data and update UI
        carData = carDoc.data();
        updateCarDetailsUI();
        
        // Initialize map
        initMap();
        
        // Show content
        loadingIndicator.style.display = 'none';
        contentContainer.style.display = 'block';
    } catch (error) {
        console.error('Error loading car details:', error);
        showError("Failed to load car details. Please try again.");
    }
}

// Update UI with car details
function updateCarDetailsUI() {
    // Set car image based on type
    const carImageSrc = `../static/assets/images/${carData.car_type.toLowerCase()}.jpg`;
    const carMainImage = document.getElementById('car-main-image');
    carMainImage.src = carImageSrc;
    carMainImage.onerror = () => {
        carMainImage.src = '../static/assets/images/car-placeholder.jpg';
    };
    
    // Set car details
    document.getElementById('car-title').textContent = carData.car_type;
    document.getElementById('car-status').textContent = carData.status;
    document.getElementById('car-type').textContent = carData.car_type;
    document.getElementById('car-address').textContent = carData.address;
    document.getElementById('car-color').textContent = carData.car_color;
    document.getElementById('car-fuel').textContent = carData.fuel_type;
    document.getElementById('car-seating').textContent = `${carData.seating_capacity} Seats`;
    document.getElementById('car-large-luggage').textContent = carData.large_luggage || 0;
    document.getElementById('car-small-luggage').textContent = carData.small_luggage || 0;
    document.getElementById('car-plate').textContent = carData.license_plate;
    
    // Set price
    document.getElementById('car-price').textContent = hourlyRate.toFixed(2);
    document.getElementById('summary-rate').textContent = hourlyRate.toFixed(2);
    document.getElementById('summary-total').textContent = hourlyRate.toFixed(2);
    
    // Disable booking button if car not available
    const bookNowBtn = document.getElementById('book-now-btn');
    const proceedBookingBtn = document.getElementById('proceed-booking-btn');
    
    if (carData.status !== 'available') {
        bookNowBtn.disabled = true;
        proceedBookingBtn.disabled = true;
        bookNowBtn.textContent = 'Not Available';
        proceedBookingBtn.textContent = 'Car Not Available';
        bookNowBtn.classList.add('disabled-btn');
        proceedBookingBtn.classList.add('disabled-btn');
    }
}

// Initialize Google Map
function initMap() {
    if (!carData.current_location) return;
    
    const carLocation = {
        lat: carData.current_location.latitude,
        lng: carData.current_location.longitude
    };
    
    // Create map
    map = new google.maps.Map(document.getElementById('car-map'), {
        center: carLocation,
        zoom: 15,
        mapTypeControl: false,
        fullscreenControl: true,
        streetViewControl: false
    });
    
    // Add marker for car
    marker = new google.maps.Marker({
        position: carLocation,
        map: map,
        title: carData.car_type,
        icon: {
            url: `../static/assets/images/car-marker.png`, // You need this image
            scaledSize: new google.maps.Size(32, 32)
        }
    });
    
    // Add info window
    const infoWindow = new google.maps.InfoWindow({
        content: `
            <div style="padding: 5px;">
                <strong>${carData.car_type}</strong><br>
                ${carData.address}
            </div>
        `
    });
    
    marker.addListener('click', () => {
        infoWindow.open(map, marker);
    });
}

// Set up event listeners
function setupEventListeners() {
    // Book now button scrolls to booking form
    document.getElementById('book-now-btn').addEventListener('click', () => {
        document.querySelector('.booking-section').scrollIntoView({ behavior: 'smooth' });
    });
    
    // Get directions button
    document.getElementById('directions-btn').addEventListener('click', () => {
        if (carData.current_location) {
            const lat = carData.current_location.latitude;
            const lng = carData.current_location.longitude;
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
        }
    });
    
    // Duration change updates total price
    document.getElementById('duration').addEventListener('change', updateBookingSummary);
    
    // Proceed with booking button
    document.getElementById('proceed-booking-btn').addEventListener('click', proceedWithBooking);
}

// Update booking summary when duration changes
function updateBookingSummary() {
    const duration = parseInt(document.getElementById('duration').value);
    document.getElementById('summary-duration').textContent = duration;
    
    const total = hourlyRate * duration;
    document.getElementById('summary-total').textContent = total.toFixed(2);
}

// Handle booking submission
async function proceedWithBooking() {
    const pickupDate = document.getElementById('pickup-date').value;
    const pickupTime = document.getElementById('pickup-time').value;
    const duration = document.getElementById('duration').value;
    
    if (!pickupDate || !pickupTime) {
        alert('Please select pickup date and time');
        return;
    }
    
    // Store booking details in session storage
    const bookingDetails = {
        carId,
        carType: carData.car_type,
        pickupDate,
        pickupTime,
        duration,
        hourlyRate,
        totalPrice: (hourlyRate * parseInt(duration)).toFixed(2)
    };
    
    sessionStorage.setItem('bookingDetails', JSON.stringify(bookingDetails));
    
    // Redirect to booking confirmation page
    window.location.href = 'user-book-confirmation.html';
}

// Display error message
function showError(message) {
    loadingIndicator.style.display = 'none';
    contentContainer.style.display = 'none';
    errorMessage.style.display = 'block';
    errorMessage.querySelector('p').textContent = message;
}