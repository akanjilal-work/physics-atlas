import type { Domain, DomainId, Topic, TopicMeta } from './core/types.ts';

export const DOMAINS: Domain[] = [
  {
    id: 'classical',
    name: 'Classical Mechanics',
    blurb: 'Newton’s laws are simple. What they produce is not.',
    accentVar: '--c-classical',
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
  { id: 'double-pendulum', number: 1, symbol: 'Dp', title: 'Chaos & the Double Pendulum', domain: 'classical', level: 1, status: 'live', tagline: 'Two linked rods, perfectly deterministic, and still impossible to predict.' },
  { id: 'tennis-racket', number: 2, symbol: 'Dz', title: 'The Tennis Racket Effect', domain: 'classical', level: 2, status: 'live', tagline: 'Why a spinning object flips over when you spin it about its middle axis.' },
  { id: 'three-body', number: 3, symbol: 'Tb', title: 'The Three-Body Problem', domain: 'classical', level: 2, status: 'soon', tagline: 'Two bodies orbit forever. Add a third and all bets are off.' },
  { id: 'lagrange-points', number: 4, symbol: 'Lg', title: 'Lagrange Points', domain: 'classical', level: 2, status: 'soon', tagline: 'The five parking spots where gravity and orbit balance.' },
  { id: 'normal-modes', number: 5, symbol: 'Nm', title: 'Normal Modes', domain: 'classical', level: 1, status: 'soon', tagline: 'Every vibration is a chord of simpler pure tones.' },
  { id: 'gyroscope', number: 6, symbol: 'Gy', title: 'Gyroscopic Precession', domain: 'classical', level: 2, status: 'soon', tagline: 'Push down on a spinning wheel and it turns sideways.' },
  // Relativity
  { id: 'special-relativity', number: 7, symbol: 'Sr', title: 'Special Relativity', domain: 'relativity', level: 2, status: 'live', tagline: 'Moving clocks tick slower, and “now” depends on who is asking.' },
  { id: 'curved-spacetime', number: 8, symbol: 'Gr', title: 'Curved Spacetime & Orbits', domain: 'relativity', level: 3, status: 'live', tagline: 'Gravity is not a force. It is the shape of spacetime.' },
  { id: 'twin-paradox', number: 9, symbol: 'Tw', title: 'The Twin Paradox', domain: 'relativity', level: 2, status: 'soon', tagline: 'Why the travelling twin comes home younger.' },
  { id: 'black-hole-lensing', number: 10, symbol: 'Bh', title: 'Black Hole Lensing', domain: 'relativity', level: 3, status: 'soon', tagline: 'Light rays that loop around a black hole before reaching you.' },
  { id: 'gravitational-waves', number: 11, symbol: 'Gw', title: 'Gravitational Waves', domain: 'relativity', level: 3, status: 'soon', tagline: 'Ripples that stretch and squeeze space itself.' },
  // Quantum
  { id: 'quantum-tunneling', number: 12, symbol: 'Qt', title: 'Quantum Tunneling', domain: 'quantum', level: 2, status: 'live', tagline: 'A particle passes through a wall it does not have the energy to climb.' },
  { id: 'hydrogen-orbitals', number: 13, symbol: 'Hy', title: 'Hydrogen Orbitals', domain: 'quantum', level: 2, status: 'soon', tagline: 'The electron is a standing wave, not a tiny planet.' },
  { id: 'double-slit', number: 14, symbol: 'Ds', title: 'The Double Slit', domain: 'quantum', level: 1, status: 'soon', tagline: 'One particle, two paths, and an interference pattern.' },
  { id: 'spin-bloch', number: 15, symbol: 'Bs', title: 'Spin & the Bloch Sphere', domain: 'quantum', level: 2, status: 'soon', tagline: 'A qubit is a point on a sphere.' },
  { id: 'entanglement', number: 16, symbol: 'En', title: 'Entanglement & Bell', domain: 'quantum', level: 3, status: 'soon', tagline: 'Correlations no local hidden story can explain.' },
  { id: 'uncertainty', number: 17, symbol: 'Un', title: 'The Uncertainty Principle', domain: 'quantum', level: 1, status: 'soon', tagline: 'Squeeze a wave in space and it spreads in momentum.' },
  // String theory
  { id: 'vibrating-strings', number: 18, symbol: 'St', title: 'Strings & Extra Dimensions', domain: 'string', level: 3, status: 'live', tagline: 'Particles as vibration modes, and dimensions curled too small to see.' },
  { id: 'calabi-yau', number: 19, symbol: 'Cy', title: 'Calabi–Yau Shapes', domain: 'string', level: 3, status: 'soon', tagline: 'The hidden geometry that would set the laws of physics.' },
  { id: 'branes', number: 20, symbol: 'Br', title: 'D-Branes', domain: 'string', level: 3, status: 'soon', tagline: 'Surfaces where open strings end.' },
  { id: 'holography', number: 21, symbol: 'Ho', title: 'Holography', domain: 'string', level: 3, status: 'soon', tagline: 'A universe described by its boundary.' },
];

type Loader = () => Promise<{ default: Topic }>;

export const LOADERS: Record<string, Loader> = {
  'double-pendulum': () => import('./topics/double-pendulum/index.ts'),
  'tennis-racket': () => import('./topics/tennis-racket/index.ts'),
  'special-relativity': () => import('./topics/special-relativity/index.ts'),
  'curved-spacetime': () => import('./topics/curved-spacetime/index.ts'),
  'quantum-tunneling': () => import('./topics/quantum-tunneling/index.ts'),
  'vibrating-strings': () => import('./topics/vibrating-strings/index.ts'),
};
