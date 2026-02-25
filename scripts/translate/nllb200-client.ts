/**
 * NLLB-200 translation engine client.
 *
 * Uses a FastAPI backend running Meta's NLLB-200 model.
 * API reference: https://github.com/somenath203/next-nllb200-language-translator
 *
 * POST /translate
 *   Body: { languageText: string, sourceLanguageCode: string, targetLanguageCode: string }
 *   Response: { success: boolean, translated_text?: string, message?: string }
 */

import {
  RATE_LIMIT_MS,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from "./config.js";
import type { TranslateOptions, TranslationEngine } from "./engine.js";

/* ------------------------------------------------------------------ */
/*  NLLB-200 language code mapping                                    */
/*  Project locale → NLLB flores-200 code                            */
/* ------------------------------------------------------------------ */

const LOCALE_TO_NLLB: Record<string, string> = {
  en: "eng_Latn",
  hi: "hin_Deva",
  bn: "ben_Beng",
  ur: "urd_Arab",
  ta: "tam_Taml",
  te: "tel_Telu",
  ml: "mal_Mlym",
  es: "spa_Latn",
  fr: "fra_Latn",
  de: "deu_Latn",
  zh: "zho_Hans",
  ru: "rus_Cyrl",
  pt: "por_Latn",
  ja: "jpn_Jpan",
  ko: "kor_Hang",
  it: "ita_Latn",
  nl: "nld_Latn",
  el: "ell_Grek",
  pl: "pol_Latn",
  tr: "tur_Latn",
  sv: "swe_Latn",
  da: "dan_Latn",
  fi: "fin_Latn",
  hu: "hun_Latn",
  cs: "ces_Latn",
  no: "nob_Latn",
  ro: "ron_Latn",
  sk: "slk_Latn",
  hr: "hrv_Latn",
  bg: "bul_Cyrl",
  uk: "ukr_Cyrl",
  sr: "srp_Cyrl",
  he: "heb_Hebr",
  ar: "arb_Arab",
  th: "tha_Thai",
  vi: "vie_Latn",
  id: "ind_Latn",
  ms: "zsm_Latn",
  sw: "swh_Latn",
  fa: "pes_Arab",
  my: "mya_Mymr",
  // Additional NLLB languages (not in the original 50-language demo but
  // supported by the NLLB-200 model)
  lv: "lvs_Latn",
  lt: "lit_Latn",
};

/** Convert a project locale to the NLLB flores-200 code. */
function toNllbCode(locale: string): string | undefined {
  return LOCALE_TO_NLLB[locale];
}

/* ------------------------------------------------------------------ */
/*  API types                                                         */
/* ------------------------------------------------------------------ */

interface NllbTranslateResponse {
  success: boolean;
  translated_text?: string;
  message?: string;
}

/* ------------------------------------------------------------------ */
/*  Default URL                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_NLLB_URL = "https://som11-language-translator.hf.space";

/* ------------------------------------------------------------------ */
/*  Client                                                            */
/* ------------------------------------------------------------------ */

export class Nllb200Client implements TranslationEngine {
  readonly name = "NLLB-200";

  private apiUrl: string;
  private supportedCodes: Set<string> | null = null;
  private lastCallAt = 0;

  constructor(apiUrl?: string) {
    this.apiUrl = (apiUrl ?? DEFAULT_NLLB_URL).replace(/\/+$/, "");
  }

  /* ---- Public API ------------------------------------------------ */

  /**
   * Translate a single text string.
   * Returns `null` if the source or target language is unsupported.
   */
  async translate(opts: TranslateOptions): Promise<string | null> {
    const srcCode = toNllbCode(opts.source);
    const tgtCode = toNllbCode(opts.target);

    if (!srcCode || !tgtCode) {
      return null;
    }

    // For HTML format: strip tags before sending (NLLB doesn't handle HTML),
    // then re-wrap after. This is a basic approach — the contents-texts module
    // handles the full md→html→translate→html→md pipeline.
    const textToTranslate =
      opts.format === "html" ? stripHtmlTags(opts.q) : opts.q;

    await this.rateLimit();

    const body = {
      languageText: textToTranslate,
      sourceLanguageCode: srcCode,
      targetLanguageCode: tgtCode,
    };

    try {
      const data = await this.post<NllbTranslateResponse>("/translate", body);

      if (!data.success || !data.translated_text) {
        // The API returns success:false for wrong language combos etc.
        return null;
      }

      return data.translated_text;
    } catch {
      return null;
    }
  }

  /**
   * Translate a batch of texts sequentially.
   * NLLB API doesn't support batch natively.
   */
  async translateBatch(
    texts: string[],
    source: string,
    target: string,
    format: "text" | "html" = "text"
  ): Promise<(string | null)[]> {
    const results: (string | null)[] = [];
    for (const text of texts) {
      results.push(
        await this.translate({ q: text, source, target, format })
      );
    }
    return results;
  }

  /**
   * Return project locales that have an NLLB mapping.
   */
  async getSupportedLanguages(): Promise<Set<string>> {
    if (this.supportedCodes) return this.supportedCodes;
    this.supportedCodes = new Set(Object.keys(LOCALE_TO_NLLB));
    return this.supportedCodes;
  }

  /**
   * Check whether the NLLB API is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.rateLimit();
      const res = await fetch(this.apiUrl);
      if (!res.ok) return false;
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch {
      return false;
    }
  }

  /* ---- Internal helpers ------------------------------------------ */

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallAt;
    if (elapsed < RATE_LIMIT_MS) {
      await sleep(RATE_LIMIT_MS - elapsed);
    }
    this.lastCallAt = Date.now();
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.apiUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`NLLB-200 ${res.status} ${res.statusText}: ${text}`);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err as Error;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }
    throw lastErr;
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Very basic HTML tag stripper for plain-text translation.
 * Preserves the text content between tags.
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
