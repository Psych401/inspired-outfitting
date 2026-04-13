import { NextRequest, NextResponse } from 'next/server';
import { getJobStore, statusForClient } from '@/lib/try-on/job-store';
import { failIfStale } from '@/lib/try-on/stale-job';
import { requireSessionUser } from '@/lib/auth/require-user';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireSessionUser();
  if (auth instanceof NextResponse) return auth;

  const { jobId } = await context.params;
  if (!jobId || jobId.length > 128) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const store = getJobStore();
  const job = await store.get(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  if (job.userId && job.userId !== auth.sub) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const resolved = await failIfStale(job);

  return NextResponse.json(await statusForClient(resolved), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
