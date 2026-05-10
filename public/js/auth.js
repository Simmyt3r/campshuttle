import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "./firebase.js";
import { state, clearRealtimeListeners } from "./state.js";
import { $, showPage, toast } from "./ui.js";
import { startDriverDashboard, stopLocationWatch } from "./driver.js";
import { startStudentDashboard } from "./student.js";

export function initAuth() {
  $("#registerForm").addEventListener("submit", register);
  $("#loginForm").addEventListener("submit", login);
  $("#logoutBtn").addEventListener("click", logout);

  onAuthStateChanged(auth, async (user) => {
    clearRealtimeListeners();
    stopLocationWatch();
    state.user = user;
    state.userProfile = null;
    $("#logoutBtn").classList.toggle("hidden", !user);

    if (!user) {
      const route = location.hash.replace("#", "") || "home";
      showPage(["home", "auth"].includes(route) ? route : "auth");
      return;
    }

    const profileSnap = await getDoc(doc(db, "users", user.uid));
    state.userProfile = profileSnap.data();

    if (state.userProfile?.role === "driver") {
      showPage("driver-dashboard");
      startDriverDashboard();
    } else {
      showPage("student-dashboard");
      startStudentDashboard();
    }
  });
}

async function register(event) {
  event.preventDefault();
  const fullName = $("#registerName").value.trim();
  const email = $("#registerEmail").value.trim();
  const password = $("#registerPassword").value;
  const role = $("#registerRole").value;

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      fullName,
      email,
      role,
      createdAt: serverTimestamp()
    });
    toast("Account created successfully.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function login(event) {
  event.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginPassword").value);
    toast("Welcome back.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function logout() {
  await signOut(auth);
  state.user = null;
  state.userProfile = null;
  toast("Logged out.", "success");
  showPage("home");
}
