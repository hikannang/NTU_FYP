// Import necessary Firebase modules
import { db } from './firebase-config.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { geocodeAddress } from './location_search/location.js';

// Populate car models dropdown
async function populateCarModels() {
  const carModelsDropdown = document.getElementById('car-model');
  try {
    const carModelsSnapshot = await getDocs(collection(db, 'car_models'));
    carModelsSnapshot.forEach((doc) => {
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = doc.data().name; // Assuming `name` is a field in `car_models`
      carModelsDropdown.appendChild(option);
    });
  } catch (error) {
    console.error('Error fetching car models:', error);
    alert('Failed to load car models. Please try again.');
  }
}

// Form submission handler
document.getElementById('add-car-form').addEventListener('submit', async (e) => {
  e.preventDefault(); // Prevent default form submission behavior

  // Collect form data
  const modelId = document.getElementById('car-model').value.trim();
  const address = document.getElementById('car-address').value.trim();
  const latitudeInput = document.getElementById('car-latitude').value.trim();
  const longitudeInput = document.getElementById('car-longitude').value.trim();
  const carType = document.getElementById('car-type').value;
  const carSeats = parseInt(document.getElementById('car-seats').value, 10);
  const licensePlate = document.getElementById('car-plate').value.trim();
  const status = document.getElementById('car-status').value;
  const serviceDue = document.getElementById('service-due').value;
  const insuranceExpiry = document.getElementById('insurance-expiry').value;

  // Validate license plate format
  const licensePlatePattern = /^[A-Z]{3}\d{3}[A-Z]?$/; // Example pattern
  if (!licensePlatePattern.test(licensePlate)) {
    document.getElementById('car-plate-error').textContent = 'Invalid license plate format.';
    return;
  } else {
    document.getElementById('car-plate-error').textContent = '';
  }

  // Parse latitude and longitude
  let latitude = parseFloat(latitudeInput);
  let longitude = parseFloat(longitudeInput);

  // Prepare car data object
  let carData = {
    model_id: modelId,
    address: address,
    current_location: {
      latitude: latitude || null,
      longitude: longitude || null,
    },
    fuel_type: carType,
    seating_capacity: carSeats,
    license_plate: licensePlate,
    status: status,
    service_due: new Date(serviceDue),
    insurance_expiry: new Date(insuranceExpiry),
  };

  try {
    // If latitude or longitude is missing, geocode the address
    if (isNaN(latitude) || isNaN(longitude)) {
      document.getElementById('geocoding-status').textContent = 'Geocoding address...';
      const location = await geocodeAddress(address);
      carData.current_location.latitude = location.latitude;
      carData.current_location.longitude = location.longitude;
      document.getElementById('geocoding-status').textContent = '';
    }

    // Add car data to Firestore
    await addDoc(collection(db, 'cars'), carData);

    // Success feedback
    alert('Car added successfully!');
    document.getElementById('add-car-form').reset(); // Reset the form
  } catch (error) {
    console.error('Error adding car:', error);
    alert('Failed to add car. Please try again.');
  }
});

// Populate car models on page load
populateCarModels();