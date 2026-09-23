import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Most planets beyond the Sun have never been seen. Astronomers find them by watching the star instead. A planet gives itself away in two small ways: it blocks a little light, and it tugs its star back and forth.</p>
<p>If a planet's orbit is lined up just right, it crosses the face of its star once per orbit. The star dims for a few hours. The amount of dimming is simply the fraction of the star's disk that the planet covers. A Jupiter in front of a Sun blocks about 1% of the light. An Earth blocks less than one part in ten thousand.</p>
<p>The planet also pulls on its star. Both bodies circle their shared centre of mass, the <strong>barycentre</strong>. The star moves in a tiny orbit of its own, toward us and then away. That motion shifts the star's spectral lines by the Doppler effect. For Jupiter and the Sun, the star's speed is about 12 metres per second, roughly a sprint. For Earth it is about 9 centimetres per second, a slow crawl.</p>
<p>The surprise is how little it takes. A dip of a hundredth of a percent, repeated once a year, is a whole world. Finding it needs a telescope above the atmosphere that stares at the same stars for years.</p>
<p>In the scene you look along the line of sight, as a telescope would. The star's edge is darker than its centre, which is called <strong>limb darkening</strong>. Watch the light curve in the corner trace a dip as the planet crosses, and the velocity curve swing as the star wobbles.</p>`,
  tryFirst: [
    'Drag the <b>inclination</b> slider away from 90°. The dark dot slides off the star and the dip in the light curve vanishes.',
    'Pick the <b>Earth–Sun</b> preset. The dip is only 84 parts per million. Now turn on <b>noise</b> and watch it disappear into the scatter.',
    'Turn <b>limb darkening</b> off. The rounded bottom of the dip becomes flat, because every part of the disk is now equally bright.',
    'Switch the view to <b>Tilted</b> to see the orbit from the side, the green habitable zone, and the star circling the barycentre.',
  ],
  equation: {
    tex: '\\delta \\approx \\left(\\frac{R_p}{R_\\star}\\right)^2',
    caption: 'The transit depth is the fraction of the stellar disk covered by the planet. Area goes as radius squared.',
    terms: [
      { tex: '\\delta', name: 'Transit depth', meaning: 'The fractional drop in starlight at mid-transit. Earth across the Sun gives $\\delta \\approx 84$ ppm (parts per million).', param: 'depth' },
      { tex: 'R_p', name: 'Planet radius', meaning: 'Set by the planet-radius slider, in Earth radii. Doubling it makes the dip four times deeper.', param: 'rp' },
      { tex: 'R_\\star', name: 'Star radius', meaning: 'Set by the star type. The same planet makes a much deeper dip in front of a small red dwarf.', param: 'star' },
      { tex: '\\approx', name: 'Why only approximately', meaning: 'Limb darkening makes the centre of the star brighter than average, so a central transit is a bit deeper than $(R_p/R_\\star)^2$. A grazing transit is shallower.', param: 'ld' },
    ],
  },
  physicsNotes: `
<h3>Depth from area</h3>
<p>A uniformly bright disk of radius $R_\\star$ loses the fraction $\\pi R_p^2 / \\pi R_\\star^2$ of its light when a dark disk of radius $R_p$ sits fully inside it. That gives the headline equation. Measure $\\delta$ and you know the planet's size relative to the star.</p>
<h3>How long the dip lasts</h3>
<p>The impact parameter $b = a\\cos i / R_\\star$ is the sky distance between the planet's path and the star's centre, in stellar radii. For a circular orbit of period $P$ and radius $a$, the time from first to last contact is</p>
$$T_{14} = \\frac{P}{\\pi}\\arcsin\\!\\left[\\frac{R_\\star}{a}\\,\\frac{\\sqrt{(1+k)^2 - b^2}}{\\sin i}\\right], \\qquad k = \\frac{R_p}{R_\\star}.$$
<p>For Earth crossing the middle of the Sun this is about 13 hours. When $b > 1 + k$ there is no transit at all.</p>
<h3>The wobble</h3>
<p>The star's line-of-sight speed swings with semi-amplitude</p>
$$K = \\left(\\frac{2\\pi G}{P}\\right)^{1/3} \\frac{M_p \\sin i}{M_\\star^{2/3}\\sqrt{1-e^2}},$$
<p>valid when $M_p \\ll M_\\star$. The simulation uses the exact two-body form, with $(M_\\star + M_p)^{2/3}$ in the denominator. Transits give $R_p$. The wobble gives $M_p \\sin i$. A transiting planet has $i$ near 90°, so together they give the planet's density.</p>
<h3>How the light curve is computed</h3>
<p>The star's brightness follows the quadratic law $I(\\mu)/I(1) = 1 - u_1(1-\\mu) - u_2(1-\\mu)^2$, where $\\mu$ is the cosine of the angle between the line of sight and the surface normal. The code splits the stellar disk into thin rings, finds the arc of each ring hidden by the planet, and adds up the hidden light. The accuracy readout compares the result against the exact uniform-disk answer $(R_p/R_\\star)^2$.</p>`,
  deep: [
    {
      title: 'Limb darkening and the shape of the dip',
      html: `<p>Near the edge of the star you look through the atmosphere at a slant. You see only its higher, cooler layers, so the limb looks darker. In visible light the Sun's edge is less than half as bright as its centre.</p>
<p>This changes the light curve in two ways. The bottom of the dip is curved rather than flat, because the planet first covers dim limb and then bright centre. And a small planet at disk centre blocks more than its share. Its depth is about $k^2 / (1 - u_1/3 - u_2/6)$, roughly 20% deeper than $k^2$ for Sun-like coefficients.</p>
<p>The coefficients here are illustrative values for an optical band. Real analyses take them from stellar-atmosphere models or fit them to the data. Mandel and Agol (2002) gave a closed-form solution for this light curve. The simulation integrates numerically instead, which is simpler to check.</p>`,
    },
    {
      title: 'Grazing transits and the V shape',
      html: `<p>A normal transit has four contact points. Between second and third contact the whole planet is on the disk, and the curve is nearly flat. That flat part lasts $T_{23}$, found by swapping $1+k$ for $1-k$ in the duration formula.</p>
<p>When $1 - k < b < 1 + k$ the planet never gets fully onto the disk. There is no second or third contact, and the dip is a V. Grazing dips are shallow and look a lot like an eclipsing binary star blended with a brighter star. This is one reason survey candidates need follow-up before they count as planets.</p>
<p>The odds are low. A randomly tilted circular orbit transits with probability about $R_\\star / a$. For an Earth twin that is 0.47%, about 1 in 215. Surveys work by watching very many stars.</p>`,
    },
    {
      title: 'History: 51 Pegasi b and HD 209458 b',
      html: `<p>In 1995 Michel Mayor and Didier Queloz announced a planet around the Sun-like star 51 Pegasi, found with the radial-velocity method. It has at least about half of Jupiter's mass and orbits in about 4.2 days, far closer than anyone expected. This first "hot Jupiter" changed ideas about how planetary systems form. Mayor and Queloz shared half of the 2019 Nobel Prize in Physics for it. Earlier, in 1992, Aleksander Wolszczan and Dale Frail had found planets around a pulsar.</p>
<p>In 1999 two teams saw HD 209458 b pass in front of its star, the first transit of an exoplanet. David Charbonneau's team and Gregory Henry's team each caught the dip. The planet was already known from its wobble. The transit gave its radius, about 1.36 Jupiter radii, and proved it was a gas giant. In 2002 Charbonneau and colleagues detected sodium in its atmosphere during transit, the first detection of an exoplanet atmosphere.</p>`,
    },
    {
      title: 'Kepler, TESS and the precision problem',
      html: `<p>From the ground, the atmosphere makes stars twinkle at a level that swamps an Earth-size dip. NASA's Kepler telescope, launched in 2009, stared at about 150,000 stars in one patch of sky near Cygnus and Lyra. Its precision was a few tens of parts per million over several hours. Kepler and its K2 extension found more than 2,600 confirmed planets before it ran out of fuel in 2018.</p>
<p>A single Earth-size dip is buried in noise. Kepler's search flagged a signal when the combined signal-to-noise (S/N) of its transits passed 7.1. The mission was planned to catch at least three transits of an Earth twin. The noise toggle here uses a similar idea. It adds random scatter of 100 ppm per 30 minutes, roughly Kepler on a bright Sun-like star, and the S/N readout grows as $\\sqrt{N}$ with the number of transits $N$.</p>
<p>TESS, launched in 2018, surveys nearly the whole sky with less precision. It favours bright, nearby stars, which makes its planets easier to follow up. By the mid-2020s the count of confirmed exoplanets was above 5,000. NASA's archive passed that mark in 2022 and the total keeps rising. Most of them were found by transits.</p>`,
    },
    {
      title: 'Connections: reading atmospheres',
      html: `<p>During a transit, a thin ring of the planet's atmosphere is backlit by the star. At wavelengths where a gas absorbs, the atmosphere is opaque higher up, so the planet looks slightly bigger and the dip slightly deeper. Plotting depth against wavelength gives a <em>transmission spectrum</em>.</p>
<p>The James Webb Space Telescope has made this routine for large planets. In 2022 its early-release team reported clear carbon dioxide in the atmosphere of the hot Saturn WASP-39 b. Rocky planets like the TRAPPIST-1 worlds are much harder, and whether they keep atmospheres at all is still an open question.</p>
<p>The same wobble that makes the RV curve also produces the Rossiter–McLaughlin effect. As the planet crosses the spinning star, it blocks first the approaching side and then the receding side, which tells us whether the orbit is aligned with the star's spin.</p>`,
    },
  ],
  challenges: [
    {
      id: 'miss',
      title: 'Near miss',
      prompt: 'Tilt the orbit until the planet misses the star, so there is no transit at all.',
      hint: 'Lower the inclination until the impact parameter $b$ is bigger than $1 + R_p/R_\\star$. The dip in the light curve disappears.',
      check: (s) => s.touched === true && s.transits === false,
    },
    {
      id: 'earth-noise',
      title: 'Find an Earth',
      prompt: 'With noise on, detect a planet no bigger than 1.5 Earth radii: reach a combined S/N of at least 7.1 while it transits.',
      hint: 'Load the Earth–Sun preset, turn noise on and wait for three or four transits. A small star helps a lot: try an M dwarf.',
      check: (s) => s.noise === true && (s.rp as number) <= 1.5 && s.transits === true && (s.snr as number) >= 7.1,
    },
    {
      id: 'grazing',
      title: 'Graze the limb',
      prompt: 'Make a grazing transit: the planet clips the edge of the star and the dip turns into a V.',
      hint: 'You need $1 - k < b < 1 + k$ with $k = R_p/R_\\star$. A big planet gives a wider window. Tilt slowly and watch the impact parameter readout.',
      check: (s) => s.transits === true && s.grazing === true,
    },
    {
      id: 'hz',
      title: 'Goldilocks',
      prompt: 'Put a transiting planet inside the green habitable zone.',
      hint: 'Around a cool star the zone moves inward. Try the TRAPPIST-1 preset and pick planet e, f or g, or move the orbit slider.',
      check: (s) => s.touched === true && s.inHZ === true && s.transits === true,
    },
  ],
  caveats: `<p>Orbits are circular. The scene is not to scale: orbit sizes are compressed on a log scale, small planets are drawn larger than true size, and the star's wobble is exaggerated by a stated power of ten. The impact parameter, and so whether the planet transits, is shown correctly in the telescope view.</p>
<p>Limb-darkening coefficients are illustrative. The star types other than the Sun, HD 209458 and TRAPPIST-1 are typical values, not specific stars. When you change the planet radius, its mass comes from a rough mass–radius rule, and giant-planet masses are not really set by radius. Noise is white Gaussian noise at one fixed level. Real light curves also have stellar spots, flares and instrument trends. The planet's own faint light, and the secondary eclipse when it passes behind the star, are ignored. The habitable zone is an estimate from climate models and says nothing about whether a planet is actually habitable.</p>`,
  further: [
    { label: 'Winn, Transits and Occultations (review, arXiv)', url: 'https://arxiv.org/abs/1001.2010' },
    { label: 'Mandel & Agol, Analytic Light Curves for Planetary Transit Searches (2002)', url: 'https://doi.org/10.1086/345520' },
    { label: 'NASA Exoplanet Archive', url: 'https://exoplanetarchive.ipac.caltech.edu/' },
    { label: 'Methods of detecting exoplanets (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Methods_of_detecting_exoplanets' },
  ],
};
