import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A cosmic string is a hypothetical crack in space. It is thinner than a proton, can be as long as the visible universe, and packs a huge mass into every metre. Yet if one flew past you, you would feel no pull at all.</p>
<p>The string does something stranger than pulling. It changes the <strong>geometry</strong> of the space around it. Take a paper disk, cut out a thin slice like a slice of pizza, and tape the edges together. You get a shallow cone. Anywhere on that paper, straight lines are still straight and triangles still add up to 180°. Nothing is bent locally. But the paper as a whole is missing an angle. That missing slice is the <strong>deficit angle</strong>, and a straight cosmic string makes space exactly like that cone.</p>
<p>Now draw a galaxy on the far side of the cut and an observer on the near side. Light from the galaxy can go straight to the observer past the left of the string, and also straight past the right. Both paths are straight lines on the paper. So the observer sees <strong>two identical copies of the galaxy</strong>, side by side. Unlike lensing by a star or a black hole, the two copies are not stretched or magnified. The string also cuts them off with a sharp straight edge.</p>
<p>The first view does exactly the pizza trick. Watch the paper fold into a cone and the two straight rays meet at the observer. The second view shows the sky: galaxies that sit in a thin strip behind the glowing string appear twice. The third view shows a closed <strong>loop</strong> of string. It whips around at close to light speed, and at special moments a point on it, a <strong>cusp</strong>, briefly moves at the speed of light and sends out a burst of gravitational waves.</p>
<p>A caution before you play. Cosmic strings are a prediction of some theories, not a discovery. Many searches have looked. None has found one. The angles in the scene are hugely exaggerated so that you can see them.</p>`,
  tryFirst: [
    'Watch the first view. The paper folds into a cone and the two coloured rays close up at the observer. Press <b>Pause</b> and drag the <b>Fold</b> slider by hand.',
    'Slide the <b>source offset</b> toward zero. When the source enters the shaded wedge, a second ray appears.',
    'Switch to <b>Sky</b>. Galaxies in the strip behind the string appear twice, with sharp edges where the string cuts them.',
    'Push <b>Gμ</b> past the CMB limit and see the warning. Then switch to <b>Loop</b> and wait for a cusp to flash.',
  ],
  equation: {
    tex: '\\Delta = \\frac{8\\pi G\\mu}{c^2}',
    caption: 'The deficit angle around a straight cosmic string. It depends only on the mass per unit length μ. A source straight behind the string is seen twice. The two images are split by Δ times the fraction of the way from observer to source that lies behind the string.',
    terms: [
      { tex: '\\Delta', name: 'Deficit angle', meaning: 'The angle missing from space around the string. It is the angle of the slice cut out of the paper. The readout shows the real value, in arcseconds.', param: 'deficit' },
      { tex: '\\mu', name: 'String tension', meaning: 'Mass per unit length. For a straight string it also equals the tension. GUT-scale strings would have about $10^{21}$ kg per metre.', param: 'gmu' },
      { tex: 'G\\mu/c^2', name: 'Dimensionless tension', meaning: 'The one number that describes a string. CMB data require it to be below about $1.5\\times10^{-7}$. Set by the Gμ slider.', param: 'gmu' },
      { tex: '8\\pi', name: 'Geometric factor', meaning: 'Comes from solving Einstein\'s equations for a thin straight line of mass with equal tension. It is $2\\pi$ times $4G\\mu$.' },
      { tex: 'c^2', name: 'Speed of light squared', meaning: 'Converts mass per length into a pure angle. Because $c^2/G$ is so large, even extreme tensions give tiny angles.' },
    ],
  },
  physicsNotes: `
<h3>Why there is no force</h3>
<p>A string has mass per length $\\mu$ and an equal tension along its length. In general relativity, pressure and tension gravitate just like mass does. For a string the tension exactly cancels the attraction from the mass density. Vilenkin found in 1981 that the space around a thin straight string is locally flat. The metric in cylindrical coordinates is</p>
$$ds^2 = -c^2dt^2 + dz^2 + dr^2 + (1 - 4G\\mu/c^2)^2\\, r^2\\, d\\theta^2 .$$
<p>A circle around the string has circumference $2\\pi r(1 - 4G\\mu/c^2)$. The missing angle is $2\\pi \\cdot 4G\\mu/c^2 = 8\\pi G\\mu/c^2$. A cut-out wedge with glued edges is exactly this geometry.</p>
<h3>Double images</h3>
<p>Light travels on straight lines of the paper. An observer and a source behind the string can be joined by one straight line on each side of the cut when the source lies inside a wedge of angle $\\Delta$ behind the string. For a straight string across the line of sight the two images are separated by</p>
$$\\delta\\theta \\approx \\Delta\\,\\frac{D_{ls}}{D_s},$$
<p>where $D_{ls}$ is the distance from string to source and $D_s$ from observer to source. A tilted string gives a smaller split. The images have equal brightness and no distortion. That is the signature searches look for.</p>
<h3>Moving strings and the CMB step</h3>
<p>A string moving at speed $v$ sweeps the cone past everything behind it. Matter behind it is pulled together into a sheet called a <strong>wake</strong>. Photons passing on the two sides get different Doppler shifts. Kaiser and Stebbins found in 1984 that this makes a sharp step in the microwave background temperature across the string:</p>
$$\\frac{\\delta T}{T} \\approx 8\\pi G\\mu\\,\\gamma v ,$$
<p>with $v$ in units of $c$ and $\\gamma = 1/\\sqrt{1-v^2}$. This is approximate. The full answer depends on the angle between the velocity and the line of sight. The inset in the scene draws the step to scale against a noisy patch of sky.</p>`,
  deep: [
    {
      title: 'Kibble 1976: defects from a cooling universe',
      html: `<p>In 1976 Tom Kibble pointed out that phase transitions in the early universe should leave defects behind. As the universe cooled, a field chose its lowest-energy state independently in regions that could not yet signal each other. Where those choices could not be joined smoothly, the field got stuck in its old, high-energy state. If the set of possible states has a hole in it, like the circle of phases of a complex field, the stuck regions form lines. Those lines are cosmic strings.</p>
<p>The same thing happens in the lab. Cool a superfluid through its transition and it fills with quantized vortices. Wojciech Zurek argued in 1985 that such experiments could test Kibble's picture, and worked out how the defect density depends on how fast the system is cooled. This is now called the <strong>Kibble–Zurek mechanism</strong>. Experiments in liquid crystals (1991) and superfluid helium-3 (1996) saw defects form much as predicted. Later tests in cold atoms and ion crystals followed. These are analogues. They show the mechanism works, not that cosmic strings exist.</p>
<p>Field theory strings with a Grand Unified scale have $G\\mu/c^2 \\sim 10^{-6}$. That value is now ruled out by the CMB. Strings were once a rival to inflation as the seed of galaxies. CMB measurements around 2000 showed acoustic peaks that strings cannot make, and that idea was dropped. Strings can still be a small extra ingredient.</p>`,
    },
    {
      title: 'Cosmic superstrings',
      html: `<p>Could a fundamental string of string theory be stretched to cosmic size? In 1985 Edward Witten argued no for the string models known then. Such strings would be too heavy and would not be stable.</p>
<p>Brane inflation changed this. In these models inflation ends when branes collide, and strings form as the branes annihilate. In 2004 Edmund Copeland, Robert Myers and Joseph Polchinski showed that both fundamental strings (F-strings) and D-strings could survive and be stable, with tensions in a range from about $10^{-12}$ to $10^{-6}$. They can also bind into $(p, q)$ networks with junctions, and they reconnect less easily when they cross. That makes their networks denser than ordinary field theory strings for the same tension.</p>
<p>This made cosmic strings a possible window on string theory itself. It is still a possibility, not an observation.</p>`,
    },
    {
      title: 'Why none has been found: CSL-1 and other searches',
      html: `<p>In 2003 Mikhail Sazhin and colleagues reported <strong>CSL-1</strong>, a pair of nearly identical galaxy images about 2 arcseconds apart. Ground-based images fit a cosmic string lens surprisingly well. In 2006 Hubble Space Telescope images settled it. The two objects have different internal structure. They are two separate elliptical galaxies, probably a close pair, and not two images of one galaxy. Both the discovery team and an independent group (Agol, Hogan and Plotkin) reached this conclusion.</p>
<p>The CMB gives the cleanest limit. Strings would add a pattern of steps and line-like hot and cold features. Planck found none and set $G\\mu/c^2 < 1.5\\times10^{-7}$ for Nambu–Goto strings and $3.2\\times10^{-7}$ for Abelian-Higgs strings (95% confidence, 2013). The slider in the scene uses the first value as its warning line.</p>
<p>Pulsar timing limits are much tighter for standard loop models, around $10^{-10}$ or below. They depend strongly on how big loops are when they form and how they decay, so they are less robust than the CMB limit.</p>`,
    },
    {
      title: 'Loops, cusps and gravitational waves',
      html: `<p>A closed loop of Nambu–Goto string obeys a simple wave equation in the right gauge. The solution is</p>
$$\\mathbf{x}(\\sigma,t) = \\tfrac12\\left[\\mathbf{a}(\\sigma - t) + \\mathbf{b}(\\sigma + t)\\right], \\qquad |\\mathbf{a}'| = |\\mathbf{b}'| = 1 ,$$
<p>in units with $c = 1$. The loop of invariant length $L$ repeats every $L/2$. The scene uses the Kibble–Turok family of loops. The velocity is $\\tfrac12(\\mathbf{b}' - \\mathbf{a}')$. It reaches the speed of light where $\\mathbf{a}' = -\\mathbf{b}'$.</p>
<p>That is where the inset sphere earns its place. $\\mathbf{a}'$ and $-\\mathbf{b}'$ both trace closed curves on a unit sphere. Neither curve can sit in one hemisphere, because $\\mathbf{a}$ and $\\mathbf{b}$ are periodic, so their average is zero. Two such curves generically cross. Each crossing is a <strong>cusp</strong>, so smooth loops generically have cusps every period.</p>
<p>Loops radiate gravitational waves with power about $\\Gamma G\\mu^2 c$, where $\\Gamma \\approx 50$. Cusps beam short bursts. A network of loops across cosmic history adds up to a stochastic background. LIGO–Virgo–KAGRA and the pulsar timing arrays search for both bursts and background. In 2023 pulsar timing arrays found evidence for a background at nanohertz frequencies. Merging supermassive black hole binaries are the leading explanation. Some cosmic string models can also fit it. The question is open.</p>`,
    },
    {
      title: 'Edge cases and what the cone leaves out',
      html: `<p>The cone describes a single, infinitely thin, straight, static string. Real networks are wiggly. Small-scale wiggles add an effective mass that is larger than the tension, and then a small attractive force does appear. A moving string is a boosted cone, which is where the wake and the Kaiser–Stebbins step come from.</p>
<p>A string along the line of sight gives no double image at all. A string tilted by an angle $\\theta$ to the line of sight reduces the separation by about $\\sin\\theta$. Near the ends of a double image band, the string cuts galaxy images with a straight edge. That sharp edge would be a strong fingerprint.</p>
<p>Very heavy strings, with $G\\mu$ above $1/4$, would have a deficit of $2\\pi$ or more and close space around themselves. Those are far outside any realistic range.</p>`,
    },
  ],
  challenges: [
    {
      id: 'double',
      title: 'See double',
      prompt: 'Move the source so that the observer sees two images of it.',
      hint: 'Set the source offset between −1 and +1. That is the wedge behind the string.',
      check: (s) => s.images === 2,
    },
    {
      id: 'cmb',
      title: 'Ruled out',
      prompt: 'Raise Gμ above the Planck CMB limit and see the warning.',
      hint: 'The limit is 1.5 × 10⁻⁷. Push the Gμ slider past −6.8.',
      check: (s) => s.violatesCMB === true,
    },
    {
      id: 'ks',
      title: 'A visible step',
      prompt: 'Keep Gμ at or below the CMB limit and make the Kaiser–Stebbins step larger than 10 μK.',
      hint: 'Set Gμ just below the limit, around −6.9, then raise the string speed past about 0.8c. γv grows fast near light speed.',
      check: (s) => s.violatesCMB === false && (s.ksMicroK as number) > 10,
    },
    {
      id: 'cusp',
      title: 'Catch a cusp',
      prompt: 'In the loop view, watch a cusp form, where part of the string touches light speed.',
      hint: 'Switch the view to Loop and keep it playing. Cusps flash once or more per period.',
      check: (s) => s.view === 'loop' && (s.cusps as number) >= 1,
    },
  ],
  caveats: `<p>The scene exaggerates the deficit angle by a factor of a million or more. At any allowed tension the real angle is under an arcsecond, smaller than the width of a hair seen from 20 metres. The mapping from Gμ to the drawn angle is monotone but not to scale. The real values are in the readouts.</p>
<p>The string is straight, infinitely thin and static for the lensing views. The sky view uses the small-angle, string-across-the-line-of-sight formula. The Kaiser–Stebbins formula is approximate and ignores the viewing angle. The CMB patch is illustrative noise, not a real sky map. The loop is a single Nambu–Goto solution with no gravitational back-reaction, so it never shrinks, and the gravitational wave burst is drawn schematically.</p>
<p>No cosmic string has been observed. Everything here is a prediction that current data only constrain.</p>`,
  further: [
    { label: 'Kibble, Topology of cosmic domains and strings (1976)', url: 'https://doi.org/10.1088/0305-4470/9/8/029' },
    { label: 'Copeland, Myers, Polchinski, Cosmic F- and D-strings (2004)', url: 'https://arxiv.org/abs/hep-th/0312067' },
    { label: 'Planck 2013 results XXV: searches for cosmic strings', url: 'https://arxiv.org/abs/1303.5085' },
    { label: 'Agol, Hogan, Plotkin, Hubble imaging excludes cosmic string lens (2006)', url: 'https://arxiv.org/abs/astro-ph/0603838' },
  ],
};
