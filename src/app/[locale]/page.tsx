import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import {
  getContents,
  getAuthors,
  getLanguages,
  getNaIssues,
  groupContentsByType,
  hasCountryFlag,
  getLanguageName,
  t as loc,
  type Author,
} from "@/lib/data";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tShared = await getTranslations("Shared");
  const tHome = await getTranslations("HomePage");

  const contents = getContents();
  const authors = getAuthors();
  const languages = getLanguages();
  const naIssues = getNaIssues();
  const grouped = groupContentsByType(contents);

  /** Map of content id → content for quick lookup. */
  const contentsMap = new Map(contents.map((c) => [c.id, c]));

  /** Resolve author(s) for a content item. */
  function resolveAuthors(
    authorId?: number,
    authorIds?: number[],
  ): Author[] {
    const ids = authorIds ?? (authorId != null ? [authorId] : []);
    return ids
      .map((id) => authors.find((a) => a.id === id))
      .filter((a): a is Author => a != null);
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-10">
        {tHome("heading")}
      </h1>


      {/* Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
        {Object.entries(grouped).map(([type, items]) => {
          const description = tShared(`ContentsTypesDescription.${type}`);
          const label = description.replace(/\.\s*$/, "");

          // Collect unique country codes that have flags
          const countryCodes = [
            ...new Set(items.map((c) => c.countryCode)),
          ].filter((code) => hasCountryFlag(code));

          // Year range
          const years = items
            .map((c) => c.year)
            .filter((y): y is number => y != null);
          const minYear = years.length > 0 ? Math.min(...years) : null;
          const maxYear = years.length > 0 ? Math.max(...years) : null;
          const yearRange =
            minYear != null && maxYear != null
              ? minYear === maxYear
                ? `${minYear}`
                : `${minYear}–${maxYear}`
              : null;

          return (
            <a
              key={type}
              href={`#section-${type}`}
              className="group block rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
            >
              {/* Type label */}
              <h3 className="text-sm font-semibold text-blue-700 group-hover:text-blue-900 uppercase tracking-wide leading-snug">
                {label}
              </h3>

              {/* Count */}
              <p className="mt-3 text-3xl font-bold text-gray-900">
                {items.length}
              </p>

              {/* Year range */}
              {yearRange && (
                <p className="mt-1 text-xs text-gray-500">{yearRange}</p>
              )}

              {/* Country flags */}
              {countryCodes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {countryCodes.map((code) => (
                    <Image
                      key={code}
                      src={`/flags/${code}.webp`}
                      alt={code}
                      width={24}
                      height={16}
                      className="rounded-sm"
                    />
                  ))}
                </div>
              )}
            </a>
          );
        })}
      </div>
      
      {/* NA Issues – numbered table of contents */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Деструктивні теорії та практики Нового Акрополю
        </h2>
        <ol className="list-decimal list-inside space-y-1">
          {naIssues.map((issue, idx) => {
            const title = loc(issue.title, locale, "uk");
            return (
              <li key={idx}>
                <a
                  href={`#na-issue-${idx}`}
                  className="text-blue-700 underline hover:text-blue-900"
                >
                  {title}
                </a>
              </li>
            );
          })}
        </ol>
      </section>

      {/* NA Issues – detail sections */}
      {naIssues.map((issue, idx) => {
        const title = loc(issue.title, locale, "uk");
        const description = issue.description
          ? loc(issue.description, locale, "uk")
          : null;

        return (
          <section
            key={idx}
            id={`na-issue-${idx}`}
            className="mb-14 scroll-mt-6"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {idx + 1}. {title}
            </h2>

            {description && (
              <p className="text-gray-700 mb-4">{description}</p>
            )}

            {issue.examples.length > 0 && (
              <ul className="space-y-4 list-disc list-outside ml-5">
                {issue.examples.map((ex, exIdx) => {
                  const exText = loc(ex.text, locale, "uk");
                  const exRef = ex.textReference
                    ? loc(ex.textReference, locale, "uk")
                    : null;
                  const sourceContent = ex.contentId
                    ? contentsMap.get(ex.contentId)
                    : undefined;
                  const sourceTitle = sourceContent
                    ? loc(sourceContent.title, locale, sourceContent.langCode)
                    : null;
                  const flagCode = sourceContent?.countryCode;
                  const flagExists = flagCode
                    ? hasCountryFlag(flagCode)
                    : false;

                  return (
                    <li key={exIdx} className="text-gray-800">
                      <p className="italic">&laquo;{exText}&raquo;</p>

                      {exRef && (
                        <p className="text-sm text-gray-500 mt-1">{exRef}</p>
                      )}

                      {(sourceTitle || flagExists) && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {flagExists && flagCode && (
                            <Image
                              src={`/flags/${flagCode}.webp`}
                              alt={flagCode}
                              width={24}
                              height={16}
                              className="inline-block rounded-sm"
                            />
                          )}
                          {sourceTitle && sourceContent && (
                            <Link
                              href={`/${locale}/content/${sourceContent.id}`}
                              className="text-sm text-blue-700 underline hover:text-blue-900"
                            >
                              Source: {sourceTitle}
                            </Link>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {Object.entries(grouped).map(([type, items]) => {
        const description = tShared(`ContentsTypesDescription.${type}`);
        const heading = description.replace(/\.\s*$/, "").toUpperCase();

        return (
          <section key={type} className="mb-14" id={`section-${type}`}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 scroll-mt-6">
              {heading}
            </h2>

            <div>
              {items.map((content, index) => {
                const title = loc(content.title, locale, content.langCode);
                const subTitle = loc(content.subTitle, locale, content.langCode);
                const city = loc(content.city, locale, content.langCode);
                const language = languages.find(
                  (l) => l.code === content.langCode,
                );
                const contentAuthors = resolveAuthors(
                  content.authorId,
                  content.authorIds,
                );
                const flagExists = hasCountryFlag(content.countryCode);
                const isGray = index % 2 === 1;

                return (
                  <div
                    key={content.id}
                    className={`-mx-4 px-4 ${isGray ? "bg-gray-100" : ""}`}
                  >
                    <div className="py-5 px-2">
                      {/* Number + Title */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-black shrink-0">
                          {index + 1}.
                        </span>
                        <Link
                          href={`/${locale}/content/${content.id}`}
                          className="text-lg font-bold text-black underline decoration-black decoration-1"
                        >
                          {title}
                        </Link>
                      </div>

                      {/* Subtitle */}
                      {subTitle && (
                        <p className="text-gray-600 mt-1">{subTitle}</p>
                      )}

                      {/* Flag + Year + Original Language on one line */}
                      {(flagExists || content.year || language) && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {flagExists && (
                            <Image
                              src={`/flags/${content.countryCode}.webp`}
                              alt={content.countryCode}
                              width={24}
                              height={16}
                              className="inline-block rounded-sm"
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
                        </div>
                      )}

                      {/* City */}
                      {city && (
                        <p className="text-gray-700 mt-1">{city}</p>
                      )}

                      {/* Author(s) */}
                      {contentAuthors.length > 0 && (
                        <div className="mt-2">
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
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

    </div>
  );
}
