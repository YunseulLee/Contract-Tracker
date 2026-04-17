import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;

let _supabase;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

const CONFLUENCE_BASE = process.env.CONFLUENCE_BASE_URL || 'https://krafton.atlassian.net';
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL;
const CONFLUENCE_TOKEN = process.env.CONFLUENCE_API_TOKEN;

// Studio category page IDs → studio name (2026 only)
const STUDIO_ANCESTORS = {
  '793187133': 'KRAFTON HQ',
  '793123395': 'Bluehole Studio',
  '793218974': 'inZOI Studio',
  '793123599': 'OmniCraft Labs',
  '952283440': 'OliveTree Games',
};

async function confluenceSearch(cql, limit = 50, start = 0, expandBody = false) {
  const auth = Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_TOKEN}`).toString('base64');
  const url = new URL(`${CONFLUENCE_BASE}/wiki/rest/api/content/search`);
  url.searchParams.set('cql', cql);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('start', String(start));
  if (expandBody) url.searchParams.set('expand', 'body.view');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Confluence search ${res.status}: ${await res.text()}`);
  return res.json();
}

async function confluenceGetPage(pageId, { withAncestors = false } = {}) {
  const auth = Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_TOKEN}`).toString('base64');
  const expand = withAncestors ? 'body.view,ancestors' : 'body.view';
  const res = await fetch(
    `${CONFLUENCE_BASE}/wiki/rest/api/content/${pageId}?expand=${expand}`,
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
    else if ((header.includes('자동갱신') || header.includes('자동 갱신') || header.includes('auto renew') || header.includes('자동 갱신 여부')) && fields.auto_renew === undefined) fields.auto_renew = value;
    else if ((header.includes('통보') || header.includes('notice') || header.includes('사전 통지')) && !fields.notice) fields.notice = value;
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
    { match: /^(?:\d+\.\s*)?(?:자동\s*갱신|자동\s*갱신\s*여부|auto\s*renew)$/i, field: 'auto_renew' },
    { match: /^(?:\d+\.\s*)?(?:통보(?:\s*기간)?|사전\s*통지|notice)$/i, field: 'notice' },
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
      if (!fields.auto_renew) { const m = line.match(/\d+\)\s*(?:자동\s*갱신(?:\s*여부)?|auto\s*renew)\s*[:：]\s*(.+)/i); if (m) fields.auto_renew = m[1].trim(); }
      if (!fields.notice) { const m = line.match(/\d+\)\s*(?:통보(?:\s*기간)?|사전\s*통지|notice)\s*[:：]\s*(.+)/i); if (m) fields.notice = m[1].trim(); }
    }
  }

  return fields;
}

function normalizeDate(raw) {
  // 2026.1.13 / 2026-1-13 / 2026/1/13 -> 2026-01-13
  const m = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) return raw.replace(/[./]/g, '-');
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parsePeriod(str) {
  if (!str) return { start_date: null, end_date: null };
  // 비패딩 포맷 (2026.1.13) 까지 허용: 연도 4자리 + 1~2자리 월/일
  const dateRe = /\d{4}[-./]\d{1,2}[-./]\d{1,2}/;
  const rangeRe = new RegExp(`(${dateRe.source})\\s*(?:[~～–—]|to)\\s*(${dateRe.source})`);
  const m = str.match(rangeRe);
  if (m) return { start_date: normalizeDate(m[1]), end_date: normalizeDate(m[2]) };
  const dates = [...str.matchAll(new RegExp(dateRe.source, 'g'))];
  if (dates.length >= 2) return { start_date: normalizeDate(dates[0][0]), end_date: normalizeDate(dates[1][0]) };
  if (dates.length === 1) return { start_date: normalizeDate(dates[0][0]), end_date: null };
  return { start_date: null, end_date: null };
}

function parseCost(str) {
  if (!str || str === '-') return { amount: 0, currency: 'USD' };

  if (/원/.test(str)) {
    const m = str.replace(/,/g, '').match(/([\d]+)/);
    return m ? { amount: parseInt(m[1], 10), currency: 'KRW' } : { amount: 0, currency: 'KRW' };
  }
  if (/EUR|€/.test(str)) {
    // 유럽식: 마침표를 천단위 구분자, 쉼표를 소수점으로 사용 (예: 1.234,56)
    const clean = str.replace(/\./g, '').replace(',', '.');
    const m = clean.match(/([\d.]+)/);
    return m ? { amount: parseFloat(m[1]), currency: 'EUR' } : { amount: 0, currency: 'EUR' };
  }
  // Default USD (쉼표=천단위)
  const clean = str.replace(/,/g, '');
  const m = clean.match(/\$?\s*([\d.]+)/);
  return m ? { amount: parseFloat(m[1]), currency: 'USD' } : { amount: 0, currency: 'USD' };
}

function parseAutoRenew(raw) {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s) return undefined;
  if (/(자동\s*갱신)/.test(s) && !/(없음|안함|아니|no|미)/.test(s)) return true;
  if (/^(y|yes|true|o|on|있음|있)$/.test(s) || /자동갱신됨|자동갱신\s*함/.test(s)) return true;
  if (/^(n|no|false|x|off|없음|없|미사용)$/.test(s) || /자동갱신\s*(안함|없음|아님)/.test(s)) return false;
  return undefined;
}

function parseNoticeDays(raw) {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw);
  const m = s.match(/(\d{1,4})/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function resolveStudioFromAncestors(ancestors) {
  if (!Array.isArray(ancestors)) return null;
  for (const a of ancestors) {
    const id = String(a?.id || '');
    if (STUDIO_ANCESTORS[id]) return STUDIO_ANCESTORS[id];
  }
  return null;
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response('Server misconfigured: CRON_SECRET not set', { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'incremental'; // full | incremental | ancestors
  const yearFilter = searchParams.get('year'); // '2026' | null
  const ancestorFilter = searchParams.get('ancestor'); // 특정 ancestor ID만 동기화
  const pageIdFilter = searchParams.get('pageId'); // 단건 동기화

  try {
    if (!CONFLUENCE_EMAIL || !CONFLUENCE_TOKEN) {
      throw new Error('CONFLUENCE_EMAIL 또는 CONFLUENCE_API_TOKEN 환경변수가 설정되지 않았습니다');
    }

    // 단건 동기화: pageId 지정 시 해당 페이지만 처리
    if (pageIdFilter) {
      const page = await confluenceGetPage(pageIdFilter, { withAncestors: true });
      if (!page) return Response.json({ error: 'Page not found' }, { status: 404 });

      const bodyParsed = parsePageBody(page.body?.view?.value || '');
      const period = parsePeriod(bodyParsed.period);
      const wikiUrl = `https://krafton.atlassian.net/wiki/spaces/ITPurchase/pages/${pageIdFilter}`;

      if (!period.end_date) {
        return Response.json({ message: '계약기간을 파싱할 수 없습니다', title: page.title, parsed: bodyParsed });
      }
      if (!period.end_date.startsWith('2026-')) {
        return Response.json({ message: '2026년 계약만 동기화합니다', title: page.title, end_date: period.end_date });
      }

      const studio = resolveStudioFromAncestors(page.ancestors) || 'KRAFTON HQ';
      const cost = parseCost(bodyParsed.cost);
      const autoRenew = parseAutoRenew(bodyParsed.auto_renew);
      const noticeDays = parseNoticeDays(bodyParsed.notice);

      const contract = {
        vendor: bodyParsed.vendor || page.title,
        name: bodyParsed.item || page.title,
        type: bodyParsed.type || '',
        start_date: period.start_date,
        end_date: period.end_date,
        annual_cost: cost.amount,
        currency: cost.currency,
        studio,
        owner_name: bodyParsed.owner || '',
        supplier: bodyParsed.supplier || bodyParsed.vendor || '',
        wiki_url: wikiUrl,
        status: 'active',
      };
      if (autoRenew !== undefined) contract.auto_renew = autoRenew;
      if (noticeDays !== undefined) contract.auto_renew_notice_days = noticeDays;

      const { data, error } = await getSupabase()
        .from('contracts')
        .upsert(contract, { onConflict: 'wiki_url' })
        .select('id')
        .maybeSingle();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ message: '단건 동기화 완료', id: data?.id, contract });
    }

    const contracts = [];
    const skippedPages = [];
    const seenUrls = new Set();

    async function searchAllPages(cql, expandBody = false) {
      let start = 0;
      let hasMore = true;
      const results = [];
      while (hasMore) {
        const data = await confluenceSearch(cql, 50, start, expandBody);
        const batch = data.results || [];
        results.push(...batch);
        start += batch.length;
        hasMore = batch.length > 0 && (!!data._links?.next || batch.length >= 50);
      }
      return results;
    }

    async function processResult(result, studio) {
      const pageId = result.content?.id || result.id;
      if (!pageId) return;
      const wikiUrl = `https://krafton.atlassian.net/wiki/spaces/ITPurchase/pages/${pageId}`;
      if (seenUrls.has(wikiUrl)) return;
      seenUrls.add(wikiUrl);

      let parsed = parseExcerpt(result.excerpt || '');
      let period = parsePeriod(parsed.period);

      // Fallback: excerpt에서 기간 파싱 실패 시 page body에서 재시도 (incremental만)
      if (!period.end_date && mode === 'incremental') {
        const bodyHtml = result.body?.view?.value || result.content?.body?.view?.value;
        const html = bodyHtml || (await confluenceGetPage(pageId))?.body?.view?.value;
        if (html) {
          const bodyParsed = parsePageBody(html);
          const bodyPeriod = parsePeriod(bodyParsed.period);
          if (bodyPeriod.end_date) {
            parsed = {
              ...parsed,
              period: bodyParsed.period || parsed.period,
              type: parsed.type || bodyParsed.type,
              owner: parsed.owner || bodyParsed.owner,
              vendor: parsed.vendor || bodyParsed.vendor,
              supplier: parsed.supplier || bodyParsed.supplier,
              item: parsed.item || bodyParsed.item,
              cost: parsed.cost || bodyParsed.cost,
              auto_renew: parsed.auto_renew || bodyParsed.auto_renew,
              notice: parsed.notice || bodyParsed.notice,
            };
            period = bodyPeriod;
          }
        }
      }

      if (!period.end_date) {
        skippedPages.push({ pageId, title: result.title, wiki_url: wikiUrl, reason: 'no end_date' });
        return;
      }
      // 2026년 계약만 동기화
      if (!period.end_date.startsWith('2026-')) {
        skippedPages.push({ pageId, title: result.title, wiki_url: wikiUrl, reason: `end_date not 2026 (${period.end_date})` });
        return;
      }

      const cost = parseCost(parsed.cost);
      const autoRenew = parseAutoRenew(parsed.auto_renew);
      const noticeDays = parseNoticeDays(parsed.notice);

      const contract = {
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
      };
      if (autoRenew !== undefined) contract.auto_renew = autoRenew;
      if (noticeDays !== undefined) contract.auto_renew_notice_days = noticeDays;
      contracts.push(contract);
    }

    // 병렬 처리 헬퍼 (동시 요청 수 제한)
    const CONCURRENCY = 10;
    async function processInParallel(items) {
      for (let i = 0; i < items.length; i += CONCURRENCY) {
        await Promise.all(items.slice(i, i + CONCURRENCY).map(({ result, studio }) => processResult(result, studio)));
      }
    }

    // year 필터링: 2026 ancestor만 (2025 제거됨)
    let targetAncestors = STUDIO_ANCESTORS;
    if (yearFilter && yearFilter !== '2026') {
      return Response.json({ message: '2026년만 동기화 대상입니다', yearFilter }, { status: 400 });
    }

    // 특정 ancestor ID 지정 시 해당 항목만 동기화
    if (ancestorFilter && STUDIO_ANCESTORS[ancestorFilter]) {
      targetAncestors = { [ancestorFilter]: STUDIO_ANCESTORS[ancestorFilter] };
    }

    // Search per ancestor with label
    // incremental: 최근 1일 수정분만 / ancestors: 전체 + body 포함 / full: 전체 + 키워드
    for (const [ancestorId, studio] of Object.entries(targetAncestors)) {
      let cql = `type="page" AND ancestor=${ancestorId} AND label="procurement_db"`;
      if (mode === 'incremental') cql += ` AND lastmodified >= now("-1d")`;
      const results = await searchAllPages(cql);
      await processInParallel(results.map(result => ({ result, studio })));
    }

    // Full sync: also search by title keywords across entire space (single queries, no ancestor loop)
    if (mode === 'full') {
      const titleKeywords = ['계약', 'Renewal', 'License', 'maintenance', '연간'];
      for (const keyword of titleKeywords) {
        const cql = `type="page" AND space="ITPurchase" AND title~"${keyword}"`;
        const results = await searchAllPages(cql);
        const items = results.map(result => {
          const ancestors = result.content?.ancestors || result.ancestors || [];
          const studio = resolveStudioFromAncestors(ancestors) || 'KRAFTON HQ';
          return { result, studio };
        });
        await processInParallel(items);
      }
    }

    // 기존 계약 조회 (update 필드 결정용: auto_renew 값이 비면 유지)
    const wikiUrls = contracts.map(c => c.wiki_url).filter(Boolean);
    const existingByUrl = {};
    if (wikiUrls.length > 0) {
      const { data: existing } = await getSupabase()
        .from('contracts')
        .select('id, wiki_url, auto_renew, auto_renew_notice_days')
        .in('wiki_url', wikiUrls);
      for (const c of (existing || [])) existingByUrl[c.wiki_url] = c;
    }

    // 배치 upsert (wiki_url 기준 충돌 해결)
    let upserted = 0, errors = 0;
    for (let i = 0; i < contracts.length; i += 50) {
      const batch = contracts.slice(i, i + 50).map(row => {
        const prev = existingByUrl[row.wiki_url];
        // 기존 값이 있고 이번 파싱에서 값이 없으면(undefined → row에 세팅 안됨) 기존 값 유지
        // upsert는 전달된 필드만 갱신되지만, 명시적 보존을 위해 기존 값으로 채워둔다
        if (prev) {
          if (row.auto_renew === undefined && prev.auto_renew !== undefined && prev.auto_renew !== null) {
            row.auto_renew = prev.auto_renew;
          }
          if (row.auto_renew_notice_days === undefined && prev.auto_renew_notice_days !== undefined && prev.auto_renew_notice_days !== null) {
            row.auto_renew_notice_days = prev.auto_renew_notice_days;
          }
        }
        return row;
      });
      const { error } = await getSupabase()
        .from('contracts')
        .upsert(batch, { onConflict: 'wiki_url' });
      if (error) {
        console.error('Upsert error:', error.message);
        // 개별 재시도로 문제 row 분리
        for (const row of batch) {
          const { error: e2 } = await getSupabase()
            .from('contracts')
            .upsert(row, { onConflict: 'wiki_url' });
          if (e2) { errors++; console.error(`Upsert fail [${row.vendor}]:`, e2.message); }
          else upserted++;
        }
      } else {
        upserted += batch.length;
      }
    }

    return Response.json({
      message: 'Confluence 동기화 완료 (2026 전용)',
      mode,
      total_found: contracts.length,
      upserted,
      errors,
      skipped_no_end_date: skippedPages.length,
      skipped_pages: skippedPages,
    });
  } catch (error) {
    console.error('Confluence sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
