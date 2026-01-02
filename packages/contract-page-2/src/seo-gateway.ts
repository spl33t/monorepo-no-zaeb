/**
 * SEO Gateway - сервер для генерации HTML с SEO мета-тегами
 * Читает контракты и генерирует HTML с правильными мета-тегами для каждой страницы
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import type { RequestContext, Contract } from './index';

// Функция для экранирования HTML
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Функция для извлечения скриптов и стилей из index.html
function extractAssetsFromIndexHtml(distPath: string, baseDir?: string): { scripts: string[]; styles: string[] } {
  try {
    const indexPath = path.isAbsolute(distPath) 
      ? path.join(distPath, 'index.html')
      : baseDir
        ? path.resolve(baseDir, distPath, 'index.html')
        : path.resolve(distPath, 'index.html');
    
    if (!fs.existsSync(indexPath)) {
      console.warn(`⚠️  index.html не найден по пути: ${indexPath}`);
      return { scripts: [], styles: [] };
    }

    const htmlContent = fs.readFileSync(indexPath, 'utf-8');
    const scripts: string[] = [];
    const styles: string[] = [];

    // Извлекаем script теги
    const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(htmlContent)) !== null) {
      scripts.push(match[1]);
    }

    // Извлекаем link теги для стилей
    const linkRegex = /<link[^>]*href=["']([^"']+\.css[^"']*)["'][^>]*>/gi;
    while ((match = linkRegex.exec(htmlContent)) !== null) {
      styles.push(match[1]);
    }

    return { scripts, styles };
  } catch (error) {
    console.error('Ошибка при чтении index.html:', error);
    return { scripts: [], styles: [] };
  }
}

// Функция для генерации HTML с SEO мета-тегами
async function generateHTML<AppCtx>(
  contract: Contract<AppCtx, any>,
  url: string, 
  clientBundleUrl: string,
  baseDir?: string
): Promise<string> {
  // Получаем данные страницы из контракта
  const { page, params } = contract.matchRoute(url);
  
  let title = 'App';
  let description = '';
  let seoData: any = null;

  if (page) {
    // Создаем RequestContext из доступной информации
    const req: RequestContext = {
      method: 'GET',
      url,
      headers: {},
      query: {},
    };

    // Получаем appContext если он есть
    let appContext: any = undefined;
    if ('getAppContext' in contract && contract.getAppContext) {
      appContext = await contract.getAppContext(req);
    }

    // Вызываем page функцию для получения SEO данных
    const result = appContext !== undefined
      ? await (page.fn as any)({ appContext, params })
      : await (page.fn as any)({ params });

    if (result.type === 'ok' && result.seo) {
      seoData = result.seo;
      if (typeof result.seo === 'object' && result.seo !== null) {
        title = (result.seo as any).title || title;
        description = (result.seo as any).description || description;
      }
    }
  }

  // Генерируем HTML с SEO мета-тегами
  const metaTags = [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `<title>${escapeHtml(title)}</title>`,
  ];

  if (description) {
    metaTags.push(`<meta name="description" content="${escapeHtml(description)}">`);
  }

  // Добавляем дополнительные SEO мета-теги из seo объекта
  if (seoData && typeof seoData === 'object') {
    const seo = seoData as Record<string, any>;
    
    // Open Graph теги
    if (seo.ogTitle) metaTags.push(`<meta property="og:title" content="${escapeHtml(seo.ogTitle)}">`);
    if (seo.ogDescription) metaTags.push(`<meta property="og:description" content="${escapeHtml(seo.ogDescription)}">`);
    if (seo.ogImage) metaTags.push(`<meta property="og:image" content="${escapeHtml(seo.ogImage)}">`);
    if (seo.ogUrl) metaTags.push(`<meta property="og:url" content="${escapeHtml(seo.ogUrl)}">`);
    
    // Twitter Card теги
    if (seo.twitterCard) metaTags.push(`<meta name="twitter:card" content="${escapeHtml(seo.twitterCard)}">`);
    if (seo.twitterTitle) metaTags.push(`<meta name="twitter:title" content="${escapeHtml(seo.twitterTitle)}">`);
    if (seo.twitterDescription) metaTags.push(`<meta name="twitter:description" content="${escapeHtml(seo.twitterDescription)}">`);
    if (seo.twitterImage) metaTags.push(`<meta name="twitter:image" content="${escapeHtml(seo.twitterImage)}">`);
    
    // Дополнительные мета-теги
    if (seo.keywords) metaTags.push(`<meta name="keywords" content="${escapeHtml(seo.keywords)}">`);
    if (seo.author) metaTags.push(`<meta name="author" content="${escapeHtml(seo.author)}">`);
  }

  // Определяем, является ли clientBundleUrl файловым путем
  const isFilePath = clientBundleUrl.startsWith('../') || 
                     clientBundleUrl.startsWith('./') || 
                     path.isAbsolute(clientBundleUrl) ||
                     (!clientBundleUrl.startsWith('http://') && !clientBundleUrl.startsWith('https://') && !clientBundleUrl.startsWith('/'));

  let scriptsHtml = '';
  let stylesHtml = '';

  if (isFilePath) {
    // Если это файловый путь, читаем index.html и извлекаем скрипты/стили
    const { scripts, styles } = extractAssetsFromIndexHtml(clientBundleUrl, baseDir);
    
    // Добавляем стили
    styles.forEach(style => {
      const stylePath = style.startsWith('/') ? style : `/${style}`;
      stylesHtml += `  <link rel="stylesheet" crossorigin href="${stylePath}">\n`;
    });

    // Добавляем скрипты
    scripts.forEach(script => {
      const scriptPath = script.startsWith('/') ? script : `/${script}`;
      scriptsHtml += `  <script type="module" crossorigin src="${scriptPath}"></script>\n`;
    });
  } else {
    // Если это URL, используем как есть
    scriptsHtml = `  <script type="module" src="${clientBundleUrl}"></script>\n`;
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  ${metaTags.join('\n  ')}
${stylesHtml}${scriptsHtml}</head>
<body>
  <div id="root"></div>
</body>
</html>`;
}

// Функция для создания SEO Gateway сервера
export function createSeoServer<AppCtx>(
  contract: Contract<AppCtx, any>,
  options?: {
    port?: number;
    host?: string;
    clientBundleUrl?: string;
    baseDir?: string;
  }
) {
  const PORT = options?.port || Number(process.env.PORT) || 4000;
  const HOST = options?.host || process.env.HOST || '0.0.0.0';
  const bundleUrl = options?.clientBundleUrl || process.env.CLIENT_BUNDLE_URL || 'https://cdn.example.com/dist/client/main.js';
  const baseDir = options?.baseDir;

  // Определяем, является ли clientBundleUrl файловым путем
  const isFilePath = bundleUrl.startsWith('../') || 
                     bundleUrl.startsWith('./') || 
                     path.isAbsolute(bundleUrl) ||
                     (!bundleUrl.startsWith('http://') && !bundleUrl.startsWith('https://') && !bundleUrl.startsWith('/'));

  // Если это файловый путь, вычисляем абсолютный путь к dist
  const distPath = isFilePath
    ? (path.isAbsolute(bundleUrl) 
        ? bundleUrl 
        : baseDir
          ? path.resolve(baseDir, bundleUrl)
          : bundleUrl)
    : null;

  // Создаем HTTP сервер
  const server = http.createServer(async (req, res) => {
    try {
      // Health check endpoint для Instance Group
      const url = req.url?.split('?')[0]; // Убираем query параметры
      if (url === '/health' || url === '/health/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // Если это запрос к статическим файлам (assets) и у нас есть distPath
      if (distPath && url?.startsWith('/assets/')) {
        const filePath = path.join(distPath, url);
        
        // Проверяем, что файл существует и находится внутри distPath (безопасность)
        const normalizedDistPath = path.resolve(distPath);
        const normalizedFilePath = path.resolve(filePath);
        
        if (fs.existsSync(normalizedFilePath) && normalizedFilePath.startsWith(normalizedDistPath)) {
          const ext = path.extname(filePath);
          const contentType = 
            ext === '.js' ? 'application/javascript' :
            ext === '.css' ? 'text/css' :
            ext === '.map' ? 'application/json' :
            'application/octet-stream';
          
          const content = fs.readFileSync(normalizedFilePath);
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000', // Кешируем статические файлы
          });
          res.end(content);
          return;
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
      }

      // Генерируем HTML для всех остальных запросов
      const html = await generateHTML(contract, url || '/', bundleUrl, baseDir);
      
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.end(html);
    } catch (error: any) {
      console.error('Error generating HTML:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  return {
    server,
    listen: (callback?: () => void) => {
      server.listen(Number(PORT), HOST, () => {
        console.log(`✅ SEO Gateway is running on http://${HOST}:${PORT}`);
        console.log(`📦 Client bundle URL: ${bundleUrl}`);
        if (callback) callback();
      });
      return server;
    },
  };
}