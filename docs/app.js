const nav = document.getElementById('nav');
const navFilter = document.getElementById('navFilter');
const content = document.getElementById('content');
const pageTitle = document.getElementById('page-title');
const pageMeta = document.getElementById('page-meta');
const buildMeta = document.getElementById('build-meta');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarPinToggle = document.getElementById('sidebarPinToggle');
const tocPanel = document.getElementById('tocPanel');
const tocNav = document.getElementById('tocNav');
const SIDEBAR_COLLAPSE_KEY = 'ops-docs-sidebar-collapsed';

const state = {
  root: null,
  nodes: new Map(),
  currentPath: '',
  expandedDirs: new Set(),
  tocHeadings: [],
  tocLinks: [],
};

let tocRaf = 0;

marked.setOptions({
  gfm: true,
  breaks: false,
  mangle: false,
  headerIds: true,
});

function isDesktop() {
  return window.innerWidth >= 980;
}

function isDesktopCollapsed() {
  return document.body.classList.contains('sidebar-collapsed');
}

function updateSidebarToggleLabel() {
  const desktop = isDesktop();
  const collapsed = isDesktopCollapsed();

  if (sidebarToggle) {
    if (desktop) {
      sidebarToggle.textContent = collapsed ? '展开目录' : '收起目录';
    } else {
      sidebarToggle.textContent = '目录';
    }
  }

  if (sidebarPinToggle) {
    if (desktop) {
      sidebarPinToggle.textContent = collapsed ? '⟩⟩' : '⟨⟨';
      const label = collapsed ? '展开目录' : '收起目录';
      sidebarPinToggle.setAttribute('aria-label', label);
      sidebarPinToggle.setAttribute('title', label);
      sidebarPinToggle.disabled = false;
    } else {
      sidebarPinToggle.textContent = '⟨⟨';
      sidebarPinToggle.disabled = true;
    }
  }
}

function setDesktopCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  try {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch {
    // ignore storage errors in privacy/sandboxed mode
  }
  updateSidebarToggleLabel();
}

function restoreSidebarPreference() {
  try {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
    if (saved === '1' && isDesktop()) {
      document.body.classList.add('sidebar-collapsed');
    }
  } catch {
    // ignore storage errors in privacy/sandboxed mode
  }
}

function toHash(path) {
  return path ? `#/${encodeURI(path)}` : '#/';
}

function normalizePath(hash) {
  if (!hash || hash === '#') return '';
  if (!hash.startsWith('#/')) return null;
  const cleaned = hash.slice(2).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleaned) return '';
  try {
    return decodeURI(cleaned);
  } catch {
    return cleaned;
  }
}

function getSearchQuery() {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('q');
  return query ? query.trim() : '';
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeManifestPath(path) {
  return (path || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function indexTree(node) {
  node.path = normalizeManifestPath(node.path);
  node.file = normalizeManifestPath(node.file);
  state.nodes.set(node.path || '', node);
  if (node.children && node.children.length) {
    node.children.forEach((child) => indexTree(child));
  }
}

function collectNodes(node, list = []) {
  if (!node) return list;
  list.push(node);
  if (node.children && node.children.length) {
    node.children.forEach((child) => collectNodes(child, list));
  }
  return list;
}

function clearToc() {
  state.tocHeadings = [];
  state.tocLinks = [];
  if (tocNav) tocNav.innerHTML = '';
  if (tocPanel) tocPanel.classList.add('hidden');
}

function wrapWithDocTools(innerHtml) {
  return `
    <div class="doc-tools">
      <a class="back-home-btn" href="#/">返回主页</a>
    </div>
    ${innerHtml}
  `;
}

function enhanceCodeBlocks() {
  content.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.copy-code-btn')) return;
    const code = pre.querySelector('code');
    if (!code) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code-btn';
    button.textContent = '复制';
    button.setAttribute('aria-label', '复制代码');
    button.addEventListener('click', async () => {
      const text = code.innerText;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = '已复制';
      } catch (error) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = '已选中';
      }
      window.setTimeout(() => {
        button.textContent = '复制';
      }, 1400);
    });
    pre.appendChild(button);
  });
}

function setActiveToc(targetId) {
  state.tocLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.target === targetId);
  });
}

function updateTocActive() {
  if (!state.tocHeadings.length) return;
  let currentId = state.tocHeadings[0].id;
  for (const heading of state.tocHeadings) {
    if (heading.getBoundingClientRect().top <= 140) {
      currentId = heading.id;
    } else {
      break;
    }
  }
  setActiveToc(currentId);
}

function buildToc() {
  if (!tocPanel || !tocNav) return;

  const headings = Array.from(content.querySelectorAll('h1, h2, h3, h4'));
  if (!headings.length) {
    clearToc();
    return;
  }

  const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
  const minLevel = Math.min(...levels);
  const used = new Set();
  const items = headings
    .map((heading, index) => {
      let id = (heading.id || '').trim();
      if (!id) id = `sec-${index + 1}`;
      while (used.has(id)) {
        id = `${id}-${index + 1}`;
      }
      used.add(id);
      heading.id = id;

      const text = (heading.textContent || '').trim() || `Section ${index + 1}`;
      const level = Number(heading.tagName.slice(1));
      const depth = Math.max(0, level - minLevel);
      return `<a href="#" class="toc-level-${depth}" data-target="${escapeHtml(id)}">${escapeHtml(text)}</a>`;
    })
    .join('');

  tocNav.innerHTML = items;
  tocPanel.classList.remove('hidden');

  state.tocHeadings = headings;
  state.tocLinks = Array.from(tocNav.querySelectorAll('a'));
  state.tocLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const targetId = link.dataset.target;
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveToc(targetId);
    });
  });
  updateTocActive();
}

function renderSearchResults(query) {
  const q = query.toLowerCase();
  const nodes = collectNodes(state.root).filter((node) => {
    if (!node.path) return false;
    const haystack = `${node.title || ''} ${node.path || ''}`.toLowerCase();
    return haystack.includes(q);
  });

  pageTitle.textContent = '搜索结果';
  pageMeta.textContent = `关键词: ${query}`;
  document.title = `搜索 ${query} · Ops Docs`;
  clearToc();

  if (!nodes.length) {
    content.innerHTML = wrapWithDocTools(`
      <div class="search-results">
        <p class="search-meta">没有找到匹配的文档：<strong>${escapeHtml(query)}</strong></p>
        <p class="search-empty">试试更短的关键词，或清除搜索。</p>
        <a class="search-clear" href="./">清除搜索</a>
      </div>
    `);
    return;
  }

  const results = nodes
    .map((node) => {
      const label = node.path ? `${node.title} · ${formatPath(node.path)}` : node.title;
      return `<li><a href="${toHash(node.path)}">${escapeHtml(label)}</a></li>`;
    })
    .join('');

  content.innerHTML = wrapWithDocTools(`
    <div class="search-results">
      <p class="search-meta">找到 <strong>${nodes.length}</strong> 条结果：<strong>${escapeHtml(query)}</strong></p>
      <ul>${results}</ul>
      <a class="search-clear" href="./">清除搜索</a>
    </div>
  `);
}

function initializeExpandedDirs() {
  state.expandedDirs.clear();
}

function expandPath(path, nodeType) {
  if (!path) return;
  const isDoc = path.toLowerCase().endsWith('.md');
  const segments = path.split('/').filter(Boolean);
  const dirSegments = isDoc ? segments.slice(0, -1) : segments.slice();
  let current = '';
  dirSegments.forEach((segment) => {
    current = current ? `${current}/${segment}` : segment;
    state.expandedDirs.add(current);
  });
  if (!isDoc && nodeType === 'dir') {
    state.expandedDirs.add(path);
  }
}

function buildNode(node) {
  const li = document.createElement('li');
  li.className = `tree-item ${node.type === 'dir' ? 'tree-dir' : 'tree-doc'}`;
  li.dataset.path = node.path || '';

  if (node.type === 'dir') {
    const row = document.createElement('div');
    row.className = 'tree-row';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tree-toggle';
    toggle.textContent = '▾';
    toggle.setAttribute('aria-label', `折叠或展开 ${node.title || node.path || '目录'}`);

    const link = document.createElement('a');
    link.href = toHash(node.path || '');
    link.dataset.path = node.path || '';
    link.textContent = node.title || node.path || '文档';

    row.appendChild(toggle);
    row.appendChild(link);
    li.appendChild(row);

    const children = document.createElement('ul');
    if (node.children && node.children.length) {
      node.children.forEach((child) => children.appendChild(buildNode(child)));
    }
    li.appendChild(children);

    const expanded = state.expandedDirs.has(node.path || '');
    li.classList.toggle('collapsed', !expanded);
    toggle.setAttribute('aria-expanded', String(expanded));

    if (!node.children || !node.children.length) {
      toggle.disabled = true;
      toggle.style.visibility = 'hidden';
    } else {
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willExpand = li.classList.contains('collapsed');
        li.classList.toggle('collapsed', !willExpand);
        toggle.setAttribute('aria-expanded', String(willExpand));
        if (willExpand) {
          state.expandedDirs.add(node.path || '');
        } else {
          state.expandedDirs.delete(node.path || '');
        }
      });
    }

    return li;
  }

  const link = document.createElement('a');
  link.href = toHash(node.path || '');
  link.dataset.path = node.path || '';
  link.textContent = node.title || node.path || '文档';
  li.appendChild(link);
  return li;
}

function getSelfLink(li) {
  return li.querySelector(':scope > .tree-row > a') || li.querySelector(':scope > a');
}

function applyNavFilter(query) {
  const q = (query || '').trim().toLowerCase();
  const rootList = nav.querySelector('ul');
  if (!rootList) return;

  if (!q) {
    nav.querySelectorAll('.tree-item').forEach((item) => item.classList.remove('filtered-out'));
    nav.querySelectorAll('.tree-item.tree-dir').forEach((item) => {
      const path = item.dataset.path || '';
      const expanded = state.expandedDirs.has(path);
      item.classList.toggle('collapsed', !expanded);
      const toggle = item.querySelector(':scope > .tree-row > .tree-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
    });
    return;
  }

  function walk(li) {
    const link = getSelfLink(li);
    const title = (link ? link.textContent : '').toLowerCase();
    const childList = li.querySelector(':scope > ul');

    let childMatched = false;
    if (childList) {
      Array.from(childList.children).forEach((child) => {
        if (walk(child)) childMatched = true;
      });
    }

    const selfMatched = title.includes(q);
    const visible = selfMatched || childMatched;
    li.classList.toggle('filtered-out', !visible);
    if (childMatched && li.classList.contains('tree-dir')) {
      li.classList.remove('collapsed');
    }
    return visible;
  }

  Array.from(rootList.children).forEach((child) => {
    walk(child);
  });
}

function renderNav(root) {
  nav.innerHTML = '';
  const list = document.createElement('ul');

  const rootItem = document.createElement('li');
  const rootLink = document.createElement('a');
  rootLink.href = '#/';
  rootLink.dataset.path = '';
  rootLink.textContent = root.title || '文档主页';
  rootItem.appendChild(rootLink);
  list.appendChild(rootItem);

  if (root.children && root.children.length) {
    root.children.forEach((child) => list.appendChild(buildNode(child)));
  }

  nav.appendChild(list);
  applyNavFilter(navFilter ? navFilter.value : '');
}

function expandDirNode(path) {
  if (!path) return;
  const safePath = window.CSS && window.CSS.escape ? window.CSS.escape(path) : path.replace(/"/g, '\\"');
  const dirNode = nav.querySelector(`.tree-item.tree-dir[data-path="${safePath}"]`);
  if (!dirNode) return;

  dirNode.classList.remove('collapsed');
  const toggle = dirNode.querySelector(':scope > .tree-row > .tree-toggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'true');
  }
  state.expandedDirs.add(path);
}

function ensurePathExpandedInNav(path, nodeType) {
  if (!path) return;
  const isDoc = path.toLowerCase().endsWith('.md');
  const segments = path.split('/').filter(Boolean);
  const dirSegments = isDoc ? segments.slice(0, -1) : segments.slice();
  let current = '';
  dirSegments.forEach((segment) => {
    current = current ? `${current}/${segment}` : segment;
    expandDirNode(current);
  });
  if (!isDoc && nodeType === 'dir') {
    expandDirNode(path);
  }
}

function updateActive(path) {
  nav.querySelectorAll('a').forEach((link) => {
    const isActive = (link.dataset.path || '') === path;
    link.classList.toggle('active', isActive);
  });
}

function formatPath(path) {
  if (!path) return '根目录';
  return path
    .split('/')
    .map((segment) => segment.replace(/^\s*\d+\s*[、，.\-_:：]\s*/, '').trim() || segment)
    .join(' / ');
}

function splitPathAndTail(target) {
  const qIndex = target.indexOf('?');
  const hIndex = target.indexOf('#');

  let cut = target.length;
  if (qIndex >= 0) cut = Math.min(cut, qIndex);
  if (hIndex >= 0) cut = Math.min(cut, hIndex);

  return {
    path: target.slice(0, cut),
    tail: target.slice(cut),
  };
}

function joinNormalizedPath(parts) {
  const stack = [];
  parts.forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') {
      if (stack.length) stack.pop();
      return;
    }
    stack.push(part);
  });
  return stack.join('/');
}

function resolveRelativePath(baseDir, target) {
  if (!target) return null;
  if (
    target.startsWith('#') ||
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('tel:') ||
    target.startsWith('//') ||
    target.startsWith('data:') ||
    target.startsWith('/')
  ) {
    return null;
  }

  const { path, tail } = splitPathAndTail(target);
  const baseParts = baseDir ? baseDir.split('/') : [];
  const targetParts = path.split('/');
  const normalized = joinNormalizedPath([...baseParts, ...targetParts]);
  return { path: normalized, tail };
}

function rewriteRelativeLinks(baseFile) {
  const baseDir = baseFile.includes('/') ? baseFile.slice(0, baseFile.lastIndexOf('/')) : '';

  document.querySelectorAll('#content a[href]').forEach((anchor) => {
    const rawHref = anchor.getAttribute('href') || '';
    const resolved = resolveRelativePath(baseDir, rawHref);
    if (!resolved) return;

    if (resolved.path.toLowerCase().endsWith('.md')) {
      anchor.setAttribute('href', toHash(resolved.path));
    } else {
      anchor.setAttribute('href', `${encodeURI(resolved.path)}${resolved.tail}`);
    }
  });

  document.querySelectorAll('#content img[src]').forEach((img) => {
    const rawSrc = img.getAttribute('src') || '';
    const resolved = resolveRelativePath(baseDir, rawSrc);
    if (!resolved) return;
    img.setAttribute('src', `${encodeURI(resolved.path)}${resolved.tail}`);
  });
}

function renderDirectoryListing(node) {
  const dirs = (node.children || []).filter((child) => child.type === 'dir');
  const docs = (node.children || []).filter((child) => child.type !== 'dir');
  const entries = [...dirs, ...docs]
    .map((child) => {
      const badge = child.type === 'dir' ? '目录' : '文档';
      return `<li><a href="${toHash(child.path)}"><span>${escapeHtml(child.title || child.path)}</span><small>${badge}</small></a></li>`;
    })
    .join('');

  content.innerHTML = wrapWithDocTools(`
    <h2>${escapeHtml(node.title || '目录')}</h2>
    <p>当前目录没有 README.md，已自动显示子目录与文档列表。</p>
    <ul class="directory-list">${entries || '<li>暂无内容</li>'}</ul>
  `);
  clearToc();
}

async function fetchMarkdown(file) {
  const response = await fetch(file, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.text();
}

async function fetchManifest() {
  const candidates = [
    'manifest.json',
    './manifest.json',
    `${location.pathname.replace(/\/[^/]*$/, '/') || './'}manifest.json`,
    '/docs/docs/manifest.json',
    '/docs/manifest.json'
  ];
  const tried = [];

  for (const url of [...new Set(candidates)]) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      tried.push(`${url} (${response.status})`);
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      tried.push(`${url} (failed)`);
    }
  }

  throw new Error(`manifest.json not found: ${tried.join(', ')}`);
}

async function loadNode(node, path) {
  const file = (node && node.file) || (path && path.toLowerCase().endsWith('.md') ? path : null);

  if (file) {
    const markdown = await fetchMarkdown(file);
    if (!markdown) {
      clearToc();
      content.innerHTML = wrapWithDocTools(`<h2>未找到文档</h2><p>路径 <code>${escapeHtml(file)}</code> 不存在。</p>`);
      return;
    }

    content.innerHTML = wrapWithDocTools(marked.parse(markdown));
    rewriteRelativeLinks(file);
    buildToc();
    if (window.hljs) {
      document.querySelectorAll('pre code').forEach((block) => window.hljs.highlightElement(block));
    }
    enhanceCodeBlocks();
    return;
  }

  if (node && node.type === 'dir') {
    renderDirectoryListing(node);
    return;
  }

  clearToc();
  content.innerHTML = wrapWithDocTools('<h2>未找到文档</h2><p>请从左侧目录重新选择页面。</p>');
}

async function route() {
  const path = normalizePath(location.hash);
  const query = getSearchQuery();

  // Allow markdown in-page anchors like #section-title without hijacking routing.
  if (path === null) {
    return;
  }

  if (!path && query) {
    state.currentPath = '';
    updateActive('');
    renderSearchResults(query);
    return;
  }

  let node = state.nodes.get(path || '');

  if (!node && path && path.toLowerCase().endsWith('.md')) {
    const fallbackTitle = path.split('/').pop().replace(/\.md$/i, '');
    node = { type: 'doc', title: fallbackTitle, path, file: path, children: [] };
  }

  if (!node) {
    clearToc();
    pageTitle.textContent = '未找到文档';
    pageMeta.textContent = formatPath(path);
    document.title = '未找到文档 · Ops Docs';
    state.currentPath = '';
    updateActive('');
    content.innerHTML = wrapWithDocTools(`<h2>未找到文档</h2><p>路径 <code>${escapeHtml(path)}</code> 不存在。</p>`);
    return;
  }

  state.currentPath = node.path || '';
  expandPath(state.currentPath, node.type);
  ensurePathExpandedInNav(state.currentPath, node.type);
  updateActive(state.currentPath);

  pageTitle.textContent = node.title || '文档';
  pageMeta.textContent = formatPath(node.path || path);
  document.title = `${node.title || '文档'} · Ops Docs`;
  await loadNode(node, path);

}

async function init() {
  try {
    const data = await fetchManifest();
    state.root = data.root;
    state.nodes.clear();
    indexTree(state.root);
    initializeExpandedDirs();
    renderNav(state.root);

    if (buildMeta && data.generatedAt) {
      buildMeta.textContent = `索引生成于 ${data.generatedAt}`;
    }

    await route();
  } catch (error) {
    clearToc();
    const message = error && error.message ? error.message : 'manifest.json 加载失败';
    content.innerHTML = wrapWithDocTools(`<h2>无法加载目录索引</h2><p>请检查 manifest.json 是否生成，或确认当前访问路径正确。</p><p><code>${escapeHtml(message)}</code></p>`);
  }
}

if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    if (isDesktop()) {
      setDesktopCollapsed(!isDesktopCollapsed());
    } else {
      sidebar.classList.toggle('open');
    }
  });
}

if (sidebarPinToggle) {
  sidebarPinToggle.addEventListener('click', () => {
    if (!isDesktop()) return;
    setDesktopCollapsed(!isDesktopCollapsed());
  });
}

if (navFilter) {
  navFilter.addEventListener('input', () => {
    applyNavFilter(navFilter.value);
  });
}

window.addEventListener(
  'scroll',
  () => {
    if (!state.tocHeadings.length) return;
    if (tocRaf) return;
    tocRaf = window.requestAnimationFrame(() => {
      updateTocActive();
      tocRaf = 0;
    });
  },
  { passive: true }
);

window.addEventListener('resize', () => {
  if (isDesktop()) {
    sidebar.classList.remove('open');
  }
  updateSidebarToggleLabel();
});

window.addEventListener('hashchange', route);
restoreSidebarPreference();
updateSidebarToggleLabel();
init();
