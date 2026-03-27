// ============================================================
// CloudMoon — testingmoon/app.js
// Real API integration: login → phone/connect → run.html?sid=
// ============================================================

// ===== CONFIG =====
const PRIMARY_HOSTS = [
  "https://api.cloudmoon.cloudbatata.com",
  "https://api.prod.cloudmoonapp.com",
  "https://api.prod.geometry.today",
];
const BACKUP_HOSTS = [
  "https://hrz5zfjq02.execute-api.us-east-1.amazonaws.com",
];
// Server IDs as used by the real CloudMoon app
const VALID_SERVERS = ["21", "22", "23", "3", "4"];
// Google OAuth client ID (same as the real CloudMoon app)
const GOOGLE_CLIENT_ID = "196443591263-k5447s9icscrq54n57j29lmvm05addbe.apps.googleusercontent.com";

// ===== STATE =====
let _cachedHost = null;

// ===== DOM REFS =====
const signinPanel     = document.getElementById("signin-panel");
const gameSection     = document.getElementById("game-section");
const signinForm      = document.getElementById("signin-form");
const signoutBtn      = document.getElementById("signout");
const searchInput     = document.getElementById("game-search");
const gamesGrid       = document.getElementById("games-grid");
const errorMsg        = document.getElementById("error-msg");
const serverSelect    = document.getElementById("server-select");    // game section
const signinServer    = document.getElementById("signin-server");    // sign-in form
const connectingOverlay = document.getElementById("connecting-overlay");
const connectingMsg   = document.getElementById("connecting-msg");

// ============================================================
// API HOST DISCOVERY
// Pings /_ping on each host; uses the first one that responds
// ============================================================
async function discoverApiHost() {
  if (_cachedHost) return _cachedHost;

  const stored = sessionStorage.getItem("cm_host");
  if (stored) { _cachedHost = stored; return stored; }

  for (const host of [...PRIMARY_HOSTS, ...BACKUP_HOSTS]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${host}/_ping`, {
        method: "GET",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok || res.status < 500) {
        _cachedHost = host;
        sessionStorage.setItem("cm_host", host);
        return host;
      }
    } catch (_) {
      // unreachable — try next
    }
  }
  throw new Error("No CloudMoon API host is reachable right now.");
}

// ============================================================
// AUTHENTICATED FETCH WRAPPER
// Adds X-User-Token, Content-Type, and device query params
// ============================================================
async function apiFetch(path, opts = {}) {
  const host = await discoverApiHost();
  const url = new URL(path, host);
  url.searchParams.set("device_type", "web");
  url.searchParams.set("site", "cm");

  const headers = new Headers(opts.headers || {});
  headers.set("Content-Type", "application/json");

  const user = getStoredUser();
  if (user?.token) headers.set("X-User-Token", user.token);

  return fetch(url.toString(), { ...opts, headers });
}

// ============================================================
// USER STORAGE  (localStorage key: "userData")
// ============================================================
function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("userData") || "null"); }
  catch { return null; }
}

function storeUser(userId, token) {
  localStorage.setItem("userData", JSON.stringify({ userId, token, init: true }));
}

function clearUser() {
  localStorage.removeItem("userData");
}

// ============================================================
// SERVER SELECTION  (localStorage key: "selectedServer")
// ============================================================
function getSelectedServer() {
  return localStorage.getItem("selectedServer") || "0";
}

function storeServer(id) {
  const s = String(id);
  if (VALID_SERVERS.includes(s)) {
    localStorage.setItem("selectedServer", s);
  }
}

// ============================================================
// UI HELPERS
// ============================================================
function showGames() {
  signinPanel.style.display = "none";
  gameSection.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSignin() {
  gameSection.style.display = "none";
  signinPanel.style.display = "grid";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showError(msg) {
  if (!errorMsg) return;
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}

function hideError() {
  if (!errorMsg) return;
  errorMsg.textContent = "";
  errorMsg.style.display = "none";
}

function showConnecting(msg) {
  if (!connectingOverlay) return;
  if (connectingMsg) connectingMsg.textContent = msg || "Connecting…";
  connectingOverlay.style.display = "flex";
}

function hideConnecting() {
  if (connectingOverlay) connectingOverlay.style.display = "none";
}

// Sync both server dropdowns to the same value
function syncServerSelects(value) {
  if (serverSelect) serverSelect.value = value;
  if (signinServer) signinServer.value = value;
}

// ============================================================
// LOGIN  —  POST /login/pwd
// ============================================================
async function login(email, password) {
  const res = await apiFetch("/login/pwd", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();

  if (data.code === 0) {
    storeUser(data.data.user_id, data.data.token);
    return { ok: true };
  }

  let msg = data.message || "Login failed";
  if (data.code === 40030) msg = "Password not set for this account. Use Google login.";
  else if (data.code === 40031) msg = "Incorrect password. Please try again.";
  else if (data.code === 40032) msg = "Email not registered on CloudMoon.";
  return { ok: false, msg };
}

// ============================================================
// PHONE LIST  —  GET /phone/list
// Returns android_id of the user's allocated device
// ============================================================
async function getAndroidId() {
  const res = await apiFetch("/phone/list");
  const data = await res.json();
  if (data.code === 0 && data.data?.list?.length > 0) {
    return data.data.list[0].android_id;
  }
  return null;
}

// ============================================================
// GAME LAUNCH  —  POST /phone/connect  →  run.html?sid=…
// ============================================================
async function launchGame(packageName) {
  const user = getStoredUser();
  if (!user?.token) { showSignin(); return; }

  const serverId = getSelectedServer();
  if (!VALID_SERVERS.includes(String(serverId))) {
    alert("Please select a server region before playing.\n\nUse the server dropdown at the top of the game list.");
    if (serverSelect) serverSelect.focus();
    return;
  }

  showConnecting("Getting your device…");

  try {
    const androidId = await getAndroidId();
    if (!androidId) {
      hideConnecting();
      alert("No device found for your account.\nPlease check your CloudMoon subscription.");
      return;
    }

    showConnecting("Connecting to game server…");

    const res = await apiFetch("/phone/connect", {
      method: "POST",
      body: JSON.stringify({
        android_id: androidId,
        game_name: packageName,
        screen_res: "720x1280",
        server_id: parseInt(serverId),
        params: JSON.stringify({ language: "en", locale: "" }),
        ad_unblock: true,
      }),
    });
    const data = await res.json();

    if (data.code === 0 && data.data?.sid) {
      showConnecting("Launching game…");
      window.location.href = `../run-site/run.html?sid=${encodeURIComponent(data.data.sid)}`;
    } else {
      hideConnecting();
      alert(data.message || "Failed to connect to game server. Please try again.");
    }
  } catch (err) {
    hideConnecting();
    alert("Network error: " + err.message);
  }
}

// ============================================================
// INIT  —  restore session / server selection on page load
// ============================================================
(function init() {
  // Restore server selection
  const saved = getSelectedServer();
  if (VALID_SERVERS.includes(saved)) syncServerSelects(saved);

  // Skip sign-in if already logged in
  const user = getStoredUser();
  if (user?.token && user?.init) {
    showGames();
  }
})();

// ============================================================
// EVENT LISTENERS
// ============================================================

// Sign-in form submit
signinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // Save server choice from sign-in panel
  if (signinServer) storeServer(signinServer.value);
  if (signinServer) syncServerSelects(signinServer.value);

  if (!email)    { showError("Please enter your email."); return; }
  if (!password) { showError("Please enter your password."); return; }

  const btn = signinForm.querySelector("[type=submit]");
  btn.disabled = true;
  btn.textContent = "Signing in…";

  try {
    const result = await login(email, password);
    if (result.ok) {
      showGames();
    } else {
      showError(result.msg);
    }
  } catch (err) {
    showError("Network error — check your connection and try again.");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Continue to game list";
  }
});

// Sign out
signoutBtn.addEventListener("click", () => {
  clearUser();
  showSignin();
});

// Search / filter
searchInput.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  gamesGrid.querySelectorAll(".game-card").forEach((card) => {
    card.style.display = card.dataset.name.toLowerCase().includes(q) ? "grid" : "none";
  });
});

// Game card click — launch via real API
gamesGrid.addEventListener("click", (e) => {
  const btn  = e.target.closest("button");
  if (!btn) return;
  const card = btn.closest(".game-card");
  if (!card) return;
  const pkg  = card.dataset.pkg;
  if (!pkg) return;
  launchGame(pkg);
});

// Server dropdown in game section
if (serverSelect) {
  serverSelect.addEventListener("change", () => {
    storeServer(serverSelect.value);
    if (signinServer) signinServer.value = serverSelect.value;
  });
}

// Server dropdown in sign-in panel
if (signinServer) {
  signinServer.addEventListener("change", () => {
    storeServer(signinServer.value);
    if (serverSelect) serverSelect.value = signinServer.value;
  });
}
