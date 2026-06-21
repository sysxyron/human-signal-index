import { NextResponse } from "next/server";
import { getHsiRuntimeConfig } from "@/lib/hsi/edge-config";

export const runtime = "edge";

export async function GET() {
  const config = await getHsiRuntimeConfig();

  return NextResponse.json({
    ok: true,
    config,
  });
}