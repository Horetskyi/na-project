/**
 * Translator for Data/ContentsTexts/{contentId}/{lang}.md files.
 *
 * Strategy:
 *   1. For each content directory, list existing .md files.
 *   2. Pick the base-language file (or first available) as source.
 *   3. Convert markdown → HTML, translate via LibreTranslate (format=html),
 *      convert translated HTML → markdown, and save as .md file.
 */

import fs from "fs/promises";
import path from "path";
import { marked } from "marked";
import TurndownService from "turndown";
import { CONTENTS_TEXTS_DIR } from "./config.js";
import type { TranslationEngine } from "./engine.js";
import { listDirs, listFiles, fileExists, log } from "./utils.js";

/* ------------------------------------------------------------------ */
/*  Markdown ↔ HTML converters                                        */
/* ------------------------------------------------------------------ */

/** Convert markdown source to HTML for translation. */
async function mdToHtml(md: string): Promise<string> {
  return await marked.parse(md, { async: true });
}

/** Convert translated HTML back to markdown. */
function htmlToMd(html: string): string {
  const td = new TurndownService({
    headingStyle: "atx",        // # style headings
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  return td.turndown(html);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface TranslateContentsTextsOptions {
  engine: TranslationEngine;
  baseLang: string;
  targetLangs: string[];
  contentId?: string;
  dryRun?: boolean;
}

export async function translateContentsTexts(
  opts: TranslateContentsTextsOptions
): Promise<void> {
  const { engine, baseLang, targetLangs, contentId, dryRun } = opts;

  const allDirs = await listDirs(CONTENTS_TEXTS_DIR);
  const contentDirs = contentId
    ? allDirs.filter((d) => d === contentId)
    : allDirs;

  if (contentId && contentDirs.length === 0) {
    log.warn(`ContentsTexts: content folder "${contentId}" not found`);
    return;
  }

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

    // Convert source markdown to HTML once (reused for every target lang)
    const sourceHtml = await mdToHtml(sourceText);

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

    // Pipeline: markdown → HTML → translate (format=html) → HTML → markdown
    for (const lang of missingLangs) {
      const targetFile = path.join(dirPath, `${lang}.md`);

      // Split HTML into chunks for large texts
      const chunks = splitTextForTranslation(sourceHtml, 4000);
      const translatedChunks: string[] = [];
      let failed = false;

      for (const chunk of chunks) {
        const result = await engine.translate({
          q: chunk,
          source: sourceLang,
          target: lang,
          format: "html",
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

      // Convert translated HTML back to markdown
      const translatedHtml = translatedChunks.join("");
      const translatedMd = htmlToMd(translatedHtml);

      await fs.writeFile(targetFile, translatedMd + "\n", "utf-8");
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
