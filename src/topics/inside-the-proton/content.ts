import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Add up the masses of the three quarks in a proton and you get about 9 MeV. The proton weighs 938 MeV. Ninety-nine percent of it is missing from the list of parts.</p>
<p>The missing mass is energy. The quarks inside a proton are trapped in a space less than a femtometre across, so they move very fast. They are held there by gluon fields that store a lot of energy. By $E = mc^2$, all that energy weighs something. So <strong>the mass of everything around you is mostly binding energy, not Higgs</strong>. The Higgs field gives the quarks their small rest masses. The strong force does the rest.</p>
<p>The scene shows a proton as a fuzzy ball. Inside are three <strong>valence quarks</strong>, two up and one down, tinted red, green and blue. These are not real colours. They stand for the strong-force charge called <em>colour</em>. Watch a gluon travel along a spring between two quarks. When it arrives, the two quarks swap colours. At every moment there is one of each, so the proton as a whole stays colourless.</p>
<p>The <strong>Q² slider</strong> is a microscope. It sets how hard you hit the proton, and so how finely you can see. At low Q² you see three lumpy blobs, the "constituent quarks" of the old quark model. Turn it up and the blobs shrink to points. Around them appears a crowd of gluons and short-lived quark–antiquark pairs, the <strong>sea</strong>. Each one carries only a small share of the proton's momentum, but there are many of them.</p>
<p>Two famous surprises live here too. The quark spins add up to only about a third of the proton's spin. And for ten years, two ways of measuring the proton's size disagreed. Both stories are in the Deep Dive.</p>`,
  tryFirst: [
    'Drag <b>Q²</b> all the way down. Three soft blobs. Now drag it all the way up and watch the sea and gluons crowd in.',
    'Watch the curves in the corner inset as you move Q². The valence curves sag a little and the sea and gluon curves shoot up on the left, at small x.',
    'Turn on the <b>mass pie</b>. The white sliver is the part of the proton’s mass that the Higgs gives to its three quarks.',
    'Switch to a <b>neutron</b>. One up quark becomes a down quark, and the charge readout drops to zero.',
  ],
  equation: {
    tex: 'm_p c^2 \\approx 938\\ \\text{MeV} \\;\\gg\\; (2m_u + m_d)\\,c^2 \\approx 9\\ \\text{MeV}',
    caption: 'The proton weighs about a hundred times more than its three valence quarks. The rest is the energy of quarks and gluons confined in a small space.',
    terms: [
      { tex: 'm_p c^2', name: 'Proton mass', meaning: 'The measured rest energy of the proton, 938.272 MeV. The neutron is 939.565 MeV.', param: 'mass' },
      { tex: '938\\ \\text{MeV}', name: 'Where it comes from', meaning: 'Lattice QCD splits it into quark mass terms, quark kinetic and potential energy, gluon field energy and the trace anomaly. The pie shows one such split.', param: 'pie' },
      { tex: '2m_u + m_d', name: 'Valence quark masses', meaning: 'Rest masses the Higgs field gives the quarks: $m_u \\approx 2.16$ MeV and $m_d \\approx 4.70$ MeV (PDG, $\\overline{\\text{MS}}$ scheme at 2 GeV). A neutron has $m_u + 2m_d$.', param: 'quarkMass' },
      { tex: '\\gg', name: 'The ratio', meaning: 'The quark masses are about 1% of the proton mass. Even if the up and down quarks were massless, the proton would still weigh most of what it does.', param: 'massFrac' },
      { tex: 'uud', name: 'Valence content', meaning: 'Two up quarks (charge $+\\tfrac23$) and one down quark ($-\\tfrac13$) give charge +1. The neutron, udd, has charge 0.', param: 'nucleon' },
    ],
  },
  physicsNotes: `
<h3>What x and Q² mean</h3>
<p>In deep inelastic scattering an electron hits the proton by exchanging a virtual photon. $Q^2$ is minus the photon's four-momentum squared. It sets the resolution, a distance of roughly $\\hbar c/Q$. At $Q^2 = 1$ GeV² that is 0.2 fm. At $10^4$ GeV² it is 0.002 fm. The Bjorken variable $x$ is the fraction of the proton's momentum carried by the quark that was struck, in a frame where the proton moves very fast.</p>
<p>A <strong>parton distribution function</strong> $f(x, Q^2)$ counts how many partons of one kind carry momentum fraction $x$. Plots usually show $x f(x)$, which is the momentum density.</p>
<h3>Sum rules</h3>
<p>Take away antiquarks from quarks and what is left is the valence content. So the proton must satisfy</p>
$$\\int_0^1 u_v\\,dx = 2, \\qquad \\int_0^1 d_v\\,dx = 1.$$
<p>All partons together carry all the momentum:</p>
$$\\int_0^1 x\\Big[\\sum_q \\big(f_q + f_{\\bar q}\\big) + f_g\\Big]\\,dx = 1.$$
<p>Global fits find that at $Q^2 \\approx 4$ GeV² quarks and antiquarks carry roughly 60% and gluons roughly 40%. The gluon share grows slowly with $Q^2$ and creeps toward half at the highest HERA scales. The momentum readouts show the numbers, and the sum readout is a numerical integral of the curves, not a copy of the answer.</p>
<h3>How the curves are made</h3>
<p>The curves are a schematic model, not a fit to data. Each group has a simple shape, such as $x u_v = A\\,x^{0.6}(1-x)^b$ and $x g = A_g\\,x^{-\\lambda}(1-x)^5$. The constants are fixed by the sum rules. The momentum in each group follows the exact leading-order QCD evolution of the momentum moments, started from round numbers typical of global fits at $Q^2 = 4$ GeV². The small-x slope $\\lambda(Q^2) = 0.048\\ln(Q^2/\\Lambda^2)$ with $\\Lambda = 0.29$ GeV is the H1 fit to the rise of $F_2$ seen at HERA.</p>
<h3>Why momentum drifts to small x</h3>
<p>Resolve a quark more finely and you may find it has just radiated a gluon. The gluon may split into a quark and antiquark. Each split shares momentum among more partons, so higher $Q^2$ moves momentum from large x to small x. This is DGLAP evolution. At leading order the momentum moments obey</p>
$$\\langle x\\rangle_{\\text{quarks}} \\to \\frac{3n_f}{16 + 3n_f}, \\qquad \\langle x\\rangle_g \\to \\frac{16}{16 + 3n_f}$$
<p>as $Q^2 \\to \\infty$. With four light flavours that is 3/7 and 4/7. The approach is logarithmically slow.</p>`,
  deep: [
    {
      title: 'From Rutherford to quarks',
      html: `<p>Rutherford found the atomic nucleus in 1911. In 1919 he showed that alpha particles knock hydrogen nuclei out of nitrogen, and in 1920 he called them protons. For decades the proton was treated as a point.</p>
<p>The first hint otherwise came in 1933. Otto Stern measured the proton's magnetic moment and found it between two and three times the value a point-like Dirac particle should have. In the 1950s Robert Hofstadter scattered electrons off protons at Stanford and measured a size of about 0.8 fm. He shared the 1961 Nobel Prize.</p>
<p>In 1964 Murray Gell-Mann and George Zweig proposed, independently, that hadrons are built from three kinds of smaller objects. Gell-Mann called them quarks. For some years many physicists, Gell-Mann included, treated quarks as possibly just a mathematical device.</p>`,
    },
    {
      title: 'Deep inelastic scattering and partons',
      html: `<p>In 1967 and 1968 a SLAC–MIT team fired electrons from the new two-mile linear accelerator at protons. Far more electrons bounced off at large angles than a smooth proton allows. The structure functions depended on $x$ alone, not on $Q^2$, which James Bjorken had predicted. This <em>scaling</em> is what you expect if the electron hits hard, point-like objects inside.</p>
<p>In 1969 Richard Feynman called those objects <strong>partons</strong>. They were soon identified with quarks. Momentum counting then showed that the charged partons carry only about half the proton's momentum. The rest is carried by something neutral that the photon does not see: gluons. Jerome Friedman, Henry Kendall and Richard Taylor received the 1990 Nobel Prize for the SLAC experiments.</p>
<p>Scaling is only approximate. In 1973 Gross, Wilczek and Politzer showed that QCD is asymptotically free: the strong coupling weakens at short distances. This explains both the near-scaling and its slow, logarithmic violation, which is the $Q^2$ dependence in the scene. They received the 2004 Nobel Prize.</p>
<p>The electron–proton collider HERA at DESY in Hamburg ran from 1992 to 2007, with electrons or positrons of 27.5 GeV on protons of up to 920 GeV. It reached $x$ below $10^{-4}$ and found the steep rise of sea quarks and gluons toward small x that the inset shows.</p>`,
    },
    {
      title: 'Where the mass comes from',
      html: `<p>The mass of a hadron can be split using the QCD energy–momentum tensor. The split is not unique. Different schemes divide the same total differently, and the pieces depend on the renormalization scale. So treat any pie chart as one bookkeeping choice.</p>
<p>The pie uses the lattice QCD result of Yang et al. (2018), in the $\\overline{\\text{MS}}$ scheme at 2 GeV:</p>
<table class="data"><tr><th>Piece</th><th>Share of $m_p$</th></tr>
<tr><td>Quark mass terms (u, d, s)</td><td>9(2)%</td></tr>
<tr><td>Quark kinetic and potential energy</td><td>33(6)%</td></tr>
<tr><td>Gluon field energy</td><td>37(6)%</td></tr>
<tr><td>Trace anomaly</td><td>23(1)%</td></tr></table>
<p>The central values add to 102% because of rounding. The quark mass term, about 80 MeV, is larger than $2m_u + m_d \\approx 9$ MeV. It counts how much the proton's mass changes when quark masses change, which includes virtual strange quarks and the response of the whole proton. That is why the white sliver sits inside the amber slice. The trace anomaly is a purely quantum effect. It exists because QCD has a built-in scale even when quarks are massless.</p>
<p>Lattice QCD computes hadron masses directly from the QCD equations on a spacetime grid. Dürr et al. (2008) reproduced the light hadron masses to a few percent. That is the firmest evidence that the nucleon mass really does come from QCD dynamics.</p>`,
    },
    {
      title: 'The proton spin puzzle',
      html: `<p>In the simple quark model the three quark spins add to the proton's spin of $\\tfrac12$. In 1987 the European Muon Collaboration (EMC) at CERN scattered polarised muons off polarised protons. They found that quark spins carry a fraction consistent with zero, $0.12 \\pm 0.17$. This became known as the proton spin crisis.</p>
<p>Later experiments at SLAC, CERN (SMC, COMPASS) and DESY (HERMES) settled on about 25 to 35% at a few GeV². The rest must come from gluon spin and from orbital motion of quarks and gluons:</p>
$$\\tfrac12 = \\tfrac12\\Delta\\Sigma + \\Delta G + L_q + L_g.$$
<p>Polarised proton collisions at RHIC show that gluons carry a positive share of the spin, but the size is still uncertain. How the rest splits between the terms is an open question. It is a major goal of the Electron–Ion Collider being built at Brookhaven.</p>`,
    },
    {
      title: 'The proton radius puzzle',
      html: `<p>For decades the proton charge radius came from electron scattering and hydrogen spectroscopy, giving about 0.88 fm. In 2010 the CREMA team at PSI measured the Lamb shift in muonic hydrogen, where a muon replaces the electron. The muon orbits 200 times closer and feels the proton's size much more. They found 0.842 fm, disagreeing with the old value by about 5 standard deviations.</p>
<p>Since then, new measurements with ordinary hydrogen (York 2019) and a new low-angle electron scattering experiment (PRad at Jefferson Lab, 2019) have mostly agreed with the small value. CODATA 2018 adopted 0.8414 fm. Most physicists now regard the puzzle as largely resolved in favour of about 0.84 fm. Why some older measurements came out large is still debated, and a few newer results still sit high.</p>`,
    },
  ],
  challenges: [
    {
      id: 'sea',
      title: 'Drown in the sea',
      prompt: 'Raise Q² until, at $x = 10^{-3}$, sea quarks outnumber valence quarks by at least 100 to 1. The marker in the inset shows the ratio.',
      hint: 'Keep the sea visible and push Q² toward the top of its range. The sea rises faster at small x the finer you look.',
      check: (s) => s.showSea === true && (s.seaRatio as number) >= 100,
    },
    {
      id: 'neutron',
      title: 'Neutral ground',
      prompt: 'Switch to a neutron and confirm that its quark charges add to exactly zero.',
      hint: 'Use the nucleon selector. Up is $+\\tfrac23$, down is $-\\tfrac13$.',
      check: (s) => s.nucleon === 'neutron' && Math.abs(s.charge as number) < 1e-9,
    },
    {
      id: 'higgs',
      title: 'Not the Higgs',
      prompt: 'Open the mass pie and find that the Higgs-given masses of the valence quarks are less than 2% of the nucleon mass.',
      hint: 'Turn on the mass pie and read the quark mass fraction readout.',
      check: (s) => s.pie === true && (s.quarkMassFrac as number) < 0.02,
    },
    {
      id: 'gluons',
      title: 'Half the momentum',
      prompt: 'Hide the gluons but keep the sea. Show that the quarks and antiquarks left on screen carry only about half of the proton’s momentum (at most 62%).',
      hint: 'Turn off the gluons toggle and read "momentum shown". Higher Q² lowers it further.',
      check: (s) => s.showSea === true && s.showGluons === false && (s.momShown as number) <= 0.62,
    },
  ],
  caveats: `<p>The picture of three coloured balls, springs and popping pairs is a cartoon. Quarks and gluons are quantum fields, colour is not a colour, and the "sea" is not a fixed set of particles. The number of sea pairs and gluons on screen grows with the number of partons above $x = 10^{-4}$, but it is scaled down and is not a literal count.</p>
<p>The parton curves are a schematic model with the right sum rules and the right trends, not a fit to data. Real fits (CT, MSHT, NNPDF, HERAPDF) use more flexible shapes and next-to-next-to-leading-order evolution, and treat each flavour separately. The model evolves only the momentum fractions, at leading order with a one-loop coupling and four flavours. The shapes are also not trustworthy at the lowest Q², where perturbative QCD breaks down.</p>
<p>The mass decomposition is scheme and scale dependent and carries uncertainties of several percent per piece.</p>`,
  further: [
    { label: 'Proton (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Proton' },
    { label: 'Parton distribution functions (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Parton_(particle_physics)' },
    { label: 'Yang et al., Proton mass decomposition from the QCD energy momentum tensor, PRL 121, 212001 (2018)', url: 'https://doi.org/10.1103/PhysRevLett.121.212001' },
    { label: 'Proton spin crisis (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Proton_spin_crisis' },
  ],
};
