import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Gravity pulls. So the expansion of the universe should be slowing down. In 1998 two teams set out to measure how fast it was slowing. They found it was speeding up.</p>
<p>Their tool was a kind of exploding star, a <strong>type Ia supernova</strong>. These blasts all reach nearly the same peak brightness. So how faint one looks tells you how far away it is, the way a street lamp looks dimmer down the road. Its redshift tells you how much the universe has grown since the light left.</p>
<p>Put the two together and you get a record of the expansion. If it had been slowing, distant supernovae would be closer, and so brighter, than in an empty universe. They were fainter. The light had travelled farther than expected. Something had been pushing the expansion faster.</p>
<p>That something is called <strong>dark energy</strong>. It makes up about 70% of the universe's energy today. Its defining trait is odd: its density hardly thins out as space grows. Matter spreads thinner as the universe expands. Dark energy seems to stay nearly constant, so it wins in the end.</p>
<p>Nobody knows what it is. It might be the energy of empty space itself. It might be a new field that slowly changes. Recent surveys hint that it may be changing with time. That hint is not yet proven.</p>
<p>In the scene each flashing point is a supernova. The coloured ribbons are the predictions of different universes. Watch which ribbon the points follow.</p>`,
  tryFirst: [
    'In the Hubble diagram, the points sit above the violet <b>empty</b> ribbon and far above the cyan <b>matter only</b> ribbon. Above means fainter. That gap is the discovery.',
    'Switch <b>View</b> to the $\\Omega_m$–$\\Omega_\\Lambda$ plane and press <b>Fit</b>. The glowing valley is where the data are happy. It lies in the accelerating region, above the line of zero dark energy.',
    'Drag <b>w₀</b> toward 0 in the expansion history view. The amber stretch, where the expansion speeds up, shrinks and then vanishes.',
    'Raise the <b>scatter</b> and lower the <b>number of supernovae</b>. Press Fit again. The valley widens and $\\Omega_\\Lambda = 0$ is no longer ruled out.',
  ],
  equation: {
    tex: '\\rho_{DE}(a) \\propto a^{-3(1+w)}',
    caption: 'How the density of a fluid with pressure $p = w\\rho c^2$ changes as the universe grows by the scale factor $a$. For $w = -1$ the exponent is zero and the density never changes. That is the cosmological constant. In the CPL model $w$ itself drifts, $w(a) = w_0 + w_a(1-a)$, and the density becomes $a^{-3(1+w_0+w_a)}e^{-3w_a(1-a)}$.',
    terms: [
      { tex: '\\rho_{DE}', name: 'Dark energy density', meaning: 'Energy per volume in dark energy. The readout shows its value when the universe was half its present size, compared with today. It is exactly 1 for $w = -1$.', param: 'rho' },
      { tex: 'a', name: 'Scale factor', meaning: 'The size of the universe relative to today. Light emitted at $a$ reaches us with redshift $1 + z = 1/a$. The readout gives the redshift at which the expansion began to speed up.', param: 'zacc' },
      { tex: 'w', name: 'Equation of state', meaning: 'Pressure divided by energy density, $w = p/\\rho c^2$. Matter has $w = 0$, light has $w = 1/3$, a cosmological constant has $w = -1$. Set today\u2019s value with $w_0$.', param: 'w0' },
      { tex: 'w_a', name: 'Evolution of w', meaning: 'How much $w$ differed in the past: $w(a) = w_0 + w_a(1-a)$. Zero means $w$ is constant. DESI prefers negative $w_a$ with $w_0$ above $-1$.', param: 'wa' },
      { tex: '-3(1+w)', name: 'Dilution rate', meaning: 'How fast the density thins. Acceleration needs $\\rho + 3p/c^2 < 0$, so $w < -1/3$. With dark energy alone the deceleration parameter is $q = (1+3w)/2$.', param: 'q0' },
    ],
  },
  physicsNotes: `
<h3>From the continuity equation</h3>
<p>As a region of space grows, the energy inside changes by the work its pressure does: $d(\\rho c^2 a^3) = -p\\,d(a^3)$. Put in $p = w\\rho c^2$ and this becomes $d\\rho/\\rho = -3(1+w)\\,da/a$. For constant $w$ the solution is the headline equation. Dust has $w = 0$ and thins as $a^{-3}$, one factor per dimension. Radiation has $w = 1/3$ and thins as $a^{-4}$, the extra factor from redshift. A cosmological constant has $w = -1$ and does not thin at all.</p>
<h3>Why that speeds things up</h3>
<p>The second Friedmann equation gives the acceleration of the scale factor:</p>
$$\\frac{\\ddot a}{a} = -\\frac{4\\pi G}{3}\\left(\\rho + \\frac{3p}{c^2}\\right)$$
<p>In general relativity pressure gravitates too. A fluid with $w < -1/3$ makes $\\rho + 3p/c^2$ negative, and its gravity pushes outward. With matter and dark energy today, the deceleration parameter is $q_0 = \\Omega_m/2 + \\Omega_{DE}(1+3w_0)/2$. For $\\Omega_m = 0.3$ and a cosmological constant, $q_0 = -0.55$.</p>
<h3>From distance to brightness</h3>
<p>The first Friedmann equation, $H^2 = H_0^2[\\Omega_m a^{-3} + \\Omega_k a^{-2} + \\Omega_{DE}\\rho_{DE}(a)/\\rho_{DE,0}]$, gives the comoving distance $D_C = c\\int_0^z dz'/H(z')$. With curvature this becomes $D_M$. The luminosity distance is $d_L = (1+z)D_M$. Astronomers use the <b>distance modulus</b>, the difference between apparent and absolute magnitude:</p>
$$\\mu = m - M = 5\\log_{10}\\left(\\frac{d_L}{10\\ \\text{pc}}\\right)$$
<p>A difference of 0.2 in $\\mu$ means about 10% in distance. The simulation computes $d_L$ by Simpson\u2019s rule.</p>
<h3>The fit</h3>
<p>Each synthetic supernova gets a true $\\mu$ from the chosen universe plus Gaussian scatter. For each point on a grid of $(\\Omega_m, \\Omega_\\Lambda)$ with $w = -1$ the code computes $\\chi^2 = \\sum_i (\\mu_i - \\mu_{\\text{model}}(z_i) - \\delta)^2/\\sigma_i^2$. The offset $\\delta$ is chosen to minimise $\\chi^2$. It stands for the unknown peak brightness $M$ and the Hubble constant, which supernovae alone cannot separate. The contours enclose $\\Delta\\chi^2 = 2.30$, 6.18 and 11.83 above the minimum. For two fitted parameters those hold 68.3%, 95.4% and 99.73% of the probability.</p>
<h3>The history</h3>
<p>The expansion history view steps $\\ddot a$ with fourth-order Runge-Kutta, forward and backward from today. The <b>Friedmann check</b> readout is the largest mismatch between $(\\dot a/a)^2$ and $H^2$ from the first equation along the way. It stays near $10^{-11}$.</p>`,
  deep: [
    {
      title: '1998: the universe is speeding up',
      html: `<p>Two teams raced to measure the slowing of the expansion. The Supernova Cosmology Project was led by Saul Perlmutter at Lawrence Berkeley National Laboratory. The High-Z Supernova Search Team was led by Brian Schmidt, with Adam Riess as lead author of its key paper. Both found supernovae at redshifts near 0.5 by imaging the same patches of sky weeks apart and looking for new points of light.</p>
<p>Type Ia supernovae are not perfect standard candles. Their peak brightness varies by a few tenths of a magnitude. In 1993 Mark Phillips showed that brighter ones fade more slowly. Correcting for this light curve shape, and for dust, brings the scatter down to roughly 0.15 magnitudes, or about 7% in distance.</p>
<p>Riess and colleagues published first, in the Astronomical Journal in September 1998. Perlmutter and colleagues published their analysis of 42 high-redshift supernovae in the Astrophysical Journal in June 1999. Both found distant supernovae fainter than any decelerating universe allows. Both preferred a positive cosmological constant, with $\\Omega_\\Lambda$ near 0.7 if space is flat.</p>
<p>The 2011 Nobel Prize in Physics went half to Perlmutter and half jointly to Schmidt and Riess, "for the discovery of the accelerating expansion of the Universe through observations of distant supernovae".</p>
<p>The classic plot from those papers is the $\\Omega_m$–$\\Omega_\\Lambda$ plane in View 2. Supernovae alone constrain a long diagonal valley. The cosmic microwave background later showed that space is close to flat. The flat line crosses the valley near $\\Omega_m \\approx 0.3$, $\\Omega_\\Lambda \\approx 0.7$. Galaxy surveys independently measured $\\Omega_m \\approx 0.3$. Three different methods met at one point.</p>`,
    },
    {
      title: 'What negative pressure means',
      html: `<p>Pressure in everyday life pushes outward. So negative pressure sounds like a pull. For dark energy the story is subtler, and the pull or push is not what drives the expansion.</p>
<p>Take a box of vacuum with a fixed energy density $\\rho c^2$. Pull the piston out by $dV$. The new volume contains energy $\\rho c^2 dV$ that was not there before. By energy conservation, $dE = -p\\,dV$, so $p = -\\rho c^2$. Something that keeps a constant density as it expands must have negative pressure equal to its energy density. That is $w = -1$.</p>
<p>A uniform pressure exerts no net force, because it pushes equally on every side. Negative pressure does not shove galaxies apart. Its effect is through gravity. In general relativity the source of gravity in the acceleration equation is $\\rho + 3p/c^2$, not just $\\rho$. For $w = -1$ this is $-2\\rho$. The vacuum\u2019s gravity is repulsive.</p>
<p>The threshold is $w = -1/3$. Above it, gravity decelerates the expansion. Below it, the expansion accelerates. At exactly $-1/3$ a fluid thins as $a^{-2}$, just like curvature, and has no effect on $\\ddot a$. Try it in challenge 4.</p>`,
    },
    {
      title: 'Cosmological constant or quintessence?',
      html: `<p><b>The cosmological constant.</b> Einstein added $\\Lambda$ to his equations in 1917 to allow a static universe. He later dropped it. It is the simplest dark energy: a constant energy of empty space with $w = -1$ exactly. It fits every data set so far well, and the standard model of cosmology, ΛCDM, is built on it. Planck 2018 combined with supernovae and baryon acoustic oscillations gave $w = -1.03 \\pm 0.03$ for constant $w$.</p>
<p>The trouble is its size. Quantum field theory says empty space should have energy from zero-point fluctuations. Naive estimates exceed the observed value by as much as about 120 orders of magnitude. No accepted mechanism explains why the true value is so small but not zero. See the topic on the vacuum energy puzzle.</p>
<p><b>Quintessence.</b> Perhaps dark energy is a slowly rolling scalar field, like the one thought to drive inflation. Early models are due to Bharat Ratra and Jim Peebles in 1988. The name came from Robert Caldwell, Rahul Dave and Paul Steinhardt in 1998. For such a field $w = (K - V)/(K + V)$, where $K$ is its kinetic and $V$ its potential energy density. A slow roll gives $w$ just above $-1$, and $w$ changes with time.</p>
<p><b>Phantom.</b> Models with $w < -1$ have density that grows as space expands. Carried far enough this ends in a Big Rip, which tears apart everything bound. Simple fields cannot do this without instabilities. A single ordinary scalar field also cannot cross $w = -1$. Several of the curves preferred by DESI do cross it, which is why theorists take those results seriously and also why they remain cautious.</p>
<p>The $w_0$–$w_a$ form used here is the CPL parametrisation of Michel Chevallier, David Polarski (2001) and Eric Linder (2003). It is a convenient two-number summary, not a physical theory.</p>`,
    },
    {
      title: 'DESI, Euclid and the hint of change',
      html: `<p>The Dark Energy Spectroscopic Instrument (DESI) sits on the 4-metre Mayall Telescope at Kitt Peak in Arizona. Five thousand robotic fibres each catch light from one galaxy or quasar. It began its main survey in 2021. It measures baryon acoustic oscillations, a standard ruler about 150 Mpc long imprinted in the galaxy distribution by sound waves in the early universe.</p>
<p>In April 2024 its first-year results hinted that dark energy might evolve. In March 2025 the three-year release (DR2) strengthened the hint. For the $w_0$–$w_a$ model with $w_0 > -1$ and $w_a < 0$, the preference over a cosmological constant was 3.1σ using DESI and the CMB. Adding supernovae it was 2.8σ, 3.8σ or 4.2σ, with the Pantheon+, Union3 or DES 5-year samples.</p>
<p>These numbers deserve care. None reaches the 5σ usually required for a discovery. They depend on which supernova sample is used, which suggests calibration matters. In late 2025 the DES team recalibrated its supernovae. With the new DES sample, the combined preference fell from 4.2σ to 3.2σ. The results also depend on the chosen form for $w(a)$ and on the priors. This is a real and interesting hint. It is not yet evidence that the cosmological constant is wrong.</p>
<p>The European Space Agency\u2019s Euclid telescope launched in July 2023. It will map galaxy shapes and positions over about a third of the sky, using weak lensing and galaxy clustering to track both the expansion and the growth of structure. The Vera C. Rubin Observatory will find very large numbers of supernovae. Together these should sharpen $w_0$ and $w_a$ a great deal.</p>`,
    },
    {
      title: 'What we honestly do not know',
      html: `<p>Nobody knows what dark energy is. That is the plain state of physics today.</p>
<p>What is established: the expansion has been accelerating for roughly the last 6 billion years. Supernovae, baryon acoustic oscillations, the cosmic microwave background and the growth of galaxy clusters all agree on this. A cosmological constant with $\\Omega_\\Lambda \\approx 0.7$ fits them well. The acceleration is not an artefact of any one method.</p>
<p>What is open: whether the density is truly constant, whether $w$ changes, and why dark energy is so small and yet began to dominate only recently. Some researchers ask whether the acceleration could instead mean that general relativity needs changing on the largest scales. So far no modified theory fits the data better than $\\Lambda$ without extra tuning.</p>
<p>The name "dark energy" is a label for an effect, not an explanation. It could turn out to be vacuum energy, a new field, a sign of new gravity, or something not yet imagined.</p>`,
    },
  ],
  challenges: [
    {
      id: 'lambda',
      title: 'Discover dark energy',
      prompt: 'With data from nature, press <b>Fit</b> and get a best-fit $\\Omega_\\Lambda$ above 0.5, with $\\Omega_\\Lambda \\le 0$ ruled out at more than 99.7% confidence.',
      hint: 'The 99.7% contour must lie wholly above the $\\Omega_\\Lambda = 0$ line. If it does not, add supernovae or lower the scatter, then fit again. Press <b>New sample</b> for a fresh draw of the sky.',
      check: (s) => s.fitByUser === true && s.fitStale === false && s.dataSource === 'nature' && (s.fitOl as number) > 0.5 && (s.dchiNoLambda as number) > 11.83,
    },
    {
      id: 'matter',
      title: 'Matter alone fails',
      prompt: 'Set your universe to matter only, $\\Omega_m = 1$ and $\\Omega_\\Lambda = 0$, and see it rejected by the data from nature at more than 3σ.',
      hint: 'Use the <b>Matter only</b> button or the sliders. Watch the χ² readout for ΛCDM. A p-value below 0.0027 means the model is ruled out at over 3σ. Keep at least 20 supernovae.',
      check: (s) => Math.abs((s.Om as number) - 1) < 0.02 && Math.abs(s.Ol as number) < 0.02 && s.dataSource === 'nature' && (s.pL as number) < 0.0027,
    },
    {
      id: 'constant',
      title: 'A true constant',
      prompt: 'Set $w_0 = -1$ and $w_a = 0$. Confirm that the dark energy density no longer changes as the universe grows.',
      hint: 'Watch the density plot in the corner and the $\\rho_{DE}$ readout. The exponent $-3(1+w)$ is zero, so the line goes flat.',
      check: (s) => Math.abs((s.w0 as number) + 1) < 0.005 && Math.abs(s.wa as number) < 0.005 && Math.abs((s.rhoHalf as number) - 1) < 1e-6,
    },
    {
      id: 'threshold',
      title: 'Where acceleration dies',
      prompt: 'Build a universe of dark energy alone ($\\Omega_m = 0$, $\\Omega_\\Lambda = 1$, $w_a = 0$). Find the $w_0$ where $q_0$ is zero, the edge between speeding up and slowing down.',
      hint: 'With dark energy alone $q = (1+3w)/2$. Look near $w_0 = -1/3$. Get $|q_0|$ below 0.02.',
      check: (s) => (s.Om as number) < 0.015 && Math.abs((s.Ol as number) - 1) < 0.015 && Math.abs(s.wa as number) < 0.005 && Math.abs(s.q0 as number) < 0.02,
    },
  ],
  caveats: `<p>The supernovae are synthetic. Real data carry systematic errors that this toy leaves out: dust, calibration between telescopes, selection bias toward bright events, possible evolution of the explosions with age, and peculiar velocities of nearby hosts. These systematics, not the scatter, now limit real supernova cosmology.</p>
<p>The redshift mix is loosely modelled on real samples, and every supernova has the same scatter. The fit uses supernovae alone. Real analyses combine them with the CMB and BAO, which break the long valley degeneracy.</p>
<p>Radiation is neglected, which changes ages by far less than 0.1%. $H_0$ is set to 70 km/s/Mpc for ages and lookback times. The fit does not depend on it. The $\\Omega_m$–$\\Omega_\\Lambda$ fit assumes $w = -1$. The $w_0$–$w_a$ curves use the CPL form, which is only an approximation to any real theory.</p>
<p>The DESI significances quoted are from the collaboration\u2019s March 2025 papers and a later DES reanalysis. They may change with future data.</p>`,
  further: [
    { label: 'Riess et al. (1998), Observational evidence from supernovae for an accelerating universe and a cosmological constant', url: 'https://arxiv.org/abs/astro-ph/9805201' },
    { label: 'Perlmutter et al. (1999), Measurements of Ω and Λ from 42 high-redshift supernovae', url: 'https://arxiv.org/abs/astro-ph/9812133' },
    { label: 'DESI Collaboration (2025), DESI DR2 Results II: BAO measurements and cosmological constraints', url: 'https://arxiv.org/abs/2503.14738' },
    { label: 'The Nobel Prize in Physics 2011', url: 'https://www.nobelprize.org/prizes/physics/2011/summary/' },
  ],
};
