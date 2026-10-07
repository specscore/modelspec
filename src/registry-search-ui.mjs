const KINDS = {
  meaninggraph: [['', 'All kinds'], ['meaning_entity', 'Entities'], ['meaning_field', 'Fields']],
  modelspec: [['', 'All kinds'], ['model', 'Models'], ['model_entity', 'Entities'], ['model_collection', 'Collections'], ['model_field', 'Fields']],
  ovdb: [['', 'All kinds'], ['ovdb_server', 'Servers'], ['ovdb_database', 'Databases'], ['ovdb_collection', 'Collections']],
};
// Set only after the gateway's Cloud target and public origin have been reviewed.
const APPROVED_PRODUCTION_GATEWAY_ORIGIN = null;

export function searchUiConfig(env, { production, fixture }) {
  const endpoint = env.REGISTRY_SEARCH_ENDPOINT?.trim() ?? '';
  const mode = env.REGISTRY_SEARCH_MODE?.trim() ?? '';
  if (!endpoint && !mode) return null;
  if (!endpoint || !mode) throw new Error('REGISTRY_SEARCH_ENDPOINT and REGISTRY_SEARCH_MODE must be set together');
  if (!['cloud', 'staging', 'fixture'].includes(mode)) throw new Error('REGISTRY_SEARCH_MODE must be cloud, staging or fixture');
  if (production && mode !== 'cloud') throw new Error('Production registry search requires REGISTRY_SEARCH_MODE=cloud');
  if (mode === 'fixture' && !fixture) throw new Error('Fixture registry search mode requires a fixture build');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('REGISTRY_SEARCH_ENDPOINT must be an absolute URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.pathname !== '/v1/registry-search' || url.search || url.hash || url.username || url.password ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback && !production))) {
    throw new Error('REGISTRY_SEARCH_ENDPOINT must be an HTTPS /v1/registry-search URL (loopback HTTP allowed for local builds) without credentials, query or fragment');
  }
  if (production && loopback) throw new Error('Production registry search cannot target loopback');
  if (production && url.origin !== APPROVED_PRODUCTION_GATEWAY_ORIGIN) throw new Error('Production registry search gateway origin has not been approved for Cloud launch');
  return { endpoint: url.href, mode };
}

export function renderSearchPanel(domain, config, browseUrl) {
  if (!config) return '';
  const options = KINDS[domain].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  return `<section class="registry-search" data-registry-search data-domain="${domain}" data-endpoint="${config.endpoint}" aria-labelledby="registry-search-heading">
    <h2 id="registry-search-heading">Search the public registry</h2>
    <form role="search" autocomplete="off"><label for="registry-search-query">Name or identifier</label>
      <div class="registry-search-controls"><input id="registry-search-query" name="q" type="search" minlength="1" maxlength="120" placeholder="Start typing to search" aria-controls="registry-search-results" aria-describedby="registry-search-status">
      <label for="registry-search-kind">Kind</label><select id="registry-search-kind" name="kind">${options}</select></div>
    </form>
    <p id="registry-search-status" role="status" aria-live="polite">Type to search published entries.</p>
    <ul id="registry-search-results" class="registry-search-results" aria-label="Search results"></ul>
    <p class="registry-search-fallback">You can always <a href="${browseUrl}">browse published entries</a>.</p>
  </section><link rel="stylesheet" href="/registry-search-ui.css"><script src="/registry-search-ui.js" defer></script>`;
}
