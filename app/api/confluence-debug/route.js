const CONFLUENCE_BASE = process.env.CONFLUENCE_BASE_URL || 'https://krafton.atlassian.net';
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL;
const CONFLUENCE_TOKEN = process.env.CONFLUENCE_API_TOKEN;

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get('pageId');
  if (!pageId) return Response.json({ error: 'pageId required' }, { status: 400 });

  const auth = Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_TOKEN}`).toString('base64');

  // Get page with ancestors
  const res = await fetch(
    `${CONFLUENCE_BASE}/wiki/rest/api/content/${pageId}?expand=ancestors,body.view`,
    { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
  );
  if (!res.ok) return Response.json({ error: `Confluence ${res.status}` }, { status: res.status });

  const page = await res.json();
  return Response.json({
    id: page.id,
    title: page.title,
    ancestors: (page.ancestors || []).map(a => ({ id: a.id, title: a.title })),
  });
}
