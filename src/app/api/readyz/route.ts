import { NextResponse } from "next/server";

import { createJsonApiClient } from "@/lib/api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const upstream = await createJsonApiClient().get<{
      status: string;
      service?: string;
      checks?: { database?: string };
      latencyMs?: number;
    }>("/readyz", { signal: AbortSignal.timeout(2_000) });

    if (upstream.status !== "ready" || upstream.checks?.database !== "ok") {
      throw new Error("API readiness probe did not report ready");
    }

    return NextResponse.json(
      {
        status: "ready",
        service: "senior-club-web",
        checks: { web: "ok", api: "ok", database: "ok" },
        upstreamLatencyMs: upstream.latencyMs,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        status: "not_ready",
        service: "senior-club-web",
        checks: { web: "ok", api: "unavailable", database: "unknown" },
      },
      { status: 503, headers },
    );
  }
}
