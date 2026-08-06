import { NextResponse } from "next/server";

/** Liveness: the process is up. No internals exposed. */
export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" });
}
