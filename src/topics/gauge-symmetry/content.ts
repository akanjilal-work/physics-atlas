import type { TopicContent } from '../../core/types.ts';

const frac = (x: number) => x - Math.floor(x);

export const content: TopicContent = {
  intuition: `
<p class="lead">Every quantum particle carries a hidden dial, its <strong>phase</strong>. Turn every dial in the universe by the same amount and nothing you can measure changes. That is a <em>global</em> symmetry, and it is not very surprising.</p>
<p>Now ask for more. Let each point in space turn its own dial by its own amount, whenever it likes. Physics should still not notice. That sounds impossible. Neighbouring dials that used to agree now point different ways, and any energy that compares neighbours will jump.</p>
<p>The fix is to put a small <strong>connector</strong> on every link between neighbours. The connector records how much to turn one dial before you compare it with the next. When a site turns its dial, the connectors next to it turn to compensate. Those connectors are the <strong>gauge field</strong>. For the phase dial of an electron, the gauge field is the electromagnetic vector potential.</p>
<blockquote>Demand a local symmetry and a force appears.</blockquote>
<p>The scene is a small grid of sites. The white arrows are the phase dials. The coloured bars on the edges are the connectors, coloured by their angle around the colour wheel. The squares between them show the <strong>flux</strong> through each little loop: go round the square, add up the connector angles, and see how far you are twisted when you return. Paint over the board and watch sites and links spin while the squares stay exactly the same colour. The flux is the part that is real. It is the magnetic field.</p>
<p>On the right is the strangest consequence. Electrons pass on both sides of a thin solenoid. All the magnetic field is trapped inside it, and the electrons never touch it. Yet their interference fringes slide as the hidden flux changes. This is the <strong>Aharonov–Bohm effect</strong>. It shows that the connectors, not just the field you can feel, shape what quantum particles do.</p>`,
  tryFirst: [
    'Drag across the board to paint local phase turns. The arrows and link colours change. The square tiles do not. The <b>max |ΔU<sub>p</sub>|</b> readout stays near 10⁻¹⁵.',
    'Move <b>Global rotation</b>. Every arrow turns together, and both energies in the corner plot stay flat.',
    'Turn off <b>Use link variables</b> and paint again. The red "naive" energy line jumps. Without links, local phase freedom is broken.',
    'Slide <b>AB flux Φ/Φ₀</b>. The fringes on the screen slide, but the grey single-slit envelope stays put. At Φ/Φ₀ = 1 the pattern is back where it started.',
  ],
  equation: {
    tex: '\\psi \\to e^{i\\alpha(x)}\\psi,\\quad A_\\mu \\to A_\\mu + \\tfrac1e\\,\\partial_\\mu\\alpha',
    caption: 'A local change of phase, paired with a shift of the vector potential, changes no prediction. On the lattice the invariant is the plaquette $U_p = U_{12}U_{23}U_{34}U_{41} = e^{iF_p}$, where $F_p = (e/\\hbar)\\,\\Phi_p$ is the magnetic flux through one square.',
    terms: [
      { tex: '\\psi', name: 'Matter field', meaning: 'A complex number at each site. Its phase is the white arrow on each dial. A global rotation turns them all together.', param: 'global' },
      { tex: 'e^{i\\alpha(x)}', name: 'Local phase turn', meaning: 'A different angle $\\alpha$ at every site. Paint it with the brush or press <b>Random local transform</b>.', param: 'randomize' },
      { tex: 'A_\\mu', name: 'Gauge field', meaning: 'Lives on the links as $U_{ij} = e^{iA_{ij}}$. It tells you how to compare the phase at one site with the next.', param: 'links' },
      { tex: '\\tfrac1e\\,\\partial_\\mu\\alpha', name: 'Compensating shift', meaning: 'On the lattice this is $\\alpha_j - \\alpha_i$ added to each link. It cancels exactly around every closed square, so plaquettes do not move.', param: 'drift' },
      { tex: 'e', name: 'Charge', meaning: 'Sets how strongly the phase couples to $A$. For an electron, one Aharonov–Bohm period is $h/e$.', param: 'abFlux' },
    ],
  },
  physicsNotes: `
<h3>Why a naive difference fails</h3>
<p>Kinetic energy compares neighbours. On a lattice the simplest version is $\\sum |\\psi_j - \\psi_i|^2$. A global turn multiplies both terms by the same $e^{i\\beta}$ and nothing changes. A local turn gives $|e^{i\\alpha_j}\\psi_j - e^{i\\alpha_i}\\psi_i|^2$, and that depends on $\\alpha_j - \\alpha_i$. The energy is not invariant.</p>
<h3>The covariant difference</h3>
<p>Put a phase $U_{ij} = e^{iA_{ij}}$ on each link and compare $\\psi_j$ with the transported value $U_{ij}\\psi_i$:</p>
$$D_{ij}\\psi = \\psi_j - U_{ij}\\,\\psi_i, \\qquad U_{ij} \\to e^{i\\alpha_j}\\,U_{ij}\\,e^{-i\\alpha_i}.$$
<p>Then $D_{ij}\\psi \\to e^{i\\alpha_j} D_{ij}\\psi$. The difference turns just like a field at site $j$, so $|D_{ij}\\psi|^2$ is invariant. In the continuum limit, with spacing $a$ and $A_{ij} = e\\,a\\,A_\\mu$, this becomes the covariant derivative $D_\\mu = \\partial_\\mu - ieA_\\mu$ (units with $\\hbar = 1$).</p>
<h3>What cannot be gauged away</h3>
<p>Multiply the four links around a square. Each site's $e^{i\\alpha}$ enters once and its inverse enters once, so all of them cancel:</p>
$$U_p = U_{12}U_{23}U_{34}U_{41} = e^{i(A_{12}+A_{23}+A_{34}+A_{41})} = e^{iF_p}.$$
<p>The loop sum $F_p$ is the lattice version of $\\oint A\\cdot d\\ell = \\Phi$, the magnetic flux through the square. Kenneth Wilson built lattice gauge theory on this idea in 1974. His field energy is $\\sum_p (1 - \\cos F_p)$, which becomes $\\tfrac12\\int B^2$ for small flux. Give the links this energy and let them move, and their dynamics is Maxwell's electromagnetism.</p>
<h3>How the scene works</h3>
<p>The lattice has 8 × 8 sites with open edges. The flux slider builds links in the axial gauge, where every horizontal link is zero. Each brush dab applies a smooth bump $\\alpha(x)$ and updates sites and links with the rule above. The drift readout compares every plaquette with its value when the flux was set. It stays at rounding level, near $10^{-15}$. The energy plot shows $\\sum|D\\psi|^2$ (green) and the naive $\\sum|\\psi_j - \\psi_i|^2$ (red) over time.</p>`,
  deep: [
    {
      title: 'Weyl: from scale to phase',
      html: `<p>The word <em>gauge</em> comes from Hermann Weyl. In 1918 he tried to unify gravity and electromagnetism by letting the <strong>scale of length</strong> vary from point to point, like re-gauging a ruler. The vector potential was the field that kept track of the changing scale. Einstein objected at once. If lengths depended on path, then the spectral lines of atoms would depend on their history, and they do not.</p>
<p>Quantum mechanics rescued the idea. Vladimir Fock (1926) and Fritz London (1927) noticed that the electron's phase is the thing that should vary. In 1929 Weyl rewrote his theory with a complex phase $e^{i\\alpha}$ in place of a real scale factor. The name stuck even though nothing is being measured with a gauge any more. Electromagnetism became the first gauge theory, with gauge group U(1), the group of phase turns.</p>`,
    },
    {
      title: 'Yang–Mills: when links do not commute',
      html: `<p>In 1954 Chen Ning Yang and Robert Mills asked what happens when the "dial" is not a single phase but a direction in an internal space. Their example was isospin, which treats the proton and neutron as two states of one particle. The local turns then belong to SU(2), and each link carries a $2\\times2$ unitary matrix instead of a single phase.</p>
<p>Matrices do not commute, so the order of the four links around a plaquette matters. The field strength picks up an extra term:</p>
$$F_{\\mu\\nu} = \\partial_\\mu A_\\nu - \\partial_\\nu A_\\mu - ig\\,[A_\\mu, A_\\nu].$$
<p>That commutator means the gauge field feels its own field. Photons carry no electric charge and pass through each other. The quanta of a Yang–Mills field carry the charge they respond to, so they attract and scatter each other. In quantum chromodynamics, with group SU(3), this <strong>gluon self-interaction</strong> makes the force weaken at short distances (asymptotic freedom, found by Gross, Wilczek and Politzer in 1973). The full picture of why it confines quarks at long distances is still not proven mathematically. Lattice simulations with link matrices, the same structure as this scene, strongly support it.</p>
<p>Yang and Mills had a problem. Their quanta seemed to have to be massless, and no massless strong-force particle was seen. The answers came later, with confinement for the strong force and the Higgs mechanism for the weak force.</p>`,
    },
    {
      title: 'The Aharonov–Bohm effect and Tonomura',
      html: `<p>Yakir Aharonov and David Bohm pointed out in 1959 that an electron's phase along a path is $\\frac{e}{\\hbar}\\int A\\cdot d\\ell$. For two paths that pass on opposite sides of a solenoid, the phase difference is the loop integral:</p>
$$\\Delta\\varphi = \\frac{e}{\\hbar}\\oint A\\cdot d\\ell = \\frac{e}{\\hbar}\\,\\Phi = 2\\pi\\,\\frac{\\Phi}{h/e}.$$
<p>The fringes shift by one full period for every $h/e \\approx 4.14\\times10^{-15}$ Wb of enclosed flux, even though $B = 0$ everywhere the electron goes. Werner Ehrenberg and Raymond Siday had noted the effect in 1949. Robert Chambers saw a shift in 1960, but critics argued that stray fields could leak out of his magnetised whisker.</p>
<p>Akira Tonomura and colleagues at Hitachi settled the question in 1986. They used electron holography with a tiny toroidal magnet coated in superconducting niobium. The superconductor kept the field inside and also forced the trapped flux to come in units of $h/2e$. The measured phase shift was either 0 or $\\pi$, exactly as predicted for an even or odd number of flux quanta, with the field fully shielded from the electrons.</p>`,
    },
    {
      title: 'Is gauge symmetry really a symmetry?',
      html: `<p>An honest answer is no, not in the usual sense. A true symmetry maps one physical state to a <em>different</em> state with the same properties, such as a rotated crystal. A gauge transformation maps a description to another description of the <strong>same</strong> state. It is a redundancy in the bookkeeping, like writing the same vector in two coordinate systems.</p>
<p>This has sharp consequences. Only gauge-invariant quantities, like plaquettes, Wilson loops and $|D\\psi|^2$, can be measured. Elitzur's theorem (1975) shows that a local gauge symmetry cannot break spontaneously in the usual sense. So "the Higgs breaks gauge symmetry" is convenient shorthand, not a literal statement. The redundancy also imposes a constraint on physical states, Gauss's law.</p>
<p>So why use a redundant description at all? Because it is the standard known way to write interacting massless spin-1 particles in a theory that is local, Lorentz invariant and free of negative probabilities. The redundancy is the price of locality.</p>`,
    },
    {
      title: 'The Standard Model: SU(3) × SU(2) × U(1)',
      html: `<p>Every known force except gravity is a gauge theory. The Standard Model's gauge group is $SU(3)\\times SU(2)\\times U(1)$. SU(3) gives 8 gluons, which bind quarks. SU(2) × U(1) gives four gauge fields. The Higgs field mixes them into the massive $W^+$, $W^-$ and $Z$ bosons and the massless photon.</p>
<p>A gauge theory is only useful if its quantum predictions are finite. Gerard 't Hooft and Martinus Veltman showed in the early 1970s that Yang–Mills theories, including those with a Higgs mechanism, are <strong>renormalisable</strong>. They shared the 1999 Nobel Prize in Physics for it. That result turned the electroweak theory of Glashow, Weinberg and Salam from a promising idea into a calculable theory.</p>
<p>Gravity looks like a gauge theory of spacetime transformations, but it is not a Yang–Mills theory and its quantum version is not renormalisable in the same way. Unifying it with the others remains open.</p>`,
    },
  ],
  challenges: [
    {
      id: 'invariant',
      title: 'Nothing real moved',
      prompt: 'With link variables on, apply at least three local gauge transforms (brush strokes or the random button) and keep every plaquette unchanged to better than $10^{-9}$.',
      hint: 'Paint anywhere on the board, or press <b>Random local transform</b> three times. Watch the drift readout.',
      check: (s) => s.linksOn === true && (s.localTransforms as number) >= 3 && (s.drift as number) < 1e-9,
    },
    {
      id: 'break',
      title: 'Break it',
      prompt: 'Turn off the link variables, then apply a local transform that changes the naive energy by more than 0.5.',
      hint: 'Switch off <b>Use link variables</b> and press <b>Random local transform</b>. A global rotation will not do it.',
      check: (s) => s.linksOn === false && Math.abs(s.brokenJump as number) > 0.5,
    },
    {
      id: 'half',
      title: 'Swap bright and dark',
      prompt: 'Shift the Aharonov–Bohm fringes by half a period, so the old bright fringes become dark.',
      hint: 'The shift in periods equals Φ/Φ₀. Aim for 0.5.',
      check: (s) => Math.abs(frac(s.abFlux as number) - 0.5) < 0.03,
    },
    {
      id: 'quantum',
      title: 'One flux quantum',
      prompt: 'Find a nonzero solenoid flux that puts every fringe exactly back where it started.',
      hint: 'The phase is $2\\pi\\,\\Phi/(h/e)$. What value of $\\Phi/\\Phi_0$ gives a full turn?',
      check: (s) => Math.abs(s.abFlux as number) > 0.5 && Math.abs((s.abFlux as number) - Math.round(s.abFlux as number)) < 0.02,
    },
  ],
  caveats: `<p>The lattice is a classical toy. The site phases have fixed size one and do not evolve in time, and the links do not have their own dynamics here. The scene shows the <em>structure</em> of gauge invariance, not a simulation of electrodynamics. A real lattice gauge calculation integrates over all link configurations with the Wilson action and needs very large computers.</p>
<p>The Aharonov–Bohm panel uses an ideal two-path pattern with a fixed single-slit envelope and a perfectly shielded, infinitely long solenoid. Real experiments use biprisms or holography, with finite coherence. The flux slider is continuous. In Tonomura's superconducting shield the flux was quantised in units of $h/2e$, which is why he saw only shifts of 0 or π.</p>
<p>The non-abelian section is qualitative. The scene only shows U(1) phases.</p>`,
  further: [
    { label: 'Gauge theory on Wikipedia', url: 'https://en.wikipedia.org/wiki/Gauge_theory' },
    { label: 'Yang and Mills, Conservation of Isotopic Spin and Isotopic Gauge Invariance (1954)', url: 'https://doi.org/10.1103/PhysRev.96.191' },
    { label: 'Tonomura et al., Evidence for Aharonov–Bohm effect with magnetic field completely shielded (1986)', url: 'https://doi.org/10.1103/PhysRevLett.56.792' },
    { label: 'Wilson, Confinement of quarks (1974), the origin of lattice gauge theory', url: 'https://doi.org/10.1103/PhysRevD.10.2445' },
  ],
};
