#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  const root = process.cwd();
  const cursorDir = path.join(root, '.cursor');
  const mcpPath = path.join(cursorDir, 'mcp.json');
  const examplePath = path.join(
    root,
    'tools',
    'templates',
    'mcp-postgres',
    'mcp.json.example'
  );

  console.log(
    '\n📡 MCP PostgreSQL (@modelcontextprotocol/server-postgres, только чтение)\n'
  );

  let conn = await question(
    'Строка подключения [по умолчанию: postgresql://localhost:5432/postgres]: '
  );
  conn = (conn || '').trim() || 'postgresql://localhost:5432/postgres';

  let data = { mcpServers: {} };
  if (fs.existsSync(mcpPath)) {
    try {
      const raw = fs.readFileSync(mcpPath, 'utf8');
      data = JSON.parse(raw);
      if (!data.mcpServers || typeof data.mcpServers !== 'object') {
        data.mcpServers = {};
      }
    } catch (e) {
      console.error('❌ Не удалось разобрать существующий .cursor/mcp.json:', e.message);
      process.exit(1);
    }
  }

  data.mcpServers.postgres = {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', conn]
  };

  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(mcpPath, JSON.stringify(data, null, 2), 'utf8');

  console.log(`\n✅ Записано: ${path.relative(root, mcpPath)}`);
  if (fs.existsSync(examplePath)) {
    console.log(`   Пример без секретов: ${path.relative(root, examplePath)}`);
  }
  console.log(
    '\n   Перезагрузите окно Cursor (или MCP-серверы), чтобы применить конфигурацию.\n'
  );

  rl.close();
}

main().catch(err => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
