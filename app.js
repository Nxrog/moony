const signinPanel = document.getElementById("signin-panel");
const gameSection = document.getElementById("game-section");
const signinForm = document.getElementById("signin-form");
const signout = document.getElementById("signout");
const search = document.getElementById("game-search");
const gamesGrid = document.getElementById("games-grid");

const showGames = () => {
  signinPanel.style.display = "none";
  gameSection.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const showSignin = () => {
  gameSection.style.display = "none";
  signinPanel.style.display = "grid";
  window.scrollTo({ top: 0, behavior: "smooth" });
};

signinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showGames();
});

signout.addEventListener("click", showSignin);

search.addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  const cards = gamesGrid.querySelectorAll(".game-card");
  cards.forEach((card) => {
    const name = card.dataset.name.toLowerCase();
    card.style.display = name.includes(query) ? "grid" : "none";
  });
});

gamesGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const card = button.closest(".game-card");
  if (!card) return;

  const url = card.dataset.url || "../run-site/run.html";
  window.location.href = url;
});
