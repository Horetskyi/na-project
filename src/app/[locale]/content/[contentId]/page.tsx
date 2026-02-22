import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  getContents,
  getAuthors,
  getLanguages,
  getContentMarkdown,
  hasSourcePdf,
  getLanguageName,
  t as loc,
  type Author,
} from "@/lib/data";

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

  const title = loc(content.title, locale, content.langCode);
  const markdown = getContentMarkdown(contentId, locale, content.langCode);
  const pdfAvailable = hasSourcePdf(contentId);
  const language = languages.find((l) => l.code === content.langCode);

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

      <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-6">
        {title}
      </h1>

      {/* Meta info */}
      <div className="mb-8 text-gray-700 space-y-1">
        {content.year && <p>{content.year}</p>}
        {language && (
          <p>
            {tShared("originalLanguage", { language: getLanguageName(language, locale) })}
          </p>
        )}
        {contentAuthors.length > 0 && (
          <div>
            {contentAuthors.map((author) => (
              <div key={author.id}>
                <span className="text-black font-medium">
                  {loc(author.name, locale, content.langCode)}
                </span>
                {" \u2014 "}
                <span className="text-gray-600">
                  {loc(author.bio, locale, content.langCode)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Markdown content */}
      {markdown ? (
        <article className="prose prose-gray max-w-none">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </article>
      ) : (
        <p className="text-gray-500 italic">Content not available.</p>
      )}

      {/* PDF download */}
      {pdfAvailable && (
        <div className="mt-10 pt-6 border-t border-gray-200">
          <a
            href={`/api/source/${contentId}`}
            download
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
    </div>
  );
}
