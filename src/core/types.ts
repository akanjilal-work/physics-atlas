// Shared contracts for every topic in the atlas.

export type DomainId = 'classical' | 'em' | 'thermo' | 'relativity' | 'quantum' | 'string';

export interface Domain {
  id: DomainId;
  name: string;
  blurb: string;
  /** CSS custom property holding the domain accent colour. */
  accentVar: string;
}

export interface TopicMeta {
  id: string;
  /** Atlas tile number, periodic-table style. */
  number: number;
  /** Two-letter tile symbol, e.g. "Dp". */
  symbol: string;
  title: string;
  domain: DomainId;
  /** One sentence shown on the tile and in the page header. */
  tagline: string;
  /** 1 = gentle, 2 = moderate, 3 = demanding. */
  level: 1 | 2 | 3;
  status: 'live' | 'soon';
}

/** A term of the headline equation, linked to a control in the 3D panel. */
export interface EquationTerm {
  /** TeX for the term, as it appears in the equation. */
  tex: string;
  /** Short name, e.g. "Lorentz factor". */
  name: string;
  /** Plain-language meaning (may contain $inline tex$). */
  meaning: string;
  /** Key of the control this term is tied to, if any. */
  param?: string;
}

export interface DeepSection {
  title: string;
  /** HTML with $inline$ and $$display$$ TeX. */
  html: string;
}

export interface Challenge {
  id: string;
  title: string;
  prompt: string;
  hint: string;
  /** Receives the live simulation state and returns true when solved. */
  check: (state: SimState) => boolean;
}

export interface TopicContent {
  /** Layer 1: plain-language story. HTML, may contain $tex$. */
  intuition: string;
  /** Short list of "what to try first" instructions for the 3D scene. */
  tryFirst: string[];
  /** Layer 2: the headline equation and its terms. */
  equation: { tex: string; caption: string; terms: EquationTerm[] };
  /** Additional notes under the equation (HTML, may contain $tex$). */
  physicsNotes: string;
  /** Layer 3: derivations, edge cases, history. */
  deep: DeepSection[];
  /** Layer 4: guided challenges checked against the live simulation. */
  challenges: Challenge[];
  /** Honest limits of the model shown. */
  caveats: string;
  further: { label: string; url: string }[];
}

export type SimState = Record<string, number | boolean | string>;

export interface MountContext {
  /** Element that should host the WebGL canvas. */
  viewport: HTMLElement;
  /** Element that should host the control panel (use core/panel.ts). */
  panel: HTMLElement;
}

export interface TopicInstance {
  /** Live state polled for readouts and challenge checks. */
  state(): SimState;
  dispose(): void;
}

export interface Topic extends TopicMeta {
  status: 'live';
  content: TopicContent;
  mount(ctx: MountContext): TopicInstance;
}
