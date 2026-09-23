import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Suppose you could fly a spaceship at 90% of the speed of light and look out of the window. You would not see the stars streak past like in the films. You would see the whole sky slide forward and crowd into a small patch dead ahead. That patch would glow blue-white. Behind you the sky would go dark and red.</p>
<p>Three effects cause this, and the scene lets you switch each one on and off.</p>
<p><strong>Aberration</strong> changes where light seems to come from. Run through vertical rain and the drops seem to come at you from the front. Light does the same. As you speed up, every star appears to move toward the point you are heading for. At 90% of light speed, half of all the stars in the sky appear within 26° of that point.</p>
<p><strong>The Doppler shift</strong> changes colour. Light from ahead reaches you at a higher frequency, so it looks bluer. Light from behind is stretched to longer, redder waves. Somewhere in between is a ring where the colour does not change at all.</p>
<p><strong>The searchlight effect</strong>, or beaming, changes brightness. Ahead, each photon carries more energy and more photons arrive each second. The stars pile up too. The sky ahead gets thousands of times brighter at the top speeds on the slider.</p>
<p>The second view holds a real surprise. You might expect a fast cube to look squashed, because moving objects are shorter along their motion. But light from the far side of the cube set off earlier than light from the near side. The two delays together make the cube look <strong>rotated</strong>, not squashed. A fast sphere still looks perfectly round. James Terrell and Roger Penrose pointed this out in 1959, more than fifty years after Einstein's paper.</p>`,
  tryFirst: [
    'Drag <b>β</b> slowly from 0 to 0.99 and watch the stars slide forward. The amber circle marks a cone of 25° around the direction of flight.',
    'Turn off <b>Doppler colour</b> and <b>Searchlight</b>. Only aberration is left. The stars still crowd forward, but keep their colours and brightness.',
    'Switch on <b>Split view</b>. On the left is a classical world where light is a stream of particles. On the right is relativity. The right side crowds much harder.',
    'Set <b>View</b> to <b>Terrell</b>. The wireframe is where the cube really is, squashed by Lorentz contraction. The solid is what the camera sees: a cube that looks turned, so you see its trailing face (amber).',
  ],
  equation: {
    tex: '\\cos\\theta\' = \\frac{\\cos\\theta + \\beta}{1 + \\beta\\cos\\theta}',
    caption: 'Relativistic aberration. A star at angle $\\theta$ from your direction of motion, measured in the stars\' frame, appears at $\\theta\'$ in yours. The same light arrives with its frequency multiplied by the Doppler factor $D = 1/[\\gamma(1-\\beta\\cos\\theta\')] = \\gamma(1+\\beta\\cos\\theta)$.',
    terms: [
      { tex: '\\theta\'', name: 'Seen angle', meaning: 'Where the star appears to you, measured from the direction you are flying. Set the white probe marker with the <b>Probe angle</b> slider.', param: 'probe' },
      { tex: '\\theta', name: 'Rest-frame angle', meaning: 'Where the same star sits for an observer at rest among the stars. Always larger than $\\theta\'$ when you move forward.', param: 'probeSrc' },
      { tex: '\\beta', name: 'Speed', meaning: 'Your speed as a fraction of the speed of light, $\\beta = v/c$.', param: 'beta' },
      { tex: 'D', name: 'Doppler factor', meaning: 'Observed frequency over emitted frequency. $D > 1$ is a blueshift, $D < 1$ a redshift. Colours come from a blackbody at temperature $DT$.', param: 'dProbe' },
      { tex: '\\gamma', name: 'Lorentz factor', meaning: '$\\gamma = 1/\\sqrt{1-\\beta^2}$. Straight ahead $D = \\gamma(1+\\beta)$, straight behind $D = 1/(\\gamma(1+\\beta))$.', param: 'gamma' },
    ],
  },
  physicsNotes: `
<h3>Where the formula comes from</h3>
<p>A photon arriving from direction $\\hat n$ has four-momentum $p = E(1, -\\hat n)$ with $c = 1$. Boost into a frame moving at $\\beta$ along $\\hat f$. The energy and the component along $\\hat f$ mix, while the sideways part stays the same:</p>
$$E\' = \\gamma E(1 + \\beta\\cos\\theta), \\qquad E\'\\sin\\theta\' = E\\sin\\theta$$
<p>The first line is the Doppler factor $D = E\'/E$. Divide the second by the first and you get the aberration formula. Its inverse is the same formula with $\\beta \\to -\\beta$.</p>
<h3>Three readings of one formula</h3>
<p><strong>Crowding.</strong> Differentiating gives $d\\Omega\' = d\\Omega / D^2$. A patch of sky ahead shrinks by $D^2$, so stars there are packed $D^2$ times closer. Exactly half the sky lands inside $\\theta\' = \\arccos\\beta$. For large $\\gamma$ that angle is close to $1/\\gamma$ radians.</p>
<p><strong>No-shift ring.</strong> Setting $D = 1$ gives $\\cos\\theta\'_0 = (1 - 1/\\gamma)/\\beta$. This green ring splits the sky into blue ahead and red behind. It always lies ahead of 90°, because at exactly 90° you see the transverse Doppler shift $D = 1/\\gamma$, a pure time-dilation redshift.</p>
<p><strong>Searchlight.</strong> The combination $I_\\nu/\\nu^3$ is the same in every frame. So specific intensity scales as $I\'_\\nu = D^3 I_\\nu$, and brightness summed over all frequencies scales as $D^4$. The scene uses that bolometric $D^4$ law. It shows up in two parts: each star's flux grows as $D^2$ (the <b>Searchlight</b> toggle) and stars crowd together by another $D^2$ (the <b>Aberration</b> toggle). The glowing cubes and the faint sky glow are extended surfaces, so their brightness takes the full $D^4$ when searchlight is on.</p>
<h3>Colour</h3>
<p>A blackbody at temperature $T$, seen with Doppler factor $D$, is exactly a blackbody at $DT$. The code integrates Planck's law against the CIE 1931 colour matching functions and converts to sRGB. That gives a lookup table from 600 K to 600,000 K that the shaders read. A Sun-like star at 5800 K looks like 25,000 K dead ahead at $\\beta = 0.9$ and like 1300 K straight behind.</p>
<h3>How the flight view is drawn</h3>
<p>Every star is a point with a rest-frame direction, temperature and flux. A vertex shader moves it to its aberrated direction and colours it. The cubes are at rest in the star frame. For a static scene, what the moving observer sees is the view of a stationary observer at the same place and moment, with every direction aberrated. So the cube vertices are aberrated too. A full-screen shader runs the inverse map for each pixel to draw the faint sky glow.</p>`,
  deep: [
    {
      title: 'Lorentz contraction is invisible: Terrell and Penrose (1959)',
      html: `<p>For fifty years after 1905, books said that a fast sphere would look flattened. George Gamow's 1940 story <em>Mr Tompkins in Wonderland</em> even drew squashed cyclists. The contraction is real. It is what you get when you mark where every part of the object is <em>at one instant</em>. But a camera does not do that. It records the light that <em>arrives</em> at one instant, and light from different parts left at different times.</p>
<p>In 1959 James Terrell showed that for a small object the two effects combine into a rotation. Roger Penrose showed in the same year that the outline of a sphere is always a circle, at any speed. Anton Lampa had found a version of this in 1924, but his paper was forgotten.</p>
<p>The simplest case is a cube of side $s$ passing straight across your view. Light from the trailing face must travel an extra distance $s$, so it left earlier, when the cube was $\\beta s$ further back. You see that face with width $\\beta s$. The front face has its contracted width $s/\\gamma = s\\sqrt{1-\\beta^2}$. Those two widths, $\\sin\\alpha$ and $\\cos\\alpha$ with $\\sin\\alpha = \\beta$, are exactly what a cube turned by $\\alpha = \\arcsin\\beta$ shows. The test suite checks both widths against a direct retarded-time calculation.</p>
<p>The same result follows from aberration. In the cube's own frame the light that reaches you left at angle $\\theta_{\\text{obj}}$, with $\\cos\\theta_{\\text{obj}} = (\\cos\\theta + \\beta)/(1 + \\beta\\cos\\theta)$. You see the cube as it looks from that direction, placed at the lab angle $\\theta$. The <b>apparent rotation</b> readout shows $\\theta - \\theta_{\\text{obj}}$.</p>
<p>The rotation picture is exact only for small objects. Large ones also look curved and stretched. The Terrell view does not use the rotation formula at all. Its vertex shader solves the light-travel-time equation for every vertex, so these distortions appear on their own.</p>`,
    },
    {
      title: 'Starbows, Stargates and what you would really see',
      html: `<p>Science fiction often shows a rainbow ring of stars ahead of a fast ship, the <strong>starbow</strong>. The word was made popular by Frederik Pohl's 1972 story <em>The Gold at the Starbow's End</em>. The idea is that red-shifted stars sit near the edge and blue-shifted ones near the centre, making concentric bands of colour.</p>
<p>Careful calculations do not find a rainbow ring. John McKinley and Paul Doherty worked through it in the <em>American Journal of Physics</em> in 1979. Aberration pushes stars forward into a bright spot. The colours shift too, but real stars have broad spectra. A blueshifted blackbody still looks white or blue-white to the eye, not violet. Stars behind shift into the infrared and simply fade.</p>
<p>There is one honest twist. The eye sees a fixed band of wavelengths. As a Sun-like star's temperature rises, its visible light grows fast at first, then only in proportion to temperature. Meanwhile crowding shrinks its solid angle. A rough estimate for 5800 K stars says each single star looks brightest where $D$ is about 3. At $\\beta = 0.99$ that is a circle about 16° from the centre. The total glow of the sky still peaks dead ahead, because the stars are packed so densely there. So you might see a faint ring of the brightest individual stars around a glowing spot. It is not a rainbow.</p>
<p>The swirling tunnels of light in films are artistic choices. They come from motion blur or from other physics entirely, such as the hyperspace of a story.</p>`,
    },
    {
      title: 'Jets, blazars and faster-than-light illusions',
      html: `<p>Nature runs these effects for us. Many galaxies with feeding black holes shoot out narrow jets of plasma at speeds close to $c$. Martin Rees predicted in 1966 that such jets could seem to move faster than light. Radio astronomers saw it in the quasar 3C 279 in 1971.</p>
<p>The trick is light-travel time again. A blob moving at $\\beta$ at angle $\\theta$ to our line of sight appears to move across the sky at</p>
$$\\beta_{\\text{app}} = \\frac{\\beta\\sin\\theta}{1 - \\beta\\cos\\theta}$$
<p>The blob nearly keeps up with its own light, so a long stretch of travel is squeezed into a short stretch of arrival times. The maximum is $\\gamma\\beta$, at $\\cos\\theta = \\beta$. With $\\gamma = 10$ the blob seems to move at about $10c$. Hubble has tracked blobs in the jet of the galaxy M87 that seem to move at up to about six times light speed.</p>
<p>Beaming makes these jets lopsided. A continuous jet's flux scales as $D^{2+\\alpha}$ and a single blob's as $D^{3+\\alpha}$, where $\\alpha$ describes the slope of the spectrum. A jet aimed near us can be boosted hundreds or thousands of times. Its twin, pointing away, is dimmed just as strongly. That is why most jets look one-sided. When a jet points almost straight at us we call the source a <strong>blazar</strong>. Blazars are among the brightest and most variable objects in the sky, largely because of this boost.</p>`,
    },
    {
      title: 'The small-speed limit: Bradley and the classical picture',
      html: `<p>Aberration is not only a relativistic effect. James Bradley discovered it in 1729. Earth moves around the Sun at about 30 km/s, or $\\beta \\approx 10^{-4}$, so every star traces a small ellipse over a year. The largest shift is about 20.5 arcseconds. Bradley used it to measure the speed of light. The test suite reproduces the modern value of 20.496″ from the formula.</p>
<p>At small $\\beta$ the relativistic and classical formulas agree: the shift is $\\theta - \\theta\' \\approx \\beta\\sin\\theta$ and $D \\approx 1 + \\beta\\cos\\theta$. They part ways at order $\\beta^2$. The classical picture, shown on the left of the split view, adds velocities like Newton: light from direction $\\hat n$ seems to come from $\\hat n + \\beta\\hat f$. It crowds stars less, and it has no transverse Doppler shift. Relativity adds the factor $\\gamma$, which comes from time dilation.</p>
<p>At $\\beta = 0.9$ the classical picture puts a star from 90° at 48° and gives it no colour shift. Relativity puts it at 26° and redshifts it by $1/\\gamma \\approx 0.44$. Particle physics confirms relativity every day. Synchrotron light from fast electrons, for example, comes out in a narrow forward cone of width about $1/\\gamma$.</p>`,
    },
    {
      title: 'Limits of the picture',
      html: `<p><strong>Exactly at $\\beta = 1$.</strong> The whole sky would collapse to a point with infinite blueshift. Nothing with mass gets there. The slider stops at 0.99, where $\\gamma \\approx 7.09$ and $D$ ahead is about 14.</p>
<p><strong>Acceleration.</strong> The formulas describe an observer moving at a steady speed. The view depends only on your velocity at that moment, not on how you got there. So the scene is correct at each speed you pick.</p>
<p><strong>The cosmic microwave background.</strong> At $\\beta = 0.99$ the 2.7 K background ahead looks like 38 K. That is still far infrared. You would need $\\gamma$ of about 150 before it glowed a dull red ahead.</p>
<p><strong>Doppler and the eye.</strong> The colours shown are the true blackbody colours for the shifted temperature. Brightness uses the frequency-integrated $D^4$ law. A human eye only sees a narrow band, so the real visible brightness would change more slowly ahead and fade faster behind.</p>`,
    },
  ],
  challenges: [
    {
      id: 'crowd',
      title: 'Half the sky in 25°',
      prompt: 'At $\\beta = 0.9$ half of all stars sit within 25.8° of the direction of flight. Speed up a little, with aberration on, until at least 50% of the stars fall inside the amber 25° cone.',
      hint: 'Half the sky lands inside $\\arccos\\beta$. You need $\\arccos\\beta \\le 25°$, so $\\beta \\ge 0.907$. Watch the <b>stars in 25° cone</b> readout.',
      check: (s) => s.aber === true && (s.frac25 as number) >= 0.5,
    },
    {
      id: 'aberOnly',
      title: 'Aberration alone',
      prompt: 'Turn off the Doppler colour and the searchlight, keep aberration on, and fly at $\\beta \\ge 0.8$ in the flight view.',
      hint: 'Stars keep their own colours and brightness now. Only their positions change. This is the purely geometric part of the effect.',
      check: (s) => s.view === 'flight' && s.aber === true && s.doppler === false && s.beam === false && (s.beta as number) >= 0.8,
    },
    {
      id: 'terrell',
      title: 'The turning cube',
      prompt: 'In the Terrell view, make the cube look rotated by at least 45°.',
      hint: 'Raise the <b>object speed</b> to 0.7 or more. <b>Freeze mid-view</b> stops the cube with its seen image and its true contracted position on either side of the camera.',
      check: (s) => s.view === 'terrell' && (s.objBeta as number) >= 0.7 && (s.rotDeg as number) >= 45,
    },
    {
      id: 'noshift',
      title: 'No colour change',
      prompt: 'At $\\beta \\ge 0.3$, move the probe to the angle where the Doppler factor is 1, within 0.01.',
      hint: 'The green ring marks it. Its angle is $\\cos\\theta\'_0 = (1 - 1/\\gamma)/\\beta$, shown as the <b>no-shift angle</b> readout. At 90° you would still see a redshift of $1/\\gamma$.',
      check: (s) => s.touched === true && (s.beta as number) >= 0.3 && Math.abs((s.dProbe as number) - 1) < 0.01,
    },
  ],
  caveats: `<p>The stars are points at infinite distance, spread evenly over the sky with made-up temperatures and fluxes. The cubes glow like 5800 K blackbodies. Real stars have spectral lines and are not perfect blackbodies, so their shifted colours would differ a little.</p>
<p>Brightness follows the frequency-integrated $D^4$ law, not what a human eye would see in its narrow visible band. The display also has to squeeze a range of more than ten thousand in brightness into a screen, so it uses a soft saturation curve. Colours are true in hue but the brightness scale is compressed.</p>
<p>The glowing cubes are drawn by moving their vertices. Their straight edges stay straight between vertices, while real images of edges near the camera would curve slightly. The Terrell view solves the light-travel-time equation exactly for each vertex, but its colours are only labels for the faces. It leaves out Doppler colour and beaming of the moving objects.</p>
<p>The classical half of the split view is one possible Newtonian model: light as particles moving at $c$ relative to the stars. It is there for comparison. Experiments rule it out.</p>`,
  further: [
    { label: 'Terrell (1959), Invisibility of the Lorentz Contraction, Phys. Rev. 116, 1041', url: 'https://doi.org/10.1103/PhysRev.116.1041' },
    { label: 'Terrell rotation on Wikipedia', url: 'https://en.wikipedia.org/wiki/Terrell_rotation' },
    { label: 'Relativistic beaming on Wikipedia', url: 'https://en.wikipedia.org/wiki/Relativistic_beaming' },
    { label: 'Superluminal motion on Wikipedia', url: 'https://en.wikipedia.org/wiki/Superluminal_motion' },
  ],
};
