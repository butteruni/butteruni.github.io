'use strict';

const redirects = {
  'zzz-scene': 'zzz-rendering-analysis/',
  'zzz-character': 'zzz-rendering-analysis/#character-geometry',
  'genshin-scene': 'genshin-rendering-analysis/',
  'genshin-character': 'genshin-rendering-analysis/#face',
  'endfield-scene': 'endfield-rendering-analysis/',
  'endfield-character': 'endfield-rendering-analysis/#character'
};

// Keep existing project links useful without creating duplicate blog posts.
hexo.extend.generator.register('rendering-project-redirects', () =>
  Object.entries(redirects).map(([oldSlug, target]) => {
    const url = '/2026/09/27/' + target;
    return {
      path: '2026/09/27/' + oldSlug + '/index.html',
      data: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
        '<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=' + url + '">' +
        '<link rel="canonical" href="https://butteruni.github.io' + url.split('#')[0] + '">' +
        '<title>文章已合并</title></head><body><p>内容已合并至<a href="' + url + '">项目渲染分析</a>。</p></body></html>'
    };
  })
);
