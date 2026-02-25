/**
 * Translator for JSON data files (contents.json, authors.json).
 *
 * These files contain arrays of objects with locale-map fields like:
 *   "title": { "ru": "...", "uk": "..." }
 *   "bio":   { "en": "...", "fr": "..." }
 *
 * Strategy:
 *   1. Load the JSON array.
 *   2. Walk every object recursively; detect locale-map fields
 *      (objects whose keys are all known language codes and values are strings).
 *   3. For each locale-map, determine the base text (prefer baseLang, else first key).
 *   4. Add missing target-language entries via translation.
 *   5. Write updated file.
 */

import { LibreTranslateClient } from "./client.js";
import {
  readJsonFile,
  writeJsonFile,
  getAllLanguageCodes,
  isLocaleMap,
  log,
  progressBar,
} from "./utils.js";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface LocaleMapLocation {
  /** Reference to the object containing the field. */
  parent: Record<string, unknown>;
  /** Key within the parent. */
  key: string;
  /** The locale map itself. */
  map: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Recursively find all locale-map fields in a data structure.
 */
function findLocaleMaps(
  data: unknown,
  allCodes: Set<string>
): LocaleMapLocation[] {
  const results: LocaleMapLocation[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      results.push(...findLocaleMaps(item, allCodes));
    }
  } else if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (isLocaleMap(val, allCodes)) {
        results.push({ parent: obj, key, map: val });
      } else {
        results.push(...findLocaleMaps(val, allCodes));
      }
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface TranslateJsonDataOptions {
  client: LibreTranslateClient;
  baseLang: string;
  targetLangs: string[];
  filePaths: string[];
  dryRun?: boolean;
}

export async function translateJsonData(
  opts: TranslateJsonDataOptions
): Promise<void> {
  const { client, baseLang, targetLangs, filePaths, dryRun } = opts;

  const allCodes = new Set(await getAllLanguageCodes());

  for (const filePath of filePaths) {
    log.info(`JSON data: processing ${filePath}`);

    const data = await readJsonFile(filePath);
    const maps = findLocaleMaps(data, allCodes);

    log.info(`  Found ${maps.length} locale-map field(s)`);

    let translatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < maps.length; i++) {
      const loc = maps[i];
      const existingLangs = Object.keys(loc.map);

      // Determine the source language for this particular map
      let sourceLang: string;
      if (existingLangs.includes(baseLang)) {
        sourceLang = baseLang;
      } else {
        sourceLang = existingLangs[0];
      }
      const sourceText = loc.map[sourceLang];

      // Find missing target languages
      const missingLangs = targetLangs.filter(
        (lang) => !existingLangs.includes(lang)
      );

      if (missingLangs.length === 0) {
        skippedCount++;
        continue;
      }

      if (dryRun) {
        // Attempt to identify the field for logging
        const parentId =
          (loc.parent as Record<string, unknown>).id ??
          (loc.parent as Record<string, unknown>).name ??
          "?";
        log.dim(
          `  ${loc.key} (id=${JSON.stringify(parentId)}): missing ${missingLangs.join(", ")}`
        );
        continue;
      }

      // Translate each missing language
      for (const lang of missingLangs) {
        const result = await client.translate({
          q: sourceText,
          source: sourceLang,
          target: lang,
        });

        if (result !== null) {
          loc.map[lang] = result;
          translatedCount++;
        } else {
          log.warn(
            `  Could not translate "${loc.key}" ${sourceLang}→${lang}`
          );
        }
      }

      progressBar(i + 1, maps.length);
    }

    if (!dryRun) {
      await writeJsonFile(filePath, data);
      log.success(
        `  Saved ${filePath} (${translatedCount} translation(s) added, ${skippedCount} field(s) already complete)`
      );
    } else {
      log.info(
        `  Dry run: ${skippedCount} field(s) already complete`
      );
    }
  }
}
