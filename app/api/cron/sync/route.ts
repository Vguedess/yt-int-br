import { providerConfig } from '@/lib/infrastructure';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (secret && authorization !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Foundation boundary: future collectors will run here or enqueue durable jobs.
  // The contract is intentionally idempotent: each collector will persist observations
  // with a provider-specific external key + observed_at bucket.
  return Response.json({
    ok: true,
    mode: 'foundation',
    message: 'Sync boundary operational; external collectors can now be added independently.',
    configuredProviders: providerConfig,
    ranAt: new Date().toISOString()
  });
}
