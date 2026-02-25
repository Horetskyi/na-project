/**
 * LibreTranslate API client with rate-limiting and retry logic.
 * Implements the TranslationEngine interface.
 */

import {
  toLtCode,
  DEFAULT_API_URL,
  RATE_LIMIT_MS,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from "./config.js";
import type { TranslateOptions, TranslationEngine } from "./engine.js";

// Re-export for backward compatibility
export type { TranslateOptions } from "./engine.js";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface TranslateResponse {
  translatedText: string;
  detectedLanguage?: { confidence: number; language: string };
}

interface LTLanguage {
  code: string;
  name: string;
  targets: string[];
}

/* ------------------------------------------------------------------ */
/*  Client                                                            */
/* ------------------------------------------------------------------ */

export class LibreTranslateClient implements TranslationEngine {
  readonly name = "LibreTranslate";

  private apiUrl: string;
  private apiKey?: string;
  private supportedCodes: Set<string> | null = null;
  private lastCallAt = 0;

  constructor(apiUrl?: string, apiKey?: string) {
    this.apiUrl = (apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  /* ---- Public API ------------------------------------------------ */

  /**
   * Translate a single text string.
   * Returns `null` if the source or target language is unsupported.
   */
  async translate(opts: TranslateOptions): Promise<string | null> {
    const source = toLtCode(opts.source);
    const target = toLtCode(opts.target);

    const supported = await this.getSupportedLanguages();
    if (!supported.has(source) || !supported.has(target)) {
      return null;
    }

    await this.rateLimit();

    const body: Record<string, string> = {
      q: opts.q,
      source,
      target,
      format: opts.format ?? "text",
    };
    if (this.apiKey) body.api_key = this.apiKey;

    const data = await this.post<TranslateResponse>("/translate", body);
    return data.translatedText;
  }

  /**
   * Translate a batch of texts (same source/target).
   * LibreTranslate accepts `q` as an array for batch requests.
   * Falls back to sequential if not supported.
   */
  async translateBatch(
    texts: string[],
    source: string,
    target: string,
    format: "text" | "html" = "text"
  ): Promise<(string | null)[]> {
    if (texts.length === 0) return [];

    const srcLt = toLtCode(source);
    const tgtLt = toLtCode(target);

    const supported = await this.getSupportedLanguages();
    if (!supported.has(srcLt) || !supported.has(tgtLt)) {
      return texts.map(() => null);
    }

    // Try batch first
    try {
      await this.rateLimit();
      const body: Record<string, unknown> = {
        q: texts,
        source: srcLt,
        target: tgtLt,
        format,
      };
      if (this.apiKey) body.api_key = this.apiKey;

      const data = await this.post<{ translatedText: string[] }>(
        "/translate",
        body
      );
      if (Array.isArray(data.translatedText)) {
        return data.translatedText;
      }
    } catch {
      // fallback to sequential
    }

    // Sequential fallback
    const results: (string | null)[] = [];
    for (const text of texts) {
      results.push(
        await this.translate({ q: text, source, target, format })
      );
    }
    return results;
  }

  /**
   * Get the set of language codes supported by the LibreTranslate instance.
   */
  async getSupportedLanguages(): Promise<Set<string>> {
    if (this.supportedCodes) return this.supportedCodes;

    await this.rateLimit();
    const langs = await this.get<LTLanguage[]>("/languages");
    this.supportedCodes = new Set(langs.map((l) => l.code));
    return this.supportedCodes;
  }

  /**
   * Check whether a LibreTranslate instance is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getSupportedLanguages();
      return true;
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
    return this.request<T>(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit
  ): Promise<T> {
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.apiUrl}${endpoint}`, init);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `LibreTranslate ${res.status} ${res.statusText}: ${text}`
          );
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
