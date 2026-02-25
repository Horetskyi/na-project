/**
 * Translator for Data/ContentsTexts/{contentId}/{lang}.md files.
 *
 * Strategy:
 *   1. For each content directory, list existing .md files.
 *   2. Pick the base-language file (or first available) as source.
 *   3. For every target language without a .md file → translate & create.
 */

import fs from "fs/promises";
import path from "path";
import { CONTENTS_TEXTS_DIR } from "./config.js";
import { LibreTranslateClient } from "./client.js";
import { listDirs, listFiles, fileExists, log } from "./utils.js";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface TranslateContentsTextsOptions {
  client: LibreTranslateClient;
  baseLang: string;
  targetLangs: string[];
  dryRun?: boolean;
}

export async function translateContentsTexts(
  opts: TranslateContentsTextsOptions
): Promise<void> {
  const { client, baseLang, targetLangs, dryRun } = opts;

  const contentDirs = await listDirs(CONTENTS_TEXTS_DIR);

  log.info(
    `ContentsTexts: ${contentDirs.length} content director(ies) found`
  );

  for (const dir of contentDirs) {
    const dirPath = path.join(CONTENTS_TEXTS_DIR, dir);
    const mdFiles = await listFiles(dirPath, ".md");
    const existingLangs = mdFiles.map((f) => f.replace(".md", ""));

    // Determine source language: prefer baseLang, fall back to first available
    let sourceLang: string;
    if (existingLangs.includes(baseLang)) {
      sourceLang = baseLang;
    } else if (existingLangs.length > 0) {
      sourceLang = existingLangs[0];
      log.warn(
        `  ${dir}: base lang "${baseLang}" not found, using "${sourceLang}"`
      );
    } else {
      log.warn(`  ${dir}: no .md files found — skipping`);
      continue;
    }

    const sourceFile = path.join(dirPath, `${sourceLang}.md`);
    const sourceText = await fs.readFile(sourceFile, "utf-8");

    // Find missing target languages
    const missingLangs = targetLangs.filter(
      (lang) => lang !== sourceLang && !existingLangs.includes(lang)
    );

    if (missingLangs.length === 0) {
      log.dim(`  ${dir}: all target languages present — skipping`);
      continue;
    }

    log.info(
      `  ${dir}: ${missingLangs.length} language(s) to translate from "${sourceLang}"`
    );

    if (dryRun) {
      for (const lang of missingLangs) {
        log.dim(`    → would create ${lang}.md`);
      }
      continue;
    }

    // Translate the entire markdown content for each missing language.
    // We use format "html" so LibreTranslate preserves markdown structure.
    for (const lang of missingLangs) {
      const targetFile = path.join(dirPath, `${lang}.md`);

      // Skip very large texts — translate in chunks of ~4000 chars
      const chunks = splitTextForTranslation(sourceText, 4000);
      const translatedChunks: string[] = [];
      let failed = false;

      for (const chunk of chunks) {
        const result = await client.translate({
          q: chunk,
          source: sourceLang,
          target: lang,
          format: "html", // preserves markdown formatting better
        });

        if (result === null) {
          log.warn(
            `    ${lang}: unsupported language pair ${sourceLang}→${lang}, skipping`
          );
          failed = true;
          break;
        }
        translatedChunks.push(result);
      }

      if (failed) continue;

      await fs.writeFile(targetFile, translatedChunks.join("\n"), "utf-8");
      log.success(`    ${lang}: created ${targetFile}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Split text into chunks, breaking at paragraph boundaries (double newlines).
 */
function splitTextForTranslation(
  text: string,
  maxChars: number
): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\n/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trimEnd());
      current = "";
    }
    current += (current.length > 0 ? "\n\n" : "") + para;
  }
  if (current.length > 0) {
    chunks.push(current.trimEnd());
  }

  return chunks;
}
