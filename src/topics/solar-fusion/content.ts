import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Every second the Sun turns about 600 million tonnes of hydrogen into helium. Yet by the rules of classical physics it should not be able to turn any.</p>
<p>The fuel is protons. Protons are all positively charged, so they push each other away. To fuse, two of them must get within a few femtometres, a few millionths of a billionth of a metre. There the strong nuclear force grabs them. Getting that close means climbing an electric hill about <strong>550 keV</strong> high.</p>
<p>The centre of the Sun is about 15.7 million kelvin. That sounds hot, but a typical proton there carries only about <strong>1.35 keV</strong> of thermal energy. The hill is 400 times higher. Even the rare fast protons in the tail of the speed distribution fall far short. A classical Sun would be dark.</p>
<p>Quantum mechanics rescues it. A proton is also a wave, and a wave leaks through walls. The leak is tiny, but the core holds about $10^{56}$ protons. So a steady trickle of them tunnels through and fuses. The winners are protons a little faster than average. Very fast protons tunnel easily but almost none exist. Slow ones are common but almost never tunnel. The sweet spot, near 6 keV, is called the <strong>Gamow peak</strong>. The inset plots it.</p>
<p>Then comes a second bottleneck. When two protons touch, one must turn into a neutron to make a deuteron. Only the weak force can do that, and it almost never succeeds in the brief moment of contact. So an average proton in the core waits billions of years before it fuses. That slowness is why the Sun has shone steadily for 4.6 billion years and will keep going for about 5 billion more.</p>
<p>In the <b>Chain</b> view, watch the three reactions of the pp-I chain. Red balls are protons, grey balls are neutrons. Four protons go in. One helium nucleus comes out, plus two positrons that vanish in flashes of light and two ghostly neutrinos that leave the Sun at once. In the <b>Barrier</b> view, see the electric hill that every pair must tunnel through.</p>`,
  tryFirst: [
    'Press <b>Step</b> to run the chain one reaction at a time. Watch the energy tally in the readouts climb to 26.73 MeV.',
    'Switch to the <b>Barrier</b> view. The amber plane is the collision energy. Where it meets the cone, a classical proton turns back.',
    'Drag the <b>core temperature</b> up and down. Watch the product curve in the inset slide and the proton wait time change by factors of thousands.',
    'Switch the <b>pair</b> to p + ¹⁴N. The barrier grows taller and the Gamow peak moves to higher energy.',
  ],
  equation: {
    tex: 'P \\propto e^{-\\sqrt{E_G/E}}, \\quad E_G = 2m_r c^2(\\pi\\alpha Z_1Z_2)^2',
    caption: 'The chance to tunnel through the Coulomb barrier rises steeply with energy. Multiply it by the falling Maxwell-Boltzmann tail $e^{-E/kT}$ and you get the <a href="https://en.wikipedia.org/wiki/Gamow_factor" target="_blank" rel="noopener">Gamow peak</a> in the inset, the narrow window of energies where fusion actually happens.',
    terms: [
      { tex: 'P', name: 'Tunneling probability', meaning: 'The chance that a pair at energy $E$ reaches touching distance. At 6 keV for two protons it is about $10^{-4}$.', param: 'P' },
      { tex: 'E', name: 'Collision energy', meaning: 'Kinetic energy of the pair in its centre-of-mass frame. Set it with the probe energy slider.', param: 'E' },
      { tex: 'E_G', name: 'Gamow energy', meaning: 'Sets how hard the barrier is to tunnel through. It is 493 keV for two protons and about 45 MeV for a proton and nitrogen-14.', param: 'EG' },
      { tex: 'm_r', name: 'Reduced mass', meaning: '$m_1 m_2/(m_1+m_2)$. Heavier pairs move more slowly at the same energy, so they tunnel less.', param: 'pair' },
      { tex: 'Z_1Z_2', name: 'Charges', meaning: 'The product of the two nuclear charges. It enters squared, which is why carbon and nitrogen need a much hotter core.', param: 'pair' },
      { tex: '\\alpha', name: 'Fine-structure constant', meaning: 'About 1/137. It measures the strength of the electric force.' },
    ],
  },
  physicsNotes: `
<h3>The pp-I chain and its energy budget</h3>
<p>Four protons become one helium-4 nucleus in three steps. The first two run twice.</p>
$$\\begin{aligned} p + p &\\to d + e^+ + \\nu_e & Q &= 1.442\\ \\text{MeV} \\\\ d + p &\\to {}^3\\text{He} + \\gamma & Q &= 5.493\\ \\text{MeV} \\\\ {}^3\\text{He} + {}^3\\text{He} &\\to {}^4\\text{He} + 2p & Q &= 12.860\\ \\text{MeV} \\end{aligned}$$
<p>The first $Q$ already includes the 1.022 MeV released when the positron meets an electron and both turn into gamma rays. The total is $2(1.442) + 2(5.493) + 12.860 = 26.731$ MeV. That is exactly the mass difference between four hydrogen atoms and one helium atom, about 0.7% of the mass. Each pp neutrino carries off 0.267 MeV on average, 0.53 MeV per helium. The other 26.20 MeV heats the Sun.</p>
<h3>Why a classical Sun would stay dark</h3>
<p>The electric energy of two protons at distance $r$ is $V = e^2/(4\\pi\\varepsilon_0 r) = 1.440\\ \\text{MeV fm}/r$. Take touching distance as $R = r_0(A_1^{1/3} + A_2^{1/3})$ with $r_0 = 1.3$ fm. For two protons $R = 2.6$ fm and the barrier is 554 keV. At $T = 15.7$ MK the thermal energy is $kT = 1.353$ keV. The ratio is about 410. The Maxwell-Boltzmann fraction of pairs above the barrier is roughly $e^{-410}$, about $10^{-178}$. The Sun holds only about $10^{57}$ particles.</p>
<h3>From tunneling to the Gamow peak</h3>
<p>For a pure Coulomb barrier, the WKB tunneling probability is $e^{-2\\pi\\eta}$ with $2\\pi\\eta = \\sqrt{E_G/E}$. The fusion rate adds up every energy, weighted by how many pairs have it and how likely they are to tunnel:</p>
$$\\langle\\sigma v\\rangle = \\sqrt{\\frac{8}{\\pi m_r}}\\,\\frac{1}{(kT)^{3/2}}\\int_0^\\infty S(E)\\, e^{-E/kT - \\sqrt{E_G/E}}\\,dE .$$
<p>$S(E)$, the astrophysical S factor, holds the nuclear physics and varies slowly. The exponent is largest where its derivative vanishes. That gives the Gamow peak</p>
$$E_0 = \\left(\\frac{E_G (kT)^2}{4}\\right)^{1/3} \\approx 6.1\\ \\text{keV for pp at 15.7 MK}.$$
<p>Near $E_0$ the integrand is close to a Gaussian of 1/e full width $\\Delta = 4\\sqrt{E_0 kT/3}$, about 6.6 keV. The scene integrates it numerically.</p>`,
  deep: [
    {
      title: 'Why the rate is so steep in temperature',
      html: `<p>The height of the Gamow peak is $e^{-\\tau}$ with $\\tau = 3E_0/kT$. Because $E_0 \\propto T^{2/3}$, $\\tau \\propto T^{-1/3}$. Differentiate the log of the rate and you get a local power law $\\varepsilon \\propto T^{\\nu}$ with</p>
$$\\nu \\approx \\frac{\\tau - 2}{3}.$$
<p>For pp at 15.7 MK, $\\tau \\approx 13.5$ and $\\nu \\approx 3.8$. For p + ¹⁴N, the slowest step of the CNO cycle, $E_G$ is about 90 times larger. Then $\\tau \\approx 61$ and $\\nu \\approx 20$. Raise the core temperature by 10% and pp burning rises by about 40%, while CNO burning rises about sixfold. Stars more massive than about 1.3 Suns have hotter cores, and CNO powers most of their output.</p>
<p>The readouts compute both exponents from the full numerical rate. With the composition assumed here, CNO overtakes pp near 18 to 19 MK. The exact crossover depends on how much carbon and nitrogen the star has.</p>`,
    },
    {
      title: 'The weak step: why the Sun is slow and stable',
      html: `<p>Tunneling alone would let two protons touch fairly often. But a diproton, helium-2, is not bound. It falls apart almost at once. Only if one proton turns into a neutron during that brief contact does a deuteron form. That conversion needs the weak interaction. It is so unlikely that the pp S factor is about $4\\times10^{-22}$ keV barn. That is far too small to measure in any laboratory. It is calculated from weak-interaction theory, which is tested in beta decay.</p>
<p>The result is a mean wait of several billion years for each proton in the core. This model gives about 7 billion years at 15.7 MK. The deuteron then captures another proton within seconds. The ³He waits much longer for a partner, very roughly $10^5$ years.</p>
<p>The steep temperature dependence also makes the Sun a thermostat. If the core burns too fast, it heats and expands. Expansion cools it, and the rate drops again. If it burns too slowly, the core contracts and heats up. The power density at the centre is only about 280 watts per cubic metre, less than the resting metabolism of the human body per volume. The Sun is bright because it is huge, not because its fire is fierce.</p>`,
    },
    {
      title: 'History: Eddington, Gamow, Bethe',
      html: `<p><strong>1920.</strong> Arthur Eddington addressed the British Association. Francis Aston had just measured that a helium atom weighs slightly less than four hydrogen atoms. Eddington argued that turning hydrogen into helium could power the Sun for billions of years. Critics answered that the Sun's core was far too cold for nuclei to touch. They were right by classical physics.</p>
<p><strong>1928.</strong> George Gamow, and independently Ronald Gurney and Edward Condon, explained alpha decay as quantum tunneling out of a nucleus. The same mathematics runs in reverse for particles tunneling in.</p>
<p><strong>1929.</strong> Robert Atkinson and Fritz Houtermans applied Gamow's tunneling to the stars and showed fusion could work at stellar temperatures.</p>
<p><strong>1938 to 1939.</strong> Hans Bethe and Charles Critchfield worked out the proton-proton chain. Bethe then laid out the CNO cycle in his 1939 paper "Energy Production in Stars". Carl Friedrich von Weizsäcker proposed the CNO cycle independently. Bethe received the 1967 Nobel Prize in Physics for this work.</p>`,
    },
    {
      title: 'Seeing the core: solar neutrinos',
      html: `<p>Light made in the core takes on the order of $10^5$ years to random-walk out. Neutrinos leave in about two seconds and reach Earth eight minutes later. Two neutrinos are made per helium nucleus. Divide the Sun's luminosity by 26.2 MeV, double it, and spread it over a sphere 1 AU in radius. You get about $6.5\\times10^{10}$ neutrinos per square centimetre per second at Earth. The readout computes this.</p>
<p>Raymond Davis's chlorine experiment first detected solar neutrinos in the late 1960s and found about a third of the predicted rate. This solar neutrino problem was resolved in 2001 and 2002 by the SNO experiment. It showed that neutrinos change flavour on the way.</p>
<p>The Borexino detector at Gran Sasso in Italy measured the low-energy pp neutrinos directly in 2014. That confirmed that the first step of the chain runs in the Sun at the predicted rate. In 2020 Borexino detected neutrinos from the CNO cycle. They showed that CNO supplies about 1% of the Sun's power.</p>`,
    },
    {
      title: 'Fusion on Earth: tokamaks, ITER and NIF',
      html: `<p>Reactors cannot use the pp reaction. Its weak step makes it roughly 25 orders of magnitude slower than the deuterium-tritium reaction, which needs no weak conversion. D + T gives helium-4, a neutron, and 17.6 MeV. The Sun makes up for its slow reaction with enormous size, density and time. A reactor cannot, so it runs far hotter, around 100 to 150 million kelvin, with much lower density.</p>
<p><strong>Tokamaks</strong> hold the plasma in a ring-shaped magnetic cage. ITER, under construction in southern France, is designed to produce 500 MW of fusion power from 50 MW of plasma heating. Its deuterium-tritium operation is planned for the late 2030s.</p>
<p><strong>Inertial confinement</strong> crushes a tiny fuel pellet with lasers. On 5 December 2022 the National Ignition Facility in California reached ignition for the first time. 2.05 MJ of laser light produced 3.15 MJ of fusion energy. That is a gain above one at the target. The lasers drew far more energy from the grid, so it was not yet a net power source.</p>`,
    },
  ],
  challenges: [
    {
      id: 'chain',
      title: 'Build a helium nucleus',
      prompt: 'Run the whole pp-I chain from the start: two p + p fusions, two deuteron captures, and the final ³He + ³He.',
      hint: 'In the Chain view press <b>Reset</b>, then press <b>Step</b> until the tally reads 26.73 MeV. <b>Play</b> works too.',
      check: (s) => s.chainDone === true && s.touched === true,
    },
    {
      id: 'peak',
      title: 'Find the Gamow peak',
      prompt: 'For two protons at solar-core temperature (15 to 16.5 MK), set the probe energy within 10% of the Gamow peak $E_0$.',
      hint: 'Watch the product curve in the inset. Put the white marker on its highest point. Or compute $E_0 = (E_G (kT)^2/4)^{1/3}$ from the readouts.',
      check: (s) => s.pair === 'pp' && (s.TMK as number) >= 15 && (s.TMK as number) <= 16.5 && Math.abs((s.E as number) / (s.E0 as number) - 1) < 0.1,
    },
    {
      id: 'cno',
      title: 'Hand over to CNO',
      prompt: 'Raise the core temperature until the CNO cycle makes more heat than the pp chain.',
      hint: 'Watch the <b>CNO / pp</b> readout. It rises roughly as $T^{16}$. Try about 20 million kelvin.',
      check: (s) => (s.cnoOverPp as number) > 1,
    },
    {
      id: 'classical',
      title: 'A hopeless climb',
      prompt: 'In the Barrier view with two protons at 15 to 16.5 MK, set the probe energy to the thermal energy $kT$ (within 15%). Confirm that the barrier is more than 100 times higher.',
      hint: 'Choose <b>Barrier</b>, then slide the probe energy down to about 1.35 keV. Read <b>V_C / E</b>.',
      check: (s) => s.view === 'barrier' && s.pair === 'pp' && (s.TMK as number) >= 15 && (s.TMK as number) <= 16.5 && Math.abs((s.E as number) / (s.kT as number) - 1) < 0.15 && (s.barrierRatio as number) > 100,
    },
  ],
  caveats: `<p>The chain view shows only the pp-I branch. In the Sun the pp-II and pp-III branches, through beryllium-7 and boron-8, finish a minority of the chains. The animation is a cartoon. Real reactions happen at random places and times, a proton waits billions of years for its first fusion, and nuclei are not rigid balls.</p>
<p>The barrier is a pure Coulomb hill cut off at $R = 1.3(A_1^{1/3} + A_2^{1/3})$ fm. The height depends on that choice. The nuclear well is drawn schematically and is not to scale. Both axes of the barrier plot are logarithmic, which turns the $1/r$ hill into a straight cone. The wave drawn on it is qualitative. Its real drop in amplitude is far too large to draw.</p>
<p>Rates use a constant S factor and ignore electron screening, which raises the solar pp rate by a few percent and the ¹⁴N rate by roughly 20%. Density and composition are held fixed at rough present-day solar-core values, with an assumed nitrogen-14 mass fraction of 0.5%. So the wait time and the CNO share are estimates, good to a factor of about two.</p>`,
  further: [
    { label: 'Proton-proton chain on Wikipedia', url: 'https://en.wikipedia.org/wiki/Proton%E2%80%93proton_chain' },
    { label: 'Bethe, Energy Production in Stars, Phys. Rev. 55, 434 (1939)', url: 'https://doi.org/10.1103/PhysRev.55.434' },
    { label: 'Adelberger et al., Solar fusion cross sections II (2011)', url: 'https://doi.org/10.1103/RevModPhys.83.195' },
    { label: 'Borexino, Experimental evidence of neutrinos from the CNO cycle (Nature, 2020)', url: 'https://doi.org/10.1038/s41586-020-2934-0' },
  ],
};
