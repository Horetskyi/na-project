import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "Data");

/* ───────────── Types ───────────── */

export interface Content {
  id: string;
  authorId?: number;
  authorIds?: number[];
  type: string;
  title: Record<string, string>;
  subTitle?: Record<string, string>;
  city?: Record<string, string>;
  year?: number;
  langCode: string;
  countryCode: string;
  url?: string;
  authority?: number;
  sourceId?: number;
  wordsCount?: number;
  charactersCount?: number;
}

export interface Author {
  id: number;
  countryCode: string;
  name: Record<string, string>;
  bio: Record<string, string>;
  relatedUrls?: string[];
  tags?: string[];
  authority?: number;
}

export interface Language {
  name: string;
  originalName: string;
  code: string;
  translate?: Record<string, string>;
}

/**
 * Get the best display name for a language given the current locale.
 * Priority: translate[locale] → name (English).
 */
export function getLanguageName(language: Language, locale: string): string {
  return language.translate?.[locale] || language.name;
}

export interface Country {
  name: string;
  originalName: string;
  code: string;
}

/* ───────────── Data loaders ───────────── */

export function getContents(): Content[] {
  return JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "contents.json"), "utf-8"),
  );
}

export function getAuthors(): Author[] {
  return JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "authors.json"), "utf-8"),
  );
}

export function getLanguages(): Language[] {
  return JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "languages.json"), "utf-8"),
  );
}

export function getCountries(): Country[] {
  return JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "countries.json"), "utf-8"),
  );
}

/* ───────────── Content helpers ───────────── */

/**
 * Return the markdown text for a content page.
 * First tries the current locale, then falls back to the content's own langCode.
 */
export function getContentMarkdown(
  contentId: string,
  locale: string,
  fallbackLangCode: string,
): string | null {
  const result = getContentMarkdownWithLanguage(
    contentId,
    locale,
    fallbackLangCode,
  );
  return result?.markdown ?? null;
}

/**
 * Return markdown text and language code that was actually used.
 * First tries the current locale, then falls back to the content's own langCode.
 */
export function getContentMarkdownWithLanguage(
  contentId: string,
  locale: string,
  fallbackLangCode: string,
): { markdown: string; languageCode: string } | null {
  const dir = path.join(DATA_DIR, "ContentsTexts", contentId);
  const localePath = path.join(dir, `${locale}.md`);
  if (fs.existsSync(localePath)) {
    return {
      markdown: fs.readFileSync(localePath, "utf-8"),
      languageCode: locale,
    };
  }
  const fallbackPath = path.join(dir, `${fallbackLangCode}.md`);
  if (fs.existsSync(fallbackPath)) {
    return {
      markdown: fs.readFileSync(fallbackPath, "utf-8"),
      languageCode: fallbackLangCode,
    };
  }
  return null;
}

/** Check whether source.pdf exists for a content item. */
export function hasSourcePdf(contentId: string): boolean {
  return fs.existsSync(
    path.join(DATA_DIR, "ContentsTexts", contentId, "source.pdf"),
  );
}

/** Check whether a country-flag image exists in public/flags/. */
export function hasCountryFlag(countryCode: string): boolean {
  return fs.existsSync(
    path.join(process.cwd(), "public", "flags", `${countryCode}.webp`),
  );
}

/* ───────────── Localisation helper ───────────── */

/**
 * Pick the best translation from a translatable record.
 * Priority: current locale → content langCode fallback → first available value.
 */
export function t(
  texts: Record<string, string> | undefined,
  locale: string,
  fallbackLangCode: string,
): string {
  if (!texts) return "";
  return texts[locale] || texts[fallbackLangCode] || Object.values(texts)[0] || "";
}

/* ───────────── Grouping ───────────── */

const CONTENT_TYPE_ORDER = [
  "legislative_initiative",
  "inner_material",
  "article",
];

export function groupContentsByType(
  contents: Content[],
): Record<string, Content[]> {
  const grouped: Record<string, Content[]> = {};
  for (const c of contents) {
    (grouped[c.type] ??= []).push(c);
  }
  // Return in defined order, then any remaining types
  const ordered: Record<string, Content[]> = {};
  for (const type of CONTENT_TYPE_ORDER) {
    if (grouped[type]) ordered[type] = grouped[type];
  }
  for (const type of Object.keys(grouped)) {
    if (!ordered[type]) ordered[type] = grouped[type];
  }
  return ordered;
}
