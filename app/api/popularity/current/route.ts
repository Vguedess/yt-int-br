import { getCurrentPopularity } from '@/lib/youtube-popularity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await getCurrentPopularity();
  return Response.json(snapshot, {
    status: snapshot.ok ? 200 : 503,
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600'
    }
  });
}
