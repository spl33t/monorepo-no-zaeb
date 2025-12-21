/**
 * Утилиты для генерации SEO мета-тегов и скриптов
 */

import type { SeoDescriptor } from '../types';

/**
 * Генерирует HTML строку с SEO мета-тегами из SeoDescriptor
 */
export function generateMetaTags(seo: SeoDescriptor): string {
  const tags: string[] = [];

  if (seo.title) {
    tags.push(`<title>${escapeHtml(seo.title)}</title>`);
  }

  if (seo.description) {
    tags.push(
      `<meta name="description" content="${escapeHtml(seo.description)}">`
    );
  }

  if (seo.meta) {
    Object.entries(seo.meta).forEach(([name, content]) => {
      // Определяем, это property (og:) или name
      const isProperty = name.startsWith('og:') || name.startsWith('twitter:');
      const attr = isProperty ? 'property' : 'name';
      tags.push(
        `<meta ${attr}="${escapeHtml(name)}" content="${escapeHtml(content)}">`
      );
    });
  }

  return tags.join('\n  ');
}

/**
 * Генерирует скрипт для передачи route context в браузер
 */
export function generateRouteContextScript(context: unknown, pageInput?: unknown): string {
  const contextJson = JSON.stringify(context).replace(/</g, '\\u003c');
  let script = `<script>window.__ROUTE_CONTEXT__ = ${contextJson};`;
  
  if (pageInput !== undefined) {
    const pageInputJson = JSON.stringify(pageInput).replace(/</g, '\\u003c');
    script += `\nwindow.__PAGE_INPUT__ = ${pageInputJson};`;
  }
  
  script += `</script>`;
  return script;
}

/**
 * Экранирует HTML специальные символы
 */
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


