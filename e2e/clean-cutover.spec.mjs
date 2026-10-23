import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {buildSite} from '../src/site.mjs';
import {verifyCutover} from '../src/cutover.mjs';
import {productionConfig, sampleData, tempRoot} from '../test/helpers.mjs';

test('production artifact redirects through actual Workers static assets and retains deployment provenance', async ({request}, testInfo) => {
  test.setTimeout(60_000);
  const {root, cleanup} = await tempRoot();
  const port = 18800 + testInfo.workerIndex;
  let worker;
  try {
    await buildSite({root, config: productionConfig(root), data: sampleData()});
    const config = join(root, 'wrangler.json');
    await writeFile(config, JSON.stringify({name:'cutover-test', compatibility_date:'2026-06-02', assets:{directory:join(root,'dist')}}));
    worker=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--config',config],{stdio:'ignore',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
    const base=`http://127.0.0.1:${port}`;
    await expect.poll(async () => {try {return (await request.get(`${base}/build-info.json`,{maxRedirects:0,timeout:1000})).status();} catch {return 0;}},{timeout:30_000}).toBe(200);
    await verifyCutover(base);
    const receipt=await request.get(`${base}/build-info.json`,{maxRedirects:0});
    expect((await receipt.json()).format).toBe('modelspec-build/1');
  } finally {
    if(worker && worker.exitCode===null) {worker.kill('SIGTERM');await new Promise(resolve => worker.once('exit',resolve));}
    await cleanup();
  }
});
