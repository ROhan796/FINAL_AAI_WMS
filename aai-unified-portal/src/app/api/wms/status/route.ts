import { NextResponse } from 'next/server';
import { wmsGet } from '@/lib/wmsClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await wmsGet('/dashboard/status');
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
