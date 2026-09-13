import { describe, expect, it } from 'vitest';
import { InMemorySourceLock } from '../../src/services/source-lock.js';
import type { Clock } from '../../src/ports/clock.js';

class ManualClock implements Clock {
  current = new Date('2026-01-01T00:00:00.000Z');

  now(): Date {
    return new Date(this.current);
  }

  random(): number {
    return 0.5;
  }
}

describe('InMemorySourceLock', () => {
  it('reclaims a lock after its timeout without releasing the replacement lease', async () => {
    const clock = new ManualClock();
    const lock = new InMemorySourceLock(clock);
    const original = await lock.acquire('github:owner/repo', 'session-a', 1_000);

    clock.current = new Date(clock.current.getTime() + 1_001);
    const replacement = await lock.acquire('github:owner/repo', 'session-b', 1_000);

    await original.release();
    const blocked = lock.acquire('github:owner/repo', 'session-c', 1_000);
    let acquired = false;
    void blocked.then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    await replacement.release();
    await expect(blocked).resolves.toBeDefined();
  });

  it('keeps independent repositories independent', async () => {
    const lock = new InMemorySourceLock(new ManualClock());
    const first = await lock.acquire('github:owner/one', 'session-a', 1_000);

    await expect(lock.acquire('github:owner/two', 'session-b', 1_000)).resolves.toBeDefined();
    await first.release();
  });
});
