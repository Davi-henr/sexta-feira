import { NextResponse } from "next/server";

export async function GET() {
  // Empty alerts placeholder avoiding 404 polling errors.
  return NextResponse.json({ alerts: [] });
}

export async function PATCH() {
  return NextResponse.json({ success: true });
}
