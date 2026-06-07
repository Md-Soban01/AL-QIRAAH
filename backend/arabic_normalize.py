import re

ARABIC_DIACRITICS = re.compile(r'''
    ّ|َ|ً|ُ|ٌ|ِ|ٍ|ْ|ٰ
''', re.VERBOSE)

NON_ARABIC_WORD_CHARS = re.compile(r"[^\u0600-\u06FF\s]")

def normalize_arabic(text: str) -> str:
    if not text:
        return ""

    text = text.strip()
    text = re.sub(ARABIC_DIACRITICS, "", text)

    replacements = {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ى": "ي",
        "ؤ": "و",
        "ئ": "ي",
        "ة": "ه",
        "ـ": "",
    }

    for k, v in replacements.items():
        text = text.replace(k, v)

    text = re.sub(NON_ARABIC_WORD_CHARS, " ", text)
    return " ".join(text.split())
