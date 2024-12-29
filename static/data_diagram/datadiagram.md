Root
├── cars (Collection)
│   ├── car_id_1 (Document)
│   │   ├── model_id: string
│   │   ├── current_location: object
│   │   │   ├── latitude: float
│   │   │   ├── longitude: float
│   │   ├── address: string
│   │   ├── status: string
│   │   ├── service_due: datetime
│   │   ├── insurance_expiry: datetime
│   ├── car_id_2 (Document)
│       └── (Same structure as car_id_1)
├── car_models (Collection)
│   ├── model_1 (Document)
│   │   ├── name: string
│   │   ├── color: string
│   │   ├── image_url: string
│   │   ├── description: string
│   │   ├── seating_capacity: integer
│   │   ├── fuel_type: string
│   ├── model_2 (Document)
│       └── (Same structure as model_1)
├── time_slots (Collection)
│   ├── car_id_1 (Document)
│   │   ├── 2024-12-14 (Sub-document)
│   │   │   ├── available: array of string
│   │   │   ├── booked: array of string
│   │   │   ├── price_per_slot: float
│   │   ├── 2024-12-15 (Sub-document)
│   │       └── (Same structure as 2024-12-14)
│   ├── car_id_2 (Document)
│       └── (Same structure as car_id_1)
├── bookings (Collection)
│   ├── booking_id_1 (Document)
│   │   ├── car_id: string
│   │   ├── customer_id: string
│   │   ├── time_from: datetime
│   │   ├── time_to: datetime
│   │   ├── status: string
│   │   ├── type: string
│   │   ├── payment_status: string
│   │   ├── payment_method: string
│   │   ├── notes: string
│   ├── booking_id_2 (Document)
│       └── (Same structure as booking_id_1)
├── customers (Collection)
│   ├── customer_1 (Document)
│   │   ├── name: string
│   │   ├── email: string
│   │   ├── phone: string
│   │   ├── license_number: string
│   │   ├── address: string
│   │   ├── preferred_payment: string
│   ├── customer_2 (Document)
│       └── (Same structure as customer_1)
├── admins (Collection)
│   ├── admin_1 (Document)
│   │   ├── name: string
│   │   ├── email: string
│   │   ├── phone: string
│   │   ├── role: string
├── maintenance (Collection)
│   ├── maintenance_id_1 (Document)
│   │   ├── car_id: string
│   │   ├── admin_id: string
│   │   ├── start_time: datetime
│   │   ├── end_time: datetime
│   │   ├── description: string
│   │   ├── status: string