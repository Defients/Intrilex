#!/usr/bin/env node
/**
 * Analyze dev-note WAV files to detect silence/pause boundaries,
 * then align those boundaries to the text lines of the dev blog note
 * using dynamic programming for optimal forced alignment.
 *
 * Output: apps/lab-web/src/assets/devblog-timings.json
 *
 * Algorithm:
 * 1. Read PCM data from each WAV file.
 * 2. Detect silence regions via RMS energy thresholding.
 * 3. Extract silence midpoints as candidate split points.
 * 4. Use dynamic programming to find the optimal assignment of
 *    text lines to audio segments, minimizing the squared deviation
 *    between actual segment duration and expected duration (based on
 *    character count).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const assetsDir = join(root, 'apps/lab-web/src/assets');
const outFile = join(assetsDir, 'devblog-timings.json');

// ── Voice files ──
const voices = [
  { id: 'woman',     file: 'dev-note-woman.wav' },
  { id: 'streamer',  file: 'dev-note-streamer.wav' },
  { id: 'ymzo',      file: 'dev-note-ymzo.wav' },
  { id: 'developer', file: 'dev-note.wav' },
];

// ── Text lines extracted from the dev blog HTML (in document order) ──
const TEXT_LINES = [
  'Hey.',
  "I'm Deffy, the creator of Intrilex.",
  'And, uh...',
  'I see you.',
  "More of you have been finding this site than I expected—especially considering I haven't exactly gone out of my way to announce that it's here yet.",
  'Which is exciting.',
  'And slightly terrifying.',
  "Because you've caught Intrilex at a very specific moment:",
  "the arena exists, but I'm still building the damn doors.",
  "Right now, Intrilex is under extremely active development. The website is online, the rules are taking their proper form, and a large amount of the infrastructure underneath the game already exists—but the actual public gameplay experience is not reliable enough yet for me to call it playable.",
  'I know.',
  "You find a competitive card game, hit Play, and naturally expect to be able to... y'know...",
  'play the card game.',
  'Fair.',
  "So rather than pretend otherwise, I want to tell you exactly what you've stumbled into.",
  '__HR__',
  'What is Intrilex?',
  'At its foundation, Intrilex uses something almost absurdly familiar:',
  'a normal deck of playing cards.',
  'No proprietary 300-card collection required. No booster packs. No rotating pile of cardboard you need to purchase before you can understand what is happening.',
  'Just the deck humanity already knows.',
  'And then Intrilex asks:',
  'How much game can we actually extract from it?',
  "Cards aren't merely numbers you throw onto a pile.",
  'Ranks can carry distinct tactical functions. Cards can be played for Points or Effects. Actions can create responses. Responses can create counterplay. Persistent states can reshape future turns. Combinations reward planning. Timing matters. Resource management matters. Reading another player matters.',
  'The same card that looks useless in one position can become exactly what you needed several decisions later.',
  'The objective is understandable.',
  'The path toward mastering it is very much not.',
  "That's intentional.",
  'Intrilex is meant to live in that wonderful territory where you can learn how to play...',
  "...and then realize much later that you're only beginning to understand how to play well.",
  '__HR__',
  "This Didn't Appear Overnight",
  "Intrilex isn't something I decided to generate over a weekend because card games looked interesting.",
  'This idea has been mutating, breaking, rebuilding, renaming itself, being reconsidered, and getting dragged forward by me for years.',
  'A frankly unreasonable amount of my creative life has ended up somewhere inside it.',
  "What you're seeing now is the point where a long-running private passion project is finally becoming an actual public system:",
  'rules, software, identity, competition, players, and eventually a living game around all of it.',
  'And somehow...',
  "some of you found it while I'm still putting the pieces together.",
  "I wasn't quite prepared for that.",
  "But I'm very glad you're here.",
  '__HR__',
  'So When Can I Actually Play?',
  'That is currently my priority.',
  'Not one of my priorities.',
  'The priority.',
  "I've temporarily pushed my other projects aside so I can focus on getting Intrilex's playable experience across the line.",
  'Could that take a few days?',
  'Yep.',
  'Could it take a week?',
  'Yep.',
  'Could I discover some horrible little networking goblin hiding underneath everything and need longer?',
  'Also yep.',
  "I don't want to give you a fake countdown just because countdowns look good on websites.",
  "I want the first real public duels to demonstrate why I've spent all this time building Intrilex in the first place.",
  '__HR__',
  'What Happens After That?',
  'First:',
  'You duel someone.',
  'A real person.',
  'Two players sitting across the same strange little battlefield, working from the same ancient deck of cards and trying to outthink each other.',
  "That's the center of everything.",
  'Then the world around those matches begins growing.',
  'Player identities. Competition. Rankings. Rivalries. Social systems. Ways of finding the people you actually want to duel again.',
  "And I'm already experimenting with ways Intrilex can become more than straightforward PvP—including ideas like Puzzle Mode, where specific game states become problems to solve rather than ordinary matches to win.",
  'There is an uncomfortable amount I want to build.',
  'The difference now is that it finally has somewhere to live.',
  '__HR__',
  'You Have One Advantage',
  "Since you found Intrilex this early, you can do something future players won't be able to do:",
  'learn it before they arrive.',
  'The Rules are currently the most complete part of the public experience.',
  'So go snoop.',
  'Study the ranks.',
  'Figure out the scoring system.',
  'Look at the Effects.',
  'Start noticing the interactions.',
  'Come up with something clever.',
  "Because once the doors actually open, I'd much rather discover that the people who wandered in early spent this awkward construction period preparing to absolutely ruin somebody's first match.",
  'Explore the Rules',
  '__HR__',
  'One More Thing.',
  "If you're here during the beginning, I want the game to remember that.",
  "Accounts created during Intrilex's first month will receive an exclusive early-user badge.",
  'Nothing that gives you a gameplay advantage.',
  'Just proof that when Intrilex was still held together by ambition, debugging, and one increasingly sleep-deprived creator...',
  'you were already here.',
  'And yes—',
  'for the moment, this really is mostly just me building it.',
  "So if you're looking around thinking:",
  '"Wait. One guy is trying to build all of this?"',
  'Correct.',
  'I have questioned this arrangement as well.',
  '__HR__',
  'Anyway.',
  "You're early. Quite early.",
  'Earlier than I expected you to be, actually.',
  'I see you finding Intrilex.',
  "I'm nervous that the game isn't ready for you yet.",
  "I'm also more motivated than ever to make sure that when you come back...",
  'it is.',
  'Take a look around.',
  'Read the Rules....',
  'Get ahead while you still can.',
  'And check back soon.',
  "I'm building.",
  '— Deffy',
  'Creator of Intrilex',
  'PYAH.',
];

/**
 * Read a WAV file and return { sampleRate, samples (Float32Array), duration }.
 */
function readWavPcm(filePath) {
  const buf = readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`Not RIFF: ${filePath}`);
  if (buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Not WAVE: ${filePath}`);
  const audioFormat = buf.readUInt16LE(20);
  if (audioFormat !== 1) throw new Error(`Not PCM: ${filePath}`);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  if (bitsPerSample !== 16) throw new Error(`Not 16-bit: ${filePath}`);

  let offset = 20 + buf.readUInt32LE(16);
  let dataOffset = -1, dataLen = 0;
  while (offset < buf.length - 8) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'data') { dataOffset = offset + 8; dataLen = chunkSize; break; }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataOffset < 0) throw new Error(`No data chunk: ${filePath}`);

  const numSamples = Math.floor(dataLen / (bitsPerSample / 8) / numChannels);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const sampleIdx = dataOffset + i * numChannels * (bitsPerSample / 8);
    samples[i] = buf.readInt16LE(sampleIdx) / 32768;
  }
  return { sampleRate, samples, duration: numSamples / sampleRate };
}

/**
 * Compute the noise floor (10th percentile of window RMS).
 */
function computeNoiseFloor(samples, sampleRate, windowMs = 50) {
  const windowSize = Math.floor(sampleRate * windowMs / 1000);
  const numWindows = Math.floor(samples.length / windowSize);
  const energies = [];
  for (let w = 0; w < numWindows; w++) {
    let sumSq = 0;
    const base = w * windowSize;
    for (let i = 0; i < windowSize; i++) sumSq += samples[base + i] * samples[base + i];
    energies.push(Math.sqrt(sumSq / windowSize));
  }
  energies.sort((a, b) => a - b);
  return energies[Math.floor(energies.length * 0.1)] || 0;
}

/**
 * Detect silence regions in the audio.
 * Returns array of { start, end, duration }.
 */
function detectSilence(samples, sampleRate, opts = {}) {
  const {
    windowMs = 20,
    silenceThreshold = 0.012,
    minSilenceMs = 120,
    mergeGapMs = 60,
  } = opts;

  const windowSize = Math.floor(sampleRate * windowMs / 1000);
  const numWindows = Math.floor(samples.length / windowSize);
  const thresholdSq = silenceThreshold * silenceThreshold;

  const isSilent = new Uint8Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    let sumSq = 0;
    const base = w * windowSize;
    for (let i = 0; i < windowSize; i++) sumSq += samples[base + i] * samples[base + i];
    isSilent[w] = (sumSq / windowSize) < thresholdSq ? 1 : 0;
  }

  const silences = [];
  let start = -1;
  for (let w = 0; w <= numWindows; w++) {
    if (w < numWindows && isSilent[w]) {
      if (start < 0) start = w;
    } else if (start >= 0) {
      const sTime = (start * windowSize) / sampleRate;
      const eTime = (w * windowSize) / sampleRate;
      if ((eTime - sTime) * 1000 >= minSilenceMs) {
        silences.push({ start: sTime, end: eTime, duration: eTime - sTime });
      }
      start = -1;
    }
  }

  // Merge close silences
  const merged = [];
  for (const s of silences) {
    if (merged.length > 0 && s.start - merged[merged.length - 1].end < mergeGapMs / 1000) {
      merged[merged.length - 1].end = s.end;
      merged[merged.length - 1].duration = merged[merged.length - 1].end - merged[merged.length - 1].start;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/**
 * Align text lines to audio using DP forced alignment.
 *
 * Given N text lines with character counts and M silence boundary midpoints,
 * find the optimal N-1 split points that divide the audio into N segments,
 * minimizing the sum of squared deviations from expected durations.
 *
 * @param {string[]} lines - Text lines ('__HR__' for section breaks)
 * @param {object[]} silences - Silence regions from detectSilence
 * @param {number} audioDuration - Total audio duration in seconds
 * @returns {object[]} Array of { index, type, text, start, end }
 */
function alignLinesToAudio(lines, silences, audioDuration) {
  // Separate text lines and HR markers, keeping track of original indices
  const items = lines.map((text, i) => {
    if (text === '__HR__') return { index: i, type: 'hr', chars: 0, text: '' };
    const chars = text.replace(/\s+/g, ' ').trim().length;
    return { index: i, type: 'text', chars, text };
  });

  const textItems = items.filter(it => it.type === 'text');
  const N = textItems.length;

  // Extract silence midpoints as candidate split points
  const splitPoints = silences.map(s => (s.start + s.end) / 2);
  // Add 0 and duration as boundary points
  const boundaries = [0, ...splitPoints, audioDuration];
  const M = boundaries.length; // M points → M-1 segments

  // Estimate pause time consumed by HR elements
  // Find silences that are likely HR pauses (longer than typical line pauses)
  // Use the top 25% longest silences as HR pause candidates
  const sortedSilences = [...silences].sort((a, b) => b.duration - a.duration);
  const hrCount = items.filter(it => it.type === 'hr').length;
  // Estimate HR pause duration from the longest silences
  const hrSilences = sortedSilences.slice(0, Math.max(hrCount, 1));
  const avgHrPause = hrSilences.reduce((s, x) => s + x.duration, 0) / Math.max(hrSilences.length, 1);
  const totalHrPause = avgHrPause * hrCount;

  // Expected duration per character
  const totalChars = textItems.reduce((s, it) => s + it.chars, 0);
  const speakTime = Math.max(1, audioDuration - totalHrPause);
  const charRate = totalChars > 0 ? speakTime / totalChars : 0;

  // Expected cumulative end time for each text line
  let cumTime = 0;
  const expectedEnd = [];
  for (const it of textItems) {
    cumTime += it.chars * charRate;
    expectedEnd.push(cumTime);
  }
  // Scale expected times to fill the full audio duration
  const scale = audioDuration / expectedEnd[expectedEnd.length - 1];
  for (let i = 0; i < N; i++) expectedEnd[i] *= scale;

  // DP: dp[i][j] = min cost of assigning text lines 0..i-1 using boundary j as the end
  // i ranges 0..N, j ranges 0..M-1
  // dp[0][0] = 0 (no lines assigned, at time 0)
  // dp[i][j] = min over k < j of dp[i-1][k] + cost(boundaries[k], boundaries[j], line i-1)
  // cost(start, end, line) = ((end - start) - expectedDuration(line))²

  const expectedDur = textItems.map(it => it.chars * charRate * scale);

  // Use 1D DP with backtracking
  // dp[j] = { cost, prev } for the current text line
  const INF = Infinity;
  // prev[i][j] = the boundary index k that was chosen as the start for line i ending at j
  const prev = Array.from({ length: N + 1 }, () => new Int32Array(M).fill(-1));
  const dpCurr = new Float64Array(M).fill(INF);
  const dpPrev = new Float64Array(M).fill(INF);

  // Base case: dp[0][0] = 0
  dpPrev[0] = 0;

  for (let i = 1; i <= N; i++) {
    dpCurr.fill(INF);
    const expDur = expectedDur[i - 1];
    for (let j = i; j < M; j++) { // need at least i boundaries before j
      // Find best k < j
      let bestCost = INF;
      let bestK = -1;
      for (let k = i - 1; k < j; k++) {
        if (dpPrev[k] === INF) continue;
        const segDur = boundaries[j] - boundaries[k];
        if (segDur <= 0) continue;
        const dev = segDur - expDur;
        const cost = dpPrev[k] + dev * dev;
        if (cost < bestCost) {
          bestCost = cost;
          bestK = k;
        }
      }
      if (bestK >= 0) {
        dpCurr[j] = bestCost;
        prev[i][j] = bestK;
      }
    }
    // Swap
    dpPrev.set(dpCurr);
  }

  // Find the best ending boundary for the last line
  let bestEnd = -1;
  let bestCost = INF;
  for (let j = N; j < M; j++) {
    if (dpPrev[j] < bestCost) {
      bestCost = dpPrev[j];
      bestEnd = j;
    }
  }

  // Backtrack to find the boundary assignments
  const lineBoundaries = new Int32Array(N + 1);
  lineBoundaries[N] = bestEnd;
  for (let i = N; i > 0; i--) {
    lineBoundaries[i - 1] = prev[i][lineBoundaries[i]];
  }

  // Convert boundary indices to times
  const textTimings = [];
  for (let i = 0; i < N; i++) {
    const startIdx = lineBoundaries[i];
    const endIdx = lineBoundaries[i + 1];
    textTimings.push({
      ...textItems[i],
      start: boundaries[startIdx],
      end: boundaries[endIdx],
    });
  }

  // Now interleave HR elements back in at their correct positions
  // HR elements should be placed at the gap between the preceding and following text lines
  const allTimings = [];
  let textIdx = 0;
  for (const item of items) {
    if (item.type === 'hr') {
      // Place HR at the boundary between the previous and next text lines
      // Use the end time of the previous text line
      const prevEnd = textIdx > 0 ? textTimings[textIdx - 1].end : 0;
      const nextStart = textIdx < N ? textTimings[textIdx].start : audioDuration;
      allTimings.push({
        index: item.index,
        type: 'hr',
        text: '',
        start: prevEnd,
        end: nextStart,
      });
    } else {
      allTimings.push(textTimings[textIdx]);
      textIdx++;
    }
  }

  return allTimings;
}

// ── Main ──
console.log('Analyzing dev-note audio files for forced alignment...\n');

const result = {};
for (const voice of voices) {
  const filePath = join(assetsDir, voice.file);
  console.log(`  [${voice.id}] Reading ${voice.file}...`);
  const { sampleRate, samples, duration } = readWavPcm(filePath);
  console.log(`    duration: ${duration.toFixed(2)}s`);

  const noiseFloor = computeNoiseFloor(samples, sampleRate);
  const threshold = Math.max(0.008, noiseFloor * 3);
  console.log(`    noise floor: ${noiseFloor.toFixed(5)}, threshold: ${threshold.toFixed(5)}`);

  const silences = detectSilence(samples, sampleRate, {
    silenceThreshold: threshold,
    minSilenceMs: 120,
    mergeGapMs: 60,
  });
  console.log(`    silences: ${silences.length} (significant >300ms: ${silences.filter(s => s.duration >= 0.3).length})`);

  const timings = alignLinesToAudio(TEXT_LINES, silences, duration);

  // Log first few and last few for verification
  console.log(`    first 5 timings:`);
  for (const t of timings.slice(0, 5)) {
    const text = t.type === 'hr' ? '--- HR ---' : t.text.substring(0, 50);
    console.log(`      ${t.start.toFixed(1).padStart(7)} → ${t.end.toFixed(1).padStart(7)} (${(t.end - t.start).toFixed(1).padStart(5)}s) ${text}`);
  }
  console.log(`    last 5 timings:`);
  for (const t of timings.slice(-5)) {
    const text = t.type === 'hr' ? '--- HR ---' : t.text.substring(0, 50);
    console.log(`      ${t.start.toFixed(1).padStart(7)} → ${t.end.toFixed(1).padStart(7)} (${(t.end - t.start).toFixed(1).padStart(5)}s) ${text}`);
  }
  console.log();

  result[voice.id] = {
    file: voice.file,
    duration: parseFloat(duration.toFixed(3)),
    timings: timings.map(t => ({
      i: t.index,
      t: t.type,
      s: parseFloat(t.start.toFixed(3)),
      e: parseFloat(t.end.toFixed(3)),
    })),
  };
}

writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(`Wrote timing data to ${outFile}`);
