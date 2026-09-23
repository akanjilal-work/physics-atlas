import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Copper carries current with almost no effort. Glass does not carry it at all. Silicon sits in between, and you can tune it. All three are packed with electrons. The difference is where those electrons are allowed to sit.</p>
<p>A crystal is a very regular landscape. Every atom pulls on the electrons in the same way, so the electron sees a row of identical dips repeating forever. The scene draws that row as violet blocks. Between them are the wells where an electron is comfortable.</p>
<p>Here is the first surprise. In a perfect row, an electron wave does not bump from atom to atom. It spreads through the whole crystal as one wave, the coloured spiral. The spiral twists at a steady rate. Its size rises and falls in step with the atoms, the same in every cell. The electron glides through the crystal like light through clear glass.</p>
<p>The second surprise is that only some energies work. The green shelves behind the lattice are the <strong>allowed bands</strong>. The empty strips between them are <strong>gaps</strong>. No wave can live at a gap energy. At those energies, the echoes from all the atoms add up and throw the wave straight back.</p>
<p>Now pour in electrons. Each band has room for exactly two per atom. If a band ends up half full, electrons have empty states just above them. A tiny push moves them, and you have a <strong>metal</strong>. If the bands are exactly full, the next empty state is across a gap. Nothing can move. A wide gap makes an <strong>insulator</strong>. A narrow gap makes a <strong>semiconductor</strong>, where heat alone lifts a few electrons across.</p>
<p>The corner plot is the map physicists use for all of this, energy against the wave's twist rate $k$. Switch the view to <b>Band surface</b> to see the same idea in two dimensions, with the Fermi level as a glowing sheet.</p>`,
  tryFirst: [
    'Drag the <b>k</b> slider from 0 to 1. The spiral twists more tightly. At the zone edge, k = π/a, it flattens into a standing wave that goes nowhere. Watch the group velocity drop to zero.',
    'Set <b>barrier height V₀</b> to 0. The gaps close and the bands in the corner plot join into the free-electron parabola, folded back into the zone.',
    'Change <b>electrons per cell</b> from 2 to 1. The material flips from semiconductor to metal because band 1 is now only half full.',
    'Switch <b>view</b> to <b>Band surface</b> and pick the <b>Graphene</b> preset. Two cones meet at a point right on the Fermi level.',
  ],
  equation: {
    tex: '\\cos(ka) = \\cos(\\alpha w)\\cosh(\\beta b) + \\frac{\\beta^{2}-\\alpha^{2}}{2\\alpha\\beta}\\,\\sin(\\alpha w)\\sinh(\\beta b)',
    caption: 'The full Kronig–Penney relation for $E < V_0$, which is what the simulation solves. Energies where the right side lies between −1 and +1 form bands. The rest are gaps.',
    terms: [
      { tex: 'k', name: 'Crystal wavevector', meaning: 'How fast the Bloch wave twists from cell to cell. Only $-\\pi/a \\le k \\le \\pi/a$ is distinct.', param: 'k' },
      { tex: 'a', name: 'Lattice constant', meaning: 'The repeat length of the crystal, well plus barrier.', param: 'a' },
      { tex: 'b', name: 'Barrier width', meaning: 'Thickness of each violet block. Thicker barriers mean narrower bands and wider gaps.', param: 'b' },
      { tex: 'w', name: 'Well width', meaning: 'The flat part of the cell, $w = a - b$.', param: 'a' },
      { tex: '\\alpha', name: 'Wavenumber in the well', meaning: '$\\alpha = \\sqrt{2mE}/\\hbar$. It grows with the electron energy $E$.', param: 'E' },
      { tex: '\\beta', name: 'Decay rate in the barrier', meaning: '$\\beta = \\sqrt{2m(V_0 - E)}/\\hbar$. Taller barriers make it larger.', param: 'V0' },
    ],
  },
  physicsNotes: `
<h3>Bloch's theorem</h3>
<p>If the potential repeats, $V(x + a) = V(x)$, then every energy eigenstate can be written as</p>
$$\\psi_k(x) = e^{ikx}\\,u_k(x), \\qquad u_k(x + a) = u_k(x).$$
<p>A plane wave times a function with the period of the lattice. In the scene the plane wave is the steady twist of the spiral. The periodic part $u_k$ is the way its radius swells and shrinks in each cell. Shifting by one cell only multiplies the wave by the phase $e^{ika}$, so $|\\psi|^2$ is the same in every cell.</p>
<h3>Where the relation comes from</h3>
<p>Inside a well the wave is a mix of $e^{\\pm i\\alpha x}$. Inside a barrier, when $E < V_0$, it is a mix of $e^{\\pm \\beta x}$. Require $\\psi$ and $\\psi'$ to be continuous at every edge. Carrying $(\\psi, \\psi')$ across one full cell is a 2×2 transfer matrix $M$ with determinant 1. Bloch's theorem says a cell shift multiplies the solution by $e^{ika}$, so $e^{ika}$ must be an eigenvalue of $M$. That gives $\\cos(ka) = \\tfrac12 \\operatorname{tr} M$, which written out is the headline equation. Above the barrier, $E > V_0$, set $\\beta = i\\gamma$. The cosh becomes a cos, and the sinh term becomes $-\\tfrac{\\alpha^2 + \\gamma^2}{2\\alpha\\gamma}\\sin(\\alpha w)\\sin(\\gamma b)$.</p>
<h3>The delta-comb limit</h3>
<p>Shrink the barriers to zero width while keeping $V_0 b$ fixed. Then $\\beta^2 b \\to 2mV_0 b/\\hbar^2$ and the relation becomes</p>
$$\\cos(ka) = \\cos(\\alpha a) + \\frac{m V_0 b}{\\hbar^2 \\alpha}\\sin(\\alpha a).$$
<p>This is the form most textbooks show first. A test checks that the full relation approaches it.</p>
<h3>How the simulation works</h3>
<p>Units are electronvolts and ångströms, with the free electron mass, so $\\hbar^2/2m_e = 3.81$ eV·Å². The code scans energy for the band edges where $|\\tfrac12 \\operatorname{tr} M| = 1$, then finds $E_n(k)$ inside each band by bisection. The Bloch wave is the eigenvector of $M$, carried across the cell piece by piece. The <b>dispersion residual</b> readout shows how exactly the drawn state satisfies the relation. The <b>effective mass</b> comes from the band curvature, $m^* = \\hbar^2 / (d^2E/dk^2)$.</p>
<p>Electrons fill states from the bottom, two per band per cell because of spin. The Fermi level $E_F$ is the top of the filled states at zero temperature. For an exactly full band the readout puts it in the middle of the gap, where it sits in a pure semiconductor.</p>`,
  deep: [
    {
      title: 'Why a perfect crystal does not scatter electrons',
      html: `<p>Before 1928, physicists pictured electrons in a metal as balls bouncing off ions. That picture predicts a mean free path of about one atomic spacing. Measured mean free paths in pure copper at low temperature are thousands of times longer.</p>
<p>In 1928 Felix Bloch, then a doctoral student of Werner Heisenberg in Leipzig, showed why. A Bloch state is an exact eigenstate of the periodic crystal. It does not decay or scatter. Its group velocity $v = \\tfrac{1}{\\hbar}\\,dE/dk$ is constant, so the electron keeps moving forever. His paper appeared in Zeitschrift für Physik in 1929.</p>
<p>So resistance does not come from the lattice itself. It comes from anything that breaks the perfect repetition: vibrating atoms (phonons), impurities, vacancies and grain edges. This is why metals conduct better when cold and when pure.</p>`,
    },
    {
      title: 'Why gaps open: Bragg reflection',
      html: `<p>Start with free electrons, $V_0 = 0$, and switch on a weak periodic potential. Most waves barely notice. The exception is $k = \\pm\\pi/a$, where the wavelength is $2a$. There, the small echoes from successive atoms are all in step. This is Bragg's condition $2a = n\\lambda$, the same one used for X-ray diffraction.</p>
<p>At the zone edge the waves $e^{i\\pi x/a}$ and $e^{-i\\pi x/a}$ have the same energy and the potential mixes them. The result is two standing waves, $\\cos(\\pi x/a)$ and $\\sin(\\pi x/a)$. One piles the electron up in the wells, the other in the barriers. Their energies differ, and that difference is the gap. For a weak potential it is $E_g \\approx 2|V_G|$, twice the Fourier component of the potential at $G = 2\\pi/a$.</p>
<p>Try it. Put $k$ at 1 (the zone edge) and compare band 1 with band 2. Both waves are flat, with no twist. In band 1 the density sits mostly in the wells. In band 2 more of it reaches into the barriers.</p>`,
    },
    {
      title: 'Holes, effective mass, and why some Hall signs are positive',
      html: `<p>Near a band edge every band looks like a parabola, $E \\approx E_0 + \\hbar^2 (k - k_0)^2 / 2m^*$. The electron then moves like a free particle with an <em>effective mass</em> $m^*$. Flat bands give heavy electrons. For a tight-binding chain, $E = \\varepsilon - 2t\\cos(ka)$, the mass at the bottom is $m^* = \\hbar^2/(2ta^2)$.</p>
<p>Near the top of a band the curvature is negative, so $m^*$ is negative. A nearly full band behaves like a few missing electrons with positive charge and positive mass. These are <strong>holes</strong>. Band theory used this idea early on to explain why some metals show a Hall effect of the "wrong" sign, as if the current were carried by positive charges. Rudolf Peierls worked this out in 1929.</p>
<p>Watch the <b>effective mass</b> readout as you move $k$ from 0 to 1 in band 1. It starts positive, grows without bound near the inflection point, and comes back negative at the top.</p>`,
    },
    {
      title: 'Doping, the Fermi level, and transistors',
      html: `<p>A filled band cannot carry current, because for every electron moving right there is one moving left. In 1931 Alan Wilson used this to explain the difference between metals, insulators and semiconductors. What counts is the gap compared with $k_BT$, which is 0.0259 eV at 300 K.</p>
<p>Silicon has a gap of 1.12 eV at room temperature, about 43 times $k_BT$. The chance of thermal excitation scales like $e^{-E_g/2k_BT}$, which is about $4\\times 10^{-10}$ here. Intrinsic silicon has roughly $10^{10}$ free electrons per cubic centimetre, out of about $5\\times 10^{22}$ atoms. Diamond's gap is about 5.5 eV. The same factor is near $10^{-46}$, so pure diamond is an excellent insulator.</p>
<p>Engineers do not wait for heat. They add a few phosphorus atoms, which carry one spare electron each, loosely bound by only about 0.045 eV. That makes n-type silicon. Boron has one electron too few and makes p-type, conducting by holes. Put p and n regions side by side and you get diodes. Put three together and you get a transistor. The first transistor was built at Bell Labs in December 1947 by John Bardeen and Walter Brattain, and William Shockley soon designed the junction version. The three shared the 1956 Nobel Prize in Physics.</p>
<p>The sparkles in the <b>Band surface</b> view give a rough sense of thermal carriers. Each extra sparkle means about ten times more carriers per cm³. The estimate uses silicon's densities of states, so it only gives the order of magnitude for other gaps.</p>`,
    },
    {
      title: 'Two dimensions and graphene',
      html: `<p>In two dimensions the band becomes a surface $E(k_x, k_y)$. For a square lattice with nearest-neighbour hopping $t$, $E = \\varepsilon - 2t(\\cos k_x a + \\cos k_y a)$, with a width of $8t$. The scene builds this surface with the same bottom and top as the chosen 1D band. That makes it an illustration of the shape, not a separate calculation.</p>
<p>Graphene is a single sheet of carbon in a honeycomb. Its two atoms per cell give two bands, $E_\\pm = \\pm t\\,|1 + e^{i\\mathbf{k}\\cdot\\mathbf{a}_1} + e^{i\\mathbf{k}\\cdot\\mathbf{a}_2}|$ with $t \\approx 2.7$ eV. They touch at the six corners of the hexagonal Brillouin zone, the K points, exactly at the Fermi level. Near each K point the energy is a cone, $E = \\pm\\hbar v_F |\\mathbf{q}|$, with $v_F \\approx 10^6$ m/s. The electrons behave like massless particles moving at about 1/300 of the speed of light.</p>
<p>Andre Geim and Konstantin Novoselov isolated graphene with adhesive tape and measured its electronic properties, reported in Science in 2004. They received the 2010 Nobel Prize in Physics "for groundbreaking experiments regarding the two-dimensional material graphene".</p>`,
    },
  ],
  challenges: [
    {
      id: 'gap',
      title: 'Open the gap',
      prompt: 'Make the lowest band gap, between bands 1 and 2, wider than 2 eV.',
      hint: 'Taller or thicker barriers help. So does a smaller lattice constant, which pushes all the energies up.',
      check: (s) => (s.gap1 as number) > 2,
    },
    {
      id: 'metal',
      title: 'Make a metal',
      prompt: 'Half fill a band so the crystal becomes a metal.',
      hint: 'Each band holds two electrons per cell. Try an odd number of electrons per cell.',
      check: (s) => s.preset !== 'graphene' && s.cls === 'metal' && s.halfFilled === true,
    },
    {
      id: 'insulator',
      title: 'Make an insulator',
      prompt: 'Fill bands exactly and make the gap above them wider than 4 eV, closer to diamond than to silicon.',
      hint: 'Use an even number of electrons. Then raise V₀ or widen the barriers until the gap readout passes 4 eV.',
      check: (s) => s.preset !== 'graphene' && s.cls === 'insulator' && s.halfFilled === false,
    },
    {
      id: 'dirac',
      title: 'Find the Dirac point',
      prompt: 'In the graphene preset, move the k marker to where the two cones touch, so the marker energy is within 0.1 eV of zero.',
      hint: 'The marker runs along the kx axis. The cones meet at a corner of the hexagonal zone, a little beyond π/a.',
      check: (s) => s.preset === 'graphene' && (s.diracE as number) < 0.1,
    },
  ],
  caveats: `<p>The Kronig–Penney model is one-dimensional, uses square wells instead of real atomic potentials, and treats each electron alone. Real band structures need three dimensions, the actual ionic potentials, and electron–electron interactions (usually through density functional theory). The model still gets the essential physics right: bands, gaps, Bloch waves and effective masses.</p>
<p>The model's gap sizes are set by the chosen barriers. The presets are tuned so the gaps match silicon and diamond, but the real materials have indirect gaps in three dimensions, which a 1D model cannot show. The line between semiconductor and insulator, drawn here at 4 eV, is a loose convention. The 2D square-lattice surface is built to match the 1D band edges and only illustrates the shape. Its Fermi level is found by filling that surface, so it can sit slightly off the 1D value. In 2D and 3D, bands can also overlap in energy, which is why some metals have an even number of electrons per atom. The graphene surface uses nearest-neighbour hopping only, which is accurate near the Dirac points and less so far from them.</p>`,
  further: [
    { label: 'Kronig and Penney, Proc. R. Soc. A 130, 499 (1931)', url: 'https://doi.org/10.1098/rspa.1931.0019' },
    { label: 'Bloch, Z. Physik 52, 555 (1929)', url: 'https://doi.org/10.1007/BF01339455' },
    { label: 'Particle in a one-dimensional lattice (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Particle_in_a_one-dimensional_lattice' },
    { label: 'The Nobel Prize in Physics 2010', url: 'https://www.nobelprize.org/prizes/physics/2010/summary/' },
  ],
};
