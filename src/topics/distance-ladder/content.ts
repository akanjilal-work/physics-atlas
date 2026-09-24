import type { TopicContent } from '../../core/types.ts';
import { distanceFactor, H0_PLANCK, H0_SHOES, offsetForH0, tensionSigma } from './physics.ts';

const OFF_NEEDED = Math.abs(offsetForH0(H0_SHOES.value, H0_PLANCK.value)).toFixed(2);
const SIGMA = tensionSigma(H0_SHOES.value, H0_SHOES.sigma, H0_PLANCK.value, H0_PLANCK.sigma).toFixed(1);
const PCT01 = ((distanceFactor(0.1) - 1) * 100).toFixed(1);

export const content: TopicContent = {
  intuition: `
<p class="lead">No tape measure reaches the stars. Astronomers measure the universe the way you climb a ladder. <strong>Each rung is a method that works over a certain range, and each is calibrated by the rung below it.</strong></p>
<p>The bottom rung is radar. Bounce a radio pulse off Venus, time the echo, and you know the size of Earth's orbit in metres. Next comes parallax. As Earth goes round the Sun, a nearby star seems to shift a tiny bit against far-away stars. The shift and the size of Earth's orbit give the distance by plain geometry.</p>
<p>Parallax runs out after a few thousand light years. To go further you need a <strong>standard candle</strong>, an object whose true brightness you know. Compare how bright it looks with how bright it really is, and you get its distance. Cepheid stars pulse, and the slower ones are brighter. Measure the period and you know the power. Parallax to nearby Cepheids sets that rule. Cepheids in turn calibrate exploding white dwarfs, type Ia supernovae, which are bright enough to see across billions of light years. Those far galaxies are all rushing away, faster the further they are. The ratio of speed to distance is the Hubble constant, $H_0$.</p>
<p>Here is the surprise. Build the ladder carefully and you get $H_0 \\approx 73$ km/s/Mpc. Predict it from the early universe with the standard model of cosmology and you get about 67. The gap is several times larger than the quoted errors. Nobody yet knows why.</p>
<p>In the scene, the ladder runs along the bottom on a log scale. Each step to the right is ten times further. The coloured bars show where each method works. They overlap, and that overlap is what lets one rung calibrate the next. Fly to each rung with the buttons.</p>`,
  tryFirst: [
    'Press <b>Parallax</b>. Watch the near star swing against the background as Earth orbits. Drag the <b>parallax</b> slider and see the swing shrink as the star moves away.',
    'Press <b>Cepheid</b>. Drag the <b>period</b> until the amber model curve runs through the white data points. The distance error drops below 5%.',
    'Drag the <b>calibration offset</b> by 0.1 mag and watch every rung above shift. $H_0$ moves by about 5%.',
    'Switch the <b>H₀ comparison</b> between Cepheids and TRGB to see how the tension with Planck changes.',
  ],
  equation: {
    tex: 'm - M = 5\\log_{10}\\frac{d}{10\\,\\text{pc}}',
    caption: 'The distance modulus. It links apparent magnitude $m$, absolute magnitude $M$ and distance $d$. The anchor comes from parallax: $d\\,[\\text{pc}] = 1/p\\,[\\text{arcsec}]$, so a star at 10 pc has a parallax of 0.1 arcsec.',
    terms: [
      { tex: 'm', name: 'Apparent magnitude', meaning: 'How bright the object looks from Earth. A larger number means fainter. 5 magnitudes is a factor of exactly 100 in flux.', param: 'm' },
      { tex: 'M', name: 'Absolute magnitude', meaning: 'How bright it would look from 10 pc. For a Cepheid it comes from the period through the Leavitt law. For a type Ia supernova it is about $-19.3$ at peak.', param: 'P' },
      { tex: 'm - M', name: 'Distance modulus μ', meaning: 'The dimming caused by distance alone. A calibration error in $M$ passes straight into $\\mu$ and so into $d$.', param: 'mu' },
      { tex: 'd', name: 'Distance', meaning: 'Solve for it: $d = 10^{\\mu/5+1}$ pc. An error of $\\delta$ magnitudes scales $d$ by $10^{0.2\\delta}$.', param: 'dCep' },
      { tex: '10\\,\\text{pc}', name: 'Reference distance', meaning: 'Where $m = M$ by definition. At 10 pc the parallax is 0.1 arcsec, so the whole magnitude scale is tied to parallax.', param: 'p' },
    ],
  },
  physicsNotes: `
<h3>Rung 1: radar and the astronomical unit</h3>
<p>Kepler's third law gives the shape of the Solar System in units of Earth's orbit. Venus orbits at 0.723 AU. It does not say how big an AU is in metres. Radar fixes that. At closest approach Venus is $1 - 0.723 = 0.277$ AU away. The echo returns after about 276 s, so $1\\,\\text{AU} = c\\,t / (2 \\times 0.277)$. Radar echoes from Venus were first detected reliably in 1961. Since 2012 the AU is defined as exactly 149,597,870,700 m.</p>
<h3>Rung 2: parallax</h3>
<p>Earth's orbit is a baseline 2 AU wide. A star at distance $d$ shifts by a half-angle $p$ with $\\tan p = 1\\,\\text{AU}/d$. The parsec is the distance where $p = 1$ arcsec, which is $648000/\\pi \\approx 206265$ AU or $3.086\\times10^{16}$ m. So</p>
$$d\\,[\\text{pc}] = \\frac{1}{p\\,[\\text{arcsec}]}.$$
<p>Gaia's third data release gives parallax errors of about 0.02 to 0.03 milliarcseconds for stars brighter than magnitude 15, and 0.5 mas at magnitude 20. That is tens of microarcseconds, not single ones. For a bright star the fractional distance error is $\\sigma_p/p$, so Gaia reaches 10% at about 4 kpc.</p>
<h3>Rung 3: the Leavitt law</h3>
<p>Classical Cepheids brighten and fade with a period of days to months. Longer periods mean more luminous stars. This page uses the V-band relation from Hubble parallaxes of 10 Milky Way Cepheids (Benedict et al. 2007),</p>
$$M_V = -2.43\\,(\\log_{10} P - 1) - 4.05,$$
<p>with $P$ in days. A 30-day Cepheid has $M_V \\approx -5.2$, about 10,000 times the Sun's visible output. Modern work uses near-infrared bands and the reddening-free Wesenheit magnitude, which reduce the effects of dust.</p>
<h3>Rung 4: type Ia supernovae</h3>
<p>A white dwarf that explodes as a type Ia supernova peaks near $M_B \\approx -19.3$ after correcting for its decline rate and colour. That can outshine its host galaxy. The peak brightness is calibrated in nearby galaxies that also contain Cepheids, then used in galaxies hundreds of megaparsecs away.</p>
<h3>Rung 5: the Hubble flow and error propagation</h3>
<p>Far galaxies recede with $v = H_0 d$. Take distances from supernovae, velocities from redshifts, and fit the slope. A zero-point error $\\delta$ in the Cepheid magnitudes passes into the supernova calibration and then into every far distance. So</p>
$$H_0 \\to H_0 \\times 10^{0.2\\,\\delta}.$$
<p>An error of 0.1 mag changes $H_0$ by ${PCT01}%. Moving the ladder result from ${H0_SHOES.value} to Planck's ${H0_PLANCK.value} would need a shift of about ${OFF_NEEDED} mag.</p>`,
  deep: [
    {
      title: 'Bessel and the first stellar parallax (1838)',
      html: `<p>Astronomers had looked for stellar parallax since Copernicus. Its absence was once used as an argument against a moving Earth. The shift is tiny because the stars are so far away.</p>
<p>Friedrich Bessel picked 61 Cygni because it moves fast across the sky, a hint that it is close. With a heliometer at Königsberg he measured its position against two faint background stars through 1837 and 1838. In 1838 he announced a parallax of about 0.314 arcsec. Gaia now gives 0.286 arcsec, a distance of 3.50 pc or 11.4 light years. Thomas Henderson measured Alpha Centauri and Friedrich Struve measured Vega at around the same time.</p>
<p>The Hipparcos satellite (1989 to 1993) reached about 1 milliarcsecond. Gaia, launched in 2013, reaches a few hundredths of a milliarcsecond for bright stars and has measured parallaxes for over a billion stars.</p>`,
    },
    {
      title: 'Henrietta Leavitt and the period–luminosity law (1912)',
      html: `<p>Henrietta Swan Leavitt worked at Harvard College Observatory, measuring stars on photographic plates. She found hundreds of variable stars in the Magellanic Clouds. In 1908 she noted that the brighter ones had longer periods.</p>
<p>In 1912 she published periods for 25 variables in the Small Magellanic Cloud. All of them are at nearly the same distance, so their apparent brightness tracks their true brightness. She found a clean straight line between magnitude and the logarithm of the period.</p>
<p>Her law gave relative distances only. Ejnar Hertzsprung made the first rough calibration in 1913. In 1925 Edwin Hubble reported Cepheids in the Andromeda nebula, which placed it far outside the Milky Way. A later correction by Walter Baade in 1952 showed there are two kinds of Cepheid. That roughly doubled the size of the universe as then measured.</p>`,
    },
    {
      title: 'Hubble, Humason and the expanding universe',
      html: `<p>Vesto Slipher had measured large redshifts for spiral nebulae by the 1910s. In 1927 Georges Lemaître showed that an expanding universe in general relativity predicts a velocity proportional to distance, and he estimated the rate.</p>
<p>In 1929 Hubble combined velocities, mostly Slipher's, with his own distances and found the linear relation. Milton Humason took new, fainter spectra, and in 1931 Hubble and Humason extended the relation to velocities near 20,000 km/s. Their slope was about 500 km/s/Mpc, some seven times too large. The error came from calibration, mainly the mixed-up Cepheid types and the confusion of bright gas clouds with bright stars. It is a vivid example of this page's lesson. A bad lower rung shifts everything above it.</p>
<p>In 2018 the International Astronomical Union recommended calling the law the Hubble–Lemaître law.</p>`,
    },
    {
      title: 'Why each rung depends on the one below',
      html: `<p>A standard candle only gives relative distances until someone measures the true brightness of at least a few examples. That needs distances from a lower rung. So the chain runs:</p>
<p>radar sets the AU in metres, the AU sets parallax distances, parallax sets the Cepheid zero point, Cepheids in nearby galaxies set the supernova peak brightness, and supernovae in the Hubble flow give $H_0$.</p>
<p>Two things keep this honest. First, each rung needs <strong>overlap</strong>: enough objects that can be measured by both methods. The bars under the ladder show that overlap. Second, modern ladders use several independent anchors. SH0ES uses Gaia parallaxes of Milky Way Cepheids, detached eclipsing binaries in the Large Magellanic Cloud, and the water maser disk in NGC 4258. They agree to within their errors.</p>
<p>Errors add up the ladder. A 0.1 mag slip in the Cepheid zero point moves every distance above it by ${PCT01}%. Try it with the calibration slider.</p>`,
    },
    {
      title: 'The Hubble tension: an open question',
      html: `<p>Two routes to $H_0$ disagree. The SH0ES team (Riess et al. 2022) used Cepheids and type Ia supernovae and found $73.04 \\pm 1.04$ km/s/Mpc. The Planck satellite measured the cosmic microwave background. Fitting the standard ΛCDM model to it gives $67.4 \\pm 0.5$ (Planck 2018). The difference is about ${SIGMA} standard deviations.</p>
<p>The CCHP team led by Wendy Freedman uses the tip of the red giant branch (TRGB) instead of Cepheids. Their HST and JWST analysis gives $70.4 \\pm 1.9$ (Freedman et al. 2025), between the two and consistent with both. The SH0ES team finds 72.5 with TRGB on their own supernova sample. The groups disagree about which galaxies and supernovae to use, and this remains under debate.</p>
<p>JWST's sharper near-infrared images tested one suspected problem. Cepheids in crowded fields could look too bright because of blended neighbours. JWST photometry of more than a thousand Cepheids agrees with the Hubble photometry (Riess et al. 2024). So crowding does not seem to be the answer.</p>
<p>Possible explanations fall into two groups. <strong>Systematics</strong>: dust, metallicity effects on Cepheids, differences between nearby and distant supernova hosts, or the choice of calibrating galaxies. <strong>New physics</strong>: for example early dark energy that shrinks the sound horizon before recombination. That would change the CMB inference. No new-physics model is established, and many are in tension with other data. This is a real open problem.</p>`,
    },
  ],
  challenges: [
    {
      id: 'bessel',
      title: 'Bessel’s star',
      prompt: 'Gaia puts 61 Cygni at 3.50 pc. Set the parallax so the star sits at that distance, within 2%.',
      hint: 'Use $p = 1/d$. You need about 0.286 arcsec, or 286 mas.',
      check: (s) => Math.abs((s.dStar as number) / 3.4964 - 1) < 0.02,
    },
    {
      id: 'cepheid',
      title: 'A Cepheid distance',
      prompt: 'Fly to the Cepheid. Find its period from the light curve and get the galaxy distance within 5% of the truth.',
      hint: 'Drag the period until the amber curve passes through every white point, all the way to day 90. Keep the calibration offset near zero.',
      check: (s) => s.periodTouched === true && Math.abs(s.errCep as number) < 0.05,
    },
    {
      id: 'offset',
      title: 'Shake the bottom rung',
      prompt: 'Shift the Cepheid calibration by 0.1 mag, either way. Watch $H_0$ move by about 5%.',
      hint: 'Set the offset slider to +0.10 or −0.10. The distance factor is $10^{0.02} \\approx 1.047$.',
      check: (s) => Math.abs(Math.abs(s.offset as number) - 0.1) < 0.006,
    },
    {
      id: 'tension',
      title: 'Close the gap by hand',
      prompt: 'How big a calibration error would make the ladder agree with Planck? Tune the offset until your ladder gives $H_0$ within 0.5 km/s/Mpc of 67.4.',
      hint: `You need $5\\log_{10}(67.4/73) \\approx -0.17$ mag. That is an 8% error in every distance. The ladder teams argue their errors are several times smaller.`,
      check: (s) => Math.abs((s.H0 as number) - 67.4) < 0.5,
    },
  ],
  caveats: `
<p>The scene is not to scale. Angles in the parallax view are exaggerated by about a million, and each rung is a small diorama placed at its log distance. The Cepheid light curve and the supernova light curve are schematic shapes. The Cepheid host galaxy and the supernova sample are simulated, with a true $H_0$ chosen so the ladder gives about 73.</p>
<p>The distance modulus here ignores dust. Real work adds an extinction term $A$, so $m - M = 5\\log_{10}(d/10\\,\\text{pc}) + A$, and uses infrared bands to keep $A$ small. At large distances $d$ becomes the luminosity distance, and $v = cz$ holds only for small redshift. Peculiar velocities of a few hundred km/s blur the Hubble law for nearby galaxies. The single offset slider stands in for all calibration errors. Real error budgets have many independent terms.</p>`,
  further: [
    { label: 'Cosmic distance ladder (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Cosmic_distance_ladder' },
    { label: 'Riess et al. 2022, the SH0ES H0 measurement (arXiv:2112.04510)', url: 'https://arxiv.org/abs/2112.04510' },
    { label: 'Planck 2018 results VI: cosmological parameters (arXiv:1807.06209)', url: 'https://arxiv.org/abs/1807.06209' },
    { label: 'Freedman et al. 2025, CCHP status report with JWST (arXiv:2408.06153)', url: 'https://arxiv.org/abs/2408.06153' },
  ],
};
