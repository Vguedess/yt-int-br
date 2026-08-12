import { providerConfig } from '@/lib/infrastructure';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'youtube-intelligence-br',
    version: '0.1.0',
    timezone: 'America/Sao_Paulo',
    providers: providerConfig,
    timestamp: new Date().toISOString()
  });
}
