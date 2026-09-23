import './styles.css';
import { renderAtlas } from './atlas.ts';
import { renderTopic, type MountedPage } from './topicPage.ts';

const root = document.getElementById('app')!;
let current: MountedPage | null = null;
let routeToken = 0;

async function route(): Promise<void> {
  const token = ++routeToken;
  current?.dispose();
  current = null;
  const hash = location.hash.replace(/^#\/?/, '');
  const [kind, id, tab] = hash.split('/');
  if (kind === 't' && id) {
    const page = await renderTopic(root, id, (tab as never) ?? null);
    if (token !== routeToken) {
      page.dispose();
      return;
    }
    current = page;
    document.title = `${document.querySelector('.topic-head h1')?.textContent ?? 'Topic'} · Physics Atlas`;
  } else {
    renderAtlas(root);
    document.title = 'Physics Atlas';
  }
}

let lastPath = '';
window.addEventListener('hashchange', () => {
  // Tab switches only rewrite the last segment via replaceState, so a real
  // hashchange means a new page. Scroll to top for page changes.
  const path = location.hash.split('/').slice(0, 3).join('/');
  if (path !== lastPath) window.scrollTo({ top: 0 });
  lastPath = path;
  void route();
});
lastPath = location.hash.split('/').slice(0, 3).join('/');
void route();
