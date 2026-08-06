const DA_ENGINE_URL = process.env.DA_ENGINE_URL || process.env.NEXT_PUBLIC_DA_ENGINE_URL || 'http://localhost:8001';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(`${DA_ENGINE_URL}/api/sse/telemetry`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'DA Engine unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'DA Engine connection failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
