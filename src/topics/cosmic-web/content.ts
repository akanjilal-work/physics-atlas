import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Map where the galaxies are and you do not get a smooth fog. You get a web. Long filaments of galaxies meet at dense knots. Thin walls stretch between them. In between lie huge voids with almost nothing in them.</p>
<p>The early universe was far smoother than that. The afterglow of the Big Bang shows density differences of only about one part in 100,000. Gravity did the rest. A region with a little extra matter pulls a little harder on its neighbours, so it gains more matter, so it pulls harder still. Emptier regions lose matter to their surroundings and empty out further. The rich get richer and the poor get poorer.</p>
<p>Collapse is not tidy. A lump is never perfectly round, so it falls in fastest along its shortest axis first. That makes a flat sheet, a wall. Then the sheet collapses along its next axis into a filament. Matter then streams along the filaments into the knots, where the biggest clusters of galaxies sit.</p>
<p>The surprise is that ordinary matter could not have done this in time. Until the universe was about 380,000 years old, ordinary matter was locked to light and could not clump. Dark matter feels no light, so it started clumping earlier. The web you see is mostly a dark matter web, with galaxies lit up along it.</p>
<p>In the scene each dot is a clump of dark matter, and its colour shows how crowded its neighbourhood is. Press play and watch a nearly uniform cloud at redshift 50 turn into a web by today. The bright stars mark the heaviest clumps, where galaxies would form.</p>`,
  tryFirst: [
    'Let the run play from redshift 50 to today. Watch sheets form first, then filaments, then knots. The corner plot shows the power spectrum growing.',
    'Drag the <b>redshift</b> slider back and forth once the run is done. Early on, the whole cloud just grows its pattern in place. Late on, particles stream along filaments.',
    'Switch <b>dark matter</b> to <b>Warm</b>. Small-scale ripples are erased at the start, so fewer small halos form. Count them with the <b>FoF halos</b> readout.',
    'Turn on <b>Fly-through</b> and ride through the web. The ring shows the camera target. Its density readout tells you when you are in a void.',
  ],
  equation: {
    tex: '\\nabla^2\\Phi = 4\\pi G\\,\\bar\\rho\\,a^2\\,\\delta',
    caption: 'Poisson’s equation in an expanding universe, in comoving coordinates. Only the excess density $\\delta = \\rho/\\bar\\rho - 1$ pulls. While $\\delta \\ll 1$ it grows in place as $\\delta \\propto D(a)$, the linear growth factor. In a matter-only (Einstein-de Sitter) universe $D(a) = a$.',
    terms: [
      { tex: '\\nabla^2\\Phi', name: 'Peculiar potential', meaning: 'The extra gravitational potential from lumps and holes, on top of the smooth expansion. The code solves for it on a $64^3$ mesh with a fast Fourier transform, where $\\nabla^2$ becomes $-k^2$.', param: 'np' },
      { tex: '4\\pi G', name: 'Gravity', meaning: 'Newton’s constant. Newtonian gravity is accurate here because the box is far smaller than the Hubble radius and the particles move far slower than light.' },
      { tex: '\\bar\\rho', name: 'Mean matter density', meaning: 'The average density of matter. It thins as $a^{-3}$, so $\\bar\\rho a^2 \\propto 1/a$. In $\\Lambda$CDM matter is 31% of the total today. In Einstein-de Sitter it is all of it. Choose with the <b>background</b> control.', param: 'bg' },
      { tex: 'a^2', name: 'Scale factor', meaning: 'Distances in the universe scale as $a = 1/(1+z)$. Gradients are taken in comoving coordinates, which brings in $a^2$. Move through time with the <b>redshift</b> slider.', param: 'z' },
      { tex: '\\delta', name: 'Density contrast', meaning: 'How much denser than average a place is. Voids approach $\\delta = -1$. Halos reach $\\delta$ of a few hundred. The readout gives $\\delta$ at the camera target, smoothed over about 3 Mpc/h.', param: 'target' },
    ],
  },
  physicsNotes: `
<h3>Equations of motion</h3>
<p>Write each particle’s position as a comoving coordinate $\\mathbf{x}$, which does not change as the universe expands. Its momentum is $\\mathbf{p} = a^2\\,d\\mathbf{x}/dt$. Using the scale factor $a$ as the clock, Newton’s laws in an expanding box become</p>
$$\\frac{d\\mathbf{x}}{da} = \\frac{\\mathbf{p}}{a^3 H(a)}, \\qquad \\frac{d\\mathbf{p}}{da} = -\\frac{\\nabla\\varphi}{a^2 H(a)}, \\qquad \\nabla^2\\varphi = \\tfrac32\\,\\Omega_m H_0^2\\,\\delta$$
<p>Here $\\varphi = a\\Phi$ and $H(a) = H_0\\sqrt{\\Omega_m a^{-3} + \\Omega_\\Lambda}$. The code takes kick-drift-kick leapfrog steps in $a$. The kick and drift factors are the integrals of $1/(a^2H)$ and $1/(a^3H)$ across each step. Steps are 7% in $a$ early on and at most $\\Delta a = 0.03$ late, 66 steps in all.</p>
<h3>Particle-mesh gravity</h3>
<p>Each step does four things. It spreads each particle’s mass over the 8 nearest mesh points (cloud-in-cell). It Fourier transforms the density and divides by $-k^2$ to get the potential. It transforms back and takes a fourth-order finite difference for the force. It reads the force back at each particle with the same cloud-in-cell weights. The FFT is a plain radix-2 transform written for this page. A step costs about 0.1 s for $32^3$ particles.</p>
<h3>Linear growth</h3>
<p>While $\\delta \\ll 1$ the fluid equations give $\\ddot\\delta + 2H\\dot\\delta = 4\\pi G\\bar\\rho\\,\\delta$. The growing solution is $\\delta \\propto D(a)$ with</p>
$$D(a) = \\tfrac52\\,\\Omega_m H_0^2\\, H(a) \\int_0^a \\frac{da'}{\\left(a' H(a')\\right)^3}$$
<p>In Einstein-de Sitter this is exactly $D = a$. With $\\Lambda$ growth slows after $z \\approx 1$, and $D(1)$ is 0.78 of $a$. The <b>measured / linear</b> readout compares the growth of the two longest waves in the box with $D(a)$. It stays within about 2% of 1 until $z \\approx 2$, then drifts low as the long waves start to feel the nonlinear web.</p>
<h3>Initial conditions and halos</h3>
<p>The run starts at $z = 50$ from a Gaussian random field with power spectrum $P(k) \\propto k^n T^2(k)$. $T$ is the Bardeen-Bond-Kaiser-Szalay (1986) CDM transfer function with shape $\\Gamma = 0.21$, or 1 for a pure power law. The amplitude is fixed by $\\sigma_8 = 0.8$, the rms linear density today in spheres of 8 Mpc/h. Particles start on a lattice and are displaced with the Zel’dovich approximation, $\\mathbf{x} = \\mathbf{q} + D(a)\\,\\mathbf{S}(\\mathbf{q})$ with $\\nabla\\cdot\\mathbf{S} = -\\delta_0$. Halos are found with friends-of-friends. Any two particles closer than 0.2 times the mean spacing are linked, and groups of 20 or more count.</p>`,
  deep: [
    {
      title: 'Why structure needs dark matter',
      html: `<p>Before recombination the universe was a hot plasma. Photons scattered constantly off free electrons, and the electrons dragged the protons with them. So ordinary matter and light moved as one fluid. The photon pressure was enormous. Any clump of baryons that tried to collapse bounced back as a sound wave. The frozen pattern of those waves is what the <a href="#/t/cmb-acoustic-peaks">CMB acoustic peaks</a> show.</p>
<p>At about $z \\approx 1100$, 380,000 years after the Big Bang, electrons and protons joined into neutral hydrogen and the light went free. Only then could baryons start to fall together. The CMB tells us their density contrast at that moment was of order $10^{-5}$. Linear growth multiplies it by at most $1 + z \\approx 1100$ by today. That gives $\\delta \\approx 10^{-2}$. Galaxies need $\\delta$ in the hundreds. Ordinary matter alone falls short by a wide margin.</p>
<p>Dark matter does not scatter light. Its clumps grew slowly during the radiation era and then as $D(a)$ from about $z \\approx 3400$, when matter began to dominate. So at recombination dark matter already had deep potential wells. Baryons fell into them within a few expansion times and caught up. This is one of the strongest arguments that <a href="#/t/dark-matter">dark matter</a> exists and is not made of ordinary matter.</p>`,
    },
    {
      title: 'Sheets, filaments and knots',
      html: `<p>In 1970 Yakov Zel’dovich wrote down the approximation used for the starting conditions here. Each particle moves in a straight line in comoving space, at a speed set by the initial gravity: $\\mathbf{x} = \\mathbf{q} + D(a)\\mathbf{S}(\\mathbf{q})$. The density follows from how the map squeezes volume:</p>
$$1 + \\delta = \\frac{1}{(1 - D\\lambda_1)(1 - D\\lambda_2)(1 - D\\lambda_3)}$$
<p>The $\\lambda_i$ are the eigenvalues of the deformation tensor $-\\partial S_i/\\partial q_j$. When $D\\lambda_1$ reaches 1 the density blows up along one axis first. Zel’dovich called these flat structures pancakes. Collapse along a second axis gives filaments, and along all three gives knots. A random field almost never has three equal eigenvalues, so walls and filaments are generic.</p>
<p>In 1996 Dick Bond, Lev Kofman and Dmitry Pogosyan explained why filaments dominate the pattern. The tidal field of the rare peaks, where clusters form, stretches the matter between them into bridges. They named the result the <b>cosmic web</b>.</p>
<p>The Zel’dovich approximation fails after particles cross, because it lets them sail straight through each other. The N-body code has no such limit. Gravity pulls particles back, and they settle into halos.</p>`,
    },
    {
      title: 'Seeing the web: galaxy surveys',
      html: `<p>A galaxy’s redshift gives its distance. Plot a thin slice of sky with distance outward and the web appears. The first famous picture came in 1986 from Valérie de Lapparent, Margaret Geller and John Huchra at the Center for Astrophysics. Their slice of about 1,100 galaxies showed galaxies on the walls of bubble-like voids. It included the Coma cluster, which looked like a stick figure with a body and arms.</p>
<p>The 2dF Galaxy Redshift Survey on the Anglo-Australian Telescope measured about 220,000 galaxies between 1997 and 2002. The Sloan Digital Sky Survey began in 2000 and mapped far more. In 2003 J. Richard Gott and colleagues found the Sloan Great Wall in it, a wall of galaxies more than a billion light years long. The Dark Energy Spectroscopic Instrument (DESI) on the Mayall Telescope uses 5,000 robotic fibres. Its first-year analysis, published in 2024, used more than 6 million galaxies and quasars.</p>
<p>Surveys and simulations are compared statistically, through the power spectrum, the correlation function and the abundance of voids and clusters. The agreement is very good on large scales. It is the main evidence that the simulated web is the real one.</p>`,
    },
    {
      title: 'Voids',
      html: `<p>Voids fill most of the volume of the universe. In 1981 Robert Kirshner, Augustus Oemler, Paul Schechter and Stephen Shectman found an unexpected gap in the galaxy distribution toward the constellation Boötes. The Boötes void is hundreds of millions of light years across and holds only a small number of galaxies.</p>
<p>A void is not a hole cut in the web. It is an underdense region that expands faster than the universe around it. Matter drains out onto the surrounding walls, so voids grow emptier and rounder with time. Their centres approach $\\delta \\approx -0.8$ to $-0.9$, never quite $-1$. Try the fly-through at $z = 0$ and watch the density readout drop as you enter one.</p>
<p>Because voids are nearly empty, they are pure expanding space. Their shapes and sizes are now used to test dark energy and alternative gravity theories. Those studies are still young.</p>`,
    },
    {
      title: 'The Millennium Simulation and warm dark matter',
      html: `<p>The particle-mesh method grew out of plasma physics codes and was adapted to galaxies and cosmology in the 1970s and 1980s. In 1985 Marc Davis, George Efstathiou, Carlos Frenk and Simon White used N-body runs to show that cold dark matter produces a web that matches galaxy surveys. They also introduced friends-of-friends with linking length $b = 0.2$, the value used here.</p>
<p>In 2005 Volker Springel and the Virgo Consortium published the Millennium Simulation in <i>Nature</i>. It followed about 10 billion particles in a box 500 Mpc/h on a side, from $z = 127$ to today. Galaxies were painted onto its halos with simple recipes. Its images of the web became the standard picture. Later runs such as Illustris and EAGLE added gas, stars and black holes directly.</p>
<p>Warm dark matter would be lighter particles, near a keV, that were still moving fast when structure began. They stream out of small lumps and erase them. The cutoff follows Viel and colleagues (2005). This page uses a 0.15 keV thermal relic so that the cutoff, near $k \\approx 0.8\\,h$/Mpc, lands where a $32^3$ run can see it. That mass is ruled out. The Lyman-alpha forest requires a thermal relic heavier than roughly 3 to 5 keV. Counts of small satellite galaxies and strong lensing also set limits of a few keV.</p>`,
    },
  ],
  challenges: [
    {
      id: 'halos',
      title: 'Grow a web',
      prompt: 'Pick your own settings, evolve the universe to $z = 0$ and find at least 20 halos.',
      hint: 'Change the seed or any other setting, then let the run play to the end, or drag the redshift slider to 0. The <b>FoF halos</b> readout counts groups of 20 or more particles.',
      check: (s) => s.touched === true && (s.z as number) < 0.05 && (s.halos as number) >= 20,
    },
    {
      id: 'warm',
      title: 'Warm it up',
      prompt: 'Run a cold dark matter universe to $z = 0$, then switch to warm dark matter with the same settings. Get at least 20% fewer halos.',
      hint: 'Note the halo count at $z = 0$ with <b>Cold</b>. Switch to <b>Warm</b> and play to the end. Small halos drop out first. Watch the dip in the corner power spectrum at high $k$.',
      check: (s) => s.warm === true && (s.z as number) < 0.05 && (s.coldRef as number) > 0 && (s.halos as number) <= 0.8 * (s.coldRef as number),
    },
    {
      id: 'void',
      title: 'Find a void',
      prompt: 'At $z < 0.3$, put the camera target inside a void where the smoothed density is below $\\delta = -0.8$.',
      hint: 'Turn on <b>Fly-through</b> and stop it when the dark gaps surround you, or right-drag to pan the target ring into an empty region. Watch <b>δ at target</b>.',
      check: (s) => s.camTouched === true && (s.z as number) < 0.3 && (s.targetDelta as number) < -0.8,
    },
    {
      id: 'linear',
      title: 'Growth in step with a',
      prompt: 'In an Einstein-de Sitter universe, pause between $z = 20$ and $z = 5$ and confirm that the longest waves have grown exactly as $a$, within 3%.',
      hint: 'Set <b>background</b> to Einstein-de Sitter. Then pause while $z$ is between 20 and 5. The <b>measured / linear</b> readout compares the growth of the longest waves with $D(a) = a$.',
      check: (s) => s.bg === 'eds' && s.playing === false && (s.z as number) >= 5 && (s.z as number) <= 20 && Math.abs((s.growth as number) - 1) < 0.03,
    },
  ],
  caveats: `<p>This is a toy run. The box is 50 Mpc/h on a side, the web of a few clusters. It holds $32^3$ or $64^3$ particles, against about 10 billion in the Millennium Simulation. Gravity is only resolved down to about two mesh cells, 1.6 Mpc/h, so halos come out puffy and their cores are not resolved. A halo needs at least 20 particles, about $7\\times10^{12}$ solar masses per $h$ at $32^3$. That is heavier than the Milky Way’s halo, so the bright markers stand for groups of galaxies more than single galaxies.</p>
<p>There is no gas, no star formation and no feedback. Galaxies are simply drawn at halo centres. The box is periodic, so structure larger than the box is missing and the longest waves have large cosmic variance. The initial conditions use first-order Zel’dovich displacements at $z = 50$, which leaves small transients. The warm dark matter mass is far lighter than allowed by data, chosen so the effect is visible. Particle runs of warm dark matter also make spurious small clumps along filaments, an artefact of the particle grid. The power spectrum inset is measured on the mesh without correcting for the mass-assignment window or shot noise.</p>`,
  further: [
    { label: 'Springel et al. (2005), Simulations of the formation, evolution and clustering of galaxies and quasars (Nature)', url: 'https://doi.org/10.1038/nature03597' },
    { label: 'Bond, Kofman & Pogosyan (1996), How filaments of galaxies are woven into the cosmic web', url: 'https://arxiv.org/abs/astro-ph/9512141' },
    { label: 'Galaxy filament on Wikipedia', url: 'https://en.wikipedia.org/wiki/Galaxy_filament' },
    { label: 'Warm dark matter on Wikipedia', url: 'https://en.wikipedia.org/wiki/Warm_dark_matter' },
  ],
};
