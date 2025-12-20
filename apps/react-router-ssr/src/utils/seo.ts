/**
 * Утилиты для генерации SEO мета-тегов
 */

import type { SeoDescriptor } from '@monorepo/page-contract';

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

export function generateRouteContextScript(context: unknown): string {
  const json = JSON.stringify(context).replace(/</g, '\\u003c');
  return `<script>window.__ROUTE_CONTEXT__ = ${json};</script>`;
}

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

