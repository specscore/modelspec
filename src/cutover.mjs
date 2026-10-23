// Founder-authorized clean website cutover. Old paths/fragments are not translated.
// The internal proxy is deployment provenance only; it is not a legacy API.
export const RECEIPT_FILE = 'deployment-receipt.json';
export const CUTOVER_REDIRECTS = `/build-info.json /${RECEIPT_FILE} 200
/registry https://meaninggraph.io/registry/models/ 301
/registry/* https://meaninggraph.io/registry/models/ 301
/* https://meaninggraph.io/ 301
`;

export const CUTOVER_PROBES = [
  ['/', 'https://meaninggraph.io/'],
  ['/registry', 'https://meaninggraph.io/registry/models/'],
  ['/registry/', 'https://meaninggraph.io/registry/models/'],
  ['/registry/models/chinook/', 'https://meaninggraph.io/registry/models/'],
  ['/schema/modelspec-ast.schema.json', 'https://meaninggraph.io/'],
  ['/privacy/', 'https://meaninggraph.io/'],
  ['/unknown-retired-path', 'https://meaninggraph.io/'],
];

export async function verifyCutover(baseUrl, fetchImpl = fetch) {
  for (const [path, destination] of CUTOVER_PROBES) {
    const response = await fetchImpl(`${baseUrl}${path}`, {redirect: 'manual', signal: AbortSignal.timeout(20_000)});
    if (response.status !== 301 || response.headers.get('location') !== destination) {
      throw new Error(`Clean cutover failed for ${path}: expected HTTP 301 to ${destination}, received HTTP ${response.status}`);
    }
    await response.body?.cancel();
  }
}
