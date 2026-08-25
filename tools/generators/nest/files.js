const fs = require('fs');
const path = require('path');

/**
 * Nest scaffold: TypedRoute (@nestia/core), собирается webpack-билдером
 * @nestjs/cli (см. webpack-config.js) поверх ts-patch-пропатченного typescript.
 * @param {string} appDir
 * @param {string} name
 */
function generateNestFiles(appDir, name) {
  const mainContent = `import { NestFactory } from '@nestjs/core';
import { env } from '@env';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = env.PORT;
  const host = '0.0.0.0';

  await app.listen(port, host);
  console.log(\`🚀 ${name} is running on: http://\${host}:\${port}\`);
  console.log(\`📦 NODE_ENV: \${env.NODE_ENV}\`);
}

bootstrap();
`;
  fs.writeFileSync(path.join(appDir, 'src/main.ts'), mainContent);

  fs.writeFileSync(
    path.join(appDir, 'src/app.module.ts'),
    `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`,
  );

  fs.writeFileSync(
    path.join(appDir, 'src/app.controller.ts'),
    `import { Controller } from '@nestjs/common';
import { TypedRoute } from '@nestia/core';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @TypedRoute.Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @TypedRoute.Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
`,
  );

  fs.writeFileSync(
    path.join(appDir, 'src/app.service.ts'),
    `import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return \`🚀 ${name} API is running!\`;
  }
}
`,
  );

  fs.mkdirSync(path.join(appDir, 'src/types'), { recursive: true });
  fs.writeFileSync(
    path.join(appDir, 'src/types/global.ts'),
    `// Сюда — global-декларации (namespace-аугментации и т.п.). nestia.config.ts
// грузится отдельным ts-node-контекстом (не через webpack), поэтому
// подхватывает этот файл только по явному triple-slash reference (см.
// nestia.config.ts) — иначе SDK-генератор не увидит те же global-типы, что
// видит основной билд приложения (проверено живьём: без reference nestia
// sdk падает с крашем внутри @nestia/core на контроллере, использующем
// отсюда тип).

// Аугментация Express.Request — merge в РЕАЛЬНЫЙ namespace Express из
// @types/express (devDependency), а не создание нового изолированного —
// поэтому она видна и в @Req() req: Request (из 'express'), и в
// req.someField напрямую. Добавляй свои поля сюда (например то, что
// проставляет auth-middleware/guard).
declare global {
  namespace Express {
    interface Request {}
  }
}

export {};
`,
  );

  fs.writeFileSync(
    path.join(appDir, 'nestia.config.ts'),
    `/// <reference path="./src/types/global.ts" />

import type { INestiaConfig } from '@nestia/sdk';
import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * NestFactory input (samchon/backend).
 * SDK: pnpm run nestia:sdk (nestia sdk --project tsconfig.json — собственный
 * tsconfig app'а, отдельный SDK-конфиг не нужен).
 *
 * SDK едет прямо в packages/<name>-api-client/src — генерируемый клиент
 * становится настоящим @packages/*-пакетом (workspace:*), который любой app
 * (в т.ч. Vite) подключает как обычную зависимость, без ручного шага.
 * package.json для пакета создаётся автоматически при первом запуске, если
 * его ещё нет — дальше nestia перезаписывает файлы внутри src/ и поле
 * exports (см. MODULES ниже), остальное в package.json не трогает.
 *
 * APP_NAME читается из package.json в рантайме (а не подставляется на этапе
 * scaffold'а, как '${name}' в остальных generated-файлах) — переименование
 * app'а/пакета в package.json подхватывается без регенерации nestia.config.ts.
 *
 * MODULES — несколько Nest-модулей в ОДИН пакет, у каждого свой entry point.
 * По умолчанию один модуль 'index' — уходит в корень пакета (src/index.ts,
 * импортируется как '@packages/<name>-api-client', без изменений в
 * поведении). Добавь ещё один элемент с другим именем (например 'users',
 * свой @Module с контроллерами) — его SDK уедет в src/<name>, а package.json
 * → exports получит подпуть './<name>' → 'src/<name>/index.ts', импортируется
 * отдельно: '@packages/<name>-api-client/<name>'. default export ниже —
 * МАССИВ INestiaConfig; `nestia sdk` штатно прогоняет каждый элемент массива
 * отдельным проходом генерации (NestiaSdkCommand внутри @nestia/sdk) — это
 * родная возможность CLI, не самодельный цикл поверх него.
 *
 * clone: true — DTO каждого entry point'а физически копируются в его
 * собственный src/<entry>/structures вместо того, чтобы генерируемый код
 * ссылался на них через "import type" из исходного @packages/*. Это снимает
 * саму возможность появления @packages/*-импортов в SDK — раньше здесь был
 * process.on('exit', ...) сканер таких импортов, дописывающий их в
 * package.json как workspace:*-зависимости; с clone он структурно никогда не
 * сработал бы, поэтому убран.
 */
const APP_NAME = (require('./package.json').name as string).replace(/^@[^/]+\\//, '');
const PACKAGE_NAME = APP_NAME + '-api-client';
const PACKAGE_DIR = path.resolve(__dirname, '../../packages', PACKAGE_NAME);

const MODULES: { name: string; module: () => Promise<Type<any>> }[] = [
  { name: 'index', module: async () => (await import('./src/app.module')).AppModule },
];

// Красивый лог вместо голого вывода @nestia/sdk (тот сам печатает только
// разделители + счётчики контроллеров/путей/роутов на КАЖДЫЙ entry point, без
// имени/подпути — не разобрать, где что, если entry point'ов больше одного).
const subpathOf = (name: string) => (name === 'index' ? '.' : './' + name);
console.log(
  \`\\n📦 nestia sdk → packages/\${PACKAGE_NAME} (\${MODULES.length} entry point\${MODULES.length === 1 ? '' : 's'})\`,
);
for (const { name } of MODULES)
  console.log(\`   \${subpathOf(name)} → src/\${name === 'index' ? 'index.ts' : name + '/index.ts'}\`);

// @nestia/sdk сам никогда не удаляет файлы в output — только дописывает и
// перезаписывает (проверено чтением исходников: ни одного rmSync/unlinkSync
// во всём @nestia/sdk/lib). Убрал контроллер из модуля / переименовал сам
// модуль в MODULES — старый файл иначе остался бы висеть в src/ навсегда
// (и не важно, свой подкаталог у entry point'а, как у именованных, или общий
// с остальными, как у 'index' — в обоих случаях нет надёжного способа
// угадать, что именно устарело, не завязываясь на внутреннюю структуру
// конкретной версии @nestia/sdk). Раз \`nestia sdk\` и так полностью
// регенерирует КАЖДЫЙ конфиг из MODULES при каждом запуске (инкрементальной
// генерации нет), надёжнее не гадать, а просто снести весь src/ и отдать
// nestia чистый лист — тогда сироте физически негде взяться.
fs.rmSync(path.join(PACKAGE_DIR, 'src'), { recursive: true, force: true });
fs.mkdirSync(path.join(PACKAGE_DIR, 'src'), { recursive: true });

// Пересчитывается из MODULES при каждом запуске (идемпотентно) — добавил
// модуль в MODULES, прогнал nestia:sdk, entry point уже в package.json.
const exportsMap: Record<string, string> = {};
for (const { name } of MODULES)
  exportsMap[name === 'index' ? '.' : './' + name] =
    name === 'index' ? './src/index.ts' : \`./src/\${name}/index.ts\`;

const packageJsonPath = path.join(PACKAGE_DIR, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  const packageJson = {
    name: '@packages/' + PACKAGE_NAME,
    version: '1.0.0',
    private: true,
    main: exportsMap['.'],
    types: exportsMap['.'],
    exports: exportsMap,
    // @nestia/fetcher — сам SDK-клиент (PlainFetcher и т.п.), typia — типы
    // возвращаемых значений (Primitive<T>). DTO клонируются локально
    // (clone: true), поэтому больше ничего не требуется.
    dependencies: {
      '@nestia/fetcher': 'catalog:nest',
      typia: 'catalog:nest',
    },
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\\n');
  console.log(
    '[nestia.config] Создан packages/' + PACKAGE_NAME + '/package.json — выполни "pnpm install", ' +
    'затем добавь "@packages/' + PACKAGE_NAME + '": "workspace:*" тем, кому нужен SDK.',
  );
} else {
  // Только exports (+ main/types для корневого entry) — dependencies и
  // остальное уже "чужое", руками дополненное после первого запуска.
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  packageJson.exports = exportsMap;
  if (exportsMap['.']) {
    packageJson.main = exportsMap['.'];
    packageJson.types = exportsMap['.'];
  } else {
    delete packageJson.main;
    delete packageJson.types;
  }
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\\n');
}

const NESTIA_CONFIG: INestiaConfig[] = MODULES.map(({ name, module }, index) => ({
  input: async () => {
    // logger: false — это НЕ реальное приложение (не слушает порт, не
    // обрабатывает запросы), только разовая сборка DI-графа для рефлексии
    // контроллеров, поэтому весь стандартный лог NestFactory ([Nest] ... LOG
    // [InstanceLoader] ... initialized) — чистый шум, глушим, чтобы был виден
    // только наш маркер + собственная статистика @nestia/sdk ниже.
    console.log(\`\\n▶ [\${index + 1}/\${MODULES.length}] \${subpathOf(name)}\`);
    return NestFactory.create(await module(), { logger: false });
  },
  output: name === 'index' ? path.join(PACKAGE_DIR, 'src') : path.join(PACKAGE_DIR, 'src', name),
  clone: true,
}));

export default NESTIA_CONFIG;
`,
  );

  return {
    structure: [
      '  ├── main.ts',
      '  ├── app.module.ts',
      '  ├── app.controller.ts',
      '  ├── app.service.ts',
      '  └── types/',
      '      └── global.ts',
      'nestia.config.ts',
    ],
  };
}

module.exports = { generateNestFiles };
