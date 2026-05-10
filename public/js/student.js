import {
  db,
  collection,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "./firebase.js";
import { state, rememberUnsubscribe, cacheShuttles, loadCachedShuttles } from "./state.js";
import { $, escapeHtml, formatTime, renderEmpty, statusLabel, toast } from "./ui.js";
import { initMap, locateUser, syncStudentMarkers } from "./map.js";

export function initStudentUi() {
  $("#closeModalBtn").addEventListener("click", () => $("#shuttleModal").close());
  $("#locateStudentBtn").addEventListener("click", () => locateUser(state.studentMap, "Your pickup area"));
}

export function startStudentDashboard() {
  if (!state.studentMap) state.studentMap = initMap("studentMap");
  renderCachedShuttles();
  listenForAvailableShuttles();
  listenForBookings();
}

function renderCachedShuttles() {
  const cached = loadCachedShuttles();
  if (cached.length) {
    renderShuttleList(cached);
    syncStudentMarkers(cached, openShuttleModal);
    $("#studentConnection").textContent = "Showing last known availability while live data connects…";
  }
}

function listenForAvailableShuttles() {
  const q = query(collection(db, "shuttles"), where("isVisible", "==", true), where("availableSeats", ">", 0));
  const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    const shuttles = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((shuttle) => shuttle.availableSeats > 0 && shuttle.isVisible === true);

    state.activeShuttles = new Map(shuttles.map((shuttle) => [shuttle.id, shuttle]));
    cacheShuttles(shuttles);
    renderShuttleList(shuttles);
    syncStudentMarkers(shuttles, openShuttleModal);
    $("#activeShuttleCount").textContent = `${shuttles.length} live`;
    $("#studentConnection").textContent = snapshot.metadata.fromCache
      ? "Offline mode: showing cached shuttle availability."
      : "Live availability connected.";
  }, (error) => toast(error.message, "error"));
  rememberUnsubscribe(unsubscribe);
}

function renderShuttleList(shuttles) {
  const container = $("#shuttleList");
  if (!shuttles.length) {
    renderEmpty(container, "No shuttles currently have available seats. Please check again soon.");
    return;
  }

  container.innerHTML = shuttles.map((shuttle) => `
    <article class="list-card">
      <h4>${escapeHtml(shuttle.route || "Campus route")}</h4>
      <p>${escapeHtml(shuttle.driverName || "Driver")} is accepting passengers.</p>
      <div class="meta">
        <span>${escapeHtml(shuttle.availableSeats)} seats available</span>
        <span>Updated ${formatTime(shuttle.updatedAt)}</span>
      </div>
      <button class="btn btn--secondary" data-shuttle-id="${shuttle.id}" type="button">Request seat</button>
    </article>
  `).join("");

  container.querySelectorAll("[data-shuttle-id]").forEach((button) => {
    button.addEventListener("click", () => openShuttleModal(state.activeShuttles.get(button.dataset.shuttleId)));
  });
}

function listenForBookings() {
  const q = query(
    collection(db, "bookings"),
    where("studentId", "==", state.user.uid),
    orderBy("createdAt", "desc")
  );
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderBookingList(bookings);
  }, (error) => toast(error.message, "error"));
  rememberUnsubscribe(unsubscribe);
}

function renderBookingList(bookings) {
  const container = $("#bookingList");
  if (!bookings.length) {
    renderEmpty(container, "Your booking requests will appear here in real time.");
    return;
  }

  container.innerHTML = bookings.map((booking) => `
    <article class="list-card">
      <h4>${escapeHtml(statusLabel(booking.status))}</h4>
      <p>Route: ${escapeHtml(booking.route || "Campus shuttle")}</p>
      <div class="meta"><span>Requested ${formatTime(booking.createdAt)}</span></div>
    </article>
  `).join("");
}

function openShuttleModal(shuttle) {
  if (!shuttle) return;
  state.selectedShuttle = shuttle;
  $("#modalBody").innerHTML = `
    <span class="eyebrow">Available shuttle</span>
    <h2>${escapeHtml(shuttle.route || "Campus route")}</h2>
    <p>Driver ${escapeHtml(shuttle.driverName || "Driver")} is online and accepting passengers.</p>
    <div class="metrics">
      <article><span>Available seats</span><strong>${escapeHtml(shuttle.availableSeats)}</strong></article>
      <article><span>Total seats</span><strong>${escapeHtml(shuttle.totalSeats || "—")}</strong></article>
      <article><span>Updated</span><strong>${formatTime(shuttle.updatedAt)}</strong></article>
    </div>
    <button class="btn btn--primary" id="requestSeatBtn" type="button">Request Seat</button>
  `;
  $("#requestSeatBtn").addEventListener("click", requestSeat);
  $("#shuttleModal").showModal();
}

async function requestSeat() {
  const shuttle = state.selectedShuttle;
  if (!shuttle || shuttle.availableSeats <= 0 || shuttle.isVisible !== true) {
    toast("This shuttle is no longer available.", "warning");
    return;
  }

  try {
    const bookingRef = doc(collection(db, "bookings"));
    await setDoc(bookingRef, {
      bookingId: bookingRef.id,
      shuttleId: shuttle.id,
      driverId: shuttle.driverId,
      studentId: state.user.uid,
      studentName: state.userProfile.fullName,
      route: shuttle.route,
      status: "pending",
      createdAt: serverTimestamp()
    });
    $("#shuttleModal").close();
    toast("Seat request sent to driver.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}
