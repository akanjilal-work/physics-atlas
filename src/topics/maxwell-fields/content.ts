import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">All of electricity, magnetism and light fits in four short rules. Each one is a statement about the shape of a field: where its lines start, whether they ever end, and what makes them curl.</p>
<p><strong>Rule one.</strong> Electric field lines start on positive charges and end on negative ones. Wrap any closed bag around some charges and count the lines poking out. The count tells you the charge inside, and nothing outside the bag matters. In the first view the <strong style="color:#ff7a45">orange lines</strong> come out of the charges and the <strong style="color:#a78bfa">violet bubble</strong> is the bag. Drag it around.</p>
<p><strong>Rule two.</strong> Magnetic field lines never start and never end. They always close into loops. So any closed bag has exactly as many <strong style="color:#5b9dff">blue lines</strong> going in as coming out. This is the same as saying there is no magnetic charge. Nobody has ever found one.</p>
<p><strong>Rule three.</strong> A changing magnetic field makes an electric field that curls around it. Push a magnet into a coil of wire and a current flows. Pull it out and the current flows the other way. The current always pushes back against the change. That is Lenz’s law, and it is why the third view shows the induced field pointing against the magnet’s.</p>
<p><strong>Rule four.</strong> An electric current makes a magnetic field that curls around it. Here is the surprise. A changing electric field does the same, even in empty space where no charge moves. In the last view the wire stops at a capacitor. No charge crosses the gap, yet the magnetic field keeps circling it. Maxwell added this term. With it, rules three and four feed each other, and the result is a wave that moves at the speed of light.</p>`,
  tryFirst: [
    'In the <b>∇·E</b> view, drag the violet sphere until it holds two charges. The flux readout jumps to their sum divided by ε₀.',
    'Switch the surface to a <b>Cube</b>. The flux does not change. Only the charge inside matters.',
    'In the <b>∇·B</b> view, drag the surface so it cuts through the loop. Green dots (out) and rose dots (in) pair up.',
    'In the <b>∇×E</b> view, make the velocity negative. Watch the EMF trace in the corner flip upside down.',
    'In the <b>∇×B</b> view, slide the loop to x = 0. The field still circles the gap, with no current inside the loop.',
  ],
  equation: {
    tex: '\\begin{aligned} \\nabla\\cdot\\mathbf E &= \\frac{\\rho}{\\varepsilon_0} & \\qquad \\nabla\\times\\mathbf E &= -\\frac{\\partial\\mathbf B}{\\partial t} \\\\[4pt] \\nabla\\cdot\\mathbf B &= 0 & \\qquad \\nabla\\times\\mathbf B &= \\mu_0\\mathbf J + \\mu_0\\varepsilon_0\\frac{\\partial\\mathbf E}{\\partial t} \\end{aligned}',
    caption: 'Maxwell’s equations in differential form, SI units. Two say how fields spread out from a point (divergence). Two say how they swirl around a point (curl).',
    terms: [
      { tex: '\\nabla\\cdot\\mathbf E', name: 'Divergence of E', meaning: 'Net outflow of E from a tiny region, per unit volume. The ∇·E view measures the integral version, $\\oint \\mathbf E\\cdot d\\mathbf A$, and divides it by $q_{enc}/\\varepsilon_0$.', param: 'lawE' },
      { tex: '\\frac{\\rho}{\\varepsilon_0}', name: 'Charge density', meaning: 'The source of E. Integrated over the volume it becomes the enclosed charge $q_{enc}/\\varepsilon_0$, shown live.', param: 'qenc' },
      { tex: '\\nabla\\cdot\\mathbf B = 0', name: 'No magnetic charge', meaning: 'B has no sources or sinks. The net flux through any closed surface is zero. The readout shows it computed numerically from Biot–Savart.', param: 'lawB' },
      { tex: '\\nabla\\times\\mathbf E', name: 'Curl of E', meaning: 'How much E swirls around a point. Around a whole coil its integral is the EMF, $-N\\,d\\Phi_B/dt$.', param: 'lawF' },
      { tex: '\\nabla\\times\\mathbf B', name: 'Curl of B', meaning: 'How much B swirls. Its integral round a loop is $\\oint\\mathbf B\\cdot d\\mathbf l$, computed numerically in the ∇×B view.', param: 'lawA' },
      { tex: '\\mu_0\\varepsilon_0\\frac{\\partial\\mathbf E}{\\partial t}', name: 'Displacement current', meaning: 'Maxwell’s addition. A changing E field acts like a current. Through a loop in the capacitor gap it equals $\\varepsilon_0\\,d\\Phi_E/dt$.', param: 'idisp' },
    ],
  },
  physicsNotes: `
<h3>Integral forms</h3>
<p>Each differential law has an integral twin. Stokes’ and Gauss’s theorems turn one into the other.</p>
$$\\oint_S \\mathbf E\\cdot d\\mathbf A = \\frac{q_{enc}}{\\varepsilon_0} \\qquad \\oint_S \\mathbf B\\cdot d\\mathbf A = 0$$
$$\\oint_C \\mathbf E\\cdot d\\mathbf l = -\\frac{d}{dt}\\int_S \\mathbf B\\cdot d\\mathbf A \\qquad \\oint_C \\mathbf B\\cdot d\\mathbf l = \\mu_0 I_{enc} + \\mu_0\\varepsilon_0\\frac{d}{dt}\\int_S \\mathbf E\\cdot d\\mathbf A$$
<p>The integral forms are what the scene measures. Closed surfaces go with divergence. Loops and the surfaces they bound go with curl.</p>
<h3>How the scene computes</h3>
<p><b>Gauss E.</b> The field is Coulomb’s law summed over the three charges. The flux is a numerical surface integral with composite Gauss–Legendre rules, about 18 000 points on the sphere and 55 000 on the cube. It matches $q_{enc}/\\varepsilon_0$ to one part in a million or better, unless a charge sits within a few centimetres of the surface.</p>
<p><b>Gauss B.</b> The loop is a 64-sided polygon. The Biot–Savart integral is done exactly along each straight side and summed. The bar magnet is eight such loops stacked into a short solenoid, which is how a uniformly magnetized bar behaves from the outside. The net flux comes out at rounding-error level, about $10^{-12}$ of the outward part or smaller.</p>
<p><b>Faraday.</b> The magnet is a point dipole $m$. The flux through one turn of radius $R$, with the dipole on the axis at distance $z$, is exactly $\\Phi = \\mu_0 m R^2 / \\left(2(R^2+z^2)^{3/2}\\right)$. The coil sums this over $N$ turns. The EMF is $-\\sum d\\Phi/dz \\cdot v$. A readout checks it against the frame-to-frame change in flux.</p>
<p><b>Ampère–Maxwell.</b> Along the wire $B = \\mu_0 I/(2\\pi s)$. In the gap the field $E = Q/(\\varepsilon_0\\pi a^2)$ grows at the rate $I/(\\varepsilon_0\\pi a^2)$. That gives $B = \\mu_0 I s/(2\\pi a^2)$ inside the plates and the wire value outside them. The circulation is a numerical line integral round the violet loop.</p>`,
  deep: [
    {
      title: 'Divergence and curl, seen with your eyes',
      html: `<p><b>Divergence</b> is net outflow per unit volume. Shrink a closed surface around a point and divide the flux by the enclosed volume:</p>
$$\\nabla\\cdot\\mathbf E = \\lim_{V\\to 0} \\frac{1}{V}\\oint_S \\mathbf E\\cdot d\\mathbf A$$
<p>Where field lines are born, divergence is positive. Where they die, it is negative. Where lines only pass through, it is zero, even if the field is strong and bending. In the first view, move a small sphere into empty space and the flux is zero. Put a charge inside and it is not.</p>
<p><b>Curl</b> is circulation per unit area. Shrink a small loop and divide $\\oint\\mathbf F\\cdot d\\mathbf l$ by its area. Picture a tiny paddle wheel dropped into the field. If it spins, the field has curl there. The magnetic field circling a wire has curl only inside the wire, where the current is. Outside, $B \\propto 1/s$ exactly balances the longer path, and a small loop that does not enclose the wire sees zero circulation.</p>
<p>The gap view shows the same thing inside the plates. There $B \\propto s$, which is the pattern of a solid rotation. The paddle wheel spins everywhere between the plates, driven by $\\partial\\mathbf E/\\partial t$.</p>`,
    },
    {
      title: 'Faraday, 1831',
      html: `<p>Michael Faraday found electromagnetic induction in 1831 at the Royal Institution in London. His first success, on 29 August, used two coils wound on an iron ring. Switching the current in one coil on or off made a brief current in the other. A steady current did nothing. Only change mattered. Later that autumn he produced a current by pushing a bar magnet into a coil, the experiment in the third view.</p>
<p>Faraday thought in pictures. He described the space around magnets as filled with “lines of force”. He said a current is induced when a wire cuts those lines. Today we say the flux through the circuit changes. Joseph Henry in the United States found induction independently at about the same time. Emil Lenz stated the rule for the direction of the current in 1834.</p>
<p>Lenz’s law is energy conservation in disguise. If the induced current helped the change instead of fighting it, a tiny push on the magnet would speed it up without limit. In the scene, the green arrow for the induced field always opposes the change in flux. As the north pole approaches, the coil acts like a north pole facing it, and the two repel.</p>`,
    },
    {
      title: 'Maxwell’s displacement current, 1861 to 1865',
      html: `<p>Ampère’s law without the new term says $\\oint\\mathbf B\\cdot d\\mathbf l = \\mu_0 I_{enc}$, where $I_{enc}$ is the current through any surface bounded by the loop. For a charging capacitor that fails. Take a loop round the wire. A flat disc bounded by it cuts the wire and counts the current $I$. A bag-shaped surface with the same rim can bulge through the gap and cut no wire at all. It counts zero. Same loop, two answers.</p>
<p>The fix follows from charge conservation, $\\nabla\\cdot\\mathbf J = -\\partial\\rho/\\partial t$. Take the divergence of the old law. The left side, $\\nabla\\cdot(\\nabla\\times\\mathbf B)$, is always zero. The right side, $\\mu_0\\nabla\\cdot\\mathbf J$, is not zero where charge piles up. Adding $\\mu_0\\varepsilon_0\\,\\partial\\mathbf E/\\partial t$ makes both sides agree, because Gauss’s law turns its divergence into $\\mu_0\\,\\partial\\rho/\\partial t$.</p>
<p>James Clerk Maxwell introduced the term in <em>On Physical Lines of Force</em> (1861 to 1862). He reasoned from a mechanical model of the vacuum filled with tiny vortices. In <em>A Dynamical Theory of the Electromagnetic Field</em> (1865) he dropped the model and kept the equations. The compact four-equation vector form used today came later, largely from Oliver Heaviside in the 1880s.</p>`,
    },
    {
      title: 'The unification that predicts light',
      html: `<p>In empty space $\\rho = 0$ and $\\mathbf J = 0$. The two curl equations then feed each other. A changing $\\mathbf B$ makes a curling $\\mathbf E$. A changing $\\mathbf E$ makes a curling $\\mathbf B$. Take the curl of Faraday’s law and use the Ampère–Maxwell law to get</p>
$$\\nabla^2\\mathbf E = \\mu_0\\varepsilon_0\\frac{\\partial^2\\mathbf E}{\\partial t^2}$$
<p>This is a wave equation with speed $1/\\sqrt{\\mu_0\\varepsilon_0} \\approx 3.00\\times10^8$ m/s. Both constants come from bench experiments with charges and currents. The speed matched the measured speed of light, and Maxwell concluded in 1865 that light is an electromagnetic wave. Heinrich Hertz made and detected such waves with sparks in 1887. Without the displacement current there is no wave. The <a href="#/t/em-waves">electromagnetic waves</a> page follows this story further.</p>`,
    },
    {
      title: 'Magnetic monopoles: an open question',
      html: `<p>$\\nabla\\cdot\\mathbf B = 0$ is an experimental fact, not a theorem. It says no isolated north or south pole has ever been seen. Cut a bar magnet in half and you get two smaller magnets, each with both poles.</p>
<p>Paul Dirac showed in 1931 that if even one magnetic monopole exists anywhere, electric charge must come in whole-number multiples of a basic unit. Charge is in fact quantized, which keeps the idea alive. Many grand unified theories also predict very heavy monopoles from the early universe.</p>
<p>Searches have looked in cosmic rays, in moon rock, in old minerals, and at particle colliders, including the MoEDAL experiment at CERN’s Large Hadron Collider. None has found a monopole. In 1982 Blas Cabrera recorded one event in a superconducting loop that looked like a monopole passing through. It was never repeated and is not accepted as a detection. Some materials called spin ices contain quasiparticles that behave like monopoles inside the crystal. They are collective effects of many spins, not free magnetic charges, and $\\nabla\\cdot\\mathbf B = 0$ still holds there.</p>`,
    },
  ],
  challenges: [
    {
      id: 'two-charges',
      title: 'Two for one',
      prompt: 'In the ∇·E view, enclose two or more charges. Read a numerical flux equal to their sum divided by ε₀.',
      hint: 'Make the surface bigger (about 1.6 m) and centre it between q1 and q2. Keep the charges off the surface itself.',
      check: (s) => s.view === 'gaussE' && (s.nEnc as number) >= 2 && (s.minGap as number) > 0.05 && (s.fluxErrE as number) < 0.01,
    },
    {
      id: 'zero-b',
      title: 'Nothing gets out',
      prompt: 'In the ∇·B view, move the surface so that a strong magnetic flux passes through it. Show the net flux stays zero.',
      hint: 'Drag the surface onto the loop, or put a cube around the magnet’s north pole. The outward part must be large, and the net must stay near zero.',
      check: (s) => s.view === 'gaussB' && s.bTouched === true && (s.fluxBOut as number) >= 0.08 * (s.bRef as number) && Math.abs(s.fluxB as number) <= 0.01 * (s.fluxBOut as number),
    },
    {
      id: 'flip',
      title: 'Push back',
      prompt: 'In the ∇×E view, pass the magnet through the coil in one direction, then reverse its motion. The EMF on approach should change sign.',
      hint: 'Leave Motion on “Pass through”. Wait for one pass, then drag the velocity slider below zero and wait for the next pass.',
      check: (s) => s.emfFlipped === true,
    },
    {
      id: 'gap',
      title: 'Current without charge',
      prompt: 'In the ∇×B view, put the loop inside the capacitor gap and find a circulation of B of at least half μ₀I, with no conduction current through the loop.',
      hint: 'Set the loop position near x = 0. Make the radius close to or larger than the plate radius, 1 m.',
      check: (s) => s.view === 'ampere' && s.loopInGap === true && Math.abs(s.current as number) > 0 && (s.circOverMuI as number) >= 0.5,
    },
  ],
  caveats: `<p>All fields here are static or slowly changing. The Faraday and capacitor scenes use the quasi-static limit. They ignore the time light takes to cross the scene and any radiation. That is an excellent approximation at these sizes and speeds.</p>
<p>The charges are ideal points. The magnet in the Faraday view is a point dipole, so its field lines near the bar are only a sketch of a real magnet’s. The coil has no resistance or self-inductance in the model, so the induced current is shown only as a direction. The capacitor field ignores fringing at the plate edges, and the wire field uses the long straight wire formula right up to the plates.</p>
<p>The sizes and values are chosen to make a clear picture. A one-metre coil and a 100 A·m² magnet are larger than a lab bench setup.</p>
<p>The field-line count is a picture, not a measurement. Six lines per nanocoulomb are started from each charge in 3D, and lines from a negative charge that end on a positive one are dropped as duplicates. So the net count through a surface is close to, but not always exactly, six times the enclosed charge in nC. The flux number comes from the surface integral, which is exact to many digits.</p>`,
  further: [
    { label: 'Feynman Lectures, Vol. II, Ch. 18: The Maxwell Equations', url: 'https://www.feynmanlectures.caltech.edu/II_18.html' },
    { label: 'Maxwell, A Dynamical Theory of the Electromagnetic Field (1865)', url: 'https://doi.org/10.1098/rstl.1865.0008' },
    { label: 'Maxwell’s equations on Wikipedia', url: 'https://en.wikipedia.org/wiki/Maxwell%27s_equations' },
    { label: 'Magnetic monopole on Wikipedia', url: 'https://en.wikipedia.org/wiki/Magnetic_monopole' },
  ],
};
