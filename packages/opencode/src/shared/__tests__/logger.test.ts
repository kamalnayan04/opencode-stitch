
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { logger } from '../logger';
import * as fs from 'fs';
import * as path from 'path';

describe('Logger Facade - Feature 1: Export', () => {
  it('should export singleton logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger.debug).toBeInstanceOf(Function);
    expect(logger.info).toBeInstanceOf(Function);
    expect(logger.warn).toBeInstanceOf(Function);
    expect(logger.error).toBeInstanceOf(Function);
  });
});

describe('Logger Facade - Feature 2: STITCH_DEBUG Handling', () => {
  const logPath = path.join(process.cwd(), 'stitch-debug.log');
  
  beforeEach(() => {
    // Clear log file before each test
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '');
    }
  });
  
  afterEach(() => {
    // Clean up
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  });
  
  it('should forward calls to debugLogger when STITCH_DEBUG is not false', () => {
    logger.debug('test message', { data: 'value' });
    
    // Check that log file was created and contains the message
    const logExists = fs.existsSync(logPath);
    expect(logExists).toBe(true);
    
    if (logExists) {
      const logContent = fs.readFileSync(logPath, 'utf-8');
      expect(logContent).toContain('test message');
      expect(logContent).toContain('data');
    }
  });
  
  it('should respect debugLogger behavior for all log levels', () => {
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');
    
    const logContent = fs.readFileSync(logPath, 'utf-8');
    expect(logContent).toContain('info message');
    expect(logContent).toContain('warn message');
    expect(logContent).toContain('error message');
  });
});

describe('Logger Facade - Feature 3: Correlation ID Convenience', () => {
  const logPath = path.join(process.cwd(), 'stitch-debug.log');
  
  beforeEach(() => {
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '');
    }
  });
  
  afterEach(() => {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  });
  
  it('should create scoped loggers with correlation ID', () => {
    const scoped = logger.withCorrelationId('req-456');
    expect(scoped).toBeDefined();
    expect(scoped.info).toBeInstanceOf(Function);
  });
  
  it('should include correlation ID in scoped logger output', () => {
    const scoped = logger.withCorrelationId('req-789');
    scoped.info('scoped message');
    
    const logContent = fs.readFileSync(logPath, 'utf-8');
    expect(logContent).toContain('[req-789]');
    expect(logContent).toContain('scoped message');
  });
  
  it('should create independent scoped loggers', () => {
    const scoped1 = logger.withCorrelationId('req-001');
    const scoped2 = logger.withCorrelationId('req-002');
    
    scoped1.debug('message from scoped1');
    scoped2.debug('message from scoped2');
    
    const logContent = fs.readFileSync(logPath, 'utf-8');
    expect(logContent).toContain('[req-001]');
    expect(logContent).toContain('message from scoped1');
    expect(logContent).toContain('[req-002]');
    expect(logContent).toContain('message from scoped2');
  });
  
  it('should use NO-CID for root logger without correlation ID', () => {
    logger.debug('root message');
    
    const logContent = fs.readFileSync(logPath, 'utf-8');
    expect(logContent).toContain('[NO-CID]');
    expect(logContent).toContain('root message');
  });
});
