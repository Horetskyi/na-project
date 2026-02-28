#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { CONTENTS_TEXTS_DIR } from "./config.js";
import { listDirs, log } from "./utils.js";

const GLOSSARY_JSON_PATH = path.join(process.cwd(), "Data", "glossary.json");
const FIRST_TRY_MODEL = "gpt-5-mini";

type TranslationStatus =
  | "ORIGINAL"
  | "ENHANCED_BY_GPT"
  | "ENHANCED_BY_HUMAN"
  | "MACHINE_TRANSLATED_SKIP_VERIFICATION"
  | "MACHINE_TRANSLATED";

interface CliArgs {
  model: string;
  retryModel: string;
  verifyLanguage: boolean;
  verifyModel: string;
  verifyChars: number;
  contentId?: string;
  lang?: string;
  maxItems?: number;
  onlyShowPrompts: boolean;
  showGlossary: boolean;
  glossaryPair?: string;
  glossarySource?: string;
  glossaryTarget?: string;
  glossaryLimit?: number;
  maxOutputTokens: number;
  sleepMs: number;
  retries: number;
  timeoutMs: number;
  dryRun: boolean;
  help: boolean;
}

interface WorkItem {
  contentId: string;
  dirPath: string;
  statusPath: string;
  sourceLang: string;
  targetLang: string;
  sourcePath: string;
  targetPath: string;
}

interface GlossaryEntry {
  source: string;
  target: string;
  count: number;
}

interface GlossaryAccumulator {
  source: string;
  targetCounts: Map<string, number>;
}

interface DiskGlossaryItem {
  source: string;
  target: string;
  weight?: number;
}

interface DiskGlossaryFile {
  version: number;
  pairs: Record<string, DiskGlossaryItem[]>;
}

class OpenAiRateLimitError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "OpenAiRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    model: FIRST_TRY_MODEL,
    retryModel: "gpt-5.1",
    verifyLanguage: true,
    verifyModel: "gpt-4.1",
    verifyChars: 1000,
    onlyShowPrompts: false,
    showGlossary: false,
    maxOutputTokens: 0, // 
    sleepMs: 1200,
    retries: 2, //
    timeoutMs: 240000, // 4 minutes
    dryRun: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--model":
        args.model = argv[++i] ?? args.model;
        break;
      case "--retry-model":
        args.retryModel = argv[++i] ?? args.retryModel;
        break;
      case "--content-id":
        args.contentId = argv[++i];
        break;
      case "--verify-language":
        args.verifyLanguage = true;
        break;
      case "--no-verify-language":
        args.verifyLanguage = false;
        break;
      case "--verify-model":
        args.verifyModel = argv[++i] ?? args.verifyModel;
        break;
      case "--verify-chars":
        args.verifyChars = Number(argv[++i]);
        break;
      case "--lang":
        args.lang = argv[++i];
        break;
      case "--max-items":
        args.maxItems = Number(argv[++i]);
        break;
      case "--show-glossary":
        args.showGlossary = true;
        break;
      case "--only-show-prompts":
        args.onlyShowPrompts = true;
        break;
      case "--glossary-pair":
        args.glossaryPair = argv[++i];
        break;
      case "--glossary-source":
        args.glossarySource = argv[++i];
        break;
      case "--glossary-target":
        args.glossaryTarget = argv[++i];
        break;
      case "--glossary-limit":
        args.glossaryLimit = Number(argv[++i]);
        break;
      case "--max-output-tokens":
        args.maxOutputTokens = Number(argv[++i]);
        break;
      case "--sleep-ms":
        args.sleepMs = Number(argv[++i]);
        break;
      case "--retries":
        args.retries = Number(argv[++i]);
        break;
      case "--timeout-ms":
        args.timeoutMs = Number(argv[++i]);
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        log.warn(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
GPT Content Enhancement Utility

Usage:
  npx tsx scripts/translate/enhance-gpt.ts [options]

What it does:
  - Scans Data/ContentsTexts/*/translationStatus.json
  - Finds locales marked MACHINE_TRANSLATED
  - Uses source locale marked ORIGINAL as semantic reference
  - Uses GPT model to improve/create target markdown files
  - Updates status to ENHANCED_BY_GPT after each successful file

Options:
  --model <name>       First-attempt model (currently forced to gpt-5-mini)
  --retry-model <name> Retry-attempt model (default: gpt-5.1)
  --verify-language    Verify output language with secondary model (default: on)
  --no-verify-language Disable secondary language verification
  --verify-model <n>   Verifier model name (default: gpt-4.1)
  --verify-chars <n>   Leading chars checked by verifier (default: 1000)
  --content-id <id>    Process only one content directory
  --lang <code>        Process only one target locale (e.g. uk)
  --max-items <n>      Stop after n successful updates
  --only-show-prompts  Print prompts for queued items and exit
  --show-glossary      Print extracted glossary terms and exit
  --glossary-pair <s=>t>
                       Show glossary only for one pair (e.g. ru=>uk, ru:uk, ru=uk)
  --glossary-source <code>
                       Show glossary only for one source language (e.g. ru)
  --glossary-target <code>
                       Show glossary only for one target language (e.g. uk)
  --glossary-limit <n> Limit printed terms per pair (default: all)
  --max-output-tokens <n>
                       Max completion tokens per request (default: 0, 0 = unset)
  --sleep-ms <n>       Delay between API calls (default: 1200)
  --retries <n>        Retries per file on failure (default: 2)
  --timeout-ms <n>     HTTP timeout per request (default: 240000)
  --dry-run            Show planned work, do not call API or write files
  --help               Show this help

Auth:
  Set OPEN_API_KEY (or OPENAI_API_KEY) in your environment.

Examples:
  npx tsx scripts/translate/enhance-gpt.ts
  npx tsx scripts/translate/enhance-gpt.ts --verify-model gpt-4.1 --verify-chars 1000
  npx tsx scripts/translate/enhance-gpt.ts --content-id no-tener-hijos --lang uk
  npx tsx scripts/translate/enhance-gpt.ts --content-id proposition-de-commission-d-enquete-parlementaire-sur-les-sectes --lang ru --max-items 1 --only-show-prompts
  npx tsx scripts/translate/enhance-gpt.ts --show-glossary --glossary-source ru --glossary-target uk --glossary-limit 30
  npx tsx scripts/translate/enhance-gpt.ts --max-items 20 --sleep-ms 1500
  npx tsx scripts/translate/enhance-gpt.ts --dry-run
`);
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(): string | null {
  return process.env.OPEN_API_KEY ?? process.env.OPENAI_API_KEY ?? null;
}

function glossaryKey(sourceLang: string, targetLang: string): string {
  return `${sourceLang}=>${targetLang}`;
}

function parseStoredGlossaryPairKey(key: string): {
  left: string;
  right: string;
  bidirectional: boolean;
} | null {
  const cleaned = key.trim();
  if (!cleaned) return null;

  const bidiMatch = cleaned.match(/^([^=<>\s]+)\s*<=>\s*([^=<>\s]+)$/);
  if (bidiMatch) {
    return {
      left: bidiMatch[1].trim(),
      right: bidiMatch[2].trim(),
      bidirectional: true,
    };
  }

  const directionalMatch = cleaned.match(/^([^=<>\s]+)\s*=>\s*([^=<>\s]+)$/);
  if (directionalMatch) {
    return {
      left: directionalMatch[1].trim(),
      right: directionalMatch[2].trim(),
      bidirectional: false,
    };
  }

  return null;
}

function parseGlossaryPair(value?: string): { source: string; target: string } | null {
  if (!value) return null;

  const cleaned = value.trim().replace(/^['"]|['"]$/g, "");
  const match = cleaned.match(/^([^=<>:\-\/,\s]+)\s*(?:<=>|=>|->|=|:|\/|,)\s*([^=<>:\-\/,\s]+)$/);
  if (!match) return null;

  return {
    source: match[1].trim(),
    target: match[2].trim(),
  };
}

function languageLabel(code: string): string {
  const map: Record<string, string> = {
    ar: "Arabic",
    bg: "Bulgarian",
    bn: "Bengali",
    cs: "Czech",
    da: "Danish",
    de: "German",
    el: "Greek",
    en: "English",
    es: "Spanish",
    fa: "Persian",
    fi: "Finnish",
    fr: "French",
    he: "Hebrew",
    hi: "Hindi",
    hr: "Croatian",
    hu: "Hungarian",
    id: "Indonesian",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    lt: "Lithuanian",
    lv: "Latvian",
    ms: "Malay",
    my: "Burmese",
    nl: "Dutch",
    no: "Norwegian",
    pl: "Polish",
    pt: "Portuguese",
    ro: "Romanian",
    ru: "Russian",
    sk: "Slovak",
    sr: "Serbian",
    sv: "Swedish",
    sw: "Swahili",
    ta: "Tamil",
    th: "Thai",
    tr: "Turkish",
    uk: "Ukrainian",
    vi: "Vietnamese",
    zh: "Chinese",
  };
  return map[code] ?? code;
}

function looksLikeMarkdownHeading(line: string): boolean {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

function looksLikeMarkdownListItem(line: string): boolean {
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function stripLinePrefix(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "")
    .trim();
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  const parts = text.match(/[\p{L}\p{N}]+/gu);
  return parts ? parts.length : 0;
}

function isGlossaryCandidate(text: string): boolean {
  if (!text) return false;
  if (!/[\p{L}]/u.test(text)) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/[.!?;:]/.test(text)) return false;
  if (text.length < 2 || text.length > 80) return false;
  const words = countWords(text);
  return words >= 1 && words <= 6;
}

function extractCandidatePairs(sourceMarkdown: string, targetMarkdown: string): Array<{ source: string; target: string }> {
  const sourceLines = sourceMarkdown.split(/\r?\n/);
  const targetLines = targetMarkdown.split(/\r?\n/);
  const maxLines = Math.min(sourceLines.length, targetLines.length);

  const pairs: Array<{ source: string; target: string }> = [];

  for (let i = 0; i < maxLines; i++) {
    const sLine = sourceLines[i].trim();
    const tLine = targetLines[i].trim();
    if (!sLine || !tLine) continue;
    if (sLine.startsWith("```") || tLine.startsWith("```")) continue;

    const sameHeadingType = looksLikeMarkdownHeading(sLine) && looksLikeMarkdownHeading(tLine);
    const sameListType = looksLikeMarkdownListItem(sLine) && looksLikeMarkdownListItem(tLine);
    if (!sameHeadingType && !sameListType) continue;

    const source = stripInlineMarkdown(stripLinePrefix(sLine));
    const target = stripInlineMarkdown(stripLinePrefix(tLine));
    if (!isGlossaryCandidate(source) || !isGlossaryCandidate(target)) continue;
    pairs.push({ source, target });
  }

  return pairs;
}

function addGlossaryPair(
  pairMap: Map<string, Map<string, GlossaryAccumulator>>,
  sourceLang: string,
  targetLang: string,
  source: string,
  target: string
): void {
  const langKey = glossaryKey(sourceLang, targetLang);
  let bySource = pairMap.get(langKey);
  if (!bySource) {
    bySource = new Map<string, GlossaryAccumulator>();
    pairMap.set(langKey, bySource);
  }

  const sourceKey = source.toLocaleLowerCase();
  let acc = bySource.get(sourceKey);
  if (!acc) {
    acc = { source, targetCounts: new Map<string, number>() };
    bySource.set(sourceKey, acc);
  }

  const existing = acc.targetCounts.get(target) ?? 0;
  acc.targetCounts.set(target, existing + 1);
}

function finalizeGlossary(
  pairMap: Map<string, Map<string, GlossaryAccumulator>>,
  maxEntriesPerLangPair = 25
): Map<string, GlossaryEntry[]> {
  const out = new Map<string, GlossaryEntry[]>();

  for (const [langKey, bySource] of pairMap.entries()) {
    const entries: GlossaryEntry[] = [];

    for (const acc of bySource.values()) {
      let bestTarget = "";
      let bestCount = 0;

      for (const [target, count] of acc.targetCounts.entries()) {
        if (count > bestCount) {
          bestTarget = target;
          bestCount = count;
        }
      }

      if (bestTarget) {
        entries.push({
          source: acc.source,
          target: bestTarget,
          count: bestCount,
        });
      }
    }

    entries.sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
    out.set(langKey, entries.slice(0, maxEntriesPerLangPair));
  }

  return out;
}

async function buildGlossaryIndex(args: CliArgs): Promise<Map<string, GlossaryEntry[]>> {
  const dirs = await listDirs(CONTENTS_TEXTS_DIR);
  const pairMap = new Map<string, Map<string, GlossaryAccumulator>>();

  for (const contentId of dirs) {
    const dirPath = path.join(CONTENTS_TEXTS_DIR, contentId);
    const statusPath = path.join(dirPath, "translationStatus.json");
    if (!(await exists(statusPath))) continue;

    const status = await readJson<Record<string, TranslationStatus>>(statusPath);
    const originalEntries = Object.entries(status).filter(([, value]) => value === "ORIGINAL");
    if (originalEntries.length !== 1) continue;

    const sourceLang = originalEntries[0][0];
    const sourcePath = path.join(dirPath, `${sourceLang}.md`);
    if (!(await exists(sourcePath))) continue;

    const sourceMarkdown = await fs.readFile(sourcePath, "utf-8");

    for (const [targetLang, targetStatus] of Object.entries(status)) {
      if (targetStatus !== "ENHANCED_BY_GPT") continue;
      if (args.lang && targetLang !== args.lang) continue;

      const targetPath = path.join(dirPath, `${targetLang}.md`);
      if (!(await exists(targetPath))) continue;

      const targetMarkdown = await fs.readFile(targetPath, "utf-8");
      const pairs = extractCandidatePairs(sourceMarkdown, targetMarkdown);
      for (const pair of pairs) {
        addGlossaryPair(pairMap, sourceLang, targetLang, pair.source, pair.target);
      }
    }
  }

  return finalizeGlossary(pairMap);
}

async function loadGlossaryFromDisk(filePath: string): Promise<Map<string, GlossaryEntry[]>> {
  if (!(await exists(filePath))) {
    return new Map<string, GlossaryEntry[]>();
  }

  const raw = await readJson<DiskGlossaryFile>(filePath);
  const result = new Map<string, GlossaryEntry[]>();

  if (!raw || typeof raw !== "object" || typeof raw.pairs !== "object" || raw.pairs === null) {
    throw new Error(`Invalid glossary file format: ${filePath}`);
  }

  const addEntry = (pair: string, source: string, target: string, weight: number): void => {
    const existing = result.get(pair) ?? [];
    existing.push({ source, target, count: Math.max(1, Math.round(weight)) });
    result.set(pair, existing);
  };

  for (const [pair, items] of Object.entries(raw.pairs)) {
    if (!Array.isArray(items)) continue;

    const parsedPair = parseStoredGlossaryPairKey(pair);
    if (!parsedPair) continue;

    const forwardKey = glossaryKey(parsedPair.left, parsedPair.right);
    const reverseKey = glossaryKey(parsedPair.right, parsedPair.left);

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const source = typeof item.source === "string" ? item.source.trim() : "";
      const target = typeof item.target === "string" ? item.target.trim() : "";
      if (!source || !target) continue;
      const weight = typeof item.weight === "number" && Number.isFinite(item.weight) ? item.weight : 1;

      addEntry(forwardKey, source, target, weight);
      if (parsedPair.bidirectional) {
        addEntry(reverseKey, target, source, weight);
      }
    }
  }

  return result;
}

function mergeGlossaryIndexes(
  generated: Map<string, GlossaryEntry[]>,
  persisted: Map<string, GlossaryEntry[]>
): Map<string, GlossaryEntry[]> {
  const merged = new Map<string, GlossaryEntry[]>();
  const allPairs = new Set<string>([...generated.keys(), ...persisted.keys()]);

  for (const pair of allPairs) {
    const bySource = new Map<string, GlossaryEntry>();

    for (const entry of generated.get(pair) ?? []) {
      bySource.set(entry.source.toLocaleLowerCase(), { ...entry });
    }

    for (const entry of persisted.get(pair) ?? []) {
      bySource.set(entry.source.toLocaleLowerCase(), {
        source: entry.source,
        target: entry.target,
        count: 1000 + entry.count,
      });
    }

    const entries = Array.from(bySource.values()).sort(
      (a, b) => b.count - a.count || a.source.localeCompare(b.source)
    );

    if (entries.length > 0) {
      merged.set(pair, entries);
    }
  }

  return merged;
}

function normalizeGlossaryTerm(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function deriveGlossaryViaPivot(
  glossaryIndex: Map<string, GlossaryEntry[]>,
  sourceLang: string,
  targetLang: string,
  maxEntries = 50
): GlossaryEntry[] {
  if (sourceLang === targetLang) {
    return [];
  }

  const sourcePrefix = `${sourceLang}=>`;
  const targetSuffix = `=>${targetLang}`;

  const sourceToPivotPairs = Array.from(glossaryIndex.entries()).filter(([pair]) =>
    pair.startsWith(sourcePrefix)
  );

  const pivotToTargetMap = new Map<string, GlossaryEntry[]>();
  for (const [pair, entries] of glossaryIndex.entries()) {
    if (!pair.endsWith(targetSuffix)) continue;
    const pivotLang = pair.slice(0, pair.indexOf("=>"));
    if (!pivotLang || pivotLang === sourceLang || pivotLang === targetLang) continue;
    pivotToTargetMap.set(pivotLang, entries);
  }

  if (sourceToPivotPairs.length === 0 || pivotToTargetMap.size === 0) {
    return [];
  }

  const candidatesBySource = new Map<
    string,
    {
      source: string;
      targets: Map<string, { source: string; target: string; count: number }>;
    }
  >();

  for (const [sourceToPivotPair, sourceToPivotEntries] of sourceToPivotPairs) {
    const pivotLang = sourceToPivotPair.slice(sourceToPivotPair.indexOf("=>") + 2);
    const pivotToTargetEntries = pivotToTargetMap.get(pivotLang);
    if (!pivotToTargetEntries || pivotToTargetEntries.length === 0) continue;

    const pivotLookup = new Map<string, GlossaryEntry[]>();
    for (const entry of pivotToTargetEntries) {
      const key = normalizeGlossaryTerm(entry.source);
      const list = pivotLookup.get(key) ?? [];
      list.push(entry);
      pivotLookup.set(key, list);
    }

    for (const firstHop of sourceToPivotEntries) {
      const pivotKey = normalizeGlossaryTerm(firstHop.target);
      const secondHops = pivotLookup.get(pivotKey);
      if (!secondHops || secondHops.length === 0) continue;

      const sourceKey = normalizeGlossaryTerm(firstHop.source);
      let sourceAcc = candidatesBySource.get(sourceKey);
      if (!sourceAcc) {
        sourceAcc = {
          source: firstHop.source,
          targets: new Map<string, { source: string; target: string; count: number }>(),
        };
        candidatesBySource.set(sourceKey, sourceAcc);
      }

      for (const secondHop of secondHops) {
        const targetKey = normalizeGlossaryTerm(secondHop.target);
        const existing = sourceAcc.targets.get(targetKey);
        const confidence = Math.max(1, Math.min(firstHop.count, secondHop.count));

        if (existing) {
          existing.count += confidence;
        } else {
          sourceAcc.targets.set(targetKey, {
            source: firstHop.source,
            target: secondHop.target,
            count: confidence,
          });
        }
      }
    }
  }

  const derived: GlossaryEntry[] = [];
  for (const sourceAcc of candidatesBySource.values()) {
    let best: { source: string; target: string; count: number } | null = null;
    for (const candidate of sourceAcc.targets.values()) {
      if (!best || candidate.count > best.count) {
        best = candidate;
      }
    }
    if (best) {
      derived.push({
        source: best.source,
        target: best.target,
        count: best.count,
      });
    }
  }

  derived.sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  return derived.slice(0, maxEntries);
}

function resolveGlossaryForPair(
  glossaryIndex: Map<string, GlossaryEntry[]>,
  sourceLang: string,
  targetLang: string
): GlossaryEntry[] {
  const direct = glossaryIndex.get(glossaryKey(sourceLang, targetLang)) ?? [];
  const derived = deriveGlossaryViaPivot(glossaryIndex, sourceLang, targetLang);

  if (derived.length === 0) {
    return direct;
  }

  const mergedBySource = new Map<string, GlossaryEntry>();
  for (const entry of direct) {
    mergedBySource.set(normalizeGlossaryTerm(entry.source), entry);
  }
  for (const entry of derived) {
    const key = normalizeGlossaryTerm(entry.source);
    if (!mergedBySource.has(key)) {
      mergedBySource.set(key, entry);
    }
  }

  return Array.from(mergedBySource.values()).sort(
    (a, b) => b.count - a.count || a.source.localeCompare(b.source)
  );
}

function printGlossary(args: CliArgs, glossaryIndex: Map<string, GlossaryEntry[]>): void {
  const parsedPair = parseGlossaryPair(args.glossaryPair);
  const sourceFilter = args.glossarySource?.trim() ?? parsedPair?.source;
  const targetFilter = args.glossaryTarget?.trim() ?? args.lang?.trim() ?? parsedPair?.target;
  const limit = args.glossaryLimit;

  const pairs = Array.from(glossaryIndex.entries())
    .filter(([pair]) => {
      const [sourceLang = "", targetLang = ""] = pair.split("=>");
      if (sourceFilter && sourceLang !== sourceFilter) return false;
      if (targetFilter && targetLang !== targetFilter) return false;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  if (pairs.length === 0) {
    log.warn("No glossary items found for the current filters.");
    return;
  }

  for (const [pair, entries] of pairs) {
    const shown = typeof limit === "number" ? entries.slice(0, limit) : entries;
    console.log(`\n${pair} (${shown.length}/${entries.length})`);
    for (const entry of shown) {
      console.log(`  - ${entry.source} => ${entry.target} [${entry.count}]`);
    }
  }
}

function buildPrompt(params: {
  contentId: string;
  sourceLang: string;
  targetLang: string;
  sourceMarkdown: string;
  currentTargetMarkdown: string | null;
  glossary: GlossaryEntry[];
}): string {
  const {
    contentId,
    sourceLang,
    targetLang,
    sourceMarkdown,
    currentTargetMarkdown,
    glossary,
  } = params;

  const glossarySection = glossary.length
    ? [
        "Terminology glossary (preferred translations from already ENHANCED_BY_GPT files):",
        ...glossary.map((entry) => `- ${entry.source} => ${entry.target}`),
      ]
    : ["Terminology glossary: none found for this language pair."];

  return [
    "You are a professional translator and editor.",
    "Task: produce a high-quality target-language markdown file.",
    "Requirements:",
    "- LANGUAGE ACCURACY (critical and mandatory):",
    `  - Translate FROM ${sourceLang} (${languageLabel(sourceLang)}) TO ${targetLang} (${languageLabel(targetLang)}).`,
    `  - The final output must be in ${targetLang} (${languageLabel(targetLang)}) only.`,
    "  - Do NOT output Russian, English, or any other language unless it is the required target language.",
    "  - If existing target markdown contains mixed/wrong language text, fully rewrite it into the required target language.",
    "- STRICT MARKDOWN PRESERVATION (mandatory):",
    "  - Keep the exact markdown block order and structure (headings, blockquotes, lists, tables, code fences, links, images).",
    "  - Keep the same number of headings/list items/blockquotes/code fences/table rows as in the source.",
    "  - Keep heading levels unchanged and keep list nesting unchanged.",
    "  - Keep emphasis markers, inline code spans, and link/image URLs unchanged unless translation of visible text is needed.",
    "  - Do not add or remove paragraphs, sections, or markdown elements.",
    "- Keep proper nouns and doctrinal terms consistent unless a standard localized form exists.",
    "- Follow the terminology glossary whenever a listed source term appears.",
    "- Keep image/link URLs unchanged.",
    "- Do not add commentary, notes, or explanations.",
    "- Output ONLY the final markdown text.",
    `- Content ID: ${contentId}`,
    `- Source language: ${sourceLang}`,
    `- Target language: ${targetLang}`,
    targetLang === "uk"
      ? "- Ukrainian terminology constraint: use “акрополець” and “Новий Акрополь” where applicable."
      : "",
    "",
    ...glossarySection,
    "",
    "Source markdown:",
    sourceMarkdown,
    "",
    currentTargetMarkdown
      ? "\n\n\nExisting target markdown (improve this while staying faithful to source):"
      : "\n\n\nNo existing target markdown found. Create a new translation from source.",
    currentTargetMarkdown ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function safeSnippet(text: string, maxChars: number): string {
  return text.slice(0, Math.max(1, maxChars));
}

function parseJsonObject<T>(text: string): T | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function verifyLanguageWithModel(params: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  expectedLanguageCode: string;
  textSample: string;
}): Promise<{ correctLanguage: boolean; detectedLanguage?: string; reason?: string }> {
  const { apiKey, model, timeoutMs, expectedLanguageCode, textSample } = params;
  const verifyPrompt = [
    "You are a strict language detector.",
    "Decide whether the provided text is predominantly in the expected target language.",
    "Return ONLY JSON with keys:",
    '{"correctLanguage": boolean, "detectedLanguage": string, "reason": string}',
    `Expected language code: ${expectedLanguageCode}`,
    `Expected language name: ${languageLabel(expectedLanguageCode)}`,
    "Do not include markdown or any extra text.",
    "Text sample:",
    textSample,
  ].join("\n");

  const responseText = await callOpenAi({
    apiKey,
    model,
    prompt: verifyPrompt,
    maxOutputTokens: 200,
    timeoutMs,
  });

  const parsed = parseJsonObject<{
    correctLanguage?: boolean;
    detectedLanguage?: string;
    reason?: string;
  }>(responseText);

  if (!parsed || typeof parsed.correctLanguage !== "boolean") {
    throw new Error("Language verifier returned invalid JSON payload");
  }

  return {
    correctLanguage: parsed.correctLanguage,
    detectedLanguage: parsed.detectedLanguage,
    reason: parsed.reason,
  };
}

async function printPromptForItem(item: WorkItem, glossary: GlossaryEntry[]): Promise<void> {
  const sourceMarkdown = await fs.readFile(item.sourcePath, "utf-8");
  const currentTargetMarkdown = (await exists(item.targetPath))
    ? await fs.readFile(item.targetPath, "utf-8")
    : null;

  const prompt = buildPrompt({
    contentId: item.contentId,
    sourceLang: item.sourceLang,
    targetLang: item.targetLang,
    sourceMarkdown,
    currentTargetMarkdown,
    glossary,
  });

  console.log(`\n===== PROMPT START: ${item.contentId}:${item.targetLang} =====\n`);
  console.log(prompt);
  console.log(`\n===== PROMPT END: ${item.contentId}:${item.targetLang} =====\n`);
}

function parseOutputText(payload: any): string | null {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputs = payload?.output;
  if (Array.isArray(outputs)) {
    const chunks: string[] = [];
    for (const out of outputs) {
      const content = out?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part?.text === "string") {
          chunks.push(part.text);
        }
      }
    }
    const joined = chunks.join("\n").trim();
    return joined || null;
  }

  return null;
}

function getComparableLength(text: string): number {
  return text.trim().length;
}

function parseRetryAfterMs(response: Response, bodyText: string): number | null {
  const retryAfterMsHeader = response.headers.get("retry-after-ms");
  if (retryAfterMsHeader) {
    const ms = Number(retryAfterMsHeader);
    if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms);
  }

  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  const msMatch = bodyText.match(/try again in\s+(\d+)\s*ms/i);
  if (msMatch) {
    const ms = Number(msMatch[1]);
    if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms);
  }

  const secMatch = bodyText.match(/try again in\s+([\d.]+)\s*s(?:ec(?:ond)?s?)?/i);
  if (secMatch) {
    const seconds = Number(secMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  return null;
}

async function callOpenAi(params: {
  apiKey: string;
  model: string;
  prompt: string;
  maxOutputTokens: number;
  timeoutMs: number;
}): Promise<string> {
  const { apiKey, model, prompt, maxOutputTokens, timeoutMs } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody: {
    model: string;
    input: string;
    max_output_tokens?: number;
  } = {
    model,
    input: prompt,
  };

  if (maxOutputTokens > 0) {
    requestBody.max_output_tokens = maxOutputTokens;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 429) {
        const retryAfterMs = parseRetryAfterMs(response, body) ?? 1500;
        throw new OpenAiRateLimitError(
          `OpenAI API 429: ${body || "Rate limit reached"}`,
          retryAfterMs
        );
      }
      throw new Error(`OpenAI API ${response.status}: ${body}`);
    }

    const payload = await response.json();
    const text = parseOutputText(payload);
    if (!text) {
      throw new Error("OpenAI API returned empty output text");
    }

    return text.endsWith("\n") ? text : text + "\n";
  } finally {
    clearTimeout(timeout);
  }
}

async function collectWorkItems(args: CliArgs): Promise<WorkItem[]> {
  const dirs = await listDirs(CONTENTS_TEXTS_DIR);
  const filteredDirs = args.contentId ? dirs.filter((d) => d === args.contentId) : dirs;

  if (args.contentId && filteredDirs.length === 0) {
    throw new Error(`Content directory not found: ${args.contentId}`);
  }

  const items: WorkItem[] = [];

  for (const contentId of filteredDirs) {
    const dirPath = path.join(CONTENTS_TEXTS_DIR, contentId);
    const statusPath = path.join(dirPath, "translationStatus.json");
    if (!(await exists(statusPath))) {
      continue;
    }

    const status = await readJson<Record<string, TranslationStatus>>(statusPath);
    const originalEntries = Object.entries(status).filter(([, value]) => value === "ORIGINAL");
    if (originalEntries.length !== 1) {
      log.warn(
        `Skipping ${contentId}: expected exactly 1 ORIGINAL locale, got ${originalEntries.length}`
      );
      continue;
    }

    const sourceLang = originalEntries[0][0];
    const sourcePath = path.join(dirPath, `${sourceLang}.md`);
    if (!(await exists(sourcePath))) {
      log.warn(`Skipping ${contentId}: missing source file ${sourceLang}.md`);
      continue;
    }

    for (const [targetLang, targetStatus] of Object.entries(status)) {
      if (targetStatus !== "MACHINE_TRANSLATED") continue;
      if (args.lang && targetLang !== args.lang) continue;

      items.push({
        contentId,
        dirPath,
        statusPath,
        sourceLang,
        targetLang,
        sourcePath,
        targetPath: path.join(dirPath, `${targetLang}.md`),
      });
    }
  }

  return items;
}

async function processItem(args: {
  item: WorkItem;
  apiKey: string;
  model: string;
  retryModel: string;
  verifyLanguage: boolean;
  verifyModel: string;
  verifyChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
  retries: number;
  dryRun: boolean;
  glossary: GlossaryEntry[];
}): Promise<boolean> {
  const {
    item,
    apiKey,
    model,
    retryModel,
    verifyLanguage,
    verifyModel,
    verifyChars,
    maxOutputTokens,
    timeoutMs,
    retries,
    dryRun,
    glossary,
  } = args;
  const { contentId, targetLang, sourceLang, sourcePath, targetPath, statusPath } = item;

  const sourceMarkdown = await fs.readFile(sourcePath, "utf-8");
  const currentTargetMarkdown = (await exists(targetPath))
    ? await fs.readFile(targetPath, "utf-8")
    : null;
  const baselineMarkdown = currentTargetMarkdown ?? sourceMarkdown;

  if (dryRun) {
    log.info(
      `[DRY] ${contentId}: ${targetLang} (${currentTargetMarkdown ? "enhance" : "create"}) from ${sourceLang}`
    );
    return true;
  }

  const prompt = buildPrompt({
    contentId,
    sourceLang,
    targetLang,
    sourceMarkdown,
    currentTargetMarkdown,
    glossary,
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const modelForAttempt = attempt === 1 ? FIRST_TRY_MODEL : retryModel;
      const enhanced = await callOpenAi({
        apiKey,
        model: modelForAttempt,
        prompt,
        maxOutputTokens,
        timeoutMs,
      });

      const baselineLength = getComparableLength(baselineMarkdown);
      const enhancedLength = getComparableLength(enhanced);
      if (baselineLength > 0 && enhancedLength * 2 < baselineLength) {
        const ratio = ((enhancedLength / baselineLength) * 100).toFixed(1);
        log.warn(
          `${contentId}:${targetLang} rejected: GPT output too short (${enhancedLength} vs ${baselineLength} chars, ${ratio}%)`
        );
        return false;
      }

      if (verifyLanguage) {
        const sample = safeSnippet(enhanced, verifyChars);
        const verification = await verifyLanguageWithModel({
          apiKey,
          model: verifyModel,
          timeoutMs,
          expectedLanguageCode: targetLang,
          textSample: sample,
        });

        if (!verification.correctLanguage) {
          throw new Error(
            `Language verification failed for ${targetLang}` +
              (verification.detectedLanguage ? ` (detected: ${verification.detectedLanguage})` : "") +
              (verification.reason ? `: ${verification.reason}` : "")
          );
        }
      }

      await fs.writeFile(targetPath, enhanced, "utf-8");

      const status = await readJson<Record<string, TranslationStatus>>(statusPath);
      status[targetLang] = "ENHANCED_BY_GPT";
      await writeJson(statusPath, status);

      log.success(`${contentId}: ${targetLang} updated and status set to ENHANCED_BY_GPT`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const modelForAttempt = attempt === 1 ? FIRST_TRY_MODEL : retryModel;
      log.warn(
        `${contentId}:${targetLang} attempt ${attempt}/${retries} failed (model: ${modelForAttempt}): ${msg}`
      );
      if (attempt < retries) {
        if (error instanceof OpenAiRateLimitError) {
          const waitMs = Math.max(500, error.retryAfterMs + 250);
          log.info(`${contentId}:${targetLang} rate-limited, waiting ${waitMs}ms before retry`);
          await sleep(waitMs);
        } else {
          await sleep(1200 * attempt);
        }
      }
    }
  }

  log.error(`${contentId}: ${targetLang} failed after ${retries} attempts`);
  return false;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.dryRun && (!Number.isFinite(args.retries) || args.retries < 1)) {
    throw new Error("--retries must be >= 1");
  }
  if (!Number.isFinite(args.sleepMs) || args.sleepMs < 0) {
    throw new Error("--sleep-ms must be >= 0");
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
    throw new Error("--timeout-ms must be >= 1000");
  }
  if (
    !Number.isFinite(args.maxOutputTokens) ||
    args.maxOutputTokens < 0 ||
    (args.maxOutputTokens > 0 && args.maxOutputTokens < 64)
  ) {
    throw new Error("--max-output-tokens must be 0 or >= 64");
  }
  if (args.maxItems !== undefined && (!Number.isFinite(args.maxItems) || args.maxItems < 1)) {
    throw new Error("--max-items must be >= 1");
  }
  if (
    args.glossaryLimit !== undefined &&
    (!Number.isFinite(args.glossaryLimit) || args.glossaryLimit < 1)
  ) {
    throw new Error("--glossary-limit must be >= 1");
  }
  if (args.glossaryPair !== undefined && !parseGlossaryPair(args.glossaryPair)) {
    throw new Error(
      "--glossary-pair must be in one of formats: source=>target, source->target, source:target, source=target"
    );
  }
  if (args.glossarySource !== undefined && !args.glossarySource.trim()) {
    throw new Error("--glossary-source must not be empty");
  }
  if (args.glossaryTarget !== undefined && !args.glossaryTarget.trim()) {
    throw new Error("--glossary-target must not be empty");
  }
  if (!Number.isFinite(args.verifyChars) || args.verifyChars < 100) {
    throw new Error("--verify-chars must be >= 100");
  }

  const apiKey = getApiKey();
  if (!args.dryRun && !args.onlyShowPrompts && !apiKey) {
    throw new Error("Missing OPEN_API_KEY (or OPENAI_API_KEY) environment variable");
  }

  log.info(`First-attempt model: ${FIRST_TRY_MODEL}`);
  log.info(`Retry model: ${args.retryModel}`);
  log.info(`Contents dir: ${CONTENTS_TEXTS_DIR}`);
  if (args.contentId) log.info(`Filter content-id: ${args.contentId}`);
  if (args.lang) log.info(`Filter locale: ${args.lang}`);
  if (args.maxItems) log.info(`Max items: ${args.maxItems}`);
  log.info(`Max output tokens: ${args.maxOutputTokens}`);
  log.info(`Language verification: ${args.verifyLanguage ? `on (${args.verifyModel}, ${args.verifyChars} chars)` : "off"}`);
  if (args.dryRun) log.warn("DRY RUN enabled — no files will be changed");

  const generatedGlossaryIndex = await buildGlossaryIndex(args);
  const generatedGlossaryPairsCount = Array.from(generatedGlossaryIndex.values()).reduce(
    (sum, entries) => sum + entries.length,
    0
  );
  log.info(
    `Glossary extracted from ENHANCED_BY_GPT files: ${generatedGlossaryPairsCount} terms across ${generatedGlossaryIndex.size} language pairs`
  );

  const persistedGlossaryIndex = await loadGlossaryFromDisk(GLOSSARY_JSON_PATH);
  const persistedGlossaryPairsCount = Array.from(persistedGlossaryIndex.values()).reduce(
    (sum, entries) => sum + entries.length,
    0
  );
  log.info(
    `Glossary loaded from disk (${GLOSSARY_JSON_PATH}): ${persistedGlossaryPairsCount} terms across ${persistedGlossaryIndex.size} language pairs`
  );

  const glossaryIndex = mergeGlossaryIndexes(generatedGlossaryIndex, persistedGlossaryIndex);
  const totalGlossaryPairsCount = Array.from(glossaryIndex.values()).reduce(
    (sum, entries) => sum + entries.length,
    0
  );
  log.info(`Combined glossary in use: ${totalGlossaryPairsCount} terms across ${glossaryIndex.size} language pairs`);

  if (args.showGlossary) {
    printGlossary(args, glossaryIndex);
    return;
  }

  const allItems = await collectWorkItems(args);
  const items = args.maxItems ? allItems.slice(0, args.maxItems) : allItems;

  log.info(`Queued items: ${items.length}`);
  if (items.length === 0) {
    log.success("Nothing to process.");
    return;
  }

  if (args.onlyShowPrompts) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      log.info(`(${i + 1}/${items.length}) prompt ${item.contentId}:${item.targetLang}`);
      await printPromptForItem(
        item,
        resolveGlossaryForPair(glossaryIndex, item.sourceLang, item.targetLang)
      );
    }
    log.success(`Printed prompts: ${items.length}`);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    log.info(`(${i + 1}/${items.length}) ${item.contentId}:${item.targetLang}`);

    const ok = await processItem({
      item,
      apiKey: apiKey ?? "",
      model: args.model,
      retryModel: args.retryModel,
      verifyLanguage: args.verifyLanguage,
      verifyModel: args.verifyModel,
      verifyChars: args.verifyChars,
      maxOutputTokens: args.maxOutputTokens,
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      dryRun: args.dryRun,
      glossary: resolveGlossaryForPair(glossaryIndex, item.sourceLang, item.targetLang),
    });

    if (ok) successCount++;
    else failCount++;

    if (i < items.length - 1 && args.sleepMs > 0 && !args.dryRun) {
      await sleep(args.sleepMs);
    }
  }

  log.success(`Done. Success: ${successCount}, Failed: ${failCount}`);
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
