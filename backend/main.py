from pathlib import Path
from difflib import SequenceMatcher

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import whisper
import json
import uuid
import subprocess

try:
    from .arabic_normalize import normalize_arabic
except ImportError:
    from arabic_normalize import normalize_arabic

app = FastAPI(title="AL-QIRAAH Word-Level ML")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading Whisper model...")
model = whisper.load_model("medium")
print("Whisper loaded.")

BASE_DIR = Path(__file__).resolve().parent
REF_DIR = BASE_DIR / "ref_new_words"
TEMP_AUDIO_DIR = BASE_DIR / "temp_audio"
TEMP_AUDIO_DIR.mkdir(exist_ok=True)


def save_audio(upload: UploadFile) -> str:
    temp_id = uuid.uuid4().hex
    suffix = Path(upload.filename or "").suffix or ".webm"
    input_path = TEMP_AUDIO_DIR / f"{temp_id}_input{suffix}"
    wav_path = TEMP_AUDIO_DIR / f"{temp_id}.wav"

    with input_path.open("wb") as f:
        f.write(upload.file.read())

    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-ar", "16000",
                "-ac", "1",
                str(wav_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("FFmpeg is not installed or is not available in PATH.") from exc
    except subprocess.CalledProcessError as exc:
        message = exc.stderr.strip() or exc.stdout.strip() or "Audio conversion failed."
        raise RuntimeError(message) from exc
    finally:
        input_path.unlink(missing_ok=True)

    return str(wav_path)


def similarity(a, b):
    return SequenceMatcher(
        None,
        normalize_arabic(a),
        normalize_arabic(b)
    ).ratio()


def compare_words(ref_words: list[str], spoken_words: list[str]) -> list[dict]:

    comparison = []
    used_spoken = set()

    for ref_word in ref_words:

        best_score = 0
        best_spoken = ""
        best_index = -1

        for idx, spoken in enumerate(spoken_words):

            if idx in used_spoken:
                continue

            score = similarity(ref_word, spoken)

            if score > best_score:
                best_score = score
                best_spoken = spoken
                best_index = idx

        if best_score == 0:
            comparison.append({
                "word": ref_word,
                "spoken": "",
                "correct": False,
                "status": "missing",
                "score": 0
            })
            continue

        used_spoken.add(best_index)

        if best_score >= 0.85:
            status = "correct"
            correct = True

        elif best_score >= 0.60:
            status = "probably"
            correct = False

        else:
            status = "wrong"
            correct = False

        comparison.append({
            "word": ref_word,
            "spoken": best_spoken,
            "correct": correct,
            "status": status,
            "score": round(best_score * 100, 1)
        })

    return comparison

@app.get("/")
def health_check():
    return {"status": "ok", "service": "AL-QIRAAH Word-Level ML"}


@app.post("/analyze-word")
async def analyze_word(
    audio: UploadFile = File(...),
    surah_id: str = Form(...),
    ayah_index: int = Form(...)
):
    if ayah_index < 1:
        raise HTTPException(status_code=400, detail="ayah_index must be 1 or greater")

    # Build reference filename
    surah_id = surah_id.zfill(3)
    ayah_str = str(ayah_index).zfill(3)
    ref_file = f"{surah_id}{ayah_str}.json"
    ref_path = REF_DIR / ref_file

    if not ref_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Reference not found: {ref_file}"
        )

    # Load reference
    with ref_path.open("r", encoding="utf-8") as f:
        ref_data = json.load(f)

    # Save & transcribe audio
    wav_path = None
    try:
        wav_path = save_audio(audio)
        result = model.transcribe(
            wav_path,
            language="ar",
            task="transcribe",
            fp16=False,
            temperature=0.0,
            beam_size=5,
            best_of=5,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            compression_ratio_threshold=2.4,
        )
        print("=" * 50)
        print("WHISPER OUTPUT:")
        print(result["text"])
        print("=" * 50)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if wav_path:
            Path(wav_path).unlink(missing_ok=True)

    spoken_words = result["text"].strip().split()
    ref_words = [w["text"] for w in ref_data["words"]]
    comparison = compare_words(ref_words, spoken_words)

    return {
        "surah": surah_id,
        "ayah": ayah_index,
        "transcription": result["text"].strip(),
        "reference_words": len(ref_words),
        "spoken_words": len(spoken_words),
        "words": comparison
    }
