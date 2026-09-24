import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Almost every helium atom in the universe was made in a few minutes, a few minutes after the Big Bang. The same short window made deuterium and a trace of lithium. Then the kitchen closed for good.</p>
<p>At one second the universe was a hot, dense soup. Protons and neutrons swam in a sea of photons, electrons, positrons and neutrinos. Neutrons are slightly heavier than protons, so at a given temperature there are fewer of them. While the soup was hot, the weak force swapped neutrons and protons back and forth, and the balance followed the temperature.</p>
<p>Then the expansion won. Near <strong>0.8 MeV</strong>, under ten billion kelvin, the swapping became too slow to keep up. About one neutron was left for every five protons. From then on the neutrons could only die. A free neutron decays to a proton in about <strong>15 minutes</strong> on average.</p>
<p>The obvious next step is a neutron and a proton sticking together as deuterium. They did, all the time. But there were about <strong>1.6 billion photons for every nucleon</strong>. Deuterium is loosely bound, and even when the average photon was too weak to break it, the rare energetic ones were numerous enough. Every new deuteron was blasted apart at once. This is the <strong>deuterium bottleneck</strong>.</p>
<p>At about three to four minutes, near 0.07 MeV, the bottleneck broke. Deuterium survived, and within a minute nearly every remaining neutron was locked inside helium-4, the most tightly bound light nucleus. By then about one neutron remained for every seven protons. Put two neutrons in each helium and you get helium as <strong>a quarter of all the ordinary mass</strong>. That is what astronomers measure.</p>
<p>In the scene, the <b>pot</b> holds 200 nucleons. Watch grey neutrons turn red as they decay, see n and p pair up and get split by photons, then watch helium clusters form almost all at once. The <b>ribbons</b> on the right show every species over time. The <b>Schramm plot</b> in the corner shows the final yields against the one free parameter, the number of baryons per photon. Drag its white line.</p>`,
  tryFirst: [
    'Watch the clock. When it reaches three minutes, the neutrons suddenly vanish into four-ball helium clusters in the pot.',
    'Drag the white <b>η line</b> in the Schramm plot to the right. The cyan D/H curve falls steeply. The amber helium curve barely moves.',
    'Set <b>neutrino species</b> to 4 and read the helium yield. Extra species speed up the expansion and leave more neutrons.',
    'Slide the <b>neutron lifetime</b>. A longer life means fewer neutrons lost before the bottleneck breaks, so more helium.',
  ],
  equation: {
    tex: 'Y_p \\approx \\frac{2\\,(n/p)}{1 + n/p}',
    caption: 'Every neutron that survives to nucleosynthesis ends up in helium-4, which holds two neutrons and two protons. The neutron supply is set earlier at weak freeze-out, where $n/p = e^{-Q/kT_f}$ with $Q = 1.293$ MeV and $kT_f \\approx 0.7$ to $0.8$ MeV, then trimmed by free <a href="https://en.wikipedia.org/wiki/Free_neutron_decay" target="_blank" rel="noopener">neutron decay</a>.',
    terms: [
      { tex: 'Y_p', name: 'Primordial helium mass fraction', meaning: 'The share of all ordinary mass in helium-4 when the first minutes end. Measured: $0.245 \\pm 0.003$.', param: 'Yp' },
      { tex: 'n/p', name: 'Neutron-to-proton ratio', meaning: 'Counted when the deuterium bottleneck breaks, about 1/7. It falls from about 1/5 at freeze-out because free neutrons decay. The neutron lifetime and the number of neutrino species both change it.', param: 'np' },
      { tex: '2', name: 'Two neutrons per helium', meaning: 'Each helium-4 holds two neutrons. So $n$ neutrons make $n/2$ helium nuclei of mass 4, a helium mass of $2n$. Divide by the total mass $n + p$.' },
      { tex: '1 + n/p', name: 'All nucleons', meaning: 'Total baryons in units of protons. Nearly all the mass is in nucleons, so this sets the denominator of a mass fraction.', param: 'np' },
    ],
  },
  physicsNotes: `
<h3>Weak freeze-out</h3>
<p>Neutrons and protons convert through $n + \\nu_e \\leftrightarrow p + e^-$ and $n + e^+ \\leftrightarrow p + \\bar\\nu_e$. While these run fast, $n/p$ follows the Boltzmann factor $e^{-Q/kT}$. Their rate per nucleon falls like $\\Gamma \\propto G_F^2 T^5$. The expansion rate falls more slowly, $H \\propto \\sqrt{g_*}\\,T^2/M_{\\rm Pl}$. They cross near $kT_f \\approx 0.8$ MeV, at about one second. A sudden freeze there gives $e^{-1.293/0.8} \\approx 0.20$, about 1/5. The shut-off is gradual in reality. The network in the scene integrates the full rates and finds $n/p \\approx 0.20$ once they have died away, 17% neutrons, in line with Weinberg's classic figure.</p>
<h3>The deuterium bottleneck</h3>
<p>Deuterium is bound by only $B_D = 2.22$ MeV. In equilibrium the deuterium fraction follows a Saha equation,</p>
$$\\frac{X_D}{X_n X_p} \\approx 8\\,\\eta \\left(\\frac{kT}{m_N c^2}\\right)^{3/2} e^{B_D/kT}.$$
<p>The tiny $\\eta \\approx 6\\times10^{-10}$ keeps this far below one until $e^{B_D/kT}$ grows huge. It crosses one at $kT \\approx 0.066$ MeV, some 33 times below the binding energy. Only then can deuterium build up and feed the fast reactions that make helium.</p>
<h3>Decay in the meantime</h3>
<p>The bottleneck breaks about 250 seconds after the start. By then decay has removed roughly a quarter of the free neutrons, with $\\tau_n = 878.4$ s. $n/p$ drops from about 1/5 to about 1/7, and</p>
$$Y_p \\approx \\frac{2/7}{1 + 1/7} = 0.25 .$$
<p>The network gives $Y_p = 0.246$ at the Planck value of $\\eta$. Full codes with every correction give 0.247.</p>
<h3>The reaction network</h3>
<p>The scene solves rate equations for n, p, D, ³H, ³He, ⁴He, ⁷Li and ⁷Be through 17 reactions and their reverse photodisintegrations. Rates are published fits to laboratory cross sections. Each reaction moves nucleons from one species to another, so the total baryon number is conserved. The readout shows the drift, at the level of rounding error. The equations are stiff, because some rates are a billion times faster than the expansion, so they are integrated with an implicit second-order method.</p>`,
  deep: [
    {
      title: 'Why D/H falls and helium barely rises with η',
      html: `<p>More baryons per photon means fewer photons per baryon to split deuterium. The bottleneck breaks a little earlier and hotter. Fewer neutrons have decayed by then, so helium rises, but only slowly, by less than 0.01 for every doubling of $\\eta$. Helium is a poor baryometer and a good test of the expansion rate.</p>
<p>Deuterium is the opposite. Once the bottleneck breaks, deuterium is burned by $D + D$ and $D + p$ reactions. Their rates scale with the baryon density. A denser universe burns deuterium more completely. Near the observed value the network gives D/H $\\propto \\eta^{-1.6}$, the same slope as fits to full codes. That steep dependence makes deuterium the best baryometer.</p>
<p>Lithium-7 has a dip. At low $\\eta$ it is made directly as ⁷Li by $^3\\mathrm{H} + {}^4\\mathrm{He}$ and destroyed by protons. At high $\\eta$ it is made mostly as ⁷Be, which is shielded from proton destruction and later captures an electron to become ⁷Li. The two branches cross near $\\eta \\approx 2.5\\times10^{-10}$.</p>`,
    },
    {
      title: 'History: Gamow, Hayashi, and Wagoner, Fowler and Hoyle',
      html: `<p><strong>1948.</strong> Ralph Alpher, Hans Bethe and George Gamow published "The Origin of Chemical Elements" in Physical Review. Alpher did the work as Gamow's student. Gamow added Bethe's name for the pun on alpha, beta, gamma. They imagined a hot early universe of neutrons that built every element by successive neutron capture. The same year Alpher and Robert Herman predicted a leftover radiation of about 5 K.</p>
<p><strong>1950.</strong> Chushiro Hayashi pointed out that the neutrons could not simply be there at the start. Weak interactions with electrons, positrons and neutrinos keep neutrons and protons in thermal balance while the universe is hot. This fixes $n/p$ from known physics. Alpher, Follin and Herman worked out the details in 1953.</p>
<p><strong>1964 to 1967.</strong> Fred Hoyle and Roger Tayler argued that stars could not have made all the helium seen. Jim Peebles computed helium production in a hot Big Bang in 1966, just after the microwave background was found. In 1967 Robert Wagoner, William Fowler and Fred Hoyle ran a full reaction network by computer and predicted D, ³He, ⁴He and ⁷Li. Their approach, later coded by Wagoner and Lawrence Kawano, is the ancestor of every modern BBN code, including the small one in this scene.</p>`,
    },
    {
      title: 'Two clocks, one answer: BBN and the CMB',
      html: `<p>BBN measures the baryon density at three minutes, through nuclear reactions. The cosmic microwave background measures it at 380,000 years, through the sound waves in the photon-baryon fluid. The physics is completely different. Using $\\eta_{10} = 273.9\\,\\Omega_b h^2$, Planck finds $\\Omega_b h^2 = 0.02237 \\pm 0.00015$, or $\\eta = 6.13\\times10^{-10}$. The deuterium abundance in distant, nearly pristine gas clouds, D/H $= (2.527 \\pm 0.030)\\times10^{-5}$ from Cooke, Pettini and Steidel (2018), gives the same baryon density to within a few percent. The main nuclear uncertainty, the rate of $D + p \\to {}^3\\mathrm{He} + \\gamma$, was measured deep underground by the LUNA experiment in 2020, and the agreement held. Try it in the scene. The D/H challenge lands you a few percent from the purple CMB band.</p>
<p>This agreement matters. It says ordinary matter is only about 5% of the cosmic energy budget, so the dark matter cannot be made of baryons. It also says nothing strange happened to the baryon-to-photon ratio between three minutes and 380,000 years.</p>
<p>Helium counts neutrinos. Each extra light species adds energy density, speeds up the expansion, freezes the weak reactions earlier and leaves more neutrons. The network gives $\\Delta Y_p \\approx 0.013$ per species. Gary Steigman, David Schramm and Jim Gunn used this in 1977 to limit the number of neutrino families. Collider experiments at LEP later found $N_\\nu = 2.996 \\pm 0.007$ from the width of the Z boson, after a 2019 reanalysis.</p>`,
    },
    {
      title: 'Why the kitchen stopped at lithium',
      html: `<p>There is no stable nucleus with 5 nucleons. Helium-5 and lithium-5 fall apart in about $10^{-21}$ s. There is no stable nucleus with 8 nucleons either. Beryllium-8 splits into two helium-4 nuclei in under $10^{-16}$ s. So the easy path of adding a proton, a neutron or a helium-4 to helium-4 is blocked at both gaps. Only a little ⁷Li and ⁷Be get across, through the rarer $^3\\mathrm{H} + {}^4\\mathrm{He}$ and $^3\\mathrm{He} + {}^4\\mathrm{He}$ reactions, which must tunnel through a larger Coulomb barrier.</p>
<p>Stars jump the gap with the triple-alpha process, which fuses three helium nuclei into carbon. It needs the high density and the long time available in a red giant core. The early universe had neither. It cooled below the temperature for charged particle fusion within about 20 minutes, and its density was far lower than a star's. That is why Gamow's plan to make every element in the Big Bang failed, and why nearly everything heavier than lithium came from stars.</p>`,
    },
    {
      title: 'The lithium problem, an honest open question',
      html: `<p>The oldest stars in the Milky Way's halo, poor in heavy elements, show nearly the same lithium abundance over a wide range of temperatures and metallicities. Monique and François Spite found this plateau in 1982. Its value is about Li/H $= 1.6\\times10^{-10}$. Standard BBN at the Planck $\\eta$ predicts about $5\\times10^{-10}$, some three times more. The deuterium and helium predictions agree with observation, so the mismatch stands out.</p>
<p>Nobody knows the answer yet. The candidates are:</p>
<ul>
<li><strong>Stellar depletion.</strong> The stars may have destroyed some lithium by mixing it down to hot layers over 13 billion years. Models with diffusion and mixing can do some of this, but a uniform factor of three across many stars is hard to arrange.</li>
<li><strong>Nuclear physics.</strong> A missed resonance that destroys ⁷Be could fix it. Dedicated experiments have measured the key ⁷Be reactions and have not found a large enough effect.</li>
<li><strong>New physics.</strong> Decaying particles or other exotic effects during BBN could destroy ⁷Be. These models tend to spoil deuterium at the same time.</li>
</ul>
<p>Most researchers lean toward stellar physics, but the question is open.</p>`,
    },
  ],
  challenges: [
    {
      id: 'cook',
      title: 'Cook the universe',
      prompt: 'Press <b>Restart</b> and let the full 20 minutes play out, with a recipe that gives helium $Y_p$ within 0.01 of the observed 0.245.',
      hint: 'The default recipe works. Press Restart, keep η near the purple CMB band, and wait for the clock to stop.',
      check: (s) => s.userRun === true && Math.abs((s.Yp as number) - 0.245) < 0.01,
    },
    {
      id: 'deuterium',
      title: 'Weigh the baryons with deuterium',
      prompt: 'With 3 neutrino species, move η until the predicted D/H is within 4% of the observed $2.53\\times10^{-5}$.',
      hint: 'Drag the white line in the Schramm plot until the cyan dot sits in the cyan band. It lands just below $6\\times10^{-10}$ in this model, close to the purple CMB band.',
      check: (s) => s.etaTouched === true && s.Nnu === 3 && Math.abs((s.DH as number) / 2.527e-5 - 1) < 0.04,
    },
    {
      id: 'neutrinos',
      title: 'A fourth neutrino',
      prompt: 'Add a fourth neutrino species and see helium rise by more than 0.01 over the three-species value.',
      hint: 'Set <b>Neutrino species</b> to 4. The expansion speeds up, freeze-out comes earlier and more neutrons survive.',
      check: (s) => (s.Nnu as number) >= 4 && (s.Yp as number) - (s.Yp3 as number) > 0.01,
    },
    {
      id: 'baryometer',
      title: 'Deuterium the baryometer',
      prompt: 'In one drag, at least double η and watch D/H fall by more than half.',
      hint: 'Grab the η slider or the white line in the Schramm plot near 2 or 3, and drag it right past twice that value without letting go.',
      check: (s) => s.sawDHfall === true,
    },
  ],
  caveats: `<p>The network uses 17 reactions, not the hundred or so in full codes, and rate fits from standard compilations. It assumes neutrinos decouple instantly before electron-positron annihilation, and it skips small corrections to the weak rates (radiative, finite nucleon mass, plasma effects). Its helium comes out about 0.001 below full codes, and D/H about 3% below. The time-temperature relation is computed from the thermal history of photons, electrons, positrons and $N_\\nu$ neutrino species.</p>
<p>The pot is a cartoon. It holds 200 nucleons, so trace nuclei like deuterium never appear there and live on the spice rack instead. Real deuterons form and break at random throughout the plasma, not one pair at a time. Photons are drawn a few hundred strong, not 1.6 billion per nucleon. The clock runs on a log scale, so the first seconds are stretched and the later minutes squeezed.</p>
<p>The observed abundances carry their own systematic uncertainties. Helium comes from extrapolating nearby dwarf galaxies to zero heavy elements, and lithium from the atmospheres of old stars that may have altered it.</p>`,
  further: [
    { label: 'Big Bang nucleosynthesis on Wikipedia', url: 'https://en.wikipedia.org/wiki/Big_Bang_nucleosynthesis' },
    { label: 'Alpher, Bethe and Gamow, The Origin of Chemical Elements (1948)', url: 'https://doi.org/10.1103/PhysRev.73.803' },
    { label: 'Pitrou, Coc, Uzan and Vangioni, Precision big bang nucleosynthesis (2018)', url: 'https://arxiv.org/abs/1801.08023' },
    { label: 'Fields, The primordial lithium problem (2011)', url: 'https://arxiv.org/abs/1203.3551' },
  ],
};
