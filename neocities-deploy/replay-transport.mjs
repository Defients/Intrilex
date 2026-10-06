// Replay transport — the Watch playback loop, extracted for Node tests.
// Mirrors the app.js model exactly: state.playing + state.timer (setInterval),
// state.frame indexes state.replay.frames, ticks step forward until the last
// frame.
//
// Lifecycle contract:
//   - No replay → togglePlay/stepTo/stepBy are pure no-ops: no timer is
//     created, nothing throws, state is untouched.
//   - A tick that finds the replay gone (cleared while playing) stops the
//     timer instead of dereferencing a missing frames array.
//   - stop() always clears the interval and is safe to call repeatedly.

/**
 * @param {{ getState: () => any, setCurrentFrame: (i: number) => void, triggerFx?: () => void, render: () => void, setTimer?: Function, clearTimer?: Function }} deps
 */
export function createReplayTransport({ getState, setCurrentFrame, triggerFx = () => {}, render, setTimer = setInterval, clearTimer = clearInterval }) {
  const hasFrames = () => {
    const s = getState();
    return Boolean(s.replay && Array.isArray(s.replay.frames) && s.replay.frames.length > 0);
  };

  function stop() {
    const s = getState();
    s.playing = false;
    if (s.timer) { clearTimer(s.timer); s.timer = null; }
  }

  function stepTo(index) {
    if (!hasFrames()) return;
    const s = getState();
    s.frame = Math.min(Math.max(0, index), s.replay.frames.length - 1);
    s.selectedTimelineIndex = null;
    triggerFx();
    setCurrentFrame(s.frame);
    render();
  }

  function stepBy(delta) { stepTo(getState().frame + delta); }

  function togglePlay() {
    const s = getState();
    if (s.playing) { stop(); render(); return; }
    if (!hasFrames()) return;
    s.playing = true;
    s.timer = setTimer(() => {
      const cur = getState();
      if (!hasFrames() || cur.frame >= cur.replay.frames.length - 1) { stop(); render(); return; }
      stepTo(cur.frame + 1);
    }, Math.max(65, 700 / (s.speed || 1)));
    render();
  }

  return { stop, stepTo, stepBy, togglePlay, hasFrames };
}
