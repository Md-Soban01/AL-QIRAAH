const API_URL = "http://127.0.0.1:8000/analyze-word";

const ayahBox = document.getElementById("ayah-box");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const nextBtn = document.getElementById("nextBtn");
const retryBtn = document.getElementById("retryBtn");
const REFERENCE_AYAH_START = 1;

const surahSelect = document.getElementById("surahSelect");

let currentSurah = "001";

let ayahs = SURAHS[currentSurah].ayahs;

let ayahIndex = 0;
surahSelect.addEventListener("change", () => {

  currentSurah = surahSelect.value;

  ayahs = SURAHS[currentSurah].ayahs;

  ayahIndex = 0;

document.getElementById("surah-title").textContent =
    SURAHS[currentSurah].name;

  renderAyah();

});
let mediaRecorder = null;
let audioChunks = [];
let activeStream = null;

renderAyah();

startBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);
nextBtn.addEventListener("click", goNextAyah);
retryBtn.addEventListener("click", renderAyah);

function renderAyah() {
  ayahBox.innerHTML = `
    <p class="ayah-number">Ayah ${ayahIndex + 1}</p>
    <p class="arabic big">${ayahs[ayahIndex]}</p>
  `;
  setStatus("Press Start and recite clearly");
  setControls({ start: true, stop: false, retry: false, next: false });
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Microphone recording is not supported in this browser.", true);
    return;
  }

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(activeStream);

    mediaRecorder.addEventListener("dataavailable", event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", handleRecordingStopped, { once: true });
    mediaRecorder.start();

    setStatus("Listening... recite now");
    setControls({ start: false, stop: true, retry: false, next: false });
  } catch (error) {
    console.error(error);
    setStatus("Microphone permission was blocked or unavailable.", true);
    setControls({ start: true, stop: false, retry: false, next: false });
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;

  setStatus("Processing...");
  setControls({ start: false, stop: false, retry: false, next: false });
  mediaRecorder.stop();
}

async function handleRecordingStopped() {
  stopActiveStream();

  if (!audioChunks.length) {
    setStatus("No audio was captured. Try again.", true);
    setControls({ start: true, stop: false, retry: false, next: false });
    return;
  }

  const audioBlob = new Blob(audioChunks, { type: getRecordingMimeType() });
  audioChunks = [];

  try {
    setStatus("Analyzing...");
    const result = await analyzeRecitation(audioBlob);
    renderAnalysis(result);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Backend error. Make sure FastAPI is running.", true);
    setControls({ start: false, stop: false, retry: true, next: false });
  }
}

async function analyzeRecitation(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "ayah.webm");
  formData.append("surah_id", currentSurah);
  formData.append("ayah_index", String(ayahIndex + REFERENCE_AYAH_START));

  const response = await fetch(API_URL, {
    method: "POST",
    body: formData,
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Backend returned an unreadable response.");
  }

  if (!response.ok) {
    throw new Error(result.detail || "Backend could not analyze this audio.");
  }

  if (!Array.isArray(result.words)) {
    throw new Error("Backend response did not include word analysis.");
  }

  return result;
}

function renderAnalysis(result) {
  const wordsHtml = result.words.map(item => {
    const status = item.correct ? "correct" : item.status || "wrong";
    const spoken = item.spoken ? `Spoken: ${escapeHtml(item.spoken)}` : "Not detected";

    return `
      <span class="word ${status}" title="${spoken}">
        ${escapeHtml(item.word)}
      </span>
    `;
  }).join("");

  ayahBox.innerHTML = `
    <div class="analysis-result" dir="rtl">${wordsHtml}</div>
    <p class="transcription">
      <span class="transcription-label">Heard:</span>
      <span dir="rtl">${escapeHtml(result.transcription || "No speech detected")}</span>
    </p>
  `;

  const wrongCount = result.words.filter(item => !item.correct).length;
  setStatus(wrongCount === 0 ? "Excellent. All words matched." : `${wrongCount} word(s) need attention.`);
  setControls({ start: false, stop: false, retry: true, next: true });
}

function goNextAyah() {
  if (ayahIndex < ayahs.length - 1) {
    ayahIndex += 1;
    renderAyah();
    return;
  }

  setStatus("Surah completed");
  setControls({ start: false, stop: false, retry: false, next: false });
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setControls({ start, stop, retry, next }) {
  startBtn.disabled = !start;
  stopBtn.disabled = !stop;
  retryBtn.disabled = !retry;
  nextBtn.disabled = !next;
}

function stopActiveStream() {
  if (!activeStream) return;
  activeStream.getTracks().forEach(track => track.stop());
  activeStream = null;
}

function getRecordingMimeType() {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }

  return "audio/webm";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}