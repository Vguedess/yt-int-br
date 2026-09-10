import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  addComplexSearchRootTopic,
  deleteComplexSearchRootTopic,
  listComplexSearchRootTopics
} from '@/lib/complex-search-db';
import { buildComplexSearchGraph } from '@/lib/complex-search-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeEquals(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function authorize(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const configured = process.env.COMPLEX_SEARCH_SECRET ?? process.env.MANUAL_HYPE_SECRET ?? process.env.CRON_SECRET;
  if (!configured) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'complex_search_secret_required' }, { status: 503 })
    };
  }

  const auth = request.headers.get('authorization') ?? '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!supplied || !safeEquals(supplied, configured)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    };
  }

  return { ok: true };
}

export async function GET() {
  try {
    const topics = await listComplexSearchRootTopics();
    const graph = await buildComplexSearchGraph(topics);
    return NextResponse.json({ ok: true, topics, graph }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar ComplexSearch.'
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json() as { label?: unknown };
    const label = typeof body.label === 'string' ? body.label : '';
    const topic = await addComplexSearchRootTopic(label);
    return NextResponse.json({ ok: true, topic }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao adicionar tema.';
    const status = ['topic_too_short', 'topic_too_long', 'invalid_topic'].includes(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, {
      status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json() as { id?: unknown };
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ ok: false, error: 'topic_id_required' }, { status: 400 });
    }

    const deleted = await deleteComplexSearchRootTopic(id);
    return NextResponse.json({ ok: true, deleted }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao excluir tema.'
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
