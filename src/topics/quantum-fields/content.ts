import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Imagine a mattress that fills all of space. It is a grid of tiny masses joined by springs. Poke it and ripples spread out. Quantum field theory says that this picture, made precise, is what the world is built from.</p>
<p>The glowing sheet in the scene is such a mattress, called a <strong>field</strong>. Each point can move up or down. The springs between neighbours carry ripples across the sheet. A second spring ties every point to its own rest height. That anchor spring is the <strong>mass</strong> of the field.</p>
<p>Any ripple can be broken into pure waves, called <strong>modes</strong>. Each mode behaves like a single spring on its own. Quantum mechanics says a spring cannot hold any amount of energy. It holds whole steps of size $\\hbar\\omega$, called quanta. <strong>One quantum in one mode is what we call a particle.</strong></p>
<p>Press <b>Create particle</b>. A small bundle of ripple forms and runs across the sheet. It keeps its shape and moves at a steady speed, just like a particle. Nothing moves along with it except the pattern itself. The masses only bob up and down.</p>
<p>Here is the surprise. Every electron in the universe is exactly the same as every other one. That is no accident. They are all ripples in one and the same electron field, so they have no way to differ. The same is true for photons, which are ripples in the electromagnetic field.</p>
<p>Even when no particle is present, the field is never perfectly still. Each mode keeps a little quantum jitter in its lowest state. Switch on <b>vacuum jitter</b> to see a picture of it.</p>`,
  tryFirst: [
    'Press <b>Create particle</b> and watch the bundle run across the sheet. The speed readout compares it with the prediction from the curve in the corner.',
    'Drag <b>field mass m</b> to 0 and launch again. A massless ripple moves at the speed of light, the top speed of the sheet.',
    'Push the mass up to 2 or more. Heavy particles are slow at the same momentum.',
    'Click anywhere on the sheet to pluck it. A pluck makes rings of ripples in every direction, not a single particle.',
    'Raise <b>coupling to field B</b> and watch a particle leak from the top sheet into the lower one and back.',
  ],
  equation: {
    tex: '\\omega_k^2 \\;=\\; \\frac{m^2c^4}{\\hbar^2} \\;+\\; c^2k^2',
    caption: 'The Klein–Gordon dispersion relation: how fast each mode of a free field oscillates. Each quantum in mode $k$ carries energy $E = \\hbar\\omega_k$ and momentum $p = \\hbar k$, so this is $E^2 = m^2c^4 + p^2c^2$ from special relativity.',
    terms: [
      { tex: '\\omega_k', name: 'Mode frequency', meaning: 'How fast the mode with wavenumber $k$ oscillates. The readout shows the lattice value for the packet you launch.', param: 'omega' },
      { tex: 'm', name: 'Field mass', meaning: 'Strength of the spring that ties each site to its rest height. It sets the lowest possible frequency, the mass gap, so that $\\omega_k \\ge mc^2/\\hbar$.', param: 'm' },
      { tex: 'k', name: 'Wavenumber', meaning: 'Ripples per unit length times $2\\pi$. The momentum of one quantum is $\\hbar k$.', param: 'k' },
      { tex: 'c', name: 'Speed of light', meaning: 'The fastest any ripple can travel. The packet moves at the group velocity $v = d\\omega/dk = c^2k/\\omega$, which is always less than $c$ when $m > 0$.', param: 'vg' },
      { tex: '\\hbar', name: 'Planck constant', meaning: 'Sets the size of one energy step. One quantum in mode $k$ has $E = \\hbar\\omega_k$.', param: 'E' },
    ],
  },
  physicsNotes: `
<h3>From springs to a field</h3>
<p>Put a mass at every site of a square grid with spacing $a$. Let $\\phi_n$ be the height of site $n$. Neighbouring sites are joined by springs, and each site is tied to its rest height by a spring of strength $m^2$. In units with $\\hbar = c = 1$ the equation of motion is</p>
$$\\ddot\\phi_n = \\frac{1}{a^2}\\sum_{\\text{neighbours}}(\\phi_{n'} - \\phi_n) \\; - \\; m^2\\phi_n .$$
<p>As $a \\to 0$ the sum becomes the Laplacian and this is the <strong>Klein–Gordon equation</strong> $\\ddot\\phi = \\nabla^2\\phi - m^2\\phi$.</p>
<h3>Normal modes are plane waves</h3>
<p>Try $\\phi_n = \\cos(k\\cdot x_n - \\omega t)$. It solves the lattice equation exactly when</p>
$$\\omega_k^2 = m^2 + \\frac{4}{a^2}\\Big[\\sin^2\\tfrac{k_x a}{2} + \\sin^2\\tfrac{k_y a}{2}\\Big].$$
<p>For wavelengths much longer than $a$ this becomes $\\omega^2 = m^2 + k^2$. The inset draws both curves. The simulation uses the lattice one. At the default settings the two group velocities differ by about 1%.</p>
<h3>Quantize each mode</h3>
<p>Every mode is an independent harmonic oscillator. Quantum mechanics gives it energies $E = (n_k + \\tfrac12)\\hbar\\omega_k$ with $n_k = 0, 1, 2, \\dots$ The whole state of the field is a list of these whole numbers, the <strong>occupation numbers</strong>. One quantum in one mode is one particle with energy $\\hbar\\omega_k$ and momentum $\\hbar k$. Two quanta are two particles. The histogram in the inset counts them.</p>
<h3>Why a bundle moves like a particle</h3>
<p>Add up modes with $k$ close to $k_0$ and you get a localized packet. Its envelope moves at the <strong>group velocity</strong> $v = d\\omega/dk = k/\\omega$, which is exactly the relativistic velocity $p c^2/E$ of a particle. The simulation integrates the lattice with a velocity Verlet scheme, a symplectic method. The energy drift readout shows how well it conserves energy.</p>`,
  deep: [
    {
      title: 'Why physicists say particles are excitations of fields',
      html: `<p>Before quantum field theory there were two kinds of thing: particles, like electrons, and fields, like light. Quantum mechanics blurred the line, since electrons diffract like waves and light arrives in lumps. Quantum field theory removes the line altogether.</p>
<p>In QFT the basic objects are fields. Particles are their quantized excitations. This explains facts that are puzzles otherwise:</p>
<ul>
<li><strong>Identical particles.</strong> Every electron has exactly the same mass and charge, because all are quanta of one electron field. Swapping two of them does not give a new state, since a state is only a list of occupation numbers.</li>
<li><strong>Creation and destruction.</strong> Particle number can change. An electron and a positron can turn into two photons. In field language, energy moves from excitations of one field to excitations of another.</li>
<li><strong>Relativity and quantum mechanics together.</strong> A theory with a fixed number of particles runs into trouble once relativity is included, because energy $E = mc^2$ can be turned into new particles. Fields handle this naturally.</li>
</ul>`,
    },
    {
      title: 'The vacuum is not empty',
      html: `<p>The lowest state of each mode still has energy $\\tfrac12\\hbar\\omega_k$ and a spread in position. For a mode coordinate $q_k$ the ground state has</p>
$$\\langle q_k^2 \\rangle = \\frac{\\hbar}{2\\omega_k}, \\qquad \\langle p_k^2 \\rangle = \\frac{\\hbar\\omega_k}{2}.$$
<p>The jitter toggle draws one random sample with exactly these spreads in every mode, then lets it evolve. It is a schematic picture. The true vacuum is a quantum state, not a surface that shakes. It does not change in time at all. The random pattern stands for the spread of outcomes you would get if you measured the field.</p>
<p>Summed over all modes, the spread at a single site grows without limit as $a \\to 0$, because there are ever more short-wavelength modes. To keep the picture readable, the scene draws only modes with $|k| < 4$, the range shown in the inset, and scales them to one tenth of their true size. Even then, the jitter of a small patch is comparable to the height of a one-quantum packet. Real detectors average the field over a region and over time, which removes most of the short-wavelength jitter.</p>
<p>The zero-point energy has measurable effects when boundaries change which modes fit. Two metal plates in vacuum attract each other. This is the <strong>Casimir effect</strong>, predicted by Hendrik Casimir in 1948 and measured precisely in the late 1990s.</p>`,
    },
    {
      title: 'Photons, electrons and the Higgs',
      html: `<p>The mattress here is a <strong>real scalar field</strong>: one number at each point, spin 0, and each particle is its own antiparticle. Nature's fields come in several kinds, but the same logic applies to all of them.</p>
<ul>
<li>The <strong>photon</strong> is the quantum of the electromagnetic field. That field has $m = 0$, so light moves at $c$. Dirac's 1927 paper first treated light this way.</li>
<li>The <strong>electron</strong> is a quantum of the Dirac field, which has spin ½. Its quanta obey the Pauli exclusion principle, so each mode holds at most one of them.</li>
<li>The <strong>Higgs boson</strong>, found at CERN by the ATLAS and CMS experiments in 2012, is a ripple in the Higgs field. That field is unusual because its lowest state is not zero. Other particles get their masses from interacting with that constant background value.</li>
</ul>`,
    },
    {
      title: 'How quantum field theory was built',
      html: `<p>The ideas came together over a few years.</p>
<ul>
<li><strong>1926.</strong> In the paper by Born, Heisenberg and Jordan, Jordan quantized a vibrating string as a set of oscillators. That same year Klein and Gordon, among others, wrote down the relativistic wave equation that bears their names.</li>
<li><strong>1927.</strong> Paul Dirac quantized the electromagnetic field and used it to explain how atoms emit and absorb light.</li>
<li><strong>1928.</strong> Jordan and Wigner showed how to quantize fields whose quanta obey the exclusion principle, like electrons.</li>
<li><strong>1929 to 1930.</strong> Heisenberg and Pauli set out a general quantum theory of wave fields.</li>
<li><strong>1934.</strong> Pauli and Weisskopf quantized the Klein–Gordon field itself, the field in this scene. They found spin-0 particles and their antiparticles.</li>
<li><strong>Late 1940s.</strong> Tomonaga, Schwinger and Feynman, with Dyson tying their work together, learned to remove the infinities of quantum electrodynamics by renormalization. The first three shared the 1965 Nobel Prize.</li>
</ul>`,
    },
    {
      title: 'The coupled second field',
      html: `<p>The lower sheet is a second field of the same mass. The coupling slider adds a spring between matching sites of the two sheets, with energy $\\tfrac{g}{2}(\\phi_A - \\phi_B)^2$. The combined modes are $\\phi_A + \\phi_B$, with mass $m$, and $\\phi_A - \\phi_B$, with mass $\\sqrt{m^2 + 2g}$. A quantum that starts in field A is a mix of both. The two parts drift out of step, so the quantum moves fully into field B after a time $\\pi/(\\omega_- - \\omega_+)$ and then back.</p>
<p>This is a <strong>toy interaction</strong>. Real interactions, such as an electron emitting a photon, change the number of particles and involve three or more fields at once. The closest real cousin of this toy is <strong>mixing</strong>, as in neutrino oscillations, where a neutrino made as one flavour is later found as another.</p>`,
    },
  ],
  challenges: [
    {
      id: 'measure-vg',
      title: 'Clock a particle',
      prompt: 'Launch a particle and let it travel at least 6 length units. Its measured speed must agree with the group velocity $d\\omega/dk$ to within 5%.',
      hint: 'Press Create particle and do not pluck the sheet or move the mass slider until it has run far enough. The distance readout counts up.',
      check: (s) => s.userLaunch === true && s.measuring === true && (s.dist as number) >= 6 && Math.abs(s.speedErr as number) < 5,
    },
    {
      id: 'light-like',
      title: 'Ripples at light speed',
      prompt: 'Set the field mass to 0, launch a particle, and measure it moving at 0.95 c or faster over at least 6 length units.',
      hint: 'With $m = 0$ the group velocity is $k/\\omega = 1$ in the continuum. The lattice slows very short waves a little, so keep $k$ below about 3.',
      check: (s) => s.userLaunch === true && s.measuring === true && (s.launchM as number) === 0 && (s.m as number) === 0 && (s.dist as number) >= 6 && (s.vmeas as number) >= 0.95,
    },
    {
      id: 'vacuum',
      title: 'Nothing is jittering',
      prompt: 'Turn on the vacuum jitter and look at what "empty" space means in quantum field theory.',
      hint: 'The toggle is in the Field section. Notice that heavy fields jitter less, since each mode spreads by $\\sqrt{\\hbar/2\\omega}$.',
      check: (s) => s.jitter === true,
    },
    {
      id: 'transfer',
      title: 'Hand it over',
      prompt: 'Turn on the coupling and launch a particle into field A. Wait until more than half of its energy is in field B.',
      hint: 'A coupling near 0.3 moves the particle over in a few seconds. Watch the quanta readouts for A and B.',
      check: (s) => s.userLaunch === true && (s.g as number) > 0 && (s.fracB as number) > 0.5,
    },
  ],
  caveats: `The mattress is an analogy, but the mathematics under it is exact. A free scalar field is a set of independent harmonic oscillators, one per mode. The scene simplifies in several ways. It is a real scalar field in two space dimensions on a finite periodic lattice, not a continuum. The travelling bundle is a classical wave that holds one quantum on average, like a coherent state. A true one-particle state has zero average field, so no single snapshot of it looks like a bump. The vacuum jitter is one random sample drawn with the correct ground-state spread per mode, but only for modes with $|k| < 4$ and at one tenth of its true size. The coupling between the two fields is a toy that mixes them, not a real interaction that creates or destroys particles. Units are $\\hbar = c = 1$.`,
  further: [
    { label: 'Quantum field theory (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Quantum_field_theory' },
    { label: 'Klein–Gordon equation (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Klein%E2%80%93Gordon_equation' },
    { label: 'D. Tong, Lectures on Quantum Field Theory (Cambridge)', url: 'https://www.damtp.cam.ac.uk/user/tong/qft.html' },
    { label: 'P. A. M. Dirac, The quantum theory of the emission and absorption of radiation (1927)', url: 'https://doi.org/10.1098/rspa.1927.0039' },
  ],
};
