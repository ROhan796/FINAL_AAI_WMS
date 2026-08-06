import { NextRequest, NextResponse } from 'next/server';
import { wmsPost } from '@/lib/wmsClient';

export const dynamic = 'force-dynamic';

// Handles POST /api/wms/incidents/{id}/acknowledge and /api/wms/incidents/{id}/resolve
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params;

  if (action !== 'acknowledge' && action !== 'resolve') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  try {
    const data = await wmsPost(`/incidents/${id}/${action}`, {});
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
