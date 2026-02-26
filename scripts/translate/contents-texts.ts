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

    // Pipeline depends on whether the engine prefers line-by-line mode
    for (const lang of missingLangs) {
      const targetFile = path.join(dirPath, `${lang}.md`);

      let translatedMd: string;

      if (engine.prefersLineByLine) {
        // ── Line-by-line strategy (best for NLLB-200) ──────────────
        // Split the markdown source into lines, translate each text
        // line individually, and reassemble.  Structural / empty lines
        // are passed through unchanged.
        const result = await translateMarkdownLineByLine(
          sourceText,
          engine,
          sourceLang,
          lang
        );
        if (result === null) {
          log.warn(
            `    ${lang}: unsupported language pair ${sourceLang}→${lang}, skipping`
          );
          continue;
        }
        translatedMd = result;
      } else {
        // ── Chunk strategy (LibreTranslate / HTML-aware engines) ───
        // markdown → HTML → translate (format=html) → HTML → markdown
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

        const translatedHtml = translatedChunks.join("");
        translatedMd = htmlToMd(translatedHtml);
      }

      await fs.writeFile(targetFile, translatedMd + "\n", "utf-8");
      log.success(`    ${lang}: created ${targetFile}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Returns `true` if a markdown line is purely structural / syntactic
 * and should NOT be sent to a translation engine.
 *
 * Examples: empty lines, thematic breaks (`---`), image/link-only lines,
 * code fence markers, HTML comments, etc.
 */
function isMarkdownStructural(line: string): boolean {
  const trimmed = line.trim();

  if (trimmed === "") return true;                        // blank line
  if (/^---+$/.test(trimmed)) return true;                // thematic break / front-matter delim
  if (/^===+$/.test(trimmed)) return true;                // setext heading underline
  if (/^```/.test(trimmed)) return true;                  // code fence
  if (/^~~~/.test(trimmed)) return true;                  // code fence (alt)
  if (/^!\[.*\]\(.*\)$/.test(trimmed)) return true;       // image-only line
  if (/^\[.*\]:\s/.test(trimmed)) return true;            // link reference definition
  if (/^<!--.*-->$/.test(trimmed)) return true;           // HTML comment (single line)

  return false;
}

/**
 * Line-by-line markdown translation.
 *
 * 1. Splits by `\n`.
 * 2. Structural / empty lines are kept as-is.
 * 3. Text lines are collected in order.
 * 4. All text lines are sent as a batch via `engine.translateBatch`.
 * 5. Translated lines are placed back in their original positions.
 *
 * Returns `null` if the language pair is unsupported.
 */
async function translateMarkdownLineByLine(
  markdown: string,
  engine: TranslationEngine,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  const lines = markdown.split("\n");

  // Track which indices need translation
  const textIndices: number[] = [];
  const textLines: string[] = [];
  let insideCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Toggle code-block state on fences
    if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
      insideCodeBlock = !insideCodeBlock;
      continue; // fence line itself is structural
    }

    // Lines inside code blocks are never translated
    if (insideCodeBlock) continue;

    if (isMarkdownStructural(lines[i])) continue;

    // This line has translatable text
    textIndices.push(i);

    // Strip leading markdown heading markers (# / ## / …) so the model
    // receives only the text.  We'll prepend the markers back after.
    const headingMatch = lines[i].match(/^(#{1,6}\s+)/);
    textLines.push(headingMatch ? lines[i].slice(headingMatch[0].length) : lines[i]);
  }

  if (textLines.length === 0) {
    // Nothing to translate — return file as-is
    return markdown;
  }

  // Batch translate all text lines in one call
  const translated = await engine.translateBatch(
    textLines,
    sourceLang,
    targetLang
  );

  // Check if the engine returned null for every line (unsupported pair)
  if (translated.every((t) => t === null)) {
    return null;
  }

  // Place translated text back
  const output = [...lines];
  for (let j = 0; j < textIndices.length; j++) {
    const idx = textIndices[j];
    const tResult = translated[j];

    if (tResult === null) {
      // Keep original if individual line failed
      continue;
    }

    // Re-attach heading prefix if the original line had one
    const headingMatch = lines[idx].match(/^(#{1,6}\s+)/);
    output[idx] = headingMatch ? headingMatch[0] + tResult : tResult;
  }

  return output.join("\n");
}

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
