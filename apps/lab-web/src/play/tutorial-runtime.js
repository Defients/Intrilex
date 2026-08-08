// ═══════════════════════════════════════════════════════════════
// tutorial-runtime.js — Interactive First Contact tutorial
// Backed by real engine authority. Never hand-edits engine state.
// Uses semantic predicates, not fragile card/action IDs.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from './hash.js';
import { RULES_VERSION } from '../version.js';

const TUTORIAL_ID = 'first-contact-introduction';
const TUTORIAL_VERSION = '1.0.0';
const TUTORIAL_PROFILE = 'first-contact-trigger-closure';
const TUTORIAL_SEED = 12345;
const TUTORIAL_AI_POLICY = 'hybrix-defender-easy';

/**
 * Tutorial chapters — each teaches one concept using semantic predicates.
 * Completion is checked against accepted engine events, not card IDs.
 */
const CHAPTERS = [
  {
    id: 'welcome',
    title: 'Welcome to Intrilex',
    instructionKey: 'tutorial.welcome',
    focusRegion: 'goal',
    text: 'Welcome to Intrilex! This tutorial will teach you the basics. Your goal is to reach your Goal score before your opponent. Let\'s start by looking at the board.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'goal-and-secured-points',
    title: 'Goal and Secured Points',
    instructionKey: 'tutorial.goal-and-secured-points',
    focusRegion: 'goal',
    text: 'Each player has a Goal score (shown as a number). You win by reaching your Goal at the end of your Full Turn. Secured Points are cards on your Point Row that count toward your Goal.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'your-hand',
    title: 'Your Hand',
    instructionKey: 'tutorial.your-hand',
    focusRegion: 'human-hand',
    text: 'These cards in your hand are private — only you can see them. Your opponent\'s hand is hidden (shown as card backs). Click a card to inspect it.',
    completion: { type: 'card-inspected' },
  },
  {
    id: 'draw-a-card',
    title: 'Draw a Card',
    instructionKey: 'tutorial.draw-a-card',
    focusRegion: 'draw-pile',
    recommendedAction: { family: 'draw' },
    text: 'The Draw Pile is where you get new cards. Click "Draw" to take the top card from the Draw Pile. This costs one Mini-Turn.',
    completion: { acceptedFamily: 'draw' },
  },
  {
    id: 'play-for-points',
    title: 'Play for Points',
    instructionKey: 'tutorial.play-for-points',
    focusRegion: 'human-hand',
    recommendedAction: { family: 'score', altFamily: 'play-for-points' },
    text: 'Playing a card for Points places it on your Point Row. The card\'s point value counts toward your Goal. Select a card from your hand and choose "Play for Points".',
    completion: { acceptedFamily: 'score', altFamily: 'play-for-points' },
  },
  {
    id: 'effects-or-scuttle',
    title: 'Effects and Scuttle',
    instructionKey: 'tutorial.effects-or-scuttle',
    focusRegion: 'human-hand',
    recommendedAction: { family: 'scuttle', altFamily: 'effect-three' },
    text: 'Some cards have special effects (like bouncing cards back to hand) or can Scuttle (destroy an opponent\'s Point Row card). Try using a card effect or Scuttle if available.',
    completion: { acceptedFamily: 'scuttle', altFamily: 'effect-three', allowAnyAction: true },
  },
  {
    id: 'mini-turns',
    title: 'Mini-Turns',
    instructionKey: 'tutorial.mini-turns',
    focusRegion: 'phase-indicator',
    text: 'Each Full Turn has multiple Mini-Turns. Most actions cost one Mini-Turn. When you run out of Mini-Turns, your turn ends automatically. Watch the Mini-Turn counter to plan your moves.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'swap-bar',
    title: 'The Shared Swap Bar',
    instructionKey: 'tutorial.swap-bar',
    focusRegion: 'swap-bar',
    recommendedAction: { family: 'swap-bar' },
    text: 'The Swap Bar is shared between both players. You can place a card face-down on the Swap Bar, or take a face-up card from it. Try using the Swap Bar.',
    completion: { acceptedFamily: 'swap-bar', allowSkip: true },
  },
  {
    id: 'stack-ordering',
    title: 'The Stack',
    instructionKey: 'tutorial.stack-ordering',
    focusRegion: 'stack',
    text: 'When a player declares an action, it goes on the stack. The opponent may respond with a counter. The stack resolves last-in, first-out — the newest item resolves first.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'response-or-decline',
    title: 'Response Window',
    instructionKey: 'tutorial.response-or-decline',
    focusRegion: 'action-rail',
    text: 'When your opponent declares something, you may get a response window. You can play a counter-response or Decline response. Declining is NOT the same as Pass — it only means you choose not to respond to this specific declaration.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'target-selection',
    title: 'Selecting a Target',
    instructionKey: 'tutorial.target-selection',
    focusRegion: 'board-center',
    text: 'Some actions require you to select a target. When you choose an action that needs a target, the available targets will be highlighted. Click a target to select it, then confirm your action.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'ordinary-vs-spades',
    title: 'Ordinary vs Spades',
    instructionKey: 'tutorial.ordinary-vs-spades',
    focusRegion: 'human-hand',
    text: 'Cards of the Spades suit (♠) have mechanically distinct play forms compared to other suits. A Spades card may have different effects or options when played. Look for the ♠ indicator on actions to identify Spades variants.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'super-declaration',
    title: 'Super Declarations',
    instructionKey: 'tutorial.super-declaration',
    focusRegion: 'human-hand',
    text: 'When you have two cards of the same rank, you can declare a Super — a powerful combined action. Super-eligible cards will show an "S" badge. Supers consume both components and can be countered, so plan carefully.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'automatic-priority',
    title: 'Automatic Priority',
    instructionKey: 'tutorial.automatic-priority',
    focusRegion: 'decision-banner',
    text: 'If you have no legal response, the engine advances automatically — you won\'t be prompted. This is orchestration, not a player choice. You\'ll only see a decision prompt when you have at least one legal action.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'card-inspection',
    title: 'Card Inspection',
    instructionKey: 'tutorial.card-inspection',
    focusRegion: 'human-hand',
    text: 'Click any card to see its full details — point value, abilities, and current status. Card inspection never reveals hidden information about your opponent\'s cards.',
    completion: { type: 'card-inspected' },
  },
  {
    id: 'save-resume',
    title: 'Save and Resume',
    instructionKey: 'tutorial.save-resume',
    focusRegion: 'save-button',
    text: 'Your progress is saved automatically. You can leave at any time and resume exactly where you left off — the AI will make the same decisions thanks to deterministic replay.',
    completion: { type: 'acknowledge' },
  },
  {
    id: 'complete-match',
    title: 'Complete the Match',
    instructionKey: 'tutorial.complete-match',
    focusRegion: 'board',
    text: 'Continue playing until the match ends. When it\'s over, you\'ll see the final score and can watch a verified replay. Good luck!',
    completion: { type: 'match-complete' },
  },
  {
    id: 'replay-and-evidence',
    title: 'Replay and Evidence',
    instructionKey: 'tutorial.replay-and-evidence',
    focusRegion: 'terminal-actions',
    text: 'After the match, you can watch a verified replay, inspect individual decisions, and open Rank Anatomy to see how your actions connect to the broader game analysis. Try opening the replay or Rank Anatomy from the result screen.',
    completion: { type: 'acknowledge' },
  },
];

/**
 * Get the tutorial definition.
 */
export function getTutorialDefinition() {
  return {
    tutorialId: TUTORIAL_ID,
    version: TUTORIAL_VERSION,
    rulesVersion: RULES_VERSION,
    profileId: TUTORIAL_PROFILE,
    seed: TUTORIAL_SEED,
    aiPolicyId: TUTORIAL_AI_POLICY,
    chapters: CHAPTERS,
    contentHash: hashCanonical({ tutorialId: TUTORIAL_ID, version: TUTORIAL_VERSION, chapters: CHAPTERS }),
  };
}

/**
 * Get the tutorial setup for creating a session.
 */
export function getTutorialSetup() {
  return {
    profileId: TUTORIAL_PROFILE,
    seed: TUTORIAL_SEED,
    humanPlayerId: 'P1',
    aiPolicyId: TUTORIAL_AI_POLICY,
    aiArchetype: 'defender',
    aiDifficulty: 'easy',
    mode: 'TUTORIAL',
    tutorial: { tutorialId: TUTORIAL_ID, version: TUTORIAL_VERSION, currentChapter: 0 },
  };
}

/**
 * Tutorial runtime — tracks progress and checks chapter completion.
 */
export class TutorialRuntime {
  constructor() {
    this.definition = getTutorialDefinition();
    this.currentChapterIndex = 0;
    this.completedChapters = new Set();
    this.dismissedConcepts = new Set();
    this.skipped = false;
    this.guidanceMode = 'GUIDED'; // OFF, ESSENTIAL, GUIDED, DETAILED
  }

  /**
   * Get the current chapter.
   */
  get currentChapter() {
    return this.definition.chapters[this.currentChapterIndex] ?? null;
  }

  /**
   * Get the total number of chapters.
   */
  get chapterCount() {
    return this.definition.chapters.length;
  }

  /**
   * Get progress as a fraction (0-1).
   */
  get progress() {
    return this.completedChapters.size / this.chapterCount;
  }

  /**
   * Check if a chapter is complete based on the last accepted action.
   * @param {object} action - The last accepted action (family, mode)
   * @param {string} eventType - The event type if applicable
   * @returns {boolean} true if the current chapter is now complete
   */
  checkCompletion(action, eventType) {
    const chapter = this.currentChapter;
    if (!chapter) return false;
    const completion = chapter.completion;
    if (!completion) return false;

    // Acknowledge-type chapters
    if (completion.type === 'acknowledge') return false; // Completed via explicit advance
    if (completion.type === 'card-inspected') return action?._cardInspected === true;
    if (completion.type === 'match-complete') return action?._matchComplete === true;

    // Action-family-based completion
    if (completion.acceptedFamily) {
      if (action?.family === completion.acceptedFamily) return true;
      if (completion.altFamily && action?.family === completion.altFamily) return true;
      if (completion.allowAnyAction) return true;
    }

    return false;
  }

  /**
   * Advance to the next chapter.
   */
  advance() {
    if (this.currentChapter) {
      this.completedChapters.add(this.currentChapter.id);
    }
    this.currentChapterIndex = Math.min(this.currentChapterIndex + 1, this.chapterCount);
  }

  /**
   * Skip the tutorial.
   */
  skip() {
    this.skipped = true;
    this.currentChapterIndex = this.chapterCount;
  }

  /**
   * Check if the tutorial is complete.
   */
  get isComplete() {
    return this.currentChapterIndex >= this.chapterCount;
  }

  /**
   * Get the save state for persistence.
   */
  getSaveState() {
    return {
      tutorialId: this.definition.tutorialId,
      version: this.definition.version,
      currentChapter: this.currentChapterIndex,
      completedChapters: [...this.completedChapters],
      dismissedConcepts: [...this.dismissedConcepts],
      skipped: this.skipped,
      guidanceMode: this.guidanceMode,
    };
  }

  /**
   * Restore from a saved state.
   */
  restore(saveState) {
    if (saveState.tutorialId !== TUTORIAL_ID) throw new Error('TUTORIAL_ID_MISMATCH');
    if (saveState.version !== TUTORIAL_VERSION) throw new Error('TUTORIAL_VERSION_MISMATCH');
    this.currentChapterIndex = saveState.currentChapter ?? 0;
    this.completedChapters = new Set(saveState.completedChapters ?? []);
    this.dismissedConcepts = new Set(saveState.dismissedConcepts ?? []);
    this.skipped = saveState.skipped ?? false;
    this.guidanceMode = saveState.guidanceMode ?? 'GUIDED';
  }

  /**
   * Get the recommended action family for the current chapter.
   */
  get recommendedFamily() {
    return this.currentChapter?.recommendedAction?.family ?? null;
  }

  /**
   * Get the alternate recommended family.
   */
  get recommendedAltFamily() {
    return this.currentChapter?.recommendedAction?.altFamily ?? null;
  }

  /**
   * Check if the current chapter allows skipping.
   */
  get currentChapterAllowsSkip() {
    return this.currentChapter?.completion?.allowSkip ?? false;
  }

  /**
   * Set the guidance mode (OFF, ESSENTIAL, GUIDED, DETAILED).
   * Guidance preferences do not affect engine state or replay determinism.
   */
  setGuidanceMode(mode) {
    this.guidanceMode = mode;
  }

  /**
   * Dismiss a concept so it doesn't show again.
   * @param {string} conceptId - The concept/chapter ID to dismiss
   */
  dismissConcept(conceptId) {
    this.dismissedConcepts.add(conceptId);
  }

  /**
   * Restart the tutorial from the beginning.
   */
  restart() {
    this.currentChapterIndex = 0;
    this.completedChapters = new Set();
    this.dismissedConcepts = new Set();
    this.skipped = false;
  }

  /**
   * Check if a concept should be shown (not dismissed, not completed).
   * @param {string} conceptId - The concept/chapter ID
   * @returns {boolean}
   */
  shouldShowConcept(conceptId) {
    return !this.dismissedConcepts.has(conceptId) && !this.completedChapters.has(conceptId);
  }
}
