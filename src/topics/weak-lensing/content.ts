import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Most of the mass in a galaxy cluster gives off no light at all. We can still weigh it and even draw a map of it. The trick is to look past it, at the galaxies far behind.</p>
<p>Mass bends light. A large clump of matter acts like a weak, lumpy lens. Light from a distant galaxy passes the clump on its way to us, and the image of that galaxy gets <strong>stretched a little along a circle</strong> centred on the clump. Near a big cluster the stretch is a few percent. For the general web of matter in the universe it is closer to one percent.</p>
<p>The catch is that galaxies are not round to begin with. Each one is an ellipse pointing in its own random direction. One galaxy tells you almost nothing. But the random shapes average away, and the lensing stretch does not. Average a few hundred galaxies in a patch of sky and the pattern appears. That is <strong>weak lensing</strong>: a statistical signal hidden in the shapes of millions of galaxies.</p>
<p>In the scene, the far plane holds the background galaxies. The glowing violet cloud in the middle plane is the dark matter halo. In a real sky it is invisible. The observer sits at the front. By default the lensing stretch is <strong>exaggerated ten times</strong> so your eye can see the rings. Switch the exaggeration off to see how subtle the real effect is.</p>
<p>The corner plot averages the stretch in rings around the halo. The maps view turns the shapes back into a mass map and puts it beside the true one. Astronomers use the same steps to find matter that gives off no light.</p>`,
  tryFirst: [
    'Turn <b>Exaggerate ×10</b> off and on. With it off, the stretch is almost impossible to see by eye, yet the corner plot still finds it.',
    'Raise the <b>number of galaxies</b> and watch the error bars in the corner plot shrink and the S/N readout climb.',
    'Set the <b>view</b> to <b>Maps</b>. The left surface is the true mass. The right one is rebuilt from galaxy shapes alone.',
    'Drop the <b>shape noise</b> to zero. Every galaxy becomes round before lensing, so the stretch shows up cleanly even without exaggeration.',
  ],
  equation: {
    tex: '\\gamma(\\boldsymbol\\theta)\\;\\overset{\\text{KS}}{\\longleftrightarrow}\\;\\kappa(\\boldsymbol\\theta):\\qquad \\hat\\gamma(\\boldsymbol\\ell) = \\frac{(\\ell_1 + i\\,\\ell_2)^2}{|\\boldsymbol\\ell|^2}\\;\\hat\\kappa(\\boldsymbol\\ell)',
    caption: 'The Kaiser–Squires relation. In Fourier space the shear $\\gamma$ is the convergence $\\kappa$ times a pure phase, so each map fixes the other up to a constant. The convergence is the projected mass density in units of a critical value, $\\kappa = \\Sigma/\\Sigma_{\\rm cr}$. Galaxy shapes measure the reduced shear $g = \\gamma/(1-\\kappa)$.',
    terms: [
      { tex: '\\gamma', name: 'Shear', meaning: 'A complex number $\\gamma_1 + i\\gamma_2$ that says how much, and along which axis, images are stretched. The readout gives the tangential shear 2′ from the main lens.', param: 'gamma2' },
      { tex: '\\kappa', name: 'Convergence', meaning: 'Projected mass density divided by $\\Sigma_{\\rm cr}$. It grows with the lens mass slider.', param: 'mass' },
      { tex: '\\frac{(\\ell_1 + i\\ell_2)^2}{|\\boldsymbol\\ell|^2}', name: 'Kaiser–Squires kernel', meaning: 'A pure phase of size one. Its inverse turns averaged galaxy shapes back into a mass map. The correlation readout scores that map against the truth.', param: 'corr' },
      { tex: '\\boldsymbol\\ell', name: 'Wavevector', meaning: 'Spatial frequency on the sky. The smoothing slider damps high $\\ell$, where shape noise dominates.', param: 'smooth' },
      { tex: '\\Sigma_{\\rm cr}', name: 'Critical density', meaning: '$\\Sigma_{\\rm cr} = \\dfrac{c^2}{4\\pi G}\\dfrac{D_s}{D_l D_{ls}}$. It depends only on the distances. Here the lens is at $z = 0.3$ and the sources at $z = 1$.', param: 'sigcr' },
    ],
  },
  physicsNotes: `
<h3>From mass to shear</h3>
<p>In the thin-lens picture, all the lens mass is squashed onto one plane. Its bending is set by a 2D lensing potential $\\psi$ that obeys a Poisson equation, $\\nabla^2\\psi = 2\\kappa$. The shear is made of second derivatives of the same potential:</p>
$$\\gamma_1 = \\tfrac12(\\psi_{,11} - \\psi_{,22}), \\qquad \\gamma_2 = \\psi_{,12}$$
<p>In Fourier space each derivative becomes a factor of $i\\ell$. Divide the shear by the convergence and $\\psi$ drops out, leaving the headline equation. The $\\ell = 0$ mode has no shear at all, so a uniform sheet of mass is invisible to shear. This is the <strong>mass-sheet degeneracy</strong>.</p>
<p>The scene samples $\\kappa$ on a $128 \\times 128$ grid that covers twice the field, takes a 2D FFT, multiplies by the kernel, and transforms back. The <b>grid vs analytic</b> readout compares this with the exact shear of the profile. It stays around 2%, mostly from pixels and the finite grid.</p>
<h3>The lens models</h3>
<p>A <strong>singular isothermal sphere</strong> (SIS) has density falling as $1/r^2$, which gives flat rotation curves. Its Einstein radius is</p>
$$\\theta_E = 4\\pi\\left(\\frac{\\sigma_v}{c}\\right)^2\\frac{D_{ls}}{D_s}$$
<p>and both its convergence and its tangential shear equal $\\theta_E/(2\\theta)$. The <strong>NFW</strong> profile is the shape found in cold dark matter simulations. It falls as $r^{-1}$ inside a scale radius and $r^{-3}$ outside. Here it uses a concentration of 4, typical for clusters. For both, the mass slider sets $M_{200}$, the mass inside the radius where the mean density is 200 times the critical density of the universe.</p>
<h3>From shapes back to mass</h3>
<p>Each galaxy has an intrinsic ellipticity $\\epsilon_s$ drawn from a Gaussian with $\\sigma_e$ per component. Lensing maps it to $\\epsilon = (\\epsilon_s + g)/(1 + g^*\\epsilon_s)$. For random orientations the average is exactly $g$. The scene averages $\\epsilon$ in $1' \\times 1'$ cells, smooths, and runs Kaiser–Squires backwards. The imaginary part of the result, the <strong>B mode</strong>, should be pure noise. Its rms is the noise readout.</p>`,
  deep: [
    {
      title: 'Why noise falls as 1/√N',
      html: `<p>Write the measured ellipticity as signal plus noise, $\\epsilon_i = g + \\epsilon_{s,i}$ in the weak limit. The intrinsic parts are independent with spread $\\sigma_e$. The mean of $N$ of them has spread</p>
$$\\sigma_{\\bar\\epsilon} = \\frac{\\sigma_e}{\\sqrt N}$$
<p>With $\\sigma_e \\approx 0.26$, you need about 700 galaxies to measure a 1% shear at one sigma. A cluster shear of 5% needs only about 30 for the same significance. That is why the field is split into cells, and why the map sharpens as you add galaxies.</p>
<p>The <b>S/N</b> readout fits the measured tangential profile to the true one, bin by bin, weighting each bin by $n/\\sigma_e^2$. The fitted amplitude divided by its error is the detection significance. It grows as $\\sqrt N$ and roughly in proportion to the lens mass.</p>`,
    },
    {
      title: 'First detections',
      html: `<p>In 1990 Anthony Tyson, Richard Wenk and Francisco Valdes reported that faint blue background galaxies around two rich clusters were lined up tangentially. It was the first detection of coherent weak lensing by a cluster. In 1993 Nick Kaiser and Gordon Squires showed how to invert the shear field into a mass map. That is the relation at the top of this page.</p>
<p>In March 2000 four teams, led by David Bacon, Nick Kaiser, Ludovic Van Waerbeke and David Wittman, independently reported <strong>cosmic shear</strong>. This is the lensing by all the large-scale structure between us and distant galaxies, not by one cluster. The signal is under 1%, and it was measured on random patches of sky.</p>
<p>In 2006 Douglas Clowe and colleagues used weak lensing to map the Bullet Cluster, a pair of colliding clusters. The lensing mass sits with the galaxies, well away from the hot gas that holds most of the ordinary matter. Many see it as some of the most direct evidence that dark matter exists.</p>`,
    },
    {
      title: 'The big surveys',
      html: `<p>Modern surveys measure the shapes of tens of millions of galaxies. The <strong>Dark Energy Survey</strong> (DES) used the Blanco telescope in Chile from 2013 to 2019. The <strong>Kilo-Degree Survey</strong> (KiDS) used the VLT Survey Telescope at Paranal. The <strong>Hyper Suprime-Cam</strong> survey (HSC) uses the Subaru telescope on Mauna Kea and goes deeper over a smaller area.</p>
<p>The next generation is far larger. ESA's <strong>Euclid</strong> telescope launched on 1 July 2023. It will image about a third of the sky from space, where there is no atmosphere to blur the shapes. The <strong>Vera C. Rubin Observatory</strong> in Chile released its first images in 2025. Its ten-year Legacy Survey of Space and Time (LSST) will measure billions of galaxies from the ground.</p>
<p>The hardest part is not the statistics. It is systematics. The telescope and the atmosphere blur every galaxy, and that blur must be modelled and removed. For the newest surveys, leftover shape biases must stay near a tenth of a percent. Source redshifts come from colours, not spectra, and small errors there bias the mass.</p>`,
    },
    {
      title: 'The S8 question',
      html: `<p>Cosmic shear is most sensitive to a combination of the matter density $\\Omega_m$ and the clumpiness $\\sigma_8$:</p>
$$S_8 = \\sigma_8\\sqrt{\\Omega_m/0.3}$$
<p>Planck's 2018 analysis of the cosmic microwave background, run forward with standard ΛCDM, predicts $S_8 = 0.832 \\pm 0.013$. Several lensing surveys found lower values. KiDS-1000 in 2021 reported about $0.76$, and DES Year 3 found similar numbers. The gap was about two to three standard deviations.</p>
<p>This is an open question, not a crisis. Newer analyses with better calibration have moved closer to Planck. The final KiDS analysis in 2025 found a value consistent with it. A real tension could point to new physics in dark matter or dark energy. It could also come from how feedback from supermassive black holes pushes gas around, or from subtle systematics. Euclid and Rubin should settle it.</p>`,
    },
    {
      title: 'Edge cases and limits',
      html: `<p><strong>Strong lensing.</strong> Near the centre of a massive cluster, $\\kappa$ approaches 1 and images become arcs or multiple images. The scene masks sources with $\\kappa > 0.5$ and draws them in rose. The weak-lensing formulas do not apply there.</p>
<p><strong>Reduced shear.</strong> Shapes measure $g = \\gamma/(1-\\kappa)$, not $\\gamma$. Adding a uniform sheet $\\kappa \\to \\lambda\\kappa + (1-\\lambda)$ with $\\gamma \\to \\lambda\\gamma$ leaves $g$ unchanged. So shapes alone cannot pin down a constant mass offset. Counts of magnified galaxies can help break this.</p>
<p><strong>Finite fields.</strong> Kaiser–Squires assumes the shear is known everywhere. On a finite patch, the edges leak errors into the map. That is one reason the noise-free map here is close to the truth but not identical.</p>`,
    },
  ],
  challenges: [
    {
      id: 'detect',
      title: 'Detect the lens',
      prompt: 'Change the setup until the tangential shear signal around lens 1 reaches a significance of 3σ or more.',
      hint: 'Significance grows as √N and roughly with mass. Try more galaxies or a heavier lens.',
      check: (s) => s.touched === true && (s.snr as number) >= 3,
    },
    {
      id: 'sharpen',
      title: 'Sharpen the map',
      prompt: 'With realistic shape noise ($\\sigma_e \\ge 0.2$), use at least 10,000 galaxies and get a reconstruction that correlates with the truth at 0.7 or better.',
      hint: 'Open the Maps view and raise N. A heavier lens and a little more smoothing also help.',
      check: (s) => (s.N as number) >= 10000 && (s.sigmaE as number) >= 0.2 && (s.corr as number) >= 0.7,
    },
    {
      id: 'two',
      title: 'Split the pair',
      prompt: 'Turn on a second lens at least 3′ from the first. Keep $\\sigma_e \\ge 0.2$. Get both peaks above 3σ in the reconstruction with a clear dip between them.',
      hint: 'Put the lenses 5′ to 7′ apart, make both heavy, and raise N. Too much smoothing blurs them into one.',
      check: (s) => s.lens2 === true && (s.sep as number) >= 3 && (s.sigmaE as number) >= 0.2 && (s.peak1 as number) >= 3 && (s.peak2 as number) >= 3 && s.dip === true,
    },
    {
      id: 'perfect',
      title: 'A perfect map',
      prompt: 'Turn off shape noise and get a reconstruction that correlates with the truth at 0.95 or better.',
      hint: 'With $\\sigma_e = 0$ every galaxy is a perfect shear gauge. You still need enough galaxies to fill every cell.',
      check: (s) => (s.sigmaE as number) === 0 && (s.corr as number) >= 0.95,
    },
  ],
  caveats: `The lens is a single thin plane at $z = 0.3$ and all sources sit at $z = 1$. Real sources span a range of redshifts. Galaxy positions are not shifted by lensing and magnification is ignored, so only shapes change. Shapes are measured perfectly: there is no blurring by a telescope, no pixel noise and no shape-measurement bias. Mass outside a $32' \\times 32'$ box is ignored. The lenses are round SIS or NFW halos with no substructure, and there is no cosmic shear from other structure along the line of sight. Distances use flat ΛCDM with $H_0 = 70$ km/s/Mpc and $\\Omega_m = 0.3$. The halo glow in the lens plane is schematic in size.`,
  further: [
    { label: 'Weak gravitational lensing (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Weak_gravitational_lensing' },
    { label: 'Bartelmann & Schneider, Weak gravitational lensing (review, arXiv)', url: 'https://arxiv.org/abs/astro-ph/9912508' },
    { label: 'Kaiser & Squires 1993, Mapping the dark matter with weak gravitational lensing', url: 'https://doi.org/10.1086/172297' },
    { label: 'ESA Euclid mission', url: 'https://www.esa.int/Science_Exploration/Space_Science/Euclid' },
  ],
};
