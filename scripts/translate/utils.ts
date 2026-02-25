/**
 * Shared utilities for the translator scripts.
 */

import fs from "fs/promises";
import path from "path";
import { LANGUAGES_JSON } from "./config.js";

/* ------------------------------------------------------------------ */
/*  Language helpers                                                   */
/* ------------------------------------------------------------------ */

export interface LanguageEntry {
  name: string;
  originalName: string;
  code: string;
  translate: Record<string, string>;
}

let _languages: LanguageEntry[] | null = null;

/**
 * Load all language entries from Data/languages.json.
 */
export async function loadLanguages(): Promise<LanguageEntry[]> {
  if (_languages) return _languages;
  const raw = await fs.readFile(LANGUAGES_JSON, "utf-8");
  _languages = JSON.parse(raw) as LanguageEntry[];
  return _languages;
}

/**
 * Get all language codes defined in languages.json.
 */
export async function getAllLanguageCodes(): Promise<string[]> {
  const langs = await loadLanguages();
  return langs.map((l) => l.code);
}

/* ------------------------------------------------------------------ */
/*  File helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Read a JSON file and return the parsed content.
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Write an object to a JSON file (pretty-printed, trailing newline).
 */
export async function writeJsonFile(
  filePath: string,
  data: unknown
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Check whether a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List subdirectories in a directory.
 */
export async function listDirs(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * List files in a directory, optionally filtering by extension.
 */
export async function listFiles(
  dirPath: string,
  ext?: string
): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (!ext || e.name.endsWith(ext)))
    .map((e) => e.name);
}

/* ------------------------------------------------------------------ */
/*  Object helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Check if a value is an object with string keys (Record<string, …>).
 */
export function isLocaleMap(
  value: unknown,
  allCodes: Set<string>
): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  // All keys must be known language codes and all values must be strings.
  return keys.every(
    (k) => allCodes.has(k) && typeof (value as Record<string, unknown>)[k] === "string"
  );
}

/* ------------------------------------------------------------------ */
/*  Logging                                                            */
/* ------------------------------------------------------------------ */

export const log = {
  info: (...args: unknown[]) =>
    console.log("\x1b[36m[INFO]\x1b[0m", ...args),
  warn: (...args: unknown[]) =>
    console.log("\x1b[33m[WARN]\x1b[0m", ...args),
  error: (...args: unknown[]) =>
    console.error("\x1b[31m[ERROR]\x1b[0m", ...args),
  success: (...args: unknown[]) =>
    console.log("\x1b[32m[OK]\x1b[0m", ...args),
  dim: (...args: unknown[]) =>
    console.log("\x1b[2m", ...args, "\x1b[0m"),
};

/* ------------------------------------------------------------------ */
/*  Progress                                                           */
/* ------------------------------------------------------------------ */

export function progressBar(current: number, total: number, label = ""): void {
  const pct = Math.round((current / total) * 100);
  const bar = "█".repeat(Math.round(pct / 2)).padEnd(50, "░");
  process.stdout.write(
    `\r  ${bar} ${pct}% (${current}/${total}) ${label}     `
  );
  if (current >= total) process.stdout.write("\n");
}
