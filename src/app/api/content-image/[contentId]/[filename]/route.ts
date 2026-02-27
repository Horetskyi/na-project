import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string; filename: string }> },
) {
  const { contentId, filename } = await params;

  // Sanitise – only allow safe characters (prevent path traversal)
  if (!/^[a-z0-9-]+$/.test(contentId)) {
    return new NextResponse("Invalid content id", { status: 400 });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    return new NextResponse("Invalid filename", { status: 400 });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    return new NextResponse("Unsupported file type", { status: 400 });
  }

  const filePath = path.join(
    process.cwd(),
    "Data",
    "ContentsTexts",
    contentId,
    filename,
  );

  if (!fs.existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
