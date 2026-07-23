'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const layout = require('./monorepo-layout');

/**
 * @typedef {object} FrameworkOption
 * @property {string} key
 * @property {string} name
 *
 * @typedef {object} GenerateContext
 * @property {string} appDir
 * @property {string} name
 * @property {string} port
 * @property {string} [kind]
 *
 * @typedef {object} GenerateResult
 * @property {string[]} structure
 * @property {string[]} commands
 * @property {string[]} [nextSteps]
 * @property {string[]} [envInfo]
 *
 * @typedef {object} CreateAppShellConfig
 * @property {'nestjs'|'vite'} world
 * @property {string} toolchainRoot absolute path to nestjs-apps | vite-apps
 * @property {string} [monorepoRoot]
 * @property {string} defaultPort
 * @property {string} title interactive banner
 * @property {string} helpText
 * @property {string} [defaultKind] when frameworks list exists
 * @property {FrameworkOption[]} [frameworks]
 * @property {Record<string, string>} [kindAliases]
 * @property {(ctx: GenerateContext) => GenerateResult} generate
 */

function resolveMonorepoRoot(toolchainRoot) {
  return layout.findMonorepoRoot(toolchainRoot);
}

function parseCliArgs(argv, extraFlags = []) {
  const out = {
    help: false,
    name: null,
    port: null,
    noInstall: false,
  };
  for (const f of extraFlags) out[f] = null;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a === '--no-install') {
      out.noInstall = true;
      continue;
    }
    const take = (flag) => {
      const v = argv[i + 1];
      if (!v || v.startsWith('-')) throw new Error(`Ожидается значение после ${flag}`);
      i++;
      return v;
    };
    if (a === '--name') {
      out.name = take('--name').trim();
      continue;
    }
    if (a === '--port') {
      out.port = take('--port');
      continue;
    }
    let matched = false;
    for (const f of extraFlags) {
      if (a === `--${f}`) {
        out[f] = take(`--${f}`);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (a.startsWith('-')) throw new Error(`Неизвестный флаг: ${a}`);
  }
  return out;
}

function getAvailablePort(monorepoRoot, defaultPort) {
  const used = layout.getUsedPorts(monorepoRoot);
  let port = parseInt(defaultPort, 10);
  while (used.has(port)) {
    port++;
    if (port > 65535) return String(defaultPort);
  }
  return String(port);
}

function validateName(name) {
  return Boolean(name && /^[a-z0-9-]+$/.test(name));
}

function validatePort(port) {
  return /^\d+$/.test(port) && +port >= 1 && +port <= 65535;
}

/**
 * @param {CreateAppShellConfig} config
 * @param {string|null} kind
 * @param {string} name
 * @param {string} port
 */
async function scaffold(config, kind, name, port) {
  const { world, toolchainRoot, monorepoRoot, generate } = config;
  const rel = `${path.basename(toolchainRoot)}/apps/${name}`;
  const targetDir = path.join(toolchainRoot, 'apps', name);

  layout.ensureLayoutDirs(monorepoRoot);

  if (fs.existsSync(targetDir)) {
    console.error(`❌ Приложение "${name}" уже существует в ${path.basename(toolchainRoot)}`);
    process.exit(1);
  }

  const label = kind ? `${kind} ` : '';
  console.log(`\n📦 Создаю ${label}"${name}" → ${rel} (порт ${port})...\n`);
  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });

  const result = generate({ appDir: targetDir, name, port, kind: kind || undefined });

  console.log('✅ Структура:');
  console.log(`   ${rel}/`);
  result.structure.forEach((line) => console.log(`   ${line}`));
  if (result.nextSteps) result.nextSteps.forEach((s) => console.log(`   ${s}`));
  console.log('\n💡 Команды:');
  result.commands.forEach((cmd) => console.log(`   ${cmd}`));
  if (result.envInfo?.length) {
    console.log('\n📝 ' + result.envInfo[0]);
  }

  console.log('\n🐳 docker-compose.yml...');
  try {
    const { addAppToDockerCompose } = require('../cli/create-docker-compose.js');
    await addAppToDockerCompose(name, world, monorepoRoot);
  } catch (error) {
    console.warn(`⚠️  docker-compose: ${error.message}`);
    console.log('   Вручную: npm run docker:create-compose');
  }
}

async function maybeInstall(toolchainRoot, shouldInstall) {
  const label = path.basename(toolchainRoot);
  if (!shouldInstall) {
    console.log(`\n⏭️  Пропущена установка. Вручную: npm install (в ${label}/)`);
    return;
  }
  console.log(`\n📦 npm install (${label})...`);
  try {
    execSync('npm install', { stdio: 'inherit', cwd: toolchainRoot });
    console.log('\n✅ Готово');
  } catch {
    console.warn(`\n⚠️  Установите вручную: npm install (в ${label}/)`);
  }
}

function resolveKind(config, cli) {
  const { frameworks, kindAliases = {}, defaultKind } = config;
  if (!frameworks?.length) return null;

  const raw = cli.kind || cli.variant;
  if (!raw) return defaultKind || frameworks[0].key;

  const fw = kindAliases[raw] || raw;
  if (!frameworks.some((f) => f.key === fw)) {
    console.error(`❌ kind/variant: ${frameworks.map((f) => f.key).join(' | ')}`);
    process.exit(1);
  }
  return fw;
}

/**
 * @param {CreateAppShellConfig} config
 */
async function runCreateApp(config) {
  const toolchainRoot = path.resolve(config.toolchainRoot);
  const monorepoRoot = config.monorepoRoot
    ? path.resolve(config.monorepoRoot)
    : resolveMonorepoRoot(toolchainRoot);

  const full = {
    ...config,
    toolchainRoot,
    monorepoRoot,
  };

  const extraFlags = full.frameworks?.length ? ['kind', 'variant'] : [];

  let cli;
  try {
    cli = parseCliArgs(process.argv, extraFlags);
  } catch (e) {
    console.error('❌', e.message);
    console.log(full.helpText);
    process.exit(1);
  }

  if (cli.help) {
    console.log(full.helpText);
    process.exit(0);
  }

  const hasFlags =
    cli.name ||
    cli.port ||
    cli.noInstall ||
    (extraFlags.length > 0 && (cli.kind || cli.variant));

  if (hasFlags) {
    const kind = resolveKind(full, cli);
    const nameBase = kind || full.world;
    const name = cli.name || layout.getDefaultAppName(full.world, nameBase, monorepoRoot);
    if (!validateName(name)) {
      console.error('❌ --name: a-z, 0-9, -');
      process.exit(1);
    }
    const port = cli.port || getAvailablePort(monorepoRoot, full.defaultPort);
    if (!validatePort(port)) {
      console.error('❌ --port 1–65535');
      process.exit(1);
    }
    await scaffold(full, kind, name, port);
    await maybeInstall(toolchainRoot, !cli.noInstall);
    return;
  }

  if (process.argv.slice(2).some((a) => a.startsWith('-'))) {
    console.error('❌ Недостаточно аргументов. См. --help');
    console.log(full.helpText);
    process.exit(1);
  }

  await interactive(full);
}

/**
 * @param {CreateAppShellConfig & { toolchainRoot: string, monorepoRoot: string }} config
 */
async function interactive(config) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log(`\n🚀 ${config.title}\n`);

  let kind = null;
  if (config.frameworks?.length) {
    config.frameworks.forEach((f, i) => console.log(`  ${i + 1}. ${f.name}`));
    const fwChoice = (await question('\nНомер [1]: ')) || '1';
    const fwIndex = parseInt(fwChoice, 10) - 1;
    if (fwIndex < 0 || fwIndex >= config.frameworks.length) {
      console.error('❌ Неверный выбор');
      rl.close();
      process.exit(1);
    }
    kind = config.frameworks[fwIndex].key;
  }

  const nameBase = kind || config.world;
  const defaultName = layout.getDefaultAppName(config.world, nameBase, config.monorepoRoot);
  const name = ((await question(`Название [${defaultName}]: `)) || defaultName).trim();
  if (!validateName(name)) {
    console.error('❌ Название: только a-z, 0-9, -');
    rl.close();
    process.exit(1);
  }

  const defaultPort = getAvailablePort(config.monorepoRoot, config.defaultPort);
  const port = (await question(`Порт [${defaultPort}]: `)) || defaultPort;
  if (!validatePort(port)) {
    console.error('❌ Порт 1–65535');
    rl.close();
    process.exit(1);
  }

  await scaffold(config, kind, name, port);
  const install = (await question('Установить зависимости? (y/n) [y]: ')) || 'y';
  rl.close();
  await maybeInstall(config.toolchainRoot, /^y(es)?$/i.test(install.trim()));
}

module.exports = {
  runCreateApp,
};
