const PRIMARY_HOSTS = [
  "https://api.cloudmoon.cloudbatata.com",
  "https://api.prod.cloudmoonapp.com",
  "https://api.prod.geometry.today",
];
const BACKUP_HOSTS = [
  "https://hrz5zfjq02.execute-api.us-east-1.amazonaws.com",
];
const VALID_SERVERS = ["21", "22", "23", "3", "4"];

let _cachedHost = null;

const profileModal      = document.getElementById("profile-modal");
const profileSigninView = document.getElementById("profile-signin-view");
const profileLoggedIn   = document.getElementById("profile-loggedin-view");
const profileEmailEl    = document.getElementById("profile-email-text");
const profileRegion     = document.getElementById("profile-region");
const profileBtn        = document.getElementById("profile-btn");
const profileSignout    = document.getElementById("profile-signout");
const closeProfileModal = document.getElementById("close-profile-modal");
const gameSection     = document.getElementById("game-section");
const signinForm      = document.getElementById("signin-form");
const searchInput     = document.getElementById("game-search");
const gamesGrid       = document.getElementById("games-grid");
const errorMsg        = document.getElementById("error-msg");
const serverSelect    = document.getElementById("server-select");
const signinServer    = document.getElementById("signin-server");
const connectingOverlay = document.getElementById("connecting-overlay");
const connectingMsg     = document.getElementById("connecting-msg");
const needAccountBtn    = document.getElementById("need-account-btn");

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
    } catch (_) {}
  }
  throw new Error("No CloudMoon API host is reachable right now.");
}

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

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("userData") || "null"); }
  catch { return null; }
}

function storeUser(userId, token, email) {
  localStorage.setItem("userData", JSON.stringify({ userId, token, email: email || "", init: true }));
}

function clearUser() {
  localStorage.removeItem("userData");
}

function getSelectedServer() {
  return localStorage.getItem("selectedServer") || "0";
}

function storeServer(id) {
  const s = String(id);
  if (VALID_SERVERS.includes(s)) {
    localStorage.setItem("selectedServer", s);
  }
}

function showGames() {
  gameSection.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSignin() {
  openProfileModal();
}

window.openProfileModal = openProfileModal;
function openProfileModal() {
  const user = getStoredUser();
  if (user?.token) {
    profileSigninView.style.display = "none";
    profileLoggedIn.style.display = "block";
    if (profileEmailEl) profileEmailEl.textContent = user.email || "Signed in";
    const saved = getSelectedServer();
    if (profileRegion && VALID_SERVERS.includes(saved)) profileRegion.value = saved;
  } else {
    profileSigninView.style.display = "block";
    profileLoggedIn.style.display = "none";
  }
  if (profileModal) profileModal.style.display = "flex";
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

function syncServerSelects(value) {
  if (serverSelect) serverSelect.value = value;
  if (signinServer) signinServer.value = value;
}

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
  if (data.code === 40030) msg = "This account uses Google sign-in. Visit cloudmoonapp.com to set a password first.";
  else if (data.code === 40031) msg = "Incorrect password. Please try again.";
  else if (data.code === 40032) msg = "No account found for this email. Create one at cloudmoonapp.com, then sign in here.";
  return { ok: false, code: data.code, msg };
}

async function getAndroidId() {
  const res = await apiFetch("/phone/list");
  const data = await res.json();
  if (data.code === 0 && data.data?.list?.length > 0) {
    return data.data.list[0].android_id;
  }
  return null;
}

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
      const sid = data.data.sid;
      showConnecting("Resolving session…");

      let sidData = null;
      try {
        const sidRes  = await apiFetch(`/web/sid?sid=${encodeURIComponent(sid)}`);
        const sidJson = await sidRes.json();
        if (sidJson.code === 0) sidData = sidJson.data;
      } catch (_) {}

      showConnecting("Launching game…");

      const p = new URLSearchParams({ sid });
      p.set("game", packageName);
      if (sidData) {
        if (sidData.token)               p.set("token",               sidData.token);
        if (sidData.email)               p.set("email",               sidData.email);
        if (sidData.android_id)          p.set("userid",              sidData.android_id);
        if (sidData.coor_tunnel)         p.set("coor_tunnel",         sidData.coor_tunnel);
        if (sidData.coor_cloudfront)     p.set("coor_cloudfront",     sidData.coor_cloudfront);
        if (sidData.android_instance_id) p.set("android_instance_id", sidData.android_instance_id);
      } else {
        const u = getStoredUser();
        if (u?.token)  p.set("token",  u.token);
        if (u?.userId) p.set("userid", u.userId);
      }

      window.location.href = `../run-site/run.html?${p.toString()}`;
    } else {
      hideConnecting();
      alert(data.message || "Failed to connect to game server, This can be because of the l.");
    }
  } catch (err) {
    hideConnecting();
    alert("Network error: " + err.message);
  }
}

(function init() {
  const saved = getSelectedServer();
  if (VALID_SERVERS.includes(saved)) syncServerSelects(saved);
  showGames();
})();

signinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

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
      // also persist email for profile display
      const ud = getStoredUser();
      if (ud) { ud.email = email; localStorage.setItem("userData", JSON.stringify(ud)); }
      if (profileModal) profileModal.style.display = "none";
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

if (profileBtn) profileBtn.addEventListener("click", openProfileModal);

if (closeProfileModal) closeProfileModal.addEventListener("click", () => {
  if (profileModal) profileModal.style.display = "none";
});

if (profileModal) {
  profileModal.addEventListener("click", (e) => {
    if (e.target === profileModal) profileModal.style.display = "none";
  });
}

if (profileSignout) {
  profileSignout.addEventListener("click", () => {
    clearUser();
    profileLoggedIn.style.display = "none";
    profileSigninView.style.display = "block";
    // stay on games page, just update profile modal state
  });
}

if (profileRegion) {
  profileRegion.addEventListener("change", () => {
    storeServer(profileRegion.value);
    if (serverSelect) serverSelect.value = profileRegion.value;
    if (signinServer) signinServer.value = profileRegion.value;
  });
}

if (needAccountBtn) {
  needAccountBtn.addEventListener("click", () => {
    window.open("https://cloudmoonapp.com", "_blank", "noopener");
  });
}

searchInput.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  gamesGrid.querySelectorAll(".game-card").forEach((card) => {
    card.style.display = card.dataset.name.toLowerCase().includes(q) ? "grid" : "none";
  });
});

gamesGrid.addEventListener("click", (e) => {
  const btn  = e.target.closest("button");
  if (!btn) return;
  const card = btn.closest(".game-card");
  if (!card) return;
  const pkg  = card.dataset.pkg;
  if (!pkg) return;
  launchGame(pkg);
});

if (serverSelect) {
  serverSelect.addEventListener("change", () => {
    storeServer(serverSelect.value);
    if (signinServer) signinServer.value = serverSelect.value;
  });
}

if (signinServer) {
  signinServer.addEventListener("change", () => {
    storeServer(signinServer.value);
    if (serverSelect) serverSelect.value = signinServer.value;
  });
}
