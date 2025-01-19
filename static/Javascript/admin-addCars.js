// Import necessary Firebase modules
import { db } from './firebase-config.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { geocodeAddress } from './location_search/location.js';

// Form submission handler
document.getElementById('add-car-form').addEventListener('submit', async (e) => {
  e.preventDefault(); // Prevent default form submission behavior

  // Collect form data
  const modelId = document.getElementById('car-model').value.trim();
  const address = document.getElementById('car-address').value.trim();
  const latitudeInput = document.getElementById('car-latitude').value.trim();
  const longitudeInput = document.getElementById('car-longitude').value.trim();
  const status = document.getElementById('car-status').value;
  const serviceDue = document.getElementById('service-due').value;
  const insuranceExpiry = document.getElementById('insurance-expiry').value;

  // Validate form data
  if (!modelId || !address || !status || !serviceDue || !insuranceExpiry) {
    alert('Please fill in all required fields.');
    return;
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
    status: status,
    service_due: new Date(serviceDue),
    insurance_expiry: new Date(insuranceExpiry),
  };

  try {
    // If latitude or longitude is missing, geocode the address
    if (isNaN(latitude) || isNaN(longitude)) {
      const location = await geocodeAddress(address);
      carData.current_location.latitude = location.latitude;
      carData.current_location.longitude = location.longitude;
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