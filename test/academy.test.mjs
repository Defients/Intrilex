// ═══════════════════════════════════════════════════════════════
// academy.test.mjs — Academy 2.0 tutorial tests (Phase 1 + Phase 2)
//
// Tests the tiered curriculum, lesson definitions, progress tracking
// (v2 + v1 migration), briefing/recap/panel renderers, AcademyController
// lifecycle, route integration, live objective detection (Phase 2),
// coachmark state machine (Phase 2), and adaptive hints (Phase 2).
//
// Backward compatibility: v1 lesson IDs and the flat ACADEMY_LESSONS
// export are still tested to ensure migration paths work.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const academySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-renderer.mjs'), 'utf8');
const curriculumSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/curriculum.mjs'), 'utf8');
const progressSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-progress.mjs'), 'utf8');
const briefingSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-briefing.mjs'), 'utf8');
const recapSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-recap.mjs'), 'utf8');
const panelSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-panel.mjs'), 'utf8');
const controllerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-controller.mjs'), 'utf8');
const detectorSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-detectors.mjs'), 'utf8');
const coachmarkSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-coachmarks.mjs'), 'utf8');
const masterySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/academy/academy-mastery.mjs'), 'utf8');
const playAppSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const playStateSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-state.js'), 'utf8');
const routerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/router.js'), 'utf8');
const hubSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-hub.mjs'), 'utf8');
const seoSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/seo-metadata.js'), 'utf8');
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');
const terminalSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-terminal.mjs'), 'utf8');
const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
const boardEventsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/board-events.js'), 'utf8');

// ── Lesson definitions (v2 curriculum) ──

test('Academy: CURRICULUM has 10+ lessons across 3 tiers', () => {
  assert.ok(curriculumSrc.includes('export const CURRICULUM'), 'curriculum.mjs must export CURRICULUM');
  assert.ok(curriculumSrc.includes('TierId.FOUNDATIONS'), 'Must have foundations tier');
  assert.ok(curriculumSrc.includes('TierId.MECHANICS'), 'Must have mechanics tier');
  assert.ok(curriculumSrc.includes('TierId.APPLIED'), 'Must have applied tier');
  // Count lesson objects by counting 'id:' fields in the CURRICULUM array
  const lessonCount = (curriculumSrc.match(/id:\s*'[^']+',\s*\n\s*tier:/g) || []).length;
  assert.ok(lessonCount >= 10, `Must have at least 10 lessons (found ${lessonCount})`);
});

test('Academy: lessons cover core mechanics (v2 ids)', () => {
  assert.ok(curriculumSrc.includes('foundations-01-draw'), 'Must have Draw & Score lesson');
  assert.ok(curriculumSrc.includes('mechanics-01-scuttle'), 'Must have Scuttle lesson');
  assert.ok(curriculumSrc.includes('mechanics-04-respond'), 'Must have Respond & Counter lesson');
  assert.ok(curriculumSrc.includes('applied-01-royals'), 'Must have Royal Cards lesson');
  assert.ok(curriculumSrc.includes('applied-03-graduation'), 'Must have Graduation lesson');
});

test('Academy: v1 lesson IDs mapped for migration', () => {
  assert.ok(curriculumSrc.includes('V1_TO_V2_LESSON_MAP'), 'Must export v1→v2 migration map');
  assert.ok(curriculumSrc.includes("'draw-and-score'"), 'Must map draw-and-score');
  assert.ok(curriculumSrc.includes("'card-effects'"), 'Must map card-effects');
  assert.ok(curriculumSrc.includes("'respond-and-counter'"), 'Must map respond-and-counter');
  assert.ok(curriculumSrc.includes("'royal-cards'"), 'Must map royal-cards');
  assert.ok(curriculumSrc.includes("'win-the-game'"), 'Must map win-the-game');
});

test('Academy: each lesson has briefing, scenario, completion, and recap', () => {
  assert.ok(curriculumSrc.includes('briefing:'), 'Lessons must have briefing');
  assert.ok(curriculumSrc.includes('scenario:'), 'Lessons must have scenario');
  assert.ok(curriculumSrc.includes('completion:'), 'Lessons must have completion');
  assert.ok(curriculumSrc.includes('recap:'), 'Lessons must have recap');
  // All lessons should use valid baseline AI policies for beginner practice
  const validPolicies = ['score-rush', 'control', 'tempo', 'value', 'random-legal'];
  const found = validPolicies.some(p => curriculumSrc.includes(`aiPolicyId: '${p}'`));
  assert.ok(
    found,
    'Lessons should use valid baseline AI policies (score-rush, control, tempo, value, random-legal)'
  );
});

test('Academy: all lessons use first-contact profile', () => {
  assert.ok(
    curriculumSrc.includes("'first-contact-trigger-closure'"),
    'Curriculum lessons must use the first-contact-trigger-closure profile'
  );
  assert.ok(
    controllerSrc.includes('first-contact-trigger-closure') || curriculumSrc.includes('first-contact-trigger-closure'),
    'Controller/curriculum must reference first-contact-trigger-closure profile'
  );
});

test('Academy: scenario data model has Phase-2 extension points', () => {
  assert.ok(curriculumSrc.includes('ScenarioType'), 'Must export ScenarioType enum');
  assert.ok(curriculumSrc.includes('SCRIPTED'), 'Must have SCRIPTED scenario type');
  assert.ok(curriculumSrc.includes('SEMI_SCRIPTED'), 'Must have SEMI_SCRIPTED scenario type');
  assert.ok(curriculumSrc.includes('SEEDED'), 'Must have SEEDED scenario type');
  assert.ok(curriculumSrc.includes('OPEN'), 'Must have OPEN scenario type');
  assert.ok(curriculumSrc.includes('setupCommands'), 'Scenario must have setupCommands field (Phase 2)');
  assert.ok(curriculumSrc.includes('aiScript'), 'Scenario must have aiScript field (Phase 2)');
});

test('Academy: adaptation config has Phase-3 extension points', () => {
  assert.ok(curriculumSrc.includes('adaptation:'), 'Lessons must have adaptation config');
  assert.ok(curriculumSrc.includes('hintThreshold'), 'Adaptation must have hintThreshold');
  assert.ok(curriculumSrc.includes('masteryReps'), 'Adaptation must have masteryReps');
  assert.ok(curriculumSrc.includes('mistakeHints'), 'Adaptation must have mistakeHints (Phase 3)');
});

// ── Backward compatibility (v1 flat array) ──

test('Academy: ACADEMY_LESSONS flat array still exported', () => {
  assert.ok(
    academySrc.includes('ACADEMY_LESSONS'),
    'Academy renderer must still export ACADEMY_LESSONS for backward compatibility'
  );
  // Count lesson objects by counting 'id:' fields in the mapped array
  const lessonCount = (academySrc.match(/id:\s*l\.id/g) || []).length;
  assert.ok(lessonCount >= 1, `ACADEMY_LESSONS must be derived from CURRICULUM (found ${lessonCount})`);
});

// ── Progress tracking (v2) ──

test('Academy: v2 progress persistence functions exist', () => {
  assert.ok(
    progressSrc.includes('export function loadProgress'),
    'academy-progress.mjs must export loadProgress'
  );
  assert.ok(
    progressSrc.includes('export function saveProgress'),
    'academy-progress.mjs must export saveProgress'
  );
  assert.ok(
    progressSrc.includes('export function markLessonComplete'),
    'academy-progress.mjs must export markLessonComplete'
  );
  assert.ok(
    progressSrc.includes("'intrilex:academy-progress-v2'"),
    'Progress must be stored in localStorage under intrilex:academy-progress-v2'
  );
});

test('Academy: v1 → v2 migration exists', () => {
  assert.ok(
    progressSrc.includes('export function migrateFromV1'),
    'academy-progress.mjs must export migrateFromV1'
  );
  assert.ok(
    progressSrc.includes("'intrilex:academy-progress'"),
    'Migration must read from v1 key intrilex:academy-progress'
  );
  assert.ok(
    progressSrc.includes('V1_TO_V2_LESSON_MAP'),
    'Migration must use V1_TO_V2_LESSON_MAP'
  );
});

test('Academy: tier unlock logic exists', () => {
  assert.ok(
    progressSrc.includes('export function recomputeTierState'),
    'Must export recomputeTierState'
  );
  assert.ok(
    progressSrc.includes('export function recomputeLessonUnlockState'),
    'Must export recomputeLessonUnlockState'
  );
  assert.ok(
    progressSrc.includes('export function isTierUnlocked'),
    'Must export isTierUnlocked'
  );
  assert.ok(
    progressSrc.includes('export function isFoundationsComplete'),
    'Must export isFoundationsComplete'
  );
});

test('Academy: renderer delegates to academy-progress.mjs', () => {
  assert.ok(
    academySrc.includes('getCompletedLessonIds'),
    'Renderer must delegate to getCompletedLessonIds'
  );
  assert.ok(
    academySrc.includes('markCompleteV2'),
    'Renderer must delegate to markLessonComplete v2'
  );
});

// ── Briefing screen ──

test('Academy: briefing renderer exists with objectives', () => {
  assert.ok(briefingSrc.includes('export function renderBriefing'), 'Must export renderBriefing');
  assert.ok(briefingSrc.includes('data-testid="academy-briefing"'), 'Briefing must have data-testid');
  assert.ok(briefingSrc.includes('academy-briefing-objectives'), 'Briefing must show objectives');
  assert.ok(briefingSrc.includes('data-action="academy-start-lesson"'), 'Briefing must have start button');
  assert.ok(briefingSrc.includes('data-action="academy-skip-briefing"'), 'Briefing must have skip button');
});

test('Academy: briefing skip preference persisted', () => {
  assert.ok(briefingSrc.includes('shouldSkipBriefing'), 'Must export shouldSkipBriefing');
  assert.ok(briefingSrc.includes('setSkipBriefing'), 'Must export setSkipBriefing');
  assert.ok(briefingSrc.includes('intrilex:academy-skip-briefing:'), 'Must use skip-briefing key prefix');
});

// ── Recap screen ──

test('Academy: recap renderer exists with performance summary', () => {
  assert.ok(recapSrc.includes('export function renderRecap'), 'Must export renderRecap');
  assert.ok(recapSrc.includes('data-testid="academy-recap"'), 'Recap must have data-testid');
  assert.ok(recapSrc.includes('data-testid="academy-recap-objectives"'), 'Recap must show objectives');
  assert.ok(recapSrc.includes('data-testid="academy-recap-stats"'), 'Recap must show stats');
  assert.ok(recapSrc.includes('data-testid="academy-recap-takeaway"'), 'Recap must show takeaway');
  assert.ok(recapSrc.includes('data-action="academy-next-lesson"'), 'Recap must have next-lesson button');
  assert.ok(recapSrc.includes('data-action="academy-retry-lesson"'), 'Recap must have retry button');
});

// ── Objective panel ──

test('Academy: objective panel renderer exists', () => {
  assert.ok(panelSrc.includes('export function renderObjectivePanel'), 'Must export renderObjectivePanel');
  assert.ok(panelSrc.includes('data-testid="academy-objective-panel"'), 'Panel must have data-testid');
  assert.ok(panelSrc.includes('academy-objective-item'), 'Panel must have objective items');
  assert.ok(panelSrc.includes('academy-objective-check'), 'Panel must have objective checks');
  assert.ok(panelSrc.includes('data-action="academy-toggle-panel"'), 'Panel must have toggle button');
  assert.ok(panelSrc.includes('collapsed'), 'Panel must support collapsed state');
});

// ── AcademyController ──

test('Academy: AcademyController class exists with lifecycle phases', () => {
  assert.ok(controllerSrc.includes('export class AcademyController'), 'Must export AcademyController class');
  assert.ok(controllerSrc.includes('AcademyPhase'), 'Must export AcademyPhase enum');
  assert.ok(controllerSrc.includes('BRIEFING'), 'Must have BRIEFING phase');
  assert.ok(controllerSrc.includes('MATCH'), 'Must have MATCH phase');
  assert.ok(controllerSrc.includes('RECAP'), 'Must have RECAP phase');
});

test('Academy: AcademyController has lifecycle methods', () => {
  assert.ok(controllerSrc.includes('beginBriefing'), 'Must have beginBriefing');
  assert.ok(controllerSrc.includes('buildMatchSetup'), 'Must have buildMatchSetup');
  assert.ok(controllerSrc.includes('beginMatch'), 'Must have beginMatch');
  assert.ok(controllerSrc.includes('onMatchEnd'), 'Must have onMatchEnd');
  assert.ok(controllerSrc.includes('retry'), 'Must have retry');
  assert.ok(controllerSrc.includes('destroy'), 'Must have destroy');
});

test('Academy: AcademyController has Phase 2 hooks (no-op in Phase 1)', () => {
  assert.ok(controllerSrc.includes('onSessionEvents'), 'Must have onSessionEvents hook (Phase 2)');
  assert.ok(controllerSrc.includes('dispatchCoachmark'), 'Must have dispatchCoachmark hook (Phase 2)');
  assert.ok(controllerSrc.includes('setObjectiveMet'), 'Must have setObjectiveMet (Phase 2)');
});

test('Academy: AcademyController computes mastery score', () => {
  assert.ok(controllerSrc.includes('computeMasteryScore'), 'Must export computeMasteryScore');
  // Phase 3: mastery score now delegates to academy-mastery.mjs
  assert.ok(controllerSrc.includes('computeMasteryScoreV3'), 'Must use Phase 3 mastery engine');
  assert.ok(masterySrc.includes('0.15'), 'Mastery engine must penalize hints (0.15)');
  assert.ok(masterySrc.includes('0.20'), 'Mastery engine must penalize retries (0.20)');
});

test('Academy: AcademyController validates scenario contract', () => {
  assert.ok(controllerSrc.includes('validateLessonScenario'), 'Must export validateLessonScenario');
  assert.ok(controllerSrc.includes('setupCommands'), 'Validator must check setupCommands for scripted');
});

// ── Renderer (tiered) ──

test('Academy: renderAcademy function exists', () => {
  assert.ok(
    academySrc.includes('export function renderAcademy'),
    'Must export renderAcademy'
  );
  assert.ok(
    academySrc.includes('data-testid="academy"'),
    'renderAcademy must have data-testid="academy"'
  );
});

test('Academy: renderer shows progress bar', () => {
  assert.ok(
    academySrc.includes('data-testid="academy-progress"'),
    'Renderer must show progress bar'
  );
  assert.ok(
    academySrc.includes('academy-progress-fill'),
    'Progress bar must have fill element'
  );
});

test('Academy: renderer shows tiered lesson cards with testids', () => {
  assert.ok(
    academySrc.includes('data-testid="academy-lesson-'),
    'Each lesson card must have a data-testid'
  );
  assert.ok(
    academySrc.includes('data-testid="academy-tier-'),
    'Each tier section must have a data-testid'
  );
});

test('Academy: renderer supports locked/complete/available/in-progress states', () => {
  assert.ok(
    academySrc.includes('locked') && academySrc.includes('complete') && academySrc.includes('available'),
    'Renderer must support locked, complete, and available lesson states'
  );
  assert.ok(
    academySrc.includes('in-progress'),
    'Renderer must support in-progress lesson state'
  );
  assert.ok(
    academySrc.includes('LessonStatus'),
    'Renderer must use LessonStatus enum'
  );
});

test('Academy: findLesson helper exists', () => {
  assert.ok(
    academySrc.includes('export function findLesson'),
    'Must export findLesson helper'
  );
});

// ── Route integration ──

test('Router: /play/academy is in LANDING_MODES', () => {
  assert.ok(
    routerSrc.includes("'/play/academy'"),
    'Router must include /play/academy in LANDING_MODES'
  );
});

test('PlayApp: academy route handler exists', () => {
  assert.ok(
    playAppSrc.includes("sub === '/academy'"),
    'Play app must handle /academy sub-route'
  );
  assert.ok(
    playAppSrc.includes('renderAcademyHub'),
    'Play app must have renderAcademyHub function'
  );
});

test('PlayApp: startAcademyLesson routes through AcademyController', () => {
  assert.ok(
    playAppSrc.includes('async function startAcademyLesson'),
    'Play app must have startAcademyLesson function'
  );
  assert.ok(
    playAppSrc.includes('state.academyLessonId'),
    'startAcademyLesson must set academyLessonId on state'
  );
  assert.ok(
    playAppSrc.includes('AcademyController'),
    'Play app must use AcademyController'
  );
  assert.ok(
    playAppSrc.includes('state.academyController'),
    'Play app must store academyController on state'
  );
});

test('PlayApp: academy lesson completion via controller', () => {
  assert.ok(
    playAppSrc.includes('onMatchEnd'),
    'Play app must call controller.onMatchEnd on terminal'
  );
  assert.ok(
    playAppSrc.includes('isFoundationsComplete'),
    'Play app must check isFoundationsComplete for funnel advancement'
  );
  assert.ok(
    playAppSrc.includes('_academyRecap'),
    'Play app must stash recap data for terminal rendering'
  );
});

test('PlayApp: academy sets guidance mode', () => {
  assert.ok(
    playAppSrc.includes('academyGuidanceMode'),
    'Academy lessons must use academyGuidanceMode() for GUIDED mode'
  );
});

test('PlayApp: briefing and recap rendering wired', () => {
  assert.ok(
    playAppSrc.includes('renderAcademyBriefing'),
    'Play app must have renderAcademyBriefing function'
  );
  assert.ok(
    playAppSrc.includes('renderAcademyRecap'),
    'Play app must have renderAcademyRecap function'
  );
  assert.ok(
    playAppSrc.includes('launchAcademyMatch'),
    'Play app must have launchAcademyMatch function'
  );
});

// ── State ──

test('PlayState: academyController and academyPhase in state', () => {
  assert.ok(
    playStateSrc.includes('academyController: null'),
    'Play state must have academyController field'
  );
  assert.ok(
    playStateSrc.includes('academyPhase: null'),
    'Play state must have academyPhase field'
  );
  assert.ok(
    playStateSrc.includes('state.academyController = null'),
    'resetState must clear academyController'
  );
});

// ── Board renderer integration ──

test('Renderer: academyPanelHtml accepted in opts', () => {
  assert.ok(
    rendererSrc.includes('academyPanelHtml'),
    'ranked-duel-renderer must accept academyPanelHtml in opts'
  );
  assert.ok(
    rendererSrc.includes('rd-academy-panel'),
    'ranked-duel-renderer must render academy panel section'
  );
});

test('Terminal: academy recap button rendered', () => {
  assert.ok(
    terminalSrc.includes('view-academy-recap'),
    'Terminal must render view-academy-recap button when recap available'
  );
  assert.ok(
    terminalSrc.includes('academyRecap'),
    'Terminal must check academyRecap opt'
  );
});

test('BoardEvents: academy recap action wired', () => {
  assert.ok(
    boardEventsSrc.includes("action === 'view-academy-recap'"),
    'Board events must handle view-academy-recap action'
  );
  assert.ok(
    boardEventsSrc.includes('renderAcademyRecap'),
    'Board events must call renderAcademyRecap callback'
  );
  assert.ok(
    boardEventsSrc.includes('state.academyController'),
    'Board events must clean up academyController on exit'
  );
});

// ── Hub integration ──

test('Hub: Academy entry link on new match page', () => {
  assert.ok(
    hubSrc.includes('academy-entry-link'),
    'New match page must have Academy entry link'
  );
  assert.ok(
    hubSrc.includes('#/play/academy'),
    'Academy entry link must point to #/play/academy'
  );
  assert.ok(
    hubSrc.includes('data-testid="academy-entry-link"'),
    'Academy entry link must have data-testid'
  );
});

// ── SEO ──

test('SEO: Academy page has metadata', () => {
  assert.ok(
    seoSrc.includes("'/play/academy'"),
    'SEO metadata must include /play/academy route'
  );
  assert.ok(
    seoSrc.includes('Academy'),
    'SEO metadata must have Academy title'
  );
  assert.ok(
    seoSrc.includes('Foundations'),
    'SEO metadata must mention tiered structure (Foundations)'
  );
});

// ── CSS ──

test('CSS: Academy styles exist', () => {
  assert.ok(cssSrc.includes('.academy'), 'CSS must have .academy styles');
  assert.ok(cssSrc.includes('.academy-lesson-card'), 'CSS must have .academy-lesson-card styles');
  assert.ok(cssSrc.includes('.academy-progress-fill'), 'CSS must have .academy-progress-fill styles');
  assert.ok(cssSrc.includes('.academy-entry-link'), 'CSS must have .academy-entry-link styles');
});

test('CSS: Academy 2.0 tier styles exist', () => {
  assert.ok(cssSrc.includes('.academy-tier'), 'CSS must have .academy-tier styles');
  assert.ok(cssSrc.includes('.academy-tier-header'), 'CSS must have .academy-tier-header styles');
  assert.ok(cssSrc.includes('.academy-tier-foundations'), 'CSS must have foundations tier accent');
  assert.ok(cssSrc.includes('.academy-tier-mechanics'), 'CSS must have mechanics tier accent');
  assert.ok(cssSrc.includes('.academy-tier-applied'), 'CSS must have applied tier accent');
});

test('CSS: Academy 2.0 briefing styles exist', () => {
  assert.ok(cssSrc.includes('.academy-briefing'), 'CSS must have .academy-briefing styles');
  assert.ok(cssSrc.includes('.academy-briefing-objectives'), 'CSS must have briefing objectives styles');
  assert.ok(cssSrc.includes('.academy-briefing-start'), 'CSS must have briefing start button styles');
});

test('CSS: Academy 2.0 recap styles exist', () => {
  assert.ok(cssSrc.includes('.academy-recap'), 'CSS must have .academy-recap styles');
  assert.ok(cssSrc.includes('.academy-recap-banner'), 'CSS must have recap banner styles');
  assert.ok(cssSrc.includes('.academy-recap-stats'), 'CSS must have recap stats styles');
  assert.ok(cssSrc.includes('.academy-recap-takeaway'), 'CSS must have recap takeaway styles');
});

test('CSS: Academy 2.0 objective panel styles exist', () => {
  assert.ok(cssSrc.includes('.academy-objective-panel'), 'CSS must have objective panel styles');
  assert.ok(cssSrc.includes('.academy-objective-item'), 'CSS must have objective item styles');
  assert.ok(cssSrc.includes('.academy-objective-check'), 'CSS must have objective check styles');
  assert.ok(cssSrc.includes('.academy-panel-toggle'), 'CSS must have panel toggle styles');
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Live objective detection
// ═══════════════════════════════════════════════════════════════

test('Phase 2: academy-detectors.mjs exists with detectObjectives function', () => {
  assert.ok(detectorSrc.includes('export function detectObjectives'), 'Must export detectObjectives');
  assert.ok(detectorSrc.includes('export function supportedObjectiveIds'), 'Must export supportedObjectiveIds');
});

test('Phase 2: detectors handle draw events', () => {
  assert.ok(detectorSrc.includes('CORE_DRAW_RESOLVED'), 'Must detect CORE_DRAW_RESOLVED');
  assert.ok(detectorSrc.includes('CARDS_DRAWN_AND_SELECTED'), 'Must detect CARDS_DRAWN_AND_SELECTED');
  assert.ok(detectorSrc.includes("'draw-card'"), 'Must map to draw-card objective');
});

test('Phase 2: detectors handle scoring events', () => {
  assert.ok(detectorSrc.includes('CORE_CARD_SCORED'), 'Must detect CORE_CARD_SCORED');
  assert.ok(detectorSrc.includes('CARD_SCORED'), 'Must detect CARD_SCORED');
  assert.ok(detectorSrc.includes("'play-points'"), 'Must map to play-points objective');
  assert.ok(detectorSrc.includes("'play-to-point-row'"), 'Must map to play-to-point-row objective');
});

test('Phase 2: detectors handle scuttle/anchor/swap/peek effects', () => {
  assert.ok(detectorSrc.includes('scuttle'), 'Must detect scuttle actions');
  assert.ok(detectorSrc.includes('anchor'), 'Must detect anchor actions');
  assert.ok(detectorSrc.includes('swap'), 'Must detect swap actions');
  assert.ok(detectorSrc.includes('peek'), 'Must detect peek actions');
  assert.ok(detectorSrc.includes("'scuttle-opponent'"), 'Must map to scuttle-opponent objective');
  assert.ok(detectorSrc.includes("'anchor-card'"), 'Must map to anchor-card objective');
  assert.ok(detectorSrc.includes("'play-swap'"), 'Must map to play-swap objective');
  assert.ok(detectorSrc.includes("'play-peek'"), 'Must map to play-peek objective');
});

test('Phase 2: detectors handle response/counter events', () => {
  assert.ok(detectorSrc.includes('CORE_COUNTER_DECLARED'), 'Must detect CORE_COUNTER_DECLARED');
  assert.ok(detectorSrc.includes('COUNTER_DECLARED'), 'Must detect COUNTER_DECLARED');
  assert.ok(detectorSrc.includes('CORE_RESPONSE_WINDOW_CLOSED'), 'Must detect response window close');
  assert.ok(detectorSrc.includes('PRIORITY_CLOSED'), 'Must detect priority close');
  assert.ok(detectorSrc.includes("'counter-action'"), 'Must map to counter-action objective');
  assert.ok(detectorSrc.includes("'decline-pass'"), 'Must map to decline-pass objective');
  assert.ok(detectorSrc.includes("'recognize-response'"), 'Must map to recognize-response objective');
});

test('Phase 2: detectors handle royals (Jack/Queen)', () => {
  assert.ok(detectorSrc.includes('jack'), 'Must detect Jack actions');
  assert.ok(detectorSrc.includes('queen'), 'Must detect Queen actions');
  assert.ok(detectorSrc.includes("'play-jack'"), 'Must map to play-jack objective');
  assert.ok(detectorSrc.includes("'play-queen'"), 'Must map to play-queen objective');
});

test('Phase 2: detectors handle snapshot-based objectives', () => {
  assert.ok(detectorSrc.includes('humanScore'), 'Must check humanScore from snapshot');
  assert.ok(detectorSrc.includes("'reach-goal'"), 'Must detect reach-goal objective');
  assert.ok(detectorSrc.includes("'reach-21'"), 'Must detect reach-21 objective');
  assert.ok(detectorSrc.includes("'reach-half-goal'"), 'Must detect reach-half-goal objective');
  assert.ok(detectorSrc.includes('turnCount'), 'Must track turn count for complete-turns');
  assert.ok(detectorSrc.includes("'complete-turns'"), 'Must detect complete-turns objective');
  assert.ok(detectorSrc.includes('effectsUsed'), 'Must track effects used for use-two-effects');
  assert.ok(detectorSrc.includes("'use-two-effects'"), 'Must detect use-two-effects objective');
});

test('Phase 2: detectors handle win objectives from snapshot', () => {
  assert.ok(detectorSrc.includes('winner'), 'Must check winner from snapshot');
  assert.ok(detectorSrc.includes("'win-match'"), 'Must detect win-match objective');
  assert.ok(detectorSrc.includes("'win-graduation'"), 'Must detect win-graduation objective');
});

test('Phase 2: controller wires onSessionEvents to detectors', () => {
  assert.ok(controllerSrc.includes('detectObjectives'), 'Controller must import detectObjectives');
  assert.ok(controllerSrc.includes('onSessionEvents(events, snapshot)'), 'Controller must implement onSessionEvents');
  assert.ok(!controllerSrc.includes('onSessionEvents(_events, _snapshot)'), 'Controller must not have no-op onSessionEvents');
});

test('Phase 2: controller tracks turn count and effects used', () => {
  assert.ok(controllerSrc.includes('_turnCount'), 'Controller must track turn count');
  assert.ok(controllerSrc.includes('_effectsUsed'), 'Controller must track effects used');
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Coachmark state machine
// ═══════════════════════════════════════════════════════════════

test('Phase 2: academy-coachmarks.mjs exists with state machine', () => {
  assert.ok(coachmarkSrc.includes('export function createCoachmarkState'), 'Must export createCoachmarkState');
  assert.ok(coachmarkSrc.includes('export function evaluateTriggers'), 'Must export evaluateTriggers');
  assert.ok(coachmarkSrc.includes('export function dismissCoachmark'), 'Must export dismissCoachmark');
  assert.ok(coachmarkSrc.includes('export function renderCoachmark'), 'Must export renderCoachmark');
});

test('Phase 2: coachmark state machine supports trigger types', () => {
  assert.ok(coachmarkSrc.includes('turn-start'), 'Must support turn-start trigger');
  assert.ok(coachmarkSrc.includes('action-detected'), 'Must support action-detected trigger');
  assert.ok(coachmarkSrc.includes('objective-pending'), 'Must support objective-pending trigger');
  assert.ok(coachmarkSrc.includes('phase-enter'), 'Must support phase-enter trigger');
});

test('Phase 2: coachmark renderer produces HTML with testid', () => {
  assert.ok(coachmarkSrc.includes('data-testid="academy-coachmark"'), 'Coachmark must have data-testid');
  assert.ok(coachmarkSrc.includes('data-action="academy-dismiss-coachmark"'), 'Coachmark must have dismiss button');
  assert.ok(coachmarkSrc.includes('academy-coachmark-text'), 'Coachmark must have text element');
});

test('Phase 2: controller wires coachmark state machine', () => {
  assert.ok(controllerSrc.includes('createCoachmarkState'), 'Controller must import createCoachmarkState');
  assert.ok(controllerSrc.includes('evaluateTriggers'), 'Controller must call evaluateTriggers');
  assert.ok(controllerSrc.includes('dismissCurrentCoachmark'), 'Controller must have dismissCurrentCoachmark');
  assert.ok(controllerSrc.includes('getCoachmarkHtml'), 'Controller must have getCoachmarkHtml');
  assert.ok(controllerSrc.includes('getActiveCoachmark'), 'Controller must have getActiveCoachmark');
});

test('Phase 2: controller coachmark is no longer no-op', () => {
  assert.ok(!controllerSrc.includes('dispatchCoachmark(_stepId)'), 'dispatchCoachmark must not be no-op');
  assert.ok(controllerSrc.includes('dispatchCoachmark(stepId)'), 'dispatchCoachmark must take a real parameter');
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Adaptive hints
// ═══════════════════════════════════════════════════════════════

test('Phase 2: coachmark module has hint generation', () => {
  assert.ok(coachmarkSrc.includes('export function generateHint'), 'Must export generateHint');
  assert.ok(coachmarkSrc.includes('HINT_LIBRARY'), 'Must have hint text library');
  assert.ok(coachmarkSrc.includes('gentle'), 'Must have gentle hint level');
  assert.ok(coachmarkSrc.includes('direct'), 'Must have direct hint level');
});

test('Phase 2: hint library covers key objectives', () => {
  assert.ok(coachmarkSrc.includes("'draw-card'"), 'Hint library must cover draw-card');
  assert.ok(coachmarkSrc.includes("'play-points'"), 'Hint library must cover play-points');
  assert.ok(coachmarkSrc.includes("'scuttle-opponent'"), 'Hint library must cover scuttle-opponent');
  assert.ok(coachmarkSrc.includes("'anchor-card'"), 'Hint library must cover anchor-card');
  assert.ok(coachmarkSrc.includes("'counter-action'"), 'Hint library must cover counter-action');
  assert.ok(coachmarkSrc.includes("'play-jack'"), 'Hint library must cover play-jack');
});

test('Phase 2: controller has requestHint method', () => {
  assert.ok(controllerSrc.includes('requestHint()'), 'Controller must have requestHint method');
  assert.ok(controllerSrc.includes('generateHint'), 'Controller must call generateHint');
  assert.ok(controllerSrc.includes('_hintsUsedThisAttempt'), 'Controller must track hints used');
});

test('Phase 2: controller enables hint button in panel', () => {
  // Phase 3: hint button visibility is now driven by the guidance policy
  assert.ok(controllerSrc.includes('allowHint'), 'Controller must set allowHint in panel');
  assert.ok(controllerSrc.includes('_guidancePolicy'), 'Controller must use guidance policy for hint visibility');
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Lesson steps authored in curriculum
// ═══════════════════════════════════════════════════════════════

test('Phase 2: curriculum has authored steps for key lessons', () => {
  // Foundations-01-draw should have steps
  assert.ok(curriculumSrc.includes("id: 'draw-intro'"), 'Draw lesson must have draw-intro step');
  assert.ok(curriculumSrc.includes("id: 'play-points-intro'"), 'Draw lesson must have play-points-intro step');
  assert.ok(curriculumSrc.includes("id: 'reach-goal-nudge'"), 'Draw lesson must have reach-goal-nudge step');
  // Mechanics-01-scuttle should have steps
  assert.ok(curriculumSrc.includes("id: 'scuttle-intro'"), 'Scuttle lesson must have scuttle-intro step');
  assert.ok(curriculumSrc.includes("id: 'scuttle-nudge'"), 'Scuttle lesson must have scuttle-nudge step');
  // Mechanics-02-anchor should have steps
  assert.ok(curriculumSrc.includes("id: 'anchor-intro'"), 'Anchor lesson must have anchor-intro step');
  assert.ok(curriculumSrc.includes("id: 'anchor-nudge'"), 'Anchor lesson must have anchor-nudge step');
  // Mechanics-04-respond should have steps
  assert.ok(curriculumSrc.includes("id: 'respond-intro'"), 'Respond lesson must have respond-intro step');
  assert.ok(curriculumSrc.includes("id: 'counter-nudge'"), 'Respond lesson must have counter-nudge step');
  assert.ok(curriculumSrc.includes("id: 'decline-nudge'"), 'Respond lesson must have decline-nudge step');
  // Applied-01-royals should have steps
  assert.ok(curriculumSrc.includes("id: 'royals-intro'"), 'Royals lesson must have royals-intro step');
  assert.ok(curriculumSrc.includes("id: 'jack-nudge'"), 'Royals lesson must have jack-nudge step');
  assert.ok(curriculumSrc.includes("id: 'queen-nudge'"), 'Royals lesson must have queen-nudge step');
});

test('Phase 2: lesson steps have coachmark with target + text + position', () => {
  assert.ok(curriculumSrc.includes('target:'), 'Steps must have coachmark target');
  assert.ok(curriculumSrc.includes('text:'), 'Steps must have coachmark text');
  assert.ok(curriculumSrc.includes('position:'), 'Steps must have coachmark position');
});

test('Phase 2: not all lessons have empty steps', () => {
  // Count non-empty steps arrays by looking for step IDs
  const stepCount = (curriculumSrc.match(/id: '(?:draw|play|reach|scuttle|anchor|respond|counter|decline|royals|jack|queen)-/g) || []).length;
  assert.ok(stepCount >= 10, `Must have at least 10 authored step IDs (found ${stepCount})`);
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Board integration
// ═══════════════════════════════════════════════════════════════

test('Phase 2: play-app forwards events to academy controller', () => {
  assert.ok(
    playAppSrc.includes('state.academyController.onSessionEvents'),
    'Play app must forward events to academy controller'
  );
});

test('Phase 2: board-events handles academy hint/toggle/coachmark actions', () => {
  assert.ok(
    boardEventsSrc.includes("action === 'academy-toggle-panel'"),
    'Board events must handle academy-toggle-panel'
  );
  assert.ok(
    boardEventsSrc.includes("action === 'academy-hint'"),
    'Board events must handle academy-hint'
  );
  assert.ok(
    boardEventsSrc.includes("action === 'academy-dismiss-coachmark'"),
    'Board events must handle academy-dismiss-coachmark'
  );
});

test('Phase 2: renderer renders coachmark HTML', () => {
  assert.ok(
    rendererSrc.includes('academyCoachmarkHtml'),
    'Renderer must accept academyCoachmarkHtml opt'
  );
});

test('Phase 2: renderer renders hint display element', () => {
  assert.ok(
    rendererSrc.includes('academy-hint-display'),
    'Renderer must render hint display element'
  );
});

test('Phase 2: CSS has coachmark styles', () => {
  assert.ok(cssSrc.includes('.academy-coachmark'), 'CSS must have coachmark styles');
  assert.ok(cssSrc.includes('.academy-coachmark-body'), 'CSS must have coachmark body styles');
  assert.ok(cssSrc.includes('.academy-coachmark-text'), 'CSS must have coachmark text styles');
  assert.ok(cssSrc.includes('.academy-coachmark-dismiss'), 'CSS must have coachmark dismiss button styles');
  assert.ok(cssSrc.includes('.academy-coachmark-arrow'), 'CSS must have coachmark arrow styles');
});

test('Phase 2: CSS has hint display styles', () => {
  assert.ok(cssSrc.includes('.academy-hint-display'), 'CSS must have hint display styles');
  assert.ok(cssSrc.includes('.academy-hint-display.visible'), 'CSS must have hint display visible state');
});

test('Phase 2: controller onCoachmark callback option', () => {
  assert.ok(
    controllerSrc.includes('onCoachmark'),
    'Controller must support onCoachmark callback option'
  );
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Adaptive mastery engine
// ═══════════════════════════════════════════════════════════════

test('Phase 3: academy-mastery.mjs exists with core functions', () => {
  assert.ok(masterySrc.includes('export function computeMasteryScore'), 'Must export computeMasteryScore');
  assert.ok(masterySrc.includes('export function masteryTierFromScore'), 'Must export masteryTierFromScore');
  assert.ok(masterySrc.includes('export function masteryTierDisplay'), 'Must export masteryTierDisplay');
  assert.ok(masterySrc.includes('export function computeGuidancePolicy'), 'Must export computeGuidancePolicy');
  assert.ok(masterySrc.includes('export function detectMistakes'), 'Must export detectMistakes');
  assert.ok(masterySrc.includes('export function evaluateGraduation'), 'Must export evaluateGraduation');
});

test('Phase 3: mastery tiers are defined', () => {
  assert.ok(masterySrc.includes('BRONZE'), 'Must define BRONZE tier');
  assert.ok(masterySrc.includes('SILVER'), 'Must define SILVER tier');
  assert.ok(masterySrc.includes('GOLD'), 'Must define GOLD tier');
  assert.ok(masterySrc.includes('MasteryTier'), 'Must export MasteryTier enum');
});

test('Phase 3: mastery score uses objective completion ratio', () => {
  assert.ok(masterySrc.includes('objectivesMetCount'), 'Must use objectivesMetCount');
  assert.ok(masterySrc.includes('objectivesTotal'), 'Must use objectivesTotal');
  assert.ok(masterySrc.includes('objRatio'), 'Must compute objective ratio');
  assert.ok(masterySrc.includes('objBonus'), 'Must apply objective bonus');
});

test('Phase 3: mastery score penalizes hints and retries', () => {
  assert.ok(masterySrc.includes('0.15'), 'Must penalize hints at 0.15 each');
  assert.ok(masterySrc.includes('0.20'), 'Must penalize retries at 0.20 each');
  assert.ok(masterySrc.includes('hintPenalty'), 'Must compute hintPenalty');
  assert.ok(masterySrc.includes('retryPenalty'), 'Must compute retryPenalty');
});

test('Phase 3: mastery tier thresholds', () => {
  assert.ok(masterySrc.includes('0.85'), 'Gold threshold must be 0.85');
  assert.ok(masterySrc.includes('0.65'), 'Silver threshold must be 0.65');
  assert.ok(masterySrc.includes('0.40'), 'Bronze threshold must be 0.40');
});

test('Phase 3: mastery tier display has icons', () => {
  assert.ok(masterySrc.includes('🥇'), 'Gold must have medal icon');
  assert.ok(masterySrc.includes('🥈'), 'Silver must have medal icon');
  assert.ok(masterySrc.includes('🥉'), 'Bronze must have medal icon');
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Adaptive guidance policy
// ═══════════════════════════════════════════════════════════════

test('Phase 3: guidance policy reduces coachmarks after mastery', () => {
  assert.ok(masterySrc.includes('showCoachmarks'), 'Policy must have showCoachmarks field');
  assert.ok(masterySrc.includes('reduceGuidanceAfterMastery'), 'Must respect reduceGuidanceAfterMastery');
  assert.ok(masterySrc.includes('completionCount'), 'Must use completionCount for mastery reps');
  assert.ok(masterySrc.includes('masteryReps'), 'Must respect masteryReps config');
});

test('Phase 3: guidance policy escalates hints after threshold', () => {
  assert.ok(masterySrc.includes('hintThreshold'), 'Must use hintThreshold');
  assert.ok(masterySrc.includes("'direct'"), 'Must escalate to direct hints');
  assert.ok(masterySrc.includes("'gentle'"), 'Must start with gentle hints');
});

test('Phase 3: controller wires guidance policy', () => {
  assert.ok(controllerSrc.includes('computeGuidancePolicy'), 'Controller must import computeGuidancePolicy');
  assert.ok(controllerSrc.includes('_guidancePolicy'), 'Controller must store guidance policy');
  assert.ok(controllerSrc.includes('getGuidancePolicy'), 'Controller must expose getGuidancePolicy');
  assert.ok(controllerSrc.includes('showCoachmarks'), 'Controller must check showCoachmarks policy');
});

test('Phase 3: controller respects guidance policy for coachmarks', () => {
  assert.ok(
    controllerSrc.includes("this._guidancePolicy?.showCoachmarks !== false"),
    'Controller must skip coachmarks when policy disables them'
  );
});

test('Phase 3: controller respects guidance policy for hints', () => {
  assert.ok(
    controllerSrc.includes("this._guidancePolicy?.allowHints !== false"),
    'Controller must check allowHints policy'
  );
});

test('Phase 3: hasDemonstratedMastery function', () => {
  assert.ok(masterySrc.includes('export function hasDemonstratedMastery'), 'Must export hasDemonstratedMastery');
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Mistake detection
// ═══════════════════════════════════════════════════════════════

test('Phase 3: mistake detection covers key patterns', () => {
  assert.ok(masterySrc.includes('wasted-effect'), 'Must detect wasted-effect mistake');
  assert.ok(masterySrc.includes('no-response'), 'Must detect no-response mistake');
});

test('Phase 3: mistake detection uses lesson adaptation config', () => {
  assert.ok(masterySrc.includes('mistakeHints'), 'Must use adaptation.mistakeHints');
  assert.ok(masterySrc.includes('hintMap'), 'Must build hint map from mistakeHints');
});

test('Phase 3: controller wires mistake detection', () => {
  assert.ok(controllerSrc.includes('detectMistakes'), 'Controller must import detectMistakes');
  assert.ok(controllerSrc.includes('_pendingMistakes'), 'Controller must track pending mistakes');
  assert.ok(controllerSrc.includes('onMistakeDetected'), 'Controller must support onMistakeDetected callback');
  assert.ok(controllerSrc.includes('getPendingMistakes'), 'Controller must expose getPendingMistakes');
  assert.ok(controllerSrc.includes('clearPendingMistakes'), 'Controller must expose clearPendingMistakes');
});

test('Phase 3: curriculum has mistakeHints for key lessons', () => {
  assert.ok(curriculumSrc.includes("'wasted-effect'"), 'Curriculum must have wasted-effect mistake hints');
  assert.ok(curriculumSrc.includes("'no-response'"), 'Curriculum must have no-response mistake hints');
  assert.ok(curriculumSrc.includes('detector:'), 'Mistake hints must have detector field');
  assert.ok(curriculumSrc.includes('hint:'), 'Mistake hints must have hint field');
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Graduation assessment
// ═══════════════════════════════════════════════════════════════

test('Phase 3: graduation lesson uses OBJECTIVES_AND_WIN', () => {
  assert.ok(
    curriculumSrc.includes("mode: CompletionMode.OBJECTIVES_AND_WIN"),
    'Graduation lesson must use OBJECTIVES_AND_WIN completion mode'
  );
});

test('Phase 3: evaluateGraduation checks all requirements', () => {
  assert.ok(masterySrc.includes('allTiersComplete'), 'Must check all tiers complete');
  assert.ok(masterySrc.includes('avgMastery'), 'Must compute average mastery');
  assert.ok(masterySrc.includes('gradCompleted'), 'Must check graduation lesson completed');
  assert.ok(masterySrc.includes('eligible'), 'Must return eligible flag');
  assert.ok(masterySrc.includes('passed'), 'Must return passed flag');
  assert.ok(masterySrc.includes('requirements'), 'Must return requirements list');
  assert.ok(masterySrc.includes('checks'), 'Must return detailed checks');
});

test('Phase 3: recordGraduationAssessment persists result', () => {
  assert.ok(masterySrc.includes('export function recordGraduationAssessment'), 'Must export recordGraduationAssessment');
  assert.ok(masterySrc.includes('graduationAssessment'), 'Must set graduationAssessment in progress');
  assert.ok(masterySrc.includes('evaluatedAt'), 'Must record evaluation timestamp');
});

test('Phase 3: controller runs graduation assessment', () => {
  assert.ok(controllerSrc.includes('evaluateGraduation'), 'Controller must call evaluateGraduation');
  assert.ok(controllerSrc.includes('recordGraduationAssessment'), 'Controller must record graduation assessment');
  assert.ok(controllerSrc.includes("applied-03-graduation"), 'Controller must check for graduation lesson id');
  assert.ok(controllerSrc.includes('graduationAssessment'), 'Controller must pass graduationAssessment in recap');
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Progress tracking
// ═══════════════════════════════════════════════════════════════

test('Phase 3: progress tracks completionCount', () => {
  assert.ok(progressSrc.includes('completionCount'), 'Progress must track completionCount');
  assert.ok(progressSrc.includes('completionCount = (entry.completionCount ?? 0) + 1'), 'markLessonComplete must increment completionCount');
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Recap rendering with mastery
// ═══════════════════════════════════════════════════════════════

test('Phase 3: recap shows mastery tier badge', () => {
  assert.ok(recapSrc.includes('masteryTier'), 'Recap must use masteryTier');
  assert.ok(recapSrc.includes('masteryTierLabel'), 'Recap must use masteryTierLabel');
  assert.ok(recapSrc.includes('masteryTierIcon'), 'Recap must use masteryTierIcon');
  assert.ok(recapSrc.includes('academy-mastery-badge'), 'Recap must render mastery badge');
  assert.ok(recapSrc.includes('academy-mastery-'), 'Recap must render mastery tier class');
});

test('Phase 3: recap shows guidance reason', () => {
  assert.ok(recapSrc.includes('guidanceReason'), 'Recap must use guidanceReason');
  assert.ok(recapSrc.includes('academy-recap-guidance-reason'), 'Recap must render guidance reason');
});

test('Phase 3: recap shows graduation assessment', () => {
  assert.ok(recapSrc.includes('graduationAssessment'), 'Recap must use graduationAssessment');
  assert.ok(recapSrc.includes('academy-graduation-assessment'), 'Recap must render graduation assessment');
  assert.ok(recapSrc.includes('academy-graduation-requirements'), 'Recap must render graduation requirements');
  assert.ok(recapSrc.includes('academy-graduation-title'), 'Recap must render graduation title');
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Hub rendering with mastery badges
// ═══════════════════════════════════════════════════════════════

test('Phase 3: renderer shows mastery badges on lesson cards', () => {
  assert.ok(academySrc.includes('masteryTierFromScore'), 'Renderer must import masteryTierFromScore');
  assert.ok(academySrc.includes('masteryTierDisplay'), 'Renderer must import masteryTierDisplay');
  assert.ok(academySrc.includes('MasteryTier'), 'Renderer must import MasteryTier');
  assert.ok(academySrc.includes('academy-lesson-mastery'), 'Renderer must render mastery badge on cards');
  assert.ok(academySrc.includes('academy-mastery-'), 'Renderer must render mastery tier class dynamically');
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: CSS for mastery + graduation
// ═══════════════════════════════════════════════════════════════

test('Phase 3: CSS has mastery badge styles', () => {
  assert.ok(cssSrc.includes('.academy-mastery-badge'), 'CSS must have mastery badge styles');
  assert.ok(cssSrc.includes('.academy-mastery-gold'), 'CSS must have gold mastery styles');
  assert.ok(cssSrc.includes('.academy-mastery-silver'), 'CSS must have silver mastery styles');
  assert.ok(cssSrc.includes('.academy-mastery-bronze'), 'CSS must have bronze mastery styles');
  assert.ok(cssSrc.includes('.academy-lesson-mastery'), 'CSS must have lesson mastery icon styles');
});

test('Phase 3: CSS has graduation assessment styles', () => {
  assert.ok(cssSrc.includes('.academy-graduation-assessment'), 'CSS must have graduation assessment styles');
  assert.ok(cssSrc.includes('.academy-graduation-title'), 'CSS must have graduation title styles');
  assert.ok(cssSrc.includes('.academy-graduation-requirements'), 'CSS must have graduation requirements styles');
  assert.ok(cssSrc.includes('.academy-graduation-message'), 'CSS must have graduation message styles');
});

test('Phase 3: CSS has guidance reason styles', () => {
  assert.ok(cssSrc.includes('.academy-recap-guidance-reason'), 'CSS must have guidance reason styles');
});
