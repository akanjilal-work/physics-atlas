import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Wiggle an electric charge and a ripple runs out from it at the speed of light. That ripple is light. It needs no water, no air and no medium at all. It carries itself.</p>
<p>Here is how. A changing electric field makes a magnetic field. A changing magnetic field makes an electric field. Each one keeps the other going, and the pair races forward together. In the first view the <strong style="color:#ff7a45">red-orange arrows</strong> are the electric field $\\mathbf E$ and the <strong style="color:#5b9dff">blue arrows</strong> are the magnetic field $\\mathbf B$. They are always at right angles to each other and to the direction of travel.</p>
<p>The surprise came in 1865. James Clerk Maxwell wrote down the rules for electricity and magnetism and found they allowed waves. He worked out their speed from two numbers measured with coils and capacitors on a lab bench. No light was involved. The answer matched the speed of light. Light, he concluded, is an electromagnetic wave.</p>
<p>The direction the electric field points is the wave's <em>polarization</em>. It can swing back and forth in a line, or twirl in a circle so the arrow tips trace a corkscrew. A polarizing filter lets through only the part along its axis. That is how polarized sunglasses cut glare and how every LCD screen makes its pixels dark or bright.</p>
<p>The last view shows the deepest reason light exists. A charge carries its field lines with it. Stop the charge suddenly and the news that it stopped spreads outward at speed $c$. Outside that news the field still points to where the charge <em>would</em> have been. Where the old and new fields meet, the lines have a kink. That kink, flying outward, is a pulse of light.</p>`,
  tryFirst: [
    'Pick <b>Circular</b> under Polarization. Watch the E arrows twist into a corkscrew while the head-on view in the corner draws a circle.',
    'Rotate the <b>polarizer angle</b>. The transmitted intensity follows cos²θ. At 90° from the light’s direction almost nothing gets through.',
    'Switch to <b>Dipole antenna</b>. Field lines pinch off the charge and fly away. Swing the probe up to the axis and the power drops to zero.',
    'Switch to <b>Kinked field lines</b>. Raise the charge speed and watch the kink sharpen. The lime segments are the radiation.',
  ],
  equation: {
    tex: '\\nabla^2\\mathbf E = \\mu_0\\varepsilon_0 \\frac{\\partial^2 \\mathbf E}{\\partial t^2} \\;\\Rightarrow\\; c = \\frac{1}{\\sqrt{\\mu_0\\varepsilon_0}}',
    caption: 'The wave equation that falls out of Maxwell’s equations in empty space. Its speed is fixed by two constants of electricity and magnetism.',
    terms: [
      { tex: '\\mathbf E', name: 'Electric field', meaning: 'The wave itself. The amplitude slider sets its peak value in volts per metre. The magnetic field follows with $|\\mathbf B| = |\\mathbf E|/c$.', param: 'amp' },
      { tex: '\\nabla^2', name: 'Curvature in space', meaning: 'How sharply the field bends from place to place. A shorter wavelength means more curvature.', param: 'lambda' },
      { tex: '\\frac{\\partial^2}{\\partial t^2}', name: 'Curvature in time', meaning: 'How sharply the field changes at one spot. It is set by the frequency $f = c/\\lambda$.', param: 'freq' },
      { tex: '\\varepsilon_0', name: 'Vacuum permittivity', meaning: 'Sets how strongly charges push on each other. Measured with capacitors, $8.854 \\times 10^{-12}$ F/m.', param: 'eps0' },
      { tex: '\\mu_0', name: 'Vacuum permeability', meaning: 'Sets how strongly currents push on each other. Measured with wires and coils, about $1.2566 \\times 10^{-6}$ N/A².', param: 'mu0' },
      { tex: 'c', name: 'Speed of light', meaning: 'Computed live from the two constants above. It comes out as 299 792 458 m/s.', param: 'c' },
    ],
  },
  physicsNotes: `
<h3>From Maxwell to the wave equation</h3>
<p>In empty space there are no charges or currents. Maxwell’s equations then read $\\nabla\\cdot\\mathbf E = 0$, $\\nabla\\cdot\\mathbf B = 0$, $\\nabla\\times\\mathbf E = -\\partial_t \\mathbf B$ and $\\nabla\\times\\mathbf B = \\mu_0\\varepsilon_0\\,\\partial_t \\mathbf E$. Take the curl of the third equation and use the fourth:</p>
$$\\nabla\\times(\\nabla\\times\\mathbf E) = -\\partial_t(\\nabla\\times\\mathbf B) = -\\mu_0\\varepsilon_0\\,\\partial_t^2\\mathbf E$$
<p>The identity $\\nabla\\times(\\nabla\\times\\mathbf E) = \\nabla(\\nabla\\cdot\\mathbf E) - \\nabla^2\\mathbf E$ and $\\nabla\\cdot\\mathbf E = 0$ give the headline equation. Any shape that travels at $c = 1/\\sqrt{\\mu_0\\varepsilon_0}$ solves it.</p>
<h3>Plane waves</h3>
<p>The simplest solution travels along $z$:</p>
$$E_x = a_x\\cos(kz - \\omega t),\\quad E_y = a_y\\cos(kz - \\omega t + \\delta),\\quad \\mathbf B = \\tfrac1c\\,\\hat{\\mathbf z}\\times\\mathbf E$$
<p>$\\nabla\\cdot\\mathbf E = 0$ forbids a component along $z$, so the wave is transverse. Faraday’s law then fixes $\\mathbf B$ at right angles to $\\mathbf E$ with $|\\mathbf B| = |\\mathbf E|/c$. The phase $\\delta$ and the ratio $a_y/a_x$ set the polarization. $\\delta = 0$ gives a line. $\\delta = \\pm 90^\\circ$ with $a_x = a_y$ gives a circle. Anything else is an ellipse.</p>
<h3>Energy flow</h3>
<p>The Poynting vector $\\mathbf S = \\mathbf E\\times\\mathbf B/\\mu_0$ gives the power per unit area and points along $\\mathbf k$. Its time average is $\\langle S\\rangle = \\varepsilon_0 c E_0^2/2$. A peak field of about 1000 V/m carries about 1.3 kW/m², close to the sunlight arriving above Earth’s atmosphere.</p>
<h3>Malus’s law</h3>
<p>An ideal polarizer passes the component of $\\mathbf E$ along its axis. For linear light at angle $\\theta$ to that axis the field drops by $\\cos\\theta$, so the intensity drops by $\\cos^2\\theta$. Circular light has no preferred direction, so any polarizer passes exactly half.</p>`,
  deep: [
    {
      title: 'Why accelerating charges radiate',
      html: `<p>A charge at rest has straight radial field lines. A charge moving at constant speed also has straight lines, pointing from its <em>present</em> position and squashed toward the plane perpendicular to the motion. Neither one radiates. Just switch to a frame where the charge is at rest.</p>
<p>Now stop the charge during a short time $\\tau$. News of the stop spreads at $c$. After time $t$, inside radius $r = c(t-\\tau)$ the lines are the new static ones. Outside $r = ct$ they still point to where the charge would be. Gauss’s law forces each inner line to join the matching outer line across a thin shell. There the field is almost sideways. Purcell’s geometry gives</p>
$$\\frac{E_\\perp}{E_r} = \\frac{a\\, r\\sin\\theta}{c^2}, \\qquad E_\\perp = \\frac{q\\,a\\sin\\theta}{4\\pi\\varepsilon_0 c^2 r}$$
<p>The radial Coulomb part falls like $1/r^2$ but the kink falls only like $1/r$. Far away the kink wins, and it carries energy to infinity. The field is proportional to the acceleration $a$, not the speed. Square it, multiply by $\\varepsilon_0 c$ and add up over a sphere to get the Larmor formula $P = q^2a^2/(6\\pi\\varepsilon_0 c^3)$. The construction goes back to J. J. Thomson. Edward Purcell’s textbook made it famous.</p>`,
    },
    {
      title: 'The oscillating dipole and the sin²θ doughnut',
      html: `<p>A charge oscillating along $z$ makes the dipole moment $p(t) = p_0\\cos\\omega t$. Its exact field has three parts that fall like $1/r^3$, $1/r^2$ and $1/r$. Only the $1/r$ part survives far away:</p>
$$E_\\theta = -\\frac{\\mu_0 p_0\\omega^2}{4\\pi}\\,\\frac{\\sin\\theta}{r}\\cos(kr - \\omega t)$$
<p>The time-averaged power per solid angle is $\\frac{dP}{d\\Omega} = \\frac{\\mu_0 p_0^2\\omega^4}{32\\pi^2 c}\\sin^2\\theta$. That is the doughnut in the scene. It is zero along the axis because the charge’s acceleration there points straight at you, and a field wave cannot point along its own direction of travel. Integrating over the sphere gives $P = \\mu_0 p_0^2\\omega^4/(12\\pi c)$, the time average of Larmor’s formula. The page checks this numerically.</p>
<p>The field lines in the slice are contours of $Q = \\sin^2\\theta\\,[\\sin(kr-\\omega t) + \\cos(kr-\\omega t)/(kr)]$. Near the charge they look like a static dipole. About a wavelength out they close into loops that detach and fly away. The $\\omega^4$ factor is why the sky is blue: air molecules act as tiny dipoles and scatter blue light much more than red.</p>`,
    },
    {
      title: 'History: Maxwell 1865, Hertz 1887',
      html: `<p>In 1856 Wilhelm Weber and Rudolf Kohlrausch compared electric and magnetic forces using a charged jar and a current. Their ratio had the units of a speed, close to $3\\times10^8$ m/s. In his 1865 paper <em>A Dynamical Theory of the Electromagnetic Field</em>, Maxwell showed that his equations predict waves moving at exactly this speed. It agreed closely with Fizeau’s measurement of the speed of light. He wrote that light is an electromagnetic disturbance.</p>
<p>The prediction waited over twenty years for a test. In 1887 Heinrich Hertz drove sparks across a gap and saw small sparks appear in a separate loop of wire across the room. Over the next two years he showed the invisible waves reflect, refract and can be polarized, just like light. His waves were radio waves. The unit of frequency now bears his name.</p>`,
    },
    {
      title: 'The electromagnetic spectrum',
      html: `<p>Nothing in the wave equation picks a wavelength. Every wavelength travels at $c$ in vacuum, with $f\\lambda = c$. We give the ranges different names because they interact with matter differently. The boundaries are conventions.</p>
<ul>
<li><b>Radio</b>, wavelengths from about a metre to kilometres. Made by currents in antennas.</li>
<li><b>Microwaves</b>, about a millimetre to a metre. Wi-Fi, radar, and the cosmic microwave background.</li>
<li><b>Infrared</b>, about 750 nm to 1 mm. Warm objects glow here.</li>
<li><b>Visible</b>, roughly 380 to 750 nm, frequencies near $5\\times10^{14}$ Hz. The wavelength slider covers most of this range.</li>
<li><b>Ultraviolet</b>, <b>X-rays</b> and <b>gamma rays</b>, shorter still. Made by electron transitions in atoms, fast electrons, and nuclei.</li>
</ul>
<p>An atom emitting visible light behaves much like the dipole in the second view. The atom is about a thousandth of the wavelength across, which is exactly the small-dipole limit.</p>`,
    },
    {
      title: 'Polarization in everyday life',
      html: `<p><b>Sunglasses.</b> Light reflected off water or a road at a glancing angle is partly polarized horizontally. Polarized sunglasses have a vertical transmission axis, so they block much of that glare while passing other light. Tilt your head while wearing them and the glare comes back.</p>
<p><b>LCD screens.</b> Each pixel sits between two polarizers. In the classic twisted-nematic design the polarizers are crossed, like the challenge below. A layer of liquid crystal twists the light’s polarization by 90° so it passes. A voltage untwists the crystal, and Malus’s law turns the pixel dark. Look at a phone or laptop screen through polarized sunglasses and rotate it to see this.</p>
<p><b>The sky.</b> Sunlight scattered by air molecules at 90° from the sun is strongly polarized, a direct consequence of the dipole doughnut. Some insects navigate by it.</p>`,
    },
  ],
  challenges: [
    {
      id: 'circular',
      title: 'Twist it',
      prompt: 'In the plane-wave view, make the light circularly polarized. The E-vector tip should trace a helix and the head-on view a circle.',
      hint: 'Equal amplitudes (Ey/Ex = 1) and a phase of +90° or −90°. The Circular preset does it for you.',
      check: (s) => s.view === 'plane' && Math.abs(s.circ as number) > 0.98,
    },
    {
      id: 'crossed',
      title: 'Crossed polarizer',
      prompt: 'Block the wave. Get the transmitted intensity below 1% with the polarizer in place.',
      hint: 'Make the light linear first (δ = 0). Then rotate the polarizer to 90° from the light’s direction. Circular light always gets half through.',
      check: (s) => s.view === 'plane' && s.polarizerOn === true && (s.trans as number) < 0.01,
    },
    {
      id: 'null',
      title: 'The silent direction',
      prompt: 'In the dipole view, point the probe in the direction where the antenna sends out no radiation.',
      hint: 'Radiation goes as sin²θ. Where is sin θ zero?',
      check: (s) => s.view === 'dipole' && ((s.probeTheta as number) <= 5 || (s.probeTheta as number) >= 175),
    },
    {
      id: 'kink',
      title: 'Catch the kink',
      prompt: 'In the kink view, set the probe radius to 5 or more and watch the kink shell pass through it.',
      hint: 'Move the probe radius slider, then wait. The shell grows at the speed of light. Press Replay if you like.',
      check: (s) => s.view === 'kink' && (s.probeR as number) >= 5 && s.kinkPassed === true,
    },
  ],
  caveats: `<p>The plane wave is infinite and perfectly monochromatic. Real light comes in finite wave packets with a spread of frequencies, and sunlight is a random mix of polarizations. The polarizer is ideal: it passes its axis completely and blocks the other component completely. Real sheets pass a few percent less and leak a little.</p>
<p>The animation is slowed enormously. Visible light oscillates about $5\\times10^{14}$ times per second. The dipole is an ideal point dipole, much smaller than the wavelength. In the kink view the field lines across the shell are drawn as straight segments, which is exact only in the limit of a very brief stop. The inner and outer spheres are also treated as sharing a centre, which is fine when the stopping distance is small.</p>`,
  further: [
    { label: 'Maxwell, A Dynamical Theory of the Electromagnetic Field (1865)', url: 'https://doi.org/10.1098/rstl.1865.0008' },
    { label: 'Feynman Lectures, Vol. I, Ch. 28: Electromagnetic Radiation', url: 'https://www.feynmanlectures.caltech.edu/I_28.html' },
    { label: 'Larmor formula on Wikipedia', url: 'https://en.wikipedia.org/wiki/Larmor_formula' },
    { label: 'Polarization (waves) on Wikipedia', url: 'https://en.wikipedia.org/wiki/Polarization_(waves)' },
  ],
};
