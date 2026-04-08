#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

function printHelp() {
  console.log(`
Создание пакета (интерактивно):
  pnpm create:package

Одна команда:
  pnpm create:package -- --name <имя> [--no-install]

Флаги:
  --name         только a-z, 0-9, дефис (обязателен в неинтерактивном режиме)
  --no-install   не запускать pnpm install --filter для пакета
`);
}

function parseCliArgs(argv) {
  const out = {
    help: false,
    name: null,
    noInstall: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a === '--no-install') {
      out.noInstall = true;
      continue;
    }
    const take = flag => {
      const v = argv[i + 1];
      if (!v || v.startsWith('-')) {
        throw new Error(`Ожидается значение после ${flag}`);
      }
      i++;
      return v;
    };
    if (a === '--name') {
      out.name = take('--name').trim();
      continue;
    }
    if (a.startsWith('-')) {
      throw new Error(`Неизвестный флаг: ${a}. См. pnpm create:package -- --help`);
    }
  }
  return out;
}

function validatePackageName(name) {
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    console.error('❌ Название должно содержать только a-z, 0-9, -');
    process.exit(1);
  }
}

function scaffoldPackage(name) {
  validatePackageName(name);

  const pkgDir = path.join(process.cwd(), 'packages', name);

  if (fs.existsSync(pkgDir)) {
    console.error(`❌ Пакет "${name}" уже существует`);
    process.exit(1);
  }

  console.log(`\n📦 Создаю пакет "@monorepo/${name}"...\n`);

  fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true });

  const packageJson = {
    name: `@monorepo/${name}`,
    version: '1.0.0',
    main: './src/index.ts',
    types: './src/index.ts'
  };
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  const indexContent = `// ${name} package

export function hello(name: string): string {
  return \`Hello from @monorepo/${name}, \${name}!\`;
}
`;
  fs.writeFileSync(path.join(pkgDir, 'src/index.ts'), indexContent);

  console.log('✅ Пакет создан:');
  console.log(`   packages/${name}/`);
  console.log(`   ├── src/`);
  console.log(`   │   └── index.ts`);
  console.log(`   └── package.json`);
}

function maybeInstallPackage(name, shouldInstall) {
  if (!shouldInstall) {
    console.log('\n⏭️  Пропущена установка зависимостей.');
    console.log(`   Выполните вручную: pnpm install --filter @monorepo/${name}`);
    return;
  }
  console.log('\n📦 Устанавливаю зависимости для пакета...');
  try {
    execSync(`pnpm install --filter @monorepo/${name}`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('\n✅ Зависимости установлены!');
  } catch {
    console.warn('\n⚠️  Не удалось автоматически установить зависимости.');
    console.log('   Выполните вручную: pnpm install --filter @monorepo/' + name);
  }
}

function printImportHint(name) {
  console.log('\n✅ Готово! Пакет доступен через:');
  console.log(`   import { ... } from '@monorepo/${name}';`);
}

async function interactiveCreatePackage() {
  console.log('\n📦 Создание нового пакета\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const name = await new Promise(resolve => {
    rl.question('Название пакета: ', resolve);
  });
  rl.close();

  const trimmed = (name || '').trim();
  validatePackageName(trimmed);

  scaffoldPackage(trimmed);
  maybeInstallPackage(trimmed, true);
  printImportHint(trimmed);
}

async function main() {
  let cli;
  try {
    cli = parseCliArgs(process.argv);
  } catch (e) {
    console.error('❌', e.message);
    printHelp();
    process.exit(1);
  }

  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  if (cli.name) {
    scaffoldPackage(cli.name);
    maybeInstallPackage(cli.name, !cli.noInstall);
    printImportHint(cli.name);
    return;
  }

  const onlyFlags = process.argv.slice(2).some(a => a.startsWith('-'));
  if (onlyFlags) {
    console.error('❌ Укажите --name <имя> для неинтерактивного режима.');
    printHelp();
    process.exit(1);
  }

  await interactiveCreatePackage();
}

main().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
