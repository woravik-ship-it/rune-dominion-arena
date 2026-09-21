// Logger tests — Phase 12 (monitoring)
import { logger, newRequestId, slowRequestMs } from '@/lib/logger';

describe('logger (structured log)', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;
  const originalLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    process.env.LOG_LEVEL = 'debug';
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLevel;
  });

  test('info เขียนเป็น JSON ที่ parse ได้ พร้อม ts/level/msg', () => {
    logger.info('hello', { requestId: 'r1', path: '/api/health' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('hello');
    expect(entry.requestId).toBe('r1');
    expect(typeof entry.ts).toBe('string');
  });

  test('warn/error ไปคนละ stream', () => {
    logger.warn('careful');
    logger.error('boom');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).level).toBe('error');
  });

  test('LOG_LEVEL=error → info ถูกกรองออก', () => {
    process.env.LOG_LEVEL = 'error';
    logger.info('should be skipped');
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('slowRequestMs', () => {
  const original = process.env.SLOW_REQUEST_MS;

  afterEach(() => {
    if (original === undefined) delete process.env.SLOW_REQUEST_MS;
    else process.env.SLOW_REQUEST_MS = original;
  });

  test('ค่าเริ่มต้น 1000ms', () => {
    delete process.env.SLOW_REQUEST_MS;
    expect(slowRequestMs()).toBe(1000);
  });

  test('อ่านจาก env และกันค่าที่ไม่ถูกต้อง', () => {
    process.env.SLOW_REQUEST_MS = '250';
    expect(slowRequestMs()).toBe(250);
    process.env.SLOW_REQUEST_MS = 'abc';
    expect(slowRequestMs()).toBe(1000);
    process.env.SLOW_REQUEST_MS = '-5';
    expect(slowRequestMs()).toBe(1000);
  });
});

describe('newRequestId', () => {
  test('ไม่ซ้ำกันในทางปฏิบัติ และไม่มีอักขระแปลกปลอม', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^r[a-z0-9]+$/);
    }
  });
});
