export const $ = (selector) => document.querySelector(selector);

export function showPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("hidden", page.dataset.page !== pageName);
  });
}

export function toast(message, type = "default") {
  const stack = $("#toastStack");
  const item = document.createElement("div");
  item.className = `toast toast--${type}`;
  item.textContent = message;
  stack.append(item);
  setTimeout(() => item.remove(), 4200);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatTime(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function renderEmpty(container, message) {
  container.innerHTML = `<div class="empty-state">${message}</div>`;
}

export function statusLabel(status) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending";
}
