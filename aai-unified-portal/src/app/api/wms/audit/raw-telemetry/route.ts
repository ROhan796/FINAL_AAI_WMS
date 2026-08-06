import { NextResponse } from 'next/server';
import { wmsGet } from '@/lib/wmsClient';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = searchParams.get('hours') || '24';
    const terminal = searchParams.get('terminal') || '';
    const limit = searchParams.get('limit') || '100';

    const params = new URLSearchParams({ hours, limit });
    if (terminal) params.set('terminal', terminal);

    const data = await wmsGet(`/audit/raw-telemetry?${params.toString()}`);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
