import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("Footer");
  const locale = useLocale();

  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-6">
          {/* Official Acropolis logo */}
          {/* <Image
            src="/na-logo-official-letters-only-full-size-white.webp"
            alt="Official Acropolis Logo"
            width={48}
            height={48}
            className="w-12 h-12 object-contain shrink-0"
          /> */}

          {/* Symbolic Acropolis eagle logo */}
          <div className="w-12 h-12 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: '#00015D' }}>
            <Image
              src="/eagle_na_symbol.jpg"
              alt="Acropolis Eagle Logo"
              width={40}
              height={40}
              className="w-10 h-10 object-contain"
            />
          </div>

          {/* Contact email and Disclaimer link */}
          <div className="text-sm">
            <span className="text-gray-300">{t("contactUs")}: </span>
            <a
              href="mailto:againstmanipulations@gmail.com"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              againstmanipulations@gmail.com
            </a>
            <span className="text-gray-600 mx-2">|</span>
            <Link
              href={`/${locale}/disclaimer-legal`}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              {t("disclaimerLegal")}
            </Link>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-300 leading-relaxed border-t border-gray-700 pt-6">
          {t("description")}
        </p>
      </div>
    </footer>
  );
}
