import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CONFLUENCE_BASE = process.env.CONFLUENCE_BASE_URL || 'https://krafton.atlassian.net';
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL;
const CONFLUENCE_TOKEN = process.env.CONFLUENCE_API_TOKEN;

// Studio category page IDs → studio name (2025 + 2026)
const STUDIO_ANCESTORS = {
  // 2025
  '91093896': 'KRAFTON HQ',
  '91082469': 'Bluehole Studio',
  '91096574': 'inZOI Studio',
  '91096667': 'OmniCraft Labs',
  // 2026
  '793187133': 'KRAFTON HQ',
  '793123395': 'Bluehole Studio',
  '793218974': 'inZOI Studio',
  '793123599': 'OmniCraft Labs',
  '952283440': 'OliveTree Games',
};

async function confluenceSearch(cql, limit = 50, start = 0) {
  const auth = Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_TOKEN}`).toString('base64');
  const url = new URL(`${CONFLUENCE_BASE}/wiki/rest/api/content/search`);
  url.searchParams.set('cql', cql);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('start', String(start));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Confluence search ${res.status}: ${await res.text()}`);
  return res.json();
}

async function confluenceGetPage(pageId) {
  const auth = Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_TOKEN}`).toString('base64');
  const res = await fetch(
    `${CONFLUENCE_BASE}/wiki/rest/api/content/${pageId}?expand=body.view`,
    { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
  );
  if (!res.ok) return null;
  return res.json();
}

function stripHtml(html) {
  return (html || '')
    // Replace <time datetime="...">text</time> with just the datetime value
    .replace(/<time[^>]*datetime="([^"]+)"[^>]*>[\s\S]*?<\/time>/gi, ' $1 ')
    .replace(/<time[^>]*datetime="([^"]+)"[^>]*\/?>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function parsePageBody(html) {
  if (!html) return {};
  const fields = {};
  const pairRegex = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = pairRegex.exec(html)) !== null) {
    const header = stripHtml(m[1]).toLowerCase();
    const value = stripHtml(m[2]);
    if (!value) continue;
    if (header.includes('구분') && !fields.type) fields.type = value;
    else if (header.includes('담당자') && !fields.owner) fields.owner = value;
    else if ((header.includes('vendor') || header.includes('벤더')) && !fields.vendor) fields.vendor = value;
    else if (header.includes('제조사') && !fields.vendor) fields.vendor = value;
    else if (header.includes('공급사') && !fields.supplier) fields.supplier = value;
    else if (header.includes('계약') && header.includes('품목') && !fields.item) fields.item = value;
    else if ((header.includes('기간') && (header.includes('계약') || header.includes('서비스') || header.includes('용역') || header.includes('이용') || header.includes('라이선스'))) && !fields.period) fields.period = value;
    else if (header.includes('비용') && !header.includes('결') && !fields.cost) fields.cost = value;
  }
  return fields;
}

function parseExcerpt(excerpt) {
  if (!excerpt) return {};
  const text = excerpt.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fields = {};

  const headerPatterns = [
    { match: /^(?:\d+\.\s*)?구분$/i, field: 'type' },
    { match: /^(?:\d+\.\s*)?담당자$/i, field: 'owner' },
    { match: /^(?:\d+\.\s*)?(?:vendor|벤더)$/i, field: 'vendor' },
    { match: /^(?:\d+\.\s*)?제조사$/i, field: 'vendor' },
    { match: /^(?:\d+\.\s*)?공급사$/i, field: 'supplier' },
    { match: /^(?:\d+\.\s*)?계약\s*품목$/i, field: 'item' },
    { match: /^(?:\d+\.\s*)?(?:계약|서비스|용역|이용|라이선스)\s*기간$/i, field: 'period' },
    { match: /^(?:\d+\.\s*)?(?:사용\s*)?비용$/i, field: 'cost' },
  ];
  const stopPatterns = [
    /^(?:\d+\.\s*)?결[재제]/i, /^(?:\d+\.\s*)?계약서/i,
    /^(?:\d+\.\s*)?(?:99\.?\s*)?[Rr]emark/i, /^(?:\d+\.\s*)?견적서/i,
  ];
  const allPatterns = [...headerPatterns.map(p => p.match), ...stopPatterns];

  for (let i = 0; i < lines.length; i++) {
    for (const { match, field } of headerPatterns) {
      if (match.test(lines[i]) && !fields[field]) {
        if (i + 1 < lines.length) {
          const next = lines[i + 1];
          if (!allPatterns.some(p => p.test(next))) fields[field] = next;
        }
        break;
      }
    }
  }

  // Fallback: inline format "3) 공급사 : value"
  if (Object.keys(fields).length < 3 || !fields.period) {
    for (const line of lines) {
      if (!fields.supplier) { const m = line.match(/\d+\)\s*공급사\s*[:：]\s*(.+)/); if (m) fields.supplier = m[1].trim(); }
      if (!fields.vendor) { const m = line.match(/\d+\)\s*(?:Vendor|제조사)\s*[:：]\s*(.+)/i); if (m) fields.vendor = m[1].trim(); }
      if (!fields.item) { const m = line.match(/\d+\)\s*(?:품목|계약\s*품목)\s*[:：]\s*(.+)/); if (m) fields.item = m[1].trim(); }
      if (!fields.cost) { const m = line.match(/\d+\)\s*비용\s*[:：]\s*(.+)/); if (m) fields.cost = m[1].trim(); }
      if (!fields.period) { const m = line.match(/\d+\)\s*계약기간\s*[:：]\s*(.+)/); if (m) fields.period = m[1].trim(); }
    }
  }

  return fields;
}

function parsePeriod(str) {
  if (!str) return { start_date: null, end_date: null };
  // Support ~, ～(fullwidth), –(en-dash), —(em-dash), to
  const m = str.match(/(\d{4}[-./]\d{2}[-./]\d{2})\s*(?:[~～–—]|to)\s*(\d{4}[-./]\d{2}[-./]\d{2})/);
  if (m) return { start_date: m[1].replace(/\./g, '-'), end_date: m[2].replace(/\./g, '-') };
  // Try matching two dates in sequence
  const dates = [...str.matchAll(/(\d{4}[-./]\d{2}[-./]\d{2})/g)];
  if (dates.length >= 2) return { start_date: dates[0][1].replace(/\./g, '-'), end_date: dates[1][1].replace(/\./g, '-') };
  if (dates.length === 1) return { start_date: dates[0][1].replace(/\./g, '-'), end_date: null };
  return { start_date: null, end_date: null };
}

function parseCost(str) {
  if (!str || str === '-') return { amount: 0, currency: 'USD' };
  const clean = str.replace(/,/g, '');

  if (/원/.test(clean)) {
    const m = clean.match(/([\d]+)/);
    return m ? { amount: parseInt(m[1], 10), currency: 'KRW' } : { amount: 0, currency: 'KRW' };
  }
  if (/EUR|€/.test(clean)) {
    const m = clean.match(/([\d.]+)/);
    return m ? { amount: parseFloat(m[1]), currency: 'EUR' } : { amount: 0, currency: 'EUR' };
  }
  // Default USD
  const m = clean.match(/\$?\s*([\d.]+)/);
  return m ? { amount: parseFloat(m[1]), currency: 'USD' } : { amount: 0, currency: 'USD' };
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'incremental'; // full | incremental

  try {
    if (!CONFLUENCE_EMAIL || !CONFLUENCE_TOKEN) {
      throw new Error('CONFLUENCE_EMAIL 또는 CONFLUENCE_API_TOKEN 환경변수가 설정되지 않았습니다');
    }

    const contracts = [];
    const skippedPages = [];
    const seenUrls = new Set();
    const needsBodyFetch = []; // pages where excerpt parsing failed

    // Phase 1: Search all pages and try excerpt parsing
    for (const [ancestorId, studio] of Object.entries(STUDIO_ANCESTORS)) {
      let cql = `type="page" AND ancestor=${ancestorId} AND (label="procurement_db" OR title~"계약" OR title~"Renewal" OR title~"License" OR title~"maintenance" OR title~"연간")`;
      if (mode === 'incremental') {
        cql += ` AND lastModified >= "now-1d"`;
      }

      let start = 0;
      let hasMore = true;

      while (hasMore) {
        const data = await confluenceSearch(cql, 50, start);
        const results = data.results || [];

        for (const result of results) {
          const pageId = result.content?.id || result.id;
          if (!pageId) continue;

          const wikiUrl = `https://krafton.atlassian.net/wiki/spaces/ITPurchase/pages/${pageId}`;
          if (seenUrls.has(wikiUrl)) continue;
          seenUrls.add(wikiUrl);

          const parsed = parseExcerpt(result.excerpt || '');
          const period = parsePeriod(parsed.period);

          if (period.end_date) {
            const cost = parseCost(parsed.cost);
            contracts.push({
              vendor: parsed.vendor || result.title,
              name: parsed.item || result.title,
              type: parsed.type || '',
              start_date: period.start_date,
              end_date: period.end_date,
              annual_cost: cost.amount,
              currency: cost.currency,
              studio,
              owner_name: parsed.owner || '',
              supplier: parsed.supplier || parsed.vendor || '',
              wiki_url: wikiUrl,
              status: 'active',
            });
          } else {
            needsBodyFetch.push({ pageId, title: result.title, wikiUrl, studio });
          }
        }

        start += results.length;
        hasMore = results.length > 0 && (!!data._links?.next || results.length >= 50);
      }
    }

    // Phase 2: Fetch full body for pages where excerpt parsing failed (parallel, batches of 10)
    for (let i = 0; i < needsBodyFetch.length; i += 10) {
      const batch = needsBodyFetch.slice(i, i + 10);
      const pages = await Promise.all(batch.map(b => confluenceGetPage(b.pageId)));

      for (let j = 0; j < batch.length; j++) {
        const { pageId, title, wikiUrl, studio } = batch[j];
        const page = pages[j];
        let parsed = {};

        if (page?.body?.view?.value) {
          parsed = parsePageBody(page.body.view.value);
        }

        const period = parsePeriod(parsed.period);
        if (!period.end_date) {
          skippedPages.push({ pageId, title, wiki_url: wikiUrl, reason: 'no end_date' });
          continue;
        }

        const cost = parseCost(parsed.cost);
        contracts.push({
          vendor: parsed.vendor || title,
          name: parsed.item || title,
          type: parsed.type || '',
          start_date: period.start_date,
          end_date: period.end_date,
          annual_cost: cost.amount,
          currency: cost.currency,
          studio,
          owner_name: parsed.owner || '',
          supplier: parsed.supplier || parsed.vendor || '',
          wiki_url: wikiUrl,
          status: 'active',
        });
      }
    }

    // Fetch existing contracts with wiki_urls for matching
    const { data: existingContracts } = await supabase
      .from('contracts')
      .select('id, wiki_url')
      .neq('wiki_url', '')
      .not('wiki_url', 'is', null);

    const wikiUrlMap = {};
    for (const c of (existingContracts || [])) {
      if (c.wiki_url) wikiUrlMap[c.wiki_url] = c.id;
    }

    const toInsert = [];
    const toUpdate = [];

    for (const contract of contracts) {
      const existingId = wikiUrlMap[contract.wiki_url];
      if (existingId) {
        toUpdate.push({ id: existingId, ...contract });
      } else {
        toInsert.push(contract);
      }
    }

    let created = 0, updated = 0, errors = 0;

    // Batch insert new contracts (50 at a time)
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from('contracts').insert(batch);
      if (error) {
        console.error('Insert error:', error.message);
        // Retry individually to find problematic rows
        for (const row of batch) {
          const { error: e2 } = await supabase.from('contracts').insert(row);
          if (e2) { errors++; console.error(`Insert fail [${row.vendor}]:`, e2.message); }
          else created++;
        }
      } else {
        created += batch.length;
      }
    }

    // Update existing contracts (only sync fields, preserve manual edits)
    for (const row of toUpdate) {
      const { id, ...data } = row;
      // Only update non-empty fields from Confluence
      const updateFields = {};
      if (data.vendor) updateFields.vendor = data.vendor;
      if (data.name) updateFields.name = data.name;
      if (data.type) updateFields.type = data.type;
      if (data.start_date) updateFields.start_date = data.start_date;
      if (data.end_date) updateFields.end_date = data.end_date;
      if (data.annual_cost > 0) updateFields.annual_cost = data.annual_cost;
      if (data.currency) updateFields.currency = data.currency;
      if (data.studio) updateFields.studio = data.studio;
      if (data.owner_name) updateFields.owner_name = data.owner_name;
      if (data.supplier) updateFields.supplier = data.supplier;

      if (Object.keys(updateFields).length > 0) {
        const { error } = await supabase.from('contracts').update(updateFields).eq('id', id);
        if (error) { errors++; console.error(`Update fail [${data.vendor}]:`, error.message); }
        else updated++;
      }
    }

    return Response.json({
      message: 'Confluence 동기화 완료',
      mode,
      total_found: contracts.length,
      created,
      updated,
      errors,
      skipped_no_end_date: skippedPages.length,
      skipped_pages: skippedPages,
    });
  } catch (error) {
    console.error('Confluence sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
