const { secureDelete, cleanStaleStateFile } = require('../../src/utils/stateFile');

describe('stateFile module', () => {
  let mockFs;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  describe('secureDelete()', () => {
    test('overwrites file with zeros and deletes it', () => {
      mockFs = {
        existsSync: jest.fn().mockReturnValue(true),
        statSync: jest.fn().mockReturnValue({ size: 256 }),
        writeFileSync: jest.fn(),
        unlinkSync: jest.fn(),
      };

      const result = secureDelete('/tmp/bws_state.json', {
        logger: mockLogger,
        fsModule: mockFs,
      });

      expect(result).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/bws_state.json',
        expect.any(Buffer),
      );
      // Verify the buffer is all zeros
      const writtenBuffer = mockFs.writeFileSync.mock.calls[0][1];
      expect(writtenBuffer.length).toBe(256);
      expect(writtenBuffer.every((byte) => byte === 0)).toBe(true);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/tmp/bws_state.json');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('returns false when file does not exist', () => {
      mockFs = {
        existsSync: jest.fn().mockReturnValue(false),
      };

      const result = secureDelete('/tmp/bws_state.json', {
        logger: mockLogger,
        fsModule: mockFs,
      });

      expect(result).toBe(false);
    });

    test('returns false and logs error on fs failure', () => {
      mockFs = {
        existsSync: jest.fn().mockReturnValue(true),
        statSync: jest.fn().mockImplementation(() => {
          throw new Error('permission denied');
        }),
      };

      const result = secureDelete('/tmp/bws_state.json', {
        logger: mockLogger,
        fsModule: mockFs,
      });

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('cleanStaleStateFile()', () => {
    test('cleans stale file when it exists', () => {
      mockFs = {
        existsSync: jest.fn().mockReturnValue(true),
        statSync: jest.fn().mockReturnValue({ size: 128 }),
        writeFileSync: jest.fn(),
        unlinkSync: jest.fn(),
      };

      const result = cleanStaleStateFile('/tmp/bws_state.json', {
        logger: mockLogger,
        fsModule: mockFs,
      });

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    test('returns false when no stale file exists', () => {
      mockFs = {
        existsSync: jest.fn().mockReturnValue(false),
      };

      const result = cleanStaleStateFile('/tmp/bws_state.json', {
        logger: mockLogger,
        fsModule: mockFs,
      });

      expect(result).toBe(false);
    });
  });
});
