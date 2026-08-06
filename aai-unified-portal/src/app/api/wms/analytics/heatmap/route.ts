import { NextResponse } from 'next/server';
import { wmsGet } from '@/lib/wmsClient';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const terminal = searchParams.get('terminal') || 'T1';
    const level = searchParams.get('level') || 'L1';
    const hours = searchParams.get('hours') || '24';

    const data = await wmsGet(`/analytics/heatmap?terminal=${terminal}&level=${level}&hours=${hours}`);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
