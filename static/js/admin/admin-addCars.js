import { db, auth } from '../common/firebase-config.js';
import { collection, doc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Function to geocode address
async function geocodeAddress(address) {
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=YOUR_GOOGLE_MAPS_API_KEY`);
  const data = await response.json();
  if (data.status === 'OK') {
    const location = data.results[0].geometry.location;
    return {
      latitude: location.lat,
      longitude: location.lng
    };
  } else {
    throw new Error('Geocoding failed');
  }
}

// Function to create a timesheet for the car
async function createTimeSheet(carID) {
  try {
    // Create an empty timesheet document with the car ID
    const timesheetRef = doc(db, 'timesheets', carID.toString());
    await setDoc(timesheetRef, {});

    console.log(`Timesheet created for car ID: ${carID}`);
  } catch (error) {
    console.error('Error creating timesheet:', error);
    throw new Error('Failed to create timesheet');
  }
}

// Function to get the next car ID
async function getNextCarID() {
  const carsSnapshot = await getDocs(collection(db, 'cars'));
  return carsSnapshot.size + 1; // Assuming car IDs are sequential
}

// Function to populate car models dropdown
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
      const apiUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=YOUR_GOOGLE_MAPS_API_KEY`;
      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        if (data.status === 'OK') {
          const address = data.results[0].formatted_address;
          document.getElementById('car-address').value = address;
        } else {
          throw new Error('Reverse geocoding failed');
        }
      } catch (error) {
        console.error('Error reverse geocoding address:', error);
        alert('Failed to reverse geocode address. Please try again.');
      }
    });
  } else {
    alert('Geolocation is not supported by this browser.');
  }
});

// Function to add a new car
document.getElementById('add-car-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const address = document.getElementById('car-address').value;
  const carType = document.getElementById('car-type').value;
  const carColor = document.getElementById('car-color').value;
  const carSeats = document.getElementById('car-seats').value;
  const carFuelType = document.getElementById('car-fuel-type').value;
  const licensePlate = document.getElementById('car-plate').value;
  const status = document.getElementById('car-status').value;
  const serviceDue = document.getElementById('service-due').value;
  const insuranceExpiry = document.getElementById('insurance-expiry').value;
  const latitudeInput = document.getElementById('car-latitude').value;
  const longitudeInput = document.getElementById('car-longitude').value;

  // Validate license plate
  if (!/^[A-Z0-9]+$/.test(licensePlate)) {
    document.getElementById('car-plate-error').textContent = 'Invalid license plate format';
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

    // Create a timesheet for the car
    await createTimeSheet(carID);

    // Success feedback
    alert('Car added successfully!');
    document.getElementById('add-car-form').reset(); // Reset the form

    // Redirect to admin-dashboard.html
    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error('Error adding car:', error);
    alert('Failed to add car. Please try again.');
  }
});

// Populate car models on page load
populateCarModels();