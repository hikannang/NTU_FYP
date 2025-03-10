// user-search-results.js
import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc, getDocs, collection, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let userId;
let userPosition;
let map;
let markers = [];
let carResults = [];
let searchParams;
let originalResults = [];

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const resultsContainer = document.getElementById('results-container');
const errorMessage = document.getElementById('error-message');
const carListContainer = document.getElementById('car-list');
const filtersContainer = document.getElementById('filters-container');
const searchSummary = document.getElementById('search-summary');
const noResultsMessage = document.getElementById('no-results');
const sortSelect = document.getElementById('sort-select');
const filterToggle = document.getElementById('filter-toggle');
const viewToggle = document.getElementById('view-toggle');
const mapViewButton = document.getElementById('map-view-btn');
const listViewButton = document.getElementById('list-view-btn');
const carTypesContainer = document.getElementById('car-type-filters');
const priceRangeSlider = document.getElementById('price-range');
const mapContainer = document.getElementById('map-container');

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html').then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html').then(response => response.text());
    
    // Setup logout button
    setupLogoutButton();
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            
            // Get search parameters from session storage
            const storedParams = sessionStorage.getItem('carSearchParams');
            userPosition = sessionStorage.getItem('userMapPosition') ? 
                JSON.parse(sessionStorage.getItem('userMapPosition')) : null;
            
            if (!storedParams) {
                showError("No search parameters found. Please try searching again.");
                setTimeout(() => {
                    window.location.href = "user-dashboard.html";
                }, 2000);
                return;
            }
            
            searchParams = JSON.parse(storedParams);
            updateSearchSummary(searchParams);
            
            // Show loading state
            showLoading(true);
            
            // Initialize search filters
            initializeFilters();
            
            // Load car search results
            await loadSearchResults();
            
            // Setup event listeners
            setupEventListeners();
            
        } else {
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
});

// Setup logout button
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

// Update search summary display
function updateSearchSummary(params) {
    if (!searchSummary) return;
    
    // Format date for display
    const date = new Date(params.pickupDate);
    const formattedDate = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    
    // Create the summary text
    const timeString = params.formattedTime;
    const duration = calculateDurationText(params.durationDays, params.durationHours, params.durationMinutes);
    
    searchSummary.innerHTML = `
        <div class="summary-item">
            <i class="bi bi-geo-alt"></i>
            <span>${params.location}</span>
        </div>
        <div class="summary-item">
            <i class="bi bi-calendar-event"></i>
            <span>${formattedDate} at ${timeString}</span>
        </div>
        <div class="summary-item">
            <i class="bi bi-clock"></i>
            <span>${duration}</span>
        </div>
        <a href="user-dashboard.html" class="modify-search-btn">
            <i class="bi bi-pencil"></i> Modify Search
        </a>
    `;
}

// Format duration text
function calculateDurationText(days, hours, minutes) {
    let durationText = '';
    
    if (parseInt(days) > 0) {
        durationText += `${days} day${parseInt(days) > 1 ? 's' : ''} `;
    }
    
    if (parseInt(hours) > 0) {
        durationText += `${hours} hour${parseInt(hours) > 1 ? 's' : ''} `;
    }
    
    if (parseInt(minutes) > 0) {
        durationText += `${minutes} minute${parseInt(minutes) > 1 ? 's' : ''}`;
    }
    
    return durationText.trim() || '0 minutes';
}

// Initialize search filters
function initializeFilters() {
    // Car type filters from unique values in results
    populateCarTypeFilters();
    
    // Setup price range slider
    setupPriceRangeSlider();
}

// Populate car type filter checkboxes
function populateCarTypeFilters() {
    if (!carTypesContainer) return;
    
    const carTypes = ['Sedan', 'SUV', 'Hatchback', 'Luxury', 'Compact'];
    
    carTypes.forEach(type => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';
        filterItem.innerHTML = `
            <input type="checkbox" id="type-${type.toLowerCase()}" class="car-type-filter" value="${type.toLowerCase()}">
            <label for="type-${type.toLowerCase()}">${type}</label>
        `;
        carTypesContainer.appendChild(filterItem);
    });
}

// Setup price range slider
function setupPriceRangeSlider() {
    if (!priceRangeSlider) return;
    
    // Will be initialized after results are loaded to get min/max values
}

// Load search results
async function loadSearchResults() {
    await debugDatabase();
    try {
        showLoading(true);
        
        // Get all cars
        const carsSnapshot = await getDocs(collection(db, 'cars'));
        
        if (carsSnapshot.empty) {
            showNoResults();
            return;
        }
        
        // Process car data
        carResults = [];
        
        // Create date objects from search parameters
        const requestedStart = new Date(searchParams.startDateTime);
        const requestedEnd = new Date(searchParams.endDateTime);
        
        for (const carDoc of carsSnapshot.docs) {
            const carData = carDoc.data();
            console.log(`Processing car ${carDoc.id}:`, JSON.stringify(carData));
            
            // Add more defensive status check (case insensitive)
            if (carData.status && carData.status.toLowerCase() === 'available') {
                
                // Add more detailed location validation
                if (carData.current_location && 
                    typeof carData.current_location.latitude === 'number' && 
                    typeof carData.current_location.longitude === 'number' &&
                    !isNaN(carData.current_location.latitude) && 
                    !isNaN(carData.current_location.longitude)) {
                    
                    // Use car_type for model lookup instead of model_id
                    let modelData = {};
                    if (carData.car_type) {
                        try {
                            // Try both potential collections
                            let modelDoc = await getDoc(doc(db, 'models', carData.car_type));
                            
                            if (!modelDoc.exists()) {
                                modelDoc = await getDoc(doc(db, 'car_models', carData.car_type));
                            }
                            
                            if (modelDoc.exists()) {
                                modelData = modelDoc.data();
                                console.log(`Found model data for ${carData.car_type}:`, modelData);
                            } else {
                                console.log(`No model data found for ${carData.car_type}`);
                            }
                        } catch (e) {
                            console.error(`Error fetching model data for ${carData.car_type}:`, e);
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
                    
                    // Add default price_per_hour if missing
                    if (!carData.price_per_hour) {
                        carData.price_per_hour = 15; // Default hourly price
                        console.log(`No price_per_hour for car ${carDoc.id}, using default:`, carData.price_per_hour);
                    }
                    
                    // Calculate total price for the booking
                    const totalHours = searchParams.totalDurationMinutes / 60;
                    const totalPrice = carData.price_per_hour * totalHours;
                    
                    // Add to results with correct attributes
                    carResults.push({
                        id: carDoc.id,
                        ...carData,
                        make: modelData.make || carData.car_type || 'Unknown',
                        modelName: modelData.name || modelData.model || carData.car_type || 'Unknown',
                        image: modelData.image_url || 
                               `../static/assets/images/${(carData.car_type || 'sedan').toLowerCase()}.jpg`,
                        distance: distance,
                        totalPrice: totalPrice,
                        price_per_hour: carData.price_per_hour
                    });
                    
                    console.log(`Added car ${carDoc.id} to results`);
                } else {
                    console.log(`Car ${carDoc.id} has invalid location data:`, carData.current_location);
                }
            } else {
                console.log(`Car ${carDoc.id} is not available. Status:`, carData.status);
            }
        }
        
        // Store original results for filtering
        originalResults = [...carResults];
        
        // Calculate min/max price for slider
        if (carResults.length > 0) {
            const prices = carResults.map(car => car.price_per_hour || 0);
            const minPrice = Math.floor(Math.min(...prices));
            const maxPrice = Math.ceil(Math.max(...prices));
            
            if (priceRangeSlider) {
                // Setup price slider with noUiSlider (if using) or other slider library
                // This is a placeholder for slider setup
                document.getElementById('min-price').textContent = `$${minPrice}`;
                document.getElementById('max-price').textContent = `$${maxPrice}`;
            }
        }
        
        // Display results
        displayResults();
        
        // Initialize map
        initializeMap();
        
    } catch (error) {
        console.error("Error loading search results:", error);
        showError("Failed to load search results. Please try again.");
    } finally {
        showLoading(false);
    }
}

// Check if car is available during requested time
async function isCarAvailableForBooking(carId, requestedStart, requestedEnd) {
    try {
        // Get existing bookings for this car
        const bookingsRef = collection(db, 'timesheets', carId, 'bookings');
        const bookingsQuery = query(
            bookingsRef,
            where('status', '!=', 'cancelled')
        );
        
        const bookingsSnapshot = await getDocs(bookingsQuery);
        
        if (bookingsSnapshot.empty) {
            return true; // No bookings, so it's available
        }
        
        // Check for conflicts with the requested time
        for (const bookingDoc of bookingsSnapshot.docs) {
            const booking = bookingDoc.data();
            const bookingStart = new Date(booking.start_time.seconds * 1000);
            const bookingEnd = new Date(booking.end_time.seconds * 1000);
            
            // Add buffer time (15 minutes) before and after each booking
            const bufferedStart = new Date(bookingStart.getTime() - 15 * 60000);
            const bufferedEnd = new Date(bookingEnd.getTime() + 15 * 60000);
            
            // Check for overlap
            if (
                (requestedStart >= bufferedStart && requestedStart <= bufferedEnd) ||
                (requestedEnd >= bufferedStart && requestedEnd <= bufferedEnd) ||
                (requestedStart <= bufferedStart && requestedEnd >= bufferedEnd)
            ) {
                return false; // Conflict found
            }
        }
        
        return true; // No conflicts, car is available
    } catch (error) {
        console.error(`Error checking availability for car ${carId}:`, error);
        return false; // Assume not available on error
    }
}

// Display search results
function displayResults() {
    if (!carListContainer) return;
    
    if (carResults.length === 0) {
        showNoResults();
        return;
    }
    
    // Clear container
    carListContainer.innerHTML = '';
    
    // Show results count
    if (noResultsMessage) {
        noResultsMessage.style.display = 'none';
    }
    
    // Create and append car cards
    carResults.forEach(car => {
        const carCard = createCarCard(car);
        carListContainer.appendChild(carCard);
    });
}

// Create car card element
function createCarCard(car) {
    const card = document.createElement('div');
    card.className = 'car-card';
    card.dataset.type = car.car_type ? car.car_type.toLowerCase() : 'unknown';
    
    // Format price display
    const hourlyPrice = car.price_per_hour ? `$${car.price_per_hour.toFixed(2)}/hour` : 'Price not available';
    const totalPrice = car.totalPrice ? `$${car.totalPrice.toFixed(2)}` : 'Price not available';
    
    // Format distance display
    let distanceDisplay = '';
    if (car.distance !== null) {
        distanceDisplay = `<span class="distance"><i class="bi bi-geo-alt"></i> ${car.distance.toFixed(1)} km away</span>`;
    }
    
    // Create card content
    card.innerHTML = `
        <div class="car-image">
            <img src="${car.image}" alt="${car.modelName}" onerror="this.src='../static/assets/images/car-placeholder.jpg'">
        </div>
        <div class="card-content">
            <div class="car-info">
                <div class="car-header">
                    <h3>${car.make} ${car.modelName}</h3>
                    <div class="car-type-badge">${car.car_type || 'Standard'}</div>
                </div>
                <div class="car-features">
                    <span><i class="bi bi-people"></i> ${car.seating_capacity || '5'} seats</span>
                    <span><i class="bi bi-fuel-pump"></i> ${car.fuel_type || 'Petrol'}</span>
                </div>
                ${distanceDisplay}
                <p class="address"><i class="bi bi-pin-map"></i> ${car.address || 'Location not available'}</p>
            </div>
            <div class="car-price-section">
                <div class="price-details">
                    <span class="price-rate">${hourlyPrice}</span>
                    <span class="total-price">Total: ${totalPrice}</span>
                </div>
                <a href="user-car-details.html?id=${car.id}" class="view-details-btn">
                    View Details
                </a>
            </div>
        </div>
    `;
    
    return card;
}

// Initialize Google Map
function initializeMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    
    // Default center (Singapore)
    let mapCenter = { lat: 1.3521, lng: 103.8198 };
    
    // Use user position or first car position if available
    if (userPosition && userPosition.lat && userPosition.lng) {
        mapCenter = userPosition;
    } else if (carResults.length > 0 && carResults[0].current_location) {
        mapCenter = {
            lat: carResults[0].current_location.latitude,
            lng: carResults[0].current_location.longitude
        };
    }
    
    // Create map
    map = new google.maps.Map(mapElement, {
        center: mapCenter,
        zoom: 12,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false
    });
    
    // Add markers for cars
    addMapMarkers();
}

// Add markers to map
function addMapMarkers() {
    if (!map) return;
    
    // Clear existing markers
    if (markers.length > 0) {
        markers.forEach(marker => marker.setMap(null));
    }
    markers = [];
    
    // Create bounds for map
    const bounds = new google.maps.LatLngBounds();
    
    // Add user position marker if available
    if (userPosition && userPosition.lat && userPosition.lng) {
        const userMarker = new google.maps.Marker({
            position: userPosition,
            map: map,
            icon: {
                url: '../static/assets/images/user-marker.png',
                scaledSize: new google.maps.Size(32, 32)
            },
            title: 'Your location',
            zIndex: 1000
        });
        markers.push(userMarker);
        bounds.extend(userPosition);
    }
    
    // Add car markers
    carResults.forEach(car => {
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
            
            // Info window for marker
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div class="map-info-window">
                        <h4>${car.make} ${car.modelName}</h4>
                        <p>${car.address || 'Location not available'}</p>
                        <p class="info-price">$${car.price_per_hour ? car.price_per_hour.toFixed(2) : '0.00'}/hour</p>
                        <a href="user-car-details.html?id=${car.id}" class="info-window-btn">View Details</a>
                    </div>
                `
            });
            
            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
            
            markers.push(marker);
            bounds.extend(position);
        }
    });
    
    // Fit map to bounds if we have markers
    if (markers.length > 0) {
        map.fitBounds(bounds);
        
        // Don't zoom in too far
        google.maps.event.addListenerOnce(map, 'idle', () => {
            if (map.getZoom() > 15) map.setZoom(15);
        });
    }
}

// Setup event listeners
function setupEventListeners() {
    // Sort dropdown
    if (sortSelect) {
        sortSelect.addEventListener('change', sortResults);
    }
    
    // Filter toggle button
    if (filterToggle) {
        filterToggle.addEventListener('click', () => {
            filtersContainer.classList.toggle('show-filters');
            
            // Update button icon
            const icon = filterToggle.querySelector('i');
            if (filtersContainer.classList.contains('show-filters')) {
                icon.classList.remove('bi-sliders');
                icon.classList.add('bi-x-lg');
            } else {
                icon.classList.remove('bi-x-lg');
                icon.classList.add('bi-sliders');
            }
        });
    }
    
    // View toggle buttons
    if (mapViewButton && listViewButton) {
        mapViewButton.addEventListener('click', () => {
            showMapView();
            mapViewButton.classList.add('active');
            listViewButton.classList.remove('active');
        });
        
        listViewButton.addEventListener('click', () => {
            showListView();
            listViewButton.classList.add('active');
            mapViewButton.classList.remove('active');
        });
    }
    
    // Car type filter checkboxes
    const carTypeFilters = document.querySelectorAll('.car-type-filter');
    carTypeFilters.forEach(filter => {
        filter.addEventListener('change', filterResults);
    });
    
    // Price range filter
    if (priceRangeSlider) {
        priceRangeSlider.addEventListener('input', filterResults);
    }
    
    // Apply filter button
    const applyFilterBtn = document.getElementById('apply-filter');
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', filterResults);
    }
    
    // Clear filter button
    const clearFilterBtn = document.getElementById('clear-filter');
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', clearFilters);
    }
}

// Sort results
function sortResults() {
    if (!sortSelect || !carResults.length) return;
    
    const sortValue = sortSelect.value;
    
    switch (sortValue) {
        case 'price-asc':
            carResults.sort((a, b) => (a.price_per_hour || 0) - (b.price_per_hour || 0));
            break;
        case 'price-desc':
            carResults.sort((a, b) => (b.price_per_hour || 0) - (a.price_per_hour || 0));
            break;
        case 'distance':
            // Only sort by distance if we have user position
            if (carResults.some(car => car.distance !== null)) {
                carResults.sort((a, b) => {
                    if (a.distance === null) return 1;
                    if (b.distance === null) return -1;
                    return a.distance - b.distance;
                });
            }
            break;
        case 'name-asc':
            carResults.sort((a, b) => `${a.make} ${a.modelName}`.localeCompare(`${b.make} ${b.modelName}`));
            break;
        default:
            break;
    }
    
    displayResults();
}

// Filter results
function filterResults() {
    // Reset to original results
    carResults = [...originalResults];
    
    // Apply type filters
    const selectedTypes = [];
    const typeCheckboxes = document.querySelectorAll('.car-type-filter:checked');
    typeCheckboxes.forEach(checkbox => selectedTypes.push(checkbox.value));
    
    if (selectedTypes.length > 0) {
        carResults = carResults.filter(car => 
            car.car_type && selectedTypes.includes(car.car_type.toLowerCase())
        );
    }
    
    // Apply price filter
    const priceMin = parseInt(document.getElementById('min-price').textContent.replace('$', ''));
    const priceMax = parseInt(document.getElementById('max-price').textContent.replace('$', ''));
    
    if (!isNaN(priceMin) && !isNaN(priceMax)) {
        carResults = carResults.filter(car => 
            (car.price_per_hour || 0) >= priceMin && 
            (car.price_per_hour || 0) <= priceMax
        );
    }
    
    // Update display
    displayResults();
    
    // Update map markers
    addMapMarkers();
    
    // Close filters on mobile after applying
    if (window.innerWidth < 768) {
        filtersContainer.classList.remove('show-filters');
        if (filterToggle && filterToggle.querySelector('i')) {
            filterToggle.querySelector('i').classList.remove('bi-x-lg');
            filterToggle.querySelector('i').classList.add('bi-sliders');
        }
    }
}

// Clear all filters
function clearFilters() {
    // Reset car type checkboxes
    document.querySelectorAll('.car-type-filter').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Reset price range slider
    if (priceRangeSlider) {
        // Reset slider to min/max values
    }
    
    // Reset results to original
    carResults = [...originalResults];
    displayResults();
    addMapMarkers();
}

// Switch to map view
function showMapView() {
    if (mapContainer) mapContainer.style.display = 'block';
    if (carListContainer) carListContainer.style.display = 'none';
    
    // Refresh map size (needed when map was hidden)
    if (map) {
        google.maps.event.trigger(map, 'resize');
        
        // Recenter and fit bounds
        if (markers.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            markers.forEach(marker => {
                bounds.extend(marker.getPosition());
            });
            map.fitBounds(bounds);
            
            // Don't zoom in too far
            if (map.getZoom() > 15) map.setZoom(15);
        }
    }
}

// Switch to list view
function showListView() {
    if (mapContainer) mapContainer.style.display = 'none';
    if (carListContainer) carListContainer.style.display = 'block';
}

// Show loading indicator
function showLoading(isLoading) {
    if (loadingIndicator) {
        loadingIndicator.style.display = isLoading ? 'flex' : 'none';
    }
    
    if (resultsContainer) {
        resultsContainer.style.display = isLoading ? 'none' : 'block';
    }
}

// Show error message
function showError(message) {
    if (errorMessage) {
        const errorText = errorMessage.querySelector('p') || errorMessage;
        if (errorText) errorText.textContent = message;
        errorMessage.style.display = 'flex';
    }
    
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
    
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
    }
}

// Show no results message
function showNoResults() {
    if (noResultsMessage) {
        noResultsMessage.style.display = 'flex';
    }
    
    if (carListContainer) {
        carListContainer.innerHTML = '';
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

// Convert degrees to radians
function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// Add this function at the beginning of loadSearchResults
async function debugDatabase() {
    console.log("==== DATABASE DEBUG INFO ====");
    
    // 1. Check cars collection
    try {
        const carsSnapshot = await getDocs(collection(db, 'cars'));
        console.log(`Found ${carsSnapshot.size} total cars`);
        
        if (carsSnapshot.size > 0) {
            // Sample the first car
            const firstCar = carsSnapshot.docs[0].data();
            console.log("Sample car:", JSON.stringify(firstCar, null, 2));
            
            // Count available cars
            let availableCount = 0;
            let validLocationCount = 0;
            
            carsSnapshot.docs.forEach(doc => {
                const car = doc.data();
                if (car.status && car.status.toLowerCase() === 'available') availableCount++;
                if (car.current_location && 
                    typeof car.current_location.latitude === 'number' && 
                    typeof car.current_location.longitude === 'number') {
                    validLocationCount++;
                }
            });
            
            console.log(`Available cars: ${availableCount}`);
            console.log(`Cars with valid location: ${validLocationCount}`);
        }
    } catch (e) {
        console.error("Error checking cars collection:", e);
    }
    
    // 2. Check models collection
    try {
        const modelsSnapshot = await getDocs(collection(db, 'models'));
        console.log(`Found ${modelsSnapshot.size} models in 'models' collection`);
    } catch (e) {
        console.log("Error or no 'models' collection:", e.message);
    }
    
    // 3. Check car_models collection
    try {
        const carModelsSnapshot = await getDocs(collection(db, 'car_models'));
        console.log(`Found ${carModelsSnapshot.size} models in 'car_models' collection`);
    } catch (e) {
        console.log("Error or no 'car_models' collection:", e.message);
    }
    
    console.log("==== END DEBUG INFO ====");
}

// Call this at the beginning of loadSearchResults
await debugDatabase();