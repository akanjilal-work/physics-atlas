import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Cool a thin sheet of electrons close to absolute zero and put it in a strong magnetic field. Its sideways resistance stops growing smoothly. It climbs in flat steps, and each step sits at a value fixed by two constants of nature.</p>
<p>A magnetic field bends moving charges sideways. Push a current along a strip and the electrons crowd toward one edge. That builds a small voltage across the strip, the <strong>Hall voltage</strong>. Edwin Hall found it in 1879. Normally it grows in a straight line as you turn up the field.</p>
<p>In 1980 Klaus von Klitzing did the experiment on a very thin, very cold electron layer. The Hall resistance did not follow the straight line. It stuck on flat <strong>plateaus</strong> at 25 813 ohms divided by 1, 2, 3 and so on. On each plateau the ordinary resistance along the strip fell to zero. The plateau values did not depend on the size of the sample, the material, or its flaws. They depend only on Planck's constant and the electron charge.</p>
<p>The scene shows why. In the field, each electron runs in a tiny circle. In the middle of the sample the circles drift around the bumps of a messy impurity landscape and go nowhere. They are <strong>stuck</strong>. At the edges the circles hit the wall and bounce, and the bounces carry them along the edge in one direction only. Those <strong>edge channels</strong>, the glowing lines, carry the current. An electron on an edge cannot turn around, because turning around would mean crossing the whole sample to the far edge. So nothing scatters it back, and no energy is lost.</p>
<p>The corner plot shows the two resistances as the field sweeps up. Switch the view to <b>Landau fan</b> to see where the steps come from. The field sorts the electrons' energies into evenly spaced levels. A step appears whenever the Fermi level, the top of the filled states, sits in the gap between two levels.</p>`,
  tryFirst: [
    'Drag the <b>magnetic field</b> slowly from 2 T to 12 T and watch the white marker in the corner plot. The cyan Hall curve sticks on flat steps while the rose curve drops to zero.',
    'Look along the edges of the Hall bar. Dots bounce along each edge in one direction only. The top edge and the bottom edge run opposite ways.',
    'Set <b>disorder</b> to its minimum. The plateaus shrink and the Hall curve creeps back toward the straight classical line. Disorder is what makes the steps.',
    'Raise the <b>temperature</b> toward 30 K and the corners of each step round off.',
    'Switch <b>view</b> to <b>Landau fan</b>. The amber sheet is the Fermi level. When it sits between two ridges, you are on a plateau.',
  ],
  equation: {
    tex: 'R_{xy} = \\frac{h}{\\nu e^{2}}, \\quad \\nu = 1, 2, 3, \\dots',
    caption: 'On each plateau the Hall resistance equals the von Klitzing constant $h/e^2 \\approx 25\\,812.807\\ \\Omega$ divided by a whole number. At the same time the longitudinal resistance $R_{xx}$ vanishes.',
    terms: [
      { tex: 'R_{xy}', name: 'Hall resistance', meaning: 'Hall voltage across the strip divided by the current along it. Classically it equals $B/(ne)$, a straight line in $B$.', param: 'Rxy' },
      { tex: 'h', name: 'Planck constant', meaning: 'Exactly $6.626\\,070\\,15\\times10^{-34}$ J s since the 2019 SI redefinition.', param: 'RK' },
      { tex: 'e', name: 'Elementary charge', meaning: 'Exactly $1.602\\,176\\,634\\times10^{-19}$ C since 2019. So $h/e^2$ is exact too.', param: 'RK' },
      { tex: '\\nu', name: 'Filling factor', meaning: 'How many Landau levels the electrons fill, $\\nu = nh/(eB)$. Set by the density and field sliders.', param: 'nu' },
      { tex: '1, 2, 3, \\dots', name: 'Plateau index', meaning: 'On a plateau the measured value locks to a whole number, even when the filling factor itself is not whole. Topologically it is a Chern number.', param: 'plateau' },
    ],
  },
  physicsNotes: `
<h3>The classical Hall effect</h3>
<p>Current $I$ flows along a strip of thickness $t$ holding $n$ carriers of charge $q$ per volume. In steady state the magnetic push $qvB$ is balanced by the sideways electric field of the piled-up charge. That gives</p>
$$V_H = \\frac{IB}{nqt}.$$
<p>For a sheet only a few nanometres thick we use the sheet density $n_{2D} = nt$, so $R_{xy} = V_H/I = B/(n_{2D} e)$. It rises in a straight line with $B$ and tells you the carrier density. The dashed grey line in the corner plot is this classical result.</p>
<h3>Landau levels</h3>
<p>Quantum mechanics only allows certain cyclotron orbits. A 2D electron in a perpendicular field has energies</p>
$$E_n = \\hbar\\omega_c\\left(n + \\tfrac12\\right), \\qquad \\omega_c = \\frac{eB}{m^*},$$
<p>like a harmonic oscillator. In GaAs the effective mass is $m^* = 0.067\\,m_e$, so $\\hbar\\omega_c \\approx 1.73$ meV per tesla. Each level holds $eB/h$ states per unit area for each spin, about $2.4\\times10^{10}$ per cm² per tesla. The <b>filling factor</b> $\\nu = nh/(eB)$ counts how many levels the electrons fill. When $\\nu$ is a whole number, the classical line passes exactly through $h/(\\nu e^2)$. The quantum surprise is that the resistance stays there over a whole range of field.</p>
<h3>Zero resistance and zero conductance at once</h3>
<p>In two dimensions resistivity and conductivity are 2×2 matrices, inverses of each other:</p>
$$\\rho_{xx} = \\frac{\\sigma_{xx}}{\\sigma_{xx}^2 + \\sigma_{xy}^2}, \\qquad \\rho_{xy} = \\frac{\\sigma_{xy}}{\\sigma_{xx}^2 + \\sigma_{xy}^2}.$$
<p>On a plateau no states at the Fermi level can carry current through the bulk, so $\\sigma_{xx} = 0$. With $\\sigma_{xy}$ still finite, that forces $\\rho_{xx} = 0$ too. So $\\sigma_{xx} = 0$ looks like a perfect insulator while $\\rho_{xx} = 0$ looks like a perfect conductor. Both are true at once, because the crossed field turns any push into sideways drift.</p>
<h3>How the simulation works</h3>
<p>The resistance curves come from a simple model, not a full calculation. Each spin-resolved Landau level is a Gaussian of width $\\Gamma$ (the disorder slider) holding $eB/h$ states. Only states within 0.1 meV of each level centre count as <em>extended</em>. The rest are <em>localized</em>. The code finds the chemical potential that holds the chosen density at temperature $T$, with the Fermi function. Then $\\sigma_{xy}$ is $e^2/h$ times the filled fraction of extended states, summed over levels. $\\sigma_{xx}$ is $e^2/h$ times $2F(1-F)$ for each level's extended fraction $F$, which peaks at $e^2/2h$ between plateaus. The density residual readout checks the chemical-potential solve. The spin splitting is set to 0.3 $\\hbar\\omega_c$, a model choice explained in the caveats.</p>
<p>The dots on the Hall bar are classical particles. Each one turns in the magnetic field, feels the force from a random impurity landscape, and bounces off the side walls. Their motion is a picture of the mechanism, not a quantum calculation.</p>`,
  deep: [
    {
      title: 'Where Landau levels and their degeneracy come from',
      html: `<p>Use the Landau gauge $\\mathbf A = (0, Bx, 0)$. The Hamiltonian is $H = \\frac{1}{2m^*}\\left[p_x^2 + (p_y + eBx)^2\\right]$ for an electron of charge $-e$. It does not depend on $y$, so try $\\psi = e^{iky}\\phi(x)$. Then $\\phi$ obeys a harmonic oscillator equation centred at $x_k = -\\hbar k/(eB)$, with frequency $\\omega_c = eB/m^*$. The energies are $\\hbar\\omega_c(n + \\frac12)$ and do not depend on $k$ at all.</p>
<p>That independence is the huge degeneracy. In a sample of size $L_x \\times L_y$, $k$ comes in steps of $2\\pi/L_y$, and the centre $x_k$ must lie inside the sample. Counting gives $N = eBL_xL_y/h$ states. Per unit area that is $eB/h$, one state per flux quantum $h/e$ threading the sample.</p>
<p>At 10 T in GaAs, $\\hbar\\omega_c \\approx 17$ meV, which is about 200 K in temperature units. The levels are well separated at liquid helium temperatures. That is part of why the effect needs cold, clean, strongly magnetised samples.</p>`,
    },
    {
      title: 'Why the plateaus exist: localized and extended states',
      html: `<p>A perfectly clean sample would have no plateaus. The Fermi level would jump from one sharp level to the next, and $R_{xy}$ would follow the classical line. Try the minimum disorder setting to see this.</p>
<p>Real samples contain impurities. They broaden each level, and they trap most of the broadened states on closed contours around hills and valleys of the potential. That is what the bulk dots in the scene do. Trapped states cannot carry current across the sample. Only a narrow band of states near each level centre is <em>extended</em>, running all the way through.</p>
<p>Now change $B$ at fixed density. While the Fermi level moves through localized states, nothing that carries current changes. The filled extended states stay filled, so $\\sigma_{xy}$ stays at exactly $\\nu e^2/h$, and $\\sigma_{xx} = 0$. That is a plateau. Only when the Fermi level crosses an extended band does the Hall conductance step up by $e^2/h$.</p>
<p>Robert Laughlin gave a sharper argument in 1981. Roll the sample into a ring and thread one extra flux quantum through the hole. Gauge invariance forces a whole number of electrons to be pumped from one edge to the other, no matter what the disorder is. That whole number is the plateau index.</p>
<p>The model here uses a fixed extended band of ±0.1 meV. In reality the extended states shrink to a single energy in a large sample at zero temperature, and the steps between plateaus sharpen according to scaling laws that are still studied.</p>`,
    },
    {
      title: 'Edge states: one-way roads that cannot turn back',
      html: `<p>Near an edge, a cyclotron orbit hits the wall and bounces. Each bounce moves the orbit a bit further along the wall, always the same way. These <strong>skipping orbits</strong> travel in one direction on the top edge and the opposite direction on the bottom edge. Reverse $B$ and both directions flip. In quantum mechanics each filled Landau level gives one such channel along the edge, as Bertrand Halperin showed in 1982.</p>
<p>These channels are <strong>chiral</strong>: everything on one edge moves the same way. To scatter backwards, an electron would have to reach the opposite edge, which is far away across an insulating bulk. So an impurity near the edge can only push the electron around the bump, and it keeps going. Markus Büttiker's 1988 edge-channel picture shows that $\\nu$ perfect one-way channels give exactly $R_{xy} = h/(\\nu e^2)$ and $R_{xx} = 0$.</p>
<p>The glowing lines and the arrows on the Hall bar show the edge current. Flip the field sign and watch them reverse.</p>`,
    },
    {
      title: 'Topology: why the steps are so precise',
      html: `<p>In 1982 Thouless, Kohmoto, Nightingale and den Nijs (TKNN) showed that the Hall conductance of a filled band is $\\sigma_{xy} = C\\,e^2/h$, where $C$ is an integer called the <strong>Chern number</strong>. It is a topological property of how the electron wavefunctions twist across momentum space. Like the number of holes in a doughnut, it cannot change by small amounts. Smooth changes to the sample, such as disorder, shape or impurity type, cannot alter it. On each plateau here, $C$ equals the plateau index. David Thouless shared the 2016 Nobel Prize partly for this work.</p>
<p>The same mathematics led to <strong>topological insulators</strong>. Haldane showed in 1988 that a lattice can have a quantised Hall conductance without any net magnetic field. Kane and Mele in 2005 found a version protected by time-reversal symmetry, with pairs of edge channels running in opposite directions for opposite spins. It was seen in HgTe quantum wells in 2007. A quantum anomalous Hall effect, plateaus with no applied field, was measured in magnetic topological insulator films in 2013. The <a href="#/t/topological-insulators">Topological Insulators</a> topic picks up this thread.</p>
<p>The precision is real. Plateaus in GaAs devices and in graphene have been compared and agree to better than a part in a billion. Graphene is so robust that its quantum Hall effect was seen at room temperature in 2007.</p>`,
    },
    {
      title: 'History, the ohm, and the fractional effect',
      html: `<p>Edwin Hall discovered the classical effect in 1879 as a graduate student at Johns Hopkins, using a thin gold leaf. A century later, in February 1980, Klaus von Klitzing measured silicon MOSFET samples at the high magnetic field laboratory in Grenoble and saw plateaus at $h/(\\nu e^2)$, reproducible to parts per million. His paper with Dorda and Pepper appeared that year. He received the 1985 Nobel Prize in Physics.</p>
<p>Metrology labs adopted the effect as a resistance standard. From 1990 they used the conventional value $R_{K\\text{-}90} = 25\\,812.807\\ \\Omega$. On 20 May 2019 the SI was redefined to fix $h$ and $e$ exactly. Since then $R_K = h/e^2 = 25\\,812.807\\,45\\ldots\\ \\Omega$ is itself exact, and the quantum Hall effect realises the ohm directly. The old conventional value differs from it by about 2 parts in $10^8$.</p>
<p>In 1982 Daniel Tsui, Horst Störmer and Arthur Gossard found a plateau at $\\nu = 1/3$ in a very clean GaAs sample. This <strong>fractional quantum Hall effect</strong> cannot be explained by single electrons filling levels. It comes from strong interactions between electrons. Robert Laughlin explained it in 1983 with a correlated many-electron wavefunction whose excitations carry charge $e/3$. Laughlin, Störmer and Tsui shared the 1998 Nobel Prize. These excitations are <strong>anyons</strong>: exchanging two of them gives a phase that is neither that of bosons nor of fermions. Fractional charge was confirmed by shot-noise measurements in 1997, and experiments in 2020 reported direct signatures of anyonic exchange statistics. This page does not model the fractional effect.</p>`,
    },
  ],
  challenges: [
    {
      id: 'nu2',
      title: 'Find the ν = 2 plateau',
      prompt: 'Set the field so the Hall resistance locks onto $h/(2e^2) \\approx 12\\,906\\ \\Omega$, within one part in ten thousand.',
      hint: 'At the default density the ν = 2 step sits around 5 T. Keep the temperature low.',
      check: (s) => s.plateau === 2,
    },
    {
      id: 'zero',
      title: 'Resistance vanishes',
      prompt: 'Find any plateau where the longitudinal resistance $R_{xx}$ is below 0.01 Ω.',
      hint: 'Watch the rose curve in the corner plot. Park the marker in the middle of a flat cyan step.',
      check: (s) => (s.plateau as number) >= 1 && (s.Rxx as number) < 0.01,
    },
    {
      id: 'blur',
      title: 'Melt the steps',
      prompt: 'Raise the temperature until the centre of the ν = 2 plateau is more than 1% off $h/(2e^2)$.',
      hint: 'Heat lets electrons jump the gap into extended states. Try 15 K or more. Less disorder or a lower field makes the gap easier to jump.',
      check: (s) => (s.plateauDev as number) > 0.01,
    },
    {
      id: 'flip',
      title: 'Reverse the field',
      prompt: 'Make $B$ point down, at −0.5 T or stronger, and watch the edge currents change direction.',
      hint: 'Drag the field slider below zero. The Hall resistance changes sign too.',
      check: (s) => (s.B as number) <= -0.5,
    },
  ],
  caveats: `<p>The resistance curves come from a simple model, labelled as such in the scene. It uses Gaussian level broadening, a fixed band of extended states, and a simple form for $\\sigma_{xx}$. It gets the plateau values exactly right, because those follow from counting filled extended states. The widths of the plateaus, the shape of the transitions and the height of the $R_{xx}$ peaks are only qualitative. Below 0.25 T the page shows the classical line.</p>
<p>The bare spin splitting in GaAs is tiny, since its g-factor is about −0.44. Odd plateaus are seen in real samples because electron interactions greatly enhance the spin gap. The model mimics this with a fixed spin gap of 0.3 $\\hbar\\omega_c$.</p>
<p>The dots in the Hall bar are classical particles with exaggerated orbits, drawn to show the mechanism. Real electrons are quantum waves with orbits tens of nanometres across. The fractional effect is not modelled.</p>`,
  further: [
    { label: 'von Klitzing, Dorda and Pepper, Phys. Rev. Lett. 45, 494 (1980)', url: 'https://doi.org/10.1103/PhysRevLett.45.494' },
    { label: 'Thouless, Kohmoto, Nightingale and den Nijs, Phys. Rev. Lett. 49, 405 (1982)', url: 'https://doi.org/10.1103/PhysRevLett.49.405' },
    { label: 'The Nobel Prize in Physics 1985', url: 'https://www.nobelprize.org/prizes/physics/1985/summary/' },
    { label: 'Quantum Hall effect on Wikipedia', url: 'https://en.wikipedia.org/wiki/Quantum_Hall_effect' },
  ],
};
