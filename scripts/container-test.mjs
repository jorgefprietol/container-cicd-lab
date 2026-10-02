import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { smoke } from './smoke.mjs';

const exec = promisify(execFile);
const name = `container-cicd-smoke-${randomUUID()}`;
const image = process.argv[2] ?? 'container-cicd-lab:local';
async function docker(...args) {
  return (await exec('docker', args)).stdout.trim();
}

try {
  await docker(
    'run',
    '-d',
    '--name',
    name,
    '--init',
    '--read-only',
    '--tmpfs',
    '/tmp:size=16m,noexec,nosuid',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--memory=128m',
    '--cpus=1',
    '--pids-limit=64',
    '-p',
    '127.0.0.1::8080',
    image,
  );
  const inspection = JSON.parse(await docker('inspect', name))[0];
  assert.equal(inspection.Config.User, 'node');
  assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(inspection.HostConfig.CapDrop, ['ALL']);
  const port = inspection.NetworkSettings.Ports['8080/tcp'][0].HostPort;
  const url = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(`${url}/health/ready`)).ok) {
        healthy = true;
        break;
      }
    } catch {
      /* starting */
    }
    await setTimeout(500);
  }
  assert.ok(healthy, 'El contenedor no llegó a readiness');
  await smoke(url);
  await docker('stop', '--time', '10', name);
  const stopped = JSON.parse(await docker('inspect', name))[0];
  assert.equal(stopped.State.ExitCode, 0, 'SIGTERM debe cerrar limpiamente');
  console.log('Contenedor OK: non-root, read-only, cap-drop y cierre SIGTERM con código 0');
} catch (error) {
  try {
    console.error(await docker('logs', name));
  } catch {
    /* container not created */
  }
  throw error;
} finally {
  try {
    await docker('rm', '-f', name);
  } catch {
    /* container not created */
  }
}
