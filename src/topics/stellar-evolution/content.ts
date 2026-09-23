import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A star is a ball of gas that holds itself up by burning fuel in its core. Its whole life is a fight between gravity pulling in and pressure pushing out. <strong>One number decides how that fight goes: the mass the star is born with.</strong></p>
<p>You might expect a bigger star to last longer, since it has more fuel. The opposite is true. A star ten times the mass of the Sun is thousands of times brighter. It burns through its fuel in a few tens of millions of years. The Sun will last about ten billion. The smallest red dwarfs will outlive the present age of the universe many times over.</p>
<p>Around 1910, Ejnar Hertzsprung and Henry Norris Russell plotted stars by brightness against colour. The stars did not scatter at random. Most fell on one diagonal band, the <strong>main sequence</strong>. A few sat above it as huge, cool giants. A few sat far below as small, hot white dwarfs. That chart, the HR diagram, turned out to be a map of how stars live and die. A star spends most of its life at one spot on the main sequence. Then it wanders across the chart as its core runs out of hydrogen.</p>
<p>How it ends depends on mass again. A Sun-like star swells into a red giant, puffs off its outer layers as a glowing shell, and leaves a hot core the size of the Earth, a <strong>white dwarf</strong>. A star above about eight solar masses builds heavier and heavier elements in its core until it makes iron. Iron cannot release energy by fusion. The core collapses in under a second and the star explodes as a <strong>supernova</strong>. What is left is a neutron star or a black hole.</p>
<p>In the scene, the left side is the HR diagram with a scatter of typical stars. The glowing sphere on the right is your star. Its size follows its radius on a log scale and its colour follows its surface temperature. Scrub the age slider and watch it move along its track, then watch how it ends.</p>`,
  tryFirst: [
    'Press <b>Play</b> and watch a 5 solar-mass star leave the main sequence, swing out on a blue loop, and shed a planetary nebula.',
    'Press the <b>1 M☉</b> button and scrub <b>age</b> slowly. The Sun stays put for ten billion years, then climbs the red giant branch.',
    'Try <b>25 M☉</b>. Turn on the <b>cutaway</b> near the end of its life to see the onion of burning shells, then watch the supernova.',
    'Drag <b>mass</b> and watch the lifetime readout. Doubling the mass cuts the lifetime by a factor of more than five.',
  ],
  equation: {
    tex: 'L = 4\\pi R^2\\,\\sigma\\,T_{\\text{eff}}^4',
    caption: 'The Stefan–Boltzmann law for a star. Brightness is surface area times the power each square metre radiates. On the main sequence the lifetime scales as $t_{MS} \\propto M^{-2.5}$.',
    terms: [
      { tex: 'L', name: 'Luminosity', meaning: 'Total power radiated, in units of the Sun\'s $3.828\\times10^{26}$ W. The vertical axis of the HR diagram.', param: 'L' },
      { tex: '4\\pi R^2', name: 'Surface area', meaning: 'A red giant is cool but can be hundreds of times wider than the Sun, so it is still very bright. The sphere size shows $R$ on a log scale.', param: 'R' },
      { tex: '\\sigma', name: 'Stefan–Boltzmann constant', meaning: '$5.670\\times10^{-8}$ W m$^{-2}$ K$^{-4}$. The readout recomputes $L$ from $R$ and $T_{\\text{eff}}$ in SI units as a check.', param: 'sb' },
      { tex: 'T_{\\text{eff}}', name: 'Effective temperature', meaning: 'The temperature of a blackbody with the same size and power. It sets the colour. The horizontal axis of the HR diagram, running hot to cool from left to right. The Sun has 5772 K.', param: 'T' },
    ],
  },
  physicsNotes: `
<h3>Main-sequence scaling laws</h3>
<p>For stars burning hydrogen in their cores, luminosity and radius follow mass. This page uses the common textbook fits</p>
$$\\frac{L}{L_\\odot} \\approx \\begin{cases} 0.23\\,M^{2.3} & M < 0.43 \\\\ M^{4} & 0.43 \\le M < 2 \\\\ 1.4\\,M^{3.5} & 2 \\le M < 55 \\end{cases}\\qquad \\frac{R}{R_\\odot}\\approx M^{0.8},$$
<p>with $M$ in solar masses. Put $L$ and $R$ into the headline law and you get the temperature, $T_{\\text{eff}} = 5772\\,\\text{K}\\,(L/R^2)^{1/4}$ in solar units. So more massive stars are hotter and bluer as well as brighter. That is why the main sequence runs diagonally across the diagram.</p>
<h3>Why massive stars live fast</h3>
<p>The fuel a star can burn on the main sequence is roughly a fixed fraction of its mass, about the inner tenth. The rate it burns fuel is its luminosity. So the lifetime goes as $t \\propto M/L \\propto M/M^{3.5} = M^{-2.5}$. Anchored to the Sun,</p>
$$t_{MS} \\approx 10\\ \\text{Gyr}\\,\\left(\\frac{M}{M_\\odot}\\right)^{-2.5}.$$
<p>A 10 solar-mass star lasts about 30 million years in this law. A 0.5 solar-mass star lasts more than 50 billion. The universe is 13.8 billion years old, so no star below about 0.8 solar masses has ever left the main sequence.</p>
<h3>Why luminosity climbs so steeply</h3>
<p>Arthur Eddington showed in the 1920s that a star's brightness is set by how fast radiation can leak out through its interior, not by the details of its fuel. The core temperature follows from balancing gravity against pressure, $T_c \\propto M/R$. Radiation diffuses out with a rate that grows as $T^4$ and falls with the opacity. Put together, $L \\propto M^3$ for a star with constant opacity. Real opacities change with density and temperature, which steepens the relation for Sun-like stars and flattens it for the most massive ones.</p>
<h3>How the tracks here are drawn</h3>
<p>After the main sequence the tracks on this page are <strong>schematic</strong>. The keypoints for 1, 5, 15, 25 and 40 solar masses are hand-placed to follow the shapes of published stellar-model tracks for Sun-like composition. Masses in between are interpolated. The age scrubber stretches the clock after the main sequence, because the later stages together take only about 10 to 15% of the star's life. The age readout shows the real time. The star's radius at every point comes from $L$ and $T_{\\text{eff}}$ through the headline law.</p>`,
  deep: [
    {
      title: 'The diagram: Hertzsprung, Russell and the main sequence',
      html: `<p>The Danish astronomer Ejnar Hertzsprung noticed in 1905 and 1907 that red stars come in two kinds: very bright ones and very faint ones, with nothing in between. He called them giants and dwarfs. In 1911 he published plots of brightness against colour for the Pleiades and Hyades clusters. Stars in a cluster are all at about the same distance, so their apparent brightness can be compared directly.</p>
<p>Henry Norris Russell at Princeton made the same kind of plot for nearby stars with measured distances, using spectral type instead of colour. He presented it in 1913 and published it in 1914. Most stars lay on one diagonal band, now called the main sequence.</p>
<p>Spectral type and colour both track surface temperature, so the modern diagram plots $\\log T_{\\text{eff}}$ against $\\log L$. By tradition the temperature axis runs backwards, hot on the left. Lines of constant radius are straight diagonals, because $\\log L = 2\\log R + 4\\log T_{\\text{eff}} + \\text{const}$. Giants sit up and to the right of the main sequence because they are larger. White dwarfs sit down and to the left because they are about the size of the Earth.</p>`,
    },
    {
      title: 'Eddington and the energy source',
      html: `<p>In 1920 Arthur Eddington argued that the Sun is powered by turning hydrogen into helium. Four hydrogen nuclei weigh about 0.7% more than one helium nucleus. Converting that mass difference into energy by $E = mc^2$ could keep the Sun shining for billions of years. Gravitational contraction, the leading idea before then, could only manage tens of millions.</p>
<p>In 1924 Eddington derived the mass–luminosity relation from the physics of radiation flowing out through a star. In 1926 his book <em>The Internal Constitution of the Stars</em> set out much of the framework still used today. The nuclear reactions themselves were worked out later. Hans Bethe described the proton–proton chain and the CNO cycle in 1938 and 1939.</p>
<p>A star on the main sequence is self-regulating. If the core burns too fast, it heats and expands, which cools it and slows the burning. That feedback is why stars stay at almost the same spot on the diagram for so long.</p>`,
    },
    {
      title: 'Where carbon and oxygen come from',
      html: `<p>When the core runs out of hydrogen it is made of helium. It contracts and heats up. Near $10^8$ K helium starts to fuse by the <strong>triple-alpha process</strong>: two helium-4 nuclei briefly form beryllium-8, which is unstable, and a third helium nucleus must hit it before it falls apart.</p>
$$3\\,{}^4\\text{He} \\to {}^{12}\\text{C} + \\gamma, \\qquad {}^{12}\\text{C} + {}^4\\text{He} \\to {}^{16}\\text{O} + \\gamma .$$
<p>That three-body step should be far too slow. In 1953 Fred Hoyle argued that carbon-12 must have an excited state near 7.65 MeV that makes the reaction resonant, or there would be almost no carbon in the universe. A team at Caltech soon found the state. Some of the carbon then captures another helium nucleus to make oxygen.</p>
<p>In the cutaway, the helium-burning core turns into carbon and oxygen. In stars below about 8 solar masses the burning stops there, and the carbon–oxygen core becomes the white dwarf. Some carbon is dredged up to the surface and blown into space by the winds of AGB stars. Massive stars go on to burn carbon, neon, oxygen and silicon, building the onion of shells you see before the supernova. Most of the oxygen in the universe was made in massive stars and spread by their supernovae. The carbon in your body came from both kinds of star. The full scheme was set out in 1957 by Burbidge, Burbidge, Fowler and Hoyle, and independently by Cameron.</p>`,
    },
    {
      title: 'The endpoints: white dwarfs, neutron stars and black holes',
      html: `<p>A white dwarf is held up by electron degeneracy pressure. Electrons cannot share quantum states, so squeezing them raises their momentum and their pressure, even with no heat. In 1930, at the age of 19, Subrahmanyan Chandrasekhar showed that this support fails above a limiting mass, about <strong>1.4 solar masses</strong> for a carbon–oxygen star. Heavier cores must collapse further.</p>
<p>Stars do not reach the limit easily because they lose most of their mass first. The initial–final mass relation used here, $M_{WD} \\approx 0.109\\,M + 0.394$ (Kalirai and collaborators, 2008), turns a 1 solar-mass star into a white dwarf of about 0.5 solar masses. The radius follows from Nauenberg's fit to Chandrasekhar's relation. Heavier white dwarfs are smaller.</p>
<p>A star above about 8 solar masses builds an iron core. When that core passes the Chandrasekhar limit it collapses to nuclear density in well under a second. The infall bounces, and a flood of neutrinos helps drive the rest of the star outward as a core-collapse supernova. The remnant is a <strong>neutron star</strong> of about 1.4 solar masses and roughly 20 km across. For the heaviest stars, very roughly above 20 to 25 solar masses, much of the star may fall back and form a <strong>black hole</strong>.</p>
<p>These boundaries are approximate. Real outcomes depend on rotation, composition, mass loss and binary companions. Models find that some stars well above 25 solar masses still explode and leave neutron stars, and some lighter ones may collapse quietly.</p>`,
    },
    {
      title: 'Three stars: the Sun, Betelgeuse and SN 1987A',
      html: `<p><strong>The Sun</strong> is about 4.6 billion years old, roughly halfway through its main-sequence life. In about 5 billion years its core hydrogen runs out. It will swell into a red giant more than a hundred times its present size. Mercury and Venus will very likely be swallowed. Whether the Earth survives is uncertain, because the Sun also loses mass and the planets' orbits widen. After a helium-burning phase and a brief second giant phase, it will shed its envelope as a planetary nebula and leave a white dwarf of about half a solar mass.</p>
<p><strong>Betelgeuse</strong>, the red shoulder of Orion, is a red supergiant about 550 light years away. A 2020 study by Joyce and collaborators found a mass of about 16 to 19 solar masses and a radius of about 750 solar radii, enough to reach past the orbit of Mars if it replaced the Sun. It is burning helium in its core and is expected to explode within roughly the next 100 000 years. Its "Great Dimming" in 2019 and 2020 was most likely caused by a cloud of dust from gas it had thrown off.</p>
<p><strong>SN 1987A</strong> was seen on 23 February 1987 in the Large Magellanic Cloud, about 168 000 light years away. It was the nearest supernova seen since the invention of the telescope. Its progenitor, Sanduleak −69 202, was a blue supergiant of about 20 solar masses, which surprised theorists who expected red supergiants to explode. About two dozen neutrinos were caught in detectors in Japan, the USA and the Soviet Union a few hours before the light arrived, confirming that core collapse releases most of its energy as neutrinos. For decades no neutron star was seen in the debris. In 2024, JWST spectra gave strong evidence that one is there.</p>`,
    },
  ],
  challenges: [
    {
      id: 'long-lived',
      title: 'Outlive the universe',
      prompt: 'Make a star whose main-sequence lifetime is longer than 50 billion years.',
      hint: 'Lifetime goes as $M^{-2.5}$. Go low on the <b>mass</b> slider and watch <b>t_MS</b>. You need less than about 0.52 solar masses.',
      check: (s) => (s.tMS as number) > 50,
    },
    {
      id: 'black-hole',
      title: 'Make a black hole',
      prompt: 'Choose a star that ends as a black hole and take it all the way to the end.',
      hint: 'In this model that needs at least 25 solar masses. Then play or scrub <b>age</b> past the supernova.',
      check: (s) => s.endpoint === 'black hole' && s.ended === true,
    },
    {
      id: 'sun-teff',
      title: 'Find the Sun',
      prompt: 'Set up a main-sequence star with the Sun\'s surface temperature, 5772 K, to within 2%.',
      hint: 'On the main sequence $T_{\\text{eff}}$ grows with mass. Watch the <b>T_eff</b> readout and keep the star on the main sequence.',
      check: (s) => s.touched === true && s.seg === 0 && Math.abs((s.T as number) / 5772 - 1) < 0.02,
    },
    {
      id: 'sun-giant',
      title: 'The Sun as a red giant',
      prompt: 'Watch a 1 solar-mass star climb well up the red giant branch.',
      hint: 'Press <b>1 M☉</b>, then play or scrub <b>age</b> past about 11 billion years.',
      check: (s) => Math.abs((s.M as number) - 1) <= 0.05 && s.seg === 2 && (s.segFrac as number) > 0.5,
    },
  ],
  caveats: `<p>The main-sequence laws are rough power-law fits. They ignore how a star brightens during its main-sequence life, and they make massive stars live too briefly: the $M^{-2.5}$ law gives about 1 million years at 40 solar masses, while detailed models give a few million. The tracks after the main sequence are hand-drawn schematics that follow the shapes of published models for Sun-like composition. They are not the output of a stellar-evolution code. Masses between the reference tracks are interpolated. Below 1 solar mass the post-main-sequence shape of the 1 solar-mass track is reused. No such star has left the main sequence yet, and stars below about 0.5 solar masses are expected to skip helium burning.</p>
<p>Mass loss, rotation, binary companions and composition all change real tracks and endpoints. The 8 and 25 solar-mass boundaries are approximate. Sizes are on a log scale and the interior layers are not to scale. The remnants are drawn far larger than they are. The age scrubber stretches time after the main sequence. Colours are blackbody colours. Very hot stars are shown blue-white, although most of their light is ultraviolet.</p>`,
  further: [
    { label: 'Hertzsprung–Russell diagram on Wikipedia', url: 'https://en.wikipedia.org/wiki/Hertzsprung%E2%80%93Russell_diagram' },
    { label: 'Stellar evolution on Wikipedia', url: 'https://en.wikipedia.org/wiki/Stellar_evolution' },
    { label: 'Joyce et al., Standing on the shoulders of giants: Betelgeuse (2020)', url: 'https://arxiv.org/abs/2006.09837' },
    { label: 'Fransson et al., Emission lines due to ionizing radiation from a compact object in SN 1987A (2024)', url: 'https://doi.org/10.1126/science.adj5796' },
  ],
};
