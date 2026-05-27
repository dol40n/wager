import { NextResponse } from "next/server";
import { cleanupRateLimits } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const adminKey = request.headers.get("x-admin-api-key");
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
