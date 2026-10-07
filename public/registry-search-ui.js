(() => {
  // Both MeaningGraph search surfaces use this controller and the same result renderer.
  const roots = document.querySelectorAll('[data-registry-search]');
  const origins = {meaninggraph: 'https://meaninggraph.io', modelspec: 'https://modelspec.org', ovdb: 'https://directory.openvaultdb.com'};
  const kinds = {
    meaninggraph: {meaning_entity: 'Entity', meaning_field: 'Field'},
    modelspec: {model: 'Model', model_entity: 'Entity', model_collection: 'Collection', model_field: 'Field'},
    ovdb: {ovdb_server: 'Server', ovdb_database: 'Database', ovdb_collection: 'Collection'},
  };
  const icons = {
    entity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5M8 17h5"/></svg>',
    field: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 4v16M17 4v16M3 9h18M3 15h18"/></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4v16"/></svg>',
    core: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 2 2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6L12 2Z"/></svg>',
    public_registry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18"/></svg>',
  };
  function node(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  }
  function safeDestination(domain, value) {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
      const allowed = url.origin === origins[domain] || (local && url.origin === location.origin);
      const route = domain === 'meaninggraph' ? /^\/graphs\/[^/]+\/concepts\/[^/]+\/$/.test(url.pathname)
        : domain === 'modelspec' ? /^\/registry\/models\/[^/]+\/$/.test(url.pathname)
          : /^\/(?:databases\/[^/]+\/|ovdb\/[^/]+\/.+\/|servers\/[0-9a-f]{64}\/)$/.test(url.pathname);
      return url.protocol === 'https:' && allowed && route && !url.username && !url.password && !url.search ? url.href : null;
    } catch { return null; }
  }
  function icon(name, className) {
    const el = node('span', className);
    el.innerHTML = icons[name]; // Static local SVG templates; response data never enters innerHTML.
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  function briefDescription(value) {
    const description = value.trim();
    if (description.length <= 210) return description;
    const lastSpace = description.slice(0, 211).lastIndexOf(' ');
    const end = lastSpace >= 150 ? lastSpace : 210;
    return description.slice(0, end).replace(/[.,;:\s]+$/, '') + '…';
  }
  function resultCard(hit, domain) {
    const kind = kinds[domain]?.[hit.kind];
    const href = safeDestination(domain, hit.canonical_url);
    if (!kind || !href || typeof hit.title !== 'string' || !hit.title.trim()) return null;
    const item = node('li', 'registry-result');
    const link = node('a', 'registry-result-link');
    link.href = href;
    const isField = hit.kind.endsWith('_field');
    const top = node('span', 'registry-result-top');
    top.append(node('span', 'registry-result-kind', kind));
    if (hit.origin === 'core' || hit.origin === 'public_registry') {
      const label = hit.origin === 'core' ? 'Core' : 'Public registry';
      const badge = node('span', 'registry-result-origin registry-result-origin--' + hit.origin, label);
      badge.prepend(icon(hit.origin, 'registry-result-origin-icon'));
      top.append(badge);
    }
    const content = node('span', 'registry-result-content');
    content.append(top, node('strong', 'registry-result-title', hit.title));
    if (typeof hit.description === 'string' && hit.description.trim())
      content.append(node('span', 'registry-result-description', briefDescription(hit.description)));
    if (!isField && Array.isArray(hit.field_preview)) {
      const fieldNames = hit.field_preview.filter(name => typeof name === 'string' && name.trim()).slice(0, 4);
      if (fieldNames.length) {
        const preview = node('span', 'registry-result-fields');
        preview.append(node('span', 'registry-result-fields-label', 'Fields'));
        for (const name of fieldNames) preview.append(node('span', 'registry-result-field', name));
        if (Number.isInteger(hit.field_count) && hit.field_count > fieldNames.length)
          preview.append(node('span', 'registry-result-field-more', '+' + (hit.field_count - fieldNames.length)));
        content.append(preview);
      }
    }
    if (typeof hit.qualified_name === 'string' && hit.qualified_name)
      content.append(node('small', 'registry-result-path', hit.qualified_name));
    const iconType = isField ? 'field' : hit.kind.includes('entity') ? 'entity' : 'other';
    link.append(icon(iconType, 'registry-result-kind-icon registry-result-kind-icon--' + iconType), content, node('span', 'registry-result-arrow', '↗'));
    item.append(link);
    return item;
  }
  for (const root of roots) {
    const form = root.querySelector('form');
    const input = form?.querySelector('input[type="search"]');
    const kind = root.querySelector('select[name="kind"]');
    const panel = root.querySelector('.search-results');
    if (!form || !input || !kind || !panel) continue;
    const domain = root.dataset.domain;
    const endpoint = root.dataset.endpoint;
    const status = root.querySelector('[role="status"]') || node('p', 'registry-search-status');
    if (!status.parentElement) { status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); panel.after(status); }
    const label = node('p', 'results-label');
    const results = node('ul', 'registry-search-results');
    results.setAttribute('aria-label', 'Search results');
    panel.replaceChildren(label, results);
    let timer, controller, request = 0;
    function clear() { results.replaceChildren(); panel.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    function show(hits, found) {
      results.replaceChildren();
      for (const hit of hits) {
        const card = resultCard(hit, domain);
        if (card) results.append(card);
      }
      if (found > 0 && !results.children.length) throw new Error('unsafe response');
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      label.textContent = found === 0 ? 'No published entries match' : found + ' matching published ' + (found === 1 ? 'entry' : 'entries');
      status.textContent = found === 0 ? 'No published entries match. Try another term or browse the registry.'
        : found + ' published result' + (found === 1 ? '' : 's') + '.';
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
      const deadline = setTimeout(() => { timedOut = true; active.abort(); }, 5000);
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
        show(data.hits, data.found);
      } catch {
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
      if (input.value.trim()) timer = setTimeout(search, 220);
    }
    function dismiss() {
      clearTimeout(timer);
      ++request;
      controller?.abort();
      clear();
    }
    input.addEventListener('input', schedule);
    kind.addEventListener('change', schedule);
    form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); search(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') dismiss();
      if (event.key === 'ArrowDown') {
        const first = results.querySelector('a');
        if (first) { event.preventDefault(); first.focus(); }
      }
    });
    results.addEventListener('keydown', event => {
      if (event.key === 'Escape') { dismiss(); input.focus(); return; }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const links = [...results.querySelectorAll('a')];
      const index = links.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      (links[index + (event.key === 'ArrowDown' ? 1 : -1)] ?? (event.key === 'ArrowUp' ? input : links[index])).focus();
    });
    if (location.hash === '#registry-search') input.focus();
  }
})();
