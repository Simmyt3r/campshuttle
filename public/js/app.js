import { firebaseReady } from "./firebase.js";
import { state } from "./state.js";
import { initAuth } from "./auth.js";
import { initStudentUi } from "./student.js";
import { initDriverUi } from "./driver.js";
import { $, showPage, toast } from "./ui.js";

const publicRoutes = new Set(["home", "auth", "live-map"]);

function routeFromHash() {
  return location.hash.replace("#", "") || "home";
}

function guardAndRenderRoute() {
  const route = routeFromHash();

  if (route === "live-map") {
    showPage(state.userProfile?.role === "student" ? "student-dashboard" : "auth");
    if (!state.user) toast("Login as a student to view the live shuttle map.", "warning");
    return;
  }

  if (route === "student-dashboard" && state.userProfile?.role !== "student") {
    showPage(state.user ? "driver-dashboard" : "auth");
    return;
  }

  if (route === "driver-dashboard" && state.userProfile?.role !== "driver") {
    showPage(state.user ? "student-dashboard" : "auth");
    return;
  }

  showPage(publicRoutes.has(route) || state.user ? route : "auth");
}

function monitorNetwork() {
  window.addEventListener("online", () => toast("Connection restored. Live updates are resuming.", "success"));
  window.addEventListener("offline", () => toast("You are offline. Showing cached shuttle data where available.", "warning"));
}

function prepareDashboardsOnResize() {
  window.addEventListener("resize", () => {
    state.studentMap?.invalidateSize();
    state.driverMap?.invalidateSize();
  });
}

function initNavigation() {
  window.addEventListener("hashchange", guardAndRenderRoute);
  document.querySelectorAll("[data-auth-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!state.user) {
        event.preventDefault();
        location.hash = "auth";
        toast("Please login or register first.", "warning");
      }
    });
  });
}

function initApp() {
  initNavigation();
  initAuth();
  initStudentUi();
  initDriverUi();
  monitorNetwork();
  prepareDashboardsOnResize();
  guardAndRenderRoute();

  if (!firebaseReady) {
    toast("Firebase config contains placeholders. Add your project keys in public/js/firebase-config.js.", "warning");
  }

}

initApp();
