import { NextResponse } from "next/server";
import { cleanupRateLimits } from "@/lib/rate-limit";
import { validateCronAuth } from "@/lib/validators";

export async function GET(request: Request) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await cleanupRateLimits();
    console.log(`[cron/cleanup] Deleted ${deleted} expired rate limit entries`);
    return NextResponse.json({ deleted, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[cron/cleanup] Error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
