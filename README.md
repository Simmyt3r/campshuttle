# Campus Shuttle Availability System

A modern Firebase web application for reducing student waiting uncertainty by showing **only active shuttles with available seats**. The app supports student and driver roles, live seat requests, driver-controlled availability, and real-time geolocation tracking.

## Core concept

Students never see full, inactive, or offline shuttles. The student dashboard subscribes to Firestore and displays a shuttle only when:

```text
isVisible == true AND availableSeats > 0
```

Drivers control visibility by going online/offline. When available seats reach zero, the driver dashboard automatically sets `isVisible` to `false`, removing the shuttle from student maps and lists.

## Tech stack

- HTML5, CSS3, and modular vanilla JavaScript
- Firebase Authentication
- Firebase Firestore with real-time listeners and offline persistence
- Firebase Hosting
- Leaflet with OpenStreetMap tiles
- HTML5 Geolocation API using `navigator.geolocation.watchPosition()`

## Firebase setup

1. Create a Firebase project.
2. Enable **Authentication → Email/Password**.
3. Create a **Cloud Firestore** database.
4. Register a web app in Firebase.
5. Replace the placeholder values in `public/js/firebase-config.js` with your web app config.
6. Deploy Firestore rules, composite indexes, and Hosting:

```bash
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Update `.firebaserc` with your actual Firebase project id before deployment.

## Collections

### `users`

- `uid`
- `fullName`
- `email`
- `role` (`student` or `driver`)
- `createdAt`

### `shuttles`

- `shuttleId`
- `driverId`
- `driverName`
- `route`
- `totalSeats`
- `availableSeats`
- `isVisible`
- `latitude`
- `longitude`
- `updatedAt`

### `bookings`

- `bookingId` (Firestore document id)
- `shuttleId`
- `driverId`
- `studentId`
- `studentName`
- `route`
- `status` (`pending`, `accepted`, `declined`)
- `createdAt`

## Run locally

Because the app uses JavaScript modules, serve the `public` directory instead of opening `index.html` directly:

```bash
python3 -m http.server 4173 --directory public
```

Open <http://localhost:4173>.

## Feature checklist

- Landing page with project positioning
- Login, registration, and logout through Firebase Authentication
- Role storage in Firestore
- Student dashboard with live map, available shuttle list, and booking status
- Seat request modal and real-time booking status updates
- Driver dashboard with route and seat setup
- Online/offline toggle
- High-accuracy geolocation broadcasting
- Incoming booking request management
- Transactional seat decrement on accepted bookings to prevent overbooking
- Automatic visibility removal when full
- End trip flow that hides shuttle, resets seats, and clears pending requests
- Mobile-first responsive UI with loading, empty, toast, and offline states
- Local cache of last visible shuttle state for unstable connections
- Security rules that prevent students from reading inactive or full shuttle documents

## Notes for defense demonstration

Use one browser profile as a driver and another as a student. After the driver saves a shuttle and goes online, the student dashboard will show the shuttle only while `availableSeats > 0`. Accepting enough requests to fill the shuttle demonstrates the central business rule: full shuttles are hidden automatically.
