import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">In August 1834 the engineer John Scott Russell was watching a boat being pulled along the Union Canal near Edinburgh. The boat stopped suddenly. The water piled up at its bow did not stop. It rolled away down the canal as a single smooth hump.</p>
<p>Russell got on his horse and chased it. He wrote that he overtook it "still rolling on at a rate of some eight or nine miles an hour, preserving its original figure some thirty feet long and a foot to a foot and a half in height." He followed it for a mile or two before he lost it in the bends of the canal. He called it the <strong>wave of translation</strong>. Today we call it a <strong>soliton</strong>.</p>
<p>Why is that strange? Most waves do not keep their shape. Drop a stone in a pond and the ring spreads into ripples and fades. Different wavelengths travel at different speeds, so any hump comes apart. That is called <em>dispersion</em>.</p>
<p>A tall wave in shallow water has a second habit. Its crest sits in deeper water than its trough, so the crest runs a little faster and the front steepens, like a wave about to break. In a soliton these two effects cancel exactly. Dispersion tries to spread the hump. Steepening tries to sharpen it. The hump that balances them rolls on unchanged.</p>
<p>The canal in the scene holds two solitons. Watch three things:</p>
<ul>
<li><strong>Taller is faster.</strong> The amber hump is higher, so it catches the pink one.</li>
<li><strong>They pass through each other.</strong> For a moment they merge. Then both come out with exactly their old heights and speeds.</li>
<li><strong>Something did change.</strong> The posts on the bank show where each hump would be if it had been alone. After the meeting the tall one is ahead of its post and the small one is behind. That jump is the <em>phase shift</em>. It is the only trace the collision leaves.</li>
</ul>
<p>Switch the equation to <b>Linear only</b> and the same humps melt into ripples. The steepening term is what keeps a soliton alive.</p>`,
  tryFirst: [
    'Press <b>Reset</b> and watch the amber soliton catch the pink one. Look at the posts on the bank after they separate.',
    'Switch <b>View</b> to <b>Waterfall u(x,t)</b>. Each soliton draws a straight ridge through spacetime. Where they meet, both ridges jump sideways. The thin coloured lines show the paths without a collision.',
    'Set <b>Equation</b> to <b>Linear only</b>. The same humps spread into a fan of ripples, and the peak readout falls.',
    'Watch the corner chart. The peak height dips during the collision, but mass and energy stay flat.',
  ],
  equation: {
    tex: 'u_t + 6\\,u\\,u_x + u_{xxx} = 0',
    caption: 'The Korteweg–de Vries (KdV) equation for long, low waves in a shallow channel. Steepening (6uu<sub>x</sub>) and dispersion (u<sub>xxx</sub>) balance to make solitons.',
    terms: [
      { tex: 'u', name: 'Wave height', meaning: 'Height of the water surface above still water, in scaled units. A soliton of peak height $A$ has the shape $u = A\\,\\mathrm{sech}^2\\!\\big(\\sqrt{A/2}\\,(x - 2At)\\big)$.', param: 'A1' },
      { tex: 'u_t', name: 'Rate of change', meaning: 'How fast the height changes at a fixed spot in the moving frame. The scene steps it forward in time.', param: 't' },
      { tex: '6\\,u\\,u_x', name: 'Steepening', meaning: 'Nonlinear term. Higher parts of the wave move faster, so fronts sharpen. It also makes tall solitons faster, with speed $c = 2A$. Switch it off with Linear only.', param: 'mode' },
      { tex: 'u_{xxx}', name: 'Dispersion', meaning: 'Short wavelengths travel at different speeds from long ones, so a lone hump would spread out. This term alone gives the linear mode.', param: 'mode' },
    ],
  },
  physicsNotes: `
<h3>From a canal to the equation</h3>
<p>Take water of depth $h$ and a surface height $\\eta(x,t)$. Assume the waves are long compared with $h$ and low compared with $h$, and keep the first correction from each. Korteweg and de Vries found</p>
$$\\eta_t + c_0\\,\\eta_x + \\frac{3c_0}{2h}\\,\\eta\\,\\eta_x + \\frac{c_0 h^2}{6}\\,\\eta_{xxx} = 0, \\qquad c_0 = \\sqrt{gh}.$$
<p>The $c_0\\eta_x$ term just carries everything along at the still-water wave speed. Move into a frame riding at $c_0$ and rescale $x$, $t$ and $\\eta$. What remains is the headline equation. So the scene shows the canal from a frame that moves with $\\sqrt{gh}$. A soliton moves forward in that frame because it is faster than $\\sqrt{gh}$.</p>
<h3>The soliton</h3>
<p>Look for a hump that keeps its shape, $u = f(x - ct)$. The equation becomes an ordinary one that can be integrated twice. The answer that vanishes far away is</p>
$$u(x,t) = \\frac{c}{2}\\,\\mathrm{sech}^2\\!\\Big(\\frac{\\sqrt c}{2}\\,(x - ct)\\Big).$$
<p>The peak height is $A = c/2$, so <strong>speed is twice the height</strong>. Taller solitons are also narrower, with width proportional to $1/\\sqrt{A}$. In canal units this says a soliton of height $a$ moves at about $\\sqrt{gh}\\,(1 + a/2h)$. Russell had measured $\\sqrt{g(h+a)}$ in his tanks, which agrees to that order.</p>
<h3>Two solitons</h3>
<p>The exact two-soliton solution was found in the early 1970s. Ryogo Hirota's direct method writes it as $u = 2\\,\\partial_x^2 \\ln F$ with $F = 1 + e^{\\eta_1} + e^{\\eta_2} + \\big(\\tfrac{k_1-k_2}{k_1+k_2}\\big)^2 e^{\\eta_1+\\eta_2}$, where $\\eta_i = k_i x - k_i^3 t$ and $k_i = \\sqrt{c_i}$. Reading off the far past and far future gives the shifts:</p>
$$\\delta_1 = +\\frac{2}{k_1}\\ln\\frac{k_1+k_2}{k_1-k_2}, \\qquad \\delta_2 = -\\frac{2}{k_2}\\ln\\frac{k_1+k_2}{k_1-k_2}.$$
<p>The taller soliton is pushed forward and the smaller one pulled back. The <b>shift</b> readouts compare the measured jumps with these formulas.</p>
<h3>How the simulation solves it</h3>
<p>The channel is 100 units long with 512 grid points and wraps around. Derivatives are taken exactly in Fourier space. The stiff $u_{xxx}$ term is solved exactly with an integrating factor, and the $6uu_x$ term is stepped with fourth-order Runge–Kutta at $\\Delta t = 0.004$. Mass $\\int u\\,dx$ is conserved to rounding error and energy $\\int u^2\\,dx$ to about one part in a million over a collision. Those two readouts are the honesty check.</p>`,
  deep: [
    {
      title: 'Why taller solitons are faster and narrower',
      html: `<p>Put $u = f(\\xi)$ with $\\xi = x - ct$ into the KdV equation. It becomes $-cf' + 6ff' + f''' = 0$. Integrate once, multiply by $f'$ and integrate again, with $f$ and its slopes vanishing far away:</p>
$$\\tfrac12 f'^2 = \\tfrac{c}{2} f^2 - f^3.$$
<p>This is a particle rolling in a potential. The only path that leaves $f = 0$ and comes back is the $\\mathrm{sech}^2$ hump, and it turns around where $f' = 0$, at $f = c/2$. So the height is fixed by the speed: $A = c/2$.</p>
<p>The width comes from the same balance. Steepening grows like $A \\cdot A/w$ and dispersion like $A/w^3$. They cancel when $w^2 \\propto 1/A$. A taller soliton must be narrower, or dispersion would lose.</p>`,
    },
    {
      title: 'The collision and the phase shift',
      html: `<p>A linear wave passes through another by simple addition. Solitons do not add. At the peak of a collision the height is not the sum of the two heights. It is <em>lower</em>. Watch the peak line in the corner chart dip.</p>
<p>Peter Lax showed in 1968 that there are two kinds of meeting. When one soliton is much taller, it swallows the small one, the pair becomes a single hump for a while, and then the small one comes out behind. When the heights are close, the humps never merge. They trade height instead, and the lead passes from one hump to the other like a baton. Try heights 1.2 and 0.3, then 0.8 and 0.5, in the side view.</p>
<p>Either way, the only lasting mark is the shift. The tall soliton gains ground as if it had briefly sped up, and the small one loses ground. The two shifts balance. A soliton's mass $\\int u\\,dx$ is $2k$, and the mass-weighted shifts cancel exactly: $2k_1\\delta_1 + 2k_2\\delta_2 = 0$. The centre of mass of the water never notices the collision.</p>
<p>Check it with the waterfall view. Before the collision each ridge follows its thin free-flight line. After, the amber ridge sits to the right of its line and the pink one to the left.</p>`,
    },
    {
      title: 'Zabusky, Kruskal and the word "soliton"',
      html: `<p>The story restarts in Los Alamos. In 1953 and 1954 Enrico Fermi, John Pasta, Stanislaw Ulam and Mary Tsingou ran one of the first numerical experiments on a computer. They simulated a chain of masses joined by slightly nonlinear springs. They expected the energy to spread evenly over all the vibration modes. Instead it wandered among a few modes and came back almost exactly to where it started. The 1955 report is now called the FPUT problem.</p>
<p>In 1965 Norman Zabusky and Martin Kruskal took the continuum limit of that chain and got the KdV equation. They solved it numerically from a smooth cosine start. The cosine steepened, then broke up into a train of humps. The humps moved at speeds set by their heights, passed through one another, and came out unchanged. Because they behaved like particles, Zabusky and Kruskal named them <strong>solitons</strong>.</p>
<p>Korteweg and de Vries had published their equation in 1895, partly to settle an old dispute. George Airy and George Stokes had doubted that Russell's wave could exist. Joseph Boussinesq and Lord Rayleigh had already given approximate theories in the 1870s. The 1895 paper gave the exact solitary wave and a family of periodic "cnoidal" waves.</p>`,
    },
    {
      title: 'The inverse scattering transform',
      html: `<p>In 1967 Clifford Gardner, John Greene, Martin Kruskal and Robert Miura found how to solve KdV exactly for any starting shape. The trick is to treat $u(x)$ as a potential well in a Schrödinger equation:</p>
$$-\\psi'' - u(x,0)\\,\\psi = \\lambda\\,\\psi.$$
<p>The key fact is that when $u$ evolves by KdV, the energy levels $\\lambda$ of that well do not change. Each bound state $\\lambda_n = -\\kappa_n^2$ becomes one soliton, of height $2\\kappa_n^2$ and speed $4\\kappa_n^2$. The rest of the spectrum becomes ripples that disperse.</p>
<p>So the method is: scatter off the initial shape, let the scattering data evolve by a simple rule, then reconstruct the potential. It works like a Fourier transform for a nonlinear equation. One neat result: a start of $u = N(N+1)\\,\\mathrm{sech}^2 x$ splits into exactly $N$ solitons. Lax recast the method in 1968 using what are now called Lax pairs. KdV also has infinitely many conserved quantities, of which the scene tracks the first two.</p>`,
    },
    {
      title: 'Solitons in the wild',
      html: `<p><strong>Optical fibres.</strong> A light pulse in a fibre obeys a different equation, the nonlinear Schrödinger equation. There the Kerr effect squeezes the pulse while dispersion spreads it. Akira Hasegawa and Frederick Tappert predicted fibre solitons in 1973. Linn Mollenauer, Roger Stolen and James Gordon observed them in 1980. They were studied hard for long-haul links. Most commercial systems today use other schemes.</p>
<p><strong>Tsunamis.</strong> Tsunamis are often called solitons in popular writing. That is mostly wrong. In the deep ocean a tsunami is so long and so low that linear theory describes it well. Nonlinearity and dispersion matter mainly on long shallow shelves near the coast, where the front can break up into a train of short waves. Those can be described with KdV-type models, but the tsunami as a whole is not a soliton.</p>
<p><strong>The Morning Glory.</strong> In spring, rolling cloud bands sweep over the Gulf of Carpentaria in northern Australia. They can stretch for hundreds of kilometres, often in a series of parallel rolls. They are usually explained as solitary waves or undular bores riding on a stable layer of air.</p>
<p><strong>Inside the ocean.</strong> Large internal solitary waves travel along density layers below the surface, for example in the Andaman Sea and the South China Sea. Satellites see them as bands on the surface.</p>`,
    },
  ],
  challenges: [
    {
      id: 'faster',
      title: 'Taller is faster',
      prompt: 'Turn the second soliton off. Run a single soliton at two heights at least 0.5 apart, and let the measured crest speed settle to $2A$ each time.',
      hint: 'Set height A₂ to 0 (off). Try A₁ = 0.5 and wait until c reads 1.00. Then set A₁ = 1.2 and wait until c reads 2.40.',
      check: (s) => (s.ampHi as number) - (s.ampLo as number) >= 0.5 - 1e-9,
    },
    {
      id: 'survive',
      title: 'Both survive',
      prompt: 'Collide two solitons whose heights differ by less than a factor of two, and see both come out within 3% of their original heights.',
      hint: 'Try A₁ = 0.8 and A₂ = 0.5, with the smaller one ahead. The meeting is slow because their speeds are close, so raise the sim speed.',
      check: (s) => s.touched === true && s.mode === 'kdv' && (s.A2 as number) > 0 && Math.max(s.A1 as number, s.A2 as number) / Math.min(s.A1 as number, s.A2 as number) < 2 && s.survived === true,
    },
    {
      id: 'shift',
      title: 'Measure the phase shift',
      prompt: 'Change the setup, let a collision finish, and get the measured forward shift of the taller soliton within 10% of the formula.',
      hint: 'Any pair of different heights works once they are far apart again. Close heights give the biggest shifts. Watch the <b>shift, taller</b> readout.',
      check: (s) => s.touched === true && s.mode === 'kdv' && s.separated === true && (s.collisions as number) >= 1 && Math.abs(s.shiftBigPred as number) > 0.3 && Math.abs((s.shiftBig as number) - (s.shiftBigPred as number)) < 0.1 * Math.abs(s.shiftBigPred as number),
    },
    {
      id: 'disperse',
      title: 'Watch a linear pulse die',
      prompt: 'Switch to the linear equation and let the peak fall below half its starting height.',
      hint: 'Set <b>Equation</b> to <b>Linear only</b>. A narrow, tall hump spreads fastest.',
      check: (s) => s.mode === 'linear' && (s.peakRatio as number) < 0.5,
    },
  ],
  caveats: `<p>KdV is an approximation. It holds for waves that are long compared with the depth and low compared with the depth, moving in one direction in a narrow channel with a flat bed. Real canals have friction, sloping banks and bends, so a real soliton slowly loses height. Russell's wave faded after a mile or two.</p>
<p>The scene uses scaled units and exaggerates the heights so the shapes are easy to see. It is also viewed from a frame moving at the still-water wave speed $\\sqrt{gh}$, so the linear pulse seems to stay in place while it spreads. The channel is periodic, so waves that leave on the right come back on the left and can meet again. Starting two solitons on top of each other does not give a clean two-soliton state, and some ripples appear.</p>`,
  further: [
    { label: 'Korteweg and de Vries (1895), Philosophical Magazine', url: 'https://doi.org/10.1080/14786449508620739' },
    { label: 'Zabusky and Kruskal (1965), Phys. Rev. Lett. 15, 240', url: 'https://doi.org/10.1103/PhysRevLett.15.240' },
    { label: 'Gardner, Greene, Kruskal and Miura (1967), Phys. Rev. Lett. 19, 1095', url: 'https://doi.org/10.1103/PhysRevLett.19.1095' },
    { label: 'Fermi–Pasta–Ulam–Tsingou problem on Wikipedia', url: 'https://en.wikipedia.org/wiki/Fermi%E2%80%93Pasta%E2%80%93Ulam%E2%80%93Tsingou_problem' },
  ],
};
