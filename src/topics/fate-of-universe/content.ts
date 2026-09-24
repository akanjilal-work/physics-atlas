import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">The universe is expanding. Will it go on for ever, tear itself apart, or fall back in on itself? The answer depends mostly on one ingredient we barely understand: dark energy.</p>
<p>Gravity from ordinary matter pulls the galaxies back. It slows the expansion. Dark energy does the opposite. Since about six billion years ago it has been <strong>speeding the expansion up</strong>. The future is a tug of war between the two, and dark energy is winning.</p>
<p>The scene shows a bundle of galaxies around our own, with the Milky Way at the centre (drawn much larger than true scale). Their spacing follows the scale factor $a(t)$ of the model you pick. The ruler along the bottom is a <strong>log clock</strong>: each tick is a factor of ten in time. That is the only way to fit a hundred-billion-year story and a quadrillion-quadrillion-year story on one screen.</p>
<p><b>Big Freeze.</b> With a plain cosmological constant, distant galaxies race away faster and faster. Their light stretches to red, then to nothing. Our own group of galaxies stays bound. Its stars burn out, its remnants drift apart, and its black holes slowly evaporate. What is left is cold, dark and nearly empty.</p>
<p><b>Big Rip.</b> If dark energy grows denser as space expands, the push eventually beats every binding force. Clusters, then galaxies, then planetary systems, then atoms come apart, all in a finite time.</p>
<p><b>Big Crunch.</b> With enough matter, or a negative dark energy, expansion stops and reverses. Galaxies rush together, the sky heats up, and everything ends in a hot, dense state like the Big Bang run backwards.</p>
<p>Our best measurements point to the first of these, a long freeze. New survey data hint that dark energy may be changing, which would alter the details. Nobody knows yet.</p>`,
  tryFirst: [
    'Press <b>Play</b> on the default Freeze. Watch distant galaxies redden and fade near $10^{11}$ years, while our own galaxy stays put.',
    'Pick <b>Rip</b>. The ruler now counts time <em>left</em>. Play to the end and watch the Milky Way, then the Solar System, torn apart.',
    'Pick <b>Crunch</b>. The galaxies fall together and the sky glows red, then white.',
    'Drag <b>w</b> just below −1. Even a tiny phantom push gives a rip, but it moves far into the future.',
  ],
  equation: {
    tex: '\\frac{\\ddot a}{a} \\;=\\; -\\frac{4\\pi G}{3}\\left(\\rho + \\frac{3p}{c^2}\\right)',
    caption: 'The acceleration equation of general relativity for a uniform universe. Pressure gravitates too. When ρ + 3p/c² is negative, the expansion speeds up.',
    terms: [
      { tex: '\\ddot a', name: 'Acceleration of the scale factor', meaning: 'Positive means the expansion is speeding up. The readout shows the deceleration parameter $q = -\\ddot a a/\\dot a^2$, which is negative when accelerating.', param: 'q' },
      { tex: 'a', name: 'Scale factor', meaning: 'The size of the universe relative to today ($a = 1$ now). Every intergalactic distance scales with it.', param: 'a' },
      { tex: '\\rho', name: 'Density', meaning: 'Matter, radiation and dark energy all count. Today dark energy makes up about 69% of the total. Set with Ω_Λ.', param: 'Ol' },
      { tex: 'p', name: 'Pressure', meaning: 'For dark energy $p = w\\rho c^2$. A cosmological constant has $w = -1$. Phantom energy has $w < -1$.', param: 'w0' },
      { tex: 'G', name: 'Gravity', meaning: 'Newton\u2019s constant. Matter ($p = 0$) always contributes a pull, set by Ω_m.', param: 'Om' },
    ],
  },
  physicsNotes: `
<h3>Why the sign of ρ + 3p decides</h3>
<p>For matter the pressure is negligible, so $\\rho + 3p/c^2 > 0$ and gravity decelerates the expansion. For dark energy with $p = w\\rho c^2$ the sum is $\\rho(1 + 3w)$. It turns negative when $w < -1/3$, and then that component accelerates the expansion. Today's mix accelerates if $\\Omega_m + (1+3w)\\,\\Omega_\\Lambda < 0$. Set the <b>Ω_m</b> slider to 0.3 and try $w$ on both sides of −0.48 to see the $q$ readout change sign.</p>
<h3>How dark energy's density changes</h3>
<p>Energy conservation in an expanding universe gives $\\rho \\propto a^{-3(1+w)}$ for constant $w$. Matter thins as $a^{-3}$. A cosmological constant ($w = -1$) stays constant, so it must win in the end. Phantom energy ($w < -1$) actually <em>grows</em> as space expands. That is what makes a rip possible.</p>
<p>The first Friedmann equation then gives the rate:</p>
$$H^2 = H_0^2\\left[\\Omega_r a^{-4} + \\Omega_m a^{-3} + \\Omega_k a^{-2} + \\Omega_\\Lambda f(a)\\right]$$
<p>Here $\\Omega_k = 1 - \\Omega_m - \\Omega_r - \\Omega_\\Lambda$ is curvature, and $f(a)$ is the dark energy growth factor. With the advanced option on, $w(a) = w_0 + w_a(1-a)$, the form used by the DESI survey.</p>
<h3>How the simulation solves it</h3>
<p>The inset curves integrate the acceleration equation directly with fourth-order Runge–Kutta, as in the <a href="#/t/cosmic-expansion">cosmic expansion</a> topic. The first Friedmann equation then serves as a check. The deep-future scene needs times up to $10^{110}$ years, so it uses a second method. It builds a table of time against $\\ln a$ by exact quadrature in log space. For a rip or crunch it adds up the time <em>left</em> from the end backwards, so nothing is lost to rounding near the singularity. The <b>RK4 vs table</b> readout compares the two methods' end times.</p>
<p>For a rip the page also shows the estimate of Caldwell, Kamionkowski and Weinberg (2003):</p>
$$t_{\\rm rip} - t_0 \\approx \\frac{2}{3|1+w|}\\,\\frac{1}{H_0\\sqrt{1-\\Omega_m}}$$
<p>It assumes dark energy alone drives the future. It is exact when $\\Omega_m = 0$. With $\\Omega_m = 0.3$ the leftover matter makes the true rip come about 3% sooner.</p>`,
  deep: [
    {
      title: 'Big Freeze: the horizon and the long dark',
      html: `<p>With a cosmological constant, $H$ settles to $H_\\infty = H_0\\sqrt{\\Omega_\\Lambda}$, about 56 km/s/Mpc. The universe becomes de Sitter space and grows by a factor $e$ every 17.5 billion years. There is then an <strong>event horizon</strong>. Light emitted today by any galaxy now more than about 16.7 billion light years away (comoving) will never reach us. That is roughly every galaxy beyond redshift 1.8.</p>
<p>We never see a galaxy cross the horizon. We see its old light, stretched ever redder and dimmer. Krauss and Scherrer (2007) estimated that within about a trillion years only our merged Local Group would remain visible. Astronomers then could not learn from the sky that the universe expands at all.</p>
<p>Inside our group the story runs on stellar time, following Adams and Laughlin (1997). All times below are rough:</p>
<ul>
<li>About $10^{14}$ years: gas runs out, star formation ends, and the last red dwarfs fade.</li>
<li>About $10^{14}$ to $10^{40}$ years, the <em>degenerate era</em>: white dwarfs, neutron stars and brown dwarfs cool. Close encounters eject most of them from galaxies by about $10^{19}$ to $10^{20}$ years.</li>
<li>About $10^{40}$ years: if protons decay, the remnants dissolve. This is hypothetical. Experiments show the proton lifetime is longer than about $10^{34}$ years.</li>
<li>About $10^{40}$ to $10^{100}$ years, the <em>black hole era</em>: black holes are the last large objects. They lose mass by <a href="#/t/hawking-radiation">Hawking radiation</a>. A lifetime scales as $M^3$: about $10^{67}$ years per solar mass cubed, so about $10^{100}$ years for the largest, near $10^{11}$ solar masses.</li>
</ul>
<p>After that comes a dilute gas of photons and particles. Even empty de Sitter space has a faint temperature, $\\hbar H_\\infty/2\\pi k_B \\approx 2\\times10^{-30}$ K. This is the "heat death": no temperature differences left to run anything.</p>`,
    },
    {
      title: 'Big Rip: the order of destruction',
      html: `<p>For $w < -1$ the density of dark energy grows, and so does $H$. In a finite time $a$ and $H$ both become infinite. The event horizon shrinks around every observer. When it is smaller than a bound object, the object must come apart.</p>
<p>Caldwell, Kamionkowski and Weinberg compared the outward push $-\\tfrac{4\\pi}{3}(\\rho + 3p)R^3$ with the binding mass $M$ of a system of size $R$. A system with orbital period $P$ is torn apart at a time</p>
$$t_{\\rm rip} - t \\approx P\\,\\frac{\\sqrt{2|1+3w|}}{6\\pi|1+w|}$$
<p>before the end. For $w = -3/2$ that is about $0.28\\,P$. Their schedule for $w = -3/2$, $\\Omega_m = 0.3$, $H_0 = 70$ km/s/Mpc:</p>
<ul>
<li>about 22 billion years from now: the Rip itself</li>
<li>about 1 billion years before: galaxy clusters erased</li>
<li>about 60 million years before: the Milky Way destroyed</li>
<li>about 3 months before: the Solar System unbound</li>
<li>about 30 minutes before: the Earth explodes</li>
<li>about $10^{-19}$ s before: atoms torn apart</li>
</ul>
<p>The scene scales these lead times with the formula above when you change $w$. Challenge: set $w = -1.5$ and read the rip time. With this page's $H_0 = 67.4$ and $\\Omega_m = 0.315$ the answer is about 22.7 billion years. The formula alone says 23.4.</p>`,
    },
    {
      title: 'Big Crunch: the Big Bang in reverse',
      html: `<p>A universe recollapses if the Friedmann equation reaches $H = 0$ in the future. Two ways to get there:</p>
<ul>
<li><strong>Enough matter and positive curvature.</strong> With matter only and $\\Omega_m > 1$, the closed universe follows a cycloid. It reaches $a_{\\max} = \\Omega_m/(\\Omega_m - 1)$ and crunches at $t = \\pi\\,\\Omega_m/[H_0(\\Omega_m-1)^{3/2}]$. The tests check this.</li>
<li><strong>A negative cosmological constant.</strong> Negative vacuum energy pulls inward. It always wins eventually, whatever the curvature.</li>
</ul>
<p>A positive $\\Omega_\\Lambda$ works against a crunch. Past a critical value the pull of matter can never catch up. That is why today's measurements, which give $\\Omega_\\Lambda \\approx 0.69$ and nearly flat space, rule out a crunch unless dark energy changes.</p>
<p>The equations are symmetric in time. Near the end, the radiation bath heats up exactly as it cooled after the Big Bang. The sky passes 3000 K about as long before the crunch as recombination came after the bang. Real crunches would not be so tidy. Stars, black holes and structure break the symmetry.</p>`,
    },
    {
      title: 'What we measure, and DESI\u2019s hint',
      html: `<p>Supernova surveys found the acceleration in 1998. The CMB, galaxy clustering and supernovae now agree on a nearly flat universe. Planck 2018 combined with supernovae and baryon acoustic oscillations gives $w = -1.03 \\pm 0.03$. That is consistent with a cosmological constant and a Big Freeze. It also allows a tiny phantom component, which would give a rip in the very distant future. It cannot rule out $w$ slightly above −1 either.</p>
<p>In 2024 and 2025 the Dark Energy Spectroscopic Instrument (DESI) measured baryon acoustic oscillations in millions of galaxies. Combined with the CMB and supernovae, it prefers an evolving dark energy over a constant one. The preference is about 2.8 to 4.2 standard deviations, depending on the supernova sample. One combination gives $w_0 \\approx -0.75$ and $w_a \\approx -0.86$, which the <b>DESI-like</b> preset uses.</p>
<p>Treat that preset with care. The $w_0 w_a$ form describes the past. Extended into the future, as here, it makes dark energy fade within a few billion years. Acceleration would then stop, and the event horizon would disappear. That is an extrapolation, not a prediction. The hint may also fade with more data. Some groups have fitted models to the same data that would even recollapse, which is more speculative still.</p>`,
    },
    {
      title: 'Freeman Dyson\u2019s "Time without end"',
      html: `<p>In 1979 Freeman Dyson asked whether life and thought could last for ever in an open universe. His answer was a cautious yes. A mind could run ever more slowly, hibernate for longer and longer spells, and so process an unlimited number of thoughts with a finite energy supply.</p>
<p>His argument assumed a universe that decelerates. Acceleration changes the picture. In de Sitter space the horizon limits the energy and information any civilisation can ever reach, and there is that floor temperature of about $10^{-30}$ K. Krauss and Starkman (2000) argued that eternal life is then impossible. These are questions about physics we have not tested, so they remain open.</p>`,
    },
  ],
  challenges: [
    {
      id: 'rip15',
      title: 'Make a Big Rip at w = −1.5',
      prompt: 'Set $w = -1.50$ (advanced $w_a$ at zero) with positive Ω_Λ, and play or scrub to the very end, past the tearing of atoms. How many billion years away is the Rip?',
      hint: 'Pick the Rip preset, then drag w to −1.50. The "time to end" readout gives the answer, about 22.7 billion years.',
      check: (s) => s.fate === 'rip' && Math.abs((s.w0 as number) + 1.5) < 0.005 && s.wa === 0 && s.atomsGone === true,
    },
    {
      id: 'crunch',
      title: 'Crunch without negative energy',
      prompt: 'Make the universe recollapse while keeping Ω_Λ at zero or above.',
      hint: 'Matter alone can close the universe. Set Ω_Λ to 0 and push Ω_m above 1.',
      check: (s) => s.fate === 'crunch' && (s.Ol as number) >= 0,
    },
    {
      id: 'bhera',
      title: 'Into the black hole era',
      prompt: 'In a Big Freeze, travel to at least $10^{40}$ years after the Big Bang.',
      hint: 'Drag the time slider far to the right, or press Play and wait.',
      check: (s) => s.fate === 'freeze' && s.userTime === true && (s.tYr as number) >= 1e40,
    },
    {
      id: 'norip',
      title: 'No rip for a cosmological constant',
      prompt: 'After making any rip, return to exactly $w = -1$ (with $w_a = 0$ and Ω_Λ > 0) and go past $10^{12}$ years to confirm the universe just keeps expanding.',
      hint: 'A cosmological constant keeps the same density for ever, so H levels off instead of blowing up.',
      check: (s) => s.sawRip === true && s.w0 === -1 && s.wa === 0 && (s.Ol as number) > 0 && s.fate === 'freeze' && (s.tYr as number) > 1e12,
    },
  ],
  caveats: `The model is a uniform FLRW universe with matter, radiation, curvature and one dark energy fluid. It ignores structure growth, the extra radiation stars add, and any interaction between dark energy and matter. The $w_0 w_a$ form is a fit to past data, and extending it into the future is speculative. Deep-future milestones (star formation ending, galaxy evaporation, proton decay, black hole lifetimes) are order-of-magnitude estimates, and proton decay has never been observed. Hawking lifetimes use the photon-only formula. The rip lead times scale the published $w = -3/2$ values with the CKW formula, so they are approximate for other $w$. The galaxies, the Milky Way and the Solar System are not to scale.`,
  further: [
    { label: 'Caldwell, Kamionkowski and Weinberg (2003), Phantom energy and cosmic doomsday (arXiv)', url: 'https://arxiv.org/abs/astro-ph/0302506' },
    { label: 'Adams and Laughlin (1997), A dying universe (arXiv)', url: 'https://arxiv.org/abs/astro-ph/9701131' },
    { label: 'Dyson (1979), Time without end, Rev. Mod. Phys. 51, 447', url: 'https://doi.org/10.1103/RevModPhys.51.447' },
    { label: 'Ultimate fate of the universe (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Ultimate_fate_of_the_universe' },
  ],
};
