import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import {
  getContents,
  getAuthors,
  getLanguages,
  getSources,
  getContentMarkdownWithLanguage,
  hasSourcePdf,
  hasCountryFlag,
  getCountryFlagSrc,
  getLanguageName,
  t as loc,
  type Author,
} from "@/lib/data";

const CHIP_LABELS: Record<string, { original: string; machine: string }> = {
  ar: { original: "الأصل", machine: "ترجمة آلية" },
  bg: { original: "Оригинал", machine: "Машинен превод" },
  bn: { original: "মূল", machine: "মেশিন অনুবাদ" },
  cs: { original: "Originál", machine: "Strojový překlad" },
  da: { original: "Original", machine: "Maskinoversættelse" },
  de: { original: "Original", machine: "Maschinelle Übersetzung" },
  el: { original: "Πρωτότυπο", machine: "Μηχανική μετάφραση" },
  en: { original: "Original", machine: "Machine translation" },
  es: { original: "Original", machine: "Traducción automática" },
  fa: { original: "اصل", machine: "ترجمه ماشینی" },
  fi: { original: "Alkuperäinen", machine: "Konekäännös" },
  fr: { original: "Original", machine: "Traduction automatique" },
  he: { original: "מקור", machine: "תרגום מכונה" },
  hi: { original: "मूल", machine: "मशीन अनुवाद" },
  hr: { original: "Izvornik", machine: "Strojni prijevod" },
  hu: { original: "Eredeti", machine: "Gépi fordítás" },
  id: { original: "Asli", machine: "Terjemahan mesin" },
  it: { original: "Originale", machine: "Traduzione automatica" },
  ja: { original: "原文", machine: "機械翻訳" },
  ko: { original: "원문", machine: "기계 번역" },
  lt: { original: "Originalas", machine: "Mašininis vertimas" },
  lv: { original: "Oriģināls", machine: "Mašīntulkojums" },
  ms: { original: "Asal", machine: "Terjemahan mesin" },
  my: { original: "မူရင်း", machine: "စက်ဘာသာပြန်" },
  nl: { original: "Origineel", machine: "Machinevertaling" },
  no: { original: "Original", machine: "Maskinoversettelse" },
  pl: { original: "Oryginał", machine: "Tłumaczenie maszynowe" },
  pt: { original: "Original", machine: "Tradução automática" },
  ro: { original: "Original", machine: "Traducere automată" },
  ru: { original: "Оригинал", machine: "Машинный перевод" },
  sk: { original: "Originál", machine: "Strojový preklad" },
  sr: { original: "Оригинал", machine: "Машински превод" },
  sv: { original: "Original", machine: "Maskinöversättning" },
  sw: { original: "Asili", machine: "Tafsiri ya mashine" },
  ta: { original: "அசல்", machine: "இயந்திர மொழிபெயர்ப்பு" },
  th: { original: "ต้นฉบับ", machine: "แปลด้วยเครื่อง" },
  tr: { original: "Orijinal", machine: "Makine çevirisi" },
  uk: { original: "Оригінал", machine: "Машинний переклад" },
  vi: { original: "Bản gốc", machine: "Dịch máy" },
  zh: { original: "原文", machine: "机器翻译" },
};

type Props = {
  params: Promise<{ locale: string; contentId: string }>;
};

export default async function ContentPage({ params }: Props) {
  const { locale, contentId } = await params;
  const tShared = await getTranslations("Shared");

  const contents = getContents();
  const content = contents.find((c) => c.id === contentId);
  if (!content) notFound();

  const authors = getAuthors();
  const languages = getLanguages();
  const sources = getSources();

  const title = loc(content.title, locale, content.langCode);
  const markdownResult = getContentMarkdownWithLanguage(
    contentId,
    locale,
    content.langCode,
  );
  const markdown = markdownResult?.markdown ?? null;
  const pdfAvailable = hasSourcePdf(contentId);
  const language = languages.find((l) => l.code === content.langCode);
  const flagExists = hasCountryFlag(content.countryCode);
  const isOriginalContentLanguage =
    markdownResult?.languageCode === content.langCode;
  const chipLabels = CHIP_LABELS[locale] ?? CHIP_LABELS.en;
  const contentTypeLabel = tShared(
    `ContentsTypesDescription.${content.type}`,
  );
  const source = content.sourceId
    ? sources.find((s) => s.id === content.sourceId)
    : null;
  const sourceLabel = tShared("source");

  const contentAuthors: Author[] = (
    content.authorIds ?? (content.authorId != null ? [content.authorId] : [])
  )
    .map((id) => authors.find((a) => a.id === id))
    .filter((a): a is Author => a != null);

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      {/* Back link */}
      <Link
        href={`/${locale}`}
        className="text-blue-600 hover:underline text-sm mb-6 inline-block"
      >
        ← {locale === "uk" ? "На головну" : "Home"}
      </Link>

      {/* PDF download */}
      {pdfAvailable && (
        <div className="mb-6">
          <a
            href={`/api/source/${contentId}`}
            download="source.pdf"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {tShared("downloadPdf")}
          </a>
        </div>
      )}

      {content.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/content-image/${contentId}/${content.thumbnail}`}
          alt={title}
          style={{ width: "auto", float: "right", marginLeft: "1.5rem", marginBottom: "1rem" }}
          className="rounded-md shadow-sm w-auto max-h-[100px] md:max-h-[200px]"
          loading="lazy"
        />
      )}

      <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-6">
        {title}
      </h1>

      {/* Meta info */}
      <div className="mb-8 text-gray-700 space-y-2">
        {(flagExists || content.year || language) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {flagExists && (
              <Image
                src={getCountryFlagSrc(content.countryCode)}
                alt={content.countryCode}
                width={24}
                height={16}
                className="inline-block rounded-sm flag-img"
              />
            )}
            {content.year && (
              <span className="text-gray-800">
                {content.year}{language ? "," : ""}
              </span>
            )}
            {language && (
              <span className="text-gray-700">
                {tShared("originalLanguage", {
                  language: getLanguageName(language, locale),
                })}
              </span>
            )}
            {language && locale !== content.langCode && (
              <Link
                href={`/${content.langCode}/content/${contentId}`}
                className="text-sm text-gray-400 hover:text-gray-600 underline"
              >
                {tShared("readInOriginal")}
              </Link>
            )}
          </div>
        )}
        {contentAuthors.length > 0 && (
          <div>
            {contentAuthors.map((author) => (
              <div key={author.id}>
                <span className="text-gray-500 text-sm">
                  {tShared("author")}
                </span>{" "}
                <span className="text-black font-bold">
                  {loc(author.name, locale, content.langCode)}
                </span>
                {loc(author.bio, locale, content.langCode) && (
                  <>
                    {" \u2014 "}
                    <span className="text-gray-600">
                      {loc(author.bio, locale, content.langCode)}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Markdown content */}
      {markdown ? (
        <>
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span 
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${isOriginalContentLanguage ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
            >
              {isOriginalContentLanguage
                ? chipLabels.original
                : chipLabels.machine}
            </span>
            <span style={{ textTransform: "capitalize" }} className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800">
              {contentTypeLabel}
            </span>
          </div>
          {content.url && (
            <p className="mb-4">
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-400 hover:text-gray-600 underline"
              >
                {source
                  ? `${sourceLabel}: ${source.name}`
                  : sourceLabel}
              </a>
            </p>
          )}
          <article className="prose prose-gray max-w-none">
            <ReactMarkdown
              components={{
                img: ({ src, alt, ...props }) => {
                  // Rewrite relative image paths to the content-image API route
                  const srcStr = typeof src === "string" ? src : undefined;
                  const resolvedSrc =
                    srcStr && !srcStr.startsWith("http") && !srcStr.startsWith("/")
                      ? `/api/content-image/${contentId}/${srcStr}`
                      : srcStr;
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolvedSrc}
                      alt={alt ?? ""}
                      className="rounded-lg my-6 max-w-full h-auto"
                      loading="lazy"
                      {...props}
                    />
                  );
                },
              }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        </>
      ) : (
        <p className="text-gray-500 italic">Content not available.</p>
      )}

    </div>
  );
}
