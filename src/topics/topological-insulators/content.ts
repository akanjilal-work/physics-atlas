import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Some materials are insulators inside and metals on their surface. Cut them, scratch them, add dirt, and the surface still conducts. The reason is not chemistry. It is a whole number that the electrons carry, and whole numbers cannot change a little bit.</p>
<p>Start with the simplest example in the scene. It is a chain of atoms with bonds that alternate, strong and weak, strong and weak. The thick bonds are strong. There are two ways to pair the atoms. Either each atom holds hands with its neighbour inside a cell, or with the neighbour in the next cell. In the middle of the chain the two look the same. At the ends they do not.</p>
<p>If the strong bonds sit between cells, the very first and very last atoms have no strong partner. An electron can sit on each lonely end atom with zero energy. That is the glowing column at each end of the chain. It is an <strong>edge state</strong>.</p>
<p>Here is the surprise. You cannot remove those end states by gently changing the chain. You can shake the bond strengths at random and they stay pinned at zero. The only way to get rid of them is to make the weak and strong bonds equal for a moment. Then the insulator stops being an insulator in the middle. Physicists say the <em>gap closes</em>.</p>
<p>The small loop in the corner shows why. It traces a vector as the electron's wave runs through all its possible wavelengths. If the loop goes around the origin, the chain is topological and has end states. If it does not, the chain is ordinary. To get from one case to the other, the loop has to pass through the origin. A doughnut and a ball are the same story: you cannot turn one into the other without tearing.</p>`,
  tryFirst: [
    'Drag <b>v/w</b> from 0.6 up past 1. At v = w the loop in the corner touches the origin and the end glow spreads out. Above 1 it is gone.',
    'Go back below 1 and turn up <b>disorder</b>. The bonds become uneven, but the end glow stays and the edge energy stays near zero.',
    'Raise <b>chain length</b>. The two end states separate further and their energy drops exponentially.',
    'Switch <b>view</b> to <b>Chern ribbon</b>. Lines cross the gap in colour, one per edge. Move <b>u</b> past 2 and they vanish.',
  ],
  equation: {
    tex: '\\nu = \\frac{1}{2\\pi}\\oint_{\\mathrm{BZ}} \\frac{d\\,\\arg d(k)}{dk}\\,dk',
    caption: 'The winding number of the SSH chain counts how many times $d(k) = (v + w\\cos k,\\ w\\sin k)$ circles the origin as k runs across the Brillouin zone. In two dimensions the matching integer is the Chern number, $C = \\frac{1}{2\\pi}\\int_{\\mathrm{BZ}} F(\\mathbf{k})\\,d^2k$, the total Berry curvature of the filled band. The ribbon view computes it on a grid.',
    terms: [
      { tex: '\\nu', name: 'Winding number', meaning: 'An integer. It is 1 when $v < w$ and 0 when $v > w$. It equals the number of zero-energy states at each end.', param: 'winding' },
      { tex: 'd(k)', name: 'Bloch vector', meaning: 'The Hamiltonian at momentum $k$ is $H(k) = d_x\\sigma_x + d_y\\sigma_y$. Its length is the band energy, $|d| = |v + w e^{ik}|$.', param: 'vw' },
      { tex: 'v', name: 'Intra-cell hopping', meaning: 'Strength of the bond inside a unit cell. It sets the centre of the loop.', param: 'vw' },
      { tex: 'w', name: 'Inter-cell hopping', meaning: 'Strength of the bond between cells. It sets the radius of the loop. Here $w = 1$ sets the energy unit.', param: 'vw' },
      { tex: '\\arg d(k)', name: 'Angle of d(k)', meaning: 'The direction the vector points. Its total change over the zone is $2\\pi\\nu$.', param: 'winding' },
      { tex: 'k', name: 'Crystal momentum', meaning: 'Runs over the Brillouin zone from $-\\pi$ to $\\pi$ (lattice spacing 1). The gap closes at $k = \\pi$ when $v = w$.', param: 'gap' },
    ],
  },
  physicsNotes: `
<h3>The SSH chain</h3>
<p>Each cell has two sites, A and B. An electron hops A→B inside a cell with amplitude $v$ and B→A to the next cell with amplitude $w$. Fourier transforming gives a 2×2 Bloch Hamiltonian</p>
$$H(k) = \\begin{pmatrix} 0 & v + w e^{-ik} \\\\ v + w e^{ik} & 0 \\end{pmatrix}, \\qquad E_\\pm(k) = \\pm|v + w e^{ik}|.$$
<p>The gap is $2|v - w|$, at $k = \\pi$. There is no $\\sigma_z$ term because hopping only links A to B. This is <em>chiral</em> or sublattice symmetry. It forces $d(k)$ to stay in a plane, so the loop has a well defined winding around the origin. The winding cannot change unless $d(k)$ passes through zero, which is exactly when the gap closes.</p>
<h3>Edge states from bulk topology</h3>
<p>Look for a zero-energy state on the A sites only, $\\psi_{A,n} = a_n$. The equation at each B site gives $v a_n + w a_{n+1} = 0$, so $a_n \\propto (-v/w)^{n-1}$. For $v < w$ this decays into the chain. The state lives on the left end, on A sites only, with decay length $\\xi = 1/\\ln(w/v)$ cells. A mirror state lives on B sites at the right end. On a finite chain the two overlap weakly and split to $\\pm\\varepsilon$ with $\\varepsilon \\propto (v/w)^N$. The <b>edge energy</b> readout shows this. The number of such end states equals $\\nu$. This rule is called the <em>bulk–boundary correspondence</em>.</p>
<h3>How the simulation works</h3>
<p>The finite chain is a real symmetric $2N\\times 2N$ matrix. It is diagonalised with Householder reduction and implicit QL, checked in the tests against Jacobi rotations. The glow on each atom is the mean density of the two states closest to $E = 0$. The winding is computed by adding up the change in $\\arg d(k)$ on 720 points. The <b>winding sum</b> readout shows the raw value before rounding.</p>
<h3>The Chern insulator</h3>
<p>The ribbon view uses the Qi–Wu–Zhang (QWZ) model on a square lattice, $H(\\mathbf{k}) = \\sin k_x\\,\\sigma_x + \\sin k_y\\,\\sigma_y + (u + \\cos k_x + \\cos k_y)\\,\\sigma_z$. The Fukui–Hatsugai method puts the filled-band state on a 24×24 grid, multiplies the overlap phases around each small square, and adds the angles. The total over $2\\pi$ is an integer to machine precision, even on a coarse grid. In this code's sign convention the lower band has $C = +1$ for $0 < u < 2$, $C = -1$ for $-2 < u < 0$, and $C = 0$ for $|u| > 2$. The strip is 20 rows wide with open edges and periodic along $x$. Each state is coloured by where it lives across the strip.</p>`,
  deep: [
    {
      title: 'Topology in one picture: holes you cannot remove',
      html: `<p>Topology studies what stays the same under smooth stretching. A coffee mug and a doughnut both have one hole, so they have genus $g = 1$. A ball has genus 0. No smooth squeeze turns one into the other. You would have to tear the surface or glue it.</p>
<p>The Gauss–Bonnet theorem makes this quantitative. Add up the curvature $K$ over a closed surface and you always get $\\int K\\,dA = 2\\pi(2 - 2g)$. Local bumps change $K$ here and there, but the total is locked to an integer.</p>
<p>The Chern number is built the same way. The Berry curvature $F(\\mathbf{k})$ varies across the Brillouin zone, which is itself a torus. Its total, divided by $2\\pi$, must be an integer. It can only jump when the curvature becomes singular, and that happens only where two bands touch. So <strong>the invariant can change only if the gap closes</strong>. In the <b>Doughnut ↔ sphere</b> view, the shape follows $v/w$. The hole pinches shut at $v = w$. The in-between shapes pass through themselves, which a real surface cannot do. That is the analogy for the gap closing.</p>`,
    },
    {
      title: 'Chern number and the edge: why the edge must conduct',
      html: `<p>In 1982 Thouless, Kohmoto, Nightingale and den Nijs (TKNN) showed that the quantized Hall conductance of a 2D crystal in a magnetic field is $\\sigma_{xy} = C\\,e^2/h$, with $C$ the Chern number of the filled bands. In 1988 Haldane showed a honeycomb lattice could have $C \\ne 0$ with no net magnetic field, just complex hopping phases. This is a <em>Chern insulator</em>, or quantum anomalous Hall insulator.</p>
<p>At a boundary between $C = 1$ and vacuum ($C = 0$), the invariant has to change. It can only change where the gap closes, so the gap closes at the edge. The result is a mode that crosses the gap and moves in one direction only. The number of such <em>chiral</em> modes equals the change in $C$. In the ribbon view the amber edge and the cyan edge have slopes of opposite sign. An electron on the amber edge moves one way, and on the cyan edge the other way. There is no backward-moving state on the same edge for it to scatter into, so impurities cannot cause backscattering.</p>
<p>Haldane's model was realised in a material in 2013. Chang and colleagues saw the quantum anomalous Hall effect in thin films of chromium-doped (Bi,Sb)₂Te₃, at temperatures of tens of millikelvin. It was also realised with cold atoms in an optical lattice in 2014.</p>`,
    },
    {
      title: 'Z₂ topological insulators: Kane–Mele, HgTe, Bi₂Se₃ (qualitative)',
      html: `<p><em>This section is descriptive. The scene does not simulate these models.</em></p>
<p>A Chern insulator breaks time-reversal symmetry. In 2005 Kane and Mele asked what happens if you keep it. With spin–orbit coupling, spin-up electrons can feel an effective Chern number $+1$ and spin-down electrons $-1$. The total Chern number is zero, but a new invariant survives. It takes only two values, so it is called a $\\mathbb{Z}_2$ invariant. The edge then carries a pair of <em>helical</em> modes: spin up goes one way, spin down the other. Time-reversal symmetry forbids scattering between them, so the edge conducts. This is the quantum spin Hall effect.</p>
<p>Graphene's spin–orbit coupling turned out to be far too weak. In 2006 Bernevig, Hughes and Zhang predicted the effect in HgTe/CdTe quantum wells thicker than about 6.3 nm, where the band order inverts. In 2007 König and colleagues in Würzburg measured a conductance near $2e^2/h$ in such wells, independent of the sample width. That is the signature of two edge channels.</p>
<p>In three dimensions the edge becomes a surface. Fu, Kane and Mele generalised the invariant in 2007. Experiments with angle-resolved photoemission found surface states in Bi$_{1-x}$Sb$_x$ in 2008, and a single Dirac cone on the surface of Bi₂Se₃ in 2009. On that cone the spin is locked perpendicular to the momentum. An electron moving right has its spin pointing one way, and moving left, the other. This <strong>spin–momentum locking</strong> has been seen with spin-resolved photoemission.</p>`,
    },
    {
      title: 'History: from polyacetylene to a Nobel Prize',
      html: `<p>Su, Schrieffer and Heeger introduced their chain in 1979 to describe solitons in polyacetylene, a polymer with alternating single and double carbon bonds. A domain wall between the two bond patterns carries a zero-energy state, the same physics as the end states here.</p>
<p>In the 1970s Kosterlitz and Thouless explained a phase transition in 2D systems driven by vortices, a topological defect. In the 1980s Thouless (with TKNN) tied the quantum Hall effect to topology, and Haldane found topological effects in spin chains and in his honeycomb model. The 2016 Nobel Prize in Physics went half to David Thouless and half jointly to Duncan Haldane and Michael Kosterlitz, "for theoretical discoveries of topological phase transitions and topological phases of matter".</p>
<p>The idea has spread beyond electrons. In 2009 Wang, Chong, Joannopoulos and Soljačić observed one-way electromagnetic edge modes in a magnetised photonic crystal at microwave frequencies. Since then topological edge modes have been built in coupled optical waveguides, in mechanical lattices of springs and pendulums, and in acoustic crystals. These are classical waves, but the band topology is the same mathematics.</p>`,
    },
    {
      title: 'Topological qubits: what is and is not established',
      html: `<p>Some topological superconductors are predicted to host <em>Majorana zero modes</em> at their ends. Kitaev's 2001 chain model is the simplest example, and it is a close cousin of the SSH chain. Information stored jointly in two distant Majorana modes would be hidden from local noise. Braiding them would carry out gates fixed by topology. That is the idea behind topological quantum computing.</p>
<p>The experimental record is mixed. Zero-bias conductance peaks in semiconductor nanowires with superconducting contacts, first reported in 2012, are consistent with Majorana modes, but other effects can produce similar peaks. A 2018 Nature paper claiming quantized Majorana conductance was retracted in 2021.</p>
<p>Microsoft has pursued this route for many years. In 2023 its team reported devices that passed a "topological gap protocol" it designed. In February 2025 it announced a chip it calls Majorana 1, together with a Nature paper on parity measurements in InAs–Al devices. The journal's editors added a note that the results do not represent evidence for Majorana zero modes in the reported devices. Several independent physicists have questioned the protocol and the data. Microsoft has since presented more data and maintains its interpretation. As of this writing, no topological qubit has been independently confirmed. The question is open and actively pursued.</p>`,
    },
  ],
  challenges: [
    {
      id: 'cross',
      title: 'Cross the transition',
      prompt: 'Start in the trivial phase (ν = 0), then cross into the topological phase so the winding jumps to 1 and edge states appear at both ends.',
      hint: 'Push v/w above 1 until the glow disappears and the loop leaves the origin outside. Then bring it back below 1.',
      check: (s) => s.crossed === true && s.winding === 1 && (s.edgeWeight as number) > 0.6,
    },
    {
      id: 'close',
      title: 'Catch the gap closing',
      prompt: 'Put the chain right at the transition, where the loop runs through the origin and the bulk gap is almost zero.',
      hint: 'Set v/w within 0.01 of 1. Watch the gap readout and the loop in the corner.',
      check: (s) => Math.abs((s.vw as number) - 1) < 0.011,
    },
    {
      id: 'disorder',
      title: 'Protected by symmetry',
      prompt: 'Add strong bond disorder (at least 0.3) and keep the edge states: energy below 10⁻³ with most of the weight on the ends.',
      hint: 'Stay well inside the topological phase, v/w about 0.5 or less, with a chain of 12 cells or more.',
      check: (s) => (s.disorder as number) >= 0.3 && s.winding === 1 && (s.edgeE as number) < 1e-3 && (s.edgeWeight as number) > 0.8,
    },
    {
      id: 'chern',
      title: 'Both signs of Chern',
      prompt: 'Find a Chern insulator with C = +1 and one with C = −1. Watch which way the edge modes tilt.',
      hint: 'In the Chern ribbon view, sweep u from positive to negative. The sign flips when the gap closes at u = 0.',
      check: (s) => s.sawCplus === true && s.sawCminus === true,
    },
  ],
  caveats: `<p>All models here are tight-binding toys with one or two orbitals per site and no electron–electron interactions. Real topological materials need realistic band structures and spin–orbit coupling. The SSH chain describes polyacetylene only roughly.</p>
<p>The disorder slider varies bond strengths, which keeps the chiral symmetry that protects the SSH zero modes. Random on-site energies would break that symmetry and shift the end states away from zero, though they remain localized while the gap is open. In the ribbon, the disorder is a random potential that varies across the strip but not along it, so $k_x$ still labels the states. The winding readout uses the clean bulk values of $v$ and $w$. Strong disorder near $v = w$ can change the phase locally, which a real-space invariant would capture.</p>
<p>The doughnut and sphere are an analogy. Band topology lives in momentum space, not in the shape of the crystal. The Z₂ section is qualitative only.</p>`,
  further: [
    { label: 'Asbóth, Oroszlány, Pályi: A Short Course on Topological Insulators (arXiv)', url: 'https://arxiv.org/abs/1509.02295' },
    { label: 'Hasan and Kane, Rev. Mod. Phys. 82, 3045 (2010)', url: 'https://doi.org/10.1103/RevModPhys.82.3045' },
    { label: 'Fukui, Hatsugai, Suzuki, J. Phys. Soc. Jpn. 74, 1674 (2005)', url: 'https://doi.org/10.1143/JPSJ.74.1674' },
    { label: 'The Nobel Prize in Physics 2016', url: 'https://www.nobelprize.org/prizes/physics/2016/summary/' },
  ],
};
