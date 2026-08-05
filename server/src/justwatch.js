import { getSetting, cacheRead, cacheWrite } from './db.js';

const DAY = 24 * 3600 * 1000;
const ENDPOINT = 'https://apis.justwatch.com/graphql';

// UNOFFICIAL JustWatch GraphQL. It's the only source that exposes per-offer
// resolution (SD/HD/4K), which answers "does a better-than-what-I-own version
// exist on the market?" (#2). No official API and no physical-Blu-ray data, so
// this is best-effort and can break if JustWatch changes their schema.

const QUERY = `query PowaFlex($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges { node {
      objectId objectType
      content(country: $country, language: $language) { title originalReleaseYear }
      offers(country: $country, platform: WEB) { presentationType monetizationType package { clearName } }
    } }
  }
}`;

const RANK = { SD: 1, HD: 2, _4K: 3 };
const LABEL = { SD: 'SD', HD: 'HD', _4K: '4K' };
// what the user owns, mapped to the same scale
const OWNED_RANK = { sd: 1, '480': 1, '576': 1, '720': 2, '1080': 2, '4k': 3 };

function country() { return (getSetting('jw_country') || 'ES').toUpperCase(); }
function language() { return (getSetting('language') || 'es-ES').slice(0, 2); }

async function search(title, year) {
  const body = {
    variables: { country: country(), language: language(), first: 5, filter: { searchQuery: title } },
    query: QUERY,
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 PowaFlex' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`JustWatch ${res.status}`);
  const data = await res.json();
  const nodes = (data?.data?.popularTitles?.edges || []).map((e) => e.node).filter((n) => n.objectType === 'MOVIE');
  if (!nodes.length) return null;
  // prefer an exact release-year match
  return (year && nodes.find((n) => n.content?.originalReleaseYear === year)) || nodes[0];
}

/**
 * Best available digital quality for a film + where. Returns
 * { maxQuality: '4K'|'HD'|'SD'|null, providers, offers } (cached 3 days).
 */
export async function availability(title, year) {
  if (!title) return { maxQuality: null, providers: [] };
  const cacheKey = `jw:${country()}:${title.toLowerCase()}:${year || ''}`;
  const hit = cacheRead(cacheKey, 3 * DAY);
  if (hit) return hit;
  const falloReciente = cacheRead(`${cacheKey}:err`, 15 * 60 * 1000);
  if (falloReciente) return falloReciente;

  let node;
  try {
    node = await search(title, year);
  } catch (err) {
    // Un timeout o un traspiés de JustWatch no es una respuesta: cachearlo tres
    // días marcaría la película como «sin oferta digital» sin saberlo. Pero
    // tampoco puede reintentarse a ciegas: la comprobación en bloque de Calidad
    // lanza cientos de consultas y, con JustWatch caído, repetía las mismas
    // cientos de llamadas fallidas en cada visita. Se cachea el FALLO aparte,
    // con vida corta: quince minutos de tregua y a la siguiente se reintenta.
    const fallo = { maxQuality: null, providers: [], offers: 0, error: String(err.message || err) };
    cacheWrite(`${cacheKey}:err`, fallo);
    return fallo;
  }

  const offers = node?.offers || [];
  let best = 0;
  const providers = new Set();
  for (const o of offers) {
    best = Math.max(best, RANK[o.presentationType] || 0);
    if (o.package?.clearName) providers.add(o.package.clearName);
  }
  const maxKey = Object.keys(RANK).find((k) => RANK[k] === best);
  const out = { maxQuality: best ? LABEL[maxKey] : null, providers: [...providers].slice(0, 8), offers: offers.length };
  cacheWrite(cacheKey, out);
  return out;
}

/** True if a strictly-better digital version than what's owned exists. */
export function isUpgradeable(ownedResolution, maxQuality) {
  if (!maxQuality) return false;
  const owned = OWNED_RANK[String(ownedResolution || '').toLowerCase()] || 0;
  return (RANK[`_${maxQuality}`] || RANK[maxQuality] || 0) > owned;
}
