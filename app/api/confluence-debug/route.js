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
  // Extract text from HTML for debugging
  const bodyHtml = page.body?.view?.value || '';
  const bodyText = bodyHtml
    .replace(/<time[^>]*datetime="([^"]+)"[^>]*\/?>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();

  // If searchAncestor param, test CQL search
  const searchAncestor = searchParams.get('searchAncestor');
  let searchResult = null;
  if (searchAncestor) {
    const cql = `type="page" AND ancestor=${searchAncestor}`;
    const searchUrl = new URL(`${CONFLUENCE_BASE}/wiki/rest/api/content/search`);
    searchUrl.searchParams.set('cql', cql);
    searchUrl.searchParams.set('limit', '200');
    const sRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    const sData = await sRes.json();
    const allIds = (sData.results || []).map(r => r.content?.id || r.id);
    searchResult = {
      total: sData.totalSize || sData.size,
      includes_page: allIds.includes(pageId),
      first_10_ids: allIds.slice(0, 10),
    };
  }

  return Response.json({
    id: page.id,
    title: page.title,
    ancestors: (page.ancestors || []).map(a => ({ id: a.id, title: a.title })),
    body_text: bodyText.substring(0, 3000),
    searchResult,
  });
}
