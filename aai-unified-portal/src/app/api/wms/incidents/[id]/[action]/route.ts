import { NextRequest, NextResponse } from 'next/server';
import { wmsPostSupervisor, WmsApiError } from '@/lib/wmsClient';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;

  if (action !== 'acknowledge' && action !== 'resolve') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  try {
    const data = await wmsPostSupervisor(`/incidents/${id}/${action}`, {});
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof WmsApiError) {
      const status = err.upstreamStatus;
      if (status === 401) {
        return NextResponse.json({ error: 'WMS authentication failed' }, { status: 401 });
      }
      if (status === 403) {
        return NextResponse.json({ error: 'Permission denied — supervisor role required' }, { status: 403 });
      }
      if (status === 404) {
        return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
      }
      if (status === 400) {
        return NextResponse.json({ error: 'Invalid state — incident cannot be actioned in its current state' }, { status: 400 });
      }
      return NextResponse.json({ error: `WMS Backend error: ${status}` }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
