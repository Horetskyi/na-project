/**
 * Translator for messages/*.json files.
 *
 * Strategy:
 *   1. Read the base-language message file (e.g. messages/uk.json).
 *   2. For every other locale file, walk the key tree.
 *   3. For each leaf-string present in base but missing in target → translate.
 *   4. Write updated target file.
 */

import path from "path";
import { MESSAGES_DIR } from "./config.js";
import { LibreTranslateClient } from "./client.js";
import {
  readJsonFile,
  writeJsonFile,
  listFiles,
  log,
  progressBar,
} from "./utils.js";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type MessageTree = { [key: string]: string | MessageTree };

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Collect all leaf paths and their string values from a nested object.
 */
function collectLeaves(
  obj: MessageTree,
  prefix: string[] = []
): Array<{ path: string[]; value: string }> {
  const leaves: Array<{ path: string[]; value: string }> = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullPath = [...prefix, key];
    if (typeof val === "string") {
      leaves.push({ path: fullPath, value: val });
    } else {
      leaves.push(...collectLeaves(val, fullPath));
    }
  }
  return leaves;
}

/**
 * Get a nested value by path.
 */
function getByPath(obj: MessageTree, path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const seg of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Set a nested value by path, creating intermediate objects if needed.
 */
function setByPath(obj: MessageTree, path: string[], value: string): void {
  let cur: MessageTree = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (typeof cur[seg] !== "object" || cur[seg] === null) {
      cur[seg] = {};
    }
    cur = cur[seg] as MessageTree;
  }
  cur[path[path.length - 1]] = value;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface TranslateMessagesOptions {
  client: LibreTranslateClient;
  baseLang: string;
  targetLangs: string[];
  dryRun?: boolean;
}

export async function translateMessages(
  opts: TranslateMessagesOptions
): Promise<void> {
  const { client, baseLang, targetLangs, dryRun } = opts;

  // 1. Load base language file
  const baseFile = path.join(MESSAGES_DIR, `${baseLang}.json`);
  const baseData = await readJsonFile<MessageTree>(baseFile);
  const baseLeaves = collectLeaves(baseData);

  log.info(
    `Messages: base="${baseLang}" with ${baseLeaves.length} leaf strings`
  );

  // 2. Get list of existing message files
  const allFiles = await listFiles(MESSAGES_DIR, ".json");
  const localesOnDisk = allFiles.map((f) => f.replace(".json", ""));

  // 3. Process each target language
  for (const lang of targetLangs) {
    if (lang === baseLang) continue;

    const targetFile = path.join(MESSAGES_DIR, `${lang}.json`);
    const isExisting = localesOnDisk.includes(lang);
    const targetData: MessageTree = isExisting
      ? await readJsonFile<MessageTree>(targetFile)
      : {};

    // Find missing leaves
    const missing = baseLeaves.filter(
      (leaf) => getByPath(targetData, leaf.path) === undefined
    );

    if (missing.length === 0) {
      log.dim(`  ${lang}: all keys present — skipping`);
      continue;
    }

    log.info(
      `  ${lang}: ${missing.length} missing key(s) to translate`
    );

    if (dryRun) {
      for (const m of missing) {
        log.dim(`    → ${m.path.join(".")}`);
      }
      continue;
    }

    // Translate in batches
    const BATCH = 20;
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const texts = batch.map((m) => m.value);

      const translated = await client.translateBatch(
        texts,
        baseLang,
        lang
      );

      for (let j = 0; j < batch.length; j++) {
        const result = translated[j];
        if (result !== null) {
          setByPath(targetData, batch[j].path, result);
        } else {
          log.warn(
            `    Could not translate key "${batch[j].path.join(".")}" to ${lang}`
          );
        }
      }
      progressBar(
        Math.min(i + BATCH, missing.length),
        missing.length,
        lang
      );
    }

    // Write updated file
    await writeJsonFile(targetFile, targetData);
    log.success(`  ${lang}: saved ${targetFile}`);
  }
}
