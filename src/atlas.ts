import { CATALOG, DOMAINS } from './catalog.ts';
import { getDone } from './core/progress.ts';
import { topicIcon } from './core/icons.ts';

const LAYERS = [
  { n: '1', name: 'Intuition', text: 'A live 3D scene and a plain-language story. No equations needed.' },
  { n: '2', name: 'The Physics', text: 'The key equation, with every term tied to a slider you can move.' },
  { n: '3', name: 'Deep Dive', text: 'Derivations, edge cases, history, and the honest limits of the model.' },
  { n: '4', name: 'Try It', text: 'Challenges the simulation checks for you as you experiment.' },
];

const dots = (n: number) =>
  `<span class="dots" aria-label="Difficulty ${n} of 3">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;

export function renderAtlas(root: HTMLElement): void {
  const live = CATALOG.filter((t) => t.status === 'live').length;
  root.innerHTML = `
    <section class="hero">
      <p class="eyebrow">A learning project</p>
      <h1>A notebook of Physics ideas.</h1>
      <p class="lede">I built this atlas to bring together the concepts in physics I find very interesting. To put a disclaimer, none of this is my original research. Each topic here is taken from some textbooks, published papers, lecture notes and other people's excellent explanations, which I have tried to condense into one place and simplify. Building a small model you can play with turned out to be the best way I know to learn these ideas.</p>
      <p class="lede" style="margin-top: 14px">Each tile covers one concept. Explore the 3D scene, change the parameters, and see the physics react. Intuition comes first, and the deeper math is one tab away. Sources are listed at the end of every topic.</p>
      <div class="hero-stats"><span><b>${live}</b> live topics</span>${CATALOG.length - live > 0 ? `<span><b>${CATALOG.length - live}</b> on the roadmap</span>` : `<span><b>${DOMAINS.length}</b> fields of physics</span>`}<span><b>4</b> layers per topic</span></div>
    </section>

    <section class="table" aria-label="Topics">
      ${DOMAINS.map(
        (d) => `
        <div class="domain-row" style="--accent: var(${d.accentVar})">
          <div class="domain-head">
            <h2>${d.name}</h2>
            <p>${d.blurb}</p>
          </div>
          <div class="tiles">
            ${CATALOG.filter((t) => t.domain === d.id)
              .map((t) => {
                const done = t.status === 'live' ? getDone(t.id).size : 0;
                const inner = `
                  <span class="tile-num">${t.number}</span>
                  ${dots(t.level)}
                  ${topicIcon(t.id)}
                  <span class="tile-name">${t.title}</span>
                  ${t.status === 'soon' ? '<span class="tile-flag">soon</span>' : done ? `<span class="tile-flag done">${done} solved</span>` : ''}
                  <span class="tile-tip">${t.tagline}</span>`;
                return t.status === 'live'
                  ? `<a class="tile live" href="#/t/${t.id}">${inner}</a>`
                  : `<div class="tile soon" tabindex="0" aria-disabled="true">${inner}</div>`;
              })
              .join('')}
          </div>
        </div>`,
      ).join('')}
    </section>

    <section class="how">
      <h2>How every topic page works</h2>
      <div class="how-grid">
        ${LAYERS.map((l) => `<div class="how-card"><span class="how-n">${l.n}</span><h3>${l.name}</h3><p>${l.text}</p></div>`).join('')}
      </div>
    </section>
  `;
}
