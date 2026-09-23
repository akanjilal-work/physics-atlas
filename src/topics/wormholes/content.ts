import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">General relativity lets space bend. Bend it hard enough and, on paper, it can form a tunnel. The tunnel links two far-apart regions, or even two separate universes. This tunnel is a <strong>wormhole</strong>.</p>
<p>Nobody can draw curved 3D space directly. So we do what is done for black holes: take a flat slice through the middle and show how it curves. For the simplest wormhole that slice is a <strong>double trumpet</strong>. Our universe is the top sheet. The other universe is the bottom sheet. The two meet at a narrowest circle, the <strong>throat</strong>, of radius $b_0$.</p>
<p>Light travels on the straightest paths across that surface. A ray aimed close to the centre slips through the throat and comes out in the other universe. A ray aimed a bit wider climbs partway down, turns around and comes back. The dividing line is sharp. A ray whose miss distance, its <strong>impact parameter</strong> $b$, is smaller than $b_0$ gets through. A larger $b$ bounces back.</p>
<p>That sets what you would see. Look at a wormhole and it looks like a round window, or a crystal ball. Through the window you see the other universe's sky, squeezed into a disc. Around the rim both skies pile up in thinner and thinner rings. On the right of the scene, warm stars are our sky and the cool grid is the other one. Press <b>Fly through</b> and the camera goes to the other side.</p>
<p>One big catch. Holding a throat open takes matter with negative energy, as seen by a passing light ray. No ordinary matter behaves that way. Wormholes are allowed by the equations. Nobody knows how to build one, and there is no evidence that any exist.</p>`,
  tryFirst: [
    'Watch the white probe ray on the double trumpet. Its $b$ is below $b_0$, so it passes the throat and runs down onto the lower sheet.',
    'Drag <b>Probe impact parameter b</b> above $b_0$. The ray now turns back. The inset shows why: the line $1/b^2$ no longer clears the hump.',
    'Press <b>Fly through</b>. The circle of cool grid grows until it fills the view. At the end the camera turns round to look back at our warm stars.',
    'Drag inside the camera view to look around. Look away from the throat and you see only our own sky.',
  ],
  equation: {
    tex: 'ds^2 = -c^2dt^2 + d\\ell^2 + (b_0^2+\\ell^2)\\,d\\Omega^2',
    caption: 'The Ellis–Bronnikov wormhole, the simplest Morris–Thorne wormhole. Here $\\ell$ is proper radial distance and runs from $-\\infty$ (other universe) through the throat at $\\ell = 0$ to $+\\infty$ (our universe). The scene sets $G = c = 1$.',
    terms: [
      { tex: '-c^2dt^2', name: 'Time part', meaning: 'Clocks tick at the same rate everywhere. There is no gravitational redshift and no pull. This wormhole has zero mass, so far-off light bends only by $\\pi b_0^2/4b^2$.', param: 'alpha' },
      { tex: 'd\\ell^2', name: 'Proper radial distance', meaning: 'Distance measured with a ruler along the radial direction. The camera sits at $\\ell_{\\rm cam}$. Negative values are on the other side.', param: 'lcam' },
      { tex: 'b_0', name: 'Throat radius', meaning: 'The radius of the narrowest circle. Rays with $b < b_0$ cross. From the camera the throat covers an angle with $\\sin\\theta_t = b_0/r_{\\rm cam}$.', param: 'b0' },
      { tex: '(b_0^2+\\ell^2)', name: 'Areal radius squared', meaning: '$r(\\ell)^2$: a sphere at distance $\\ell$ has area $4\\pi r^2$. It shrinks to $b_0$ at the throat and grows again on the far side.', param: 'rcam' },
      { tex: 'd\\Omega^2', name: 'Angles on the sky', meaning: 'The usual $d\\theta^2 + \\sin^2\\theta\\,d\\phi^2$. The scene works in the plane of each ray, so only $\\phi$ matters.', param: 'throat' },
    ],
  },
  physicsNotes: `
<h3>The embedding diagram</h3>
<p>Take the slice $t = $ const, $\\theta = \\pi/2$. Its metric is $d\\ell^2 + r(\\ell)^2 d\\phi^2$. We want a surface of revolution in flat 3D space, $(r(\\ell), z(\\ell))$, with the same metric. That needs $dr^2 + dz^2 = d\\ell^2$. With $r = \\sqrt{b_0^2+\\ell^2}$ we get $dr/d\\ell = \\ell/r$, so $dz/d\\ell = b_0/r$ and</p>
$$z(\\ell) = b_0\\,\\operatorname{asinh}(\\ell/b_0).$$
<p>That is the double trumpet, a catenoid. Because $g_{tt} = -1$ everywhere, light rays are exactly the geodesics of this surface. The rays drawn on it are real light paths, not a cartoon.</p>
<h3>Light rays and the impact parameter</h3>
<p>The metric does not depend on $t$ or $\\phi$, so a ray has a conserved energy $E$ and angular momentum $L$. Their ratio is the impact parameter $b = L/E$. The null condition gives</p>
$$\\left(\\frac{d\\ell}{d\\lambda}\\right)^2 = E^2\\left(1 - \\frac{b^2}{b_0^2+\\ell^2}\\right).$$
<p>The ray turns where $r(\\ell) = b$. That point exists only when $b \\ge b_0$. So rays with $b < b_0$ cross and rays with $b > b_0$ turn back at $\\ell_t = \\sqrt{b^2 - b_0^2}$. At exactly $b = b_0$ the ray creeps up to the throat and circles it. The throat is an unstable photon orbit.</p>
<p>The swept angle comes out as elliptic integrals. A ray that turns back sweeps $2K(b_0/b)$, so it is deflected by $\\alpha = 2K(b_0/b) - \\pi$. Far away this is $\\alpha \\approx \\pi b_0^2/4b^2$. It falls as $1/b^2$, not $1/b$ like a star. There is no mass term. The <b>RK4 b drift</b> readout integrates the second-order geodesic equations directly and checks that $b = r^2\\,d\\phi/dt$ stays fixed.</p>
<h3>What the camera sees</h3>
<p>A static camera at $\\ell_{\\rm cam}$ receives a ray at angle $\\theta$ from the throat direction. That ray has $b = r_{\\rm cam}\\sin\\theta$. So the throat edge, $b = b_0$, sits at $\\sin\\theta_t = b_0/r_{\\rm cam}$. Every pixel inside that circle shows the other universe. For each $\\theta$ the scene computes the total angle $\\Phi$ the ray sweeps on its way to the far sky, using Carlson's form of the elliptic integrals. The table goes to the GPU as a float texture and is rebuilt whenever $b_0$ or $\\ell_{\\rm cam}$ changes, every frame during a fly-through.</p>`,
  deep: [
    {
      title: 'Einstein–Rosen bridges: the first wormhole could not be crossed',
      html: `<p>In 1935 Albert Einstein and Nathan Rosen noticed that the Schwarzschild solution can be written as two identical outside regions joined at the horizon. They called the join a "bridge" and hoped it could model a particle. The idea of a particle did not work out, but the geometry was real. John Wheeler later coined the word <strong>wormhole</strong> in the 1950s.</p>
<p>The Einstein–Rosen bridge is not a tunnel you can use. In 1962 Robert Fuller and John Wheeler showed that the bridge is dynamical. It opens and pinches off again so fast that not even light can get from one side to the other. Anything that tries ends up in the black hole's singularity. In today's language, the bridge is the full Schwarzschild spacetime, and the two outside regions are causally cut off from each other.</p>
<p>The Ellis–Bronnikov wormhole in this scene is different. It has no horizon and it does not change with time. It was found independently by Homer Ellis and by Kirill Bronnikov in 1973. It needs a scalar field with the wrong sign of kinetic energy to hold it up.</p>`,
    },
    {
      title: 'Morris, Thorne and the price of a traversable wormhole',
      html: `<p>In 1985 Carl Sagan asked Kip Thorne for a scientifically sound way for his heroine in the novel <em>Contact</em> to cross the galaxy. Thorne and his student Michael Morris took the question seriously. In 1988 they published "Wormholes in spacetime and their use for interstellar travel" in the <em>American Journal of Physics</em>. They did the calculation backwards. First pick a shape you would like, with no horizon and gentle tidal forces. Then use Einstein's equations to find the matter it needs.</p>
<p>The answer is the problem. For the metric in this scene the Einstein equations give an energy density and a radial pressure of</p>
$$\\rho = p_r = -\\frac{b_0^2}{8\\pi r^4} \\quad (G = c = 1).$$
<p>So $\\rho + p_r = -b_0^2/(4\\pi r^4) < 0$. This breaks the <strong>null energy condition</strong>, which says that any light ray should see a non-negative energy density. It is not special to this example. Any static wormhole throat must flare outward, and that flaring requires the null energy condition to fail there. Matter that does this is called <strong>exotic</strong>.</p>
<p>The amounts are extreme. In ordinary units the radial tension at the throat is $c^4/(8\\pi G b_0^2)$. For a 1 metre throat that is about $5 \\times 10^{42}$ pascals.</p>
<p>Quantum fields can have negative energy in small patches. The Casimir effect between two metal plates is the standard example. But "quantum inequalities" found by Larry Ford, Thomas Roman and others limit how negative it can be and for how long. Whether any physics allows a large, lasting wormhole is an open question. Most physicists think probably not.</p>`,
    },
    {
      title: 'How the lensed sky is computed',
      html: `<p>Each pixel on the right is a direction on the camera's sky. From its angle $\\theta$ to the throat direction the shader gets $b = r_{\\rm cam}\\sin\\theta$. Then it needs $\\Phi$, the angle the ray sweeps between the camera and the far sky. For a ray that crosses, with $k = b/b_0$ and $a = \\sqrt{b_0^2 - b^2}$,</p>
$$\\Phi = k\\left[K(k) + F\\!\\left(\\arctan\\tfrac{\\ell_{\\rm cam}}{a},\\,k\\right)\\right].$$
<p>For a ray that turns back, with $k = b_0/b$, it is $K(k) + F(\\psi, k)$, where $\\sin^2\\psi = (r_{\\rm cam}^2 - b^2)/(r_{\\rm cam}^2 - b_0^2)$. The far-sky direction is then $\\cos\\Phi\\,\\hat e_{\\rm cam} + \\sin\\Phi\\,\\hat e_\\perp$ in the plane of the ray. Near the throat edge $\\Phi$ grows without bound like a logarithm. So each sky appears again and again in thinner rings around the rim. The shader blends those rings to their average colour once they are smaller than a pixel.</p>
<p>This is the same method Thomas Müller used in "Visual appearance of a Morris–Thorne wormhole" (<em>Am. J. Phys.</em> 72, 1045, 2004). The camera here is static, so there is no aberration or Doppler shift from its motion, even during the fly-through.</p>`,
    },
    {
      title: 'Interstellar and DNGR',
      html: `<p>Kip Thorne was a scientific adviser and executive producer for Christopher Nolan's film <em>Interstellar</em> (2014). The visual effects company Double Negative built a renderer called DNGR (Double Negative Gravitational Renderer). It traces light beams through curved spacetime to make the film's black hole and wormhole images.</p>
<p>In 2015 Oliver James, Eugenie von Tunzelmann, Paul Franklin and Kip Thorne described the wormhole in "Visualizing Interstellar's Wormhole" (<em>Am. J. Phys.</em> 83, 486). They started from the Ellis wormhole in this scene. They found it too limited, so they added two more parameters: the length $2a$ of a cylindrical middle section, and a lensing width $W$ set by a mass-like term that gives the wormhole gravity. Nolan chose a very short wormhole, $2a = 0.01\\rho$, and a modest $W = 0.05\\rho$, where $\\rho$ is the throat radius. The result is the "crystal ball" seen in the film, with a distorted image of a distant galaxy inside it. You can see the same crystal ball in this scene.</p>`,
    },
    {
      title: 'ER = EPR and quantum wormholes (speculative)',
      html: `<p>In 2013 Juan Maldacena and Leonard Susskind proposed <strong>ER = EPR</strong>. It suggests that two entangled systems (EPR, after Einstein, Podolsky and Rosen) are connected by some kind of Einstein–Rosen bridge (ER). For two entangled black holes the bridge would be a real, non-traversable wormhole. For a pair of entangled particles it would be a tiny quantum version with no classical geometry. This is a conjecture. It is inspired by the holographic duality between gravity and quantum systems. It has not been tested by experiment.</p>
<p>In 2016 Ping Gao, Daniel Jafferis and Aron Wall showed that, in that holographic setting, a quantum coupling between the two ends can make such a wormhole briefly traversable. The quantum effects supply the needed negative energy. It never beats a signal sent the ordinary way outside.</p>
<p>In 2022 a team led by Jafferis ran a teleportation protocol on Google's Sycamore quantum processor. It is related to this traversable-wormhole picture in a simplified model. Some press coverage said a wormhole had been made. It had not. No spacetime was created, and other researchers have disputed how well the small model captures wormhole physics.</p>`,
    },
  ],
  challenges: [
    {
      id: 'send-through',
      title: 'Send a ray through',
      prompt: 'Launch the probe ray so that it passes the throat and ends up in the other universe.',
      hint: 'Set the probe impact parameter b below the throat radius b0, then press Send ray.',
      check: (s) => s.probeUser === true && s.probeCrossed === true,
    },
    {
      id: 'critical',
      title: 'Find the critical ray',
      prompt: 'Launch a ray whose impact parameter is within 1% of the throat radius. Watch it wind around the throat before it decides.',
      hint: 'Read b0 from its slider and set b to the same value. The inset line should just touch the top of the hump.',
      check: (s) => s.probeUser === true && typeof s.bErr === 'number' && s.bErr < 0.01,
    },
    {
      id: 'fly',
      title: 'Fly to the other side',
      prompt: 'Move the camera through the throat into the other universe.',
      hint: 'Press Fly through, or drag the camera distance slider below zero.',
      check: (s) => s.camMoved === true && typeof s.lCam === 'number' && s.lCam < -1,
    },
    {
      id: 'double',
      title: 'Double the throat',
      prompt: 'Double the throat radius from its starting value of 1. The window onto the other sky should grow.',
      hint: 'Drag Throat radius b0 up to 2 and compare the throat angle readout.',
      check: (s) => typeof s.b0 === 'number' && s.b0 >= 1.999,
    },
  ],
  caveats: `<p>The Ellis–Bronnikov wormhole is an exact solution of Einstein's equations, but only with exotic matter that breaks the null energy condition at the throat and around it. No known material or field can supply it in the amounts needed. The solution is also thought to be unstable: small disturbances make it collapse or blow up. It has zero mass, so it has no gravitational pull, unlike the wormhole in <em>Interstellar</em>. The camera is static. A real traveller would see extra aberration and Doppler shifts from their own motion, which the fly-through leaves out. The skies are made up patterns at infinite distance, so there is no parallax. The embedding diagram shows only a 2D slice of 3D space. Wormholes are purely theoretical. There is no observational evidence for any, and no known way to make one.</p>`,
  further: [
    { label: 'Morris & Thorne (1988), Wormholes in spacetime and their use for interstellar travel', url: 'https://doi.org/10.1119/1.15620' },
    { label: 'James, von Tunzelmann, Franklin & Thorne (2015), Visualizing Interstellar\u2019s Wormhole (arXiv)', url: 'https://arxiv.org/abs/1502.03809' },
    { label: 'Maldacena & Susskind (2013), Cool horizons for entangled black holes (arXiv)', url: 'https://arxiv.org/abs/1306.0533' },
    { label: 'Wikipedia: Wormhole', url: 'https://en.wikipedia.org/wiki/Wormhole' },
  ],
};
