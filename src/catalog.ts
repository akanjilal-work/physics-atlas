import type { Domain, DomainId, Topic, TopicMeta } from './core/types.ts';

export const DOMAINS: Domain[] = [
  {
    id: 'classical',
    name: 'Classical Mechanics',
    blurb: 'Newton’s laws are simple. What they produce is not.',
    accentVar: '--c-classical',
  },
  {
    id: 'em',
    name: 'Electromagnetism & Light',
    blurb: 'Four equations, and every colour, compass and radio wave follows.',
    accentVar: '--c-em',
  },
  {
    id: 'thermo',
    name: 'Thermo & Statistical',
    blurb: 'Countless random molecules, and laws that never bend.',
    accentVar: '--c-thermo',
  },
  {
    id: 'relativity',
    name: 'Relativity',
    blurb: 'Space and time are one fabric, and mass bends it.',
    accentVar: '--c-relativity',
  },
  {
    id: 'quantum',
    name: 'Quantum Mechanics',
    blurb: 'Nature runs on amplitudes, not certainties.',
    accentVar: '--c-quantum',
  },
  {
    id: 'string',
    name: 'String Theory',
    blurb: 'A candidate framework where particles are notes on a string.',
    accentVar: '--c-string',
  },
];

export const domainOf = (id: DomainId): Domain => DOMAINS.find((d) => d.id === id)!;

/** Every tile in the atlas. `live` tiles have a module in LOADERS. */
export const CATALOG: TopicMeta[] = [
  // Classical
  { id: 'double-pendulum', number: 1, title: 'Chaos & the Double Pendulum', domain: 'classical', level: 1, status: 'live', tagline: 'Two linked rods, perfectly deterministic, and still impossible to predict.' },
  { id: 'tennis-racket', number: 2, title: 'The Tennis Racket Effect', domain: 'classical', level: 2, status: 'live', tagline: 'Why a spinning object flips over when you spin it about its middle axis.' },
  { id: 'three-body', number: 3, title: 'The Three-Body Problem', domain: 'classical', level: 2, status: 'live', tagline: 'Two bodies orbit forever. Add a third and all bets are off.' },
  { id: 'lagrange-points', number: 4, title: 'Lagrange Points', domain: 'classical', level: 2, status: 'live', tagline: 'The five parking spots where gravity and orbit balance.' },
  { id: 'normal-modes', number: 5, title: 'Normal Modes', domain: 'classical', level: 1, status: 'live', tagline: 'Every vibration is a chord of simpler pure tones.' },
  { id: 'gyroscope', number: 6, title: 'Gyroscopic Precession', domain: 'classical', level: 2, status: 'live', tagline: 'Push down on a spinning wheel and it turns sideways.' },
  { id: 'foucault-pendulum', number: 22, title: 'The Foucault Pendulum', domain: 'classical', level: 2, status: 'live', tagline: 'A swinging weight that proves the Earth turns.' },
  // Electromagnetism & Light
  { id: 'em-waves', number: 28, title: 'Electromagnetic Waves', domain: 'em', level: 2, status: 'live', tagline: 'A shaking charge sends out light that carries itself through empty space.' },
  { id: 'magnetic-fields', number: 29, title: 'Charges in Magnetic Fields', domain: 'em', level: 2, status: 'live', tagline: 'Spirals, mirrors and the northern lights.' },
  { id: 'rainbows', number: 30, title: 'How a Rainbow Works', domain: 'em', level: 1, status: 'live', tagline: 'One raindrop, one bounce, and a 42 degree circle in the sky.' },
  // Thermo & Statistical
  { id: 'ising-model', number: 31, title: 'Phase Transitions & the Ising Model', domain: 'thermo', level: 2, status: 'live', tagline: 'Billions of tiny magnets decide together, all at once.' },
  { id: 'maxwells-demon', number: 32, title: 'Entropy & Maxwell\u2019s Demon', domain: 'thermo', level: 2, status: 'live', tagline: 'Why heat flows one way, and what it costs to cheat.' },
  { id: 'brownian-motion', number: 33, title: 'Brownian Motion', domain: 'thermo', level: 1, status: 'live', tagline: 'A jittering pollen grain that proved atoms are real.' },
  // Relativity
  { id: 'special-relativity', number: 7, title: 'Special Relativity', domain: 'relativity', level: 2, status: 'live', tagline: 'Moving clocks tick slower, and “now” depends on who is asking.' },
  { id: 'curved-spacetime', number: 8, title: 'Curved Spacetime & Orbits', domain: 'relativity', level: 3, status: 'live', tagline: 'Gravity is not a force. It is the shape of spacetime.' },
  { id: 'twin-paradox', number: 9, title: 'The Twin Paradox', domain: 'relativity', level: 2, status: 'live', tagline: 'Why the travelling twin comes home younger.' },
  { id: 'black-hole-lensing', number: 10, title: 'Black Hole Lensing', domain: 'relativity', level: 3, status: 'live', tagline: 'Light rays that loop around a black hole before reaching you.' },
  { id: 'gravitational-waves', number: 11, title: 'Gravitational Waves', domain: 'relativity', level: 3, status: 'live', tagline: 'Ripples that stretch and squeeze space itself.' },
  { id: 'kerr-black-hole', number: 23, title: 'Spinning Black Holes', domain: 'relativity', level: 3, status: 'live', tagline: 'A rotating mass drags space around with it.' },
  { id: 'cosmic-expansion', number: 24, title: 'The Expanding Universe', domain: 'relativity', level: 2, status: 'live', tagline: 'Galaxies are not flying apart. Space between them is growing.' },
  // Quantum
  { id: 'quantum-tunneling', number: 12, title: 'Quantum Tunneling', domain: 'quantum', level: 2, status: 'live', tagline: 'A particle passes through a wall it does not have the energy to climb.' },
  { id: 'hydrogen-orbitals', number: 13, title: 'Hydrogen Orbitals', domain: 'quantum', level: 2, status: 'live', tagline: 'The electron is a standing wave, not a tiny planet.' },
  { id: 'double-slit', number: 14, title: 'The Double Slit', domain: 'quantum', level: 1, status: 'live', tagline: 'One particle, two paths, and an interference pattern.' },
  { id: 'spin-bloch', number: 15, title: 'Spin & the Bloch Sphere', domain: 'quantum', level: 2, status: 'live', tagline: 'A qubit is a point on a sphere.' },
  { id: 'entanglement', number: 16, title: 'Entanglement & Bell', domain: 'quantum', level: 3, status: 'live', tagline: 'Correlations no local hidden story can explain.' },
  { id: 'uncertainty', number: 17, title: 'The Uncertainty Principle', domain: 'quantum', level: 1, status: 'live', tagline: 'Squeeze a wave in space and it spreads in momentum.' },
  { id: 'quantum-oscillator', number: 25, title: 'The Quantum Oscillator', domain: 'quantum', level: 2, status: 'live', tagline: 'Energy comes in steps, and even the ground state jitters.' },
  { id: 'grover-search', number: 26, title: 'Qubits & Grover Search', domain: 'quantum', level: 2, status: 'live', tagline: 'Find a needle in N haystacks in about the square root of N looks.' },
  // String theory
  { id: 'vibrating-strings', number: 18, title: 'Strings & Extra Dimensions', domain: 'string', level: 3, status: 'live', tagline: 'Particles as vibration modes, and dimensions curled too small to see.' },
  { id: 'calabi-yau', number: 19, title: 'Calabi–Yau Shapes', domain: 'string', level: 3, status: 'live', tagline: 'The hidden geometry that would set the laws of physics.' },
  { id: 'branes', number: 20, title: 'D-Branes', domain: 'string', level: 3, status: 'live', tagline: 'Surfaces where open strings end.' },
  { id: 'holography', number: 21, title: 'Holography', domain: 'string', level: 3, status: 'live', tagline: 'A universe described by its boundary.' },
  { id: 'cosmic-strings', number: 27, title: 'Cosmic Strings', domain: 'string', level: 3, status: 'live', tagline: 'Thin cracks in space that could double the sky behind them.' },
];

type Loader = () => Promise<{ default: Topic }>;

export const LOADERS: Record<string, Loader> = {
  'double-pendulum': () => import('./topics/double-pendulum/index.ts'),
  'tennis-racket': () => import('./topics/tennis-racket/index.ts'),
  'special-relativity': () => import('./topics/special-relativity/index.ts'),
  'curved-spacetime': () => import('./topics/curved-spacetime/index.ts'),
  'quantum-tunneling': () => import('./topics/quantum-tunneling/index.ts'),
  'vibrating-strings': () => import('./topics/vibrating-strings/index.ts'),
  'three-body': () => import('./topics/three-body/index.ts'),
  'twin-paradox': () => import('./topics/twin-paradox/index.ts'),
  'hydrogen-orbitals': () => import('./topics/hydrogen-orbitals/index.ts'),
  'double-slit': () => import('./topics/double-slit/index.ts'),
  'calabi-yau': () => import('./topics/calabi-yau/index.ts'),
  'branes': () => import('./topics/branes/index.ts'),
  'lagrange-points': () => import('./topics/lagrange-points/index.ts'),
  'normal-modes': () => import('./topics/normal-modes/index.ts'),
  'gyroscope': () => import('./topics/gyroscope/index.ts'),
  'black-hole-lensing': () => import('./topics/black-hole-lensing/index.ts'),
  'gravitational-waves': () => import('./topics/gravitational-waves/index.ts'),
  'spin-bloch': () => import('./topics/spin-bloch/index.ts'),
  'entanglement': () => import('./topics/entanglement/index.ts'),
  'uncertainty': () => import('./topics/uncertainty/index.ts'),
  'holography': () => import('./topics/holography/index.ts'),
  'foucault-pendulum': () => import('./topics/foucault-pendulum/index.ts'),
  'kerr-black-hole': () => import('./topics/kerr-black-hole/index.ts'),
  'cosmic-expansion': () => import('./topics/cosmic-expansion/index.ts'),
  'quantum-oscillator': () => import('./topics/quantum-oscillator/index.ts'),
  'grover-search': () => import('./topics/grover-search/index.ts'),
  'cosmic-strings': () => import('./topics/cosmic-strings/index.ts'),
  'em-waves': () => import('./topics/em-waves/index.ts'),
  'magnetic-fields': () => import('./topics/magnetic-fields/index.ts'),
  'rainbows': () => import('./topics/rainbows/index.ts'),
  'ising-model': () => import('./topics/ising-model/index.ts'),
  'maxwells-demon': () => import('./topics/maxwells-demon/index.ts'),
  'brownian-motion': () => import('./topics/brownian-motion/index.ts'),
};
