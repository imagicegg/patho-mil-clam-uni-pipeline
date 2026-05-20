import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '..');

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const env = {};
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const apiEnv = {
  ...parseEnvFile(resolve(repositoryRoot, 'apps/api/.env.example')),
  ...parseEnvFile(resolve(repositoryRoot, 'apps/api/.env.local')),
  ...process.env,
};

const bridgeUrl = apiEnv.ML_BRIDGE_URL ?? 'http://127.0.0.1:4100';
const pythonExecutable = apiEnv.ML_PYTHON_EXECUTABLE ?? 'python';
const bridgeServerScript = resolve(
  repositoryRoot,
  apiEnv.ML_BRIDGE_SERVER_SCRIPT ?? 'services/ml-bridge/server.py',
);

const url = new URL(bridgeUrl);
const host = url.hostname;
const port = url.port || (url.protocol === 'https:' ? '443' : '80');

async function isHealthy() {
  try {
    const response = await fetch(`${bridgeUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function waitForSignal() {
  return new Promise((resolveSignal) => {
    process.stdin.resume();

    const handleSignal = () => {
      process.stdin.pause();
      resolveSignal();
    };

    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);
  });
}

async function main() {
  if (await isHealthy()) {
    console.log(`Reusing independent ML bridge at ${bridgeUrl}`);
    await waitForSignal();
    return;
  }

  const child = spawn(pythonExecutable, [bridgeServerScript, '--host', host, '--port', port], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: process.env,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
