Root
├── bookings (Collection)
│   ├── bookingID_1 (Document)
│   │   ├── carID: integer
│   │   ├── car_type: string
│   │   ├── created_at: datetime
│   │   ├── duration_minutes: integer
│   │   ├── end_time: datetime
│   │   ├── bookingID: string
│   │   ├── start_time: datetime
│   │   ├── status: string
│   │   ├── total_price: float
│   │   ├── userID: string
│   ├── bookingID_2 (Document)
│       └── (Same structure as bookingID_1)
├── car_models (Collection)
│   ├── model_name_1 (Document)
│   │   ├── color: string
│   │   ├── fuel_type: string
│   │   ├── large_luggage: integer
│   │   ├── name: string
│   │   ├── seating_capacity: integer
│   │   ├── small_luggage: integer
│   ├── model_name_2 (Document)
│       └── (Same structure as model_name_1)
├── cars (Collection)
│   ├── carID_1 (Document)
│   │   ├── address: string
│   │   ├── car_color: string
│   │   ├── car_type: string
│   │   ├── current_location: object
│   │   │   ├── latitude: string
│   │   │   ├── longitude: string
│   │   ├── fuel_type: string
│   │   ├── insurance_expiry: string
│   │   ├── large_luggage: integer
│   │   ├── license_plate: string
│   │   ├── seating_capacity: integer
│   │   ├── service_due: datetime
│   │   ├── small_luggage: integer
│   │   ├── status: string
│   │   ├── directions: string
│   ├── carID_2 (Document)
│       └── (Same structure as carID_1)
├── timesheets (Collection)
│   ├── carID_1 (Document)
│   │   ├── bookings (Collection)
│   │   │   ├── bookingID_1 (Document)
│   │   │   │   ├── bookingID: string
│   │   │   │   ├── created_at: datetime
│   │   │   │   ├── carID: integer
│   │   │   │   ├── start_time: datetime
│   │   │   │   ├── duration_minutes: integer
│   │   │   │   ├── end_time: datetime
│   │   │   │   ├── hourly_rate: float
│   │   │   │   ├── total_price: float
│   │   │   │   ├── status: string
│   │   │   │   ├── userID: string
│   │   │   ├── bookingID_2 (Document)
│   │   │       └── (Same structure as bookingID_1)
│   ├── carID_2 (Document)
│       └── (Same structure as carID_1)
├── users (Collection)
│   ├── userID_1 (Document)
│   │   ├── address: string
│   │   ├── cardNumber: string
│   │   ├── createdAt: datetime
│   │   ├── email: string
│   │   ├── firstname: string
│   │   ├── lastname: string
│   │   ├── licenseIssueDate: datetime
│   │   ├── licenseNumber: string
│   │   ├── phone: string
│   │   ├── role: string
│   ├── userID_2 (Document)
│       └── (Same structure as userID_1)