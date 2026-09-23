import { CATALOG, LOADERS, domainOf } from './catalog.ts';
import { getDone, markDone, resetDone } from './core/progress.ts';
import { renderMath, tex } from './core/tex.ts';
import type { Topic, TopicInstance } from './core/types.ts';
import { topicIcon } from './core/icons.ts';

const TABS = [
  { id: 'intuition', label: 'Intuition' },
  { id: 'physics', label: 'The Physics' },
  { id: 'deep', label: 'Deep Dive' },
  { id: 'try', label: 'Try It' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export interface MountedPage {
  dispose(): void;
}

export async function renderTopic(root: HTMLElement, id: string, tab: TabId | null): Promise<MountedPage> {
  const meta = CATALOG.find((t) => t.id === id);
  const loader = LOADERS[id];
  if (!meta || !loader) {
    root.innerHTML = `<section class="missing"><h1>Not on the map yet</h1><p>That topic is still on the roadmap.</p><a class="btn primary" href="#/">Back to the atlas</a></section>`;
    return { dispose() {} };
  }
  const domain = domainOf(meta.domain);
  root.innerHTML = `<div class="loading">Loading ${meta.title}…</div>`;
  const topic: Topic = (await loader()).default;
  const c = topic.content;

  const liveIds = CATALOG.filter((t) => t.status === 'live');
  const idx = liveIds.findIndex((t) => t.id === id);
  const prev = liveIds[(idx - 1 + liveIds.length) % liveIds.length];
  const next = liveIds[(idx + 1) % liveIds.length];

  root.innerHTML = `
  <article class="topic" style="--accent: var(${domain.accentVar})">
    <header class="topic-head">
      <a class="crumb" href="#/">← Atlas</a>
      <div class="topic-title">
        <div class="mini-tile"><span>${topic.number}</span>${topicIcon(topic.id, 'mini-icon')}</div>
        <div>
          <p class="eyebrow">${domain.name}</p>
          <h1>${topic.title}</h1>
          <p class="tagline">${topic.tagline}</p>
        </div>
      </div>
    </header>

    <div class="topic-grid">
      <div class="stage-col">
        <div class="viewport" aria-label="Interactive 3D scene. Drag to orbit, scroll to zoom."><span class="orbit-hint">Drag to orbit · scroll to zoom</span></div>
        <div class="panel-host"></div>
      </div>

      <div class="layers-col">
        <nav class="tabs" role="tablist">
          ${TABS.map((t, i) => `<button role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-controls="pane-${t.id}"><span class="tab-n">${i + 1}</span>${t.label}</button>`).join('')}
        </nav>

        <section class="pane prose" id="pane-intuition" role="tabpanel" aria-labelledby="tab-intuition">
          ${renderMath(c.intuition)}
          <div class="try-first">
            <h3>Try this first</h3>
            <ol>${c.tryFirst.map((s) => `<li>${renderMath(s)}</li>`).join('')}</ol>
          </div>
        </section>

        <section class="pane prose" id="pane-physics" role="tabpanel" aria-labelledby="tab-physics">
          <div class="equation">${tex(c.equation.tex, true)}</div>
          <p class="eq-caption">${renderMath(c.equation.caption)}</p>
          <p class="hint-line">Hover or tap a term to light up the control that drives it.</p>
          <div class="terms">
            ${c.equation.terms
              .map(
                (t) => `<button type="button" class="term" ${t.param ? `data-param="${t.param}"` : ''}>
                  <span class="term-tex">${tex(t.tex)}</span>
                  <span class="term-body"><b>${t.name}</b><span>${renderMath(t.meaning)}</span></span>
                </button>`,
              )
              .join('')}
          </div>
          <div class="physics-notes">${renderMath(c.physicsNotes)}</div>
        </section>

        <section class="pane prose" id="pane-deep" role="tabpanel" aria-labelledby="tab-deep">
          ${c.deep
            .map(
              (s, i) => `<details class="deep" ${i === 0 ? 'open' : ''}><summary>${s.title}</summary><div class="deep-body">${renderMath(s.html)}</div></details>`,
            )
            .join('')}
          <div class="caveat"><h3>What this model leaves out</h3>${renderMath(c.caveats)}</div>
          <div class="further"><h3>Sources and further reading</h3><ul>${c.further.map((f) => `<li><a href="${f.url}" target="_blank" rel="noopener">${f.label}</a></li>`).join('')}</ul></div>
        </section>

        <section class="pane" id="pane-try" role="tabpanel" aria-labelledby="tab-try">
          <div class="try-head"><p>The simulation watches for these once you start changing things. Solve them in any order.</p><button type="button" class="linkish" id="reset-progress">Reset progress</button></div>
          <div class="challenges">
            ${c.challenges
              .map(
                (ch, i) => `<div class="challenge" data-ch="${ch.id}">
                  <div class="ch-status" aria-hidden="true">${i + 1}</div>
                  <div class="ch-body">
                    <h3>${ch.title}</h3>
                    <p>${renderMath(ch.prompt)}</p>
                    <details><summary>Hint</summary><p>${renderMath(ch.hint)}</p></details>
                  </div>
                </div>`,
              )
              .join('')}
          </div>
        </section>
      </div>
    </div>

    <nav class="topic-foot">
      <a href="#/t/${prev.id}"><span>← Previous</span><b>${prev.title}</b></a>
      <a href="#/t/${next.id}" class="next"><span>Next →</span><b>${next.title}</b></a>
    </nav>
  </article>`;

  const viewport = root.querySelector<HTMLElement>('.viewport')!;
  const panelHost = root.querySelector<HTMLElement>('.panel-host')!;
  let inst: TopicInstance | null = null;
  try {
    inst = topic.mount({ viewport, panel: panelHost });
  } catch (err) {
    console.error(err);
    viewport.innerHTML = `<div class="gl-error">This scene needs WebGL. Try a recent desktop browser.</div>`;
  }

  // Tabs
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const panes = [...root.querySelectorAll<HTMLElement>('.pane')];
  const select = (tid: TabId, updateHash = true) => {
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tid)));
    panes.forEach((p) => (p.hidden = p.id !== `pane-${tid}`));
    if (updateHash) history.replaceState(null, '', `#/t/${id}/${tid}`);
  };
  tabs.forEach((b) => b.addEventListener('click', () => select(b.dataset.tab as TabId)));
  select(tab ?? 'intuition', false);

  // Term <-> control linking
  const highlight = (param: string | undefined, on: boolean) => {
    if (!param) return;
    panelHost.querySelectorAll<HTMLElement>(`[data-param="${param}"]`).forEach((el) => el.classList.toggle('linked', on));
  };
  root.querySelectorAll<HTMLElement>('.term').forEach((t) => {
    const p = t.dataset.param;
    t.addEventListener('mouseenter', () => highlight(p, true));
    t.addEventListener('mouseleave', () => highlight(p, false));
    t.addEventListener('focus', () => highlight(p, true));
    t.addEventListener('blur', () => highlight(p, false));
    t.addEventListener('click', () => {
      if (!p) return;
      const el = panelHost.querySelector<HTMLElement>(`[data-param="${p}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
      el.querySelector<HTMLElement>('input,button')?.focus({ preventScroll: true });
    });
  });

  // Challenges
  const done = getDone(id);
  const paint = () =>
    root.querySelectorAll<HTMLElement>('.challenge').forEach((el) => {
      const ok = done.has(el.dataset.ch!);
      el.classList.toggle('solved', ok);
      el.querySelector('.ch-status')!.textContent = ok ? '✓' : String([...el.parentElement!.children].indexOf(el) + 1);
    });
  paint();
  root.querySelector('#reset-progress')?.addEventListener('click', () => {
    resetDone(id);
    done.clear();
    paint();
  });
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  let toastTimer = 0;
  // Challenges only count once the reader has touched the controls or the scene,
  // so a default demo state never solves one on page load.
  let armed = false;
  const arm = () => (armed = true);
  panelHost.addEventListener('pointerdown', arm);
  panelHost.addEventListener('keydown', arm);
  viewport.addEventListener('pointerdown', arm);
  const poll = window.setInterval(() => {
    if (!inst || !armed) return;
    let s;
    try {
      s = inst.state();
    } catch {
      return;
    }
    for (const ch of c.challenges) {
      if (done.has(ch.id)) continue;
      let ok = false;
      try {
        ok = ch.check(s);
      } catch {
        ok = false;
      }
      if (ok) {
        done.add(ch.id);
        markDone(id, ch.id);
        paint();
        toast.textContent = `Challenge solved: ${ch.title}`;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3200);
      }
    }
  }, 250);

  return {
    dispose() {
      clearInterval(poll);
      clearTimeout(toastTimer);
      toast.remove();
      inst?.dispose();
    },
  };
}
