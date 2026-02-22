import { defineRouting } from "next-intl/routing";

export const locales = [
  "uk", "en", "de", "fr", "es", "it", "pt", "pl", "ru", "nl",
  "sv", "da", "fi", "no", "cs", "sk", "hu", "ro", "bg", "hr",
  "sr", "lt", "lv", "el", "tr", "ar", "he", "zh",
  "ja", "ko", "hi", "th", "vi", "id", "ms", "fa", "bn",
  "my", "sw", "ta",
] as const;

export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "uk",
});
