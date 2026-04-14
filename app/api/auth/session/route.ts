import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
/** Deprecated custom session endpoints. Supabase Auth is now the source of truth. */
function deprecated() {
  return NextResponse.json(
    {
      error: 'Deprecated endpoint. Use Supabase Auth from the client and Bearer tokens for API calls.',
      code: 'DEPRECATED_CUSTOM_SESSION',
    },
    { status: 410 }
  );
}

export async function GET() {
  return deprecated();
}

export async function POST(_request: NextRequest) {
  return deprecated();
}

export async function DELETE() {
  return deprecated();
}
