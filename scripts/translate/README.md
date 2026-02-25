# Translation Utility

Automated translation tool for the na-project, powered by [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate).

## Prerequisites

Install and run LibreTranslate locally:

```bash
pip install libretranslate
libretranslate
```

Or use a managed instance at [libretranslate.com](https://portal.libretranslate.com/).

## Usage

```bash
# Translate everything (messages + contents + json-data) from Ukrainian
npm run translate

# Preview what would be translated (no files modified)
npm run translate:dry

# Translate only UI messages
npm run translate:messages

# Translate only article markdown files
npm run translate:contents

# Translate only contents.json & authors.json
npm run translate:json-data

# Custom: specific base language and targets
npx tsx scripts/translate/index.ts --base-lang en --target-langs fr,de

# Use remote LibreTranslate with API key
npx tsx scripts/translate/index.ts --api-url https://libretranslate.com --api-key YOUR_KEY
```

## Modes

| Mode | What it translates |
|---|---|
| `messages` | `messages/*.json` — UI string files (keys missing in target vs. base) |
| `contents` | `Data/ContentsTexts/{id}/{lang}.md` — article markdown files (creates missing .md files) |
| `json-data` | `Data/contents.json` & `Data/authors.json` — locale-map fields like `"title": { "uk": "...", "en": "..." }` |
| `all` | All of the above (default) |

## Options

| Option | Default | Description |
|---|---|---|
| `--mode` | `all` | `messages`, `contents`, `json-data`, or `all` |
| `--base-lang` | `uk` | Source language code |
| `--target-langs` | all from `languages.json` | Comma-separated target codes |
| `--api-url` | `http://localhost:5000` | LibreTranslate instance URL |
| `--api-key` | — | API key (required for managed instances) |
| `--dry-run` | — | Preview without writing files |

## Architecture

```
scripts/translate/
  index.ts            CLI entry point & arg parsing
  config.ts           Paths, language code mappings, defaults
  client.ts           LibreTranslate API client (rate-limiting, retry)
  messages.ts         Translator for messages/*.json
  contents-texts.ts   Translator for Data/ContentsTexts/**/*.md
  json-data.ts        Translator for contents.json & authors.json
  utils.ts            Shared helpers (file I/O, logging, progress bar)
```
