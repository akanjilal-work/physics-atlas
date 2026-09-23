import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Light has no mass, yet gravity bends its path. Near a black hole the bending gets so strong that light can loop all the way around the hole before it escapes. Some light never escapes at all.</p>
<p>Picture a stream of light rays heading past a black hole, all parallel, each one a little further from the centre than the last. How far a ray sits from the centre line is called its <strong>impact parameter</strong>, $b$. Far-off rays barely notice the hole. They bend by a tiny angle. Closer rays bend more.</p>
<p>Then comes a sharp edge. At $b = 3\\sqrt{3}\\,M \\approx 5.2\\,M$ a ray is bent just enough to circle the hole forever, on a ring called the <strong>photon sphere</strong>. A ray slightly further out winds around once or twice and then leaves in almost any direction. A ray slightly closer in spirals down into the hole. So the hole has a black disc, its <strong>shadow</strong>, that is bigger than the hole itself. Every ray aimed inside that disc is swallowed.</p>
<p>In the left of the scene, rays come in from the left and are coloured by $b$. The red ones fall in. The amber ones graze the photon sphere and wrap around it. The white tube is a probe ray you control. On the right is what a camera near the hole would actually see. The stars behind the hole are smeared into arcs. A bright source straight behind the hole becomes a ring of light, an <strong>Einstein ring</strong>.</p>`,
  tryFirst: [
    'Look at the inset plot. The cyan curve is the true deflection. It hugs the violet $4M/b$ line far out and shoots upward near $b_c$.',
    'Press <b>Snap to b_c</b>, then drag <b>Fine tune</b> to about +0.001. Watch the white probe ray wrap once around the photon sphere.',
    'Drag the <b>bright source offset</b> down toward 0°. Two arcs grow and join into a full Einstein ring.',
    'Turn on the <b>thin accretion disk</b> and drag the view. The far side of the disk shows up above and below the shadow, bent over the top of the hole.',
  ],
  equation: {
    tex: '\\frac{d^2u}{d\\varphi^2} + u = 3Mu^2',
    caption: 'The orbit equation for light in the Schwarzschild spacetime, with $u = 1/r$ and $G = c = 1$. Without the right-hand side, the solutions are straight lines. The $3Mu^2$ term is all of the bending.',
    terms: [
      { tex: '\\frac{d^2u}{d\\varphi^2}', name: 'Path curvature', meaning: 'How fast $1/r$ changes as the ray sweeps around the hole. Summed along the path it gives the total deflection $\\alpha$.', param: 'alpha' },
      { tex: 'u', name: 'Inverse radius', meaning: '$u = 1/r$. It is largest at the closest approach of the ray.', param: 'rmin' },
      { tex: '\\varphi', name: 'Swept angle', meaning: 'The polar angle the ray sweeps. A straight line sweeps $\\pi$. A deflected ray sweeps $\\pi + \\alpha$.', param: 'swept' },
      { tex: '3Mu^2', name: 'Gravity term', meaning: 'The only relativistic piece. It is tiny far away and huge near $r = 3M$. It creates the photon sphere and the capture of rays with $b < 3\\sqrt{3}\\,M$.', param: 'fate' },
      { tex: 'M', name: 'Mass', meaning: 'Sets every length scale. The horizon is at $2M$, the photon sphere at $3M$, and the shadow edge at $b_c = 3\\sqrt{3}\\,M$. Here $M = 1$.', param: 'bc' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>For light in the equatorial plane of the Schwarzschild metric, two quantities are conserved: the energy $E$ and the angular momentum $L$. Their ratio is the impact parameter $b = L/E$. The null condition $ds^2 = 0$ then gives</p>
$$\\left(\\frac{du}{d\\varphi}\\right)^2 + u^2 - 2Mu^3 = \\frac{1}{b^2}$$
<p>Differentiate once with respect to $\\varphi$ and you get the headline equation. The scene integrates it with fourth-order Runge-Kutta in $\\varphi$, with a fixed step of $0.002$ radians for the probe ray. The <b>invariant drift</b> readout shows how well the first integral above is held. It stays near $10^{-13}$.</p>
<h3>Weak field: Einstein's deflection</h3>
<p>For a ray that stays far from the hole, the $3Mu^2$ term is a small correction. Solving to first order in $M/b$ gives the famous result, in ordinary units:</p>
$$\\hat\\alpha = \\frac{4GM}{c^2 b}$$
<p>The next term is $15\\pi G^2M^2/(4c^4b^2)$. It is positive, so $4M/b$ always comes out a little low. At $b = 100\\,M$ the true deflection is about 3% larger than $4M/b$. At $b = 300\\,M$ the gap is about 1%. The <b>α vs 4M/b</b> readout shows this gap live.</p>
<h3>Strong field: the photon sphere and the shadow</h3>
<p>A circular light orbit needs $u'' = 0$ and $u' = 0$ together, which means $u = 3Mu^2$, so $r = 3M$. Putting $u = 1/3M$ into the first integral gives $b_c = 3\\sqrt{3}\\,M \\approx 5.196\\,M$. Rays with $b < b_c$ have no turning point and fall in. Rays just above $b_c$ wind around many times, with a deflection that grows like $-\\ln(b/b_c - 1)$. Each factor of about $e^{2\\pi} \\approx 535$ closer to $b_c$ adds one more full loop.</p>
<h3>How the lensed sky is drawn</h3>
<p>For each pixel the shader finds the viewing angle $\\theta$ from the direction of the hole. A static observer at radius $D$ sees a ray with impact parameter $b = D\\sin\\theta/\\sqrt{1 - 2M/D}$. A lookup table, rebuilt whenever $D$ changes, gives the total angle $\\Delta\\varphi(b)$ that ray sweeps on its way back out to the stars. The table goes to the GPU as a floating-point DataTexture. The sky colour is then read from the direction $\\cos\\Delta\\varphi\\,\\hat e_1 + \\sin\\Delta\\varphi\\,\\hat e_2$ in the plane of the ray. Rays with $b < b_c$ come from the horizon, so they are black.</p>`,
  deep: [
    {
      title: 'The 1919 eclipse',
      html: `<p>Treat light as a stream of fast Newtonian particles and it bends too, by $2GM/(c^2 b)$. At the edge of the Sun that is about 0.87 arcseconds. Johann von Soldner worked this out in the early 1800s. In 1911 Einstein, using only the equivalence principle, predicted the same half value. His full theory of 1915 added the bending of space as well as time and doubled it to <strong>1.75 arcseconds</strong>. The scene's physics module reproduces this number from the full geodesic equation.</p>
<p>Stars near the Sun can only be seen during a total eclipse. Arthur Eddington and Frank Dyson organised two expeditions for the eclipse of 29 May 1919, to Sobral in Brazil and to the island of Príncipe off West Africa. The photographs were compared with plates of the same star field taken at night months apart. The results were announced on 6 November 1919. The main Sobral instrument gave $1.98 \\pm 0.12$ arcseconds and Príncipe gave $1.61 \\pm 0.30$. Both favoured Einstein over the Newtonian value. Einstein became world famous almost overnight.</p>
<p>The 1919 error bars were large, and the choice of which plates to trust has been argued over ever since. Later tests settled it. Radio telescopes now track quasars as the Sun passes in front of them, and they confirm the full value to better than one part in a thousand.</p>`,
    },
    {
      title: 'Einstein rings, arcs and microlensing',
      html: `<p>When a source, a lens and an observer line up exactly, the symmetry spreads the image into a ring. For a source at infinity and an observer at distance $D$ the weak-field ring has angular radius $\\theta_E \\approx \\sqrt{4GM/(c^2 D)}$. The scene compares this with the exact ring from the lookup table. Close to the hole the exact ring is larger, because the deflection there is larger than $4M/b$.</p>
<p>Einstein wrote about the ring in a short 1936 paper, and he doubted anyone would ever see one. The first lensed object, the twin quasar Q0957+561, was found in 1979 by Dennis Walsh, Robert Carswell and Ray Weymann. The first Einstein ring, MG1131+0456, was found at radio wavelengths in 1988. Since the mid 1980s astronomers have also seen giant arcs: distant galaxies stretched by whole galaxy clusters. Lensing now maps dark matter, which bends light even though it gives off none.</p>
<p>When the lens is a single star, the images are too close together to resolve. What you see instead is the background star brightening and fading over days to weeks. This is <strong>microlensing</strong>, proposed as a survey method by Bohdan Paczyński in 1986. If the lens star has a planet, the planet adds a short extra blip. The first planet found this way, OGLE-2003-BLG-235Lb, was announced in 2004. Microlensing can find planets that are cold and far from their stars, which other methods miss.</p>`,
    },
    {
      title: 'The Event Horizon Telescope images',
      html: `<p>The Event Horizon Telescope links radio dishes across the Earth into one virtual telescope the size of the planet. It observes at a wavelength of 1.3 mm. In April 2019 the team released the first image of a black hole: <strong>M87*</strong>, in the galaxy M87, about 55 million light years away. It showed a bright ring about 42 microarcseconds across with a dark centre. In May 2022 they released an image of <strong>Sagittarius A*</strong>, the black hole at the centre of our own galaxy. Both images come from data taken in April 2017.</p>
<p>The size of the dark centre is set by $b_c$. From far away the shadow has radius $3\\sqrt{3}\\,GM/c^2$, while the horizon has radius $2GM/c^2$. So the shadow looks about <strong>$3\\sqrt{3}/2 \\approx 2.6$ times</strong> wider than the horizon. For M87*, with a mass from stellar motions of about 6.5 billion Suns, that predicts a shadow about 40 microarcseconds across. For Sgr A*, about 4 million Suns and 27,000 light years away, it predicts about 50. Both match the measured rings to within the errors.</p>
<p>Be careful with one detail. What the EHT sees is glowing gas, lensed. The bright ring lies close to the shadow edge, but it is not exactly the shadow. Turning ring size into mass needs simulations of the gas as well.</p>`,
    },
    {
      title: 'Loops, higher-order images and the photon ring',
      html: `<p>Charles Galton Darwin showed in 1959 that rays passing just outside $b_c$ can loop around the hole any number of times. Near $b_c$ the deflection follows a simple law, worked out in detail by Valerio Bozza in 2002:</p>
$$\\alpha(b) \\approx -\\ln\\!\\left(\\frac{b}{b_c} - 1\\right) + \\ln\\!\\left[216\\,(7 - 4\\sqrt{3})\\right] - \\pi$$
<p>The test suite checks the integrator against this formula. Because of it, every source in the sky has an infinite sequence of images. There is the main image, a faint one on the other side of the hole, then images that went once around, twice around, and so on. Each is squeezed about $e^{2\\pi} \\approx 535$ times thinner than the last. They pile up at the edge of the shadow as a thin <strong>photon ring</strong>. In the lensed view it is the thin bright rim right at the shadow's edge.</p>
<p>The same looping makes a thin disk look strange. Light from the far side of the disk passes over the top of the hole and reaches you. So the far side appears as a hump above the shadow, and its underside shows below. Jean-Pierre Luminet drew the first such picture by hand, from a computer calculation, in 1979.</p>`,
    },
    {
      title: 'Edge cases and limits of the method',
      html: `<p><strong>Exactly at $b_c$.</strong> The ray approaches the photon sphere and circles it forever. The orbit is unstable, so any error grows by a factor of $e^{2\\pi}$ per loop. The code treats the exact value as orbiting. Any real ray is a hair inside or outside.</p>
<p><strong>Finite observer distance.</strong> The inset plot shows the textbook deflection for a ray from infinity to infinity. The lensed sky uses the angle swept from the observer at radius $D$ out to the stars. That is why the shadow and ring sizes change with the observer distance slider.</p>
<p><strong>Lookup-table resolution.</strong> The sky table has 2048 samples in $b$. Near $b_c$ the deflection changes faster than any table can follow, so the thinnest higher-order images are only roughly right. They are thinner than a pixel anyway.</p>
<p><strong>The disk.</strong> The disk is found by asking where each ray crosses the equatorial plane. A second table stores $1/r$ along each ray for up to three crossings. Its brightness uses a simple thin-disk profile. There is no Doppler boost, no gravitational redshift and no gas physics. A real image of a disk like this is lopsided: the side moving toward you is much brighter.</p>`,
    },
  ],
  challenges: [
    {
      id: 'loop',
      title: 'Full loop',
      prompt: 'Find a ray that escapes after a deflection of more than 360°.',
      hint: 'Press <b>Snap to b_c</b>, then drag <b>Fine tune</b> to a small positive value. You need $b - b_c$ below about 0.006.',
      check: (s) => s.touched === true && s.probeFate === 'escaped' && (s.probeAlphaDeg as number) > 360,
    },
    {
      id: 'ring',
      title: 'Close the ring',
      prompt: 'Line up the bright source behind the hole so its two arcs join into a full Einstein ring.',
      hint: 'Drag the <b>bright source offset</b> below the source radius of 1.5°. Watch the lensed sky on the right.',
      check: (s) => s.touched === true && s.view !== 'rays' && s.ringFull === true,
    },
    {
      id: 'weak',
      title: 'Einstein was right, far out',
      prompt: 'Get the probe deflection within 1% of $4M/b$.',
      hint: 'The error shrinks roughly like $3M/b$. Push <b>Impact parameter b</b> above about 300.',
      check: (s) => s.touched === true && s.probeFate === 'escaped' && (s.weakErr as number) < 0.01,
    },
    {
      id: 'capture',
      title: 'Swallowed',
      prompt: 'Send the probe ray into the black hole.',
      hint: 'Any $b$ below $3\\sqrt{3}\\,M \\approx 5.196\\,M$ is captured.',
      check: (s) => s.touched === true && s.probeFate === 'captured',
    },
  ],
  caveats: `<p>This is a Schwarzschild black hole: no spin and no charge. Real black holes spin. Spin makes the shadow slightly squashed and shifted, and drags the photon orbits on one side closer in. That needs the Kerr metric.</p>
<p>The lensed view shows where light comes from, not how its colour or brightness changes. It leaves out gravitational redshift, the Doppler shift and beaming from moving gas, and the brightening of a lensed source by magnification. The observer is held at rest, which a real observer that close to a hole could only do with a rocket.</p>
<p>The accretion disk is a simplification. It is infinitely thin, lies in one plane from $6M$ to $14M$, has a made-up brightness profile and a decorative swirl, and is not beamed. It is only there to show where lensed light from a disk would appear.</p>
<p>The 3D rays are drawn in one plane. Every light ray around a non-spinning hole stays in a plane through the centre, so the full 3D picture is this plane rotated. The moving photons travel at a steady on-screen speed chosen for clarity, not at the coordinate speed of light.</p>`,
  further: [
    { label: 'Gravitational lens on Wikipedia', url: 'https://en.wikipedia.org/wiki/Gravitational_lens' },
    { label: 'Dyson, Eddington and Davidson (1920), the 1919 eclipse results', url: 'https://doi.org/10.1098/rsta.1920.0009' },
    { label: 'Event Horizon Telescope Collaboration (2019), First M87 Event Horizon Telescope Results. I', url: 'https://doi.org/10.3847/2041-8213/ab0ec7' },
    { label: 'Bozza (2002), Gravitational lensing in the strong field limit', url: 'https://arxiv.org/abs/gr-qc/0208075' },
  ],
};
