export const state = {
  user: null,
  userProfile: null,
  activeShuttles: new Map(),
  studentMarkers: new Map(),
  driverMarker: null,
  studentMap: null,
  driverMap: null,
  selectedShuttle: null,
  driverShuttle: null,
  locationWatchId: null,
  unsubscribers: []
};

export function rememberUnsubscribe(unsubscribe) {
  if (typeof unsubscribe === "function") {
    state.unsubscribers.push(unsubscribe);
  }
}

export function clearRealtimeListeners() {
  state.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
}

export function cacheShuttles(shuttles) {
  localStorage.setItem("campusShuttle:lastVisibleShuttles", JSON.stringify(shuttles));
}

export function loadCachedShuttles() {
  const cached = localStorage.getItem("campusShuttle:lastVisibleShuttles");
  return cached ? JSON.parse(cached) : [];
}
