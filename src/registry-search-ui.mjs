const KINDS = {
  meaninggraph: [['', 'All kinds'], ['meaning_entity', 'Entities'], ['meaning_field', 'Fields']],
  modelspec: [['', 'All kinds'], ['model', 'Models'], ['model_entity', 'Entities'], ['model_collection', 'Collections'], ['model_field', 'Fields']],
  ovdb: [['', 'All kinds'], ['ovdb_server', 'Servers'], ['ovdb_database', 'Databases'], ['ovdb_collection', 'Collections']],
};
// Public VM pilot approved for these registry sites; Cloud remains a separate launch mode.
const PILOT_ENDPOINT = 'https://search.openvaultdb.com/v1/registry-search';
// Set only after the gateway's Cloud target and public origin have been reviewed.
const APPROVED_PRODUCTION_GATEWAY_ORIGIN = null;

export function searchUiConfig(env, { production, fixture }) {
  const configuredEndpoint = env.REGISTRY_SEARCH_ENDPOINT?.trim() ?? '';
  const configuredMode = env.REGISTRY_SEARCH_MODE?.trim() ?? '';
  const endpoint = production && !configuredEndpoint && !configuredMode ? PILOT_ENDPOINT : configuredEndpoint;
  const mode = production && !configuredEndpoint && !configuredMode ? 'vm-pilot' : configuredMode;
  if (!endpoint && !mode) return null;
  if (!endpoint || !mode) throw new Error('REGISTRY_SEARCH_ENDPOINT and REGISTRY_SEARCH_MODE must be set together');
  if (!['cloud', 'vm-pilot', 'staging', 'fixture'].includes(mode)) throw new Error('REGISTRY_SEARCH_MODE must be cloud, vm-pilot, staging or fixture');
  if (production && !['cloud', 'vm-pilot'].includes(mode)) throw new Error('Production registry search requires REGISTRY_SEARCH_MODE=cloud or vm-pilot');
  if (mode === 'fixture' && !fixture) throw new Error('Fixture registry search mode requires a fixture build');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('REGISTRY_SEARCH_ENDPOINT must be an absolute URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.pathname !== '/v1/registry-search' || url.search || url.hash || url.username || url.password ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback && !production))) {
    throw new Error('REGISTRY_SEARCH_ENDPOINT must be an HTTPS /v1/registry-search URL (loopback HTTP allowed for local builds) without credentials, query or fragment');
  }
  if (production && loopback) throw new Error('Production registry search cannot target loopback');
  if (mode === 'vm-pilot' && url.href !== PILOT_ENDPOINT) throw new Error('VM pilot registry search requires the reviewed public endpoint');
  if (production && mode === 'cloud' && url.origin !== APPROVED_PRODUCTION_GATEWAY_ORIGIN) throw new Error('Production registry search gateway origin has not been approved for Cloud launch');
  return { endpoint: url.href, mode };
}

export function renderSearchPanel(domain, config, browseUrl, {includeAssets = true} = {}) {
  if (!config) return '';
  const options = KINDS[domain].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  return `<section id="registry-search" class="registry-search" data-registry-search data-domain="${domain}" data-endpoint="${config.endpoint}" aria-labelledby="registry-search-heading">
    <div class="registry-search-heading"><p class="eyebrow">Find a published definition</p><h2 id="registry-search-heading">Search the public registry</h2></div>
    <div class="search-wrap"><form class="search-form" role="search" autocomplete="off"><svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input id="registry-search-query" name="q" type="search" minlength="1" maxlength="120" aria-label="Name or identifier" placeholder="Search an entity or field…" aria-controls="registry-search-results" aria-describedby="registry-search-status" aria-expanded="false">
      <button type="submit" aria-label="Search"><span aria-hidden="true">→</span></button></form>
    <div class="registry-search-filter"><label for="registry-search-kind">Kind</label><select id="registry-search-kind" name="kind">${options}</select></div>
    <div id="registry-search-results" class="search-results" hidden></div></div>
    <p id="registry-search-status" class="registry-search-status" role="status" aria-live="polite">Type to search published entries.</p>
    <p class="registry-search-fallback">You can always <a href="${browseUrl}">browse published entries</a>.</p>
  </section>${includeAssets ? '<link rel="stylesheet" href="/registry-search-ui.css"><script src="/registry-search-ui.js" defer></script>' : ''}`;
}
