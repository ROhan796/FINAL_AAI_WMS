import { NextRequest, NextResponse } from 'next/server';

const DA_BASE = process.env.NEXT_PUBLIC_DA_ENGINE_URL ?? 'http://localhost:8001';

function buildTargetUrl(path: string[], search: string): string {
  const subPath = path.join('/');
  return `${DA_BASE}/api/${subPath}${search}`;
}

function buildHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const auth = req.headers.get('authorization');
  if (auth) headers['Authorization'] = auth;
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) headers['X-API-KEY'] = apiKey;
  return headers;
}

async function forwardRequest(
  req: NextRequest,
  path: string[],
  method: string,
): Promise<NextResponse> {
  const search = req.nextUrl.search || '';
  const url = buildTargetUrl(path, search);
  const headers = buildHeaders(req);

  const init: RequestInit = { method, headers };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const body = await req.text();
    if (body) init.body = body;
  }

  try {
    const res = await fetch(url, init);
    const contentType = res.headers.get('content-type') || 'application/json';
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DA Engine unreachable';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, (await params).path, 'GET');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, (await params).path, 'POST');
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, (await params).path, 'PUT');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, (await params).path, 'DELETE');
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, (await params).path, 'PATCH');
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-KEY',
      'Access-Control-Max-Age': '86400',
    },
  });
}
