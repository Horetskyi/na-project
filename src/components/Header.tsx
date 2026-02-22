"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { locales, type Locale } from "@/i18n/routing";

const LOCALE_META: Record<Locale, { flag: string; name: string }> = {
  uk: { flag: "🇺🇦", name: "Українська" },
  en: { flag: "🇬🇧", name: "English" },
  de: { flag: "🇩🇪", name: "Deutsch" },
  fr: { flag: "🇫🇷", name: "Français" },
  es: { flag: "🇪🇸", name: "Español" },
  it: { flag: "🇮🇹", name: "Italiano" },
  pt: { flag: "🇵🇹", name: "Português" },
  pl: { flag: "🇵🇱", name: "Polski" },
  ru: { flag: "🇷🇺", name: "Русский" },
  nl: { flag: "🇳🇱", name: "Nederlands" },
  sv: { flag: "🇸🇪", name: "Svenska" },
  da: { flag: "🇩🇰", name: "Dansk" },
  fi: { flag: "🇫🇮", name: "Suomi" },
  no: { flag: "🇳🇴", name: "Norsk" },
  cs: { flag: "🇨🇿", name: "Čeština" },
  sk: { flag: "🇸🇰", name: "Slovenčina" },
  hu: { flag: "🇭🇺", name: "Magyar" },
  ro: { flag: "🇷🇴", name: "Română" },
  bg: { flag: "🇧🇬", name: "Български" },
  hr: { flag: "🇭🇷", name: "Hrvatski" },
  sr: { flag: "🇷🇸", name: "Српски" },
  sl: { flag: "🇸🇮", name: "Slovenščina" },
  lt: { flag: "🇱🇹", name: "Lietuvių" },
  lv: { flag: "🇱🇻", name: "Latviešu" },
  et: { flag: "🇪🇪", name: "Eesti" },
  el: { flag: "🇬🇷", name: "Ελληνικά" },
  tr: { flag: "🇹🇷", name: "Türkçe" },
  ar: { flag: "🇸🇦", name: "العربية" },
  he: { flag: "🇮🇱", name: "עברית" },
  zh: { flag: "🇨🇳", name: "中文" },
  ja: { flag: "🇯🇵", name: "日本語" },
  ko: { flag: "🇰🇷", name: "한국어" },
  hi: { flag: "🇮🇳", name: "हिन्दी" },
  th: { flag: "🇹🇭", name: "ภาษาไทย" },
  vi: { flag: "🇻🇳", name: "Tiếng Việt" },
  id: { flag: "🇮🇩", name: "Bahasa Indonesia" },
  ms: { flag: "🇲🇾", name: "Bahasa Melayu" },
  fa: { flag: "🇮🇷", name: "فارسی" },
  ur: { flag: "🇵🇰", name: "اردو" },
  bn: { flag: "🇧🇩", name: "বাংলা" },
};

export default function Header() {
  const t = useTranslations("Header");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleLocaleChange = (newLocale: Locale) => {
    setOpen(false);
    // Replace the current locale prefix in the pathname
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/") || "/");
  };

  const current = LOCALE_META[locale];

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between h-16">
          {/* Left side: logos and title */}
          <div className="flex items-center gap-3">
            {/* Official Acropolis logo placeholder */}
            <div
              className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500 font-medium shrink-0"
              title="Official Acropolis Logo"
              aria-label="Official Acropolis Logo"
            >
              🏛️
            </div>

            {/* Symbolic Acropolis eagle logo placeholder */}
            <div
              className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500 font-medium shrink-0"
              title="Acropolis Eagle Logo"
              aria-label="Acropolis Eagle Logo"
            >
              🦅
            </div>

            {/* Bold link to homepage */}
            <Link
              href={`/${locale}`}
              className="font-bold text-gray-900 hover:text-gray-700 transition-colors text-sm sm:text-base"
            >
              {t("title")}
            </Link>
          </div>

          {/* Right side: language selector */}
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-sm font-medium"
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              <span className="text-lg leading-none">{current.flag}</span>
              <span className="hidden sm:inline text-gray-700">{current.name}</span>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {open && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setOpen(false)}
                />
                {/* Dropdown */}
                <div className="absolute right-0 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-y-auto min-w-[180px]">
                  <ul role="listbox">
                    {locales.map((loc) => {
                      const meta = LOCALE_META[loc];
                      return (
                        <li key={loc}>
                          <button
                            role="option"
                            aria-selected={loc === locale}
                            onClick={() => handleLocaleChange(loc)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left ${
                              loc === locale ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700"
                            }`}
                          >
                            <span className="text-lg leading-none">{meta.flag}</span>
                            <span>{meta.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
