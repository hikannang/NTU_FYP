// migrate-bookings.js

import { db } from "../common/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  writeBatch,
  query,
  limit,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Create a button element in your HTML
// <button id="run-migration" class="admin-btn">Migrate Bookings Data</button>

document.addEventListener("DOMContentLoaded", () => {
  const migrationButton = document.getElementById("run-migration");
  if (migrationButton) {
    migrationButton.addEventListener("click", runMigration);
  }
});

// Function to run the migration
async function runMigration() {
  // Show status
  const statusElement = document.createElement("div");
  statusElement.className = "migration-status";
  statusElement.innerHTML = "<h3>Migration Status</h3><div id='migration-log'></div>";
  document.body.appendChild(statusElement);
  
  const logElement = document.getElementById("migration-log");
  
  function log(message) {
    console.log(message);
    if (logElement) {
      const logLine = document.createElement("p");
      logLine.textContent = message;
      logElement.appendChild(logLine);
      logElement.scrollTop = logElement.scrollHeight;
    }
  }

  try {
    log("Starting migration...");
    
    // Get all cars
    const carsSnapshot = await getDocs(collection(db, "cars"));
    log(`Found ${carsSnapshot.size} cars`);

    // Track overall stats
    let totalBookings = 0;
    let processedBookings = 0;
    let skippedBookings = 0;
    let errorBookings = 0;

    // Process each car's bookings
    for (const carDoc of carsSnapshot.docs) {
      const carId = carDoc.id;
      log(`Processing car: ${carId}`);
      
      // Get all bookings for this car
      const bookingsSnapshot = await getDocs(collection(db, "timesheets", carId, "bookings"));
      log(`Found ${bookingsSnapshot.size} bookings for car ${carId}`);
      totalBookings += bookingsSnapshot.size;
      
      // Process in smaller batches to avoid Firestore limitations
      const batchSize = 300; // Firestore has a 500 limit per batch
      let batch = writeBatch(db);
      let operationsCount = 0;
      
      for (const bookingDoc of bookingsSnapshot.docs) {
        try {
          const bookingId = bookingDoc.id;
          const bookingData = bookingDoc.data();
          
          // Make sure we have a user ID
          if (!bookingData.user_id) {
            log(`Skipping booking ${bookingId} - no user_id`);
            skippedBookings++;
            continue;
          }
          
          // Make sure car ID is included
          const fullBookingData = {
            ...bookingData,
            id: bookingId,
            car_id: carId
          };
          
          // Add to main bookings collection
          batch.set(doc(db, "bookings", bookingId), fullBookingData);
          
          // Add to user's bookings collection
          batch.set(
            doc(db, "users", bookingData.user_id, "bookings", bookingId), 
            fullBookingData
          );
          
          operationsCount += 2;
          processedBookings++;
          
          // Commit batch if we're approaching the limit
          if (operationsCount >= batchSize) {
            log(`Committing batch of ${operationsCount} operations...`);
            await batch.commit();
            batch = writeBatch(db);
            operationsCount = 0;
          }
          
        } catch (err) {
          log(`Error processing booking ${bookingDoc.id}: ${err.message}`);
          errorBookings++;
        }
      }
      
      // Commit any remaining operations
      if (operationsCount > 0) {
        log(`Committing remaining ${operationsCount} operations for car ${carId}...`);
        await batch.commit();
      }
    }
    
    // Log final stats
    log("Migration complete!");
    log(`Total bookings found: ${totalBookings}`);
    log(`Successfully processed: ${processedBookings}`);
    log(`Skipped: ${skippedBookings}`);
    log(`Errors: ${errorBookings}`);
    
  } catch (error) {
    log(`Migration failed: ${error.message}`);
    console.error("Migration error:", error);
  }
}

// Alternative function if you prefer to run this in a Firebase Cloud Function
// or in a Node.js environment
export async function migrateBookingsServerSide() {
  try {
    console.log("Starting server-side migration...");
    
    // Similar logic to above, adapted for server environment
    // ...
    
    return {
      success: true,
      stats: {
        totalBookings,
        processedBookings,
        skippedBookings,
        errorBookings
      }
    };
  } catch (error) {
    console.error("Migration error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}