// static/js/user/map-handler.js
import { db, auth } from '../common/firebase-config.js';
import { getDocs, collection, query, where, GeoPoint } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

class MapHandler {
    constructor() {
        this.map = null;
        this.userPosition = null;
        this.markers = [];
        this.cars = [];
        this.selectedCarType = 'all';
        this.infoWindow = null;
        this.nearbyCarsList = document.getElementById('nearby-cars');
        this.mapElement = document.getElementById('map');
        this.maxDistance = 10; // Default 10km radius
    }

    async initMap() {
        // Default position (can be a city center or use Singapore coordinates)
        const defaultPosition = { lat: 1.3521, lng: 103.8198 }; // Singapore

        // Create map
        this.map = new google.maps.Map(this.mapElement, {
            center: defaultPosition,
            zoom: 13,
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ],
            mapTypeControl: false,
            fullscreenControl: true,
            streetViewControl: false
        });

        // Initialize info window
        this.infoWindow = new google.maps.InfoWindow();

        // Try to get user's location
        await this.getUserLocation();
        
        // Initialize event listeners
        this.initListeners();
        
        // Load cars from database
        await this.loadCarsFromFirebase();
    }

    async getUserLocation() {
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 0
                    });
                });

                this.userPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                // Center map on user location
                this.map.setCenter(this.userPosition);

                // Add marker for user location
                new google.maps.Marker({
                    position: this.userPosition,
                    map: this.map,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: '#4285F4',
                        fillOpacity: 1,
                        strokeColor: '#FFFFFF',
                        strokeWeight: 2,
                        scale: 8
                    },
                    title: 'Your Location'
                });

                return this.userPosition;
            } catch (error) {
                console.error('Error getting user location:', error);
                return null;
            }
        } else {
            console.warn('Geolocation is not supported by this browser.');
            return null;
        }
    }

    initListeners() {
        // Listen for car type filter changes
        document.addEventListener('filterCars', (event) => {
            this.selectedCarType = event.detail.carType;
            this.updateCarMarkers();
        });

        // Manual filter selection via dropdown
        const carTypeFilter = document.getElementById('car-type-filter');
        if (carTypeFilter) {
            carTypeFilter.addEventListener('change', () => {
                this.selectedCarType = carTypeFilter.value;
                this.updateCarMarkers();
            });
        }

        // Listen for window resize events to ensure the map displays correctly
        window.addEventListener('resize', () => {
            if (this.map) {
                google.maps.event.trigger(this.map, 'resize');
            }
        });
    }

    async loadCarsFromFirebase() {
        try {
            // Show loading state
            if (this.nearbyCarsList) {
                this.nearbyCarsList.innerHTML = '<div class="loading-indicator">Loading nearby cars...</div>';
            }

            // Get cars from Firebase
            const carsSnapshot = await getDocs(collection(db, 'cars'));
            this.cars = [];

            carsSnapshot.forEach(doc => {
                const car = doc.data();
                
                // Skip cars that are not available
                if (car.status !== 'available') return;
                
                // Add car to our array with its ID
                this.cars.push({
                    id: doc.id,
                    ...car
                });
            });

            // Display cars on the map and list
            await this.updateCarMarkers();
            
        } catch (error) {
            console.error('Error loading cars from Firebase:', error);
            if (this.nearbyCarsList) {
                this.nearbyCarsList.innerHTML = '<div class="error-message">Failed to load nearby cars. Please try again.</div>';
            }
        }
    }

    async updateCarMarkers() {
        // Clear existing markers
        this.markers.forEach(marker => marker.setMap(null));
        this.markers = [];

        // Clear car list
        if (this.nearbyCarsList) {
            this.nearbyCarsList.innerHTML = '';
        }

        // If no user position, try to get it again
        if (!this.userPosition) {
            await this.getUserLocation();
        }

        let visibleCars = 0;
        const carListItems = [];

        // Filter and display cars
        for (const car of this.cars) {
            // Skip if car doesn't have location data
            if (!car.current_location || !car.current_location.latitude || !car.current_location.longitude) {
                continue;
            }

            // Apply car type filter
            if (this.selectedCarType !== 'all' && car.car_type.toLowerCase() !== this.selectedCarType.toLowerCase()) {
                continue;
            }

            const carLatLng = {
                lat: car.current_location.latitude,
                lng: car.current_location.longitude
            };

            // Calculate distance from user (if user position available)
            let distance = null;
            if (this.userPosition) {
                distance = this.calculateDistance(
                    this.userPosition.lat, 
                    this.userPosition.lng, 
                    carLatLng.lat, 
                    carLatLng.lng
                );

                // Skip if too far away
                if (distance > this.maxDistance) {
                    continue;
                }
            }

            visibleCars++;

            // Create a marker for the car
            const marker = new google.maps.Marker({
                position: carLatLng,
                map: this.map,
                title: `${car.car_type} - ${car.license_plate}`,
                icon: {
                    url: `../static/assets/images/car-marker.png`, // Replace with actual car icon path
                    scaledSize: new google.maps.Size(32, 32)
                }
            });

            // Add click listener to marker
            marker.addListener('click', () => {
                this.showCarInfoWindow(marker, car, distance);
            });

            this.markers.push(marker);

            // Add to car list if element exists
            if (this.nearbyCarsList) {
                carListItems.push(this.createCarListItem(car, distance));
            }
        }

        // Add car list items to DOM
        if (this.nearbyCarsList) {
            if (visibleCars > 0) {
                carListItems.forEach(item => {
                    this.nearbyCarsList.appendChild(item);
                });
            } else {
                this.nearbyCarsList.innerHTML = '<div class="empty-state">No available cars found nearby</div>';
            }
        }

        // Adjust map to show all markers if there are any and user position
        if (this.markers.length > 0) {
            this.fitMapBounds();
        }
    }

    showCarInfoWindow(marker, car, distance) {
        // Create content for info window
        const content = `
            <div class="car-info-window">
                <h3>${car.car_type}</h3>
                <p>License: ${car.license_plate}</p>
                <p>Color: ${car.car_color}</p>
                <p>Seats: ${car.seating_capacity}</p>
                <p>Fuel: ${car.fuel_type}</p>
                ${distance ? `<p>Distance: ${distance.toFixed(1)} km</p>` : ''}
                <button onclick="window.location.href='user-car-details.html?id=${car.id}'" class="info-button">View Details</button>
            </div>
        `;
        
        this.infoWindow.setContent(content);
        this.infoWindow.open(this.map, marker);
    }

    createCarListItem(car, distance) {
        const carDiv = document.createElement('div');
        carDiv.className = 'car-card';
        
        // Define image path (you might want to use actual car images)
        const imageSrc = `../static/assets/images/${car.car_type.toLowerCase()}.jpg`;
        
        carDiv.innerHTML = `
            <img src="${imageSrc}" alt="${car.car_type}" onerror="this.src='../static/assets/images/car-placeholder.jpg'">
            <div class="car-info">
                <div class="car-title">${car.car_type}</div>
                <div class="car-location">
                    <i class="bi bi-geo-alt"></i>
                    <span>${distance ? `${distance.toFixed(1)} km away` : car.address}</span>
                </div>
                <div>
                    <i class="bi bi-fuel-pump"></i> ${car.fuel_type}
                    <i class="bi bi-people"></i> ${car.seating_capacity} seats
                </div>
                <div class="car-price">$8.50/hour</div>
            </div>
            <div class="card-actions">
                <a href="user-car-details.html?id=${car.id}" class="secondary-btn">View Details</a>
                <button class="primary-btn" onclick="window.bookCar('${car.id}')">Book Now</button>
            </div>
        `;
        
        return carDiv;
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        // Haversine formula to calculate distance between two points
        const R = 6371; // Radius of the earth in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
            
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c; // Distance in km
        return distance;
    }

    deg2rad(deg) {
        return deg * (Math.PI/180);
    }

    fitMapBounds() {
        if (this.markers.length === 0) return;

        const bounds = new google.maps.LatLngBounds();
        
        // Add user position to bounds if available
        if (this.userPosition) {
            bounds.extend(this.userPosition);
        }
        
        // Add all markers to bounds
        this.markers.forEach(marker => {
            bounds.extend(marker.getPosition());
        });
        
        // Fit the map to the bounds
        this.map.fitBounds(bounds);
        
        // Don't zoom in too far
        if (this.map.getZoom() > 15) {
            this.map.setZoom(15);
        }
    }

    // Public method to center the map on a specific location
    centerMap(latitude, longitude) {
        if (this.map) {
            this.map.setCenter({ lat: latitude, lng: longitude });
            this.map.setZoom(15);
        }
    }

    // Public method to update the max distance filter
    setMaxDistance(distance) {
        this.maxDistance = distance;
        this.updateCarMarkers();
    }
}

// Create and export a singleton instance
const mapHandler = new MapHandler();

// Initialize map when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Wait for Google Maps to be loaded
        if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
            console.error('Google Maps API not loaded');
            return;
        }

        await mapHandler.initMap();
    } catch (error) {
        console.error('Error initializing map:', error);
    }
});

// Expose functions to window object for HTML onclick handlers
window.centerMapOnLocation = (latitude, longitude) => {
    mapHandler.centerMap(latitude, longitude);
};

window.bookCar = (carId) => {
    // Redirect to booking page with car ID
    window.location.href = `user-book-car.html?id=${carId}`;
};

export default mapHandler;