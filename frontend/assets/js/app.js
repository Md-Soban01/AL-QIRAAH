const savedTheme = localStorage.getItem("theme") || "dark";
document.body.classList.add(savedTheme);
updateThemeButton(savedTheme);

function toggleTheme() {
  const newTheme = document.body.classList.contains("dark") ? "light" : "dark";
  document.body.className = newTheme;
  localStorage.setItem("theme", newTheme);
  updateThemeButton(newTheme);
}

function updateThemeButton(theme) {
  const themeBtn = document.querySelector(".theme-btn");
  if (!themeBtn) return;

  themeBtn.textContent = theme === "light" ? "☀️" : "🌙";
}

function goToSurahs() {
  window.location.href = "surah.html";
}

function selectSurah(num) {
  localStorage.setItem("surah", num);
  window.location.href = "recite.html";
}