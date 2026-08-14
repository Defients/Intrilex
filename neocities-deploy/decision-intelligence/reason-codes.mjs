import { hashCanonical } from "../shared-browser.js";

export const REASON_CODE_VOCABULARY = Object.freeze({
  WIN_PRESSURE_SCORE: { display: 'Win-pressure: playing for immediate score to reach goal', category: 'terminal' },
  PRESERVE_RESPONSE: { display: 'Conserving response resources for higher-value opportunity', category: 'resource' },
  BOARD_CONTROL_GAIN: { display: 'Gaining board control through disruption', category: 'control' },
  BOARD_CONTROL_MAINTAIN: { display: 'Maintaining existing board control', category: 'control' },
  TEMPO_ADVANCE: { display: 'Advancing tempo through mini-turn efficiency', category: 'tempo' },
  TEMPO_RECOVERY: { display: 'Recovering lost tempo', category: 'tempo' },
  HAND_REFILL: { display: 'Refilling hand from low card count', category: 'resource' },
  VALUE_EXCHANGE_FAVORABLE: { display: 'Favorable card-value exchange', category: 'value' },
  VALUE_EXCHANGE_MARGINAL: { display: 'Marginal card-value exchange', category: 'value' },
  COUNTER_OPPONENT_ROOT: { display: 'Countering opponent root effect', category: 'response' },
  COUNTER_OPPONENT_TOP: { display: 'Countering opponent response on top of Stack', category: 'response' },
  DECLINE_WITH_OPTIONS: { display: 'Declining response while legal alternatives exist', category: 'response' },
  DECLINE_OWN_TOP: { display: 'Declining because own item is on top of Stack', category: 'response' },
  EFFECT_UTILITY: { display: 'Effect provides board or resource utility', category: 'effect' },
  EFFECT_GOAL_PROGRESS: { display: 'Effect advances goal progress', category: 'effect' },
  ANCHOR_SETUP: { display: 'Anchor setup for future value', category: 'effect' },
  ADVANCED_ULTIMATE: { display: 'Advanced mechanic with ultimate impact', category: 'advanced' },
  ADVANCED_BOARD_LOCK: { display: 'Advanced mechanic locking board state', category: 'advanced' },
  ADVANCED_UTILITY: { display: 'Advanced mechanic providing utility', category: 'advanced' },
  SCUTTLE_REMOVAL: { display: 'Removing opponent board presence', category: 'control' },
  SWAP_BAR_VALUE: { display: 'Swap bar selection for card value', category: 'resource' },
  EXHAUSTED_FORCED: { display: 'Forced exhausted pass — no legal mini-turn action', category: 'terminal' },
  UNIFORM_RANDOM: { display: 'Uniform random selection (exploration policy)', category: 'exploration' },
  MAX_SCORE_PRESSURE: { display: 'Maximum score pressure heuristic', category: 'heuristic' },
  MAX_BOARD_AND_RESPONSE_CONTROL: { display: 'Maximum board and response control heuristic', category: 'heuristic' },
  MAX_TEMPO: { display: 'Maximum tempo heuristic', category: 'heuristic' },
  MAX_EXPECTED_VALUE: { display: 'Maximum expected value heuristic', category: 'heuristic' },
  LOW_MARGIN_ALTERNATIVE: { display: 'Low-margin alternative selected over default', category: 'value' },
  RISK_AVERSE: { display: 'Risk-averse selection avoiding potential counter', category: 'risk' },
  RISK_TOLERANT: { display: 'Risk-tolerant selection accepting counter exposure', category: 'risk' },
  FOUNDATION_TRIGGER: { display: '10♣ Foundation: queued scoring trigger for bonus score opportunity', category: 'advanced' },
  MIMIC_COPY: { display: '10♦ Mimic: copying generated effect from Graveyard target', category: 'advanced' },
  START_CHILD_HOLD: { display: '⭐2 Hold: seizing enemy OTT for Start-child continuation', category: 'advanced' },
  SUPER_THREE_PRIVATE: { display: '⭐3 Private: hidden hand raid with expanded capacity', category: 'advanced' },
  SUPER_FIVE_PRIVATE: { display: '⭐5 Private: expanded recycle with multi-rummage', category: 'advanced' },
  SUPER_SIX_PRIVATE: { display: '⭐6 Private: deep dig with expanded draw and keep', category: 'advanced' },
  SUPER_SEVEN_SEQUENTIAL: { display: '⭐7 Sequential: triple topdeck with flexible assignment', category: 'advanced' },
  VOLTAGE_THREE_CHOICE: { display: 'Voltage 3: threshold choice between hand draw and GY scoring', category: 'advanced' },
  VOLTAGE_FOUR_PREDICTION: { display: 'Voltage 4: private prediction of topdeck rank for scoring', category: 'advanced' },
  VOLTAGE_FIVE_REFINE: { display: 'Voltage 5: refine branch with discard-to-draw continuation', category: 'advanced' },
  SCORING_RIDER: { display: 'Special scoring rider: 7, 10♣, or BJ scoring in Advanced Core', category: 'advanced' },
  SUDDEN_DEATH_ACTIVATION: { display: 'Sudden Death: activating terminal countdown to force resolution', category: 'terminal' }
});

export const REASON_CODE_VERSION = '1.0.0';

export function reasonCodeDisplay(code) {
  return REASON_CODE_VOCABULARY[code]?.display ?? code;
}

export function reasonCodeCategory(code) {
  return REASON_CODE_VOCABULARY[code]?.category ?? 'unknown';
}

export function reasonCodeVocabularyHash() {
  return hashCanonical({ version: REASON_CODE_VERSION, codes: Object.keys(REASON_CODE_VOCABULARY).sort() });
}

export function validateReasonCodes(codes) {
  const unknown = [];
  for (const code of codes) {
    if (!REASON_CODE_VOCABULARY[code]) unknown.push(code);
  }
  return { valid: unknown.length === 0, unknown };
}
