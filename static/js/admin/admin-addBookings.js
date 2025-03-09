import { db, auth } from '../common/firebase-config.js';
import { collection, getDocs, doc, setDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Initialize booking handlers
async function populateCarSelect() {
    const carSelect = document.getElementById('car-select');
    carSelect.innerHTML = '';
    
    const carsSnapshot = await getDocs(collection(db, 'cars'));
    carsSnapshot.forEach((doc) => {
        const car = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${car.car_type} - ${car.license_plate}`;
        carSelect.appendChild(option);
    });

    if (carSelect.value) {
        await updateCarDetails(carSelect.value);
        await handleBookingOptions();
    }
}

async function updateCarDetails(carId) {
    const carDoc = await getDoc(doc(db, 'cars', carId));
    if (carDoc.exists()) {
        const car = carDoc.data();
        document.getElementById('car-image').src = `static/images/${car.car_type}.jpg`;
        document.getElementById('car-details').textContent = 
            `Seats: ${car.seating_capacity}, Fuel: ${car.fuel_type}, Luggage: ${car.large_luggage || 0} large, ${car.small_luggage || 0} small`;
    }
}

async function handleBookingOptions() {
    const bookingDate = document.getElementById('booking-date').value;
    const hoursSelect = document.getElementById('booking-time-hours');
    const minutesSelect = document.getElementById('booking-time-minutes');
    const daysSelect = document.getElementById('booking-duration-days');
    const durationHoursSelect = document.getElementById('booking-duration-hours');
    const durationMinutesSelect = document.getElementById('booking-duration-minutes');
    const carId = document.getElementById('car-select').value;

    if (!bookingDate || !carId) return;

    [hoursSelect, minutesSelect, daysSelect, durationHoursSelect, durationMinutesSelect]
        .forEach(select => select.innerHTML = '');

    const now = new Date();
    const selectedDate = new Date(bookingDate);

    const bookingsQuery = query(
        collection(db, 'timesheets', carId, 'bookings'),
        where('start_time', '>=', selectedDate),
        where('start_time', '<', new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000))
    );
    
    const bookings = (await getDocs(bookingsQuery)).docs
        .map(doc => ({
            start: new Date(doc.data().start_time.seconds * 1000),
            end: new Date(doc.data().end_time.seconds * 1000)
        }))
        .sort((a, b) => a.start - b.start);

    const timeSlots = getAvailableTimeSlots(selectedDate, now, bookings);
    
    if (timeSlots.length === 0) {
        alert('No available time slots for selected date. Please choose another date.');
        document.getElementById('booking-date').value = '';
        return;
    }

    populateTimeOptions(hoursSelect, minutesSelect, timeSlots);

    const updateDuration = () => {
        if (hoursSelect.value && minutesSelect.value) {
            const selectedDateTime = new Date(selectedDate);
            selectedDateTime.setHours(parseInt(hoursSelect.value), parseInt(minutesSelect.value));
            updateDurationBasedOnNextBooking(selectedDateTime, bookings, daysSelect, durationHoursSelect, durationMinutesSelect);
        }
    };

    hoursSelect.addEventListener('change', updateDuration);
    minutesSelect.addEventListener('change', updateDuration);
}

function getAvailableTimeSlots(selectedDate, now, bookings) {
    let timeSlots = [];
    let currentTime = selectedDate.toDateString() === now.toDateString() ? 
        now : new Date(selectedDate.setHours(0, 0, 0, 0));

    if (bookings.length === 0) {
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 0, 0);
        timeSlots.push({ start: currentTime, end: endOfDay });
        return timeSlots;
    }

    bookings.forEach((booking, index) => {
        if (index === 0 && currentTime < new Date(booking.start.getTime() - (15 * 60000))) {
            timeSlots.push({
                start: currentTime,
                end: new Date(booking.start.getTime() - (15 * 60000))
            });
        }

        const slotStart = new Date(booking.end.getTime() + (15 * 60000));
        const nextBooking = bookings[index + 1];

        if (nextBooking) {
            const slotEnd = new Date(nextBooking.start.getTime() - (15 * 60000));
            if (slotStart < slotEnd) {
                timeSlots.push({ start: slotStart, end: slotEnd });
            }
        } else {
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 0, 0);
            if (slotStart < endOfDay) {
                timeSlots.push({ start: slotStart, end: endOfDay });
            }
        }
    });

    return timeSlots;
}

function populateTimeOptions(hoursSelect, minutesSelect, timeSlots) {
    const availableHours = new Set();
    timeSlots.forEach(slot => {
        for (let hour = slot.start.getHours(); hour <= slot.end.getHours(); hour++) {
            availableHours.add(hour);
        }
    });

    Array.from(availableHours).sort((a, b) => a - b).forEach(hour => {
        const option = document.createElement('option');
        option.value = hour.toString().padStart(2, '0');
        option.textContent = hour.toString().padStart(2, '0');
        hoursSelect.appendChild(option);
    });

    if (hoursSelect.value) {
        updateMinutesForHour(minutesSelect, parseInt(hoursSelect.value), timeSlots);
    }

    hoursSelect.addEventListener('change', () => {
        updateMinutesForHour(minutesSelect, parseInt(hoursSelect.value), timeSlots);
    });
}

function updateMinutesForHour(minutesSelect, selectedHour, timeSlots) {
    minutesSelect.innerHTML = '';
    const availableMinutes = new Set();

    timeSlots.forEach(slot => {
        if (selectedHour === slot.start.getHours()) {
            ['15', '30', '45'].forEach(minute => {
                if (parseInt(minute) >= slot.start.getMinutes()) {
                    availableMinutes.add(minute);
                }
            });
        } else if (selectedHour === slot.end.getHours()) {
            ['00', '15', '30'].forEach(minute => {
                if (parseInt(minute) < slot.end.getMinutes()) {
                    availableMinutes.add(minute);
                }
            });
        } else if (selectedHour > slot.start.getHours() && selectedHour < slot.end.getHours()) {
            ['00', '15', '30', '45'].forEach(minute => availableMinutes.add(minute));
        }
    });

    Array.from(availableMinutes).sort((a, b) => parseInt(a) - parseInt(b)).forEach(minute => {
        const option = document.createElement('option');
        option.value = minute;
        option.textContent = minute;
        minutesSelect.appendChild(option);
    });
}

function updateDurationBasedOnNextBooking(selectedDateTime, bookings, daysSelect, durationHoursSelect, durationMinutesSelect) {
    const nextBooking = bookings.find(booking => booking.start > selectedDateTime);
    
    let maxDuration;
    if (nextBooking) {
        maxDuration = nextBooking.start.getTime() - selectedDateTime.getTime() - (15 * 60000);
    } else {
        const endOfDay = new Date(selectedDateTime);
        endOfDay.setHours(23, 59, 0, 0);
        maxDuration = endOfDay.getTime() - selectedDateTime.getTime();
    }

    maxDuration = Math.max(0, Math.floor(maxDuration / (1000 * 60)));
    populateDurationOptions(maxDuration, daysSelect, durationHoursSelect, durationMinutesSelect);
}

function populateDurationOptions(maxDurationMinutes, daysSelect, durationHoursSelect, durationMinutesSelect) {
    [daysSelect, durationHoursSelect, durationMinutesSelect].forEach(select => select.innerHTML = '');

    const maxDays = Math.floor(maxDurationMinutes / (24 * 60));
    const maxHours = Math.floor((maxDurationMinutes % (24 * 60)) / 60);
    const maxMinutes = maxDurationMinutes % 60;

    for (let i = 0; i <= maxDays; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i} day${i !== 1 ? 's' : ''}`;
        daysSelect.appendChild(option);
    }

    for (let i = 0; i <= (maxDays > 0 ? 23 : maxHours); i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i} hr`;
        durationHoursSelect.appendChild(option);
    }

    ['00', '15', '30', '45'].forEach(minute => {
        if (parseInt(minute) <= maxMinutes || maxDays > 0 || maxHours > 0) {
            const option = document.createElement('option');
            option.value = minute;
            option.textContent = `${minute} min`;
            durationMinutesSelect.appendChild(option);
        }
    });
}

document.getElementById('car-select').addEventListener('change', async (e) => {
    await updateCarDetails(e.target.value);
    await handleBookingOptions();
});

document.getElementById('booking-date').addEventListener('change', handleBookingOptions);

document.getElementById('add-booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
        // Check if user is logged in
        if (!auth.currentUser) {
            throw new Error('No user logged in');
        }

        const carId = document.getElementById('car-select').value;
        const bookingDate = document.getElementById('booking-date').value;
        const bookingTimeHours = document.getElementById('booking-time-hours').value;
        const bookingTimeMinutes = document.getElementById('booking-time-minutes').value;
        const durationDays = parseInt(document.getElementById('booking-duration-days').value);
        const durationHours = parseInt(document.getElementById('booking-duration-hours').value);
        const durationMinutes = parseInt(document.getElementById('booking-duration-minutes').value);

        const startDateTime = new Date(`${bookingDate}T${bookingTimeHours}:${bookingTimeMinutes}`);
        const endDateTime = new Date(startDateTime);
        endDateTime.setDate(endDateTime.getDate() + durationDays);
        endDateTime.setHours(endDateTime.getHours() + durationHours);
        endDateTime.setMinutes(endDateTime.getMinutes() + durationMinutes);

        const now = new Date();
        const bookingData = {
            booking_id: `booking_${Date.now()}`,
            car_id: carId,
            user_id: auth.currentUser.uid,
            start_time: startDateTime,
            end_time: endDateTime,
            created_at: now,
            updated_at: now
        };

        const timesheetRef = doc(db, 'timesheets', carId);
        const bookingRef = doc(collection(timesheetRef, 'bookings'), bookingData.booking_id);
        await setDoc(bookingRef, bookingData);

        alert('Booking added successfully!');
        document.getElementById('add-booking-form').reset();
        await handleBookingOptions();
    } catch (error) {
        console.error('Error adding booking:', error);
        alert('Failed to add booking. Please try again.');
    }
});

const bookingDateInput = document.getElementById('booking-date');
const today = new Date().toISOString().split('T')[0];
bookingDateInput.setAttribute('min', today);

populateCarSelect();