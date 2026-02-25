#!/usr/bin/env node
/**
 * Translator CLI — add/refresh missing translations using LibreTranslate.
 *
 * Usage:
 *   npx tsx scripts/translate/index.ts [options]
 *
 * Options:
 *   --mode <mode>         messages | contents | json-data | all   (default: all)
 *   --base-lang <code>    Base language to translate FROM          (default: uk)
 *   --target-langs <csv>  Comma-separated target language codes   (default: all from languages.json)
 *   --api-url <url>       LibreTranslate instance URL             (default: http://localhost:5000)
 *   --api-key <key>       LibreTranslate API key (optional)
 *   --dry-run             Show what would be translated without making changes
 *   --help                Show this help message
 *
 * Examples:
 *   # Translate everything from Ukrainian to all languages
 *   npx tsx scripts/translate/index.ts
 *
 *   # Translate only messages, dry run
 *   npx tsx scripts/translate/index.ts --mode messages --dry-run
 *
 *   # Translate from English to French and German only
 *   npx tsx scripts/translate/index.ts --base-lang en --target-langs fr,de
 *
 *   # Use a remote LibreTranslate instance with API key
 *   npx tsx scripts/translate/index.ts --api-url https://libretranslate.com --api-key YOUR_KEY
 */

import { LibreTranslateClient } from "./client.js";
import { translateMessages } from "./messages.js";
import { translateContentsTexts } from "./contents-texts.js";
import { translateJsonData } from "./json-data.js";
import { getAllLanguageCodes, log } from "./utils.js";
import { CONTENTS_JSON, AUTHORS_JSON, DEFAULT_API_URL } from "./config.js";

/* ------------------------------------------------------------------ */
/*  Argument parsing                                                   */
/* ------------------------------------------------------------------ */

type Mode = "messages" | "contents" | "json-data" | "all";

interface CliArgs {
  mode: Mode;
  baseLang: string;
  targetLangs: string[] | null; // null = all
  apiUrl: string;
  apiKey?: string;
  contentId?: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    mode: "all",
    baseLang: "uk",
    targetLangs: null,
    apiUrl: DEFAULT_API_URL,
    dryRun: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
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
║            Powered by LibreTranslate (self-hosted)              ║
╚══════════════════════════════════════════════════════════════════╝

Usage:
  npx tsx scripts/translate/index.ts [options]

Modes:
  messages      Translate messages/*.json UI string files
  contents      Translate Data/ContentsTexts/**/{lang}.md articles
  json-data     Translate locale-map fields in contents.json & authors.json
  all           Run all of the above (default)

Options:
  --mode <mode>         messages | contents | json-data | all   (default: all)
  --base-lang <code>    Base language to translate FROM          (default: uk)
  --target-langs <csv>  Comma-separated target codes            (default: all from languages.json)
  --api-url <url>       LibreTranslate URL                      (default: http://localhost:5000)
  --api-key <key>       API key for the LibreTranslate instance (optional)
  --content-id <id>     Only translate a specific content folder (contents mode)
  --dry-run             Preview changes without writing files
  --help                Show this help message

Prerequisites:
  1. Install and run LibreTranslate locally:
       pip install libretranslate
       libretranslate
  2. Or use a managed instance with --api-url and --api-key

Examples:
  npx tsx scripts/translate/index.ts
  npx tsx scripts/translate/index.ts --mode messages --dry-run
  npx tsx scripts/translate/index.ts --base-lang en --target-langs fr,de
  npx tsx scripts/translate/index.ts --mode contents --content-id disclaimer --base-lang en
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

  log.info(`Mode: ${args.mode}`);
  log.info(`Base language: ${args.baseLang}`);
  log.info(`Target languages: ${targetLangs.length} language(s)`);
  log.info(`API URL: ${args.apiUrl}`);
  if (args.dryRun) log.warn("DRY RUN — no files will be modified");
  console.log();

  // Create API client & verify connectivity
  const client = new LibreTranslateClient(args.apiUrl, args.apiKey);
  const healthy = await client.healthCheck();
  if (!healthy) {
    if (args.dryRun) {
      log.warn(
        `Cannot connect to LibreTranslate at ${args.apiUrl} (dry-run continues without API)`
      );
    } else {
      log.error(
        `Cannot connect to LibreTranslate at ${args.apiUrl}.\n` +
          `  Make sure the server is running:\n` +
          `    pip install libretranslate\n` +
          `    libretranslate`
      );
      process.exit(1);
    }
  }

  if (healthy) {
    const supported = await client.getSupportedLanguages();
    log.success(
      `Connected to LibreTranslate (${supported.size} languages supported)`
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
          client,
          baseLang: args.baseLang,
          targetLangs,
          dryRun: args.dryRun,
        });
        break;

      case "contents":
        await translateContentsTexts({
          client,
          baseLang: args.baseLang,
          targetLangs,
          contentId: args.contentId,
          dryRun: args.dryRun,
        });
        break;

      case "json-data":
        await translateJsonData({
          client,
          baseLang: args.baseLang,
          targetLangs,
          filePaths: [CONTENTS_JSON, AUTHORS_JSON],
          dryRun: args.dryRun,
        });
        break;
    }

    console.log();
  }

  log.success("Translation complete!");
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
