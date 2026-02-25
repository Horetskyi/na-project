"use client";

import { useTranslations } from "next-intl";

export default function DisclaimerBanner() {
  const t = useTranslations("Disclaimer");

  return (
    <div className="w-full bg-gray-100 border-b border-gray-200">
      <div className="container mx-auto px-4 max-w-6xl py-2">
        <p className="text-xs text-gray-600 leading-relaxed text-center">
          {t("line1")}
          <br />
          {t("line2")}
        </p>
      </div>
    </div>
  );
}
