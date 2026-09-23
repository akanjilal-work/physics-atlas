import type { TopicContent } from '../../core/types.ts';

const PC2 = 0.592746;
const PC3 = 0.3116077;

export const content: TopicContent = {
  intuition: `
<p class="lead">Take a big block made of tiny cubes. Fill each cube at random, with probability $p$, and leave the rest empty. Now ask one question. Is there a path of filled cubes, each touching the next face to face, from the top of the block to the bottom?</p>
<p>When $p$ is small the answer is no. Filled cubes form little islands that do not touch. As you raise $p$ the islands grow and merge. You might expect the chance of a path to creep up slowly. It does not. For a large block it jumps from almost zero to almost one over a very narrow range of $p$. That special value is the <strong>percolation threshold</strong> $p_c$.</p>
<p>The surprise is that nothing local changes at $p_c$. Each cube still only knows about its neighbours. Yet the whole block switches from "cut off" to "connected". It is a phase transition with no energy and no temperature, only geometry and chance.</p>
<p>In the scene, each coloured cube is a filled site. One colour is one cluster, a group of cubes joined through shared faces. The faint slabs mark the top and bottom faces. When a cluster first touches both, it turns <span style="color:#f5b642">bright gold</span>. That is the spanning cluster.</p>
<p>Press <b>Sweep p</b>. Every site keeps the same random number the whole time, so raising $p$ only ever adds cubes. Watch the islands grow, then watch one of them suddenly reach across. Right at the threshold the spanning cluster is thin and full of holes at every scale. It is a <strong>fractal</strong>.</p>`,
  tryFirst: [
    'Press <b>Sweep p</b> and watch for the moment a gold cluster first links the top and bottom faces.',
    'Watch the corner plot. The largest-cluster fraction $P_\\infty$ stays near zero, then rises steeply just past the dashed $p_c$ line.',
    'Press <b>Fractal cluster</b> to show only the spanning cluster at the exact moment it forms. Orbit around it.',
    'Switch to <b>2D</b> and sweep again. The threshold moves from about 0.31 up to about 0.59.',
  ],
  equation: {
    tex: 'P_\\infty(p) \\;\\propto\\; (p - p_c)^{\\beta}, \\qquad p \\to p_c^{+}',
    caption: 'Just above the threshold, the fraction of sites in the infinite cluster grows as a power of the distance from the threshold. Below the threshold it is zero for an infinite lattice.',
    terms: [
      { tex: 'P_\\infty', name: 'Infinite-cluster fraction', meaning: 'The chance that a site belongs to the infinite cluster. On a finite lattice the page measures the largest cluster divided by the number of sites, $|C_{\\max}|/N$.', param: 'Pinf' },
      { tex: 'p', name: 'Occupation probability', meaning: 'Each site (or bond) is open with probability $p$, independently of all the others.', param: 'p' },
      { tex: 'p_c', name: 'Percolation threshold', meaning: `The value where an infinite cluster first appears. It depends on the lattice: about ${PC2.toFixed(4)} for sites on the square lattice, ${PC3.toFixed(4)} on the simple cubic lattice, and exactly $1/2$ for bonds on the square lattice.`, param: 'pc' },
      { tex: '\\beta', name: 'Critical exponent', meaning: 'Sets how steeply $P_\\infty$ rises. It depends only on the dimension: $\\beta = 5/36$ in 2D and $\\beta \\approx 0.41$ in 3D.', param: 'dim' },
    ],
  },
  physicsNotes: `
<h3>Site and bond percolation</h3>
<p>In <b>site</b> percolation each site is open with probability $p$. Two open sites are in the same cluster when a chain of open nearest neighbours joins them. In <b>bond</b> percolation every site is present, and each link between neighbours is open with probability $p$. Clusters are sites joined by open links. The lattice here has open edges. A cluster <em>spans</em> when it contains a site in the top row and a site in the bottom row.</p>
<h3>Finding clusters with union-find</h3>
<p>The page labels clusters with a <strong>union-find</strong> structure. Each site starts as its own cluster. For every open link between two open sites, the two clusters are merged. Each cluster keeps its size and two flags: does it touch the top face, and does it touch the bottom face. Merging adds sizes and combines flags. A cluster with both flags spans. With merging by size and path shortening, the whole lattice is labelled in time barely more than linear in $N$. The tests check every labelling against a plain breadth-first search.</p>
<h3>Fill p slowly</h3>
<p>Each site (or bond) gets one random number $r$ when the sample is drawn. It is open when $r < p$. Raising $p$ with the same numbers only ever adds sites, so clusters grow smoothly instead of flickering. Adding sites one at a time in order of $r$ gives $P_\\infty(p)$ for every $p$ in a single pass. This is the Newman and Ziff method (2000). It also gives the exact $p$ at which this sample first spans, shown as "spans at".</p>
<h3>What the readouts measure</h3>
<p>$P_\\infty$ is the largest cluster over $N$. The <b>mean cluster size</b> is</p>
$$S = \\frac{\\sum_s s^2 n_s}{\\sum_s s\\, n_s},$$
<p>summed over all clusters except the largest. It is the average size of the cluster that a randomly chosen finite-cluster site belongs to. It peaks at $p_c$ and would diverge as $|p - p_c|^{-\\gamma}$ on an infinite lattice. The check readout confirms that the cluster sizes add up to the number of occupied sites.</p>
<h3>Exponents</h3>
<p>In 2D the exponents are known exactly: $\\beta = 5/36$, $\\gamma = 43/18$, $\\nu = 4/3$ for the correlation length, and fractal dimension $D = 91/48 \\approx 1.896$. In 3D they come from simulations: $\\beta \\approx 0.41$, $\\gamma \\approx 1.80$, $\\nu \\approx 0.876$ and $D \\approx 2.52$. They obey $D = d - \\beta/\\nu$.</p>`,
  deep: [
    {
      title: 'Origins: Broadbent and Hammersley, 1957',
      html: `<p>Simon Broadbent and John Hammersley introduced percolation in 1957 in "Percolation processes I. Crystals and mazes". Broadbent was working on gas masks for coal miners. The question was how gas moves through the tangled pores of a carbon filter. If the pores are blocked at random, when does the gas stop getting through?</p>
<p>The word means filtering through, as water trickles through ground coffee in a percolator or a paper filter. They picked it to contrast with diffusion. In diffusion the randomness lives in the moving particle. In percolation it is frozen into the medium, and the fluid simply goes wherever the open paths lead.</p>
<p>They proved that on lattices like these the threshold lies strictly between 0 and 1, so there really is a transition to find. Harry Kesten proved in 1980 that bond percolation on the square lattice has $p_c = 1/2$ exactly. The proof uses a self-duality. The open bonds and the blocked bonds of the dual lattice play mirror roles, and at $p = 1/2$ they are statistically the same. For site percolation on the square lattice no exact value is known. Simulations pin it down as $p_c \\approx 0.592746$, good to about seven digits.</p>`,
    },
    {
      title: 'Why the threshold is lower in 3D',
      html: `<p>A path can only go where open sites are. In 2D a path blocked on its left and right has only one way forward. In 3D it can also step around an obstacle in front or behind. More neighbours per site means more ways to go round a closed site, so a lower density is enough.</p>
<p>The same idea gives an exact answer on a tree where each node has $z$ neighbours (the Bethe lattice). A branch that enters a site can continue along $z - 1$ others. The cluster stays finite on average when $p(z - 1) < 1$, so</p>
$$p_c^{\\text{tree}} = \\frac{1}{z - 1}.$$
<p>On a tree, loops never form. Real lattices have loops, which waste some open sites on redundant paths, so their thresholds are higher. For the simple cubic lattice, $z = 6$ gives the tree estimate $0.2$, compared with the true site value $0.3116$. For the square lattice $z = 4$ gives $1/3$, compared with $0.5927$.</p>
<p>On a finite lattice the spanning point of one sample scatters around $p_c$, with a spread that shrinks as $L^{-1/\\nu}$. It is also shifted a little, and the shift depends on boundaries and on what counts as spanning. At small sizes in 3D the median spanning point sits slightly above $p_c$.</p>`,
    },
    {
      title: 'Fractals and universality',
      html: `<p>Exactly at $p_c$ the spanning cluster has holes of every size, from one site to the whole lattice. Its mass inside a box of side $L$ grows as $L^{D}$ rather than $L^{d}$. In 2D, $D = 91/48$. So the cluster fills a vanishing fraction of the lattice as $L$ grows, even though it still reaches across. The tests check this. They measure the largest cluster at $p_c$ for $L$ from 16 to 128 and recover $D$ within 0.08.</p>
<p>The threshold depends on details. Site and bond thresholds differ. The triangular lattice has site $p_c = 1/2$ exactly. But the exponents $\\beta$, $\\gamma$, $\\nu$ and $D$ do not depend on those details. They are the same for sites and bonds, for square and triangular lattices, and even for discs dropped at random in a plane. They depend only on the dimension. This is <strong>universality</strong>. It is the reason a simple model can say something exact about messy real materials.</p>
<p>Percolation also connects to magnetism. Fortuin and Kasteleyn showed in 1972 that the $q$-state Potts model can be rewritten as a model of random clusters. The limit $q \\to 1$ is bond percolation, and $q = 2$ is the <a href="#/t/ising-model">Ising model</a>. The clusters that the Wolff algorithm flips in the Ising topic are exactly these clusters. The difference is that the Ising clusters are weighted by the spins, while percolation clusters are purely random.</p>`,
    },
    {
      title: 'Where percolation shows up',
      html: `<p><strong>Conductor-insulator composites.</strong> Mix metal or carbon particles into plastic. Below a threshold the mix insulates. Above it a connected network of particles carries current. The conductivity rises from zero as $(p - p_c)^{t}$, with $t \\approx 1.3$ in 2D and $t \\approx 2.0$ in 3D. For randomly placed spheres the threshold volume fraction is about 16 percent (Scher and Zallen, 1970). Conductive rubbers and antistatic plastics are designed with this in mind.</p>
<p><strong>Oil and water in rock.</strong> Oil sits in the pore space of rocks like sandstone. Whether it can flow to a well depends on whether the pores form a connected network across the reservoir. Percolation models are used to study permeability and how much oil can be recovered.</p>
<p><strong>Forest fires, as a model.</strong> Place trees on a grid with density $p$ and light one edge. Fire spreads only to neighbouring trees. In this toy model the fire crosses the forest only when $p$ is above $p_c$. Real fires depend on wind, slope and fuel, and jump gaps. The model shows the threshold idea, not a forecast.</p>
<p><strong>Epidemics, as a model.</strong> In a simple SIR model with a fixed infectious period, each contact passes infection with some fixed probability. The set of people who ever get infected is then a bond percolation cluster (Grassberger, 1983). A large outbreak becomes possible above a threshold. Real epidemics have uneven contact networks and changing behaviour, so this is a guide, not a prediction.</p>`,
    },
  ],
  challenges: [
    {
      id: 'span2d',
      title: 'Catch the 2D spanning point',
      prompt: `On the 2D lattice with site percolation and $L \\ge 64$, set $p$ so that a cluster has just started to span (within 0.01 of this sample's spanning point), and that point is within 0.02 of $p_c \\approx ${PC2.toFixed(4)}$.`,
      hint: 'Switch to <b>2D</b>, choose a size of 64 or more, and press <b>Sweep p</b>. It pauses when spanning first happens. If this sample spans far from $p_c$, press <b>New sample</b>.',
      check: (s) => s.dim === 2 && s.mode === 'site' && (s.L as number) >= 64 && s.spanning === true
        && (s.p as number) - (s.pSpan as number) <= 0.01 && Math.abs((s.p as number) - PC2) <= 0.02,
    },
    {
      id: 'span3d',
      title: 'Catch the 3D spanning point',
      prompt: `Do the same in 3D: site percolation, $L \\ge 20$, spanning has just begun, and $p$ is within 0.02 of $p_c \\approx ${PC3.toFixed(4)}$.`,
      hint: 'Sweep in 3D and let it pause at the gold flash. Small lattices scatter more, so use 30 or 40.',
      check: (s) => s.dim === 3 && s.mode === 'site' && (s.L as number) >= 20 && s.spanning === true
        && (s.p as number) - (s.pSpan as number) <= 0.01 && Math.abs((s.p as number) - PC3) <= 0.02,
    },
    {
      id: 'giant',
      title: 'A giant cluster',
      prompt: 'Raise $p$ until the largest cluster holds more than half of all sites, $P_\\infty > 0.5$.',
      hint: 'In 3D site percolation you need $p$ a bit above 0.5. The largest cluster can never hold more than the fraction $p$ of occupied sites.',
      check: (s) => s.touched === true && (s.Pinf as number) > 0.5,
    },
    {
      id: 'lower3d',
      title: 'Easier to connect in 3D',
      prompt: 'Find a spanning cluster in 2D and in 3D with site percolation. Show that the 3D spanning point is lower.',
      hint: 'Sweep once in each dimension. The page records the spanning point each time a site-percolation sample spans.',
      check: (s) => (s.span2 as number) > 0 && (s.span3 as number) > 0 && (s.span3 as number) < (s.span2 as number),
    },
  ],
  caveats: `<p><strong>Finite lattices.</strong> A true threshold only exists for an infinite lattice. On an $L$-sided lattice the transition is smeared over a range of order $L^{-1/\\nu}$, each sample spans at a slightly different $p$, and $P_\\infty$ below $p_c$ is small but not zero. The corner curve is one sample, not an average.</p>
<p><strong>Open boundaries, one direction.</strong> Spanning is tested only from the top face to the bottom face, with open side walls. Other choices, such as wrapping edges or spanning in any direction, shift the finite-size spanning point a little. They do not change $p_c$.</p>
<p><strong>Models, not materials.</strong> Real composites, rocks, forests and populations have correlations, uneven shapes and dynamics that pure random percolation leaves out. The thresholds quoted for lattices apply only to those lattices. The universal exponents are the part that carries over most reliably.</p>`,
  further: [
    { label: 'Percolation theory on Wikipedia', url: 'https://en.wikipedia.org/wiki/Percolation_theory' },
    { label: 'S. R. Broadbent and J. M. Hammersley, Percolation processes I, Proc. Camb. Phil. Soc. 53, 629 (1957)', url: 'https://doi.org/10.1017/S0305004100032680' },
    { label: 'M. E. J. Newman and R. M. Ziff, Efficient Monte Carlo algorithm and high-precision results for percolation, PRL 85, 4104 (2000)', url: 'https://doi.org/10.1103/PhysRevLett.85.4104' },
    { label: 'Percolation threshold values on Wikipedia', url: 'https://en.wikipedia.org/wiki/Percolation_threshold' },
  ],
};
