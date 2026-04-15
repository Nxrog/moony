// ============================================================
// CloudMoon — testingmoon/app.js
// ============================================================


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
const connectingMsg     = document.getElementById("connecting-msg");
const needAccountBtn    = document.getElementById("need-account-btn");
const accountModal      = document.getElementById("account-modal");
const closeAccountModal = document.getElementById("close-account-modal");

const timeBadge = document.getElementById("time-badge");
let _timeBadgeInterval = null;

function _fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function startTimerBadge(secLeft, isUnlimited) {
  if (!timeBadge) return;
  clearInterval(_timeBadgeInterval);
  if (isUnlimited) {
    timeBadge.textContent = "∞ Unlimited";
    timeBadge.style.display = "inline-block";
    return;
  }
  let remaining = Math.max(0, secLeft);
  function update() {
    if (remaining <= 0) {
      timeBadge.textContent = "⏱ 0:00";
      clearInterval(_timeBadgeInterval);
      return;
    }
    timeBadge.textContent = "⏱ " + _fmtTime(remaining);
    timeBadge.style.display = "inline-block";
  }
  update();
  _timeBadgeInterval = setInterval(function () {
    remaining--;
    update();
  }, 1000);
}

async function fetchTimeLeft() {
  try {
    const res = await apiFetch("/web/ad", {
      method: "POST",
      body: JSON.stringify({ game_name: "com.supercell.brawlstars" }),
    });
    const data = await res.json();
    if (data.code === 0) {
      startTimerBadge(data.data.timeSecLeft, data.data.unlimit);
    }
  } catch (_) {}
}


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
     
    }
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

function storeUser(userId, token) {
  localStorage.setItem("userData", JSON.stringify({ userId, token, init: true }));
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
  signinPanel.style.display = "none";
  gameSection.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
  fetchTimeLeft();
}

function showSignin() {
  gameSection.style.display = "none";
  signinPanel.style.display = "grid";
  window.scrollTo({ top: 0, behavior: "smooth" });
  clearInterval(_timeBadgeInterval);
  if (timeBadge) timeBadge.style.display = "none";
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
      } catch (_) { /* non-fatal — run-site will try its own /web/sid */ }

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
      alert(data.message || "Failed to connect to game server. Please try again.");
    }
  } catch (err) {
    hideConnecting();
    alert("Network error: " + err.message);
  }
}

// ============================================================
// INIT  
// ============================================================
(function init() {

  const saved = getSelectedServer();
  if (VALID_SERVERS.includes(saved)) syncServerSelects(saved);

  const user = getStoredUser();
  if (user?.token && user?.init) {
    showGames();
  }
})();

// ============================================================
// EVENT LISTENERS
// ============================================================

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
    btn.textContent = "Continue →";
  }
});

signoutBtn.addEventListener("click", () => {
  clearUser();
  showSignin();
});

if (needAccountBtn) {
  needAccountBtn.addEventListener("click", () => {
    if (accountModal) accountModal.style.display = "flex";
  });
}
if (closeAccountModal) {
  closeAccountModal.addEventListener("click", () => {
    if (accountModal) accountModal.style.display = "none";
  });
}
if (accountModal) {
  accountModal.addEventListener("click", (e) => {
    if (e.target === accountModal) accountModal.style.display = "none";
  });
}

searchInput.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  gamesGrid.querySelectorAll(".game-card").forEach((card) => {
    card.style.display = card.dataset.name.toLowerCase().includes(q) ? "flex" : "none";
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
