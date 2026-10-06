// Single source of truth for Observatory metric identity. Pure (no imports):
// canonical analytics imports it directly and scripts/build.mjs copies it
// verbatim into apps/lab-web/dist/shared-analytics/ for the browser, so the
// formula text — and therefore every formulaHash — cannot diverge.
//   scale:       'difference' | 'odds-ratio' | 'proportion' | 'descriptive'
//   denominator: what the rate (and its interval) is computed over
export const ANALYTICS_SCHEMA_VERSION = '4.2.0';

export const METRIC_DEFINITIONS = Object.freeze({
  'win-rate': { version: '4.2.0', formula: 'wins / decisive completed matches', uncertainty: 'Wilson 95% interval', scale: 'proportion', denominator: 'decisive cross-policy games (draws, aborts and self-play excluded from point estimate and interval alike)' },
  'win-rate-all-games': { version: '4.3.0', formula: 'wins / all eligible cross-policy games including draws and aborts', uncertainty: 'Wilson 95% interval', scale: 'proportion', denominator: 'all eligible cross-policy games' },
  'participant-prevalence': { version: '4.2.0', formula: 'unique participant-match pairs that selected entity ≥1 / all eligible participant-match records', uncertainty: 'Wilson 95% interval', scale: 'proportion', denominator: 'participant-match records' },
  'match-prevalence': { version: '4.2.0', formula: 'unique matches in which entity selected ≥1 / all eligible matches', uncertainty: 'Wilson 95% interval', scale: 'proportion', denominator: 'matches' },
  'pick-rate-when-legal': { version: '4.2.0', formula: 'selections / distinct legal decision windows', uncertainty: 'Wilson 95% interval; N/A when zero legal opportunities', scale: 'proportion', denominator: 'decision frames in which the entity was legal' },
  'selection-frequency': { version: '4.2.0', formula: 'total selections / eligible participant-match records', uncertainty: 'descriptive rate', scale: 'descriptive', denominator: 'participant-match records' },
  'resolution-rate': { version: '4.2.0', formula: 'resolved declarations / accepted declarations', uncertainty: 'Wilson 95% interval', scale: 'proportion', denominator: 'accepted declarations' },
  'response-play-rate': { version: '4.2.0', formula: 'response plays / lawful response opportunities', uncertainty: 'Wilson 95% interval', scale: 'proportion', denominator: 'lawful response opportunities' },
  'counter-efficiency': { version: '4.2.0', formula: 'opponent value prevented / own card and tempo cost', uncertainty: 'match-clustered deterministic bootstrap', scale: 'descriptive', denominator: 'own card and tempo cost' },
  'synergy-interaction': { version: '4.3.0', formula: 'exp(inverse-variance pooled log-odds A×B interaction over contributing policy|seat|profile strata); strata with an empty cohort, outcome separation or degenerate variance are excluded and disclosed; shrinkage log(OR)·n/(n+25) toward OR=1 with n = contributing observations; direction from sign(log OR)', uncertainty: 'Wald CI on log(OR) from pooled SE, exponentiated; BH FDR over modeled pairs; evidence graded on log(OR)', scale: 'odds-ratio', denominator: 'decisive participant-match records in contributing strata' },
  'immediate-point-impact': { version: '4.2.0', formula: 'sum actor-perspective secured point delta / resolved selections with point data', uncertainty: 'match-clustered deterministic bootstrap', scale: 'descriptive', denominator: 'resolved selections with point data' },
  'raw-win-association': { version: '4.2.0', formula: 'P(win|selected) - P(win|not selected)', uncertainty: 'two-proportion z-test CI', scale: 'difference', denominator: 'decisive participant-match records' },
  'adjusted-win-association': { version: '4.2.0', formula: 'stratified win-rate differential controlling for policy, seat, profile', uncertainty: 'Mantel-Haenszel-style stratified estimator CI', scale: 'difference', denominator: 'decisive participant-match records in strata containing both cohorts' },
  'policy-fingerprint': { version: '4.2.0', formula: 'policy event/action count / policy games', uncertainty: 'descriptive; no optimality claim', scale: 'descriptive', denominator: 'policy participations' },
});

/**
 * @param {(text: string) => string} sha256Hex - platform SHA-256 (node:crypto or browser shim)
 */
export function metricRegistryWithHashesUsing(sha256Hex) {
  return Object.fromEntries(Object.entries(METRIC_DEFINITIONS).map(([id, metric]) => [id, { metricId: id, ...metric, formulaHash: sha256Hex(metric.formula) }]));
}
