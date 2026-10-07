(() => {
  const root = document.querySelector('[data-registry-search]');
  if (!root) return;
  const form = root.querySelector('form');
  const input = form.elements.q;
  const kind = form.elements.kind;
  const status = root.querySelector('[role="status"]');
  const results = root.querySelector('.registry-search-results');
  const domain = root.dataset.domain;
  const endpoint = root.dataset.endpoint;
  const origins = {
    meaninggraph: 'https://meaninggraph.io',
    modelspec: 'https://modelspec.org',
    ovdb: 'https://directory.openvaultdb.com',
  };
  const kinds = {
    meaninggraph: ['meaning_entity', 'meaning_field'],
    modelspec: ['model', 'model_entity', 'model_collection', 'model_field'],
    ovdb: ['ovdb_server', 'ovdb_database', 'ovdb_collection'],
  };
  let timer;
  let controller;
  let request = 0;
  const requestDeadlineMs = 5000;

  function safeDestination(value) {
    try {
      const url = new URL(value);
      const allowed = url.origin === origins[domain] || (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && url.origin === location.origin);
      const route = domain === 'meaninggraph' ? /^\/graphs\/[^/]+\/concepts\/[^/]+\/$/.test(url.pathname)
        : domain === 'modelspec' ? /^\/registry\/models\/[^/]+\/$/.test(url.pathname)
          : /^\/(?:databases\/[^/]+\/|ovdb\/[^/]+\/.+\/|servers\/[0-9a-f]{64}\/)$/.test(url.pathname);
      return url.protocol === 'https:' && allowed && route && !url.username && !url.password && !url.search ? url.href : null;
    } catch { return null; }
  }

  function clear() { results.replaceChildren(); }
  function show(hits, found) {
    clear();
    for (const hit of hits) {
      if (!kinds[domain]?.includes(hit.kind)) continue;
      const href = safeDestination(hit.canonical_url);
      if (!href || typeof hit.title !== 'string') continue;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = hit.title;
      const detail = document.createElement('small');
      detail.textContent = [hit.kind.replaceAll('_', ' '), hit.qualified_name, hit.parent_label, hit.status].filter(Boolean).join(' · ');
      item.append(link, detail);
      results.append(item);
    }
    status.textContent = found === 0 ? 'No published entries match. Try another term or browse the registry.'
      : `${found} published result${found === 1 ? '' : 's'}.`;
    return results.children.length;
  }

  async function search() {
    const q = input.value.trim();
    const current = ++request;
    controller?.abort();
    clear();
    if (!q) { status.textContent = 'Type to search published entries.'; return; }
    const active = new AbortController();
    controller = active;
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; active.abort(); }, requestDeadlineMs);
    status.textContent = 'Searching…';
    try {
      const body = {q, domain, page: 1};
      if (kind.value) body.kind = kind.value;
      const response = await fetch(endpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
        headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal: active.signal,
      });
      if (!response.ok) throw new Error('gateway unavailable');
      const data = await response.json();
      if (current !== request) return;
      if (!Array.isArray(data.hits) || !Number.isInteger(data.found)) throw new Error('invalid response');
      if (show(data.hits, data.found) === 0 && data.found > 0) throw new Error('unsafe response');
    } catch (error) {
      if (current !== request) return;
      clear();
      status.textContent = timedOut ? 'Search timed out. Browse published entries below.'
        : 'Search is unavailable right now. Browse published entries below.';
    } finally {
      clearTimeout(deadline);
      if (controller === active) controller = undefined;
    }
  }

  function schedule() {
    clearTimeout(timer);
    ++request;
    controller?.abort();
    clear();
    status.textContent = input.value.trim() ? 'Searching…' : 'Type to search published entries.';
    timer = setTimeout(search, 220);
  }
  input.addEventListener('input', schedule);
  kind.addEventListener('change', schedule);
  form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); search(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      const first = results.querySelector('a');
      if (first) { event.preventDefault(); first.focus(); }
    }
  });
  results.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = [...results.querySelectorAll('a')];
    const index = links.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = links[index + (event.key === 'ArrowDown' ? 1 : -1)];
    (next ?? (event.key === 'ArrowUp' ? input : links[index])).focus();
  });
})();
