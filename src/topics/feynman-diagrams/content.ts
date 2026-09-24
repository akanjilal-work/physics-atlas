import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Quantum electrodynamics, QED, is the theory of light and electrons. It predicts the electron's magnetic strength to about one part in a trillion. Most of that work is done with little stick drawings called Feynman diagrams.</p>
<p>A diagram is a recipe for one number. Straight lines are electrons, muons or positrons. Wavy lines are photons. Every place where a photon line touches a charged line is a <strong>vertex</strong>, and each vertex multiplies the answer by the same small factor, about $\\sqrt{1/137}$. On the board, time runs up the page.</p>
<p>The first surprise is that <strong>you never draw just one diagram</strong>. When an electron meets a positron and they scatter, they can annihilate into a photon (left picture) or swap a photon while flying past (right picture). Nature does both at once. You add the two numbers first and only then square the sum. So the pictures can reinforce or cancel each other. That is interference, the same thing that makes fringes in a double slit.</p>
<p>The second surprise is the <strong>inner lines</strong>. The photon in the middle of a diagram is called virtual. It is not a tiny ball flying from one electron to the other. It is one term in a sum, and it does not even obey $E = pc$ the way a real photon does. The animation shows this: real particles move as dots, while virtual lines only light up.</p>
<p>The third surprise is how well it works. Each extra loop of photons costs another factor of about $\\alpha/\\pi \\approx 1/430$. So a handful of diagrams already gives a very precise answer. The right-hand plot shows the outcome: the shape of where particles fly, which you could measure in a detector.</p>`,
  tryFirst: [
    'Watch the glowing "now" line sweep up the board. Dots are real particles. Inner lines only flash, because virtual particles are not travelling balls.',
    'Drag the <b>probe angle</b> toward 0°. For muon pairs the rate at the beam line is exactly twice the rate at 90°. That is $1 + \\cos^2\\theta$.',
    'Switch to <b>Bhabha</b> and drag the probe to small angles. The forward spike comes from the photon-exchange diagram.',
    'Turn one Bhabha diagram off. The white curve changes and the interference readout goes to zero.',
    'Drag a white vertex on the board. The picture changes, the cross section does not. Only the connections matter.',
  ],
  equation: {
    tex: '\\sigma(e^+e^-\\to\\mu^+\\mu^-) = \\frac{4\\pi\\alpha^2}{3s}',
    caption: 'The total rate for an electron and a positron to annihilate into a muon pair, from one Feynman diagram, at energies far above the muon mass.',
    terms: [
      { tex: '\\sigma', name: 'Cross section', meaning: 'The effective target area for the reaction. At $\\sqrt{s} = 10$ GeV it is 0.87 nanobarn, about $10^{-33}$ cm².', param: 'sigma' },
      { tex: '\\alpha^2', name: 'Two vertices', meaning: 'Each vertex gives the amplitude a factor $e = \\sqrt{4\\pi\\alpha}$. Two vertices, squared, give $\\alpha^2$ with $\\alpha \\approx 1/137$.', param: 'alpha' },
      { tex: 's', name: 'Energy squared', meaning: 'The square of the total collision energy, $s = E_{\\text{cm}}^2$. Doubling $\\sqrt{s}$ cuts the rate by four.', param: 'energy' },
      { tex: '\\frac{4\\pi}{3}', name: 'Angular integral', meaning: 'Comes from integrating $\\frac{\\alpha^2}{4s}(1+\\cos^2\\theta)$ over all directions: $\\int (1+\\cos^2\\theta)\\,d\\Omega = 16\\pi/3$.', param: 'ratio90' },
    ],
  },
  physicsNotes: `
<h3>From picture to number</h3>
<p>Each piece of a diagram stands for a factor. An outside fermion line gives a spinor. A vertex gives $-ie\\gamma^\\mu$ with $e = \\sqrt{4\\pi\\alpha} \\approx 0.303$. An inner photon line gives the propagator $-ig_{\\mu\\nu}/q^2$, where $q$ is the momentum it carries. Multiply them, sum over the spins you cannot see, average over the ones you do not control, and you get $\\overline{|\\mathcal M|^2}$. In the centre-of-mass frame with massless particles,</p>
$$\\frac{d\\sigma}{d\\Omega} = \\frac{\\overline{|\\mathcal M|^2}}{64\\pi^2 s}.$$
<p>For $e^+e^-\\to\\mu^+\\mu^-$ the single s-channel diagram gives $\\overline{|\\mathcal M|^2} = e^4(1+\\cos^2\\theta)$, so $d\\sigma/d\\Omega = \\frac{\\alpha^2}{4s}(1+\\cos^2\\theta)$. The $1+\\cos^2\\theta$ comes from spin. The photon carries one unit of angular momentum along the beam, and the muons must carry it away.</p>
<h3>The four processes in the scene</h3>
<p>Using the Mandelstam variables $t = -\\tfrac{s}{2}(1-\\cos\\theta)$ and $u = -\\tfrac{s}{2}(1+\\cos\\theta)$ at high energy:</p>
$$\\text{Bhabha: } \\frac{d\\sigma}{d\\Omega} = \\frac{\\alpha^2}{2s}\\left[\\frac{s^2+u^2}{t^2} + \\frac{2u^2}{st} + \\frac{t^2+u^2}{s^2}\\right]$$
$$\\text{Møller: } \\frac{d\\sigma}{d\\Omega} = \\frac{\\alpha^2}{2s}\\left[\\frac{s^2+u^2}{t^2} + \\frac{s^2+t^2}{u^2} + \\frac{2s^2}{tu}\\right]$$
<p>In each bracket, the first two pieces are single diagrams squared and the cross term is interference. The $1/t^2$ piece is the forward spike. Photon exchange with small momentum transfer is long range, so most scatters are glancing blows. The total diverges at $\\theta \\to 0$, so the scene counts only $10^\\circ < \\theta < 170^\\circ$, as a real detector would.</p>
<p>Compton scattering $\\gamma e^-\\to\\gamma e^-$ with the electron at rest gives the Klein–Nishina formula, with $P = E'/E = 1/[1 + k(1-\\cos\\theta)]$ and $k = E_\\gamma/m_ec^2$:</p>
$$\\frac{d\\sigma}{d\\Omega} = \\frac{r_e^2}{2}\\,P^2\\left(P + \\frac1P - \\sin^2\\theta\\right).$$
<h3>How the page computes</h3>
<p>Every curve comes from these closed forms. The total cross section is also found by integrating the angular distribution numerically with Simpson's rule. The accuracy readout compares that integral with the exact answer where one exists.</p>`,
  deep: [
    {
      title: 'Amplitudes add, then you square',
      html: `<p>Quantum mechanics adds amplitudes, not probabilities. For Bhabha scattering</p>
$$|\\mathcal M_s + \\mathcal M_t|^2 = |\\mathcal M_s|^2 + |\\mathcal M_t|^2 + 2\\,\\text{Re}(\\mathcal M_s\\mathcal M_t^*).$$
<p>The last term can have either sign. In Bhabha scattering it is negative, a relative minus sign that comes from swapping two fermions. In Møller scattering $e^-e^-\\to e^-e^-$ the two diagrams differ by exchanging the identical outgoing electrons, and the cross term is positive. Turn a diagram off in the scene and the interference readout drops to zero, while the curve changes shape.</p>
<p>One honest warning. In Bhabha and Møller scattering each diagram alone is gauge invariant, so looking at it alone is meaningful as an exercise. In Compton scattering it is not. Only the sum of the two diagrams gives a physical answer, which is why the scene will not split them.</p>`,
    },
    {
      title: 'Virtual particles are terms, not balls',
      html: `<p>A real photon has $q^2 = E^2 - |\\vec p|^2 = 0$. The photon inside the muon-pair diagram carries all the collision energy and no momentum, so $q^2 = s$. That is $(10\\ \\text{GeV})^2$ at the default setting, very far from zero. The exchanged photon in Bhabha scattering has $q^2 = t < 0$, which no free particle can ever have. The scene's <b>q²</b> readout shows these numbers.</p>
<p>So the inner line is not a particle you could catch. It is the propagator $1/q^2$, one factor in an integral. Pictures of electrons "throwing photons" at each other are a helpful story for repulsion, but they fail for attraction and they fail for time ordering. A Feynman diagram already includes every time ordering of its vertices at once. Treat the inner lines as bookkeeping.</p>`,
    },
    {
      title: 'The loop expansion',
      html: `<p>Diagrams are the terms of a perturbation series in $\\alpha$. Tree diagrams have no closed loops. Each extra loop adds two vertices, so a factor $e^2 = 4\\pi\\alpha$, and the loop integral usually brings a $1/(4\\pi^2)$ or so. The net cost per loop is roughly $\\alpha/\\pi \\approx 0.0023$.</p>
<p>The electron's anomalous magnetic moment is the showcase. Julian Schwinger found the one-loop term $a_e = \\alpha/2\\pi \\approx 0.00116$ in 1948. The number of diagrams grows fast: 1 at one loop, 7 at two, 72 at three, 891 at four and 12,672 at five loops. The five-loop coefficients have been computed, and theory and experiment agree to better than one part in a billion in $a_e$, with a known tension between different measurements of $\\alpha$ itself.</p>
<p>The loop slider only shows the rough size $(\\alpha/\\pi)^n$. The real coefficients are numbers of order one that must each be calculated. Loops also bring infinities that renormalization absorbs into the measured charge and mass. The series itself is believed to be asymptotic rather than convergent, as Dyson argued in 1952, but the trouble would only appear around order $1/\\alpha \\approx 137$.</p>`,
    },
    {
      title: 'Shelter Island, Pocono and Dyson',
      html: `<p>In June 1947 a small meeting on Shelter Island, New York, heard Willis Lamb report that two hydrogen levels predicted to be equal were split by about 1 GHz. Hints of an anomalous electron magnetic moment were also discussed. Old QED gave infinite answers for such effects. The race to tame them began.</p>
<p>At the Pocono Manor conference in spring 1948, Julian Schwinger gave a long formal calculation that impressed the audience. Richard Feynman then presented his diagram method, which confused them. Niels Bohr and others objected to its paths moving backward in time. Feynman published the method in 1949 in two papers in <em>Physical Review</em>. Sin-Itiro Tomonaga had reached Schwinger-style results independently in Japan.</p>
<p>Freeman Dyson, in his 1949 paper "The Radiation Theories of Tomonaga, Schwinger, and Feynman", proved that the approaches were equivalent. He derived Feynman's rules from the field theory and showed how to use them systematically. That is when diagrams became the standard tool. Tomonaga, Schwinger and Feynman shared the 1965 Nobel Prize.</p>`,
    },
    {
      title: 'Counting quark colours, and the Thomson limit',
      html: `<p>Replace the muons with a quark and antiquark. The diagram is the same except that the charge $e$ at the upper vertex becomes $q_f e$, and the quark comes in $N_c$ colours. So, ignoring small strong-force corrections,</p>
$$R = \\frac{\\sigma(e^+e^-\\to\\text{hadrons})}{\\sigma(e^+e^-\\to\\mu^+\\mu^-)} = N_c\\sum_f q_f^2.$$
<p>With u, d, s this gives 2 if $N_c = 3$ and only $2/3$ without colour. Adding charm gives $10/3$ and bottom $11/3$. Measured R sits near these steps, about 5 to 10% higher because of the strong-force correction $1+\\alpha_s/\\pi$. This was key evidence that quarks come in three colours. The inset draws the naive steps.</p>
<p>Compton scattering has two limits. When $k = E_\\gamma/m_ec^2 \\ll 1$, $P \\to 1$ and Klein–Nishina becomes the classical Thomson result $\\frac{r_e^2}{2}(1+\\cos^2\\theta)$, with total $\\sigma_T = \\frac{8\\pi}{3}r_e^2 = 0.665$ barn. The shape is again $1 + \\cos^2\\theta$. When $k \\gg 1$, $\\sigma \\approx \\frac{\\pi r_e^2}{k}(\\ln 2k + \\tfrac12)$ and the scattering becomes strongly forward. Oskar Klein and Yoshio Nishina published the formula in 1929.</p>`,
    },
  ],
  challenges: [
    {
      id: 'forward',
      title: 'Find the forward peak',
      prompt: 'In Bhabha scattering, with the photon-exchange (t-channel) diagram on, find an angle where $d\\sigma/d\\Omega$ is more than 100 times its value at 90°.',
      hint: 'Choose Bhabha and drag the probe angle down toward 10°. Watch the ratio readout.',
      check: (s) => s.process === 'bhabha' && s.chanB === true && (s.ratio90 as number) > 100,
    },
    {
      id: 'shape',
      title: 'Twice as likely along the beam',
      prompt: 'For $e^+e^-\\to\\mu^+\\mu^-$, find a probe angle where the rate is at least 1.9 times the rate at 90°.',
      hint: '$1 + \\cos^2\\theta$ reaches 2 only when $\\cos\\theta = \\pm1$. Try below 18° or above 162°.',
      check: (s) => s.process === 'mumu' && (s.ratio90 as number) >= 1.9,
    },
    {
      id: 'quarter',
      title: 'Double the energy, quarter the rate',
      prompt: 'For muon pairs, double $\\sqrt{s}$ relative to the pinned reference and check that $\\sigma$ drops by a factor of 4.',
      hint: 'The reference is pinned when you pick the process, or with the Pin button. Go from 10 GeV to 20 GeV.',
      check: (s) => s.process === 'mumu' && Math.abs((s.energyRatio as number) - 2) < 0.05 && Math.abs((s.sigmaRatio as number) - 4) < 0.25,
    },
    {
      id: 'interference',
      title: 'Switch off a diagram',
      prompt: 'In Bhabha scattering, turn off exactly one of the two diagrams and see what happens to the interference.',
      hint: 'Use the s-channel or t-channel toggle. With one diagram there is nothing to interfere with.',
      check: (s) => s.process === 'bhabha' && s.chanA !== s.chanB,
    },
  ],
  caveats: `<p>Everything here is lowest order (tree level) in pure QED. The e⁺e⁻ formulas assume all masses are negligible, which is fine far above threshold. The Z boson is left out. In reality it adds a forward-backward asymmetry that is already visible at 30 to 40 GeV and a huge peak at 91 GeV, so the energy range stops at 40 GeV.</p>
<p>The coupling is fixed at α = 1/137.036. In a real calculation it runs, reaching about 1/128 at 91 GeV. The loop slider shows only the rough size (α/π)ⁿ of higher orders, not a calculation. The R-ratio inset uses sharp thresholds and ignores resonances such as the J/ψ and Υ and the strong-force correction.</p>
<p>The Bhabha and Møller totals depend on the 10° angular cut, because the full integral diverges. The Compton plot is in the electron rest frame and shows the photon's angle. Dragging a vertex changes only the drawing.</p>`,
  further: [
    { label: 'Feynman diagram on Wikipedia', url: 'https://en.wikipedia.org/wiki/Feynman_diagram' },
    { label: 'F. J. Dyson, The Radiation Theories of Tomonaga, Schwinger, and Feynman, Phys. Rev. 75, 486 (1949)', url: 'https://doi.org/10.1103/PhysRev.75.486' },
    { label: 'R. P. Feynman, Space-Time Approach to Quantum Electrodynamics, Phys. Rev. 76, 769 (1949)', url: 'https://doi.org/10.1103/PhysRev.76.769' },
    { label: 'Klein–Nishina formula on Wikipedia', url: 'https://en.wikipedia.org/wiki/Klein%E2%80%93Nishina_formula' },
  ],
};
