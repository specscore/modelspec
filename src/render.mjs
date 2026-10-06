// Pure HTML rendering for the generated pages. Every value that comes from an
// index goes through esc() or safeUrl(); nothing is concatenated raw.

import { DEFAULTS } from './config.mjs';
import { databasesForModel, graphsForModel, sourcesForModel } from './match.mjs';

export const SOURCE_META = 'modelspec-build-source';
export const REGISTRY_PATH = '/registry/';
export const SOURCES_PATH = '/registry/sources/';
export const REGISTRY_REPOSITORY_URL = 'https://github.com/modelspec-org/registry';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** An https URL (http only on a loopback host, for local builds), escaped for an attribute. Anything else is a build error. */
export function safeUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Refusing to render a link to ${JSON.stringify(value)}: not an absolute URL`);
  }
  const ok = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname));
  if (!ok) throw new Error(`Refusing to render a link to ${JSON.stringify(value)}: only https links are allowed`);
  return esc(value);
}

/** An element id. Characters outside [A-Za-z0-9_.-] become _<hex> so the id stays valid and unique. */
export function anchorId(prefix, ...names) {
  const part = name => [...String(name)]
    .map(ch => (/[A-Za-z0-9_.-]/.test(ch) ? ch : `_${ch.codePointAt(0).toString(16)}`))
    .join('');
  return [prefix, ...names.map(part)].join('-');
}

const trimBase = url => url.replace(/\/+$/, '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');

export const modelPath = id => `${REGISTRY_PATH}models/${encodeURIComponent(id)}/`;
export const graphUrl = (base, id) => `${trimBase(base)}/graphs/${encodeURIComponent(id)}/`;
export const databaseUrl = (base, database) => {
  const path = typeof database === 'string'
    ? `/databases/${encodeURIComponent(database)}/`
    : database.directoryPath ?? `/databases/${encodeURIComponent(database.recordId ?? database.id)}/`;
  return `${trimBase(base)}${path}`;
};
export const commitUrl = model => `${model.repository}/commit/${model.commit}`;
export const fileUrl = (model, path) => `${model.repository}/blob/${model.commit}/${encodePath(path)}`;

/** `org/repo` for GitHub, `host/path` for anything else. */
export function repositoryLabel(repository) {
  const url = new URL(repository);
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  return url.hostname === 'github.com' ? path : `${url.hostname}/${path}`;
}

/** A homepage as people read it: no scheme, no trailing slash (`https://chinookdb.com/model/` is `chinookdb.com/model`). */
export function homepageLabel(url) {
  return url.replace(/^https:\/\//i, '').replace(/\/+$/, '');
}

function externalLink(url, label, className = '') {
  const cls = className ? ` class="${className}"` : '';
  return `<a${cls} href="${safeUrl(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
}

function excerpt(value, max) {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

// ------------------------------------------------------------ build source

const SOURCE_LABELS = {
  production: 'production',
  nonproduction: 'non-production',
  local: 'local',
  fixture: 'fixture',
};

const BANNER_STYLE = 'position:relative;z-index:60;margin:0;padding:.65rem 1rem;background:#b3261e;color:#fff;font:600 .9rem/1.4 system-ui,sans-serif;text-align:center;overflow-wrap:anywhere';

/** What the build says it was made from, as a meta tag (every generated page carries it). */
export function sourceMeta(ctx) {
  return `<meta name="${SOURCE_META}" content="${esc(ctx.mode)}">`;
}

/** A red banner at the top of every page of a build that is not made from the production indexes. */
export function renderBanner(ctx) {
  const sources = Object.values(ctx.sources).map(source => source.location).join(', ');
  const text = {
    fixture: '<strong>Fixture build.</strong> The models, graphs and databases on this site come from test fixtures, not from the live registries. Do not deploy it.',
    local: '<strong>Local build.</strong> The models, graphs and databases on this site come from local index files, not from the live registries. Do not deploy it.',
    nonproduction: `<strong>Non-production build.</strong> This site was built from indexes or base URLs other than the production ones (${esc(sources)}). Do not deploy it.`,
  }[ctx.mode];
  if (!text) return '';
  return `<div class="build-banner" role="alert" style="${BANNER_STYLE}">${text}</div>`;
}

function sourceNote(ctx, data) {
  const checksums = [
    ['ModelSpec registry', data.modelspec],
    ['MeaningGraph registry', data.meaninggraph],
    ['OVDB Directory', data.directory],
    ...(data.directory.sourcesChecksum === undefined ? [] : [['OVDB Directory source metadata', { checksum: data.directory.sourcesChecksum }]]),
  ].map(([label, index]) => `${esc(label)} <code>${esc(index.checksum)}</code>`).join(', ');
  const where = ctx.mode === 'production' ? 'Built at build time from the public ModelSpec registry, the MeaningGraph registry and the OVDB Directory index.' : `This is a ${esc(SOURCE_LABELS[ctx.mode])} build, not made from the production indexes.`;
  return `<p class="reg-source">${where} A change in any of them reaches this page by a rebuild. Index checksums: ${checksums}.</p>`;
}

// ------------------------------------------------------------ shell

/** Header, footer, grain and head links of the landing page, reused on generated pages. */
export function extractShell(template) {
  const pick = (regex, name) => {
    const match = regex.exec(template);
    if (!match) throw new Error(`public/index.html has no ${name} to reuse on generated pages`);
    return match[0];
  };
  const rootRelative = html => html
    .replace(/href="#top"/g, 'href="/"')
    .replace(/href="#/g, 'href="/#')
    .replace('<a href="/registry/">Registry</a>', '<a href="/registry/" aria-current="page">Registry</a>');
  const headLinks = [...template.matchAll(/^\s*<link (?:rel="preconnect"|href="https:\/\/fonts\.googleapis\.com)[^>]*>$/gm)].map(m => m[0].trimEnd());
  if (headLinks.length === 0) throw new Error('public/index.html has no font links to reuse on generated pages');
  const header = rootRelative(pick(/<header class="site-head">[\s\S]*?<\/header>/, 'site header'));
  const footer = rootRelative(pick(/<footer class="site-foot">[\s\S]*?<\/footer>/, 'site footer'));
  for (const [name, html] of [['header', header], ['footer', footer]]) {
    if (!html.includes('aria-current="page">Registry</a>')) throw new Error(`public/index.html has no Registry link in its ${name}`);
  }
  return { grain: pick(/<div class="grain"[^>]*><\/div>/, 'grain element'), header, footer, headLinks: headLinks.join('\n') };
}

function assertUniqueIds(html, where) {
  const seen = new Set();
  for (const match of html.matchAll(/\sid="([^"]*)"/g)) {
    if (seen.has(match[1])) throw new Error(`${where}: duplicate element id "${match[1]}" (two names render to the same anchor)`);
    seen.add(match[1]);
  }
}

function page({ where, title, description, path, ctx, shell, main }) {
  const canonical = ctx.production ? `\n  <link rel="canonical" href="https://modelspec.org${esc(path)}">` : '';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${sourceMeta(ctx)}${canonical}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
${shell.headLinks}
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/registry.css">
</head>
<body>
  ${renderBanner(ctx)}
  ${shell.grain}
  ${shell.header}
${main}
  ${shell.footer}
  <script src="/script.js" defer></script>
</body>
</html>
`;
  assertUniqueIds(html, where);
  return html;
}

// ------------------------------------------------------------ pieces

function crumbs(...items) {
  const parts = items.map(([label, href], i) => (i === items.length - 1
    ? `<span aria-current="page">${esc(label)}</span>`
    : `<a href="${esc(href)}">${esc(label)}</a>`));
  return `<nav class="reg-crumbs" aria-label="Breadcrumb">${parts.join('<span aria-hidden="true">›</span>')}</nav>`;
}

function statusPill(status) {
  return `<span class="reg-pill reg-pill--status">${esc(status)}</span>`;
}

/** The three-layers copy, ModelSpec first, shared with the OVDB Directory and MeaningGraph sites. */
function layersBlock(ctx, data) {
  return `<section class="reg-layers" id="layers" aria-labelledby="layers-heading">
      <h2 id="layers-heading">Where it is, what shape it has, what it means.</h2>
      <ul class="reg-layer-list">
        <li><strong>ModelSpec</strong>: the shape of the data (entities, fields, types and links), written once, whatever stores it.</li>
        <li><strong><a href="${safeUrl(trimBase(ctx.ovdbDirectoryBaseUrl) + '/')}">OVDB Directory</a></strong>: where the data is, who publishes it and how to reach it.</li>
        <li><strong><a href="${safeUrl(trimBase(ctx.meaningGraphBaseUrl) + '/')}">MeaningGraph</a></strong>: what the data means. Meanings are attached to ModelSpec fields, so one description serves every copy of the same model.</li>
      </ul>
      ${chinookNote(ctx, data)}
    </section>`;
}

/** The sentence "Chinook is in all three", linking the three Chinook pages. Checked against the data by assertChinookEverywhere. */
export function chinookNote(ctx, data) {
  const database = data?.directory?.databases.find(entry => (entry.recordId ?? entry.id) === 'chinook');
  const directoryLink = database ? databaseUrl(ctx.ovdbDirectoryBaseUrl, database) : databaseUrl(ctx.ovdbDirectoryBaseUrl, 'chinook');
  return `<p class="layers-note reg-chinook">Chinook is in all three: <a class="reg-chinook-directory" href="${safeUrl(directoryLink)}">listed in the OVDB Directory</a>, <a class="reg-chinook-model" href="${esc(modelPath('chinook'))}">modelled in ModelSpec</a>, <a class="reg-chinook-graph" href="${safeUrl(graphUrl(ctx.meaningGraphBaseUrl, 'chinook'))}">explained in MeaningGraph</a>.</p>`;
}

/**
 * The landing page and the registry pages say Chinook is in all three layers.
 * That must be true of the data the site is built from, or the build fails.
 */
export function assertChinookEverywhere(data) {
  const model = data.modelspec.models.find(m => m.id === 'chinook');
  const missing = [];
  if (!model) missing.push('model chinook in the ModelSpec registry');
  if (!data.meaninggraph.graphs.some(g => g.id === 'chinook')) missing.push('graph chinook in the MeaningGraph registry');
  if (!data.directory.databases.some(d => (d.recordId ?? d.id) === 'chinook')) missing.push('database chinook in the OVDB Directory');
  if (missing.length > 0) {
    throw new Error(`The landing page says Chinook is in all three layers, but the indexes have no ${missing.join(' and no ')}. Fix the data or the landing page; the build does not publish a false claim.`);
  }
  // They must also be the Chinook model's graph and database, or the model page would contradict the claim.
  const unmatched = [];
  if (!graphsForModel(model, data.meaninggraph.graphs).some(g => g.id === 'chinook')) unmatched.push('graph chinook does not bind the Chinook model');
  if (!databasesForModel(model, data.directory.databases).some(({ database }) => (database.recordId ?? database.id) === 'chinook')) unmatched.push('database chinook does not name the Chinook model');
  if (unmatched.length > 0) {
    throw new Error(`The landing page says Chinook is in all three layers, but ${unmatched.join(' and ')} (see "Meaning graphs for this model" and "Databases using this model"). Fix the data or the landing page.`);
  }
}

function modelCounts(model, data) {
  const graphs = graphsForModel(model, data.meaninggraph.graphs);
  const databases = databasesForModel(model, data.directory.databases);
  return { graphs, databases };
}

// ------------------------------------------------------------ /registry/

function renderModelCard(model, data) {
  const { graphs, databases } = modelCounts(model, data);
  const properties = model.entities.reduce((n, e) => n + e.properties.length, 0);
  const components = model.components.length > 0 ? `, ${plural(model.components.length, 'component')}` : '';
  return `<li class="reg-model">
          <div class="reg-model-head"><h3><a href="${esc(modelPath(model.id))}">${esc(model.title)}</a></h3>${statusPill(model.status)}</div>
          <p class="reg-model-desc">${esc(excerpt(model.description, 260))}</p>
          <dl class="reg-mini">
            <div><dt>Address</dt><dd><code>${esc(model.address)}</code></dd></div>
            <div><dt>Repository</dt><dd>${externalLink(`${model.repository}/tree/${model.commit}`, `${repositoryLabel(model.repository)}@${model.commit.slice(0, 7)}`)}</dd></div>
            <div><dt>Shape</dt><dd>${plural(model.entities.length, 'entity', 'entities')}, ${plural(properties, 'property', 'properties')}${components}</dd></div>
            <div><dt>Used by</dt><dd>${plural(graphs.length, 'meaning graph')}, ${plural(databases.length, 'database')}</dd></div>
          </dl>
        </li>`;
}

export function renderRegistryPage(data, ctx, shell) {
  const models = data.modelspec.models;
  const cards = models.map(model => renderModelCard(model, data)).join('\n        ');
  const main = `  <main id="top" class="reg">
    ${crumbs(['ModelSpec', '/'], ['Registry', REGISTRY_PATH])}
    <header class="reg-hero">
      <p class="section-label">Registry — new, draft</p>
      <h1>The ModelSpec registry</h1>
      <p class="reg-lede">Published ModelSpec models. Each has one address, a pinned commit in its repository and the entities it defines, so a project can start from it and others can tell they share it.</p>
    </header>
    <p class="reg-draft" role="note"><strong>Draft.</strong> The registry is new: the models listed here and the format of the index they are built from may still change. To register a model, open a pull request on ${externalLink(REGISTRY_REPOSITORY_URL, 'github.com/modelspec-org/registry')}, which explains how.</p>
    <section class="reg-section" id="models" aria-labelledby="models-heading">
      <h2 id="models-heading">Models <span class="reg-count">${models.length}</span></h2>
      <ul class="reg-model-list">
        ${cards}
      </ul>
    </section>
    <p><a href="${SOURCES_PATH}">Source discoveries (${data.directory.sources.length})</a> from the OVDB Directory</p>
    ${layersBlock(ctx, data)}
    ${sourceNote(ctx, data)}
  </main>`;
  return page({
    where: 'registry index',
    title: 'Registry — ModelSpec',
    description: 'The ModelSpec registry: published models, their entities and properties, the MeaningGraph graphs that bind their meanings and the OVDB Directory databases that use them. New, draft.',
    path: REGISTRY_PATH,
    ctx,
    shell,
    main,
  });
}

// ------------------------------------------------------------ /registry/sources/

export function renderSourcesPage(data, ctx, shell) {
  const sources = [...data.directory.sources].sort((a, b) => a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id, 'en'));
  const models = new Map(data.modelspec.models.map(model => [model.id, model]));
  const cards = sources.map(source => {
    const model = models.get(source.modelId);
    if (source.modelId !== undefined && !model) throw new Error(`Directory source ${source.id} references unknown ModelSpec model ${source.modelId}`);
    const href = `${trimBase(ctx.ovdbDirectoryBaseUrl)}/sources/${encodeURIComponent(source.id)}/`;
    const access = source.access_mode === 'bigquery-native' ? 'BigQuery native access · queries blocked' : 'Proposed access: HTTP through OVDB';
    const search = [source.title, source.id, source.publisher, source.access_mode].join(' ').toLowerCase();
    return `<li class="reg-row reg-source-card" data-source-id="${esc(source.id)}" data-search="${esc(search)}" data-access="${esc(source.access_mode)}">
      <div class="reg-row-head"><h2>${esc(source.title)}</h2>${statusPill('Inactive')}</div>
      <p class="reg-row-desc">${esc(source.description)}</p>
      <dl class="reg-mini"><div><dt>Source ID</dt><dd><code>${esc(source.id)}</code></dd></div>
        <div><dt>Publisher</dt><dd>${esc(source.publisher)}</dd></div>
        <div><dt>Access</dt><dd>${esc(access)}</dd></div>
        <div><dt>ModelSpec</dt><dd>${model ? `Declared model link: <a class="reg-source-model" href="${esc(modelPath(model.id))}">${esc(model.title)}</a> ${statusPill(model.status)}` : 'No ModelSpec link declared'}</dd></div></dl>
      <p><a class="reg-source-action" href="${safeUrl(href)}">View source in OVDB Directory</a></p>
    </li>`;
  }).join('\n');
  // Source navigation marks Sources current while preserving Registry on model pages.
  const sourceShell = { ...shell, header: shell.header.replace(' aria-current="page">Registry', '>Registry').replace('href="/registry/sources/">', 'href="/registry/sources/" aria-current="page">'), footer: shell.footer.replace(' aria-current="page">Registry', '>Registry').replace('href="/registry/sources/">', 'href="/registry/sources/" aria-current="page">') };
  return page({ where: 'source discoveries', title: 'Source discoveries — ModelSpec', description: 'Browse inactive source discovery metadata from the OVDB Directory, proposed access and explicit ModelSpec links.', path: SOURCES_PATH, ctx, shell: sourceShell,
    main: `  <main id="top" class="reg">
      ${crumbs(['ModelSpec', '/'], ['Registry', REGISTRY_PATH], ['Source discoveries', SOURCES_PATH])}
      <header class="reg-hero"><p class="section-label">OVDB Directory discovery metadata</p><h1>Source discoveries</h1>
      <p class="reg-lede">Source discoveries from the OVDB Directory. These entries are inactive; their access routes and native bindings require acceptance before queries can run.</p></header>
      <p class="reg-draft" role="note">A metadata link does not establish accepted native-field bindings or activate source access.</p>
      ${sources.length ? `<form class="reg-source-controls" data-source-controls hidden role="search">
        <div><label for="source-search">Search sources</label><input id="source-search" type="search" placeholder="Title, ID, publisher or access mode" autocomplete="off"></div>
        <div><label for="source-access">Proposed access</label><select id="source-access"><option value="">All access modes</option><option value="live-http-via-ovdb">HTTP through OVDB</option><option value="bigquery-native">BigQuery native</option></select></div>
        <button type="reset">Reset</button></form>
        <p id="source-result-count" role="status" aria-live="polite">${sources.length} source discoveries</p>
        <p id="source-empty" class="reg-none" hidden>No sources match. Clear the search or reset the filters.</p>
        <ul class="reg-rows" id="source-list">${cards}</ul>` : '<p class="reg-none">No source discoveries in this index.</p>'}
      ${sourceNote(ctx, data)}
    </main>` });
}

// ------------------------------------------------------------ /registry/models/<id>/

/** The type cell of a property or field: a scalar, a reference to an entity, or an embedded component. */
function typeCell(prop, localEntities, localComponents) {
  const arrow = '<span class="reg-arrow" aria-label="to">→</span>';
  if (prop.references) {
    const target = localEntities.has(prop.references) ? `<a href="#${esc(anchorId('entity', prop.references))}">${esc(prop.references)}</a>` : esc(prop.references);
    return `${esc(prop.type)} ${arrow} ${target}`;
  }
  if (prop.component) {
    const target = localComponents.has(prop.component) ? `<a href="#${esc(anchorId('component', prop.component))}">${esc(prop.component)}</a>` : esc(prop.component);
    return `${esc(prop.type)} ${arrow} ${target}`;
  }
  return esc(prop.type);
}

function renderProperty(entity, prop, localEntities, localComponents) {
  const id = anchorId('property', entity.name, prop.name);
  return `<tr id="${esc(id)}">
              <th scope="row" data-label="Property"><a class="reg-prop-name" href="#${esc(id)}"><code>${esc(prop.name)}</code></a></th>
              <td data-label="Type">${typeCell(prop, localEntities, localComponents)}</td>
              <td data-label="Required">${prop.required ? 'yes' : 'no'}</td>
              <td data-label="Key">${prop.key ? '<span class="reg-pill reg-pill--key">key</span>' : 'no'}</td>
            </tr>`;
}

function renderEntity(entity, localEntities, localComponents) {
  const id = anchorId('entity', entity.name);
  const rows = entity.properties.map(prop => renderProperty(entity, prop, localEntities, localComponents)).join('\n            ');
  const key = entity.key.length > 0 ? `<p class="reg-entity-key">Key: ${entity.key.map(k => `<code>${esc(k)}</code>`).join(', ')}</p>` : '';
  const use = entity.use.length > 0
    ? `<p class="reg-entity-use">Uses components: ${entity.use.map(u => (localComponents.has(u) ? `<a href="#${esc(anchorId('component', u))}"><code>${esc(u)}</code></a>` : `<code>${esc(u)}</code>`)).join(', ')}</p>`
    : '';
  const table = entity.properties.length === 0
    ? '<p class="reg-none">No properties.</p>'
    : `<table class="reg-props">
          <caption class="reg-sr">Properties of ${esc(entity.name)}</caption>
          <thead><tr><th scope="col">Property</th><th scope="col">Type</th><th scope="col">Required</th><th scope="col">Key</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>`;
  return `<section class="reg-entity" id="${esc(id)}" aria-labelledby="heading-${esc(id)}">
        <h3 id="heading-${esc(id)}"><a href="#${esc(id)}">${esc(entity.name)}</a> <span class="reg-count">${entity.properties.length}</span></h3>
        ${key}
        ${use}
        ${table}
      </section>`;
}

function renderComponent(component, localEntities, localComponents) {
  const id = anchorId('component', component.name);
  const rows = component.fields.map(field => {
    const fieldId = anchorId('field', component.name, field.name);
    return `<tr id="${esc(fieldId)}">
              <th scope="row" data-label="Field"><a class="reg-prop-name" href="#${esc(fieldId)}"><code>${esc(field.name)}</code></a></th>
              <td data-label="Type">${typeCell(field, localEntities, localComponents)}</td>
              <td data-label="Required">${field.required ? 'yes' : 'no'}</td>
            </tr>`;
  }).join('\n            ');
  const table = component.fields.length === 0
    ? '<p class="reg-none">No fields.</p>'
    : `<table class="reg-props reg-fields">
          <caption class="reg-sr">Fields of ${esc(component.name)}</caption>
          <thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Required</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>`;
  return `<section class="reg-entity reg-component" id="${esc(id)}" aria-labelledby="heading-${esc(id)}">
        <h3 id="heading-${esc(id)}"><a href="#${esc(id)}">${esc(component.name)}</a> <span class="reg-count">${component.fields.length}</span></h3>
        ${table}
      </section>`;
}

function renderGraphRow(graph, ctx) {
  const pills = [graph.kind, graph.status].filter(Boolean).map(v => `<span class="reg-pill">${esc(v)}</span>`).join('');
  const desc = graph.description ? `<p class="reg-row-desc">${esc(excerpt(graph.description, 220))}</p>` : '';
  return `<li class="reg-row" data-graph="${esc(graph.id)}">
          <div class="reg-row-head"><a class="reg-graph-link" href="${safeUrl(graphUrl(ctx.meaningGraphBaseUrl, graph.id))}">${esc(graph.title)}</a><code class="reg-id">${esc(graph.id)}</code>${pills}</div>
          ${desc}
        </li>`;
}

function renderDatabaseRow({ database, via }, ctx) {
  const how = via === 'address' ? 'model address' : 'repository and model file';
  return `<li class="reg-row" data-database="${esc(database.recordId ?? database.id)}">
          <div class="reg-row-head"><a class="reg-database-link" href="${safeUrl(databaseUrl(ctx.ovdbDirectoryBaseUrl, database))}">${esc(database.title)}</a><code class="reg-id">${esc(database.recordId ?? database.id)}</code>${statusPill(database.status)}</div>
          <dl class="reg-mini">
            <div><dt>Canonical URL</dt><dd><code class="reg-canonical">${esc(database.url)}</code></dd></div>
            <div><dt>Publisher</dt><dd>${externalLink(database.repository, repositoryLabel(database.repository), 'reg-publisher')}</dd></div>
            <div><dt>Found by</dt><dd>${esc(how)}</dd></div>
          </dl>
        </li>`;
}

export function renderModelPage(model, data, ctx, shell) {
  const { graphs, databases } = modelCounts(model, data);
  const sources = sourcesForModel(model, data.directory.sources);
  const localEntities = new Set(model.entities.map(e => e.name));
  const localComponents = new Set(model.components.map(c => c.name));
  const propertyCount = model.entities.reduce((n, e) => n + e.properties.length, 0);
  const files = [['source', model.files.source], ['JSON', model.files.json]]
    .filter(([, path]) => path)
    .map(([kind, path]) => `<li>${externalLink(fileUrl(model, path), path, 'reg-file')} <span class="reg-file-kind">${esc(kind)}</span></li>`)
    .join('');
  const maintainers = model.maintainers.length === 0 ? '' : `<div><dt>Maintainers</dt><dd>${model.maintainers.map(h => externalLink(`https://github.com/${h}`, h)).join(', ')}</dd></div>`;
  const website = model.homepage === undefined ? '' : `\n        <div><dt>Website</dt><dd>${externalLink(model.homepage, homepageLabel(model.homepage), 'reg-homepage')}</dd></div>`;
  const versions = [model.moduleVersion && `module ${model.moduleVersion}`, model.modelspecVersion && `ModelSpec ${model.modelspecVersion}`].filter(Boolean);
  const entityIndex = model.entities.map(e => `<li><a href="#${esc(anchorId('entity', e.name))}">${esc(e.name)}</a></li>`).join('');
  const entities = model.entities.map(e => renderEntity(e, localEntities, localComponents)).join('\n      ');
  const fieldCount = model.components.reduce((n, c) => n + c.fields.length, 0);
  const componentsSection = model.components.length === 0 ? '' : `<section class="reg-section" id="components" aria-labelledby="components-heading">
      <h2 id="components-heading">Components <span class="reg-count">${model.components.length}</span></h2>
      <p class="reg-section-note">${plural(model.components.length, 'component')} and ${plural(fieldCount, 'field')}: reusable groups of fields that entities embed with <code>use</code>.</p>
      <ul class="reg-entity-index" aria-label="Components">${model.components.map(c => `<li><a href="#${esc(anchorId('component', c.name))}">${esc(c.name)}</a></li>`).join('')}</ul>
      ${model.components.map(c => renderComponent(c, localEntities, localComponents)).join('\n      ')}
    </section>
    `;
  const graphRows = graphs.length === 0
    ? '<p class="reg-none">No graph in the MeaningGraph registry binds meanings to this model yet.</p>'
    : `<ul class="reg-rows">
        ${graphs.map(g => renderGraphRow(g, ctx)).join('\n        ')}
      </ul>`;
  const databaseRows = databases.length === 0
    ? '<p class="reg-none">No database in the OVDB Directory names this model yet.</p>'
    : `<ul class="reg-rows">
        ${databases.map(d => renderDatabaseRow(d, ctx)).join('\n        ')}
      </ul>`;

  const sourceRows = sources.length === 0
    ? '<p class="reg-none">No inactive source discovery in the OVDB Directory explicitly links to this model yet.</p>'
    : `<ul class="reg-rows">${sources.map(source => `<li class="reg-row" data-source="${esc(source.id)}">
        <div class="reg-row-head"><a class="reg-source-link" href="${safeUrl(`${trimBase(ctx.ovdbDirectoryBaseUrl)}/sources/${encodeURIComponent(source.id)}/`)}">${esc(source.title)}</a><span class="reg-pill">Inactive</span></div>
        <p class="reg-row-desc">${esc(excerpt(source.description, 220))}</p>
        <dl class="reg-mini"><div><dt>Publisher</dt><dd>${esc(source.publisher)}</dd></div><div><dt>Related by</dt><dd>Explicit ModelSpec metadata link</dd></div></dl>
      </li>`).join('')}</ul>`;
  const main = `  <main id="top" class="reg">
    ${crumbs(['ModelSpec', '/'], ['Registry', REGISTRY_PATH], [model.title, modelPath(model.id)])}
    <header class="reg-hero">
      <p class="section-label">Registered model</p>
      <h1>${esc(model.title)} ${statusPill(model.status)}</h1>
      <p class="reg-lede">${esc(model.description)}</p>
      <ul class="reg-jump" aria-label="On this page">
        <li><a href="#entities">Entities</a></li>${model.components.length > 0 ? '\n        <li><a href="#components">Components</a></li>' : ''}
        <li><a href="#meaning-graphs">Meaning graphs</a></li>
        <li><a href="#databases">Databases</a></li>
        <li><a href="#source-discoveries">Source discoveries</a></li>
      </ul>
    </header>
    <p class="reg-layers-line"><strong>Where it is, what shape it has, what it means.</strong> This page is the shape: the <a href="${safeUrl(trimBase(ctx.ovdbDirectoryBaseUrl) + '/')}">OVDB Directory</a> says where databases of this model are, <a href="${safeUrl(trimBase(ctx.meaningGraphBaseUrl) + '/')}">MeaningGraph</a> says what its fields mean.</p>
    <section class="reg-section" id="about" aria-labelledby="about-heading">
      <h2 id="about-heading">About this model</h2>
      <dl class="reg-facts">
        <div><dt>Status</dt><dd>${esc(model.status)} <span class="reg-hint">(the registry is a draft)</span></dd></div>
        <div><dt>Address</dt><dd><code class="reg-address">${esc(model.address)}</code></dd></div>
        <div><dt>Repository</dt><dd>${externalLink(model.repository, repositoryLabel(model.repository), 'reg-repo')}</dd></div>${website}
        <div><dt>Pinned commit</dt><dd>${externalLink(commitUrl(model), model.commit, 'reg-commit')}</dd></div>
        <div><dt>Model files</dt><dd><ul class="reg-files">${files}</ul></dd></div>
        <div><dt>Licence</dt><dd>${esc(model.licence)}</dd></div>
        ${versions.length > 0 ? `<div><dt>Version</dt><dd>${esc(versions.join(', '))}</dd></div>` : ''}
        ${maintainers}
      </dl>
    </section>
    <section class="reg-section" id="entities" aria-labelledby="entities-heading">
      <h2 id="entities-heading">Entities <span class="reg-count">${model.entities.length}</span></h2>
      <p class="reg-section-note">${plural(model.entities.length, 'entity', 'entities')} and ${plural(propertyCount, 'property', 'properties')}, as in the model files at the pinned commit.</p>
      <ul class="reg-entity-index" aria-label="Entities">${entityIndex}</ul>
      ${entities}
    </section>
    ${componentsSection}<section class="reg-section" id="meaning-graphs" aria-labelledby="meaning-graphs-heading">
      <h2 id="meaning-graphs-heading">Meaning graphs for this model <span class="reg-count">${graphs.length}</span></h2>
      <p class="reg-section-note">From the MeaningGraph registry: graphs whose meaning files bind concepts to this model's entities and properties.</p>
      ${graphRows}
    </section>
    <section class="reg-section" id="databases" aria-labelledby="databases-heading">
      <h2 id="databases-heading">Databases using this model <span class="reg-count">${databases.length}</span></h2>
      <p class="reg-section-note">From the OVDB Directory: databases that name this model, by its address or, while their entry carries no model address, by repository and model file.</p>
      ${databaseRows}
    </section>
    <section class="reg-section" id="source-discoveries" aria-labelledby="source-discoveries-heading">
      <h2 id="source-discoveries-heading">Related inactive source discoveries <span class="reg-count">${sources.length}</span></h2>
      <p class="reg-section-note">From explicit ModelSpec metadata links in the OVDB Directory. These discoveries are inactive: the links do not establish native field bindings, database availability or query activation.</p>
      ${sourceRows}
    </section>
    ${sourceNote(ctx, data)}
  </main>`;
  return page({
    where: `model ${model.id}`,
    title: `${model.title} — ModelSpec registry`,
    description: model.description,
    path: modelPath(model.id),
    ctx,
    shell,
    main,
  });
}

/** Every generated page: Map of path (relative to the output directory) to HTML. */
export function renderRegistryPages(data, ctx, shell) {
  const pages = new Map();
  pages.set('registry/index.html', renderRegistryPage(data, ctx, shell));
  pages.set('registry/sources/index.html', renderSourcesPage(data, ctx, shell));
  for (const model of data.modelspec.models) {
    pages.set(`registry/models/${model.id}/index.html`, renderModelPage(model, data, ctx, shell));
  }
  return pages;
}

// ------------------------------------------------------------ landing page

/**
 * The landing page: public/index.html with the default MeaningGraph and OVDB
 * Directory addresses replaced by the configured ones. A production build changes
 * nothing; any other build also gets the banner and the source meta tag.
 */
export function renderLanding(template, ctx) {
  const required = ['<body>', '</head>', '/registry/models/chinook/'];
  for (const needle of required) {
    if (!template.includes(needle)) throw new Error(`public/index.html has no ${needle}, which the build relies on`);
  }
  const replacements = {
    [DEFAULTS.meaningGraphBaseUrl]: ctx.meaningGraphBaseUrl,
    [DEFAULTS.ovdbDirectoryBaseUrl]: ctx.ovdbDirectoryBaseUrl,
  };
  const pattern = new RegExp(Object.keys(replacements).map(url => url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  let html = template.replace(pattern, url => esc(replacements[url]));
  if (ctx.mode !== 'production') {
    html = html
      .replace('</head>', () => `  ${sourceMeta(ctx)}\n</head>`)
      .replace('<body>', () => `<body>\n  ${renderBanner(ctx)}`);
  }
  return html;
}
