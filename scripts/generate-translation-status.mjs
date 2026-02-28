import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, 'Data');
const contentsTextsDir = path.join(dataDir, 'ContentsTexts');
const messagesDir = path.join(repoRoot, 'messages');

const metadataFiles = ['contents.json', 'contents2.json', 'contents3.json'];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const knownLangs = fs
  .readdirSync(messagesDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => entry.name.replace(/\.json$/i, ''))
  .sort();

const idToOriginalLang = new Map();

for (const metadataFile of metadataFiles) {
  const filePath = path.join(dataDir, metadataFile);
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const items = readJson(filePath);
  for (const item of items) {
    if (item?.id && item?.langCode && !idToOriginalLang.has(item.id)) {
      idToOriginalLang.set(item.id, item.langCode);
    }
  }
}

const contentDirs = fs
  .readdirSync(contentsTextsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let createdCount = 0;

for (const contentId of contentDirs) {
  const contentDir = path.join(contentsTextsDir, contentId);
  const statusPath = path.join(contentDir, 'translationStatus.json');

  if (fs.existsSync(statusPath)) {
    continue;
  }

  const mdLangs = fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.replace(/\.md$/i, ''))
    .filter((lang) => knownLangs.includes(lang));

  const originalLang = idToOriginalLang.get(contentId) ?? null;

  const status = {};

  for (const lang of knownLangs) {
    if (!mdLangs.includes(lang)) {
      continue;
    }
    status[lang] = 'MACHINE_TRANSLATED';
  }

  if (originalLang && Object.prototype.hasOwnProperty.call(status, originalLang)) {
    status[originalLang] = 'ORIGINAL';
  }

  fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  createdCount += 1;
}

console.log(`Created ${createdCount} translationStatus.json files.`);