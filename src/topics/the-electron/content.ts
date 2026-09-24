import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">The electron was the first elementary particle ever found. More than a century later it is still the one we know best. It carries one unit of negative charge, has a tiny mass, spins, and acts as a little magnet.</p>
<p>It also seems to have <strong>no size at all</strong>. Collider experiments have probed it down to about $10^{-18}$ m, a thousand times smaller than a proton, and found no structure. As far as anyone can tell it is a point.</p>
<p>A bare point is not the full picture, though. Quantum theory says empty space around the electron is never quite empty. Short-lived photons and electron–positron pairs flicker in and out. The glowing haze in the scene is a <strong>cartoon</strong> of that. Physicists call the real effect vacuum polarization, and it slightly screens the charge you see from far away.</p>
<p>That haze leaves a fingerprint on the electron's magnet. Paul Dirac's 1928 theory says the magnet should be exactly twice as strong as a naive spinning charge suggests, a factor called $g = 2$. The real electron is stronger by about one part in a thousand. That tiny excess is <em>the most precisely tested prediction in all of science</em>. Theory and a single electron held in a magnetic trap agree to about twelve digits.</p>
<p>The scene has four views. <b>Cloud</b> shows the point and its virtual haze. <b>Spin</b> shows the electron's magnet turning in a field. <b>Trap</b> shows how one electron is caught and measured. <b>Scale</b> zooms from a metre down to the smallest distance probed. The corner chart tracks how well theory matches experiment as you add terms.</p>`,
  tryFirst: [
    'Slide <b>QED order</b> from 0 up to 6. Each step adds one more layer of virtual particles. Watch the gap to experiment in the corner chart shrink by factors of a hundred to a thousand.',
    'Switch the view to <b>Spin</b> and raise the <b>B field</b>. The arrow circles faster. At 1 T the real electron turns 28 billion times per second.',
    'Switch to <b>Trap</b> and press <b>Load electron</b>. Watch the three motions: a fast small circle, a bounce up and down, and a slow drift around the centre.',
    'Switch to <b>Scale</b> and drag the <b>Zoom</b> slider down. An atom, a nucleus and a proton each swell past you. The electron never shows a surface.',
  ],
  equation: {
    tex: 'a_e \\;=\\; \\frac{g-2}{2} \\;=\\; \\frac{\\alpha}{2\\pi} \\;+\\; \\dots',
    caption: 'Dirac\'s equation gives exactly g = 2. Everything beyond that is the anomaly a_e, and quantum electrodynamics predicts it as a series in the fine-structure constant α.',
    terms: [
      { tex: 'a_e', name: 'Anomaly', meaning: 'How much the electron\'s magnet exceeds Dirac\'s value. Measured as $0.001\\,159\\,652\\,180\\,59(13)$ in 2023.', param: 'aExp' },
      { tex: 'g', name: 'g-factor', meaning: 'The ratio of the magnet to the spin, in natural units. Dirac says 2. The prediction readout shows the value at the chosen QED order.', param: 'gPred' },
      { tex: '\\alpha', name: 'Fine-structure constant', meaning: 'The strength of electromagnetism, about $1/137$. Two atom-recoil experiments disagree about its tenth digit. Pick which one feeds the prediction.', param: 'alphaSrc' },
      { tex: '\\frac{\\alpha}{2\\pi}', name: 'Schwinger term', meaning: 'The one-loop result, about $0.0011614$. It gets 99.85% of the anomaly on its own.', param: 'schwinger' },
      { tex: '\\dots', name: 'Higher orders', meaning: 'Terms in $(\\alpha/\\pi)^2, (\\alpha/\\pi)^3, \\dots$, each from more virtual photons and pairs. Set how many with the QED order slider.', param: 'order' },
    ],
  },
  physicsNotes: `
<h3>The electron in numbers</h3>
<p>All values are CODATA 2018 unless noted.</p>
<ul>
<li>Charge $-e$ with $e = 1.602\\,176\\,634\\times10^{-19}$ C (exact by definition since 2019).</li>
<li>Mass $m_e = 9.109\\,383\\,7015\\times10^{-31}$ kg, or $m_ec^2 = 0.510\\,998\\,950$ MeV.</li>
<li>Spin $\\tfrac12$. Any measurement of spin along an axis gives $+\\hbar/2$ or $-\\hbar/2$.</li>
<li>Magnetic moment $\\vec\\mu = -g\\,\\mu_B\\,\\vec S/\\hbar$, with Bohr magneton $\\mu_B = e\\hbar/2m_e = 9.274\\times10^{-24}$ J/T. The minus sign means the magnet points opposite the spin.</li>
</ul>
<h3>Two lengths that are not its size</h3>
<p>The <strong>Compton wavelength</strong> $\\lambda_C = h/m_ec = 2.426\\times10^{-12}$ m is the scale where pinning an electron down costs enough energy to make new pairs. The <strong>classical electron radius</strong> $r_e = \\alpha\\,\\hbar/m_ec = 2.818\\times10^{-15}$ m is the size a ball of charge would need for its field energy to equal $m_ec^2$. Both are useful. Neither is a measured size. Scattering experiments find no structure down to about $10^{-18}$ m.</p>
<h3>Spin in a field</h3>
<p>The field turns the magnet, and the magnet drags the spin with it. The spin precesses around $\\vec B$ like a tilted top, at</p>
$$\\omega = \\frac{g\\,\\mu_B B}{\\hbar}, \\qquad \\frac{\\omega}{2\\pi} \\approx 28.025\\ \\text{GHz per tesla}.$$
<p>A charged electron moving in the same field also circles at the cyclotron frequency $eB/2\\pi m_e \\approx 27.992$ GHz per tesla. If $g$ were exactly 2 the two would be equal. The small gap between them is $a_e$ times the cyclotron frequency. Measuring that gap is how $g$ is found.</p>
<h3>The QED series</h3>
<p>Quantum electrodynamics writes the anomaly as a power series in $\\alpha/\\pi \\approx 0.00232$:</p>
$$a_e = \\tfrac12\\left(\\tfrac{\\alpha}{\\pi}\\right) - 0.328\\,478\\,966\\left(\\tfrac{\\alpha}{\\pi}\\right)^2 + 1.181\\,241\\,457\\left(\\tfrac{\\alpha}{\\pi}\\right)^3 - 1.912\\,245\\,765\\left(\\tfrac{\\alpha}{\\pi}\\right)^4 + 6.737\\left(\\tfrac{\\alpha}{\\pi}\\right)^5 + \\dots$$
<p>The first four coefficients are known exactly or to many digits. The fifth takes about 12,672 Feynman diagrams and is still debated. Small extra pieces from muon and tau loops, hadrons and the weak force add about $4.5\\times10^{-12}$. Order 6 on the slider includes them.</p>`,
  deep: [
    {
      title: 'Discovery: Thomson and Millikan',
      html: `<p>In 1897 J. J. Thomson bent cathode rays with electric and magnetic fields. The bending gave the ratio of charge to mass, and it was more than a thousand times larger than for a hydrogen ion. Either the charge was huge or the mass was tiny. He argued the rays were made of small particles common to all matter. He called them corpuscles. We call them electrons.</p>
<p>Robert Millikan pinned down the charge itself in oil-drop experiments starting in 1909. He balanced tiny charged droplets between two plates and found their charges always came in whole multiples of one smallest value. That value is $e$. Since 2019 the SI units are defined so that $e$ is exact.</p>`,
    },
    {
      title: 'Dirac: spin, g = 2, and antimatter',
      html: `<p>In 1928 Paul Dirac wrote a wave equation for the electron that respects special relativity. Two surprises fell out. The first was spin one half with a magnetic moment of exactly $g = 2$. Nobody had put spin in by hand. It came from combining quantum mechanics with relativity.</p>
<p>The second surprise was a set of negative-energy solutions. Dirac eventually read them as a new particle with the electron's mass and the opposite charge. Carl Anderson found this positron in cosmic rays in 1932. See the <a href="#/t/antimatter">antimatter</a> page.</p>
<p>Spin had already shown up in 1922, before anyone knew what it was. Otto Stern and Walther Gerlach sent silver atoms through a non-uniform magnet. Silver's magnetism comes from one unpaired electron. A classical magnet could point any way, so the beam should have smeared out. It split into <strong>two spots</strong>. The spin view shows this pattern in its corner. For an illustrative beam of silver at 500 m/s crossing 3.5 cm of a 1000 T/m gradient, each spot moves about 0.13 mm.</p>`,
    },
    {
      title: 'Schwinger, Feynman, Tomonaga and the first correction',
      html: `<p>In 1947 Polykarp Kusch and Henry Foley measured atomic spectra precisely enough to see that $g$ was not quite 2. It was bigger by about 0.1%. At the same time Willis Lamb found a small shift in hydrogen levels that Dirac's theory missed.</p>
<p>Julian Schwinger explained the magnetic excess in 1948. The electron keeps emitting and reabsorbing a virtual photon, and this adds</p>
$$a_e^{(1)} = \\frac{\\alpha}{2\\pi} \\approx 0.001\\,161\\,4.$$
<p>Richard Feynman, Sin-Itiro Tomonaga and Schwinger each built a consistent way to handle these loops, which had been plagued by infinities. The trick, renormalization, absorbs the infinities into the measured charge and mass. The three shared the 1965 Nobel Prize. Feynman's diagrams became the standard bookkeeping. See <a href="#/t/feynman-diagrams">Feynman diagrams</a>.</p>`,
    },
    {
      title: 'One electron in a trap',
      html: `<p>The best measurement uses a single electron held for months in a <strong>Penning trap</strong>. A strong uniform magnetic field makes it circle, and a weak electric quadrupole field from shaped electrodes pushes it back to the centre along the field axis. The motion splits into three parts:</p>
<ul>
<li><b>cyclotron</b>: fast, small circles set by $B$,</li>
<li><b>axial</b>: a bounce along the field, which is what the electronics detect,</li>
<li><b>magnetron</b>: a slow drift around the trap centre, near $\\nu_z^2/2\\nu_c$.</li>
</ul>
<p>In the 2008 Harvard trap of D. Hanneke, S. Fogwell and G. Gabrielse these were about 150 GHz, 200 MHz and 134 kHz in a 5.36 T field. The trap is cooled well below 1 K, so the cyclotron motion sits in its lowest few quantum levels. Researchers drive quantum jumps in the cyclotron and spin states and read them out through tiny shifts in the axial frequency. In the ratio $a_e \\approx \\nu_a/\\nu_c$ the field strength cancels. Small, well-studied corrections for the trap and its cavity are applied on top. X. Fan, T. G. Myers, B. A. D. Sukra and G. Gabrielse reported $a_e = 0.001\\,159\\,652\\,180\\,59(13)$ in 2023, an uncertainty of 0.11 parts per billion in $a_e$ and 0.13 parts per trillion in $g$.</p>`,
    },
    {
      title: 'Twelve digits, and a tension about α',
      html: `<p>To predict $a_e$ you must know $\\alpha$. The best values come from atom interferometers that measure how much an atom recoils when it absorbs a photon. Two groups disagree:</p>
<ul>
<li>caesium (Parker et al., 2018): $1/\\alpha = 137.035\\,999\\,046(27)$,</li>
<li>rubidium (Morel et al., 2020): $1/\\alpha = 137.035\\,999\\,206(11)$.</li>
</ul>
<p>They differ by more than five standard deviations. With caesium the full prediction is about $1.0\\times10^{-12}$ above the measured $a_e$. With rubidium it is about $0.3\\times10^{-12}$ below. Either way theory and experiment agree in roughly the first twelve digits of $g/2 = 1.001\\,159\\,652\\,18\\dots$ The measurement is now ten times sharper than the disagreement over $\\alpha$, so the electron cannot yet say whether new physics lurks at the next digit. Flip the <b>α from</b> control to see both.</p>
<p>The heavier muon is far more sensitive to unknown particles. The <a href="#/t/muon-g2">muon g−2</a> page covers that story.</p>`,
    },
  ],
  challenges: [
    {
      id: 'twelve',
      title: 'Loop by loop',
      prompt: 'Add QED terms until the predicted $a_e$ matches the measured value to better than $10^{-9}$.',
      hint: 'Each order is about a thousand times smaller than the last. The Schwinger term alone misses by about $2\\times10^{-6}$.',
      check: (s) => (s.gapAbs as number) < 1e-9,
    },
    {
      id: 'smallest',
      title: 'Down to the limit',
      prompt: 'In the Scale view, zoom all the way to $10^{-18}$ m, the smallest distance at which the electron has been probed.',
      hint: 'Drag the Zoom slider to its bottom. Watch the atom, the nucleus and the proton go past.',
      check: (s) => s.view === 'scale' && (s.zoomExp as number) <= -18,
    },
    {
      id: 'ghz',
      title: '28 billion turns a second',
      prompt: 'Make the electron spin precess at 28 GHz.',
      hint: 'The rate is about 28.025 GHz per tesla. Set the B field to 1 T.',
      check: (s) => Math.abs((s.spinGHz as number) - 28) < 0.15,
    },
    {
      id: 'trap',
      title: 'Catch one electron',
      prompt: 'Load an electron into the Penning trap and let it bounce through 20 axial oscillations.',
      hint: 'Switch to the Trap view and press Load electron. The counter in the panel tracks the bounces.',
      check: (s) => s.trapLoaded === true && (s.axialCount as number) >= 20,
    },
  ],
  caveats: `<p>The haze around the electron is a heuristic picture. Virtual particles are terms in a calculation, not little objects you could photograph. The real, measurable effects are vacuum polarization and the loop corrections to $g$.</p>
<p>The spin arrow is a classical vector. A real electron spin is a quantum state, and only its average behaves like this arrow. Precession and trap motion are slowed by many orders of magnitude so you can see them. The trap electrodes and the three motions are drawn to scale only loosely, and the real magnetron orbit is far smaller relative to the trap.</p>
<p>The prediction uses the published QED coefficients. The five-loop coefficient 6.737 comes from Aoyama, Kinoshita and Nio (2019). An independent calculation by Volkov (2024) gets 5.891, a 5σ disagreement. That changes $a_e$ by only about $6\\times10^{-14}$, below the current measurement error. The "$10^{-18}$ m" size limit is a rough summary of collider searches for electron structure, not a single measured number.</p>`,
  further: [
    { label: 'Fan et al., Measurement of the electron magnetic moment (2023)', url: 'https://doi.org/10.1103/PhysRevLett.130.071801' },
    { label: 'Aoyama, Kinoshita, Nio, Theory of the anomalous magnetic moment of the electron (2019)', url: 'https://doi.org/10.3390/atoms7010028' },
    { label: 'CODATA 2018 constants (NIST)', url: 'https://physics.nist.gov/cuu/Constants/' },
    { label: 'Electron on Wikipedia', url: 'https://en.wikipedia.org/wiki/Electron' },
  ],
};
