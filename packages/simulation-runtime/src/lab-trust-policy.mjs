/** Wave 0 containment, not evidence certification. Remove each restriction
 * only after its remediation acceptance gate passes. No runtime override:
 * imported metadata, a UI toggle or a test fixture cannot grant authority. */
export const LAB_TRUST_POLICY = Object.freeze({
  contract: 'intrilex-lab-containment@1',
  classification: 'EXPLORATORY',
  automaticPromotion: false,
  confirmatoryComparison: false,
  promotionReason: 'LAB_WAVE0_AUTOMATIC_PROMOTION_BLOCKED',
  comparisonReason: 'LAB_WAVE0_CONFIRMATORY_COMPARISON_BLOCKED',
  notice: 'Exploratory evidence only. Confirmatory claims and automatic promotion are suspended until identity, evidence admission and challenge reservation are repaired.',
});
