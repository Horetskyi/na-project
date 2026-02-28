# Translation Utility

Automated translation tool for the na-project, supporting multiple engines:

- [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) — self-hosted, HTML-aware translation
- [NLLB-200](https://github.com/facebookresearch/fairseq/tree/nllb) — Meta's 200-language model, line-by-line translation
- OpenAI GPT enhancement pass — long-running quality upgrades for `translationStatus.json` entries marked `MACHINE_TRANSLATED`

## Prerequisites

### LibreTranslate (default engine)

Install and run LibreTranslate locally:

```bash
pip install libretranslate
libretranslate
```

Runs on port **5000** by default.

Or use a managed instance at [libretranslate.com](https://portal.libretranslate.com/).

### NLLB-200 engine

Install dependencies and start the server:

```bash
pip install -r scripts/nllb200-server/requirements.txt
python scripts/nllb200-server/app.py
```

Runs on port **5001** by default. Override with the `NLLB_PORT` environment variable:

```bash
NLLB_PORT=8080 python scripts/nllb200-server/app.py
```

The default model is `facebook/nllb-200-3.3B` (~6.6 GB). Override with the `NLLB_MODEL` environment variable:

```bash
NLLB_MODEL=facebook/nllb-200-distilled-1.3B python scripts/nllb200-server/app.py
```

| Model | Size | Quality |
|---|---|---|
| `facebook/nllb-200-distilled-600M` | ~1.2 GB | Good |
| `facebook/nllb-200-distilled-1.3B` | ~2.6 GB | Better |
| `facebook/nllb-200-3.3B` | ~6.6 GB | Best (default) |

> **Note:** The first run downloads the model. NLLB-200 works best
> translating one sentence at a time — the server and client handle this automatically.

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

# Use NLLB-200 engine (server must be running on port 5001)
npx tsx scripts/translate/index.ts --engine nllb200

# NLLB-200: translate only contents from English to Ukrainian
npx tsx scripts/translate/index.ts --engine nllb200 --mode contents --base-lang en --target-langs uk

# NLLB-200: translate a specific content folder
npx tsx scripts/translate/index.ts --engine nllb200 --mode contents --content-id disclaimer --base-lang en --target-langs uk

# GPT enhancement pass (all MACHINE_TRANSLATED entries)
npm run translate:enhance:gpt

# GPT enhancement pass for one content and locale
npx tsx scripts/translate/enhance-gpt.ts --content-id no-tener-hijos --lang uk

# Preview planned GPT work without writing files
npx tsx scripts/translate/enhance-gpt.ts --dry-run
```

## OpenAI API key setup

The GPT enhancement script reads `OPEN_API_KEY` (preferred) or `OPENAI_API_KEY`.

PowerShell (current terminal only):

```powershell
$env:OPEN_API_KEY = "YOUR_API_KEY"
```

PowerShell (persist for your user account):

```powershell
[System.Environment]::SetEnvironmentVariable("OPEN_API_KEY", "YOUR_API_KEY", "User")
```

After setting a persistent variable, open a new terminal.

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
| `--engine` | `libretranslate` | `libretranslate` or `nllb200` |
| `--mode` | `all` | `messages`, `contents`, `json-data`, or `all` |
| `--base-lang` | `uk` | Source language code |
| `--target-langs` | all from `languages.json` | Comma-separated target codes |
| `--api-url` | engine-specific | LibreTranslate: `http://localhost:5000`, NLLB-200: `http://localhost:5001` |
| `--api-key` | — | API key (LibreTranslate managed instances only) |
| `--content-id` | — | Translate only a specific content folder (contents mode) |
| `--dry-run` | — | Preview without writing files |

## Architecture

```
scripts/translate/
  index.ts            CLI entry point & arg parsing
  config.ts           Paths, language code mappings, defaults
  engine.ts           Translation engine interface
  client.ts           LibreTranslate API client (rate-limiting, retry)
  nllb200-client.ts   NLLB-200 API client (line-by-line, batch endpoint)
  messages.ts         Translator for messages/*.json
  contents-texts.ts   Translator for Data/ContentsTexts/**/*.md
  json-data.ts        Translator for contents.json & authors.json
  utils.ts            Shared helpers (file I/O, logging, progress bar)
```
