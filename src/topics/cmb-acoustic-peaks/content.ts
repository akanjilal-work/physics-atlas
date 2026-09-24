import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Point a radio dish at any patch of empty sky and it picks up a faint microwave glow. It is the oldest light there is. It left a hot plasma about 380,000 years after the Big Bang and has been travelling ever since.</p>
<p>Before that moment the universe was a fog of hot plasma: protons, electrons and light, all stuck together. Light could not travel far before it bounced off a free electron. The plasma was not perfectly smooth. Slightly denser spots pulled in more matter by gravity. The light pushed back. Squeeze and push, squeeze and push: the plasma rang with <strong>sound waves</strong>.</p>
<p>Then, at about 3000 K, electrons settled onto protons to make neutral hydrogen. The fog cleared almost at once. The light went free, and the sound stopped. Whatever pattern of squeezed and stretched plasma existed at that instant was <strong>frozen into the light</strong>. We see it today as spots a few hundred millionths of a degree hotter or colder than average.</p>
<p>The surprise is that the spots have a <em>favourite size</em>. Sound had a fixed time to travel before the fog cleared, so it covered a fixed distance, about 145 million parsecs in today's stretched units. On the sky that ruler spans a little over half a degree, about the width of the full Moon, and the strongest spots are close to a degree across. Measure that angle and you learn the shape of space itself.</p>
<p>The <strong>Sky</strong> view shows a random sky built with the same statistics, wrapped on a sphere with us at the centre. The <strong>Sound shell</strong> view follows one single lump as its sound wave spreads out and then freezes. The <strong>Spectrum</strong> view counts how much the sky varies at each spot size. The bumps are the notes of that ancient sound.</p>`,
  tryFirst: [
    'In the <b>Sky</b> view, press <b>New sky</b> a few times. Every map is different, but the typical spot size stays the same.',
    'Switch to <b>Sound shell</b> and watch the plasma shell grow and then stop dead at about 147 Mpc when the fog clears.',
    'Switch to <b>Spectrum</b> and drag <b>curvature</b>. The whole comb of peaks slides sideways, but their heights stay put.',
    'Now drag <b>baryons</b> up. The odd peaks (amber) grow much more than the even ones (cyan).',
  ],
  equation: {
    tex: '\\ell_n \\;\\approx\\; \\frac{\\pi\\, D_A(z_*)}{r_s}\\,\\bigl(n - \\varphi\\bigr)',
    caption: 'The peaks are harmonics of one ruler. The sound horizon $r_s$ seen from distance $D_A$ fixes the spacing $\\ell_A = \\pi D_A / r_s \\approx 300$. A phase shift $\\varphi \\approx 0.27$ puts the first peak near 220, not 300.',
    terms: [
      { tex: '\\ell_n', name: 'Peak multipole', meaning: 'Where the $n$-th peak sits. A multipole $\\ell$ corresponds to spots about $180^\\circ/\\ell$ across, so $\\ell \\approx 220$ is about $0.8^\\circ$.', param: 'l1' },
      { tex: 'D_A(z_*)', name: 'Distance to last scattering', meaning: 'The comoving angular diameter distance to the surface where the light was released, about 13.9 Gpc. Curvature changes it: closed space makes things look bigger. Try the curvature slider.', param: 'DM' },
      { tex: 'r_s', name: 'Sound horizon', meaning: 'How far sound could travel in the plasma before it was released, about 144 Mpc (comoving). Baryons slow the sound and dark matter speeds up the expansion, so both shrink it.', param: 'rs' },
      { tex: '\\frac{\\pi D_A}{r_s}', name: 'Acoustic scale', meaning: 'The spacing $\\ell_A$ between neighbouring peaks. For Planck values it is about 302.', param: 'lA' },
      { tex: 'n', name: 'Peak number', meaning: 'Odd $n$ are compressions of the plasma, even $n$ are rarefactions. Baryons make the odd ones louder.', param: 'r21' },
      { tex: '\\varphi', name: 'Phase shift', meaning: 'Gravity was changing while the sound played, which shifts every peak to slightly lower $\\ell$. Real values are about 0.22 to 0.32 and differ a little from peak to peak. The toy uses one tuned value.' },
    ],
  },
  physicsNotes: `
<h3>The definitions</h3>
<p>The <strong>sound horizon</strong> is the comoving distance a sound wave travels from the Big Bang to last scattering at $z_* \\approx 1090$:</p>
$$r_s = \\int_0^{t_*} \\frac{c_s\\,dt}{a}, \\qquad c_s = \\frac{c}{\\sqrt{3(1+R)}}, \\qquad R = \\frac{3\\rho_b}{4\\rho_\\gamma}.$$
<p>$R$ is the <strong>baryon loading</strong>. Pure light would carry sound at $c/\\sqrt3$. Baryons add inertia without adding pressure, so they slow it. At last scattering $R \\approx 0.62$.</p>
<p>$D_A$ here is the <em>comoving</em> angular diameter distance, often written $D_M$. It is $(1+z)$ times the ordinary angular diameter distance. For flat space it is $D_A = \\int_0^{z_*} c\\,dz/H(z)$. For curved space the integral goes through $\\sinh$ or $\\sin$. A ruler of comoving size $r_s$ then spans an angle $\\theta_* = r_s / D_A$. Planck measures $100\\,\\theta_* = 1.0411$ to about 0.03 percent. It is the most precisely known number in cosmology.</p>
<h3>Why peaks at all</h3>
<p>Expand the sky in spherical harmonics $Y_{\\ell m}$. Each Fourier mode of the plasma with wavenumber $k$ oscillates like a driven spring, $\\delta_\\gamma \\propto \\cos(k r_s)$. At the moment of release, modes with $k r_s = n\\pi$ are caught at maximum squeeze or maximum stretch. Those are the peaks. A mode of wavenumber $k$ at distance $D_A$ shows up near $\\ell \\approx k D_A$. So $\\ell_n \\approx n\\pi D_A / r_s$, before the phase shift.</p>
<h3>The toy spectrum on this page</h3>
<p>The curve is a <strong>toy</strong> in the spirit of Hu and Sugiyama (1995). It combines a Sachs–Wolfe plateau at low $\\ell$ with an oscillator $G\\,(1+aR)\\cos x - bRP$ plus a smaller velocity term. Here $x = \\pi(\\ell/\\ell_A + \\varphi)$, $G$ is radiation driving, $P$ is the decay of the potential wells, and an exponential envelope is Silk damping. The background numbers ($z_*$, $r_s$, $D_A$, $R$, the equality scale) are computed properly. About a dozen shape constants were tuned by hand to the Planck best fit. The toy puts the peaks at $\\ell \\approx 221, 528, 823$. Planck measures about 220, 538 and 811.</p>`,
  deep: [
    {
      title: 'What each peak tells us',
      html: `<p><strong>Position of the first peak: geometry.</strong> In a closed universe space curves like the surface of a sphere and acts like a magnifying lens. A distant ruler looks bigger, so the peak moves to lower $\\ell$. In an open universe it moves to higher $\\ell$. The balloon experiments BOOMERanG and MAXIMA found the first peak near $\\ell \\approx 200$ in 2000, close to the flat-space prediction. Planck with galaxy surveys now gives $\\Omega_k = 0.0007 \\pm 0.0019$.</p>
<p><strong>Odd against even peaks: baryons.</strong> Baryons add weight to the plasma. In a gravitational well the heavier plasma sinks deeper before the light's pressure stops it. So compressions (peaks 1, 3, 5) get louder and rarefactions (2, 4) get weaker. The ratio of the second to the first peak is a baryon meter. It gives $\\Omega_b h^2 = 0.0224 \\pm 0.0001$, in agreement with the amount of deuterium made in the first minutes.</p>
<p><strong>Overall height and the third peak: dark matter.</strong> Early on, radiation dominates. As a plasma wave falls into a well, the well itself decays because the radiation pushes out. That gives the wave an extra kick, called radiation driving. More dark matter means earlier matter domination, deeper wells that last, and less of this boost. The third peak is sensitive to it. Planck finds $\\Omega_c h^2 = 0.120 \\pm 0.001$, about five times the baryons.</p>
<p><strong>The damping tail: diffusion.</strong> Photons random-walk through the plasma. Waves smaller than that random walk are smoothed out. Joseph Silk described this in 1968. It is why the peaks fade beyond $\\ell \\approx 1500$.</p>`,
    },
    {
      title: 'History: from a hiss in an antenna to Planck',
      html: `<p>In 1965 Arno Penzias and Robert Wilson at Bell Labs found an excess noise of about 3.5 K in a horn antenna at 4080 MHz. It came from every direction. Robert Dicke, Jim Peebles, Peter Roll and David Wilkinson at Princeton, who were building a detector to look for exactly this, explained it in a companion paper as relic radiation from a hot early universe. Penzias and Wilson shared the 1978 Nobel Prize in Physics.</p>
<p>The COBE satellite launched in 1989. Its FIRAS instrument showed that the spectrum is a blackbody with deviations below about 50 parts per million of the peak. Its DMR instrument announced the first detection of the temperature ripples in 1992, at about one part in 100,000. John Mather and George Smoot shared the 2006 Nobel Prize for this work.</p>
<p>WMAP (2001 to 2010) mapped the ripples across the whole sky with resolution fine enough to see the first peaks. Planck (2009 to 2013) measured the spectrum out to $\\ell \\approx 2500$ and the polarisation. Ground telescopes such as ACT and SPT extend it to even smaller scales.</p>
<p>Two predictions came first. Rashid Sunyaev and Yakov Zel'dovich, and separately Jim Peebles and Jer Yu, worked out the acoustic oscillations in 1970.</p>`,
    },
    {
      title: 'Recombination and the perfect blackbody',
      html: `<p>Hydrogen's ionisation energy is 13.6 eV, which corresponds to about 158,000 K. Yet the plasma only became neutral at about 3000 K, near 0.26 eV. The reason is numbers. There are roughly 1.6 billion photons for every baryon. Even when the average photon is too weak, the rare energetic ones in the blackbody tail are enough to knock off any electron that settles. Only at about 3000 K do they become too few.</p>
<p>Once free, the light simply redshifts. Every wavelength stretches by the same factor $1+z$, so a blackbody at temperature $T$ stays a blackbody at $T/(1+z)$. That is why the sky today is at $T_0 = 2.7255$ K and was at $2.7255 \\times 1090 \\approx 2970$ K when released. The spectrum peaks at 160 GHz per unit frequency, or at a wavelength of 1.06 mm per unit wavelength. The two peaks differ because the two ways of slicing the spectrum weight it differently.</p>
<p>The ripples are tiny. The root-mean-square temperature variation is about 100 microkelvin, a few parts in 100,000 of the mean. The largest pattern on the real sky is a dipole of about 3.4 mK from our own motion of about 370 km/s. It is removed before analysis, and it is left out of the synthetic sky here.</p>`,
    },
    {
      title: 'The same ruler in the galaxies: BAO',
      html: `<p>The baryons carried the sound wave. When the light left, the baryon shell stopped at the <em>drag epoch</em>, $z_d \\approx 1060$, at a radius $r_d \\approx 147$ Mpc. That is slightly larger than $r_s$ at $z_*$ because baryons feel the photons' drag for a little longer.</p>
<p>Dark matter at the centre and the baryon shell then pulled on each other. Both ended up with most of their mass near the centre and a small echo at 147 Mpc. Galaxies form where matter gathers, so there is a slight excess of galaxy pairs about 147 Mpc apart. This is the <strong>baryon acoustic oscillation</strong> (BAO) feature. The <b>Sound shell</b> view tells this story for one lump. The real universe is a sum of countless overlapping shells. See it in the <a href="#/t/cosmic-web">cosmic web</a>.</p>
<p>The SDSS and 2dF galaxy surveys detected the feature in 2005. Surveys such as BOSS and DESI now measure it at many redshifts and use it as a standard ruler to trace the expansion history.</p>`,
    },
    {
      title: 'Large-angle anomalies, stated carefully',
      html: `<p>The standard model fits the spectrum from $\\ell \\approx 30$ to 2500 very well. At the largest angles a few oddities show up. The quadrupole ($\\ell = 2$) is lower than expected. The quadrupole and octopole are oddly aligned. One half of the sky fluctuates slightly more than the other. And there is the <strong>Cold Spot</strong>, a region in the southern sky about 10° across that is colder than typical, first noted in WMAP data in 2004.</p>
<p>Planck confirmed that these features are really in the sky and not instrument errors. Their significance is modest, typically around 2 to 3 standard deviations. It also depends on the fact that they were picked out after looking at the map, which makes the odds hard to judge. Cosmic variance is large at low $\\ell$, since there are only $2\\ell+1$ modes to average. Most cosmologists regard them as probable flukes, but they remain open questions. There is no accepted evidence that the Cold Spot is anything exotic.</p>`,
    },
  ],
  challenges: [
    {
      id: 'baryons',
      title: 'Heavy plasma',
      prompt: 'Raise the baryon density until the second peak is less than 0.39 of the first.',
      hint: 'Drag <b>Ω_b h²</b> up to about 0.032 and watch the $D_2/D_1$ readout. Heavier plasma sinks deeper into the wells, so compressions (odd peaks) win.',
      check: (s) => (s.wb as number) >= 0.03 && (s.r21 as number) < 0.39,
    },
    {
      id: 'curve',
      title: 'Bend space',
      prompt: 'Use curvature alone to move the first peak below ℓ = 200 or above ℓ = 245.',
      hint: 'Negative $\\Omega_k$ is closed, like a sphere, and makes the ruler look bigger, so the peak moves to lower $\\ell$. Keep the other two sliders near the Planck values. You need $|\\Omega_k|$ of about 0.08. The real sky rules out anything beyond about 0.005.',
      check: (s) => Math.abs(s.ok as number) > 0.001 && Math.abs((s.wb as number) - 0.02237) < 0.002 && Math.abs((s.wc as number) - 0.12) < 0.01 && ((s.l1 as number) < 200 || (s.l1 as number) > 245),
    },
    {
      id: 'find220',
      title: 'Find ℓ ≈ 220',
      prompt: 'In the Spectrum view, click the ribbon at the top of the first peak.',
      hint: 'Switch the view to <b>Spectrum</b> and click near the tallest bump. The cursor must land within 10 of the first peak and within 12 of 220.',
      check: (s) => (s.picked as number) > 0 && Math.abs((s.picked as number) - (s.l1 as number)) <= 10 && Math.abs((s.picked as number) - 220) <= 12,
    },
    {
      id: 'freeze',
      title: 'Freeze the sound',
      prompt: 'Watch a sound shell freeze at the drag epoch.',
      hint: 'Switch the view to <b>Sound shell</b> and wait, or press <b>Launch shell</b>. The plasma shell stops when the light escapes.',
      check: (s) => s.shellFrozen === true,
    },
  ],
  caveats: `<p>The power spectrum is a <strong>toy</strong>. The background quantities are real calculations: the last-scattering redshift from the Hu and Sugiyama fit, the sound horizon by direct integration, the drag-epoch horizon from the fit of Aubourg et al. (2015), and the distance with curvature. The shape of the spectrum is not. It has about a dozen constants tuned by hand to Planck, and a single phase shift for all peaks. The trends are right in direction, but the sizes of the changes can be off by a lot. For example, it exaggerates how much the first peak grows with baryons. Real work uses Boltzmann codes such as CAMB and CLASS.</p>
<p>The toy leaves out the integrated Sachs–Wolfe effect, reionisation, gravitational lensing, polarisation and neutrino effects. The Hubble parameter is held at $h = 0.674$ while you change the other parameters, and dark energy absorbs the rest of the budget. Real fits vary everything together.</p>
<p>The sky map is a Gaussian random field with the toy spectrum up to $\\ell = 192$, so it lacks the finest detail, and it has no dipole, galaxy or foregrounds. The sound shell is a cartoon of one point-like lump. The real plasma held countless overlapping lumps. The radial profiles are schematic, following the picture of Eisenstein, Seo and White (2007), not a computed solution.</p>`,
  further: [
    { label: 'Hu & Dodelson (2002), Cosmic Microwave Background Anisotropies, Annual Review of Astronomy and Astrophysics', url: 'https://arxiv.org/abs/astro-ph/0110414' },
    { label: 'Planck Collaboration (2020), Planck 2018 results VI. Cosmological parameters', url: 'https://doi.org/10.1051/0004-6361/201833910' },
    { label: 'Eisenstein et al. (2005), Detection of the baryon acoustic peak in the large-scale correlation function of SDSS luminous red galaxies', url: 'https://arxiv.org/abs/astro-ph/0501171' },
    { label: 'Cosmic microwave background on Wikipedia', url: 'https://en.wikipedia.org/wiki/Cosmic_microwave_background' },
  ],
};
