'use strict';

const { escapeHTML, unescapeHTML } = require('hexo-util');

// NexT 7 looks up TOC fragments as literal element IDs. Hexo 6 encodes
// non-ASCII fragments, so decode these links before the theme reads them.
hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('class="rendering-article"')) return html;

  return html.replace(/(<a\b[^>]*\bclass="nav-link"[^>]*\bhref=")#([^"]*)(")/g,
    (link, before, fragment, after) => {
      try {
        return before + '#' + escapeHTML(decodeURIComponent(unescapeHTML(fragment))) + after;
      } catch {
        return link;
      }
    });
});
