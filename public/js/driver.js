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
import { initMap, updateDriverMarker } from "./map.js";

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000
};

export function initDriverUi() {
  $("#saveShuttleBtn").addEventListener("click", saveShuttle);
  $("#toggleOnlineBtn").addEventListener("click", toggleOnline);
  $("#endTripBtn").addEventListener("click", endTrip);
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

function driverShuttleId() {
  return state.user.uid;
}

async function saveShuttle() {
  const totalSeats = Number.parseInt($("#totalSeats").value, 10);
  const availableSeats = Number.parseInt($("#availableSeats").value, 10);
  const route = $("#driverRoute").value.trim() || "Campus Loop";

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
  const unsubscribe = onSnapshot(doc(db, "shuttles", driverShuttleId()), (snapshot) => {
    state.driverShuttle = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    renderDriverStatus();
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
    $("#locationStatus").textContent = "paused";
    toast("You are offline. Students can no longer see this shuttle.", "success");
  }
}

function startLocationBroadcast() {
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
      return "accepted";
    });

    if (outcome === "full") {
      toast("No seats are available. The request was declined and the shuttle was hidden.", "warning");
      return;
    }

    toast(outcome === "accepted" ? "Request accepted and one seat reserved." : "Request declined.", outcome === "accepted" ? "success" : "warning");
  } catch (error) {
    toast(error.message, "warning");
  }
}

async function endTrip() {
  stopLocationWatch();
  const shuttleRef = doc(db, "shuttles", driverShuttleId());
  const totalSeats = Number.parseInt($("#totalSeats").value, 10) || state.driverShuttle?.totalSeats || 0;
  await updateDoc(shuttleRef, {
    availableSeats: totalSeats,
    isVisible: false,
    updatedAt: serverTimestamp()
  });

  const pendingRequests = await getDocs(query(collection(db, "bookings"), where("driverId", "==", state.user.uid), where("status", "==", "pending")));
  const batch = writeBatch(db);
  pendingRequests.forEach((request) => batch.delete(doc(db, "bookings", request.id)));
  await batch.commit();
  $("#locationStatus").textContent = "trip ended";
  toast("Trip ended, requests cleared, and shuttle hidden.", "success");
}
