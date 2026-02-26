#!/usr/bin/env node
/**
 * Translator CLI — add/refresh missing translations.
 *
 * Supports multiple translation engines:
 *   - libretranslate  (default) — self-hosted LibreTranslate instance
 *   - nllb200         — Meta NLLB-200 via FastAPI (HuggingFace Spaces)
 *
 * Usage:
 *   npx tsx scripts/translate/index.ts [options]
 *
 * Options:
 *   --engine <name>       libretranslate | nllb200                (default: libretranslate)
 *   --mode <mode>         messages | contents | json-data | all   (default: all)
 *   --base-lang <code>    Base language to translate FROM          (default: uk)
 *   --target-langs <csv>  Comma-separated target language codes   (default: all from languages.json)
 *   --api-url <url>       Translation engine URL                  (default: depends on engine)
 *   --api-key <key>       API key (LibreTranslate only, optional)
 *   --dry-run             Show what would be translated without making changes
 *   --help                Show this help message
 *
 * Examples:
 *   # Translate everything from Ukrainian to all languages (LibreTranslate)
 *   npx tsx scripts/translate/index.ts
 *
 *   # Translate only messages, dry run
 *   npx tsx scripts/translate/index.ts --mode messages --dry-run
 *
 *   # Translate from English to French and German only
 *   npx tsx scripts/translate/index.ts --base-lang en --target-langs fr,de
 *
 *   # Use NLLB-200 engine
 *   npx tsx scripts/translate/index.ts --engine nllb200
 *
 *   # Use a remote LibreTranslate instance with API key
 *   npx tsx scripts/translate/index.ts --api-url https://libretranslate.com --api-key YOUR_KEY
 */

import { LibreTranslateClient } from "./client.js";
import { Nllb200Client } from "./nllb200-client.js";
import type { TranslationEngine, EngineName } from "./engine.js";
import { ENGINE_NAMES } from "./engine.js";
import { translateMessages } from "./messages.js";
import { translateContentsTexts } from "./contents-texts.js";
import { translateJsonData } from "./json-data.js";
import { getAllLanguageCodes, log } from "./utils.js";
import { getAllContentsJsonPaths, AUTHORS_JSON, DEFAULT_API_URL } from "./config.js";

/* ------------------------------------------------------------------ */
/*  Argument parsing                                                   */
/* ------------------------------------------------------------------ */

type Mode = "messages" | "contents" | "json-data" | "all";

interface CliArgs {
  engine: EngineName;
  mode: Mode;
  baseLang: string;
  targetLangs: string[] | null; // null = all
  apiUrl: string | null; // null = use engine default
  apiKey?: string;
  contentId?: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    engine: "libretranslate",
    mode: "all",
    baseLang: "uk",
    targetLangs: null,
    apiUrl: null,
    dryRun: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--engine":
        args.engine = argv[++i] as EngineName;
        if (!ENGINE_NAMES.includes(args.engine)) {
          log.error(`Unknown engine: ${args.engine}. Supported: ${ENGINE_NAMES.join(", ")}`);
          process.exit(1);
        }
        break;
      case "--mode":
        args.mode = argv[++i] as Mode;
        break;
      case "--base-lang":
        args.baseLang = argv[++i];
        break;
      case "--target-langs":
        args.targetLangs = argv[++i].split(",").map((s) => s.trim());
        break;
      case "--api-url":
        args.apiUrl = argv[++i];
        break;
      case "--api-key":
        args.apiKey = argv[++i];
        break;
      case "--content-id":
        args.contentId = argv[++i];
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
╔══════════════════════════════════════════════════════════════════╗
║               na-project Translation Utility                    ║
╚══════════════════════════════════════════════════════════════════╝

Usage:
  npx tsx scripts/translate/index.ts [options]

Engines:
  libretranslate  Self-hosted LibreTranslate instance (default)
  nllb200         Meta NLLB-200 model via FastAPI (HuggingFace Spaces)

Modes:
  messages      Translate messages/*.json UI string files
  contents      Translate Data/ContentsTexts/**/{lang}.md articles
  json-data     Translate locale-map fields in contents.json & authors.json
  all           Run all of the above (default)

Options:
  --engine <name>       ${ENGINE_NAMES.join(" | ")}   (default: libretranslate)
  --mode <mode>         messages | contents | json-data | all   (default: all)
  --base-lang <code>    Base language to translate FROM          (default: uk)
  --target-langs <csv>  Comma-separated target codes            (default: all from languages.json)
  --api-url <url>       Translation engine URL                  (default: engine-specific)
  --api-key <key>       API key (LibreTranslate only, optional)
  --content-id <id>     Only translate a specific content folder (contents mode)
  --dry-run             Preview changes without writing files
  --help                Show this help message

Prerequisites (LibreTranslate):
  1. Install and run LibreTranslate locally:
       pip install libretranslate
       libretranslate
  2. Or use a managed instance with --api-url and --api-key

Prerequisites (NLLB-200):
  1. Install dependencies:
       pip install -r scripts/nllb200-server/requirements.txt
  2. Start the server (port 5001 by default):
       python scripts/nllb200-server/app.py
  3. Or use a custom URL with --api-url.

Examples:
  npx tsx scripts/translate/index.ts
  npx tsx scripts/translate/index.ts --engine nllb200
  npx tsx scripts/translate/index.ts --mode messages --dry-run
  npx tsx scripts/translate/index.ts --base-lang en --target-langs fr,de
  npx tsx scripts/translate/index.ts --mode contents --content-id disclaimer --base-lang en
  npx tsx scripts/translate/index.ts --engine nllb200 --mode contents --base-lang en
  npx tsx scripts/translate/index.ts --api-url https://libretranslate.com --api-key KEY
`);
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Resolve target languages
  const targetLangs =
    args.targetLangs ?? (await getAllLanguageCodes());

  log.info(`Engine: ${args.engine}`);
  log.info(`Mode: ${args.mode}`);
  log.info(`Base language: ${args.baseLang}`);
  log.info(`Target languages: ${targetLangs.length} language(s)`);

  // Create the translation engine
  const engine = createEngine(args);

  log.info(`API URL: ${(engine as any).apiUrl ?? "(built-in)"}`);
  if (args.dryRun) log.warn("DRY RUN — no files will be modified");
  console.log();

  // Verify connectivity
  const healthy = await engine.healthCheck();
  if (!healthy) {
    if (args.dryRun) {
      log.warn(
        `Cannot connect to ${engine.name} (dry-run continues without API)`
      );
    } else {
      log.error(
        `Cannot connect to ${engine.name}.\n` +
          `  Make sure the server is running or reachable.`
      );
      process.exit(1);
    }
  }

  if (healthy) {
    const supported = await engine.getSupportedLanguages();
    log.success(
      `Connected to ${engine.name} (${supported.size} languages supported)`
    );
  }
  console.log();

  // Run the selected mode(s)
  const modes =
    args.mode === "all"
      ? (["messages", "contents", "json-data"] as Mode[])
      : [args.mode];

  for (const mode of modes) {
    console.log(`${"─".repeat(60)}`);

    switch (mode) {
      case "messages":
        await translateMessages({
          engine,
          baseLang: args.baseLang,
          targetLangs,
          dryRun: args.dryRun,
        });
        break;

      case "contents":
        await translateContentsTexts({
          engine,
          baseLang: args.baseLang,
          targetLangs,
          contentId: args.contentId,
          dryRun: args.dryRun,
        });
        break;

      case "json-data":
        await translateJsonData({
          engine,
          baseLang: args.baseLang,
          targetLangs,
          filePaths: [...getAllContentsJsonPaths(), AUTHORS_JSON],
          dryRun: args.dryRun,
        });
        break;
    }

    console.log();
  }

  log.success("Translation complete!");
}

/* ------------------------------------------------------------------ */
/*  Engine factory                                                     */
/* ------------------------------------------------------------------ */

function createEngine(args: CliArgs): TranslationEngine {
  switch (args.engine) {
    case "libretranslate":
      return new LibreTranslateClient(
        args.apiUrl ?? DEFAULT_API_URL,
        args.apiKey
      );
    case "nllb200":
      return new Nllb200Client(args.apiUrl ?? undefined);
    default:
      log.error(`Unknown engine: ${args.engine}`);
      process.exit(1);
  }
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
