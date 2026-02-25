"""
Self-hosted NLLB-200 translation server.

Based on: https://github.com/somenath203/next-nllb200-language-translator
Model:    facebook/nllb-200-distilled-600M

POST /translate
  Body: { languageText, sourceLanguageCode, targetLanguageCode }
  Response: { success, translated_text } | { success, message }

GET /
  Health check.
"""

from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os

# ---------- cache dir (optional) ----------
cache_dir = os.path.join(os.path.dirname(__file__), ".cache")
os.makedirs(cache_dir, exist_ok=True)
os.environ.setdefault("HF_HOME", cache_dir)

# ---------- FastAPI app ----------
app = FastAPI(title="NLLB-200 Translation Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Load model at startup ----------
MODEL_NAME = "facebook/nllb-200-distilled-600M"

print(f"[NLLB-200] Loading model {MODEL_NAME} …")
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
print("[NLLB-200] Model loaded successfully.")

# ---------- Language code mapping ----------
language_code_mapping = {
    "en":    "eng_Latn",
    "hi":    "hin_Deva",
    "bn":    "ben_Beng",
    "bho":   "bho_Deva",
    "ur":    "urd_Arab",
    "ta":    "tam_Taml",
    "te":    "tel_Telu",
    "ml":    "mal_Mlym",
    "es":    "spa_Latn",
    "fr":    "fra_Latn",
    "de":    "deu_Latn",
    "zh":    "zho_Hans",
    "ru":    "rus_Cyrl",
    "pt":    "por_Latn",
    "ja":    "jpn_Jpan",
    "ko":    "kor_Hang",
    "it":    "ita_Latn",
    "nl":    "nld_Latn",
    "el":    "ell_Grek",
    "pl":    "pol_Latn",
    "tr":    "tur_Latn",
    "sv":    "swe_Latn",
    "da":    "dan_Latn",
    "fi":    "fin_Latn",
    "hu":    "hun_Latn",
    "cs":    "ces_Latn",
    "no":    "nob_Latn",
    "ro":    "ron_Latn",
    "sk":    "slk_Latn",
    "hr":    "hrv_Latn",
    "bg":    "bul_Cyrl",
    "uk":    "ukr_Cyrl",
    "sr":    "srp_Cyrl",
    "he":    "heb_Hebr",
    "ar":    "arb_Arab",
    "th":    "tha_Thai",
    "vi":    "vie_Latn",
    "id":    "ind_Latn",
    "ms":    "zsm_Latn",
    "tl":    "tgl_Latn",
    "sw":    "swh_Latn",
    "am":    "amh_Ethi",
    "so":    "som_Latn",
    "ha":    "hau_Latn",
    "yo":    "yor_Latn",
    "zu":    "zul_Latn",
    "xh":    "xho_Latn",
    "ig":    "ibo_Latn",
    "uz":    "uzb_Latn",
    "kk":    "kaz_Cyrl",
    "fa":    "pes_Arab",
    "my":    "mya_Mymr",
    "lv":    "lvs_Latn",
    "lt":    "lit_Latn",
}

# Reverse mapping for validation
nllb_code_set = set(language_code_mapping.values())


class LanguageTextModel(BaseModel):
    languageText: str
    sourceLanguageCode: str
    targetLanguageCode: str


@app.get("/")
def welcome():
    return {
        "success": True,
        "message": 'Server of "NLLB-200 language translator" is up and running successfully',
    }


@app.post("/translate")
async def translate_text(req: LanguageTextModel):
    try:
        src = req.sourceLanguageCode
        tgt = req.targetLanguageCode

        # Validate codes
        if src not in nllb_code_set:
            return {"success": False, "message": f"Unsupported source language code: {src}"}
        if tgt not in nllb_code_set:
            return {"success": False, "message": f"Unsupported target language code: {tgt}"}

        # Tokenize with source language set
        tokenizer.src_lang = src
        inputs = tokenizer(req.languageText, return_tensors="pt", truncation=True, max_length=1024)

        # Get the target language token id
        tgt_lang_id = tokenizer.convert_tokens_to_ids(tgt)

        # Generate translation
        translated_tokens = model.generate(
            **inputs,
            forced_bos_token_id=tgt_lang_id,
            max_new_tokens=1024,
        )

        translated_text = tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)[0]

        return {
            "success": True,
            "translated_text": translated_text,
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "success": False,
            "message": "Something went wrong. Please try again later.",
        }
