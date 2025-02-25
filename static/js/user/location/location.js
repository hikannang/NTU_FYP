// location.js
const GOOGLE_MAPS_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY"; // Replace with your API key

/**
 * Get the user's current location using the Geolocation API.
 * @returns {Promise<{latitude: number, longitude: number}>} The user's current latitude and longitude.
 */
export async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          reject(`Error getting current location: ${error.message}`);
        }
      );
    } else {
      reject("Geolocation is not supported by this browser.");
    }
  });
}

/**
 * Convert an address into latitude and longitude using the Google Maps Geocoding API.
 * @param {string} address - The address to geocode.
 * @returns {Promise<{latitude: number, longitude: number}>} The latitude and longitude of the address.
 */
export async function geocodeAddress(address) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address
      )}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const data = await response.json();
    if (data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
      };
    } else {
      throw new Error("Address not found.");
    }
  } catch (error) {
    throw new Error(`Error geocoding address: ${error.message}`);
  }
}