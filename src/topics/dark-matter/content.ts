import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A spinning galaxy is held together by gravity. Stars near the edge should feel only a weak pull, so they should drift slowly, like the outer planets of the Solar System. They do not. Far from the centre, stars and gas orbit about as fast as they do near the middle.</p>
<p>Look at the curve in the corner. The white points stand for measured orbital speeds at different distances. The amber dashed curve is what the stars and gas we can see would produce on their own. It rises, peaks and then sinks. The points refuse to sink. Something is supplying extra pull far out, and it does not shine.</p>
<p>Now watch the galaxy. The amber beads started in a straight line from the centre. Every star moves on a circle at the speed the curve gives it, so the inner beads race ahead and the line winds into a spiral. Switch the model to <strong>Visible</strong>. The outer stars slow to a crawl, and the arms shear apart faster. Switch back to <strong>NFW halo</strong> and a violet glow appears: a huge, round cloud of unseen matter that keeps the outer speeds up.</p>
<p>The same missing mass shows up in clusters of galaxies, in the bending of light, and in the afterglow of the Big Bang. The <strong>Bullet Cluster</strong> view shows the most striking case. Two clusters collide. Their hot gas, which holds most of the ordinary matter, slams together and lags behind. The mass, traced by how it bends background light, sails straight through.</p>
<p>Nobody yet knows what dark matter is. There is also a rival idea, called MOND, that changes the law of gravity instead of adding matter. You can try it here too.</p>`,
  tryFirst: [
    'Switch <b>Gravity model</b> to <b>Visible</b>. The cyan curve drops onto the amber one, and the outer stars fall behind.',
    'Back on <b>NFW halo</b>, drag <b>Halo mass</b> up and down. Watch the violet halo curve lift the total.',
    'Drag the <b>Probe radius</b>. The readouts show how much of the mass inside that radius is dark.',
    'Pick <b>MOND</b>. There is no halo now. Gravity itself grows stronger outside the dashed green ring, where the pull drops below $a_0$.',
    'Switch <b>View</b> to <b>Bullet Cluster</b> and watch pink gas get left behind by blue mass.',
  ],
  equation: {
    tex: 'v(r) = \\sqrt{\\frac{G\\,M(<r)}{r}}',
    caption: 'The speed of a circular orbit. If the mass is spherically distributed, only the mass inside the orbit sets it. For a flat disk this is only approximate, so the page uses the exact disk formula for the stars.',
    terms: [
      { tex: 'v(r)', name: 'Circular speed', meaning: 'How fast a star on a circular orbit at radius $r$ moves. This is what spectra measure through the Doppler shift.', param: 'v' },
      { tex: 'G', name: 'Newton’s constant', meaning: 'The strength of gravity, $4.30\\times10^{-6}$ kpc (km/s)² per solar mass. MOND keeps $G$ but changes how gravity responds when the pull is weaker than $a_0$.', param: 'model' },
      { tex: 'M(<r)', name: 'Enclosed mass', meaning: 'All the mass inside radius $r$: bulge, disk and any dark halo. A flat curve needs $M(<r)$ to grow in step with $r$.', param: 'menc' },
      { tex: 'r', name: 'Radius', meaning: 'Distance from the galaxy centre. If no mass lies beyond some radius, then $v \\propto r^{-1/2}$ past it. That is Kepler’s falloff.', param: 'r' },
    ],
  },
  physicsNotes: `
<h3>Why a flat curve means hidden mass</h3>
<p>Set $v$ constant in the headline equation. Then $M(<r) = v^2 r / G$. The enclosed mass grows in proportion to radius, so the density must fall as $\\rho \\propto r^{-2}$. Starlight in disk galaxies falls much faster, roughly exponentially. The extra mass has to be spread far beyond the stars.</p>
<h3>What this page computes</h3>
<p>The <strong>bulge</strong> is a Hernquist sphere with $M(<r) = M_b r^2/(r+a)^2$, fixed at $10^{10}\\,M_\\odot$ and $a = 0.6$ kpc. The <strong>disk</strong> is an exponential sheet with scale length $R_d = 2.6$ kpc. A thin disk is not a sphere, so its speed uses Freeman’s exact result with modified Bessel functions:</p>
$$v_d^2 = 4\\pi G \\Sigma_0 R_d\\, y^2\\left[I_0(y)K_0(y) - I_1(y)K_1(y)\\right],\\qquad y = \\frac{R}{2R_d}.$$
<p>The <strong>NFW halo</strong> (Navarro, Frenk and White) has density $\\rho_s/[(r/r_s)(1+r/r_s)^2]$ and enclosed mass</p>
$$M(<r) = 4\\pi \\rho_s r_s^3\\left[\\ln(1+x) - \\frac{x}{1+x}\\right],\\quad x = r/r_s.$$
<p>The halo mass slider sets $M_{200}$, the mass inside the radius where the mean density is 200 times the critical density of the Universe (for $h = 0.7$). The <strong>cored halo</strong> is a pseudo-isothermal sphere, $\\rho_0/(1 + r^2/r_c^2)$, whose speed tends to the constant $\\sqrt{4\\pi G\\rho_0 r_c^2}$. The speeds add in quadrature: $v^2 = v_b^2 + v_d^2 + v_h^2$.</p>
<h3>MOND</h3>
<p>Milgrom’s MOND replaces the halo with a rule. Work out the Newtonian pull of the visible matter, $g_N = v_{vis}^2/r$. The true pull $g$ obeys $g\\,\\mu(g/a_0) = g_N$ with $a_0 \\approx 1.2\\times10^{-10}$ m/s². With the “simple” choice $\\mu(x) = x/(1+x)$,</p>
$$g = \\frac{g_N}{2} + \\sqrt{\\frac{g_N^2}{4} + g_N a_0}.$$
<p>Far out, $g \\approx \\sqrt{g_N a_0}$. With $g = v^2/r$ and $g_N = GM/r^2$ this gives $v^4 = G M a_0$. The speed stops depending on $r$ at all.</p>
<h3>Milky Way check</h3>
<p>With a $5\\times10^{10}\\,M_\\odot$ disk and a $10^{12}\\,M_\\odot$ NFW halo with $r_s = 20$ kpc, the model gives about 228 km/s at 8.2 kpc from the centre. Eilers and colleagues (2019) measured about 229 km/s at the Sun’s radius. In this model, visible matter alone gives only about 183 km/s there, and falls much further outside.</p>`,
  deep: [
    {
      title: 'From Zwicky to Rubin',
      html: `<p>In 1933 Fritz Zwicky measured how fast galaxies move inside the Coma Cluster. Using the virial theorem, he found they moved far too fast to be held together by the light he could see. He called the missing ingredient <em>dunkle Materie</em>, dark matter. His mass estimate was inflated by the large Hubble constant of the time, but the discrepancy survives with modern numbers.</p>
<p>For decades the problem stayed on the side. In the 1970s Vera Rubin and Kent Ford used an image-tube spectrograph that Ford had built to measure orbital speeds across spiral galaxies. Their 1970 study of Andromeda was followed by surveys, with Norbert Thonnard, of many spirals. The curves stayed flat well past the bright disk. Radio astronomers mapping the 21 cm line of hydrogen gas, which extends even further out, found the same thing. Around the same time, Jeremiah Ostriker and Jim Peebles showed that cold, thin disks would be unstable unless they sat inside massive round halos.</p>`,
    },
    {
      title: 'Evidence beyond rotation curves',
      html: `<p><strong>Lensing.</strong> Mass bends light. Clusters of galaxies distort the images of galaxies behind them into arcs and faint stretches. Mapping the distortion maps the total mass, visible or not. Cluster masses from lensing agree with those from galaxy motions and hot gas: several times more than all the ordinary matter.</p>
<p><strong>The Bullet Cluster.</strong> In the cluster 1E 0657-56, two clusters have passed through each other. The Chandra X-ray telescope shows the hot gas, which holds most of the ordinary matter, piled up between them. Clowe and colleagues (2006) used weak lensing to map the mass. The mass peaks sit with the galaxies, well away from the gas, at a significance of 8 standard deviations. Collisionless dark matter explains this directly. The view on this page is a schematic toy, not a simulation of that system.</p>
<p><strong>The cosmic microwave background.</strong> Before atoms formed, sound waves rang through the plasma of the early Universe. Ordinary matter feels radiation pressure and oscillates. Dark matter does not, and it deepens the gravity wells. The relative heights of the acoustic peaks in the CMB spectrum measure both. Planck (2018) finds that today the Universe is about 5% ordinary matter, 26% to 27% dark matter and 68% to 69% dark energy. Big Bang nucleosynthesis independently fixes the ordinary matter density at the same low value, so the missing mass cannot simply be dim stars or gas.</p>`,
    },
    {
      title: 'What could it be?',
      html: `<p><strong>WIMPs.</strong> Weakly interacting massive particles, with masses from a few GeV to a few TeV. A particle with a weak-scale interaction strength, left over from the hot early Universe, ends up with roughly the right abundance. That coincidence made WIMPs the leading candidate for decades.</p>
<p><strong>Axions.</strong> Very light particles proposed in the late 1970s to explain why the strong force does not violate a symmetry called CP. If they exist, they could be produced in huge numbers as a cold background. Experiments like ADMX search for them turning into microwave photons inside a strong magnetic field.</p>
<p><strong>Primordial black holes.</strong> Black holes formed in the first second, not from stars. Lensing surveys, the CMB and other limits rule them out as all of the dark matter over most mass ranges. A window near asteroid masses is still open.</p>
<p><strong>Direct detection.</strong> Detectors deep underground wait for a dark matter particle to knock a nucleus. The largest use several tonnes of liquid xenon: LZ in South Dakota and XENONnT in Italy. Their latest published results show no dark matter signal and set tight limits on WIMPs. XENONnT and the Chinese PandaX-4T experiment have even begun to see solar neutrinos scattering off xenon nuclei. That neutrino background will make further searches harder.</p>`,
    },
    {
      title: 'MOND: successes and difficulties',
      html: `<p>In 1983 Mordehai Milgrom proposed that gravity, or inertia, changes below an acceleration $a_0 \\approx 1.2\\times10^{-10}$ m/s². This is a real, testable alternative, and it has genuine wins.</p>
<p><strong>Successes.</strong> MOND predicts the baryonic Tully-Fisher relation, $v_{flat}^4 = G M_{b} a_0$, which the data follow with little scatter. It often predicts the shape of a galaxy’s rotation curve from its visible matter alone, including wiggles that follow features in the gas and stars. McGaugh, Lelli and Schombert (2016) found that the observed acceleration in 153 galaxies is a single function of the Newtonian acceleration of the visible matter. Dark matter models must explain why halos track the baryons so closely.</p>
<p><strong>Difficulties.</strong> In galaxy clusters MOND still needs extra unseen mass, roughly as much again as the visible. The Bullet Cluster offset is hard to explain without some collisionless matter. The CMB peaks need something that behaves like dark matter in the early Universe. Some relativistic versions, including TeVeS, were ruled out by the 2017 observation that gravitational waves travel at the speed of light. Newer versions are not yet widely tested. Tests with wide binary stars are disputed.</p>
<p>In this page the illustrative data were generated from a halo model. So a poor MOND fit here says nothing about real galaxies.</p>`,
    },
    {
      title: 'Open problems for dark matter',
      html: `<p>Cold dark matter works very well on large scales: the CMB, the distribution of galaxies, lensing and cluster counts. On the scale of small galaxies it has had trouble. Simulations with dark matter alone predict cuspy centres, like NFW, while many dwarf galaxies look cored. They also predict more small satellites than we see. Much of this may come from gas physics, such as supernovae stirring the centres, that pure dark matter simulations leave out. How much remains is debated.</p>
<p>Even the Milky Way’s curve is still being refined. Some recent analyses of Gaia data find that it declines gently beyond about 15 to 20 kpc, which would point to a lighter halo than older estimates.</p>
<p>The honest summary: many independent lines of evidence point to some form of unseen, nearly collisionless matter. Its nature is unknown, and no particle has been detected.</p>`,
    },
  ],
  challenges: [
    {
      id: 'flat',
      title: 'Make it flat',
      prompt: 'With a halo or MOND, make the curve flat: its highest and lowest speeds between 8 and 35 kpc must differ by less than 6%.',
      hint: 'Try the cored halo with a small scale radius, or tune the NFW halo mass and scale radius together. Watch the flatness readout.',
      check: (s) => s.view === 'galaxy' && s.model !== 'newton' && (s.flat as number) < 0.06,
    },
    {
      id: 'kepler',
      title: 'Turn off the halo',
      prompt: 'Switch to the visible-only model and confirm that far out the speed falls as $r^{-1/2}$: the slope $d\\ln v/d\\ln r$ at 40 kpc should read close to −0.5.',
      hint: 'Pick Visible under Gravity model and read the slope at 40 kpc. It does not depend on the disk mass. Why?',
      check: (s) => s.view === 'galaxy' && s.model === 'newton' && s.touched === true && Math.abs((s.slope40 as number) + 0.5) < 0.03,
    },
    {
      id: 'fit',
      title: 'Fit the data',
      prompt: 'Match the illustrative data points: get the reduced χ² below 1.',
      hint: 'Start from the NFW halo. A slightly heavier disk and a heavier halo help. Move one slider at a time and watch χ².',
      check: (s) => s.view === 'galaxy' && s.touched === true && (s.chi2 as number) < 1,
    },
    {
      id: 'bullet',
      title: 'Separate gas from mass',
      prompt: 'In the Bullet Cluster view, wait until at least 100 Myr after the cores pass. The bullet’s gas should trail its mass peak by more than 150 kpc.',
      hint: 'Switch View to Bullet Cluster and let it play. Press Reset to run the collision again.',
      check: (s) => s.view === 'bullet' && (s.bulletT as number) > 100 && (s.bulletOffset as number) > 150,
    },
  ],
  caveats: `<p>All orbits are perfect circles in a flat, axisymmetric galaxy. Real stars have random motions, and real spiral arms are mostly density waves that stars pass through, not fixed groups of stars. So the winding shown here is the famous “winding problem”, not how real arms evolve. The disk mass includes stars and gas together in one exponential. The bulge and disk scale length are fixed.</p>
<p>The data points are illustrative. They were generated from a halo model with added scatter. They are not measurements of any real galaxy.</p>
<p>MOND is applied in its simplest algebraic form to the Newtonian pull of the disk and bulge. A full MOND theory would solve a modified field equation, which changes the result for a disk slightly.</p>
<p>The Bullet Cluster view is a one-dimensional toy. Dark matter and galaxies move at constant speed. The gas feels a drag while the clouds overlap and a weak pull back to its halo. Masses, sizes and speeds are rough, and the mass contours include the gas at 15% of each cluster’s mass.</p>`,
  further: [
    { label: 'Galaxy rotation curve (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Galaxy_rotation_curve' },
    { label: 'Clowe et al. 2006, A direct empirical proof of the existence of dark matter (arXiv)', url: 'https://arxiv.org/abs/astro-ph/0608407' },
    { label: 'Planck 2018 results VI: cosmological parameters (arXiv)', url: 'https://arxiv.org/abs/1807.06209' },
    { label: 'Modified Newtonian dynamics (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Modified_Newtonian_dynamics' },
  ],
};
