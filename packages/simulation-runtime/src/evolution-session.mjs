import { validateRecord, validateReplay, retainReplay } from './evolution-domain.mjs';

/** Owns pending ordinal claims and committed results independently of workers/UI. */
export class EvolutionSession {
  constructor(run) {
    this.run = run;
    this.claims = new Map();
    this.seen = new Set(run.records.map(r => r.ordinal));
    this.epoch = 0;
  }
  start() {
    if (!['IDLE', 'PAUSED'].includes(this.run.status)) throw new Error('RUN_CANNOT_START');
    this.run.status = 'RUNNING'; this.epoch += 1; this.claims.clear();
    return this.epoch;
  }
  claim(worker) {
    if (this.run.status !== 'RUNNING' || this.claims.has(worker)) return null;
    const claimed = new Set(this.claims.values());
    for (let ordinal = 0; ordinal < this.run.config.gameCount; ordinal += 1) {
      if (!this.seen.has(ordinal) && !claimed.has(ordinal)) { this.claims.set(worker, ordinal); return ordinal; }
    }
    return null;
  }
  accept(worker, epoch, evidence) {
    if (this.run.status !== 'RUNNING' || epoch !== this.epoch) return false;
    const record = evidence?.record;
    if (!record || this.seen.has(record.ordinal)) return false;
    if (this.claims.get(worker) !== record.ordinal) throw new Error('UNCLAIMED_ORDINAL');
    validateRecord(record, this.run);
    if (evidence.replay) validateReplay({ replay: evidence.replay, replayId: record.replayId }, record, this.run);
    this.claims.delete(worker); this.seen.add(record.ordinal); this.run.records.push(record);
    retainReplay(this.run, evidence);
    if (this.seen.size === this.run.config.gameCount) this.run.status = 'COMPLETE';
    return true;
  }
  pause() { if (this.run.status === 'RUNNING') { this.run.status = 'PAUSED'; this.epoch += 1; this.claims.clear(); } }
  stop() { if (['RUNNING', 'PAUSED'].includes(this.run.status)) { this.run.status = 'STOPPED'; this.epoch += 1; this.claims.clear(); } }
  error(message) { this.run.status = 'ERROR'; this.run.error = String(message).slice(0, 2000); this.epoch += 1; this.claims.clear(); }
}
