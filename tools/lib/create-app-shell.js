'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const layout = require('./monorepo-layout');

/**
 * `@inquirer/prompts` — ESM-only с v8, грузится через динамический `import()`
 * — стандартный мост ESM→CJS в Node, без перевода файла в ESM.
 * @returns {Promise<{ select: Function, input: Function, confirm: Function }>}
 */
function loadPrompts() {
  return import('@inquirer/prompts');
}

/**
 * @typedef {object} FrameworkOption
 * @property {string} key            CLI --kind value, e.g. 'nest' | 'react' | 'vanilla'
 * @property {string} name           display name (interactive menu)
 * @property {string} defaultPort
 *
 * @typedef {object} GenerateContext
 * @property {string} appDir
 * @property {string} name
 * @property {string} port
 * @property {string} key            выбранный FrameworkOption.key
 *
 * @typedef {object} GenerateResult
 * @property {string[]} structure
 * @property {string[]} commands
 * @property {string[]} [nextSteps]
 * @property {string[]} [envInfo]
 *
 * @typedef {object} CreateAppShellConfig
 * @property {string} monorepoRoot absolute path to repo root
 * @property {string} title interactive banner
 * @property {string} helpText
 * @property {FrameworkOption[]} frameworks
 * @property {(ctx: GenerateContext) => GenerateResult} generate
 */

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
 * @param {FrameworkOption} framework
 * @param {string} name
 * @param {string} port
 */
async function scaffold(config, framework, name, port) {
  const { monorepoRoot, generate } = config;
  const rel = `apps/${name}`;
  const targetDir = path.join(monorepoRoot, 'apps', name);

  layout.ensureLayoutDirs(monorepoRoot);

  if (fs.existsSync(targetDir)) {
    console.error(`❌ Приложение "${name}" уже существует`);
    process.exit(1);
  }

  console.log(`\n📦 Создаю ${framework.name} "${name}" → ${rel} (порт ${port})...\n`);
  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });

  const result = generate({ appDir: targetDir, name, port, key: framework.key });

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
    await addAppToDockerCompose(name, monorepoRoot);
  } catch (error) {
    console.warn(`⚠️  docker-compose: ${error.message}`);
    console.log('   Вручную: pnpm run docker:create-compose');
  }
}

async function maybeInstall(monorepoRoot, shouldInstall) {
  if (!shouldInstall) {
    console.log('\n⏭️  Пропущена установка. Вручную: pnpm install');
    return;
  }
  console.log('\n📦 pnpm install...');
  try {
    execSync('pnpm install', { stdio: 'inherit', cwd: monorepoRoot });
    console.log('\n✅ Готово');
  } catch {
    console.warn('\n⚠️  Установите вручную: pnpm install');
  }
}

/**
 * @param {CreateAppShellConfig} config
 * @param {{ kind?: string }} cli
 * @returns {FrameworkOption}
 */
function resolveFramework(config, cli) {
  const { frameworks } = config;
  const key = cli.kind;
  if (!key) {
    if (frameworks.length === 1) return frameworks[0];
    console.error(`❌ Укажи --kind (${frameworks.map((f) => f.key).join(' | ')})`);
    process.exit(1);
  }

  const framework = frameworks.find((f) => f.key === key);
  if (!framework) {
    console.error(`❌ --kind: ${frameworks.map((f) => f.key).join(' | ')}`);
    process.exit(1);
  }
  return framework;
}

/**
 * @param {CreateAppShellConfig} config
 */
async function runCreateApp(config) {
  const monorepoRoot = path.resolve(config.monorepoRoot);
  const full = { ...config, monorepoRoot };
  const extraFlags = ['kind'];

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

  const hasFlags = cli.name || cli.port || cli.noInstall || cli.kind;

  if (hasFlags) {
    const framework = resolveFramework(full, cli);
    const name = cli.name || layout.getDefaultAppName(framework.key, monorepoRoot);
    if (!validateName(name)) {
      console.error('❌ --name: a-z, 0-9, -');
      process.exit(1);
    }
    const port = cli.port || getAvailablePort(monorepoRoot, framework.defaultPort);
    if (!validatePort(port)) {
      console.error('❌ --port 1–65535');
      process.exit(1);
    }
    await scaffold(full, framework, name, port);
    await maybeInstall(monorepoRoot, !cli.noInstall);
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
 * @param {CreateAppShellConfig & { monorepoRoot: string }} config
 */
async function interactive(config) {
  const { select, input, confirm } = await loadPrompts();

  console.log(`\n🚀 ${config.title}\n`);

  const framework = await select({
    message: 'Framework',
    choices: config.frameworks.map((f) => ({ name: f.name, value: f })),
  });

  const defaultName = layout.getDefaultAppName(framework.key, config.monorepoRoot);
  const name = await input({
    message: 'Название',
    default: defaultName,
    validate: (value) => validateName(value.trim()) || 'Только a-z, 0-9, -',
  });

  const defaultPort = getAvailablePort(config.monorepoRoot, framework.defaultPort);
  const port = await input({
    message: 'Порт',
    default: defaultPort,
    validate: (value) => validatePort(value.trim()) || 'Порт 1–65535',
  });

  await scaffold(config, framework, name.trim(), port.trim());
  const shouldInstall = await confirm({ message: 'Установить зависимости?', default: true });
  await maybeInstall(config.monorepoRoot, shouldInstall);
}

module.exports = {
  runCreateApp,
};
