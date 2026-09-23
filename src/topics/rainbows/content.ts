import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A rainbow is not an object hanging in the sky. It is a direction. Sunlight enters raindrops, bounces once off the back of each drop, and comes back out. Most of it leaves at many different angles. But a lot of it leaves at almost the same angle, about 42° from the point straight opposite the Sun.</p>
<p>Watch the fan of rays in the scene. Each ray hits the drop at a different height. Rays near the centre come almost straight back. Rays further out come back at a wider angle. Then, at one special height, the angle stops growing and turns around. Near that turning point many rays leave in nearly the same direction. They pile up. That pile-up is the bright edge of the bow. The ray at the turning point is called the <strong>Descartes ray</strong>. The amber tube marks it.</p>
<p>Water bends violet light a little more than red light. So violet turns around at about 40.6° and red at about 42.4°. That tiny difference spreads white sunlight into colours, with red on the outside.</p>
<p>Some light bounces twice inside the drop. It makes a fainter second bow at about 51°, with the colours in reverse order. Between the two bows the sky is darker, because no light that bounced once or twice can reach you from there. That strip is <strong>Alexander's dark band</strong>.</p>
<p>Every drop at 42° from the antisolar point sends you red light. Those drops lie on a cone around the line from the Sun through your head. So the bow is a circle, and the ground usually cuts off its lower part. The person next to you sees light from different drops. Everyone sees their own rainbow.</p>`,
  tryFirst: [
    'Look at the exit rays on the left. They crowd into a bright bundle along the dashed 42° line. That crowd is the rainbow.',
    'In the inset, each curve rises, stops at the amber dot and falls back. That turning point is the minimum deviation. The histogram spike on the right sits at the same angle.',
    'Switch <b>Colour</b> to a single wavelength and drag the <b>Highlight ray</b> slider. Watch its sky angle rise, stop near 42°, and fall again.',
    'Open the <b>Sky</b> view and raise the <b>Sun elevation</b>. The bows sink toward the horizon.',
  ],
  equation: {
    tex: 'D_k(b) = k\\cdot 180^\\circ + 2i - 2(k+1)\\,r, \\qquad \\sin i = b = n \\sin r',
    caption: 'The total deviation of a ray that enters a drop at height $b$ (in drop radii) and reflects $k$ times inside. $D$ is the angle the ray is turned through, measured from its original direction. The bow sits where $D$ is stationary. You see it at angle $\\theta = 180^\\circ - D$ from the antisolar point for $k = 1$, and $\\theta = D - 180^\\circ$ for $k = 2$.',
    terms: [
      { tex: 'D_k', name: 'Total deviation', meaning: 'How far the ray is turned. Each refraction turns it by $i - r$. Each internal reflection turns it by $180^\\circ - 2r$. Add them up and you get the formula.', param: 'hD' },
      { tex: 'k', name: 'Internal reflections', meaning: '$k = 1$ gives the primary bow. $k = 2$ gives the secondary bow.', param: 'k' },
      { tex: 'i', name: 'Angle of incidence', meaning: 'The angle between the incoming ray and the surface normal. It is set by the height of the ray: $\\sin i = b$.', param: 'hb' },
      { tex: 'r', name: 'Angle of refraction', meaning: 'The angle inside the drop. Every internal hit also meets the surface at $r$, because every chord of a circle makes equal angles with both ends.', param: 'snell' },
      { tex: 'n', name: 'Refractive index', meaning: 'For water it falls from about 1.344 at 400 nm to about 1.331 at 700 nm. This small change makes all the colours.', param: 'lambda' },
    ],
  },
  physicsNotes: `
<h3>Adding up the turns</h3>
<p>Follow one ray. Entering the drop, it bends toward the normal and turns by $i - r$. At each reflection inside it turns by $180^\\circ - 2r$. Leaving, it turns by $i - r$ again. The total is</p>
$$D_k = 2(i - r) + k(180^\\circ - 2r) = k\\cdot 180^\\circ + 2i - 2(k+1)r.$$
<p>For $k = 1$ this is the textbook $D = 180^\\circ + 2i - 4r$. The scene checks the formula against a full vector ray trace of the circle. They agree to rounding error.</p>
<h3>The stationary ray</h3>
<p>Set $dD/di = 0$. Snell's law gives $dr/di = \\cos i / (n\\cos r)$, so the condition becomes $n\\cos r = (k+1)\\cos i$. Squaring and using $n^2\\sin^2 r = \\sin^2 i$ gives Descartes' result</p>
$$\\cos^2 i = \\frac{n^2 - 1}{k(k+2)}.$$
<p>For $k = 1$ the right side is $(n^2-1)/3$. With $n = 1.333$ this puts the Descartes ray at $b = 0.861$ and the minimum deviation at $137.9^\\circ$. The bow is then $42.1^\\circ$ from the antisolar point. For $k = 2$ you get $b = 0.950$, $D = 230.9^\\circ$ and a bow at $50.9^\\circ$.</p>
<h3>Why the rays pile up</h3>
<p>Near the stationary ray, $D$ changes only to second order in $b$. A whole range of heights leaves at almost one angle. In ray optics the brightness per unit angle is proportional to $1/|dD/db|$, which is infinite at the minimum. This infinity is called a <strong>caustic</strong>. The histogram in the inset shows the pile-up. Real bows stay finite because the Sun is a disk half a degree wide and because light is a wave.</p>
<h3>The dispersion model</h3>
<p>The index of water comes from the four-term Sellmeier fit of Daimon and Masumura (2007) for distilled water at 20 °C. It gives $n = 1.3436$ at 400 nm, $1.3334$ at 589 nm and $1.3305$ at 700 nm. So the primary bow runs from $40.6^\\circ$ (violet, inside) to $42.4^\\circ$ (red, outside). The secondary runs from $50.2^\\circ$ (red, inside) to $53.6^\\circ$ (violet, outside).</p>
<h3>Brightness</h3>
<p>With <b>Fresnel brightness</b> on, each ray keeps the fraction $(1-R)^2R^k$ of its power, averaged over the two polarizations. Inside the drop the ray meets the surface at $r$, and the reflectance there equals the outside value at $i$. At the Descartes ray only about 4.6% of the light takes the primary path and about 1.9% the secondary path. That is why the secondary bow is fainter.</p>`,
  deep: [
    {
      title: 'Descartes, Newton and the colours',
      html: `<p>Theodoric of Freiberg, in the early 1300s, used glass globes filled with water to show that each drop makes the bow by refraction and internal reflection. René Descartes gave the quantitative theory in <em>Les Météores</em>, published in 1637 with his <em>Discours de la méthode</em>. He computed the paths of many rays through a drop and found that they crowd together near a single angle. He gave 41°47′ for the primary bow and 51°37′ for the secondary.</p>
<p>Descartes could not explain the colours. Isaac Newton did, in his <em>Opticks</em> of 1704. White light is a mixture, and each colour has its own index of refraction. Each colour therefore has its own stationary angle. The bows of all the colours sit side by side, and red, with the smallest index, lands outermost in the primary bow.</p>`,
    },
    {
      title: 'Why a circle, and whose rainbow',
      html: `<p>The drop is a sphere, so nothing picks out one plane around the line from the Sun through the drop. The stationary rays leave on a cone of half-angle $\\theta \\approx 42^\\circ$ around that line. Turn this around and look from your eye. The drops that send you bow light are the ones whose direction makes $42^\\circ$ with the antisolar point, the point straight opposite the Sun. That point is where the shadow of your head falls. So the bow is a circle centred on your shadow.</p>
<p>From the ground the horizon cuts the circle. When the Sun is at elevation $h$, the top of the primary bow sits at $42^\\circ - h$ above the horizon. Once the Sun is higher than about 42°, the primary bow is gone. From an aircraft or a mountain you can see the full circle.</p>
<p>A person standing a few metres away looks along the same directions, but from a different place. The drops on their cone are different drops. The rainbow is not a thing at a place. It is a set of directions tied to each observer.</p>`,
    },
    {
      title: 'Alexander’s dark band and the secondary bow',
      html: `<p>Rays with one reflection all leave at $\\theta \\le 42.4^\\circ$ from the antisolar point. That lights up the sky inside the primary bow. Rays with two reflections all leave at $\\theta \\ge 50.2^\\circ$, which lights the sky outside the secondary. Between these angles no once- or twice-reflected light arrives. The sky there is darker. The band is named after Alexander of Aphrodisias, who described it around 200 AD.</p>
<p>In the secondary bow the colour order is reversed. With one reflection the stationary ray is the <em>largest</em> angle $\\theta$ that light can reach. With two it is the <em>smallest</em>. A larger index pulls the primary bow in and pushes the secondary bow out. Violet has the larger index, so it sits inside the primary bow and outside the secondary. Higher orders exist too. The third and fourth order bows lie toward the Sun and are very faint against the bright sky near it. They have been photographed, first reported in 2011.</p>`,
    },
    {
      title: 'Supernumerary bows: where rays fail',
      html: `<p>Look closely at a bright bow and you may see faint pastel fringes just inside the primary. These <strong>supernumerary bows</strong> cannot come from ray optics. Near the Descartes ray, two rays with different $b$ leave at the same angle. Their paths through the drop have different lengths, so they interfere. Thomas Young used this idea in the early 1800s. George Biddell Airy turned it into a quantitative theory in 1838, using the integral now called the Airy function.</p>
<p>Wave optics also removes the infinite brightness of the caustic, and shifts the peak slightly away from the Descartes angle. The spacing of the fringes depends on drop size. Drops smaller than about a millimetre across give the clearest supernumeraries. Very small drops, like fog, smear the colours into a white fogbow. The exact theory for a sphere is Mie scattering. This scene uses rays only, so it shows no supernumeraries.</p>`,
    },
    {
      title: 'Polarization',
      html: `<p>Rainbow light is strongly polarized. The Descartes ray meets the back of the drop at $r \\approx 40^\\circ$. That is close to Brewster's angle for light going from water to air, $\\arctan(1/1.333) \\approx 36.9^\\circ$. Near Brewster's angle, light polarized in the plane of incidence (p) is hardly reflected. So the reflected light is mostly s-polarized, which means the electric field is tangent to the bow.</p>
<p>In this model the Descartes ray of the primary bow is about 92% polarized, and the secondary about 81%. Published estimates for the whole bow are close to these, often quoted as about 96% and 90%. The exact figure depends on how you average over the bow. A polarizing filter can make a section of the bow nearly vanish when you turn it.</p>`,
    },
  ],
  challenges: [
    {
      id: 'descartes-red',
      title: 'Find the red Descartes ray',
      prompt: 'Pick a red wavelength (620 nm or longer) with one reflection. Move the highlight ray onto the Descartes ray so its sky angle is within 0.5° of 42°.',
      hint: 'Set <b>Colour</b> to single, drag <b>Wavelength</b> above 620 nm, then slide <b>Highlight ray b</b> until it sits on the amber tube, near b = 0.86.',
      check: (s) => s.touched === true && s.colorMode === 'single' && (s.lambda as number) >= 620 && s.k === '1' && Math.abs((s.hTheta as number) - 42) < 0.5 && (s.hOffDescartes as number) < 0.02,
    },
    {
      id: 'reverse',
      title: 'Colours in reverse',
      prompt: 'Show the secondary bow in full colour and check that red now leaves closer to the antisolar direction than violet.',
      hint: 'Set <b>Reflections</b> to 2 and <b>Colour</b> to full spectrum. Compare the order of the colours with the primary bow.',
      check: (s) => s.k === '2' && s.colorMode === 'spectrum' && s.view === 'drop' && s.secondaryReversed === true,
    },
    {
      id: 'sunset-only',
      title: 'Too high for a rainbow',
      prompt: 'In the Sky view, raise the Sun until the primary bow sinks completely below the horizon.',
      hint: 'The top of the bow is at 42.4° minus the Sun elevation. Push the Sun above that.',
      check: (s) => s.view === 'sky' && s.primaryVisible === false,
    },
    {
      id: 'dark-band',
      title: 'Find the dark band',
      prompt: 'Show both orders at once and find the range of angles that no ray reaches.',
      hint: 'Set <b>Reflections</b> to Both. In the inset histogram, the gap between the two spikes is Alexander’s dark band.',
      check: (s) => s.touched === true && s.k === 'both' && s.view === 'drop' && (s.bandWidth as number) > 5,
    },
  ],
  caveats: `<p>This is ray optics in a perfect sphere. Large raindrops, a few millimetres across, are flattened by air drag, which changes the bow slightly. Very small drops need wave optics. The model has no interference, so it shows no supernumerary bows and gives an infinite peak at the Descartes angle where the true peak is finite. In the Sky view the peak is smoothed only by the size of the Sun's disk.</p>
<p>Brightness uses Fresnel coefficients for a flat, white solar spectrum from 400 to 700 nm. It ignores light reflected off the outside of the drop and light scattered by other drops, and it ignores absorption, which is tiny in a drop this small. The sky colours are approximate: the rainbow colours are converted with a fit to the CIE 1931 colour matching functions and then clipped to what a screen can show.</p>
<p>The rays in the droplet view are drawn in one plane through the centre of the drop. The full 3D pattern is that plane spun around the Sun's axis. The Sky view draws only rain far away in the upper half of the sky and a flat horizon.</p>`,
  further: [
    { label: 'Rainbow on Wikipedia', url: 'https://en.wikipedia.org/wiki/Rainbow' },
    { label: 'Daimon and Masumura (2007), refractive index of distilled water', url: 'https://doi.org/10.1364/AO.46.003811' },
    { label: 'Nussenzveig (1977), The Theory of the Rainbow, Scientific American', url: 'https://doi.org/10.1038/scientificamerican0477-116' },
    { label: 'Supernumerary rainbow on Wikipedia', url: 'https://en.wikipedia.org/wiki/Supernumerary_rainbow' },
  ],
};
