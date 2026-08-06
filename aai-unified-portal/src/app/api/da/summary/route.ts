import { NextResponse } from 'next/server';

const DA_ENGINE_URL = process.env.DA_ENGINE_URL || process.env.NEXT_PUBLIC_DA_ENGINE_URL || 'http://localhost:8001';

export const revalidate = 30;

export async function GET() {
  try {
    const response = await fetch(`${DA_ENGINE_URL}/api/dashboard/summary`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      throw new Error(`DA Engine responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch from DA Engine:', error);
    return NextResponse.json(
      { error: 'DA Engine unavailable' },
      { status: 503 }
    );
  }
}
