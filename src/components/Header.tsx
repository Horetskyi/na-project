"use client";

import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect, useMemo } from "react";
import { locales, type Locale } from "@/i18n/routing";
import { LANGUAGE_SEARCH_TERMS } from "@/lib/languageSearchTerms";

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
  lt: { flag: "🇱🇹", name: "Lietuvių" },
  lv: { flag: "🇱🇻", name: "Latviešu" },
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
  bn: { flag: "🇧🇩", name: "বাংলা" },
  my: { flag: "🇲🇲", name: "မြန်မာစာ" },
  sw: { flag: "🇰🇪", name: "Kiswahili" },
  ta: { flag: "🇮🇳", name: "தமிழ்" },
};

export default function Header() {
  const t = useTranslations("Header");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus the search input when dropdown opens
  useEffect(() => {
    if (open) {
      // Small delay to let the dropdown render
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      setSearch("");
    }
  }, [open]);

  // Filter locales based on search query matching any name variant
  const filteredLocales = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locales;
    return locales.filter((loc) => {
      const terms = LANGUAGE_SEARCH_TERMS[loc];
      if (!terms) return false;
      return terms.some((term) => term.toLowerCase().includes(q));
    });
  }, [search]);

  const handleLocaleChange = (newLocale: Locale) => {
    setOpen(false);
    // Replace the current locale prefix in the pathname
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/") || "/");
  };

  const current = LOCALE_META[locale];

  return (
    <header className="bg-special text-special border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between h-16">
          {/* Left side: logos and title */}
          <div className="flex items-center gap-3">
            {/* Official Acropolis logo */}
            {/* <Image
              src="/na-logo-official-letters-only-full-size.webp"
              alt="Official Acropolis Logo"
              width={40}
              height={40}
              className="w-10 h-10 object-contain shrink-0"
            /> */}

            {/* Symbolic Acropolis eagle logo */}
            <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: '#00015D' }}>
              <Image
                src="/eagle_na_symbol.jpg"
                alt="Acropolis Eagle Logo"
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
              />
            </div>

            {/* Bold link to homepage */}
            <Link
              href={`/${locale}`}
              className="font-bold text-special-hover transition-colors text-sm sm:text-base"
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
              <Image src={`/flags/${locale}.webp`} alt={current.name} width={24} height={16} className="w-6 h-4 object-cover rounded-sm flag-img" />
              <span className="hidden sm:inline text-gray-700 font-bold">{current.name}</span>
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
                <div className="absolute right-0 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-hidden min-w-[220px] flex flex-col">
                  {/* Search box */}
                  <div className="p-2 border-b border-gray-100">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="🔍"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 text-gray-700"
                      autoComplete="off"
                    />
                  </div>
                  {/* List */}
                  <ul role="listbox" className="overflow-y-auto flex-1">
                    {filteredLocales.length > 0 ? (
                      filteredLocales.map((loc) => {
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
                              <Image src={`/flags/${loc}.webp`} alt={meta.name} width={24} height={16} className="w-6 h-4 object-cover rounded-sm flag-img" />
                              <span>{meta.name}</span>
                            </button>
                          </li>
                        );
                      })
                    ) : (
                      <li className="px-3 py-2 text-sm text-gray-400 text-center">—</li>
                    )}
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
