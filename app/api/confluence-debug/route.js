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

  // If cql param, test raw CQL
  const rawCql = searchParams.get('cql');
  if (rawCql) {
    const searchUrl = new URL(`${CONFLUENCE_BASE}/wiki/rest/api/content/search`);
    searchUrl.searchParams.set('cql', rawCql);
    searchUrl.searchParams.set('limit', '5');
    const sRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    const sData = await sRes.json();
    return Response.json({
      cql: rawCql,
      size: sData.size,
      has_next: !!sData._links?.next,
      titles: (sData.results || []).map(r => r.title),
      error: sData.message || null,
    });
  }

  // If searchAncestor param, test CQL search
  const searchAncestor = searchParams.get('searchAncestor');
  let searchResult = null;
  if (searchAncestor) {
    const cql = `type="page" AND ancestor=${searchAncestor}`;
    // Single page to check response structure
    const searchUrl = new URL(`${CONFLUENCE_BASE}/wiki/rest/api/content/search`);
    searchUrl.searchParams.set('cql', cql);
    searchUrl.searchParams.set('limit', '5');
    const sRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    const sData = await sRes.json();
    searchResult = {
      totalSize: sData.totalSize,
      size: sData.size,
      start: sData.start,
      limit: sData.limit,
      has_links_next: !!sData._links?.next,
      response_keys: Object.keys(sData),
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
