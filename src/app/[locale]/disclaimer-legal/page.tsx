import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { getContentMarkdown } from "@/lib/data";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DisclaimerLegalPage({ params }: Props) {
  const { locale } = await params;

  // Try locale-specific markdown, fall back to English
  const markdown = getContentMarkdown("disclaimer", locale, "en");

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <Link
        href={`/${locale}`}
        className="text-blue-600 hover:underline text-sm mb-6 inline-block"
      >
        ← Back
      </Link>

      {markdown ? (
        <article className="prose prose-gray max-w-none">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </article>
      ) : (
        <p className="text-gray-500 italic">Content not available.</p>
      )}
    </div>
  );
}
