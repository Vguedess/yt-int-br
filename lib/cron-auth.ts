export function authorizeCronRequest(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json(
      {
        ok: false,
        error: 'cron_secret_required',
        message: 'Set CRON_SECRET in Vercel before enabling recurring historical collection.'
      },
      { status: 503 }
    );
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  return null;
}
