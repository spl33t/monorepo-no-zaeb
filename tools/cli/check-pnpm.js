if (!process.env.npm_execpath?.includes('pnpm')) {
  console.error("❌ Use pnpm to install dependencies");
  process.exit(1);
}