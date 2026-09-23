import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Nothing outruns light in empty space. But light slows down inside water, to about three quarters of its vacuum speed. A fast charged particle does not slow down with it. When the particle outruns the light it makes, it leaves a shock wave of light behind. That glow is Cherenkov radiation.</p>
<p>A jet that flies faster than sound does the same thing with sound. Each point on its path sends out a spherical sound wave. The jet gets ahead of all of them, and the spheres pile up on a cone. You hear the cone as a sonic boom. Cherenkov light is a sonic boom made of light.</p>
<p>In the scene the <strong>amber streak</strong> is a charged particle crossing a tank of water. Every moment it sends out a small spherical <strong>wavelet</strong> of light. Slow the particle down with the $\\beta$ slider. Below a certain speed each new wavelet is born inside the last one, the spheres nest, and they cancel. No light escapes. Speed it back up past the threshold and the spheres overlap on one edge. Their fronts line up into a <strong style="color:#6aa8ff">glowing blue cone</strong>.</p>
<p>The light leaves at a fixed angle to the track and lands on the far wall as a <strong>ring</strong>. Giant neutrino detectors like Super-Kamiokande are lined with thousands of light sensors that watch for exactly these rings. The size of the ring tells them the angle, and the angle tells them the particle's speed.</p>
<p>Why blue? The particle makes more photons at short wavelengths than at long ones. The spectrum in the corner rises steadily toward the blue end. That is why the water around a working reactor core glows an eerie blue.</p>`,
  tryFirst: [
    'Drag <b>β</b> down slowly. Watch the cone close up as the angle shrinks, then vanish at β = 0.752 when the wavelets start to nest.',
    'Push β up to 0.999. The cone angle stops growing near 41°. That is the most water can give.',
    'Switch the <b>medium</b> to <b>air</b>. Even at β = 0.99 there is no light at all. Air needs β above 0.9997.',
    'Pick the <b>Mach cone</b> view. The same Huygens construction, now with sound, gives the cone behind a supersonic jet.',
  ],
  equation: {
    tex: '\\cos\\theta = \\frac{1}{n\\beta}',
    caption: 'The Cherenkov angle. Light leaves the track at angle θ, fixed by the particle speed and the refractive index.',
    terms: [
      { tex: '\\theta', name: 'Cherenkov angle', meaning: 'The angle between the particle track and the emitted light. The wavefront cone makes the complementary angle $90^\\circ - \\theta$ with the track.', param: 'theta' },
      { tex: 'n', name: 'Refractive index', meaning: 'Light travels at $c/n$ in the medium. Water 1.33, glass about 1.5, air 1.0003.', param: 'medium' },
      { tex: '\\beta', name: 'Particle speed', meaning: 'The particle speed as a fraction of $c$, the speed of light in vacuum. It is always below 1.', param: 'beta' },
      { tex: '\\frac{1}{n\\beta}', name: 'Threshold ratio', meaning: 'A cosine cannot exceed 1. So light appears only when $n\\beta > 1$, that is $\\beta > 1/n$.', param: 'betaT' },
    ],
  },
  physicsNotes: `
<h3>The Huygens construction</h3>
<p>Put the particle at the origin at time $t = 0$ and let it move along $x$ at speed $v = \\beta c$. A wavelet emitted a time $t$ earlier started a distance $vt$ behind it and now has radius $(c/n)\\,t$. The ratio of radius to distance is the same for every wavelet:</p>
$$\\frac{(c/n)\\,t}{\\beta c\\, t} = \\frac{1}{n\\beta}$$
<p>All the spheres are therefore tangent to one cone with its tip at the particle and half-angle $\\varphi$, where $\\sin\\varphi = 1/(n\\beta)$. That cone is the wavefront. Light travels at right angles to a wavefront, so it leaves at $\\theta = 90^\\circ - \\varphi$, which gives $\\cos\\theta = 1/(n\\beta)$. If $n\\beta < 1$ each sphere contains the next, there is no common tangent, and the fields from different points cancel.</p>
<p>The readout <b>envelope θ</b> measures the angle straight from the wavelets drawn in the scene. It fits a line to their outer edge. It matches the formula to within the scallops left by emitting at discrete moments.</p>
<h3>How much light: the Frank–Tamm formula</h3>
<p>Frank and Tamm worked out the number of photons per unit path length and per unit wavelength for a particle of charge $ze$:</p>
$$\\frac{d^2N}{dx\\,d\\lambda} = \\frac{2\\pi\\alpha z^2}{\\lambda^2}\\left(1 - \\frac{1}{\\beta^2 n^2}\\right) = \\frac{2\\pi\\alpha z^2}{\\lambda^2}\\,\\sin^2\\theta$$
<p>Here $\\alpha \\approx 1/137$ is the fine-structure constant. Two things stand out. The yield grows as $\\sin^2\\theta$, so it starts at zero at threshold. And it goes as $1/\\lambda^2$, so halving the wavelength gives four times as many photons per nanometre. Between 400 and 700 nm an electron with $\\beta \\approx 1$ in water gives about 490 $\\sin^2\\theta \\approx 210$ photons per centimetre.</p>
<h3>Energy at threshold</h3>
<p>The threshold $\\beta_t = 1/n$ corresponds to a Lorentz factor $\\gamma_t = 1/\\sqrt{1 - 1/n^2}$. In water $\\gamma_t = 1.517$. The kinetic energy is $(\\gamma_t - 1)\\,mc^2$: about 0.26 MeV for an electron and about 55 MeV for a muon, which is 207 times heavier.</p>`,
  deep: [
    {
      title: 'Why this does not break relativity',
      html: `<p>Relativity forbids anything to travel faster than $c$, the speed of light in vacuum. The particle here never does. It only beats $c/n$, the speed at which light's phase moves through the medium. Water slows light because the wave keeps driving the electrons in the molecules, which re-radiate slightly out of step. Nothing in that process lets a signal travel faster than $c$.</p>
<p>That also explains where the light comes from. A charge moving at constant speed in vacuum cannot radiate. In a medium it polarizes the molecules along its path. Each disturbed patch sends out a brief pulse. Below threshold the pulses from different patches cancel far away. Above threshold they arrive in step on the cone and add up. The energy comes from the particle, which slows a little. The loss is tiny, well under 1% of what the particle loses by ionising the water.</p>`,
    },
    {
      title: 'Why the glow is blue',
      html: `<p>The Frank–Tamm formula says the number of photons per unit wavelength goes as $1/\\lambda^2$. Blue light at 400 nm is produced about three times as often as red light at 700 nm. Each blue photon also carries more energy, so the emitted power per unit wavelength goes as $1/\\lambda^3$. The spectrum in the scene's corner shows the photon count rising toward the violet.</p>
<p>The rise cannot go on forever. The formula needs $n(\\lambda)\\beta > 1$. At X-ray wavelengths the refractive index of any material falls just below 1, and emission stops. In practice water absorbs strongly in the far ultraviolet, and our eyes see little below about 400 nm. What survives to the eye is a deep blue.</p>
<p>The blue glow in a reactor pool comes mainly from fast electrons in the water. Some come from beta decays in the fuel. Many are knocked loose by gamma rays through Compton scattering. Only electrons above about 0.26 MeV contribute.</p>`,
    },
    {
      title: 'History: Heaviside, Cherenkov, Frank and Tamm',
      html: `<p>Oliver Heaviside worked out in 1888 and 1889 that a charge moving through a medium faster than light does in that medium would radiate on a cone. His result went largely unnoticed. Marie Curie and others later saw a faint blue light in bottles of concentrated radium solution, but did not explain it.</p>
<p>In 1934 Pavel Cherenkov, a graduate student working under Sergey Vavilov in Moscow, studied the faint glow of liquids exposed to gamma rays from radium. He showed it was not ordinary fluorescence. It was polarized, it did not depend on the chemistry of the liquid, and it pointed forward along the direction of the fast electrons. In 1937 Ilya Frank and Igor Tamm explained it with classical electrodynamics and derived the angle and the yield. Cherenkov, Frank and Tamm shared the Nobel Prize in Physics in 1958. Vavilov had died in 1951.</p>`,
    },
    {
      title: 'Rings in the dark: Super-Kamiokande and IceCube',
      html: `<p>Neutrinos barely interact. When one does hit a nucleus or electron in water, it can knock out a fast electron or muon. That particle makes Cherenkov light, and the light betrays the neutrino.</p>
<p><b>Super-Kamiokande</b> sits 1000 m underground in the Kamioka mine in Japan. It is a tank of 50 000 tonnes of ultrapure water lined with about 11 000 photomultiplier tubes, each 50 cm across. A particle's cone paints a ring on the wall. Muons fly straight and give sharp rings. Electrons start small showers that scatter the light and give fuzzy rings. That difference tells the two kinds of neutrino apart. In 1998 Super-K reported that muon neutrinos from the atmosphere oscillate into another type. Takaaki Kajita shared the 2015 Nobel Prize in Physics for this work.</p>
<p><b>IceCube</b> uses a cubic kilometre of clear Antarctic ice under the South Pole as its water tank. Strings of optical sensors hang between about 1450 and 2450 m deep. Ice has $n \\approx 1.31$, so its cone angle is a little smaller than water's. IceCube has seen high-energy neutrinos from beyond our galaxy.</p>`,
    },
    {
      title: 'The Mach cone: the same geometry with sound',
      html: `<p>Replace light with sound and the particle with a jet. Each point on the jet's path sends out a sound wave at speed $c_s$. If the jet flies at $v = M c_s$ with Mach number $M > 1$, the wavelets pile up on a cone with half-angle</p>
$$\\sin\\alpha = \\frac{1}{M}$$
<p>This is the same Huygens construction, with $n\\beta$ playing the role of $M$. The Cherenkov wavefront half-angle obeys $\\sin\\varphi = 1/(n\\beta)$. The Mach view uses exactly the same code with sound speed in place of $c/n$.</p>
<p>The analogy has limits. A sonic boom carries a pressure jump that can shake windows. Cherenkov light is a faint electromagnetic wave. A jet pushes air aside and creates the disturbance itself. A Cherenkov particle only polarizes the medium as it passes. Ernst Mach and Peter Salcher photographed these shock cones around supersonic bullets in 1887.</p>`,
    },
  ],
  challenges: [
    {
      id: 'cross',
      title: 'Cross the threshold',
      prompt: 'In water, drop β below the threshold so the glow dies, then raise it until the cone lights up again.',
      hint: 'The threshold in water is β = 1/1.33 ≈ 0.752. Go below it, then back above it.',
      check: (s) => s.medium === 'water' && s.crossedUp === true,
    },
    {
      id: 'max',
      title: 'The widest cone in water',
      prompt: 'In water, make the Cherenkov angle 41°. That is close to the limit arccos(1/1.33) ≈ 41.2° for β → 1.',
      hint: 'You need β above about 0.992. Push the slider close to the right end.',
      check: (s) => s.view === 'light' && s.medium === 'water' && Math.abs((s.thetaDeg as number) - 41) <= 0.3,
    },
    {
      id: 'thresholdE',
      title: 'The cheapest glowing electron',
      prompt: 'With an electron in water, find the lowest kinetic energy that still makes Cherenkov light. Get within 0.01 MeV of the threshold, above it.',
      hint: 'The threshold is at γ = 1/√(1 − 1/n²) ≈ 1.517. That gives about 0.26 MeV. Creep β up from 0.75 until the cone just appears.',
      check: (s) => s.medium === 'water' && s.particle === 'electron' && s.above === true && (s.keMeV as number) <= (s.keThreshold as number) + 0.01,
    },
    {
      id: 'air',
      title: 'Fast but dark',
      prompt: 'In air, set β to at least 0.9 and confirm there is no Cherenkov light at all.',
      hint: 'Air has n = 1.0003, so the threshold is β = 0.9997. A particle at β = 0.99 is still too slow.',
      check: (s) => s.view === 'light' && s.medium === 'air' && (s.beta as number) >= 0.9 && s.above === false,
    },
  ],
  caveats: `<p>The refractive index is held fixed. In real water $n$ rises slowly from about 1.33 in the red to about 1.34 in the blue, and much more in the ultraviolet. The spectrum inset ignores that and ignores absorption, so it rises as $1/\\lambda^2$ over the whole range shown.</p>
<p>The particle moves at constant speed in a straight line. A real electron loses energy, scatters and wanders, which blurs its ring. The wavelets are drawn at discrete moments, while real emission is continuous. The ring on the wall shows where light emitted at the particle's current position will land. It ignores the travel time of that light. Speeds are slowed enormously so the eye can follow them. In the Mach view the jet is a point and the air is still and uniform.</p>`,
  further: [
    { label: 'Cherenkov radiation on Wikipedia', url: 'https://en.wikipedia.org/wiki/Cherenkov_radiation' },
    { label: 'The Nobel Prize in Physics 1958', url: 'https://www.nobelprize.org/prizes/physics/1958/summary/' },
    { label: 'Super-Kamiokande (official site)', url: 'https://www-sk.icrr.u-tokyo.ac.jp/en/sk/' },
    { label: 'IceCube Neutrino Observatory', url: 'https://icecube.wisc.edu/' },
  ],
};
