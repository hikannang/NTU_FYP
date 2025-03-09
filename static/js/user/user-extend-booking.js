// user-extend-booking.js
import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize variables
let userId = null;
let bookingId = null;
let carId = null;
let bookingData = null;
let carData = null;
let hourlyRate = 8.50; // Default hourly rate
let originalEndTime = null;

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessage = document.getElementById('error-message');
const extendBookingContent = document.getElementById('extend-booking-content');
const processingOverlay = document.getElementById('processing-overlay');
const successMessage = document.getElementById('success-message');
const extensionForm = document.getElementById('extension-form');
const cancelBtn = document.getElementById('cancel-btn');
const viewBookingBtn = document.getElementById('view-booking-btn');

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html').then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html').then(response => response.text());
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            
            // Get booking and car IDs from session storage
            bookingId = sessionStorage.getItem('extendBookingId');
            carId = sessionStorage.getItem('extendCarId');
            
            if (!bookingId || !carId) {
                showError("Booking information is missing. Please return to your bookings.");
                return;
            }
            
            try {
                await loadBookingData();
                setupEventListeners();
            } catch (error) {
                console.error('Error loading booking data:', error);
                showError("Failed to load booking details. Please try again.");
            }
        } else {
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
});

// Load booking data from Firestore
async function loadBookingData() {
    try {
        // Get car document
        const carDoc = await getDoc(doc(db, 'cars', carId));
        if (!carDoc.exists()) {
            throw new Error("Car not found");
        }
        carData = carDoc.data();
        
        // Get booking document
        const bookingDoc = await getDoc(doc(db, 'timesheets', carId, 'bookings', bookingId));
        if (!bookingDoc.exists()) {
            throw new Error("Booking not found");
        }
        bookingData = bookingDoc.data();
        
        // Verify booking belongs to user
        if (bookingData.user_id !== userId) {
            throw new Error("You don't have permission to modify this booking");
        }
        
        // Verify booking is active and can be extended
        const now = new Date();
        const endTime = new Date(bookingData.end_time.seconds * 1000);
        
        if (now > endTime) {
            throw new Error("This booking has already ended and cannot be extended");
        }
        
        // Check if there's a conflicting booking after this one
        const hasConflict = await checkForBookingConflicts(endTime);
        if (hasConflict) {
            throw new Error("Unable to extend this booking due to another reservation immediately after yours");
        }
        
        // Store original end time
        originalEndTime = endTime;
        
        // Update UI with booking details
        updateBookingDetailsUI();
        
        // Hide loading, show content
        loadingIndicator.style.display = 'none';
        extendBookingContent.style.display = 'block';
        
        // Initialize extension options
        updateExtensionOptions();
    } catch (error) {
        console.error('Error loading booking data:', error);
        showError(error.message || "Failed to load booking details");
    }
}

// Check for booking conflicts
async function checkForBookingConflicts(currentEndTime) {
    try {
        // Add 6 hours as maximum possible extension
        const maxExtendedEndTime = new Date(currentEndTime);
        maxExtendedEndTime.setHours(maxExtendedEndTime.getHours() + 6);
        
        // This is a simplified implementation
        // In a real app, you would query Firestore to check for any bookings
        // that start between currentEndTime and maxExtendedEndTime
        
        // For now, we'll assume no conflicts
        return false;
    } catch (error) {
        console.error('Error checking for conflicts:', error);
        return true; // Assume conflict on error as a safety measure
    }
}

// Update UI with booking and car data
function updateBookingDetailsUI() {
    // Set car image
    const carImageSrc = `../static/assets/images/${carData.car_type.toLowerCase()}.jpg`;
    const carImage = document.getElementById('car-image');
    carImage.src = carImageSrc;
    carImage.onerror = () => {
        carImage.src = '../static/assets/images/car-placeholder.jpg';
    };
    
    // Set booking details
    document.getElementById('booking-id').textContent = bookingId;
    document.getElementById('car-model').textContent = carData.car_type;
    document.getElementById('car-type').textContent = carData.car_type;
    document.getElementById('car-location').textContent = carData.address;
    
    // Format date
    const startTime = new Date(bookingData.start_time.seconds * 1000);
    const endTime = new Date(bookingData.end_time.seconds * 1000);
    
    document.getElementById('booking-date').textContent = startTime.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Format time
    document.getElementById('current-time').textContent = `${formatTime(startTime)} - ${formatTime(endTime)}`;
    
    // Calculate duration
    const durationMs = endTime - startTime;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    let durationText = '';
    if (hours > 0) {
        durationText += `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    if (minutes > 0) {
        durationText += `${hours > 0 ? ' ' : ''}${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    
    document.getElementById('current-duration').textContent = durationText;
    
    // Calculate hourly rate based on booking price and duration
    if (bookingData.price) {
        hourlyRate = parseFloat(bookingData.price) / (durationMs / (1000 * 60 * 60));
    }
    
    // Update price displays
    document.getElementById('price-30').textContent = (hourlyRate * 0.5).toFixed(2);
    document.getElementById('price-60').textContent = hourlyRate.toFixed(2);
    document.getElementById('price-120').textContent = (hourlyRate * 2).toFixed(2);
}

// Format time as 12-hour with AM/PM
function formatTime(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // The hour '0' should be '12'
    
    const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
    
    return `${hours}:${formattedMinutes} ${ampm}`;
}

// Set up event listeners
function setupEventListeners() {
    // Extension option radio buttons
    const extensionRadios = document.querySelectorAll('input[name="extension-duration"]');
    extensionRadios.forEach(radio => {
        radio.addEventListener('change', handleExtensionChange);
    });
    
    // Custom duration selects
    const customHours = document.getElementById('custom-hours');
    const customMinutes = document.getElementById('custom-minutes');
    
    customHours.addEventListener('change', updateCustomPrice);
    customMinutes.addEventListener('change', updateCustomPrice);
    
    // Form submission
    extensionForm.addEventListener('submit', handleFormSubmit);
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
        window.history.back();
    });
    
    // View booking button
    viewBookingBtn.addEventListener('click', () => {
        window.location.href = `user-booking-details.html?id=${bookingId}&carId=${carId}`;
    });
}

// Handle extension duration change
function handleExtensionChange(event) {
    const customHours = document.getElementById('custom-hours');
    const customMinutes = document.getElementById('custom-minutes');
    
    // Enable/disable custom inputs
    const isCustom = event.target.value === 'custom';
    customHours.disabled = !isCustom;
    customMinutes.disabled = !isCustom;
    
    // Update extension options
    if (isCustom) {
        updateCustomPrice();
    } else {
        updateExtensionOptions(parseInt(event.target.value));
    }
}

// Update custom price based on selected hours and minutes
function updateCustomPrice() {
    const customHours = parseInt(document.getElementById('custom-hours').value);
    const customMinutes = parseInt(document.getElementById('custom-minutes').value);
    const totalMinutes = customHours * 60 + customMinutes;
    
    // Don't allow empty extension
    if (totalMinutes === 0) {
        document.getElementById('custom-price').textContent = '0.00';
        return;
    }
    
    // Calculate price
    const customPrice = hourlyRate * totalMinutes / 60;
    document.getElementById('custom-price').textContent = customPrice.toFixed(2);
    
    // Update extension options
    updateExtensionOptions(totalMinutes);
}

// Update extension options (price and new end time)
function updateExtensionOptions(extensionMinutes = 30) {
    if (!originalEndTime) return;
    
    // Calculate new end time
    const newEndTime = new Date(originalEndTime);
    newEndTime.setMinutes(newEndTime.getMinutes() + extensionMinutes);
    
    // Display new end time
    document.getElementById('new-end-time').textContent = formatTime(newEndTime);
    
    // Calculate extension fee
    const extensionFee = (hourlyRate * extensionMinutes / 60).toFixed(2);
    document.getElementById('extension-fee').textContent = extensionFee;
    document.getElementById('total-price').textContent = extensionFee;
}

// Handle form submission
async function handleFormSubmit(event) {
    event.preventDefault();
    
    // Show processing overlay
    processingOverlay.style.display = 'flex';
    
    try {
        // Get selected extension duration
        let extensionMinutes = 30; // Default
        const selectedOption = document.querySelector('input[name="extension-duration"]:checked');
        
        if (selectedOption.value === 'custom') {
            const customHours = parseInt(document.getElementById('custom-hours').value);
            const customMinutes = parseInt(document.getElementById('custom-minutes').value);
            extensionMinutes = customHours * 60 + customMinutes;
            
            // Validate custom extension
            if (extensionMinutes <= 0) {
                throw new Error("Please select a valid extension duration");
            }
        } else {
            extensionMinutes = parseInt(selectedOption.value);
        }
        
        // Calculate new end time
        const newEndTime = new Date(originalEndTime);
        newEndTime.setMinutes(newEndTime.getMinutes() + extensionMinutes);
        
        // Calculate additional cost
        const extensionHours = extensionMinutes / 60;
        const additionalCost = hourlyRate * extensionHours;
        const newTotalPrice = bookingData.price + additionalCost;
        
        // Update booking in Firestore
        await updateDoc(doc(db, 'timesheets', carId, 'bookings', bookingId), {
            end_time: Timestamp.fromDate(newEndTime),
            price: newTotalPrice,
            modified_at: Timestamp.now(),
            extension_history: [...(bookingData.extension_history || []), {
                extended_on: Timestamp.now(),
                minutes_added: extensionMinutes,
                additional_cost: additionalCost
            }]
        });
        
        // Hide processing overlay and show success message
        processingOverlay.style.display = 'none';
        extendBookingContent.style.display = 'none';
        successMessage.style.display = 'block';
        
    } catch (error) {
        console.error('Error extending booking:', error);
        processingOverlay.style.display = 'none';
        showError(error.message || 'Failed to extend booking. Please try again.');
    }
}

// Show error message
function showError(message) {
    loadingIndicator.style.display = 'none';
    processingOverlay.style.display = 'none';
    extendBookingContent.style.display = 'none';
    
    errorMessage.style.display = 'block';
    errorMessage.querySelector('p').textContent = message;
}