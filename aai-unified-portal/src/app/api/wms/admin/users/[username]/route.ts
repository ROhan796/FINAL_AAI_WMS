import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { wmsPut } from '@/lib/wmsClient';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const role = (user.publicMetadata as any)?.role;
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    const { username } = await params;
    const body = await request.json();
    const data = await wmsPut(`/admin/users/${username}/attributes`, body);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
