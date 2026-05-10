import { state } from "./state.js";
import { escapeHtml, formatTime } from "./ui.js";

const CAMPUS_CENTER = [40.7128, -74.006];

export function initMap(elementId) {
  const map = L.map(elementId, { zoomControl: true }).setView(CAMPUS_CENTER, 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  setTimeout(() => map.invalidateSize(), 150);
  return map;
}

export function shuttleIcon(seats) {
  return L.divIcon({
    className: "shuttle-marker",
    html: String(seats),
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

export function syncStudentMarkers(shuttles, onSelect) {
  if (!state.studentMap) return;

  const visibleIds = new Set(shuttles.map((shuttle) => shuttle.id));
  state.studentMarkers.forEach((marker, id) => {
    if (!visibleIds.has(id)) {
      marker.remove();
      state.studentMarkers.delete(id);
    }
  });

  shuttles.forEach((shuttle) => {
    if (!Number.isFinite(shuttle.latitude) || !Number.isFinite(shuttle.longitude)) return;
    const latLng = [shuttle.latitude, shuttle.longitude];
    const popup = `
      <strong>${escapeHtml(shuttle.route || "Campus route")}</strong><br />
      Driver: ${escapeHtml(shuttle.driverName || "Driver")}<br />
      Seats: ${escapeHtml(shuttle.availableSeats)}<br />
      Updated: ${formatTime(shuttle.updatedAt)}
    `;

    if (state.studentMarkers.has(shuttle.id)) {
      state.studentMarkers.get(shuttle.id)
        .setLatLng(latLng)
        .setIcon(shuttleIcon(shuttle.availableSeats))
        .bindPopup(popup);
    } else {
      const marker = L.marker(latLng, { icon: shuttleIcon(shuttle.availableSeats) })
        .addTo(state.studentMap)
        .bindPopup(popup)
        .on("click", () => onSelect(shuttle));
      state.studentMarkers.set(shuttle.id, marker);
    }
  });

  const located = shuttles.find((shuttle) => Number.isFinite(shuttle.latitude) && Number.isFinite(shuttle.longitude));
  if (located) state.studentMap.setView([located.latitude, located.longitude], 15);
}

export function updateDriverMarker(latitude, longitude) {
  if (!state.driverMap || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const latLng = [latitude, longitude];
  if (state.driverMarker) {
    state.driverMarker.setLatLng(latLng);
  } else {
    state.driverMarker = L.marker(latLng, { icon: shuttleIcon("D") }).addTo(state.driverMap);
  }
  state.driverMap.setView(latLng, 16);
}

export function locateUser(map, label = "You are here") {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((position) => {
    const latLng = [position.coords.latitude, position.coords.longitude];
    L.circleMarker(latLng, { radius: 9, color: "#2563eb", fillColor: "#60a5fa", fillOpacity: 0.45 })
      .addTo(map)
      .bindPopup(label)
      .openPopup();
    map.setView(latLng, 16);
  });
}
