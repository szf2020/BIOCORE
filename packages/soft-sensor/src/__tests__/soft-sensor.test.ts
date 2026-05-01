import { describe, it, expect, beforeEach } from 'vitest';
import { SoftSensorEngine, type SoftSensorModel } from '../index.js';
import { FeedAdvisor } from '../feed-advisor.js';
import { RootCauseAnalyzer } from '../root-cause.js';
import { MultiReactorManager } from '../multi-reactor.js';

// ─── SoftSensorEngine ───────────────────────────────────────

describe('SoftSensorEngine', () => {
  let engine: SoftSensorEngine;

  const testModel: SoftSensorModel = {
    id: 'test-model-1',
    name: 'OD600 predictor',
    target: 'OD600',
    input_features: ['temperature', 'pH', 'DO'],
    coefficients: [0.5, 0.3, 0.1],
    intercept: 1.0,
    r_squared: 0.92,
    training_batches: 20,
    status: 'active',
  };

  beforeEach(() => {
    engine = new SoftSensorEngine();
  });

  it('should register and list models', () => {
    engine.registerModel(testModel);
    const models = engine.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('test-model-1');
    expect(models[0].name).toBe('OD600 predictor');
  });

  it('should remove a model', () => {
    engine.registerModel(testModel);
    engine.removeModel('test-model-1');
    expect(engine.listModels()).toHaveLength(0);
  });

  it('should predict with known coefficients', () => {
    engine.registerModel(testModel);

    // y = 1.0 + 0.5*37 + 0.3*7.0 + 0.1*40 = 1.0 + 18.5 + 2.1 + 4.0 = 25.6
    const result = engine.predict('test-model-1', {
      temperature: 37,
      pH: 7.0,
      DO: 40,
    });

    expect(result.value).toBeCloseTo(25.6, 5);
    expect(result.ciLower).toBeLessThan(result.value);
    expect(result.ciUpper).toBeGreaterThan(result.value);
    expect(typeof result.isExtrapolating).toBe('boolean');
  });

  it('should throw on missing model', () => {
    expect(() => engine.predict('nonexistent', {})).toThrow('Model nonexistent not found');
  });

  it('should throw on inactive model', () => {
    const inactiveModel = { ...testModel, id: 'inactive-1', status: 'inactive' as const };
    engine.registerModel(inactiveModel);
    expect(() => engine.predict('inactive-1', { temperature: 37, pH: 7, DO: 40 }))
      .toThrow('not active');
  });

  it('should throw on missing feature', () => {
    engine.registerModel(testModel);
    expect(() => engine.predict('test-model-1', { temperature: 37, pH: 7.0 }))
      .toThrow('Missing feature: DO');
  });

  it('should detect extrapolation when features are outside training range', () => {
    engine.registerModel(testModel);
    engine.setFeatureRanges('test-model-1', {
      temperature: [30, 40],
      pH: [6.5, 7.5],
      DO: [20, 80],
    });

    // Within range
    const inRange = engine.predict('test-model-1', { temperature: 37, pH: 7.0, DO: 40 });
    expect(inRange.isExtrapolating).toBe(false);

    // Outside range (temperature = 50 > 40)
    const outOfRange = engine.predict('test-model-1', { temperature: 50, pH: 7.0, DO: 40 });
    expect(outOfRange.isExtrapolating).toBe(true);
  });
});

// ─── trainLinearModel ───────────────────────────────────────

describe('SoftSensorEngine.trainLinearModel', () => {
  it('should train on simple linear data and produce R² > 0', () => {
    // y = 2*x + 1 (perfect linear relationship)
    const data = [
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
      { x: 4, y: 9 },
      { x: 5, y: 11 },
    ];

    const model = SoftSensorEngine.trainLinearModel('y', ['x'], data);

    expect(model.target).toBe('y');
    expect(model.input_features).toEqual(['x']);
    expect(model.coefficients[0]).toBeCloseTo(2, 4);
    expect(model.intercept).toBeCloseTo(1, 4);
    expect(model.r_squared).toBeGreaterThan(0.99);
    expect(model.status).toBe('active');
    expect(model.training_batches).toBe(5);
  });

  it('should handle multi-feature regression', () => {
    // y = 1 + 2*x1 + 3*x2
    const data = [
      { x1: 1, x2: 1, y: 6 },
      { x1: 2, x2: 1, y: 8 },
      { x1: 1, x2: 2, y: 9 },
      { x1: 3, x2: 2, y: 13 },
      { x1: 2, x2: 3, y: 14 },
    ];

    const model = SoftSensorEngine.trainLinearModel('y', ['x1', 'x2'], data);

    expect(model.r_squared).toBeGreaterThan(0.9);
    expect(model.coefficients).toHaveLength(2);
  });

  it('should throw on empty data', () => {
    expect(() => SoftSensorEngine.trainLinearModel('y', ['x'], []))
      .toThrow('No training data');
  });

  it('should throw on empty features', () => {
    expect(() => SoftSensorEngine.trainLinearModel('y', [], [{ y: 1 }]))
      .toThrow('No features');
  });
});

// ─── FeedAdvisor ────────────────────────────────────────────

describe('FeedAdvisor', () => {
  let advisor: FeedAdvisor;

  beforeEach(() => {
    advisor = new FeedAdvisor();
  });

  it('should recommend increase when glucose is low (substrate-limited)', () => {
    const result = advisor.recommend({
      currentOD: 10,
      currentGlucose: 0.005, // below Ks
      targetMu: 0.2,
      muMax: 0.5,
      Ks: 0.05,
      Yxs: 0.5,
      currentFeedRate: 5.0,
      feedConcentration: 500,
      liquidVolume: 5,
    });

    expect(result.action).toBe('increase');
    expect(result.suggestedRate).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reason).toContain('Glucose');
  });

  it('should recommend decrease when glucose is high (accumulating)', () => {
    const result = advisor.recommend({
      currentOD: 5,
      currentGlucose: 8.0, // high, risk of overflow
      targetMu: 0.15,
      muMax: 0.5,
      Ks: 0.05,
      Yxs: 0.5,
      currentFeedRate: 50.0, // much higher than needed
      feedConcentration: 500,
      liquidVolume: 5,
    });

    expect(result.action).toBe('decrease');
    expect(result.suggestedRate).toBeLessThan(50.0);
    expect(result.reason).toContain('overflow metabolism');
  });

  it('should maintain when rate is near optimal', () => {
    // Calculate the exact optimal rate and set currentFeedRate to match
    // F = (mu/Yxs) * X_gL * V / Sf * 1000 mL/h
    // X_gL = 10 * 0.4 = 4 g/L
    // F = (0.2/0.5) * 4 * 5 / 500 * 1000 = 0.4 * 4 * 5 / 500 * 1000 = 16
    const result = advisor.recommend({
      currentOD: 10,
      currentGlucose: 1.0,
      targetMu: 0.2,
      muMax: 0.5,
      Ks: 0.05,
      Yxs: 0.5,
      currentFeedRate: 16.0,
      feedConcentration: 500,
      liquidVolume: 5,
    });

    expect(result.action).toBe('maintain');
  });

  it('should return 0 rate when OD is zero', () => {
    const result = advisor.recommend({
      currentOD: 0,
      currentGlucose: 1.0,
      targetMu: 0.2,
      muMax: 0.5,
      Ks: 0.05,
      Yxs: 0.5,
      currentFeedRate: 10,
      feedConcentration: 500,
      liquidVolume: 5,
    });

    expect(result.suggestedRate).toBe(0);
    expect(result.action).toBe('maintain');
  });
});

// ─── RootCauseAnalyzer ──────────────────────────────────────

describe('RootCauseAnalyzer', () => {
  let analyzer: RootCauseAnalyzer;

  beforeEach(() => {
    analyzer = new RootCauseAnalyzer();
  });

  it('should identify temperature alarm cause', () => {
    const result = analyzer.analyze({
      alarmCode: 'TEMP_HIGH',
      alarmTime: new Date('2026-04-05T10:00:00Z'),
      paramHistory: {
        temperature: [37.0, 37.1, 37.3, 37.5, 38.0, 38.5, 39.0, 39.5, 40.0, 40.5],
        DO: [40, 38, 35, 30, 25, 22, 20, 18, 15, 12],
        pH: [7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0],
        agitation: [300, 300, 300, 300, 300, 300, 300, 300, 300, 300],
      },
      paramNames: ['temperature', 'DO', 'pH', 'agitation'],
      normalRanges: {
        temperature: [35, 38],
        DO: [20, 80],
        pH: [6.8, 7.2],
        agitation: [200, 500],
      },
    });

    expect(result.probableCauses.length).toBeGreaterThan(0);
    expect(result.affectedParams).toContain('temperature');
    expect(result.probableCauses[0].confidence).toBeGreaterThan(0.5);
    expect(result.recommendation).toBeTruthy();
    expect(result.timelineNarrative).toContain('TEMP_HIGH');
  });

  it('should identify DO low alarm with feed overload', () => {
    const result = analyzer.analyze({
      alarmCode: 'DO_LOW',
      alarmTime: new Date('2026-04-05T12:00:00Z'),
      paramHistory: {
        DO: [50, 45, 40, 30, 20, 15, 10, 8, 5, 3],
        feed_rate: [5, 8, 12, 15, 20, 25, 30, 35, 40, 45],
        agitation: [300, 300, 300, 300, 300, 300, 300, 300, 300, 300],
        airflow: [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0],
      },
      paramNames: ['DO', 'feed_rate', 'agitation', 'airflow'],
      normalRanges: {
        DO: [20, 80],
        feed_rate: [0, 20],
        agitation: [200, 500],
        airflow: [1, 5],
      },
    });

    expect(result.affectedParams).toContain('DO');
    expect(result.affectedParams).toContain('feed_rate');
    expect(result.probableCauses.some(c => c.cause.includes('feed'))).toBe(true);
  });

  it('should handle unknown alarm code gracefully', () => {
    const result = analyzer.analyze({
      alarmCode: 'UNKNOWN_ALARM',
      alarmTime: new Date(),
      paramHistory: { temperature: [37, 37, 37, 37, 37] },
      paramNames: ['temperature'],
      normalRanges: { temperature: [35, 38] },
    });

    expect(result.probableCauses).toBeDefined();
    expect(result.recommendation).toBeTruthy();
  });
});

// ─── MultiReactorManager ────────────────────────────────────

describe('MultiReactorManager', () => {
  let manager: MultiReactorManager;

  beforeEach(() => {
    manager = new MultiReactorManager();
  });

  it('should add and list reactors', () => {
    manager.addReactor('r1', 'Reactor A', { ip: '192.168.1.10', port: 502 });
    manager.addReactor('r2', 'Reactor B', { ip: '192.168.1.11', port: 502 });

    const list = manager.listReactors();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('r1');
    expect(list[0].name).toBe('Reactor A');
    expect(list[1].id).toBe('r2');
  });

  it('should remove a reactor', () => {
    manager.addReactor('r1', 'Reactor A', { ip: '192.168.1.10' });
    manager.removeReactor('r1');
    expect(manager.listReactors()).toHaveLength(0);
  });

  it('should get reactor details', () => {
    manager.addReactor('r1', 'Reactor A', { ip: '192.168.1.10', port: 502 });
    const reactor = manager.getReactor('r1');
    expect(reactor.id).toBe('r1');
    expect(reactor.name).toBe('Reactor A');
    expect(reactor.plcConfig).toEqual({ ip: '192.168.1.10', port: 502 });
  });

  it('should throw when adding duplicate reactor id', () => {
    manager.addReactor('r1', 'Reactor A', {});
    expect(() => manager.addReactor('r1', 'Reactor B', {}))
      .toThrow('already exists');
  });

  it('should throw when removing nonexistent reactor', () => {
    expect(() => manager.removeReactor('r99'))
      .toThrow('not found');
  });

  it('should enforce max 4 reactors', () => {
    manager.addReactor('r1', 'R1', {});
    manager.addReactor('r2', 'R2', {});
    manager.addReactor('r3', 'R3', {});
    manager.addReactor('r4', 'R4', {});
    expect(() => manager.addReactor('r5', 'R5', {}))
      .toThrow('maximum of 4');
  });

  it('should update reactor status', () => {
    manager.addReactor('r1', 'Reactor A', {});
    manager.setStatus('r1', 'online');
    const reactor = manager.getReactor('r1');
    expect(reactor.status).toBe('online');
  });
});
