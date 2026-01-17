#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createPackage() {
  console.log('\n📦 Создание нового пакета\n');

  // Название
  const name = await question('Название пакета: ');
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    console.error('❌ Название должно содержать только a-z, 0-9, -');
    process.exit(1);
  }

  const pkgDir = path.join(process.cwd(), 'packages', name);
  
  if (fs.existsSync(pkgDir)) {
    console.error(`❌ Пакет "${name}" уже существует`);
    process.exit(1);
  }

  console.log(`\n📦 Создаю пакет "@monorepo/${name}"...\n`);

  // Создаем структуру
  fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true });

  // package.json
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

  // src/index.ts
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

  // Закрываем readline перед выполнением npm install
  rl.close();

  // Автоматически устанавливаем зависимости только для нового пакета
  console.log('\n📦 Устанавливаю зависимости для пакета...');
  try {
    execSync(`npm install --workspace=@monorepo/${name}`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('\n✅ Зависимости установлены!');
  } catch (error) {
    console.warn('\n⚠️  Не удалось автоматически установить зависимости.');
    console.log('   Выполните вручную: npm install --workspace=@monorepo/' + name);
  }

  console.log('\n✅ Готово! Пакет доступен через:');
  console.log(`   import { ... } from '@monorepo/${name}';`);
}

createPackage().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});

