/**
 * Translation engine abstraction.
 *
 * All translation backends (LibreTranslate, NLLB-200, etc.) implement
 * this interface so the rest of the codebase is engine-agnostic.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface TranslateOptions {
  /** Text to translate. */
  q: string;
  /** Source language (project locale such as "uk"). */
  source: string;
  /** Target language (project locale such as "en"). */
  target: string;
  /** "text" (default) or "html". */
  format?: "text" | "html";
}

/* ------------------------------------------------------------------ */
/*  Interface                                                         */
/* ------------------------------------------------------------------ */

export interface TranslationEngine {
  /** Human-readable engine name (for log messages). */
  readonly name: string;

  /**
   * When `true`, the engine produces better results translating
   * individual lines / sentences rather than large blocks of text.
   * The content translators will split source text line-by-line before
   * calling `translateBatch`, instead of sending big HTML chunks.
   */
  readonly prefersLineByLine?: boolean;

  /**
   * Translate a single text string.
   * Returns `null` if the language pair is unsupported.
   */
  translate(opts: TranslateOptions): Promise<string | null>;

  /**
   * Translate a batch of texts (same source/target pair).
   * Default implementation calls `translate()` sequentially.
   */
  translateBatch(
    texts: string[],
    source: string,
    target: string,
    format?: "text" | "html"
  ): Promise<(string | null)[]>;

  /**
   * Return the set of language codes supported by this engine.
   */
  getSupportedLanguages(): Promise<Set<string>>;

  /**
   * Check whether the engine backend is reachable.
   */
  healthCheck(): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/*  Supported engine types                                            */
/* ------------------------------------------------------------------ */

export type EngineName = "libretranslate" | "nllb200";

export const ENGINE_NAMES: EngineName[] = ["libretranslate", "nllb200"];
