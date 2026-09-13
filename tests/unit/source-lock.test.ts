import { describe, expect, it } from 'vitest';
import { FileSystemSourceLock } from '../../src/services/source-lock.js';
import type { Clock } from '../../src/ports/clock.js';
import { FakeFileSystem } from '../fixtures/fakes.js';

class ManualClock implements Clock {
  current = new Date('2026-01-01T00:00:00.000Z');

  now(): Date {
    return new Date(this.current);
  }

  random(): number {
    return 0.5;
  }
}

describe('FileSystemSourceLock', () => {
  function createLock(fileSystem: FakeFileSystem, clock: ManualClock) {
    return new FileSystemSourceLock({
      fileSystem,
      clock,
      lockRoot: '/cache/locks',
      pollIntervalMs: 1,
      sleep: async (milliseconds) => {
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
      },
    });
  }

  it('prevents separate lock instances from acquiring the same repository concurrently', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const firstLock = createLock(fileSystem, clock);
    const secondLock = createLock(fileSystem, clock);
    const first = await firstLock.acquire('github:owner/repo', 'owner-a', 1_000, 'session-a');

    let secondAcquired = false;
    const secondPromise = secondLock
      .acquire('github:owner/repo', 'owner-b', 1_000, 'session-b')
      .then((lease) => {
        secondAcquired = true;
        return lease;
      });
    await Promise.resolve();

    expect(secondAcquired).toBe(false);
    const lockWrite = fileSystem.calls.find(([method]) => method === 'createExclusive');
    expect(lockWrite?.[2]).toEqual(expect.stringContaining('"sessionId":"session-a"'));
    expect(lockWrite?.[2]).toEqual(expect.stringContaining('"owner":"owner-a"'));
    expect(lockWrite?.[2]).toEqual(expect.stringContaining('"pid":'));
    expect(lockWrite?.[2]).toEqual(expect.stringContaining('"createdAt":'));

    await first.release();
    const second = await secondPromise;
    await second.release();
  });

  it('reclaims a stale lock and prevents the old lease from releasing the replacement', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const lock = createLock(fileSystem, clock);
    const original = await lock.acquire('github:owner/repo', 'owner-a', 1_000, 'session-a');

    clock.current = new Date(clock.current.getTime() + 1_001);
    const replacement = await lock.acquire('github:owner/repo', 'owner-b', 1_000, 'session-b');

    await original.release();
    const blocked = lock.acquire('github:owner/repo', 'owner-c', 1_000, 'session-c');
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
    const clock = new ManualClock();
    const lock = createLock(new FakeFileSystem(), clock);
    const first = await lock.acquire('github:owner/one', 'owner-a', 1_000, 'session-a');

    await expect(lock.acquire('github:owner/two', 'owner-b', 1_000, 'session-b')).resolves.toBeDefined();
    await first.release();
  });

  it('rechecks timeout while waiting when the original holder crashes', async () => {
    const clock = new ManualClock();
    const fileSystem = new FakeFileSystem();
    const firstLock = createLock(fileSystem, clock);
    const secondLock = createLock(fileSystem, clock);
    await firstLock.acquire('github:owner/repo', 'owner-a', 1_000, 'session-a');

    let sleepCalls = 0;
    const waitingLock = new FileSystemSourceLock({
      fileSystem,
      clock,
      lockRoot: '/cache/locks',
      pollIntervalMs: 100,
      sleep: async () => {
        sleepCalls += 1;
        clock.current = new Date(clock.current.getTime() + 1_001);
      },
    });

    const replacement = await waitingLock.acquire(
      'github:owner/repo',
      'owner-b',
      1_000,
      'session-b',
    );

    expect(sleepCalls).toBeGreaterThan(0);
    await replacement.release();
    void secondLock;
  });
});
