let index = 0;

function nextAyah() {
  index++;
  if (index < ayahs.length) {
    document.querySelector(".arabic").innerText = ayahs[index];
  }
}
