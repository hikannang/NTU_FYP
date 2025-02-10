// Import necessary Firebase modules
import { db } from './firebase-config.js';
import { collection, doc, getDoc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Geocoding function
async function geocodeAddress(address) {
  // Implement geocoding logic here
}

// Populate car models dropdown
async function populateCarModels() {
  const carTypeSelect = document.getElementById('car-type');
  const carColorInput = document.getElementById('car-color');
  const carSeatsInput = document.getElementById('car-seats');
  const carFuelTypeInput = document.getElementById('car-fuel-type');
  try {
    const carModelsSnapshot = await getDocs(collection(db, 'car_models'));
    carModelsSnapshot.forEach((doc) => {
      const carModel = doc.data();
      const option = document.createElement('option');
      option.value = carModel.name;
      option.textContent = carModel.name;
      carTypeSelect.appendChild(option);
    });

    carTypeSelect.addEventListener('change', () => {
      const selectedModel = carModelsSnapshot.docs.find(doc => doc.data().name === carTypeSelect.value).data();
      carColorInput.value = selectedModel.color;
      carSeatsInput.value = selectedModel.seating_capacity;
      carFuelTypeInput.value = selectedModel.fuel_type;
    });

    // Trigger change event to populate initial values
    carTypeSelect.dispatchEvent(new Event('change'));
  } catch (error) {
    console.error('Error fetching car models:', error);
    alert('Failed to load car models. Please try again.');
  }
}

// Initialize Google Places Autocomplete for the address input
const addressInput = document.getElementById('car-address');
const autocomplete = new google.maps.places.Autocomplete(addressInput, { componentRestrictions: { country: 'SG' } });
autocomplete.addListener('place_changed', () => {
  const place = autocomplete.getPlace();
  if (place.geometry) {
    document.getElementById('car-latitude').value = place.geometry.location.lat();
    document.getElementById('car-longitude').value = place.geometry.location.lng();
  }
});

// Use Current Location Button
document.getElementById('use-current-location').addEventListener('click', async () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      // Populate latitude and longitude fields
      document.getElementById('car-latitude').value = latitude;
      document.getElementById('car-longitude').value = longitude;

      // Reverse geocode to get the address
      const apiUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=YOUR_API_KEY`;
      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        if (data.status === 'OK') {
          document.getElementById('car-address').value = data.results[0].formatted_address;
        } else {
          alert('Failed to retrieve address from coordinates.');
        }
      } catch (error) {
        console.error('Error reverse geocoding:', error);
        alert('Error retrieving address from coordinates.');
      }
    }, (error) => {
      alert('Error retrieving current location: ' + error.message);
    });
  } else {
    alert('Geolocation is not supported by this browser.');
  }
});

// Function to get the next car ID
async function getNextCarID() {
  const carIDDocRef = doc(db, 'metadata', 'carID');
  const carIDDoc = await getDoc(carIDDocRef);
  if (carIDDoc.exists()) {
    const currentID = carIDDoc.data().lastID;
    const nextID = currentID + 1;
    await setDoc(carIDDocRef, { lastID: nextID });
    return nextID;
  } else {
    // If the document does not exist, create it with the initial ID
    await setDoc(carIDDocRef, { lastID: 1 });
    return 1;
  }
}

// Function to create a time sheet for the car
async function createTimeSheet(carID) {
  const timeSheetRef = collection(db, 'time_slots', carID.toString(), 'time_slots');
  const initialTimeSlots = {
    available: [],
    booked: [],
    price_per_slot: 10.0 // Example price per slot
  };

  // Create initial time slots for the car
  await setDoc(doc(timeSheetRef, 'initial'), initialTimeSlots);
}

// Form submission handler
document.getElementById('add-car-form').addEventListener('submit', async (e) => {
  e.preventDefault(); // Prevent default form submission behavior

  // Collect form data
  const address = document.getElementById('car-address').value.trim();
  const latitudeInput = document.getElementById('car-latitude').value.trim();
  const longitudeInput = document.getElementById('car-longitude').value.trim();
  const carType = document.getElementById('car-type').value;
  const carColor = document.getElementById('car-color').value;
  const carSeats = parseInt(document.getElementById('car-seats').value, 10);
  const carFuelType = document.getElementById('car-fuel-type').value;
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

  // If latitude or longitude is missing, geocode the address
  if (isNaN(latitude) || isNaN(longitude)) {
    try {
      document.getElementById('geocoding-status').textContent = 'Geocoding address...';
      const location = await geocodeAddress(address);
      latitude = location.latitude;
      longitude = location.longitude;
      document.getElementById('geocoding-status').textContent = '';
    } catch (error) {
      console.error('Error geocoding address:', error);
      alert('Failed to geocode address. Please try again.');
      return;
    }
  }

  // Prepare car data object
  let carData = {
    address: address,
    current_location: {
      latitude: latitude,
      longitude: longitude,
    },
    car_type: carType,
    car_color: carColor,
    seating_capacity: carSeats,
    fuel_type: carFuelType,
    license_plate: licensePlate,
    status: status,
    service_due: new Date(serviceDue),
    insurance_expiry: new Date(insuranceExpiry),
  };

  try {
    // Get the next car ID
    const carID = await getNextCarID();

    // Add car data to Firestore with carID as the document ID
    await setDoc(doc(db, 'cars', carID.toString()), carData);

    // Create a time sheet for the car
    await createTimeSheet(carID);

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