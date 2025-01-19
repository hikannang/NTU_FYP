import { db } from "../firebase-config.js";
import { collection, getDocs, query, where } from "firebase/firestore";
import { calculateDistance } from "./utils.js"; // Utility function for distance calculation

/**
 * Fetch available cars from Firestore and filter them based on location and availability.
 * @param {{latitude: number, longitude: number}} userLocation - The user's latitude and longitude.
 * @param {Date} startDateTime - The start date and time of the booking.
 * @param {number} durationInMinutes - The duration of the booking in minutes.
 * @returns {Promise<Array>} A list of available cars with their details and distance.
 */
export async function fetchAvailableCars(userLocation, startDateTime, durationInMinutes) {
  try {
    const carsRef = collection(db, "cars");
    const carsSnapshot = await getDocs(carsRef);

    const availableCars = [];
    const endDateTime = new Date(startDateTime.getTime() + durationInMinutes * 60000);

    for (const carDoc of carsSnapshot.docs) {
      const carData = carDoc.data();

      // Check availability in the time_slots collection
      const timeSlotsRef = collection(db, "time_slots", carDoc.id, startDateTime.toISOString().split("T")[0]);
      const timeSlotsSnapshot = await getDocs(timeSlotsRef);

      let isAvailable = true;
      timeSlotsSnapshot.forEach((slotDoc) => {
        const slotData = slotDoc.data();
        if (
          slotData.booked.some(
            (slot) =>
              new Date(slot.start_time) < endDateTime &&
              new Date(slot.end_time) > startDateTime
          )
        ) {
          isAvailable = false;
        }
      });

      if (isAvailable) {
        // Calculate distance between user and car
        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          carData.current_location.latitude,
          carData.current_location.longitude
        );

        availableCars.push({
          id: carDoc.id,
          model: carData.model_id,
          address: carData.address,
          distance: distance.toFixed(2), // Distance in km
          price: timeSlotsSnapshot.docs[0]?.data()?.price_per_slot || "N/A", // Example price
        });
      }
    }

    // Sort cars by distance
    availableCars.sort((a, b) => a.distance - b.distance);

    return availableCars;
  } catch (error) {
    throw new Error(`Error fetching available cars: ${error.message}`);
  }
}