import { describe, it, expect } from 'vitest';

describe('Utility Functions', () => {
  describe('Date formatting utilities', () => {
    it('should format dates correctly', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = date.toISOString();

      expect(formatted).toContain('2024-01-15');
    });
  });

  describe('File size formatting', () => {
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });
  });

  describe('Duration formatting', () => {
    const formatDuration = (seconds: number): string => {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    it('should format seconds correctly', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(30)).toBe('0:30');
      expect(formatDuration(60)).toBe('1:00');
      expect(formatDuration(90)).toBe('1:30');
      expect(formatDuration(3661)).toBe('1:01:01');
    });
  });

  describe('URL validation', () => {
    const isValidUrl = (url: string): boolean => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };

    it('should validate URLs correctly', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('Computer status determination', () => {
    const getComputerStatus = (lastSeen: Date | null): 'online' | 'offline' | 'idle' => {
      if (!lastSeen) return 'offline';
      const now = Date.now();
      const diff = now - lastSeen.getTime();
      const MINUTE = 60 * 1000;

      if (diff < 2 * MINUTE) return 'online';
      if (diff < 10 * MINUTE) return 'idle';
      return 'offline';
    };

    it('should return online for recent activity', () => {
      const lastSeen = new Date(Date.now() - 30 * 1000);
      expect(getComputerStatus(lastSeen)).toBe('online');
    });

    it('should return idle for recent-ish activity', () => {
      const lastSeen = new Date(Date.now() - 5 * 60 * 1000);
      expect(getComputerStatus(lastSeen)).toBe('idle');
    });

    it('should return offline for old activity', () => {
      const lastSeen = new Date(Date.now() - 15 * 60 * 1000);
      expect(getComputerStatus(lastSeen)).toBe('offline');
    });

    it('should return offline for null', () => {
      expect(getComputerStatus(null)).toBe('offline');
    });
  });

  describe('Email validation', () => {
    const isValidEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    it('should validate email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('Search filtering', () => {
    interface Item {
      name: string;
      description?: string;
    }

    const filterItems = (items: Item[], query: string): Item[] => {
      const lowerQuery = query.toLowerCase();
      return items.filter(
        (item) =>
          item.name.toLowerCase().includes(lowerQuery) ||
          item.description?.toLowerCase().includes(lowerQuery)
      );
    };

    it('should filter by name', () => {
      const items = [
        { name: 'Apple', description: 'A fruit' },
        { name: 'Banana', description: 'Yellow fruit' },
        { name: 'Carrot', description: 'A vegetable' },
      ];

      expect(filterItems(items, 'app')).toHaveLength(1);
      expect(filterItems(items, 'fruit')).toHaveLength(2);
      expect(filterItems(items, '')).toHaveLength(3);
      expect(filterItems(items, 'xyz')).toHaveLength(0);
    });

    it('should be case insensitive', () => {
      const items = [{ name: 'Apple' }];

      expect(filterItems(items, 'APPLE')).toHaveLength(1);
      expect(filterItems(items, 'apple')).toHaveLength(1);
    });
  });

  describe('Pagination', () => {
    const paginate = <T>(items: T[], page: number, limit: number) => {
      const offset = (page - 1) * limit;
      const paginatedItems = items.slice(offset, offset + limit);
      return {
        items: paginatedItems,
        total: items.length,
        page,
        limit,
        totalPages: Math.ceil(items.length / limit),
        hasMore: offset + limit < items.length,
      };
    };

    it('should paginate correctly', () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1);

      const page1 = paginate(items, 1, 10);
      expect(page1.items).toHaveLength(10);
      expect(page1.items[0]).toBe(1);
      expect(page1.hasMore).toBe(true);
      expect(page1.totalPages).toBe(3);

      const page2 = paginate(items, 2, 10);
      expect(page2.items).toHaveLength(10);
      expect(page2.items[0]).toBe(11);
      expect(page2.hasMore).toBe(true);

      const page3 = paginate(items, 3, 10);
      expect(page3.items).toHaveLength(5);
      expect(page3.items[0]).toBe(21);
      expect(page3.hasMore).toBe(false);
    });

    it('should handle empty arrays', () => {
      const result = paginate([], 1, 10);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Rate limiting helper', () => {
    const createRateLimiter = (maxRequests: number, windowMs: number) => {
      const requests: number[] = [];

      return {
        check: (): { allowed: boolean; remaining: number } => {
          const now = Date.now();
          const windowStart = now - windowMs;

          // Remove old requests
          while (requests.length > 0 && requests[0] < windowStart) {
            requests.shift();
          }

          if (requests.length < maxRequests) {
            requests.push(now);
            return { allowed: true, remaining: maxRequests - requests.length };
          }

          return { allowed: false, remaining: 0 };
        },
        reset: () => {
          requests.length = 0;
        },
      };
    };

    it('should allow requests within limit', () => {
      const limiter = createRateLimiter(5, 1000);

      for (let i = 0; i < 5; i++) {
        const result = limiter.check();
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests over limit', () => {
      const limiter = createRateLimiter(3, 1000);

      limiter.check();
      limiter.check();
      limiter.check();

      const result = limiter.check();
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });
});

describe('Data Validation', () => {
  describe('Block rule validation', () => {
    const validateBlockRule = (rule: {
      type: string;
      pattern: string;
    }): { valid: boolean; error?: string } => {
      if (!['WEBSITE', 'APPLICATION'].includes(rule.type)) {
        return { valid: false, error: 'Invalid rule type' };
      }
      if (!rule.pattern || rule.pattern.trim().length === 0) {
        return { valid: false, error: 'Pattern is required' };
      }
      if (rule.type === 'WEBSITE') {
        // Basic URL pattern validation
        if (!rule.pattern.includes('.') && !rule.pattern.includes('*')) {
          return { valid: false, error: 'Invalid website pattern' };
        }
      }
      return { valid: true };
    };

    it('should validate website rules', () => {
      expect(validateBlockRule({ type: 'WEBSITE', pattern: '*.facebook.com' })).toEqual({ valid: true });
      expect(validateBlockRule({ type: 'WEBSITE', pattern: 'twitter.com' })).toEqual({ valid: true });
      expect(validateBlockRule({ type: 'WEBSITE', pattern: 'invalid' })).toEqual({ valid: false, error: 'Invalid website pattern' });
    });

    it('should validate application rules', () => {
      expect(validateBlockRule({ type: 'APPLICATION', pattern: 'chrome.exe' })).toEqual({ valid: true });
      expect(validateBlockRule({ type: 'APPLICATION', pattern: '' })).toEqual({ valid: false, error: 'Pattern is required' });
    });

    it('should reject invalid types', () => {
      expect(validateBlockRule({ type: 'INVALID', pattern: 'test' })).toEqual({ valid: false, error: 'Invalid rule type' });
    });
  });

  describe('Alert severity validation', () => {
    type Severity = 'low' | 'medium' | 'high' | 'critical';

    const getSeverityWeight = (severity: Severity): number => {
      const weights: Record<Severity, number> = {
        low: 1,
        medium: 2,
        high: 3,
        critical: 4,
      };
      return weights[severity];
    };

    const sortBySeverity = (severities: Severity[]): Severity[] => {
      return [...severities].sort((a, b) => getSeverityWeight(b) - getSeverityWeight(a));
    };

    it('should sort by severity correctly', () => {
      const severities: Severity[] = ['low', 'critical', 'medium', 'high'];
      const sorted = sortBySeverity(severities);

      expect(sorted).toEqual(['critical', 'high', 'medium', 'low']);
    });
  });
});
