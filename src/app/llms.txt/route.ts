import { createLlmsText } from "@/lib/llms-text";

export const dynamic = "force-static";

export function GET() {
  return new Response(createLlmsText(), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
