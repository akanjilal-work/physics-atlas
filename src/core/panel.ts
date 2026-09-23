// Declarative control panel. Every row carries data-param so equation terms
// in Layer 2 can highlight the control that drives them.

export interface SliderSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  /** Display formatter for the current value. */
  format?: (v: number) => string;
  onInput: (v: number) => void;
}

export interface ToggleSpec {
  key: string;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export interface SelectSpec<T extends string> {
  key: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export interface ButtonSpec {
  label: string;
  onClick: () => void;
  primary?: boolean;
  key?: string;
}

export interface Control<T> {
  get(): T;
  set(v: T, emit?: boolean): void;
  el: HTMLElement;
}

const fmtDefault = (v: number) => {
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.01 || a >= 1e4)) return v.toExponential(1);
  return Number.isInteger(v) ? String(v) : v.toFixed(a < 1 ? 3 : 2);
};

export class Panel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private readoutGrid: HTMLElement | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'panel';
    this.body = this.root;
    host.appendChild(this.root);
  }

  section(title: string): this {
    const s = document.createElement('div');
    s.className = 'panel-section';
    const h = document.createElement('div');
    h.className = 'panel-title';
    h.textContent = title;
    s.appendChild(h);
    this.root.appendChild(s);
    this.body = s;
    this.readoutGrid = null;
    return this;
  }

  slider(spec: SliderSpec): Control<number> {
    const row = this.row(spec.key);
    const top = document.createElement('div');
    top.className = 'ctl-top';
    const lab = document.createElement('label');
    lab.textContent = spec.label;
    const val = document.createElement('span');
    val.className = 'ctl-val';
    top.append(lab, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step ?? (spec.max - spec.min) / 200);
    input.value = String(spec.value);
    input.id = `ctl-${spec.key}`;
    input.setAttribute('aria-label', spec.label);
    lab.htmlFor = input.id;
    const fmt = spec.format ?? fmtDefault;
    const show = (v: number) => {
      val.textContent = `${fmt(v)}${spec.unit ? ` ${spec.unit}` : ''}`;
      const pct = ((v - spec.min) / (spec.max - spec.min)) * 100;
      input.style.setProperty('--pct', `${pct}%`);
    };
    show(spec.value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      show(v);
      spec.onInput(v);
    });
    row.append(top, input);
    return {
      el: row,
      get: () => Number(input.value),
      set: (v, emit = true) => {
        input.value = String(v);
        show(Number(input.value));
        if (emit) spec.onInput(Number(input.value));
      },
    };
  }

  toggle(spec: ToggleSpec): Control<boolean> {
    const row = this.row(spec.key);
    row.classList.add('ctl-toggle');
    const lab = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = spec.value;
    const sw = document.createElement('span');
    sw.className = 'switch';
    const txt = document.createElement('span');
    txt.textContent = spec.label;
    lab.append(input, sw, txt);
    input.addEventListener('change', () => spec.onChange(input.checked));
    row.appendChild(lab);
    return {
      el: row,
      get: () => input.checked,
      set: (v, emit = true) => {
        input.checked = v;
        if (emit) spec.onChange(v);
      },
    };
  }

  select<T extends string>(spec: SelectSpec<T>): Control<T> {
    const row = this.row(spec.key);
    const seg = document.createElement('div');
    seg.className = 'segmented';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', spec.label);
    const lab = document.createElement('div');
    lab.className = 'ctl-top';
    lab.innerHTML = `<label>${spec.label}</label>`;
    let current = spec.value;
    const btns = spec.options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.label;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => set(o.value, true));
      seg.appendChild(b);
      return { b, v: o.value };
    });
    const paint = () => btns.forEach(({ b, v }) => b.setAttribute('aria-checked', String(v === current)));
    const set = (v: T, emit: boolean) => {
      current = v;
      paint();
      if (emit) spec.onChange(v);
    };
    paint();
    row.append(lab, seg);
    return { el: row, get: () => current, set: (v, emit = true) => set(v, emit) };
  }

  buttons(specs: ButtonSpec[]): HTMLButtonElement[] {
    const row = this.row('');
    row.classList.add('ctl-buttons');
    return specs.map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = s.primary ? 'btn primary' : 'btn';
      b.textContent = s.label;
      if (s.key) b.dataset.param = s.key;
      b.addEventListener('click', s.onClick);
      row.appendChild(b);
      return b;
    });
  }

  /** Numeric readout. Returns a setter. */
  readout(key: string, label: string, unit = ''): (v: number | string) => void {
    if (!this.readoutGrid) {
      this.readoutGrid = document.createElement('div');
      this.readoutGrid.className = 'readouts';
      this.body.appendChild(this.readoutGrid);
    }
    const cell = document.createElement('div');
    cell.className = 'readout';
    cell.dataset.param = key;
    const l = document.createElement('div');
    l.className = 'readout-label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'readout-val';
    cell.append(l, v);
    this.readoutGrid.appendChild(cell);
    let lastText = '';
    return (x) => {
      const text = `${typeof x === 'number' ? fmtDefault(x) : x}${unit ? ` ${unit}` : ''}`;
      if (text !== lastText) {
        v.textContent = text;
        lastText = text;
      }
    };
  }

  note(html: string): HTMLElement {
    const n = document.createElement('div');
    n.className = 'panel-note';
    n.innerHTML = html;
    this.body.appendChild(n);
    return n;
  }

  /** Small legend of coloured swatches. */
  legend(items: { color: string; label: string }[]): HTMLElement {
    const n = document.createElement('div');
    n.className = 'legend';
    for (const it of items) {
      const s = document.createElement('span');
      s.innerHTML = `<i style="background:${it.color}"></i>${it.label}`;
      n.appendChild(s);
    }
    this.body.appendChild(n);
    return n;
  }

  private row(key: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ctl';
    if (key) row.dataset.param = key;
    this.body.appendChild(row);
    this.readoutGrid = null;
    return row;
  }
}

/** Convert a 0xRRGGBB number into a CSS colour string. */
export const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
