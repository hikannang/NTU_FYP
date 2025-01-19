import { db } from "./firebase-config.js";
import { collection, addDoc } from "firebase/firestore";

/**
 * Handle the form submission to add a new car.
 */
document.getElementById("add-car-form").addEventListener("submit", async (event) => {
  event.preventDefault(); // Prevent the default form submission behavior

  // Get form values
  const carModel = document.getElementById("car-model").value.trim();
  const carAddress = document.getElementById("car-address").value.trim();
  const carPrice = parseFloat(document.getElementById("car-price").value);
  const carAvailability = document.getElementById("car-availability").value === "true";
  const carImage = document.getElementById("car-image").value.trim();

  try {
    // Add the car to Firestore
    const carsRef = collection(db, "cars");
    await addDoc(carsRef, {
      model_id: carModel,
      address: carAddress,
      price_per_hour: carPrice,
      availability: carAvailability,
      image_url: carImage || null, // Optional field
      current_location: {
        latitude: 0, // Placeholder, can be updated later
        longitude: 0, // Placeholder, can be updated later
      },
    });

    alert("Car added successfully!");
    document.getElementById("add-car-form").reset(); // Reset the form
  } catch (error) {
    console.error("Error adding car:", error);
    alert("An error occurred while adding the car. Please try again.");
  }
});