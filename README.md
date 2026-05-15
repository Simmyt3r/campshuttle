# Campus Shuttle Availability System

A modern Firebase web application for reducing student waiting uncertainty by showing **only active shuttles with available seats**. The app supports student and driver roles, live seat requests, driver-controlled availability, real-time geolocation tracking, and Firebase Analytics.

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
- Firebase Analytics
- Firebase Hosting on the free Spark plan
- Leaflet with OpenStreetMap tiles
- HTML5 Geolocation API using `navigator.geolocation.watchPosition()`

## Firebase project already configured

This repository is configured for your Firebase web app:

| Setting | Value |
| --- | --- |
| Firebase project ID | `compshuttle` |
| Auth domain | `compshuttle.firebaseapp.com` |
| Storage bucket | `compshuttle.firebasestorage.app` |
| Measurement ID | `G-5WCLN8X2ST` |
| Hosting public directory | `public` |

The Firebase config lives in `public/js/firebase-config.js`, and `.firebaserc` points deployments to the `compshuttle` project.

> Firebase web API keys are intentionally included in client-side web apps. Protect your app data with Firebase Authentication, Firestore Security Rules, and authorized domains.

## First-time Firebase setup checklist

Do these once in the [Firebase Console](https://console.firebase.google.com/):

1. Open project **compshuttle**.
2. Go to **Build → Authentication → Get started**.
3. Open **Sign-in method** and enable **Email/Password**.
4. Go to **Build → Firestore Database → Create database**.
5. Choose **Production mode**.
6. Pick a nearby Firestore location. You cannot easily change this later.
7. Go to **Project settings → General → Your apps** and confirm the web app config matches `public/js/firebase-config.js`.
8. Stay on the free **Spark** plan unless Firebase asks you to upgrade for a feature you intentionally add later. This app only needs free Firebase Hosting, Authentication, Firestore, and Analytics features for normal student-project usage.

## Run locally before deployment

Because the app uses JavaScript modules, serve the `public` directory instead of opening `index.html` directly:

```bash
python3 -m http.server 4173 --directory public
```

Open <http://localhost:4173>.

For local testing:

1. Register one account with role **Driver**.
2. Register another account with role **Student**. Use another browser, incognito window, or separate browser profile.
3. In the driver dashboard, enter a route and seat count, then click **Save shuttle**.
4. Click **Go Online** and allow location access.
5. In the student dashboard, confirm the shuttle appears only while it is online and has available seats.

## Free Firebase Hosting deployment guide

Firebase Hosting has a free Spark-plan tier that is suitable for this static app. You do **not** need a paid server, VPS, backend hosting plan, or custom domain.

### 1. Install the Firebase CLI

If Node.js is not installed, install the current LTS version from <https://nodejs.org/> first. Then install the Firebase CLI globally:

```bash
npm install -g firebase-tools
```

Check it installed correctly:

```bash
firebase --version
```

### 2. Log in to Firebase

```bash
firebase login
```

A browser window opens. Sign in with the same Google account that owns the **compshuttle** Firebase project.

If you are on a shared computer, log out when done:

```bash
firebase logout
```

### 3. Confirm the project target

This repo already contains `.firebaserc`, so the default project should be `compshuttle`.

```bash
firebase use
```

If it does not show `compshuttle`, run:

```bash
firebase use compshuttle
```

### 4. Deploy Firestore rules, indexes, and Hosting

From the repository root, run:

```bash
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

This publishes:

- `firestore.rules` to protect student, driver, shuttle, and booking data.
- `firestore.indexes.json` so the live dashboard queries work efficiently.
- The `public` folder to Firebase Hosting.

### 5. Open your deployed app

After deployment, Firebase prints a **Hosting URL** similar to:

```text
https://compshuttle.web.app
https://compshuttle.firebaseapp.com
```

Open the URL in your browser and test with driver and student accounts.

### 6. Deploy only the website after future UI changes

If you only change HTML, CSS, or JavaScript files in `public`, deploy just Hosting:

```bash
firebase deploy --only hosting
```

If you change Firestore rules or indexes, use the full deploy command again:

```bash
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

## Common deployment problems

### `Error: Failed to authenticate`

Run:

```bash
firebase logout
firebase login
```

Then deploy again.

### `Error: Project not found or permission denied`

Make sure you are logged in with a Google account that has access to the Firebase project `compshuttle`:

```bash
firebase login:list
firebase use compshuttle
```

### The app loads but login/register fails

Check these items in Firebase Console:

- **Authentication → Sign-in method → Email/Password** is enabled.
- **Firestore Database** has been created.
- You deployed the rules with `firebase deploy --only firestore:rules`.
- Your deployed domain appears in **Authentication → Settings → Authorized domains**. Firebase Hosting domains are usually added automatically.

### Students cannot see shuttles

Confirm that the driver account has:

- Saved a shuttle.
- Clicked **Go Online**.
- Allowed browser location access.
- Set `availableSeats` above `0`.

Students only see shuttles where `isVisible == true` and `availableSeats > 0`.

### Location does not update

Browser geolocation normally requires HTTPS. Firebase Hosting provides HTTPS automatically, so test location on the deployed Firebase URL rather than a plain `http://` LAN address.

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
