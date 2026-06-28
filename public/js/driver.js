import {
  db,
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  runTransaction
} from "./firebase.js";
import { state, rememberUnsubscribe } from "./state.js";
import { $, escapeHtml, formatTime, renderEmpty, toast } from "./ui.js";
import { initMap, refreshMapSize, updateDriverMarker } from "./map.js";

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000
};

export function initDriverUi() {
  $("#saveShuttleBtn").addEventListener("click", saveShuttle);
  $("#toggleOnlineBtn").addEventListener("click", toggleOnline);
  $("#endTripBtn").addEventListener("click", endTrip);
  $("#simulateRouteBtn").addEventListener("click", toggleSimulatedRoute);
}

export function startDriverDashboard() {
  if (!state.driverMap) state.driverMap = initMap("driverMap");
  listenForDriverShuttle();
  listenForRequests();
}

export function stopLocationWatch() {
  if (state.locationWatchId !== null) {
    navigator.geolocation.clearWatch(state.locationWatchId);
    state.locationWatchId = null;
  }
}

const DEMO_ROUTE = [
  [8.4939, 8.5014],
  [8.4929, 8.5045],
  [8.4907, 8.5071],
  [8.4884, 8.5100],
  [8.4866, 8.5078],
  [8.4895, 8.5030]
];

function driverShuttleId() {
  return state.user.uid;
}

async function saveShuttle() {
  const totalSeats = Number.parseInt($("#totalSeats").value, 10);
  const availableSeats = Number.parseInt($("#availableSeats").value, 10);
  const route = $("#driverRoute").value.trim() || "Take-off Site ➔ Permanent Site";

  if (availableSeats > totalSeats) {
    toast("Available seats cannot exceed total seats.", "warning");
    return;
  }

  await setDoc(doc(db, "shuttles", driverShuttleId()), {
    shuttleId: driverShuttleId(),
    driverId: state.user.uid,
    driverName: state.userProfile.fullName,
    route,
    totalSeats,
    availableSeats,
    isVisible: availableSeats > 0 && state.driverShuttle?.isVisible === true,
    latitude: state.driverShuttle?.latitude ?? null,
    longitude: state.driverShuttle?.longitude ?? null,
    updatedAt: serverTimestamp()
  }, { merge: true });
  toast("Shuttle saved.", "success");
}

function listenForDriverShuttle() {
  const unsubscribe = onSnapshot(doc(db, "shuttles", driverShuttleId()), { includeMetadataChanges: true }, (snapshot) => {
    state.driverShuttle = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    renderDriverStatus();
    refreshMapSize(state.driverMap);
  }, (error) => toast(error.message, "error"));
  rememberUnsubscribe(unsubscribe);
}

function renderDriverStatus() {
  const shuttle = state.driverShuttle;
  if (!shuttle) {
    $("#metricSeats").textContent = "0";
    $("#metricPassengers").textContent = "0";
    $("#metricVisible").textContent = "Hidden";
    return;
  }

  $("#driverRoute").value = shuttle.route || "";
  $("#totalSeats").value = shuttle.totalSeats ?? 14;
  $("#availableSeats").value = shuttle.availableSeats ?? 0;
  $("#metricSeats").textContent = shuttle.availableSeats ?? 0;
  $("#metricPassengers").textContent = Math.max((shuttle.totalSeats ?? 0) - (shuttle.availableSeats ?? 0), 0);
  $("#metricVisible").textContent = shuttle.isVisible ? "Visible" : "Hidden";
  $("#driverStatusPill").textContent = shuttle.isVisible ? "online" : "offline";
  $("#toggleOnlineBtn").textContent = shuttle.isVisible ? "Go Offline" : "Go Online";

  if (shuttle.availableSeats <= 0 && shuttle.isVisible) {
    updateDoc(doc(db, "shuttles", driverShuttleId()), { isVisible: false, updatedAt: serverTimestamp() });
  }
  updateDriverMarker(shuttle.latitude, shuttle.longitude);
}

async function toggleOnline() {
  if (!state.driverShuttle) await saveShuttle();
  const shouldGoOnline = !state.driverShuttle?.isVisible;

  if (shouldGoOnline && Number.parseInt($("#availableSeats").value, 10) <= 0) {
    toast("Add at least one available seat before going online.", "warning");
    return;
  }

  await updateDoc(doc(db, "shuttles", driverShuttleId()), {
    isVisible: shouldGoOnline,
    updatedAt: serverTimestamp()
  });

  if (shouldGoOnline) {
    startLocationBroadcast();
    toast("You are online and visible to students with available seats.", "success");
  } else {
    stopLocationWatch();
    stopSimulatedRoute();
    await clearPendingRequests("Driver went offline");
    $("#locationStatus").textContent = "paused";
    toast("You are offline. Pending requests were declined and students can no longer see this shuttle.", "success");
  }
}

function startLocationBroadcast() {
  stopSimulatedRoute();
  if (!navigator.geolocation) {
    toast("Geolocation is not supported by this browser.", "error");
    return;
  }

  stopLocationWatch();
  $("#locationStatus").textContent = "tracking";
  state.locationWatchId = navigator.geolocation.watchPosition(async (position) => {
    const { latitude, longitude } = position.coords;
    updateDriverMarker(latitude, longitude);
    await updateDoc(doc(db, "shuttles", driverShuttleId()), {
      latitude,
      longitude,
      isVisible: Number.parseInt($("#availableSeats").value, 10) > 0,
      updatedAt: serverTimestamp()
    });
  }, (error) => {
    $("#locationStatus").textContent = "location error";
    toast(error.message, "error");
  }, GEO_OPTIONS);
}

function listenForRequests() {
  const q = query(
    collection(db, "bookings"),
    where("driverId", "==", state.user.uid),
    where("status", "==", "pending"),
    orderBy("createdAt", "asc")
  );
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderRequests(requests);
  }, (error) => toast(error.message, "error"));
  rememberUnsubscribe(unsubscribe);
}

function renderRequests(requests) {
  $("#requestCount").textContent = `${requests.length} pending`;
  const container = $("#requestList");
  if (!requests.length) {
    renderEmpty(container, "Incoming student seat requests will appear here.");
    return;
  }

  container.innerHTML = requests.map((request) => `
    <article class="list-card">
      <h4>${escapeHtml(request.studentName || "Student")}</h4>
      <p>${escapeHtml(request.route || "Campus route")}</p>
      <div class="meta"><span>Requested ${formatTime(request.createdAt)}</span></div>
      <div class="hero__actions">
        <button class="btn btn--primary" data-accept="${request.id}" type="button">Accept</button>
        <button class="btn btn--danger" data-decline="${request.id}" type="button">Decline</button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll("[data-accept]").forEach((button) => {
    button.addEventListener("click", () => respondToRequest(button.dataset.accept, true));
  });
  container.querySelectorAll("[data-decline]").forEach((button) => {
    button.addEventListener("click", () => respondToRequest(button.dataset.decline, false));
  });
}

async function respondToRequest(bookingId, accepted) {
  try {
    const outcome = await runTransaction(db, async (transaction) => {
      const shuttleRef = doc(db, "shuttles", driverShuttleId());
      const bookingRef = doc(db, "bookings", bookingId);
      const [shuttleSnap, bookingSnap] = await Promise.all([transaction.get(shuttleRef), transaction.get(bookingRef)]);

      if (!bookingSnap.exists() || bookingSnap.data().driverId !== state.user.uid || bookingSnap.data().status !== "pending") {
        throw new Error("This request is no longer pending.");
      }

      if (!accepted) {
        transaction.update(bookingRef, { status: "declined", respondedAt: serverTimestamp() });
        return "declined";
      }

      if (!shuttleSnap.exists() || shuttleSnap.data().availableSeats <= 0) {
        transaction.update(bookingRef, { status: "declined", respondedAt: serverTimestamp() });
        if (shuttleSnap.exists()) {
          transaction.update(shuttleRef, { isVisible: false, updatedAt: serverTimestamp() });
        }
        return "full";
      }

      const nextSeats = shuttleSnap.data().availableSeats - 1;
      transaction.update(bookingRef, { status: "accepted", respondedAt: serverTimestamp() });
      transaction.update(shuttleRef, {
        availableSeats: nextSeats,
        isVisible: nextSeats > 0,
        updatedAt: serverTimestamp()
      });
      return { status: "accepted", nextSeats, isVisible: nextSeats > 0 };
    });

    if (outcome?.status === "accepted") {
      state.driverShuttle = {
        ...state.driverShuttle,
        availableSeats: outcome.nextSeats,
        isVisible: outcome.isVisible
      };
      renderDriverStatus();
    }

    if (outcome === "full") {
      toast("No seats are available. The request was declined and the shuttle was hidden.", "warning");
      return;
    }

    toast(outcome?.status === "accepted" ? "Request accepted and one seat reserved." : "Request declined.", outcome?.status === "accepted" ? "success" : "warning");
  } catch (error) {
    toast(error.message, "warning");
  }
}

function stopSimulatedRoute() {
  if (state.simulatedRouteTimerId !== null) {
    window.clearInterval(state.simulatedRouteTimerId);
    state.simulatedRouteTimerId = null;
  }
}

async function publishSimulatedLocation() {
  if (!state.driverShuttle) await saveShuttle();
  const [latitude, longitude] = DEMO_ROUTE[state.simulatedRouteStep % DEMO_ROUTE.length];
  state.simulatedRouteStep += 1;
  updateDriverMarker(latitude, longitude);
  await updateDoc(doc(db, "shuttles", driverShuttleId()), {
    latitude,
    longitude,
    isVisible: Number.parseInt($("#availableSeats").value, 10) > 0,
    updatedAt: serverTimestamp()
  });
}

async function toggleSimulatedRoute() {
  if (state.simulatedRouteTimerId !== null) {
    stopSimulatedRoute();
    $("#simulateRouteBtn").textContent = "Simulate Route";
    $("#locationStatus").textContent = state.locationWatchId === null ? "paused" : "tracking";
    toast("Simulated route stopped.", "warning");
    return;
  }

  stopLocationWatch();
  state.simulatedRouteStep = 0;
  await publishSimulatedLocation();
  state.simulatedRouteTimerId = window.setInterval(() => {
    publishSimulatedLocation().catch((error) => toast(error.message, "error"));
  }, 2500);
  $("#simulateRouteBtn").textContent = "Stop Simulation";
  $("#locationStatus").textContent = "simulating";
  toast("Mock shuttle route is broadcasting for demo mode.", "success");
}

async function clearPendingRequests(reason) {
  const pendingRequests = await getDocs(query(collection(db, "bookings"), where("driverId", "==", state.user.uid), where("status", "==", "pending")));
  if (pendingRequests.empty) return 0;

  const batch = writeBatch(db);
  pendingRequests.forEach((request) => {
    batch.update(doc(db, "bookings", request.id), {
      status: "declined",
      responseNote: reason,
      respondedAt: serverTimestamp()
    });
  });
  await batch.commit();
  return pendingRequests.size;
}

async function endTrip() {
  stopLocationWatch();
  stopSimulatedRoute();
  const shuttleRef = doc(db, "shuttles", driverShuttleId());
  const totalSeats = Number.parseInt($("#totalSeats").value, 10) || state.driverShuttle?.totalSeats || 0;
  await updateDoc(shuttleRef, {
    availableSeats: totalSeats,
    isVisible: false,
    updatedAt: serverTimestamp()
  });

  const declinedCount = await clearPendingRequests("Trip ended");
  $("#simulateRouteBtn").textContent = "Simulate Route";
  $("#locationStatus").textContent = "trip ended";
  toast(`Trip ended, ${declinedCount} pending request${declinedCount === 1 ? "" : "s"} declined, and shuttle hidden.`, "success");
}
