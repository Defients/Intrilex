// Bounded chart samples only; research semantics live in the shared domain.
export function pushChartSample(samples, agg, max = 360) {
  const clean = agg.completedClean || 0;
  samples.push({
    n: agg.completed,
    a: clean > 0 ? (agg.winsA / clean) * 100 : null,
    b: clean > 0 ? (agg.winsB / clean) * 100 : null,
    d: clean > 0 ? (agg.draws / clean) * 100 : null,
  });
  if (samples.length > max * 2) {
    let w = 0;
    for (let i = 0; i < samples.length; i += 1) {
      if (i % 2 === 0 || i === samples.length - 1) samples[w++] = samples[i];
    }
    samples.length = w;
  }
  return samples;
}
