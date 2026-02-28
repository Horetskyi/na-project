#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { CONTENTS_TEXTS_DIR } from "./config.js";
import { listDirs, log } from "./utils.js";

type TranslationStatus =
  | "ORIGINAL"
  | "ENHANCED_BY_GPT"
  | "ENHANCED_BY_HUMAN"
  | "MACHINE_TRANSLATED";

interface CliArgs {
  model: string;
  contentId?: string;
  lang?: string;
  maxItems?: number;
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

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    model: "gpt-4.1",
    sleepMs: 600,
    retries: 2,
    timeoutMs: 240000,
    dryRun: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--model":
        args.model = argv[++i] ?? args.model;
        break;
      case "--content-id":
        args.contentId = argv[++i];
        break;
      case "--lang":
        args.lang = argv[++i];
        break;
      case "--max-items":
        args.maxItems = Number(argv[++i]);
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
  --model <name>       OpenAI model name (default: gpt-5.3-codex)
  --content-id <id>    Process only one content directory
  --lang <code>        Process only one target locale (e.g. uk)
  --max-items <n>      Stop after n successful updates
  --sleep-ms <n>       Delay between API calls (default: 1200)
  --retries <n>        Retries per file on failure (default: 3)
  --timeout-ms <n>     HTTP timeout per request (default: 120000)
  --dry-run            Show planned work, do not call API or write files
  --help               Show this help

Auth:
  Set OPEN_API_KEY (or OPENAI_API_KEY) in your environment.

Examples:
  npx tsx scripts/translate/enhance-gpt.ts
  npx tsx scripts/translate/enhance-gpt.ts --content-id no-tener-hijos --lang uk
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

function buildPrompt(params: {
  contentId: string;
  sourceLang: string;
  targetLang: string;
  sourceMarkdown: string;
  currentTargetMarkdown: string | null;
}): string {
  const {
    contentId,
    sourceLang,
    targetLang,
    sourceMarkdown,
    currentTargetMarkdown,
  } = params;

  return [
    "You are a professional translator and editor.",
    "Task: produce a high-quality target-language markdown file.",
    "Requirements:",
    "- Preserve markdown structure and order exactly (headings, blockquotes, lists, emphasis, links, images).",
    "- Keep proper nouns and doctrinal terms consistent unless a standard localized form exists.",
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
    "Source markdown:",
    sourceMarkdown,
    "",
    currentTargetMarkdown
      ? "Existing target markdown (improve this while staying faithful to source):"
      : "No existing target markdown found. Create a new translation from source.",
    currentTargetMarkdown ?? "",
  ]
    .filter(Boolean)
    .join("\n");
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

async function callOpenAi(params: {
  apiKey: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<string> {
  const { apiKey, model, prompt, timeoutMs } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
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
  timeoutMs: number;
  retries: number;
  dryRun: boolean;
}): Promise<boolean> {
  const { item, apiKey, model, timeoutMs, retries, dryRun } = args;
  const { contentId, targetLang, sourceLang, sourcePath, targetPath, statusPath } = item;

  const sourceMarkdown = await fs.readFile(sourcePath, "utf-8");
  const currentTargetMarkdown = (await exists(targetPath))
    ? await fs.readFile(targetPath, "utf-8")
    : null;

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
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const enhanced = await callOpenAi({
        apiKey,
        model,
        prompt,
        timeoutMs,
      });

      await fs.writeFile(targetPath, enhanced, "utf-8");

      const status = await readJson<Record<string, TranslationStatus>>(statusPath);
      status[targetLang] = "ENHANCED_BY_GPT";
      await writeJson(statusPath, status);

      log.success(`${contentId}: ${targetLang} updated and status set to ENHANCED_BY_GPT`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn(`${contentId}:${targetLang} attempt ${attempt}/${retries} failed: ${msg}`);
      if (attempt < retries) {
        await sleep(1200 * attempt);
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
  if (args.maxItems !== undefined && (!Number.isFinite(args.maxItems) || args.maxItems < 1)) {
    throw new Error("--max-items must be >= 1");
  }

  const apiKey = getApiKey();
  if (!args.dryRun && !apiKey) {
    throw new Error("Missing OPEN_API_KEY (or OPENAI_API_KEY) environment variable");
  }

  log.info(`Model: ${args.model}`);
  log.info(`Contents dir: ${CONTENTS_TEXTS_DIR}`);
  if (args.contentId) log.info(`Filter content-id: ${args.contentId}`);
  if (args.lang) log.info(`Filter locale: ${args.lang}`);
  if (args.maxItems) log.info(`Max items: ${args.maxItems}`);
  if (args.dryRun) log.warn("DRY RUN enabled — no files will be changed");

  const allItems = await collectWorkItems(args);
  const items = args.maxItems ? allItems.slice(0, args.maxItems) : allItems;

  log.info(`Queued items: ${items.length}`);
  if (items.length === 0) {
    log.success("Nothing to process.");
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
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      dryRun: args.dryRun,
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
