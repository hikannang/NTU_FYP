time_slots (Collection)
├── car_id_1 (Document)
│   ├── 2025-01-03 (Sub-document)     // Date-specific availability
│   │   ├── available: array          // Array of available time slots (e.g., ["08:00-10:00", "12:00-14:00"])
│   │   ├── booked: array             // Array of booked time slots (e.g., ["10:00-12:00"])
│   │   ├── price_per_slot: float     // Price per time slot
│   ├── 2025-01-04 (Sub-document)
│       └── (Same structure as 2025-01-03)
├── car_id_2 (Document)
│   └── (Same structure as car_id_1)