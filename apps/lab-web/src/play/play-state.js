// ═══════════════════════════════════════════════════════════════
// play-state.js — Shared mutable state for the Play module.
//
// Extracted from play-app.js to enable modularization.
// All play-module UI state lives here so that extracted modules
// (board-events.js, etc.) can read and write the same state
// without circular imports or prop-drilling.
// ═══════════════════════════════════════════════════════════════
import { GuidanceMode } from './intelligence/action-explanation.js';

export const state = {
  session: null,
  networkSession: null, // v0.24.1: NetworkPlaySession for online Direct Duel
  tutorial: null,
  selectedActionId: null,
  selectedSourceCardId: null,
  selectedTargetIds: [],
  inspectorCardId: null,
  inspectorFaceView: 'essentials', // 'essentials' is the single inline view (Advanced Rules opens #advanced-card-rules-dialog)
  guidanceMode: GuidanceMode.GUIDED,
  autosaveTimer: null,
  isAdvancing: false,
  keyboardHandler: null,
  showKeyboardHelp: false,
  tabId: null,
  sessionId: null,
  leaseMode: 'UNCLAIMED', // UNCLAIMED | CONTROLLED | READ_ONLY | CONFLICT | LEASE_LOST | RELEASED
  heartbeatTimer: null,
  activeContainer: null, // last container passed to renderActiveMatch — used by heartbeat
  chatMessages: [],
  lastEventCount: 0,
  guidancePrefLoaded: false,
  sound: null,
  particles: null,
  soundMuted: false,
  soundInitialized: false,
  visibilityHandler: null,
  prevHandCount: 0,
  statsRecorded: false, // Guard: update player stats only once per terminal match
  selectedIntentKey: null, // Currently selected intent group key
  viewMode: null, // Current view mode (e.g. 'start')
  rightRailTab: 'chat', // Active right rail tab ('chat' | 'debug')
};

/**
 * Reset all play-module state to initial values.
 * Called when the user leaves a match (return-to-hub).
 */
export function resetState() {
  state.session = null;
  state.networkSession = null;
  state.tutorial = null;
  state.selectedActionId = null;
  state.selectedSourceCardId = null;
  state.selectedTargetIds = [];
  state.inspectorCardId = null;
  state.inspectorFaceView = 'board';
  state.autosaveTimer = null;
  state.isAdvancing = false;
  state.keyboardHandler = null;
  state.showKeyboardHelp = false;
  state.tabId = null;
  state.sessionId = null;
  state.leaseMode = 'UNCLAIMED';
  state.heartbeatTimer = null;
  state.activeContainer = null;
  state.chatMessages = [];
  state.lastEventCount = 0;
  state.guidancePrefLoaded = false;
  state.sound = null;
  state.particles = null;
  state.soundMuted = false;
  state.soundInitialized = false;
  state.visibilityHandler = null;
  state.prevHandCount = 0;
  state.statsRecorded = false;
  state.selectedIntentKey = null;
  state.viewMode = null;
  state.rightRailTab = 'chat';
  state._networkAchievementsApplied = false;
  state._achievementSummaryHtml = undefined;
}
