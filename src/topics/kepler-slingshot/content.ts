import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A planet does not move at a steady pace. It hurries when it is close to the Sun and dawdles when it is far away. Johannes Kepler found the rule behind this in 1609, and it still steers every spacecraft we launch.</p>
<p>Start with the <strong>Kepler</strong> view. The probe runs around an ellipse with the Sun at one focus. The shaded wedges each cover the same stretch of time. Near the Sun the wedges are short and fat. Far away they are long and thin. Yet every wedge has the same area. A line from the Sun to the probe sweeps out <strong>equal areas in equal times</strong>.</p>
<p>The <strong>Hohmann</strong> view shows the cheapest simple way to move between two circular orbits. Fire the engine once to stretch the orbit into an ellipse. Coast halfway round. Fire again at the far end to make the orbit round again.</p>
<p>The <strong>Slingshot</strong> view holds the surprise. A probe flies close behind a moving planet and leaves faster than it came, with no fuel burned. How? Look at both panels. Seen from the planet, the probe falls in and climbs back out at <em>the same speed</em>. Only its direction changes. Seen from the Sun, that change of direction lines the probe's velocity up with the planet's own motion, and the speeds add. The planet pays for it by slowing down, but by an amount far too small to measure.</p>
<p>This trick sent Mariner 10 to Mercury and carried the two Voyagers past the giant planets and out of the Solar System.</p>`,
  tryFirst: [
    'In the <b>Kepler</b> view, drag <b>Eccentricity</b> up to 0.8. The perihelion wedge (A₁) and the aphelion wedge (A₂) look nothing alike, yet the <b>area ratio</b> stays at 1.',
    'Set <b>Semi-major axis</b> to 1.0. The probe and the planet now share one period, even though one orbit is round and the other is stretched.',
    'Switch to <b>Hohmann</b>. The probe waits for the right moment, burns, coasts, and burns again to arrive with the planet.',
    'Switch to <b>Slingshot</b> and watch the speed inset. In the planet frame (cyan) the speed goes up and comes back down to where it started. In the Sun frame (amber) it steps up and stays up.',
  ],
  equation: {
    tex: 'v^2 = GM\\left(\\frac{2}{r} - \\frac{1}{a}\\right)',
    caption: 'The vis-viva equation. It gives the speed anywhere on any orbit from just two lengths: where you are, and how big the orbit is.',
    terms: [
      { tex: 'v', name: 'Speed', meaning: 'The probe’s speed relative to the Sun, right now. It peaks at perihelion and bottoms out at aphelion.', param: 'v' },
      { tex: 'GM', name: 'Sun’s pull', meaning: 'Newton’s constant times the Sun’s mass. Here it is set to 1, which also sets the planet’s year to $2\\pi$ time units.', param: 'period' },
      { tex: 'r', name: 'Distance', meaning: 'The current distance from the Sun. A smaller $r$ means a faster probe.', param: 'r' },
      { tex: 'a', name: 'Semi-major axis', meaning: 'Half the long width of the ellipse. It alone fixes the orbital energy $-GM/2a$ and the period $T = 2\\pi\\sqrt{a^3/GM}$.', param: 'a' },
    ],
  },
  physicsNotes: `
<h3>Where vis-viva comes from</h3>
<p>Energy per unit mass is conserved on an orbit: $\\tfrac12 v^2 - GM/r = \\varepsilon$. For a closed orbit $\\varepsilon = -GM/2a$. Put the two together and you get the headline equation. At perihelion and aphelion, $r = a(1\\mp e)$, so the speed ratio is</p>
$$\\frac{v_p}{v_a} = \\frac{1+e}{1-e}.$$
<p>Angular momentum per unit mass, $h = |\\mathbf r \\times \\mathbf v|$, is also conserved. The area swept per unit time is $h/2$, and that is Kepler’s second law. Dividing the ellipse’s area $\\pi a b$ by $h/2$ gives the third law, $T^2 = 4\\pi^2 a^3 / GM$.</p>
<h3>Hohmann transfer</h3>
<p>From a circle of radius $r_1$ to one of radius $r_2$, the transfer ellipse has $a_T = (r_1+r_2)/2$. Vis-viva gives both burns:</p>
$$\\Delta v_1 = \\sqrt{\\tfrac{GM}{r_1}}\\left(\\sqrt{\\tfrac{2r_2}{r_1+r_2}}-1\\right),\\qquad \\Delta v_2 = \\sqrt{\\tfrac{GM}{r_2}}\\left(1-\\sqrt{\\tfrac{2r_1}{r_1+r_2}}\\right).$$
<p>For Earth to Mars that is about 2.95 km/s and then 2.65 km/s, with a coast of about 259 days. Those numbers ignore climbing out of Earth’s own gravity.</p>
<h3>Gravity assist in two frames</h3>
<p>In the planet’s frame the probe follows a hyperbola with eccentricity $e = 1 + r_p v_\\infty^2/GM_p$. It arrives and leaves with the same speed $v_\\infty$, turned through an angle $\\delta$ with</p>
$$\\sin\\frac{\\delta}{2} = \\frac{1}{e}.$$
<p>Back in the Sun’s frame, $\\mathbf V = \\mathbf V_p + \\mathbf v_\\infty$. The heliocentric energy changes by $\\Delta\\varepsilon = \\mathbf V_p\\cdot(\\mathbf v_{out} - \\mathbf v_{in})$. It is positive when the probe passes <em>behind</em> the planet and negative when it passes in front. This is the <strong>patched-conic</strong> picture.</p>
<h3>How the simulation checks it</h3>
<p>The Slingshot view does not assume the patched-conic answer. It integrates the Sun, the planet and the probe together with Yoshida’s fourth-order symplectic method, taking small steps near the planet. The readouts compare the numerical energy change with the patched-conic formula. For fast flybys they agree to a few percent.</p>`,
  deep: [
    {
      title: 'Kepler and Newton',
      html: `<p>Kepler worked from Tycho Brahe’s careful naked-eye measurements of Mars. In <em>Astronomia Nova</em> (1609) he published his first two laws: orbits are ellipses with the Sun at one focus, and the Sun-planet line sweeps equal areas in equal times. Ten years later, in <em>Harmonices Mundi</em> (1619), he added the third: the square of the period is proportional to the cube of the orbit’s size.</p>
<p>Kepler had rules but no cause. Isaac Newton supplied it in the <em>Principia</em> (1687). He showed that an inverse-square force toward the Sun produces all three laws. The equal-areas law is the simplest. It holds for <em>any</em> force that points toward a fixed centre, because such a force cannot change angular momentum.</p>`,
    },
    {
      title: 'Why the slingshot does not break energy conservation',
      html: `<p>In the planet’s frame nothing is gained. The probe enters and leaves at the same speed. The gain appears only in the Sun’s frame, and it comes from the planet.</p>
<p>Momentum is shared out in the encounter. Whatever momentum the probe gains along the planet’s path, the planet loses. The planet is enormously heavier, so its change of speed is tiny. Take a 1-tonne probe that gains 10 km/s at Jupiter ($1.9\\times10^{27}$ kg). Jupiter slows by roughly $10^{3}\\times10^{4}/(1.9\\times10^{27}) \\approx 5\\times10^{-21}$ m/s. No instrument could detect that.</p>
<p>In this simulation the probe is treated as massless, so the planet does not slow at all. That is an excellent approximation, not an exact statement.</p>`,
    },
    {
      title: 'Mariner 10 and the Voyager grand tour',
      html: `<p>In the early 1960s, Michael Minovitch at JPL worked out how planetary flybys could redirect spacecraft. The first mission to use a planet this way was <strong>Mariner 10</strong>. It flew past Venus on 5 February 1974 and used that encounter to <em>lose</em> heliocentric speed and fall inward to Mercury, which it first passed on 29 March 1974.</p>
<p>In 1965 Gary Flandro, also at JPL, noticed that Jupiter, Saturn, Uranus and Neptune would line up in the late 1970s so that one spacecraft could visit all four. Such an alignment comes round only about once every 175 years. <strong>Voyager 2</strong>, launched in August 1977, made that grand tour: Jupiter in 1979, Saturn in 1981, Uranus in 1986 and Neptune in 1989. <strong>Voyager 1</strong> passed Jupiter and Saturn and is now in interstellar space.</p>`,
    },
    {
      title: 'The Oberth effect, in brief',
      html: `<p>A rocket burn of fixed $\\Delta v$ adds kinetic energy $\\Delta(\\tfrac12 v^2) = v\\,\\Delta v + \\tfrac12 \\Delta v^2$. The faster you are already going, the more energy the same burn buys. Hermann Oberth pointed this out in the 1920s.</p>
<p>So the best place to burn is deep in a gravity well, at periapsis, where the probe is fastest. A burn during a close planetary flyby combines both tricks. The Hohmann transfer uses the same idea: both burns happen at the ends of the ellipse, where they change the orbit’s energy most efficiently.</p>`,
    },
    {
      title: 'When the patched-conic picture fails',
      html: `<p>Patched conics split the trip into pieces. Near the planet, only the planet pulls. Far away, only the Sun pulls. That works when the encounter is short compared with the planet’s orbit. Then the planet barely turns during the flyby.</p>
<p>Try a slow flyby with $v_\\infty$ near 0.2 in the Slingshot view. The encounter lasts longer, the Sun’s pull matters during the pass, and the numerical and patched-conic answers drift apart by 10% or more. Very slow encounters can even capture the probe for a while. Real mission design starts with patched conics and then refines the path with full numerical integration, as this page does.</p>`,
    },
  ],
  challenges: [
    {
      id: 'equal-areas',
      title: 'Equal areas at the extreme',
      prompt: 'In the Kepler view, push eccentricity to 0.7 or more. Confirm that the perihelion wedge A₁ and the aphelion wedge A₂ still match to within 1%.',
      hint: 'Drag the eccentricity slider right and read the area ratio. The wedges look wildly different but cover the same time.',
      check: (s) => s.view === 'kepler' && (s.e as number) >= 0.7 && Math.abs((s.areaRatio as number) - 1) < 0.01,
    },
    {
      id: 'hohmann-double',
      title: 'Twice as wide',
      prompt: 'In the Hohmann view, complete a transfer to an orbit twice the starting radius. The final orbit must be circular (e below 0.03).',
      hint: 'Set the target radius to 2.00. With auto burns on, wait for both burns. In manual mode, fire burn 2 right at the far end of the ellipse.',
      check: (s) => s.view === 'hohmann' && s.hohDone === true && Math.abs((s.r2 as number) - 2) <= 0.05,
    },
    {
      id: 'speed-up',
      title: 'Free speed',
      prompt: 'In the Slingshot view, gain more than 30% in heliocentric speed from a single flyby.',
      hint: 'Pass behind the planet. Aim the incoming velocity backwards (approach angle above 110°) and let the planet turn it forwards.',
      check: (s) => s.view === 'slingshot' && s.flyDone === true && s.touched === true && (s.gain as number) > 0.3,
    },
    {
      id: 'slow-down',
      title: 'Brake like Mariner 10',
      prompt: 'Use a flyby to lose at least 10% of the probe’s heliocentric speed.',
      hint: 'Switch the swing direction so the probe passes in front of the planet. The planet then turns the velocity against its own motion.',
      check: (s) => s.view === 'slingshot' && s.flyDone === true && s.touched === true && (s.gain as number) < -0.1,
    },
  ],
  caveats: `<p>Everything is flat and Newtonian. The Kepler and Hohmann views use a fixed Sun and a single probe. The planet in the Kepler view is only a reference and does not pull the probe. Burns are instant, so the Hohmann view ignores finite burn times and escaping from a planet’s own gravity.</p>
<p>The Slingshot planet has Jupiter’s mass ratio to the Sun (0.001) and a radius close to Jupiter’s relative to its orbit, placed at 1 orbit unit for simplicity. The probe is massless, so the planet does not actually slow down here. The planet frame panel is not to scale with the Sun frame: it is magnified hundreds of times, and playback slows down near the planet so the flyby is visible.</p>`,
  further: [
    { label: 'Kepler’s laws of planetary motion (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Kepler%27s_laws_of_planetary_motion' },
    { label: 'Gravity assist (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Gravity_assist' },
    { label: 'Mariner 10 (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Mariner_10' },
    { label: 'Hohmann transfer orbit (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Hohmann_transfer_orbit' },
  ],
};
