import { NextRequest, NextResponse } from 'next/server';
import { getJobStore, statusForClient } from '@/lib/try-on/job-store';
import { failIfStale } from '@/lib/try-on/stale-job';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  if (!jobId || jobId.length > 128) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const store = getJobStore();
  const job = await store.get(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const resolved = await failIfStale(job);

  return NextResponse.json(statusForClient(resolved), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
