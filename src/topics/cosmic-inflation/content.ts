import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">In the first tiny fraction of a second, far less than a trillionth of a second, space may have grown by a factor of at least $e^{60}$, about $10^{26}$. This is <strong>cosmic inflation</strong>. It would explain why the universe is so smooth, why it is so flat, and where galaxies came from.</p>
<p>The engine is a field called the <strong>inflaton</strong>. Picture a ball on a very gentle slope. While the ball sits high on the slope, the field stores a huge, nearly constant energy in every bit of space. That kind of energy does not thin out as space grows. So the expansion does not slow down. It runs at a steady rate, and distances double again and again.</p>
<p>Eventually the ball reaches the steep part and rolls into the valley. Inflation stops. The ball rattles around the bottom, and its energy turns into ordinary hot particles. This is <strong>reheating</strong>, and it is where the familiar hot Big Bang begins.</p>
<p>Now the surprise. The field is quantum, so it jitters. Each patch of space gets random kicks. Some patches fall a little behind and inflate a little longer. Inflation stretches these tiny differences to the size of galaxies and beyond. Billions of years later, gravity grows them into the <a href="#/t/cosmic-web">cosmic web</a>. The largest structures in the universe may be magnified quantum noise.</p>
<p>In the scene, <b>view 1</b> shows the ball on the potential, with neighbouring patches jittering beside it. <b>View 2</b> shows a wrinkled balloon inflating until it looks flat, while fresh ripples are born and stretched. <b>View 3</b> shows the key number, the comoving Hubble radius, shrinking during inflation and growing afterwards.</p>`,
  tryFirst: [
    'Watch the default run. It inflates for only about 19 e-folds. The banner says it is not enough. Now drag <b>Initial field φ₀</b> up to about 5.5 and replay.',
    'Switch to <b>view 3</b>. With enough e-folds, the white line for today\u2019s horizon crosses the amber inflation branch. That crossing is the horizon problem being solved.',
    'Switch the potential to <b>m²φ²/2</b>. Its n<sub>s</sub> looks fine, but read its r. Then compare with the BICEP/Keck limit in the note.',
    'Set the <b>fluctuation boost</b> to ×1. The jitters vanish from view. Real quantum kicks are about 10⁻⁵ of the classical roll per e-fold. That is why the ripples in the CMB are about one part in 10⁵.',
  ],
  equation: {
    tex: "\\ddot\\phi + 3H\\dot\\phi + V'(\\phi) = 0",
    caption: 'The inflaton rolls down its potential while the expansion acts as friction. The Friedmann equation $H^2 = \\frac{8\\pi G}{3}\\left(\\tfrac12\\dot\\phi^2 + V\\right)$ closes the system. The amount of inflation is counted in e-folds, $N = \\int H\\,dt$.',
    terms: [
      { tex: '\\phi', name: 'Inflaton field', meaning: 'A scalar field filling space, measured here in reduced Planck masses $M_p = 2.4\\times10^{18}$ GeV. Its starting value sets how long inflation lasts.', param: 'phi0' },
      { tex: '\\ddot\\phi', name: 'Field acceleration', meaning: 'During slow roll it is tiny. The field moves at a steady terminal speed, like a ball in thick syrup.', param: 'phi' },
      { tex: '3H\\dot\\phi', name: 'Hubble friction', meaning: 'Expansion drags on the field. A large $H$ keeps the roll slow, and slow roll keeps $H$ large.', param: 'H' },
      { tex: "V'(\\phi)", name: 'Slope of the potential', meaning: 'The push down the hill. A flatter potential means a slower roll and more inflation.', param: 'pot' },
      { tex: 'N = \\int H\\,dt', name: 'e-folds', meaning: 'Space grows by a factor $e^N$. About 60 are needed to explain the smoothness of the sky.', param: 'N' },
      { tex: '\\epsilon', name: 'Slow-roll parameter', meaning: '$\\epsilon = -\\dot H/H^2$. Inflation means $\\epsilon < 1$. It ends when $\\epsilon$ reaches 1.', param: 'eps' },
    ],
  },
  physicsNotes: `
<h3>Slow roll</h3>
<p>Work in units with $8\\pi G = 1$, so the reduced Planck mass is $M_p = 1$. The field\u2019s energy density and pressure are $\\rho = \\tfrac12\\dot\\phi^2 + V$ and $p = \\tfrac12\\dot\\phi^2 - V$. When the potential dominates, $p \\approx -\\rho$. Then the acceleration equation gives $\\ddot a > 0$, and $H$ is nearly constant, so $a \\propto e^{Ht}$.</p>
<p>If the potential is flat enough, drop $\\ddot\\phi$ and the kinetic term. This gives the slow-roll equations $3H\\dot\\phi \\approx -V'$ and $H^2 \\approx V/3$. They hold when two numbers are small:</p>
$$\\epsilon = \\frac12\\left(\\frac{V'}{V}\\right)^2, \\qquad \\eta = \\frac{V''}{V}.$$
<p>Inflation ends when $\\epsilon \\approx 1$. The number of e-folds from field value $\\phi$ to the end is</p>
$$N = \\int H\\,dt = \\int_{\\phi_{\\rm end}}^{\\phi} \\frac{V}{V'}\\,d\\phi.$$
<h3>Two potentials</h3>
<p><b>$m^2\\phi^2/2$.</b> Here $\\epsilon = \\eta = 2/\\phi^2$, inflation ends at $\\phi_{\\rm end} = \\sqrt2$, and $N = (\\phi^2 - 2)/4 \\approx \\phi^2/4$. Sixty e-folds need $\\phi \\approx 15.6\\,M_p$. In units of the full Planck mass $m_{\\rm Pl} = \\sqrt{8\\pi}\\,M_p$ the same result reads $N \\approx 2\\pi\\phi^2/m_{\\rm Pl}^2$.</p>
<p><b>Starobinsky plateau.</b> $V = V_0\\left(1 - e^{-\\sqrt{2/3}\\,\\phi}\\right)^2$. For large $N$ it gives $n_s \\approx 1 - 2/N$ and $r \\approx 12/N^2$.</p>
<h3>Predictions</h3>
<p>The ripples are described by a spectral index and a tensor-to-scalar ratio:</p>
$$n_s \\approx 1 - 6\\epsilon + 2\\eta, \\qquad r = 16\\epsilon,$$
<p>both evaluated when the scale we observe left the horizon, about 50 to 60 e-folds before the end. For $m^2\\phi^2$ at $N = 60$: $n_s \\approx 0.967$ and $r \\approx 0.13$. Planck 2018 measured $n_s = 0.9649 \\pm 0.0042$. BICEP/Keck set $r < 0.036$ at 95% confidence in 2021. So $m^2\\phi^2$ fits $n_s$ but fails on $r$. Starobinsky gives $n_s \\approx 0.965$ and $r \\approx 0.003$, and passes both.</p>
<h3>How the simulation works</h3>
<p>The code solves the full equations, not the slow-roll approximation. It uses fourth-order Runge-Kutta in cosmic time with a fixed step of 0.01 in units of the inflaton\u2019s natural time scale, starting on the slow-roll attractor. It marks the end where $\\epsilon_H = -\\dot H/H^2$ first reaches 1. The inset compares the numerical $\\epsilon_H$ with the slow-roll $\\epsilon$. The <b>slow-roll N check</b> readout compares the slow-roll e-fold integral with the numerical count. They differ by about one e-fold, because slow roll fails near the end.</p>
<p>The height of the potential does not change $N$, $n_s$ or $r$. It is fixed afterwards by the measured size of the ripples, $A_s = 2.1\\times10^{-9}$. That sets the Hubble rate, the energy scale and the real time readouts. After inflation, a decay term $\\Gamma\\dot\\phi$ turns field energy into radiation. That is a simple stand-in for reheating.</p>`,
  deep: [
    {
      title: 'The puzzles: horizon, flatness, monopoles',
      html: `<p><b>Horizon.</b> The cosmic microwave background has the same temperature in every direction, to about one part in $10^5$. Without inflation, two points on the sky more than a degree or two apart were never in causal contact before the light left them. Nothing could have evened them out.</p>
<p>The key quantity is the <em>comoving Hubble radius</em> $(aH)^{-1}$. It is roughly the largest comoving region that can interact in one expansion time. In a decelerating universe it grows, so new regions keep coming into view for the first time. During inflation $\\ddot a > 0$, so $aH = \\dot a$ grows and $(aH)^{-1}$ shrinks. A region that was once small and in contact gets blown up far beyond the horizon. Later it comes back into view looking uniform. View 3 plots this.</p>
<p><b>How many e-folds?</b> The shrinking during inflation must undo the growth since. With instant reheating at an energy near $10^{16}$ GeV, the numbers give about 60 e-folds for today\u2019s horizon scale. The CMB pivot scale, $k_\\star = 0.05\\ {\\rm Mpc^{-1}}$, left about 5 e-folds later. A lower energy scale or slow reheating lowers these numbers, which is why people quote 50 to 60.</p>
<p><b>Flatness.</b> The Friedmann equation gives $|\\Omega - 1| = |k|/(aH)^2$. In a decelerating universe this grows. For it to be as small as it is today, below about 0.005, it had to be tuned to one part in $10^{60}$ or so at very early times. Inflation drives it toward zero by $e^{-2N}$. Try the flatness readout.</p>
<p><b>Monopoles.</b> Grand unified theories predict heavy magnetic monopoles formed as the early universe cooled. John Preskill showed in 1979 that far too many would form. Inflation after their formation dilutes them to perhaps none in our observable universe. Guth was working on this problem when he found inflation.</p>`,
    },
    {
      title: 'From quantum jitters to galaxies',
      html: `<p>A light quantum field in an expanding space fluctuates by about $\\delta\\phi \\approx H/2\\pi$ per Hubble time. Once a fluctuation is stretched beyond the Hubble radius, it stops oscillating and freezes. New ones keep appearing at the Hubble size and freezing in turn.</p>
<p>A field lead of $\\delta\\phi$ means that patch finishes inflation later by $\\delta t = \\delta\\phi/|\\dot\\phi|$. It expands by an extra $\\delta N = H\\,\\delta t$. That extra expansion is the curvature perturbation $\\zeta$. Its power is</p>
$$\\mathcal{P}_\\zeta = \\left(\\frac{H}{\\dot\\phi}\\right)^2\\left(\\frac{H}{2\\pi}\\right)^2 = \\frac{V}{24\\pi^2\\epsilon\\,M_p^4}.$$
<p>View 1 shows this picture. The small balls are neighbouring patches. Their jitters are boosted by about $10^5$ so you can see them. The <b>quantum / classical step</b> readout gives the true size.</p>
<p>Because $H$ and $\\epsilon$ change slowly, every scale gets about the same amplitude. The spectrum is nearly scale invariant, with a small tilt $n_s - 1$. Gravity also has quantum jitters. They give primordial gravitational waves with $r = 16\\epsilon$.</p>
<p><b>What has been confirmed.</b> The spectrum is nearly scale invariant and slightly red: Planck excludes $n_s = 1$ by about 8 standard deviations. The fluctuations are adiabatic, meaning all components share one pattern. Isocurvature modes are limited to a few percent. They are Gaussian to Planck\u2019s precision. Planck found $f_{\\rm NL}^{\\rm local} = -0.9 \\pm 5.1$. The temperature and polarization maps also show correlations on scales larger than the horizon at recombination. WMAP saw this in 2003. It is hard to arrange without something like inflation.</p>
<p><b>What has not.</b> Primordial gravitational waves have not been seen. In 2014 BICEP2 announced a detection. A joint analysis with Planck in 2015 showed the signal was consistent with dust in our own galaxy. The limit today is $r < 0.036$.</p>`,
    },
    {
      title: 'A short history',
      html: `<p>In 1980 Alexei Starobinsky in Moscow found that adding a curvature-squared term to Einstein\u2019s equations gives an early phase of near-exponential expansion. He was not trying to solve the horizon problem. In 1981 Viatcheslav Mukhanov and Gennady Chibisov showed that quantum fluctuations in this model give a nearly scale-invariant spectrum of perturbations.</p>
<p>Alan Guth had the idea of inflation in late 1979, while studying monopoles. His paper appeared in Physical Review D in 1981. It named the horizon and flatness problems as the motivation. His model, now called old inflation, had a flaw. It ended by bubbles of true vacuum forming, and the bubbles never merged into a smooth universe.</p>
<p>In 1982 Andrei Linde, and separately Andreas Albrecht and Paul Steinhardt, proposed <em>new inflation</em>. The field rolls slowly off a plateau instead of tunnelling. That gives a graceful end. In 1983 Linde proposed <em>chaotic inflation</em>, with simple potentials such as $m^2\\phi^2$. At a Nuffield workshop in Cambridge in 1982, several groups worked out the density perturbations from inflation.</p>
<p>Data took decades to catch up. COBE found the CMB fluctuations in 1992. WMAP and then Planck measured their spectrum. Planck\u2019s 2013 and 2018 results favoured plateau models like Starobinsky\u2019s over $m^2\\phi^2$.</p>`,
    },
    {
      title: 'Testing models with n_s and r',
      html: `<p>Different potentials trace different points in the $(n_s, r)$ plane. Steep monomials like $m^2\\phi^2$ give large $r$. Plateau models give small $r$. The simulation computes both at the scale $k_\\star = 0.05\\ {\\rm Mpc^{-1}}$.</p>
<p>A detection of $r$ would fix the energy scale of inflation, since $V^{1/4} \\propto r^{1/4}$. The Lyth bound links a large $r$ to a field that moves more than a Planck mass. That is why $r$ is such a prized target. Experiments such as the Simons Observatory and the planned LiteBIRD satellite aim at $r$ near $10^{-3}$, which would test Starobinsky-like models.</p>
<p>The picture is not frozen. In 2025 the Atacama Cosmology Telescope reported $n_s \\approx 0.974 \\pm 0.003$ when its data are combined with Planck and with DESI baryon acoustic oscillations. If that holds up, it sits above the simplest plateau predictions near 0.965. It is being actively debated.</p>`,
    },
    {
      title: 'Eternal inflation and the critics',
      html: `<p>High on the potential, the quantum kicks can beat the classical roll. When $\\mathcal{P}_\\zeta \\gtrsim 1$, some regions are kicked uphill faster than they roll down. Those regions keep inflating. Because they grow exponentially, inflation may never end everywhere. This is <em>eternal inflation</em>, explored by Alexander Vilenkin in 1983 and Linde in 1986. For $m^2\\phi^2$ with the measured amplitude, it starts above roughly $2000\\,M_p$.</p>
<p>Eternal inflation leads to a multiverse of regions with different histories. Predictions then depend on how you count regions in an infinite spacetime. This is the <em>measure problem</em>, and it is unsolved.</p>
<p>Some of the sharpest critics helped found the subject. Paul Steinhardt, with Anna Ijjas and Avi Loeb, argued in 2013 and 2017 that plateau models need unlikely starting conditions. They also argued that eternal inflation makes the theory hard to falsify. A 2017 reply signed by 33 physicists, including Guth and Linde, argued that inflation makes testable predictions that have passed. Roger Penrose has argued that inflation does not explain the low entropy of the start. Alternatives, such as bouncing cosmologies, remain under study.</p>
<p>A fair summary: the data match simple slow-roll inflation well. No rival matches them as simply. But the inflaton has not been identified, and the deepest questions about its start and its end are open.</p>`,
    },
  ],
  challenges: [
    {
      id: 'sixty',
      title: 'Sixty e-folds',
      prompt: 'Make inflation last at least 60 e-folds, and let the run reach $N = 60$.',
      hint: 'For $m^2\\phi^2$, $N \\approx \\phi_0^2/4$, so try $\\phi_0 \\approx 15.7$. For Starobinsky, try $\\phi_0 \\approx 5.5$. Raise the playback speed if you are impatient.',
      check: (s) => (s.Ntot as number) >= 60 && (s.N as number) >= 60,
    },
    {
      id: 'planck',
      title: 'Hit Planck\u2019s band',
      prompt: 'Make the CMB pivot scale leave the horizon during inflation, with $n_s$ inside Planck\u2019s $1\\sigma$ band, $0.9649 \\pm 0.0042$.',
      hint: 'The pivot leaves about 56 e-folds before the end. If inflation is shorter than that, the ripples we see were not made by it.',
      check: (s) => s.nsValid === true && Math.abs((s.ns as number) - 0.9649) <= 0.0042,
    },
    {
      id: 'quad-r',
      title: 'Rule out m²φ²',
      prompt: 'Show that $m^2\\phi^2$ predicts too many gravitational waves. Get a valid prediction with $r$ above the BICEP/Keck limit of 0.036.',
      hint: 'Switch the potential to m²φ²/2 and give it enough e-folds for the pivot to exit.',
      check: (s) => s.pot === 'quadratic' && s.nsValid === true && (s.r as number) > 0.036,
    },
    {
      id: 'flat',
      title: 'Flatter than flat',
      prompt: 'Starting from $|\\Omega - 1| = 1$, drive it below $10^{-20}$.',
      hint: 'Each e-fold multiplies $|\\Omega - 1|$ by about $e^{-2} \\approx 0.14$. About 24 e-folds are enough.',
      check: (s) => (s.logOmegaBest as number) <= -20,
    },
  ],
  caveats: `The potentials are single-field toy models with their height fixed by the measured amplitude $A_s$. $n_s$ and $r$ use first-order slow roll. The e-folds needed assume instant reheating and ignore changes in the number of particle species, which moves them by about one. Reheating is a simple decay term, not a real particle physics model. The quantum jitters in views 1 and 2 are boosted for display and do not feed back into the solution. The balloon shows a curved patch in physical units. Its ripples fade from view once they are much larger than the frame. Eternal inflation and the multiverse are speculative. The existence of the inflaton itself is not established.`,
  further: [
    { label: 'Inflation (cosmology), Wikipedia', url: 'https://en.wikipedia.org/wiki/Inflation_(cosmology)' },
    { label: 'Guth (1981), Inflationary universe, Phys. Rev. D 23, 347', url: 'https://doi.org/10.1103/PhysRevD.23.347' },
    { label: 'Planck 2018 results X: constraints on inflation', url: 'https://arxiv.org/abs/1807.06211' },
    { label: 'BICEP/Keck (2021): r < 0.036', url: 'https://arxiv.org/abs/2110.00483' },
  ],
};
