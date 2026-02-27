const { createCircuitBreaker, STATES } = require('../../src/services/circuitBreaker');

describe('circuitBreaker module', () => {
  const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('starts in closed state', () => {
    const cb = createCircuitBreaker({ logger: silentLogger });
    expect(cb.getState()).toBe(STATES.CLOSED);
    expect(cb.allowRequest()).toBe(true);
  });

  test('stays closed below failure threshold', () => {
    const cb = createCircuitBreaker({ failureThreshold: 5, logger: silentLogger });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe(STATES.CLOSED);
    expect(cb.allowRequest()).toBe(true);
  });

  test('opens after reaching failure threshold', () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, logger: silentLogger });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe(STATES.OPEN);
    expect(cb.allowRequest()).toBe(false);
  });

  test('transitions from open to half-open after cooldown', () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 100,
      logger: silentLogger,
    });
    cb.recordFailure();
    expect(cb.getState()).toBe(STATES.OPEN);

    // Simulate time passing
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 200);
    expect(cb.getState()).toBe(STATES.HALF_OPEN);
    expect(cb.allowRequest()).toBe(true);
    Date.now.mockRestore();
  });

  test('closes after successful probe in half-open state', () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 0,
      logger: silentLogger,
    });
    cb.recordFailure(); // open
    cb.getState(); // trigger half-open transition
    cb.recordSuccess();
    expect(cb.getState()).toBe(STATES.CLOSED);
    expect(cb.stats().consecutiveFailures).toBe(0);
  });

  test('re-opens after failed probe in half-open state', () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 60000, // long cooldown so it stays open after re-open
      logger: silentLogger,
    });
    cb.recordFailure(); // open

    // Force half-open by advancing time past cooldown
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000);
    expect(cb.getState()).toBe(STATES.HALF_OPEN);

    cb.recordFailure(); // probe fails — should re-open
    // Now Date.now() is still mocked to the advanced time, but openedAt is also at advanced time
    // So cooldown hasn't elapsed yet => stays open
    expect(cb.getState()).toBe(STATES.OPEN);
    expect(cb.allowRequest()).toBe(false);
    Date.now.mockRestore();
  });

  test('recordSuccess resets failure count in closed state', () => {
    const cb = createCircuitBreaker({ failureThreshold: 5, logger: silentLogger });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.stats().consecutiveFailures).toBe(0);
  });

  test('stats() returns current state and failure count', () => {
    const cb = createCircuitBreaker({ failureThreshold: 5, logger: silentLogger });
    cb.recordFailure();
    cb.recordFailure();
    const s = cb.stats();
    expect(s.state).toBe(STATES.CLOSED);
    expect(s.consecutiveFailures).toBe(2);
  });

  test('reset() returns to closed state', () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, logger: silentLogger });
    cb.recordFailure();
    expect(cb.getState()).toBe(STATES.OPEN);
    cb.reset();
    expect(cb.getState()).toBe(STATES.CLOSED);
    expect(cb.stats().consecutiveFailures).toBe(0);
  });

  test('STATES enum is frozen', () => {
    expect(Object.isFrozen(STATES)).toBe(true);
    expect(STATES.CLOSED).toBe('closed');
    expect(STATES.OPEN).toBe('open');
    expect(STATES.HALF_OPEN).toBe('half-open');
  });
});
