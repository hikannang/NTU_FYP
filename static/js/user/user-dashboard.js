// user-dashboard.js
import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc, getDocs, collection, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let userId;
let userPosition = null;
let map;
let markers = [];
let nearbyCarsList = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Check if logout was requested
    if (sessionStorage.getItem('performLogout') === 'true') {
        sessionStorage.removeItem('performLogout');
        try {
            await signOut(auth);
            alert("You have been logged out.");
            window.location.href = "../index.html";
            return; // Exit early
        } catch (error) {
            console.error("Error during logout:", error);
            alert("Logout failed: " + error.message);
        }
    }
    
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html').then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html').then(response => response.text());
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            await loadUserData(userId);
            setDefaultDateTime();
            initializeSearch();
            loadNearbyCars();
            await loadActiveBookings(userId);
        } else {
            // User is signed out, redirect to login
            window.location.href = "../index.html";
        }
    });

    // Event listeners
    document.getElementById('search-btn').addEventListener('click', searchCars);
    document.getElementById('current-location-btn').addEventListener('click', getCurrentLocation);
    document.getElementById('car-type-filter').addEventListener('change', filterNearbyCars);
});

// Set default date and time (current time rounded to next 15-minute interval)
function setDefaultDateTime() {
    const now = new Date();
    const dateInput = document.getElementById('pickup-date');
    const hoursSelect = document.getElementById('pickup-time-hours');
    const minutesSelect = document.getElementById('pickup-time-minutes');
    
    // Set default date to today
    const today = now.toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.min = today;
    
    // Set default time to next 15-minute interval
    let hours = now.getHours();
    let minutes = now.getMinutes();
    
    // Round up to next 15 minutes
    minutes = Math.ceil(minutes / 15) * 15;
    
    // Handle overflow
    if (minutes >= 60) {
        hours += 1;
        minutes = 0;
    }
    
    // Handle day overflow
    if (hours >= 24) {
        hours = 0;
        // Should also update date but that's handled elsewhere
    }
    
    hoursSelect.value = hours;
    
    // Find the closest 15-minute interval
    const minuteOptions = [0, 15, 30, 45];
    const closestMinute = minuteOptions.find(m => m >= minutes) || 0;
    minutesSelect.value = closestMinute;
}

// Load user data
async function loadUserData(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Update welcome message
            const userName = `${userData.firstName || 'User'}`;
            document.getElementById('user-name').textContent = userName;
            
            // Store user location if available
            if (userData.address && userData.address.coordinates) {
                userPosition = {
                    lat: userData.address.coordinates.latitude,
                    lng: userData.address.coordinates.longitude
                };
            }
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

// Load active bookings
async function loadActiveBookings(userId) {
    const bookingsContainer = document.querySelector('.bookings-container');
    const noBookingsMessage = document.getElementById('no-bookings-message');
    
    try {
        // Clear loading indicator
        bookingsContainer.innerHTML = '';
        
        // Get current timestamp
        const now = Timestamp.now();
        
        // Find bookings for this user that haven't ended yet
        const activeBookings = [];
        const carsSnapshot = await getDocs(collection(db, 'cars'));
        
        for (const carDoc of carsSnapshot.docs) {
            const bookingsRef = collection(db, 'timesheets', carDoc.id, 'bookings');
            const bookingsQuery = query(
                bookingsRef, 
                where('user_id', '==', userId),
                where('end_time', '>=', now),
                orderBy('end_time')
            );
            
            const bookingsSnapshot = await getDocs(bookingsQuery);
            
            for (const bookingDoc of bookingsSnapshot.docs) {
                const bookingData = bookingDoc.data();
                
                // Skip cancelled bookings
                if (bookingData.status === 'cancelled') continue;
                
                activeBookings.push({
                    id: bookingDoc.id,
                    carId: carDoc.id,
                    ...bookingData,
                    car: await getCarDetails(carDoc.id)
                });
            }
        }
        
        // Show active bookings or no bookings message
        if (activeBookings.length > 0) {
            // Sort by start time (closest first)
            activeBookings.sort((a, b) => a.start_time.seconds - b.start_time.seconds);
            
            // Limit to 3 most recent bookings
            const recentBookings = activeBookings.slice(0, 3);
            
            // Create booking elements
            recentBookings.forEach(booking => {
                const bookingElement = createBookingElement(booking);
                bookingsContainer.appendChild(bookingElement);
            });
        } else {
            bookingsContainer.appendChild(createNoBookingsMessage());
        }
    } catch (error) {
        console.error("Error loading bookings:", error);
        bookingsContainer.innerHTML = '';
        bookingsContainer.appendChild(createNoBookingsMessage());
    }
}

// Create booking card element
function createBookingElement(booking) {
    const bookingElement = document.createElement('div');
    bookingElement.className = 'booking-card';
    
    // Convert timestamps to Date objects
    const startTime = new Date(booking.start_time.seconds * 1000);
    const endTime = new Date(booking.end_time.seconds * 1000);
    
    // Format dates and times
    const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    const formattedDate = startTime.toLocaleDateString('en-US', dateOptions);
    const formattedStartTime = startTime.toLocaleTimeString('en-US', timeOptions);
    const formattedEndTime = endTime.toLocaleTimeString('en-US', timeOptions);
    
    // Calculate status
    const now = new Date();
    let statusText, statusClass;
    
    if (now < startTime) {
        statusText = 'Upcoming';
        statusClass = 'status-upcoming';
    } else {
        statusText = 'Active';
        statusClass = 'status-active';
    }
    
    bookingElement.innerHTML = `
        <div class="booking-status ${statusClass}">
            <span class="status-dot"></span>
            <span class="status-text">${statusText}</span>
        </div>
        <div class="booking-content">
            <div class="car-image">
                <img src="${booking.car?.image || '../static/assets/images/car-placeholder.jpg'}" alt="Car image">
            </div>
            <div class="booking-details">
                <div class="booking-title">
                    <h3>${booking.car?.make || ''} ${booking.car?.modelName || booking.car?.car_type || 'Car'}</h3>
                </div>
                <div class="booking-meta">
                    <div class="booking-time">
                        <i class="bi bi-calendar3"></i>
                        <span>${formattedDate} • ${formattedStartTime} - ${formattedEndTime}</span>
                    </div>
                    <div class="booking-location">
                        <i class="bi bi-geo-alt"></i>
                        <span>${booking.car?.address || 'Address not available'}</span>
                    </div>
                </div>
                <div class="booking-actions">
                    <a href="user-booking-details.html?id=${booking.id}&carId=${booking.carId}" class="primary-btn sm">
                        View Details
                    </a>
                </div>
            </div>
        </div>
    `;
    
    return bookingElement;
}

// Create no bookings message
function createNoBookingsMessage() {
    const noBookingsElement = document.createElement('div');
    noBookingsElement.className = 'empty-state';
    noBookingsElement.innerHTML = `
        <i class="bi bi-calendar-x"></i>
        <p>You have no active bookings</p>
        <a href="#quick-search" class="primary-btn">Find a car now</a>
    `;
    return noBookingsElement;
}

// Get car details
async function getCarDetails(carId) {
    try {
        const carDoc = await getDoc(doc(db, 'cars', carId));
        if (carDoc.exists()) {
            const carData = carDoc.data();
            
            // Get car model details
            let modelData = {};
            if (carData.model_id) {
                try {
                    const modelDoc = await getDoc(doc(db, 'models', carData.model_id));
                    if (modelDoc.exists()) {
                        modelData = modelDoc.data();
                    }
                } catch (err) {
                    console.error("Error fetching model data:", err);
                }
            }
            
            return {
                id: carId,
                ...carData,
                make: modelData.make || 'Unknown',
                modelName: modelData.model || carData.car_type || 'Unknown',
                image: modelData.image_url || `../static/assets/images/${carData.car_type?.toLowerCase() || 'car'}.jpg`
            };
        }
        return null;
    } catch (error) {
        console.error("Error getting car details:", error);
        return null;
    }
}

// Initialize search functionality
function initializeSearch() {
    // Initialize Google Places Autocomplete
    const input = document.getElementById('location-input');
    const autocomplete = new google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: "sg" },
        fields: ["address_components", "geometry", "name"],
        types: ["geocode"]
    });
    
    // Prevent form submission on Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });
    
    // Store location when place is selected
    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        
        if (!place.geometry) {
            input.placeholder = "Enter a location";
            return;
        }
        
        // Store the selected position
        userPosition = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
        };
        
        // Center map on the selected location and update nearby cars
        if (map) {
            map.setCenter(userPosition);
            loadNearbyCars();
        }
    });
    
    // Initialize time selectors
    initializeTimeSelectors();
}

// Initialize time selectors with proper options
function initializeTimeSelectors() {
    const hoursSelect = document.getElementById('pickup-time-hours');
    const hoursSelectDuration = document.getElementById('duration-hours');
    
    // Clear existing options
    hoursSelect.innerHTML = '';
    hoursSelectDuration.innerHTML = '';
    
    // Add hours options (0-23)
    for (let i = 0; i < 24; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i.toString().padStart(2, '0');
        hoursSelect.appendChild(option.cloneNode(true));
        
        // For duration, we want to show just the number
        const durationOption = document.createElement('option');
        durationOption.value = i;
        durationOption.textContent = i;
        hoursSelectDuration.appendChild(durationOption);
    }
    
    // Set default duration to 1 hour
    document.getElementById('duration-hours').value = "1";
    
    // Set up validation for form
    setupFormValidation();
}

// Setup validation for the search form
function setupFormValidation() {
    const searchBtn = document.getElementById('search-btn');
    const locationInput = document.getElementById('location-input');
    const pickupDate = document.getElementById('pickup-date');
    const pickupHoursSelect = document.getElementById('pickup-time-hours');
    const pickupMinutesSelect = document.getElementById('pickup-time-minutes');
    
    // Function to check if form is valid
    function checkFormValidity() {
        const isValid = locationInput.value.trim() !== '' && 
                      pickupDate.value !== '';
        
        searchBtn.disabled = !isValid;
        return isValid;
    }
    
    // Add event listeners for form validation
    locationInput.addEventListener('input', checkFormValidity);
    pickupDate.addEventListener('change', checkFormValidity);
    pickupHoursSelect.addEventListener('change', checkFormValidity);
    pickupMinutesSelect.addEventListener('change', checkFormValidity);
    
    // Initial validation
    checkFormValidity();
}

// Search for cars based on the form inputs
function searchCars() {
    const locationInput = document.getElementById('location-input').value;
    const pickupDate = document.getElementById('pickup-date').value;
    const pickupHours = document.getElementById('pickup-time-hours').value;
    const pickupMinutes = document.getElementById('pickup-time-minutes').value;
    const durationDays = document.getElementById('duration-days').value;
    const durationHours = document.getElementById('duration-hours').value;
    const durationMinutes = document.getElementById('duration-minutes').value;
    
    if (!locationInput || !pickupDate) {
        alert("Please fill in all required fields to search for cars.");
        return;
    }
    
    // Calculate total duration in minutes
    const totalDuration = 
        (parseInt(durationDays) * 24 * 60) +
        (parseInt(durationHours) * 60) +
        parseInt(durationMinutes);
    
    if (totalDuration <= 0) {
        alert("Please select a valid duration.");
        return;
    }
    
    // Format time for storage
    const formattedTime = `${pickupHours.toString().padStart(2, '0')}:${pickupMinutes.toString().padStart(2, '0')}`;
    
    // Store search parameters in session storage
    const searchParams = {
        location: locationInput,
        pickupDate,
        pickupHours,
        pickupMinutes,
        formattedTime,
        durationDays,
        durationHours,
        durationMinutes,
        totalDurationMinutes: totalDuration
    };
    
    sessionStorage.setItem('carSearchParams', JSON.stringify(searchParams));
    
    // If we have user position from the map, store that too
    if (userPosition) {
        sessionStorage.setItem('userMapPosition', JSON.stringify(userPosition));
    }
    
    // Navigate to search results page
    window.location.href = "user-search-results.html";
}

// Get current location
function getCurrentLocation() {
    if (navigator.geolocation) {
        const locationInput = document.getElementById('location-input');
        
        locationInput.value = "Getting your location...";
        locationInput.disabled = true;
        
        navigator.geolocation.getCurrentPosition(
            // Success callback
            async (position) => {
                userPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Reverse geocode to get address
                try {
                    const geocoder = new google.maps.Geocoder();
                    const results = await new Promise((resolve, reject) => {
                        geocoder.geocode({ location: userPosition }, (results, status) => {
                            if (status === "OK" && results[0]) {
                                resolve(results);
                            } else {
                                reject(status);
                            }
                        });
                    });
                    
                    locationInput.value = results[0].formatted_address;
                } catch (error) {
                    locationInput.value = `${userPosition.lat.toFixed(4)}, ${userPosition.lng.toFixed(4)}`;
                }
                
                // Update map and nearby cars
                if (map) {
                    map.setCenter(userPosition);
                    loadNearbyCars();
                }
                
                locationInput.disabled = false;
            },
            // Error callback
            (error) => {
                console.error("Geolocation error:", error);
                alert("Unable to get your location. Please enter it manually.");
                locationInput.value = "";
                locationInput.disabled = false;
            },
            // Options
            { maximumAge: 60000, timeout: 10000, enableHighAccuracy: true }
        );
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}

// Load nearby cars
async function loadNearbyCars() {
    console.log("Loading nearby cars...");
    const nearbyCarsContainer = document.getElementById('nearby-cars');
    
    try {
        // Show loading state
        nearbyCarsContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Finding cars near you...</p></div>';
        
        // Get all cars, regardless of status initially (for debugging)
        const carsSnapshot = await getDocs(collection(db, 'cars'));
        
        console.log(`Found ${carsSnapshot.size} total cars in database`);
        
        // Log each car for debugging
        carsSnapshot.forEach(doc => {
            const carData = doc.data();
            console.log(`Car ${doc.id}:`, carData);
            console.log(`- Status: ${carData.status}`);
            console.log(`- Has location: ${Boolean(carData.current_location)}`);
            if (carData.current_location) {
                console.log(`- Location: ${carData.current_location.latitude}, ${carData.current_location.longitude}`);
            }
        });
        
        if (carsSnapshot.empty) {
            console.log("No cars found in database");
            nearbyCarsContainer.innerHTML = '<div class="empty-state"><i class="bi bi-car-front"></i><p>No cars available at the moment</p></div>';
            return;
        }
        
        // Process only available cars with location data
        nearbyCarsList = [];
        let availableCount = 0;
        let withLocationCount = 0;
        
        for (const carDoc of carsSnapshot.docs) {
            const carData = carDoc.data();
            
            // Count available cars
            if (carData.status === 'available') {
                availableCount++;
                
                // Count cars with location data
                if (carData.current_location && 
                    carData.current_location.latitude !== undefined && 
                    carData.current_location.longitude !== undefined) {
                    withLocationCount++;
                    
                    // Get model details if available
                    let modelData = {};
                    if (carData.model_id) {
                        try {
                            const modelDoc = await getDoc(doc(db, 'models', carData.model_id));
                            if (modelDoc.exists()) {
                                modelData = modelDoc.data();
                            }
                        } catch (e) {
                            console.error("Error fetching model data:", e);
                        }
                    }
                    
                    // Calculate distance if user position is available
                    let distance = null;
                    if (userPosition) {
                        distance = calculateDistance(
                            userPosition.lat,
                            userPosition.lng,
                            carData.current_location.latitude,
                            carData.current_location.longitude
                        );
                    }
                    
                    // Add to cars list with more explicit fallbacks
                    nearbyCarsList.push({
                        id: carDoc.id,
                        ...carData,
                        make: modelData.make || carData.make || 'Unknown',
                        modelName: modelData.model || carData.car_type || 'Unknown',
                        image: modelData.image_url || 
                               `../static/assets/images/${(carData.car_type || 'sedan').toLowerCase()}.jpg`,
                        distance: distance
                    });
                }
            }
        }
        
        console.log(`Found ${availableCount} available cars`);
        console.log(`Found ${withLocationCount} available cars with location data`);
        console.log(`Added ${nearbyCarsList.length} cars to display`);
        
        // Sort cars by distance if available
        if (nearbyCarsList.some(car => car.distance !== null)) {
            nearbyCarsList.sort((a, b) => {
                if (a.distance === null) return 1;
                if (b.distance === null) return -1;
                return a.distance - b.distance;
            });
        }
        
        // Clear container
        nearbyCarsContainer.innerHTML = '';
        
        // If no available cars were found
        if (nearbyCarsList.length === 0) {
            console.log("No available cars with location data found");
            nearbyCarsContainer.innerHTML = '<div class="empty-state"><i class="bi bi-car-front"></i><p>No available cars found nearby</p></div>';
        } else {
            // Display cars
            nearbyCarsList.forEach(car => {
                const carElement = createCarElement(car);
                nearbyCarsContainer.appendChild(carElement);
            });
            
            // Initialize map with car locations
            console.log("Initializing map with", nearbyCarsList.length, "cars");
            initializeMap(nearbyCarsList);
        }
        
    } catch (error) {
        console.error("Error loading cars:", error);
        nearbyCarsContainer.innerHTML = '<div class="error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load cars. Please try again.</p></div>';
    }
}

// Calculate distance between two points (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// Create car element
function createCarElement(car) {
    const carEl = document.createElement('div');
    carEl.className = 'car-card';
    carEl.dataset.type = car.car_type ? car.car_type.toLowerCase() : 'unknown';
    
    // Prepare distance display
    let distanceDisplay = '';
    if (car.distance !== null) {
        distanceDisplay = `<span class="car-distance"><i class="bi bi-geo"></i> ${car.distance.toFixed(1)} km</span>`;
    }
    
    // Prepare price display
    const priceDisplay = car.price_per_hour ? `$${car.price_per_hour.toFixed(2)}/hour` : 'Price not available';
    
    // Create HTML content
    carEl.innerHTML = `
        <div class="car-image">
            <img src="${car.image}" alt="${car.modelName}" onerror="this.src='../static/assets/images/car-placeholder.jpg';">
        </div>
        <div class="car-info">
            <div class="car-header">
                <h3>${car.make} ${car.modelName}</h3>
                <div class="car-type-badge">${car.car_type || 'Standard'}</div>
            </div>
            <div class="car-meta">
                ${distanceDisplay}
                <span class="car-price">${priceDisplay}</span>
            </div>
            <p class="car-location">
                <i class="bi bi-geo-alt"></i> 
                ${car.address || 'Location not available'}
            </p>
            <a href="user-car-details.html?id=${car.id}" class="view-details-btn">
                View Details <i class="bi bi-arrow-right"></i>
            </a>
        </div>
    `;
    
    return carEl;
}

// Initialize map with car markers
function initializeMap(cars) {
    console.log("Initializing map with cars:", cars);
    
    // Check if the map element exists
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error("Map element not found");
        return;
    }
    
    // Make sure the map element has dimensions
    if (mapElement.offsetWidth === 0 || mapElement.offsetHeight === 0) {
        console.log("Map container has zero dimensions. Setting height.");
        mapElement.style.height = '400px';
    }
    
    // Default center (Singapore)
    let mapCenter = { lat: 1.3521, lng: 103.8198 };
    console.log("Default map center:", mapCenter);
    
    // If user position is available, use that as center
    if (userPosition) {
        mapCenter = userPosition;
        console.log("Using user position as center:", mapCenter);
    } 
    // Otherwise use first car's position if available
    else if (cars.length > 0 && cars[0].current_location) {
        mapCenter = {
            lat: cars[0].current_location.latitude,
            lng: cars[0].current_location.longitude
        };
        console.log("Using first car position as center:", mapCenter);
    }
    
    // Clear existing markers if any
    if (markers && markers.length > 0) {
        console.log("Clearing", markers.length, "existing markers");
        markers.forEach(marker => marker.setMap(null));
    }
    markers = [];
    
    // Initialize map if not already
    if (!map) {
        console.log("Creating new map instance");
        try {
            map = new google.maps.Map(mapElement, {
                center: mapCenter,
                zoom: 13,
                mapTypeControl: false,
                fullscreenControl: false,
                streetViewControl: false
            });
            console.log("Map created successfully");
        } catch (error) {
            console.error("Error creating map:", error);
            return;
        }
    } else {
        console.log("Reusing existing map instance");
        map.setCenter(mapCenter);
    }
    
    // Add user location marker if available
    if (userPosition) {
        console.log("Adding user marker at:", userPosition);
        try {
            const userMarker = new google.maps.Marker({
                position: userPosition,
                map: map,
                title: "Your Location",
                icon: {
                    url: '../static/assets/images/user-marker.png',
                    scaledSize: new google.maps.Size(32, 32)
                },
                zIndex: 1000 // Keep user marker on top
            });
            markers.push(userMarker);
        } catch (error) {
            console.error("Error adding user marker:", error);
        }
    }
    
    // Add markers for each car
    const bounds = new google.maps.LatLngBounds();
    
    // If user position exists, extend bounds
    if (userPosition) {
        bounds.extend(userPosition);
    }
    
    console.log("Adding", cars.length, "car markers");
    
    cars.forEach((car, index) => {
        if (car.current_location) {
            const position = {
                lat: car.current_location.latitude,
                lng: car.current_location.longitude
            };
            
            console.log(`Adding marker for car ${index + 1}:`, position);
            
            try {
                const marker = new google.maps.Marker({
                    position: position,
                    map: map,
                    title: `${car.make} ${car.modelName}`,
                    icon: {
                        url: '../static/assets/images/car-marker.png',
                        scaledSize: new google.maps.Size(32, 32)
                    }
                });
                
                markers.push(marker);
                
                // Info window for the marker
                const infoWindow = new google.maps.InfoWindow({
                    content: `
                        <div class="map-info-window">
                            <h4>${car.make} ${car.modelName}</h4>
                            <p>${car.address || 'Location not available'}</p>
                            <a href="user-car-details.html?id=${car.id}" class="info-window-link">View Details</a>
                        </div>
                    `
                });
                
                marker.addListener('click', () => {
                    infoWindow.open(map, marker);
                });
                
                // Extend bounds to include this marker
                bounds.extend(position);
            } catch (error) {
                console.error(`Error adding marker for car ${index + 1}:`, error);
            }
        } else {
            console.warn(`Car ${index + 1} has no location data`);
        }
    });
    
    // If we have markers, fit the map to their bounds
    if (markers.length > 0) {
        console.log("Fitting map to bounds with", markers.length, "markers");
        try {
            map.fitBounds(bounds);
            
            // Don't zoom in too much
            const listener = google.maps.event.addListener(map, 'idle', () => {
                if (map.getZoom() > 15) {
                    console.log("Limiting zoom level to 15");
                    map.setZoom(15);
                }
                google.maps.event.removeListener(listener);
            });
        } catch (error) {
            console.error("Error fitting bounds:", error);
        }
    } else {
        console.warn("No markers to fit bounds");
    }
}

// Filter nearby cars by type
function filterNearbyCars() {
    const filterValue = document.getElementById('car-type-filter').value.toLowerCase();
    const carCards = document.querySelectorAll('#nearby-cars .car-card');
    
    carCards.forEach(card => {
        const cardType = card.dataset.type;
        
        if (filterValue === 'all' || cardType === filterValue) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
    
    // Also filter map markers
    if (map && markers.length > 0) {
        // Filter visible cars
        const visibleCars = filterValue === 'all' 
            ? nearbyCarsList 
            : nearbyCarsList.filter(car => car.car_type && car.car_type.toLowerCase() === filterValue);
        
        // Clear existing markers
        markers.forEach(marker => marker.setMap(null));
        markers = [];
        
        // Add user location marker if available
        if (userPosition) {
            const userMarker = new google.maps.Marker({
                position: userPosition,
                map: map,
                title: "Your Location",
                icon: {
                    url: '../static/assets/images/user-marker.png',
                    scaledSize: new google.maps.Size(32, 32)
                },
                zIndex: 1000
            });
            markers.push(userMarker);
        }
        
        // Add markers for filtered cars
        const bounds = new google.maps.LatLngBounds();
        if (userPosition) bounds.extend(userPosition);
        
        visibleCars.forEach(car => {
            if (car.current_location) {
                const position = {
                    lat: car.current_location.latitude,
                    lng: car.current_location.longitude
                };
                
                const marker = new google.maps.Marker({
                    position: position,
                    map: map,
                    title: `${car.make} ${car.modelName}`,
                    icon: {
                        url: '../static/assets/images/car-marker.png',
                        scaledSize: new google.maps.Size(32, 32)
                    }
                });
                
                markers.push(marker);
                
                // Info window for the marker
                const infoWindow = new google.maps.InfoWindow({
                    content: `
                        <div class="map-info-window">
                            <h4>${car.make} ${car.modelName}</h4>
                            <p>${car.address || 'Location not available'}</p>
                            <a href="user-car-details.html?id=${car.id}" class="info-window-link">View Details</a>
                        </div>
                    `
                });
                
                marker.addListener('click', () => {
                    infoWindow.open(map, marker);
                });
                
                bounds.extend(position);
            }
        });
        
        // If we have markers, fit the map to their bounds
        if (markers.length > 1) { // More than just the user marker
            map.fitBounds(bounds);
        }
    }
}