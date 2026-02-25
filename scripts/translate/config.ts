/**
 * Configuration for the translator utility.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* ------------------------------------------------------------------ */
/*  Paths (relative to project root)                                  */
/* ------------------------------------------------------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, "../..");

export const MESSAGES_DIR = path.join(PROJECT_ROOT, "messages");

export const CONTENTS_TEXTS_DIR = path.join(
  PROJECT_ROOT,
  "Data",
  "ContentsTexts"
);

export const LANGUAGES_JSON = path.join(
  PROJECT_ROOT,
  "Data",
  "languages.json"
);

export const CONTENTS_JSON = path.join(PROJECT_ROOT, "Data", "contents.json");

/**
 * Return all contents JSON file paths (contents.json, contents2.json, …).
 */
export function getAllContentsJsonPaths(): string[] {
  const dataDir = path.join(PROJECT_ROOT, "Data");
  return fs.readdirSync(dataDir)
    .filter((f) => /^contents\d*\.json$/.test(f))
    .sort()
    .map((f) => path.join(dataDir, f));
}

export const AUTHORS_JSON = path.join(PROJECT_ROOT, "Data", "authors.json");

/* ------------------------------------------------------------------ */
/*  LibreTranslate mapping                                            */
/*  Project locale  →  LibreTranslate language code                   */
/*  (only entries that differ from the project code)                  */
/* ------------------------------------------------------------------ */

export const LOCALE_TO_LT: Record<string, string> = {
  // Norwegian Bokmål is "nb" in LibreTranslate
  no: "nb",
  // Hebrew – LT may use "he" – keep as-is; add mapping if needed
};

/**
 * Reverse map (LibreTranslate code → project locale).
 */
export const LT_TO_LOCALE: Record<string, string> = Object.fromEntries(
  Object.entries(LOCALE_TO_LT).map(([k, v]) => [v, k])
);

/**
 * Convert a project locale to the LibreTranslate language code.
 */
export function toLtCode(locale: string): string {
  return LOCALE_TO_LT[locale] ?? locale;
}

/**
 * Convert a LibreTranslate language code back to the project locale.
 */
export function toLocale(ltCode: string): string {
  return LT_TO_LOCALE[ltCode] ?? ltCode;
}

/* ------------------------------------------------------------------ */
/*  Default settings                                                  */
/* ------------------------------------------------------------------ */

export const DEFAULT_API_URL = "http://localhost:5000";

/** Delay between API calls (ms) to avoid overwhelming the server. */
export const RATE_LIMIT_MS = 250;

/** Maximum retries on API failure. */
export const MAX_RETRIES = 3;

/** Wait (ms) before retrying a failed request. */
export const RETRY_DELAY_MS = 1000;
