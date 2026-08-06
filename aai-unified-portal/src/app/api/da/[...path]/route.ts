import { NextRequest, NextResponse } from 'next/server';

const DA_BASE = process.env.NEXT_PUBLIC_DA_ENGINE_URL ?? 'http://localhost:8001';

export const revalidate = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  try {
    const res = await fetch(`${DA_BASE}/api/${path.join('/')}`, {
      next: { revalidate: 30 },
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DA Engine unreachable';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
