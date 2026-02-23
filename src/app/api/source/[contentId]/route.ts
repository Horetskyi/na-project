import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const { contentId } = await params;

  // Sanitise – only allow safe characters
  if (!/^[a-z0-9-]+$/.test(contentId)) {
    return new NextResponse("Invalid content id", { status: 400 });
  }

  const filePath = path.join(
    process.cwd(),
    "Data",
    "ContentsTexts",
    contentId,
    "source.pdf",
  );

  if (!fs.existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="source.pdf"`,
    },
  });
}
