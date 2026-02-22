import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import {
  getContents,
  getAuthors,
  getLanguages,
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
  const grouped = groupContentsByType(contents);

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

      {Object.entries(grouped).map(([type, items]) => {
        const description = tShared(`ContentsTypesDescription.${type}`);
        const heading = description.replace(/\.\s*$/, "").toUpperCase();

        return (
          <section key={type} className="mb-14">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {heading}
            </h2>

            <div className="space-y-5">
              {items.map((content) => {
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

                return (
                  <div
                    key={content.id}
                    className="bg-white rounded-lg p-6"
                  >
                    {/* Title as link */}
                    <Link
                      href={`/${locale}/content/${content.id}`}
                      className="text-lg font-bold text-black hover:underline"
                    >
                      {title}
                    </Link>

                    {/* Subtitle */}
                    {subTitle && (
                      <p className="text-gray-600 mt-1">{subTitle}</p>
                    )}

                    {/* Year */}
                    {content.year && (
                      <p className="text-gray-800 mt-2">{content.year}</p>
                    )}

                    {/* Country flag */}
                    {flagExists && (
                      <div className="mt-2">
                        <Image
                          src={`/flags/${content.countryCode}.webp`}
                          alt={content.countryCode}
                          width={24}
                          height={16}
                          className="inline-block rounded-sm"
                        />
                      </div>
                    )}

                    {/* Original language */}
                    {language && (
                      <p className="text-gray-700 mt-1">
                        {tShared("originalLanguage", {
                          language: getLanguageName(language, locale),
                        })}
                      </p>
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
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
