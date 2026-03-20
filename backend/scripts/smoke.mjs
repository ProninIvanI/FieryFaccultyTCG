import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.SMOKE_PORT || 3101);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 15000;

const child = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(PORT),
    POSTGRES_HOST: process.env.POSTGRES_HOST || '127.0.0.1',
    POSTGRES_PORT: process.env.POSTGRES_PORT || '5432',
    POSTGRES_USER: process.env.POSTGRES_USER || 'postgres',
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || 'postgres',
    POSTGRES_DB: process.env.POSTGRES_DB || 'projectbot',
    API_PREFIX: '/api',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let bootLog = '';

child.stdout.on('data', (chunk) => {
  bootLog += chunk.toString();
});

child.stderr.on('data', (chunk) => {
  bootLog += chunk.toString();
});

const waitForServer = async () => {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server still booting.
    }
    await delay(250);
  }
  throw new Error(`Server did not start in ${START_TIMEOUT_MS}ms.\n${bootLog}`);
};

const assertApiRoute = async () => {
  const response = await fetch(`${BASE_URL}/api`);
  if (response.status !== 200) {
    throw new Error(`Expected /api status 200, got ${response.status}`);
  }

  const json = await response.json();
  if (json?.success !== true) {
    throw new Error('Expected /api response.success to be true');
  }
};

const assertHealthRoute = async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  if (![200, 500].includes(response.status)) {
    throw new Error(`Expected /api/health status 200 or 500, got ${response.status}`);
  }

  const json = await response.json();
  if (typeof json?.success !== 'boolean') {
    throw new Error('Expected /api/health response.success to be boolean');
  }
};

try {
  await waitForServer();
  await assertApiRoute();
  await assertHealthRoute();
  console.log('Smoke tests passed');
} finally {
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(3000).then(() => {
      child.kill('SIGKILL');
    }),
  ]);
}
