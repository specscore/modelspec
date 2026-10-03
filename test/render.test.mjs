import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { assertChinookEverywhere, anchorId, esc, extractShell, renderBanner, renderLanding, renderModelPage, renderRegistryPage, safeUrl } from '../src/render.mjs';
import { ADDRESS, REPO, COMMIT, config, directoryJson, graphsJson, modelspecJson, sampleData } from './helpers.mjs';

const template = await readFile(`${REPO}/public/index.html`, 'utf8');
const shell = extractShell(template);
const BASES = { MEANINGGRAPH_BASE_URL: 'http://127.0.0.1:4010', OVDB_DIRECTORY_BASE_URL: 'http://127.0.0.1:4011' };
const ctx = config(['--use-fixture', '--out', 'dist-e2e'], BASES);
const render = (data = sampleData(), c = ctx) => ({
  index: renderRegistryPage(data, c, shell),
  model: renderModelPage(data.modelspec.models[0], data, c, shell),
});

test('esc and safeUrl', () => {
  assert.equal(esc(`<a href="x" onclick='y'>&`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  assert.equal(safeUrl('https://example.com/a?b=1&c="2"'), 'https://example.com/a?b=1&amp;c=&quot;2&quot;');
  assert.equal(safeUrl('http://127.0.0.1:4010/x'), 'http://127.0.0.1:4010/x');
  for (const bad of ['javascript:alert(1)', 'http://example.com/x', 'data:text/html,x', '//example.com', 'nonsense']) {
    assert.throws(() => safeUrl(bad), /Refusing to render a link/, bad);
  }
});

test('anchor ids keep safe characters and encode the rest', () => {
  assert.equal(anchorId('entity', 'Artist'), 'entity-Artist');
  assert.equal(anchorId('property', 'Album', 'ArtistId'), 'property-Album-ArtistId');
  assert.equal(anchorId('x', 'a b"c'), 'x-a_20b_22c');
});

test('the model page carries the title, address, repository, pinned commit, licence and files at the pinned commit', () => {
  const { model } = render();
  assert.match(model, /<h1>Chinook music store/);
  assert.match(model, /<code class="reg-address">modelspec:\/\/github\.com\/acme\/shop\/shop<\/code>/);
  assert.match(model, new RegExp(`class="reg-repo" href="https://github.com/acme/shop"[^>]*>acme/shop<`));
  assert.match(model, new RegExp(`class="reg-commit" href="https://github.com/acme/shop/commit/${COMMIT}"`));
  assert.match(model, new RegExp(`class="reg-file" href="https://github.com/acme/shop/blob/${COMMIT}/model/shop.modelspec.hcl"`));
  assert.match(model, new RegExp(`href="https://github.com/acme/shop/blob/${COMMIT}/model/shop.modelspec.json"`));
  assert.match(model, /<dt>Licence<\/dt><dd>MIT<\/dd>/);
  assert.match(model, /href="https:\/\/github.com\/someone"/);
  assert.match(model, /draft/);
});

test('entities and properties have anchors, and a reference links to its entity anchor', () => {
  const { model } = render();
  assert.match(model, /<section class="reg-entity" id="entity-Artist"/);
  assert.match(model, /<section class="reg-entity" id="entity-Album"/);
  assert.match(model, /<tr id="property-Album-ArtistId">/);
  assert.match(model, /<tr id="property-Artist-ArtistId">/);
  assert.match(model, /reference <span class="reg-arrow" aria-label="to">→<\/span> <a href="#entity-Artist">Artist<\/a>/);
  assert.match(model, /reg-pill--key">key</);
  assert.match(model, /<td data-label="Required">yes<\/td>/);
});

test('a reference to an entity outside the model is shown but not linked', () => {
  const json = modelspecJson();
  json.models[0].entities[1].properties[1].references = 'other.Person';
  const { model } = render(sampleData({ modelspec: json }));
  assert.match(model, /→<\/span> other\.Person</);
  assert.doesNotMatch(model, /href="#entity-other/);
});

test('meaning graphs and databases link to the other sites and show canonical URL, publisher and status', () => {
  const { model } = render();
  assert.match(model, /class="reg-graph-link" href="http:\/\/127\.0\.0\.1:4010\/graphs\/chinook\/"/);
  assert.doesNotMatch(model, /graphs\/core\//);
  assert.match(model, /class="reg-database-link" href="http:\/\/127\.0\.0\.1:4011\/databases\/chinook\/"/);
  assert.match(model, /class="reg-database-link" href="http:\/\/127\.0\.0\.1:4011\/databases\/chinook-two\/"/);
  assert.doesNotMatch(model, /databases\/unrelated/);
  assert.match(model, /<code class="reg-canonical">https:\/\/one\.example\/ovdb\/dbs\/chinook<\/code>/);
  assert.match(model, /<code class="reg-canonical">https:\/\/two\.example\/ovdb\/dbs\/chinook<\/code>/);
  assert.match(model, /class="reg-publisher" href="https:\/\/github.com\/acme\/shop"[^>]*>acme\/shop</);
  assert.match(model, /class="reg-publisher" href="https:\/\/git.example.com\/other\/hosting"[^>]*>git\.example\.com\/other\/hosting</);
  assert.match(model, /Databases using this model <span class="reg-count">2<\/span>/);
});

test('empty states say so, and never claim a match', () => {
  const { model } = render(sampleData({ graphs: graphsJson({ graphs: [] }), directory: directoryJson({ databases: [] }) }));
  assert.match(model, /No graph in the MeaningGraph registry binds meanings to this model yet\./);
  assert.match(model, /No database in the OVDB Directory names this model yet\./);
  assert.match(model, /Meaning graphs for this model <span class="reg-count">0<\/span>/);
});

test('everything from the indexes is escaped', () => {
  const evil = '<script>alert(1)</script>"\'&';
  const ms = modelspecJson();
  ms.models[0].title = evil;
  ms.models[0].description = evil;
  ms.models[0].status = evil;
  ms.models[0].licence = evil;
  ms.models[0].entities[0].properties[0].type = evil;
  const mg = graphsJson();
  mg.graphs[0].title = evil;
  mg.graphs[0].description = evil;
  mg.graphs[0].kind = evil;
  const dir = directoryJson();
  dir.databases[0].title = evil;
  dir.databases[0].status = evil;
  const { index, model } = render(sampleData({ modelspec: ms, graphs: mg, directory: dir }));
  for (const html of [index, model]) {
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /onerror|javascript:/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  }
});

test('the registry page lists every model, says it is a draft and links the registry repository', () => {
  const { index } = render();
  assert.match(index, /<h1>The ModelSpec registry<\/h1>/);
  assert.match(index, /<strong>Draft\.<\/strong> The registry is new/);
  assert.match(index, /href="https:\/\/github\.com\/modelspec-org\/registry"/);
  assert.match(index, /href="\/registry\/models\/chinook\/"/);
  assert.match(index, /<code>modelspec:\/\/github\.com\/acme\/shop\/shop<\/code>/);
  assert.match(index, /1 meaning graph, 2 databases/);
  assert.match(index, /2 entities, 4 properties/);
});

test('the shared three-layers copy is on the registry page, ModelSpec first, with the Chinook sentence', () => {
  const { index } = render();
  assert.match(index, /Where it is, what shape it has, what it means\./);
  const order = ['<strong>ModelSpec</strong>', 'OVDB Directory</a></strong>', 'MeaningGraph</a></strong>'].map(t => index.indexOf(t));
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
  assert.match(index, /class="reg-chinook-directory" href="http:\/\/127\.0\.0\.1:4011\/databases\/chinook\/">listed in the OVDB Directory/);
  assert.match(index, /class="reg-chinook-model" href="\/registry\/models\/chinook\/">modelled in ModelSpec/);
  assert.match(index, /class="reg-chinook-graph" href="http:\/\/127\.0\.0\.1:4010\/graphs\/chinook\/">explained in MeaningGraph/);
});

test('every page carries the source meta tag; non-production pages carry the banner first in the body', () => {
  const { index, model } = render();
  for (const html of [index, model]) {
    assert.match(html, /<meta name="modelspec-build-source" content="fixture">/);
    assert.match(html, /<body>\n  <div class="build-banner" role="alert"[^>]*><strong>Fixture build\.<\/strong>/);
    assert.doesNotMatch(html, /rel="canonical"/);
  }
  assert.match(renderBanner(config(['--use-fixture'], {})), /Fixture build/);
  assert.match(renderBanner(config([], { MODELSPEC_REGISTRY_INDEX_URL: 'https://raw.githubusercontent.com/x/y/b/index.json' })), /Non-production build.*raw\.githubusercontent\.com\/x\/y\/b/);
  assert.match(renderBanner(config(['--allow-local-index'], { OVDB_DIRECTORY_INDEX_URL: 'fixtures/ovdb-directory-index.fixture.json' })), /Local build/);
  assert.equal(renderBanner({ mode: 'production', sources: {} }), '');
});

test('a production page has a canonical link, no banner, and the production meta tag', () => {
  const prod = { ...config([], {}), mode: 'production', production: true };
  const html = renderModelPage(sampleData().modelspec.models[0], sampleData(), prod, shell);
  assert.match(html, /<meta name="modelspec-build-source" content="production">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/modelspec\.org\/registry\/models\/chinook\/">/);
  assert.doesNotMatch(html, /build-banner/);
});

test('generated pages reuse the landing header and footer, with the Registry link current', () => {
  const { model } = render();
  assert.equal((model.match(/<a href="\/registry\/" aria-current="page">Registry<\/a>/g) ?? []).length, 2);
  assert.match(model, /<a href="\/#why">Why<\/a>/);
  assert.match(model, /<a class="brand" href="\/"/);
  assert.match(model, /<script src="\/script\.js" defer><\/script>/);
  assert.match(model, /<link rel="stylesheet" href="\/registry\.css">/);
});

test('two entities whose names render to one anchor fail the build', () => {
  const ms = modelspecJson();
  // Both are valid names, but the model page must still stop on a duplicated id.
  ms.models[0].entities[0].properties.push({ name: 'x', type: 'int' });
  const data = sampleData({ modelspec: ms });
  data.modelspec.models[0].entities.push({ name: 'Artist', key: [], properties: [] });
  assert.throws(() => renderModelPage(data.modelspec.models[0], data, ctx, shell), /duplicate element id "entity-Artist"/);
});

test('the landing page: production output is public/index.html unchanged', () => {
  const prod = { ...config([], {}), mode: 'production', production: true };
  assert.equal(renderLanding(template, prod), template);
});

test('the landing page: other base URLs replace only the two default addresses, and the banner goes in', () => {
  const html = renderLanding(template, ctx);
  assert.match(html, /href="http:\/\/127\.0\.0\.1:4011\/databases\/chinook\/"/);
  assert.match(html, /href="http:\/\/127\.0\.0\.1:4010\/graphs\/chinook\/"/);
  assert.match(html, /href="http:\/\/127\.0\.0\.1:4010" rel="noopener">meaninggraph\.io/);
  assert.doesNotMatch(html, /https:\/\/meaninggraph\.io|https:\/\/directory\.openvaultdb\.com/);
  assert.match(html, /href="https:\/\/openvaultdb\.com\/"/, 'other links are untouched');
  assert.match(html, /href="\/registry\/models\/chinook\/"/);
  assert.match(html, /<body>\n  <div class="build-banner"/);
  assert.match(html, /<meta name="modelspec-build-source" content="fixture">\n<\/head>/);
});

test('the landing page has the nav link, the footer link and the section with its three links and three reasons', () => {
  const nav = /<nav class="site-nav"[\s\S]*?<\/nav>/.exec(template)[0];
  const footer = /<footer class="site-foot">[\s\S]*?<\/footer>/.exec(template)[0];
  assert.match(nav, /<a href="\/registry\/">Registry<\/a>/);
  assert.match(footer, /<a href="\/registry\/">Registry<\/a>/);
  const section = /<section id="layers"[\s\S]*?<\/section>/.exec(template)[0];
  assert.match(section, /Where it is, what shape it has, what it means\./);
  assert.ok(section.indexOf('<h3>ModelSpec</h3>') < section.indexOf('<h3>OVDB Directory</h3>'));
  assert.match(section, /Chinook is in all three:/);
  for (const href of ['https://directory.openvaultdb.com/databases/chinook/', '/registry/models/chinook/', 'https://meaninggraph.io/graphs/chinook/', 'https://directory.openvaultdb.com"', 'https://meaninggraph.io"']) {
    assert.ok(section.includes(`href="${href.replace(/"$/, '')}"`), href);
  }
  assert.equal((section.match(/<li><strong>/g) ?? []).length, 3);
  for (const reason of ['Start from a published model.', 'Recognise the same data in different places.', 'Run many databases of one model.']) assert.ok(section.includes(reason), reason);
});

test('the landing claim "Chinook is in all three" is checked against the data', () => {
  assertChinookEverywhere(sampleData());
  assert.throws(() => assertChinookEverywhere(sampleData({ directory: directoryJson({ databases: [] }) })), /no database chinook in the OVDB Directory/);
  assert.throws(() => assertChinookEverywhere(sampleData({ graphs: graphsJson({ graphs: [] }), directory: directoryJson({ databases: [] }) })), /graph chinook.*and no database chinook/);
});

test('extractShell fails loudly when the landing page loses a part it reuses', () => {
  assert.throws(() => extractShell(template.replace('<header class="site-head">', '<header>')), /site header/);
  assert.throws(() => extractShell(template.replace('<a href="/registry/">Registry</a>\n      <a class="nav-cta"', '<a class="nav-cta"')), /Registry link/);
});
