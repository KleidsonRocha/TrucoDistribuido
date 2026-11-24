import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';

const run=promisify(execFile);
const args=['compose','-f','compose.yaml','-f','compose.production.yaml','-f','compose.demo.yaml','config','--format','json'];
const password=randomBytes(16).toString('hex');
const env={...process.env,CLUSTER_TOKEN:randomBytes(32).toString('hex'),DEMO_PASSWORD:password,COMPOSE_PROJECT_NAME:'neuro'};
const merged=JSON.parse((await run('docker',args,{env})).stdout);
assert.equal(Object.keys(merged.services).length,5);
const control=merged.services['demo-control'];
assert.equal(control.environment.DEMO_PASSWORD,password);assert.equal(control.environment.DEMO_COMPOSE_PROJECT,'neuro');
assert.equal(control.user,'0:0');assert.equal(control.read_only,true);assert.ok(control.cap_drop.includes('ALL'));
assert.deepEqual(Object.keys(control.networks),['demo-control']);assert.equal(merged.networks['demo-control'].internal,true);assert.ok(!control.ports?.length);
assert.equal(control.volumes.length,1);assert.equal(control.volumes[0].source,'/var/run/docker.sock');assert.equal(control.volumes[0].target,'/var/run/docker.sock');
assert.equal(merged.services.frontend.environment.DEMO_CONTROLLER_URL,'http://demo-control:8090');assert.equal(merged.services.frontend.environment.DEMO_PASSWORD,undefined);
assert.deepEqual(Object.keys(merged.services.frontend.networks).sort(),['demo-control','neuro']);
for(const id of [1,2,3]){
  const service=merged.services[`game-${id}`];assert.equal(service.environment.ENABLE_TEST_FAULTS,'0');assert.equal(service.environment.DEMO_PASSWORD,undefined);
  assert.deepEqual(Object.keys(service.networks),['neuro']);assert.ok(!service.volumes.some(volume=>volume.target==='/var/run/docker.sock'));assert.ok(!service.ports?.length);
}
await assert.rejects(run('docker',args,{env:{...env,DEMO_PASSWORD:''}}),error=>String(error.stderr).includes('DEMO_PASSWORD'));
console.log('PASS: optional demo Compose, password required, private controller, socket isolated, only gateway published. No containers were started.');
