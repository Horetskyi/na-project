import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("Footer");

  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-6">
          {/* Official Acropolis logo placeholder */}
          <div
            className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center text-gray-400 shrink-0"
            title="Official Acropolis Logo"
            aria-label="Official Acropolis Logo"
          >
            🏛️
          </div>

          {/* Symbolic Acropolis eagle logo placeholder */}
          <div
            className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center text-gray-400 shrink-0"
            title="Acropolis Eagle Logo"
            aria-label="Acropolis Eagle Logo"
          >
            🦅
          </div>

          {/* Contact email */}
          <div className="text-sm">
            <span className="text-gray-400">{t("contactUs")}: </span>
            <a
              href="mailto:againstmanipulations@gmail.com"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              againstmanipulations@gmail.com
            </a>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-400 leading-relaxed border-t border-gray-700 pt-6">
          {t("description")}
        </p>
      </div>
    </footer>
  );
}
