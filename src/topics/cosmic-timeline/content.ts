import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Run the film of the universe backwards and it gets smaller, denser and hotter. At every step the temperature tells you what could exist. Too hot for atoms, then too hot for nuclei, then too hot even for protons.</p>
<p>The rule is simple. As space stretches, light stretches with it, and the temperature falls in step with the size. Twice as big means half as hot. Early on the universe also doubled its age very quickly, so most of the drama happens in the first few minutes. That is why the tunnel runs on a <strong>log clock</strong>. Each ring marks a factor of ten in time. A billionth of a second gets as much room as a billion years.</p>
<p>Fly through it. Each glowing station is one chapter: a soup of free quarks, the first nuclei, the flash of light we now see as the cosmic microwave background, the first star, a young galaxy, the Sun. The sky colour is the colour of the glowing plasma, while there is any glow to see. After 380,000 years the light slips from orange into the infrared and the sky goes dark.</p>
<p>Be careful with the first moments. The later chapters are measured. The first ones are guesses: nobody knows what happened at the Planck time, grand unification may not exist, and the details of inflation are open. The stations mark which is which.</p>`,
  tryFirst: [
    'Scroll over the scene, or drag up and down, to fly through time. Watch the sky change colour as the plasma cools.',
    'Press <b>Play fly-through</b> and let it carry you from the Planck era to today.',
    'Use <b>Jump to epoch</b> to land on recombination. Read the card: the photons you see as the CMB were set free here.',
    'On any card, press <b>Open topic</b> to dive into the full atlas page for that era.',
  ],
  equation: {
    tex: 'T \\approx 1.5\\ \\text{MeV}\\; g_*^{-1/4}\\left(\\frac{t}{1\\,\\text{s}}\\right)^{-1/2}',
    caption: 'The radiation-era clock. It comes from $H = 1/(2t)$ and the Friedmann equation with radiation of energy density $\\propto g_* T^4$. Underneath is $T \\propto 1/a$: light cools as space stretches.',
    terms: [
      { tex: 'T', name: 'Temperature', meaning: 'The photon temperature, written as the energy $kT$. 1 MeV is about $1.16\\times10^{10}$ K.', param: 'temp' },
      { tex: '1.5\\ \\text{MeV}', name: 'Planck-scale prefactor', meaning: 'Equal to $(45/16\\pi^3)^{1/4}\\sqrt{M_{\\text{Pl}}\\hbar/1\\,\\text{s}} \\approx 1.56$ MeV. Gravity sets how fast a hot universe cools.', param: 'energy' },
      { tex: 'g_*', name: 'Relativistic species', meaning: 'How many kinds of particle are light enough to count as radiation. It is 106.75 above 100 GeV, 10.75 at 1 MeV, and 3.38 today. More species means faster expansion at a given temperature.', param: 'gstar' },
      { tex: 't', name: 'Cosmic time', meaning: 'Time since the hot Big Bang. Drag the log time scrubber or scroll the scene.', param: 'time' },
    ],
  },
  physicsNotes: `
<h3>Where the law comes from</h3>
<p>For radiation the energy density is $\\rho = \\frac{\\pi^2}{30} g_* T^4$ (natural units). It falls as $a^{-4}$, so $a \\propto t^{1/2}$ and $H = \\dot a/a = 1/(2t)$. Put that into the Friedmann equation $H^2 = 8\\pi G\\rho/3$ and solve for $T$:</p>
$$T = \\left(\\frac{45}{16\\pi^3 g_*}\\right)^{1/4}\\sqrt{\\frac{M_{\\text{Pl}}}{t}} \\approx 1.56\\ \\text{MeV}\\; g_*^{-1/4}\\left(\\frac{t}{1\\,\\text{s}}\\right)^{-1/2}$$
<p>With $g_* = 10.75$ this gives about 0.86 MeV at one second. After electrons and positrons annihilate it becomes $t \\approx 1.32\\,\\text{s}\\,(T/\\text{MeV})^{-2}$.</p>
<h3>What the scene actually computes</h3>
<p>The headline law holds only while radiation dominates and $g_*$ is constant. The timeline instead integrates the full Friedmann equation for flat $\\Lambda$CDM with Planck 2018 values ($H_0 = 67.4$, $\\Omega_m = 0.315$):</p>
$$t = \\int \\frac{d\\ln a}{H}, \\qquad H^2 = H_0^2\\left[\\Omega_m a^{-3} + \\Omega_\\Lambda + \\Omega_r\\,\\frac{g_*(T)}{g_{*0}}\\left(\\frac{T}{T_0}\\right)^4\\right]$$
<p>Entropy conservation links size and temperature: $a\\,T \\propto g_{*s}^{-1/3}$. So $T \\propto 1/a$ except when a species annihilates and dumps its energy into the photons. The <b>formula / model</b> readout compares the headline law with this integration. It sits near 1.00 through the radiation era and drifts away once matter takes over at 50,000 years.</p>
<h3>Numbers the model reproduces</h3>
<p>Age today 13.79 Gyr. Recombination at $z = 1090$ comes at 371,000 years. Matter and radiation are equal at $z \\approx 3400$, after 51,000 years. The temperature falls through 1 MeV at 0.74 s and through the QCD crossover at 155 MeV at about 18 microseconds.</p>`,
  deep: [
    {
      title: 'The first microseconds: what is known and what is not',
      html: `<p>The <b>Planck era</b> is the time before $t_P = \\sqrt{\\hbar G/c^5} \\approx 5.4\\times10^{-44}$ s. Quantum effects of gravity should matter then. There is no tested theory for it, so any statement about this era is speculation.</p>
<p><b>Grand unification</b> is the idea that the strong, weak and electromagnetic forces are one force above about $10^{16}$ GeV. The measured strengths of the three forces drift toward each other at high energy, which is suggestive. They do not meet exactly in the Standard Model. The clearest prediction, proton decay, has not been seen. Super-Kamiokande finds a proton lifetime above $10^{34}$ years for the simplest channel.</p>
<p><b>Inflation</b> is much better motivated. It explains why the universe is so flat and uniform, and it predicted ripples that are almost, but not exactly, the same on every scale. Planck measured $n_s = 0.965 \\pm 0.004$, a clear departure from 1. But the field that drove inflation, its energy scale and its timing are unknown. Searches for primordial gravitational waves limit the energy scale to below about $1.4\\times10^{16}$ GeV. The times shown here, $10^{-36}$ to $10^{-32}$ s, are typical model values, not measurements. During inflation the temperature plunges, and it is restored only when the inflaton decays. The hot-model clock applies after that.</p>`,
    },
    {
      title: 'The Standard Model era, tested in colliders',
      html: `<p>From about $10^{-11}$ s on, the temperatures are below energies reached at the LHC, so the physics is known. At about 160 GeV the Higgs field takes its present value. Lattice calculations show this is a smooth crossover in the Standard Model, not a sharp transition. The W and Z bosons become heavy, and the weak force becomes short-ranged.</p>
<p>Until about 10 microseconds, quarks and gluons move freely in a <b>quark–gluon plasma</b>. Heavy-ion collisions at RHIC and the LHC make tiny drops of it. It behaves like an almost perfect liquid. Near 155 MeV quarks become confined into hadrons. Lattice QCD shows that this, too, is a crossover.</p>
<p>At each step the number of light species $g_*$ drops, from 106.75 to about 17 after confinement, then to 10.75 once muons and pions are gone. The corner plot shows the result. The temperature curve bends slightly at each step.</p>`,
    },
    {
      title: 'Neutrinos, positrons and the first nuclei',
      html: `<p>At about 1 MeV, a second or so after the start, the weak interactions get too slow. Neutrinos stop colliding and stream freely. Their relic background should still fill space at 1.95 K. It has not been detected directly, but the CMB measures its energy: $N_{\\text{eff}} = 2.99 \\pm 0.17$ (Planck 2018), close to the expected 3.04.</p>
<p>Below about 0.5 MeV, electrons and positrons annihilate. Their energy goes to the photons, which were still coupled. That is why today the neutrinos are colder than the photons by $(4/11)^{1/3}$.</p>
<p>At about 3 to 4 minutes, near 0.07 to 0.08 MeV, deuterium stops being broken apart as soon as it forms. Within minutes nearly all free neutrons end up in helium-4. The predicted helium mass fraction, about 24.7%, matches measurements of about 24.5%. Deuterium matches too. Lithium-7 comes out about three times too high, an open problem.</p>`,
    },
    {
      title: 'From the CMB to today, read from the sky',
      html: `<p>By about 51,000 years matter outweighs radiation. Dark matter clumps can then grow steadily. At 371,000 years in this model ($z \\approx 1090$) the plasma cools to about 3000 K, electrons join protons, and light travels freely. We see that light as the CMB, now at 2.7255 K.</p>
<p>Then come the <b>dark ages</b>. There are no stars, only cooling gas and growing dark matter halos. The first stars probably formed after 100 to 200 million years. None has been seen directly. JWST has found galaxies at $z \\approx 14$, about 300 million years after the start. Their ultraviolet light <b>reionized</b> the hydrogen by $z \\approx 6$. Quasar spectra show the last patches of neutral gas.</p>
<p>Star formation peaked around $z \\approx 2$. The expansion began to accelerate at $z \\approx 0.63$, about 7.7 billion years in. The Sun and Earth formed 4.57 billion years ago, dated by the oldest meteorite grains. Today is 13.8 billion years. If dark energy is a true constant, the universe will keep cooling and thinning forever.</p>`,
    },
    {
      title: 'How the timeline is built',
      html: `<p>The table of epochs is fixed text, but its temperatures and redshifts are checked against the model in the test suite. The model steps through temperature from $10^{22}$ MeV down to $10^{-4}$ of today's value. At each step it finds the scale factor from entropy conservation and the Hubble rate from the Friedmann equation. It then adds up $d\\ln a/H$. Each step is integrated as a local power law, which is exact in the pure radiation and pure matter limits.</p>
<p>A separate quadrature with a constant radiation density agrees with it to 0.01% at late times. The tunnel's length uses log time, stretched a little near crowded stations so each has room. The decade rings show the true log scale. Times before about $10^{-32}$ s are the naive hot-model extrapolation, which inflation replaces.</p>`,
    },
  ],
  challenges: [
    {
      id: 'recombination',
      title: 'Fly to recombination',
      prompt: 'Travel to the moment the universe became transparent and the CMB was released.',
      hint: 'Scroll or scrub to a few hundred thousand years, or pick <b>Recombination</b> from <b>Jump to epoch</b>.',
      check: (s) => s.touched === true && s.epoch === 'recombination',
    },
    {
      id: 'one-mev',
      title: 'One MeV',
      prompt: 'Find the moment when the temperature was 1 MeV, within about 10%.',
      hint: 'Watch the <b>energy kT</b> readout. It falls through 1 MeV just under one second, near neutrino decoupling.',
      check: (s) => s.touched === true && Math.abs(Math.log10(s.T_MeV as number)) < 0.045,
    },
    {
      id: 'open-link',
      title: 'Follow a link',
      prompt: 'Open a linked atlas topic from one of the epoch cards.',
      hint: 'Keep <b>Show links</b> on and press <b>Open topic</b> on the card.',
      check: (s) => s.linkOpened === true,
    },
    {
      id: 'today',
      title: 'Reach today',
      prompt: 'Fly all the way to the present, 13.8 billion years after the Big Bang.',
      hint: 'Play the fly-through, or scroll to the end. Check the <b>time</b> readout.',
      check: (s) => s.touched === true && Math.abs((s.t_Gyr as number) - 13.8) < 0.4,
    },
  ],
  caveats: `<p>The model is flat $\\Lambda$CDM with Planck 2018 values and three massless neutrinos. The $g_*(T)$ curve is a smooth sum of steps, good to a few percent, not a lattice-QCD fit. Times before the end of inflation, and the temperatures shown for them, are the naive hot-model extrapolation. With inflation the clock before reheating is unknown. Epoch boundaries are fuzzy. Recombination, reionization and galaxy growth are gradual, so their dates are typical values. The quoted 380,000 years for the CMB is a round figure. This model gives 371,000. The small scenes at each station are symbols, not simulations. The sky colour is the blackbody colour of the photons. Above about 40,000 K it is capped at blue-white, and below about 1000 K it fades to black.</p>`,
  further: [
    { label: 'Chronology of the universe on Wikipedia', url: 'https://en.wikipedia.org/wiki/Chronology_of_the_universe' },
    { label: 'Planck 2018 results VI: cosmological parameters (arXiv:1807.06209)', url: 'https://arxiv.org/abs/1807.06209' },
    { label: 'Big Bang nucleosynthesis on Wikipedia', url: 'https://en.wikipedia.org/wiki/Big_Bang_nucleosynthesis' },
    { label: 'Husdal, On effective degrees of freedom in the early universe (arXiv:1609.04979)', url: 'https://arxiv.org/abs/1609.04979' },
  ],
};
