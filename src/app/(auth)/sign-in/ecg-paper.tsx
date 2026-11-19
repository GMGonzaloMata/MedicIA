// A repeating length of synthetic graph paper, not recorded patient data.
const intervals = [78, 82, 85, 81, 76, 73, 75, 79, 83, 86, 84, 80, 77, 74, 76, 78];
const stripWidth = intervals.reduce((sum, interval) => sum + interval, 0);
const leads = [
  { baseline: 34, r: 6, s: 3, t: 2.4, opacity: .55 },
  { baseline: 88, r: 31, s: 4, t: 9, opacity: 1 },
  { baseline: 142, r: 17, s: 6, t: 5.5, opacity: .8 },
  { baseline: 196, r: 3, s: 15, t: -4.5, opacity: .62 },
  { baseline: 250, r: 11, s: 9, t: 4, opacity: .72 },
];

function trace({ baseline, r, s, t }: (typeof leads)[number]) {
  let start = 0;
  let path = `M0 ${baseline}`;
  intervals.forEach((interval, index) => {
    const phase = 2 * Math.PI * index / intervals.length;
    const strength = 1 + .08 * Math.sin(3 * phase);
    const drift = 1.4 * Math.sin(2 * phase);
    const point = (time: number, height: number) =>
      `${(start + time * interval).toFixed(2)} ${(baseline + drift - height * strength).toFixed(2)}`;
    path += ` C${point(.06, 0)} ${point(.09, -.35)} ${point(.12, .3)}`;
    path += ` C${point(.16, 1)} ${point(.17, 4 + Math.cos(phase))} ${point(.20, 3)} S${point(.24, 0)} ${point(.28, 0)}`;
    path += ` L${point(.34, 0)} ${point(.365, -1.7)} ${point(.39, r)} ${point(.414, -s)} ${point(.45, .8)}`;
    path += ` C${point(.50, 1)} ${point(.53, -.3)} ${point(.55, .5)} C${point(.60, 1)} ${point(.61, t)} ${point(.66, t)} S${point(.72, .4)} ${point(.80, .2)} Q${point(.91, -.6)} ${point(1, drift)}`;
    start += interval;
  });
  return path;
}

export function EcgPaper() {
  return (
    <svg className="medicia-login-trace" viewBox="0 0 600 284" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="ecg-fine" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M5 0H0V5" stroke="currentColor" strokeOpacity=".09" strokeWidth=".55" />
        </pattern>
        <pattern id="ecg-paper" width="25" height="25" patternUnits="userSpaceOnUse">
          <rect width="25" height="25" fill="url(#ecg-fine)" />
          <path d="M25 0H0V25" stroke="currentColor" strokeOpacity=".21" strokeWidth=".7" />
        </pattern>
        <g id="ecg-ink" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round">
          {leads.map((lead) => <path key={lead.baseline} opacity={lead.opacity} d={trace(lead)} />)}
        </g>
      </defs>
      <rect width="600" height="284" fill="url(#ecg-paper)" />
      <g className="medicia-login-ribbon" style={{ transformBox: "fill-box" }}>
        <use href="#ecg-ink" />
        <use href="#ecg-ink" x={stripWidth} />
      </g>
    </svg>
  );
}
