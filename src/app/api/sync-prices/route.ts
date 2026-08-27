import { NextResponse } from "next/server";
import { syncAllPrices } from "@/lib/market-data";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  try {
    const imported = await syncAllPrices();
    return NextResponse.json({ imported });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kursimport fehlgeschlagen" },
      { status: 502 },
    );
  }
}
