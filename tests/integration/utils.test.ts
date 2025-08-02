import { describe, it, expect } from 'vitest';

describe('Utility Functions', () => {
  describe('formatDuration', () => {
    const formatDuration = (seconds: number): string => {
      if (seconds < 60) {
        return `${seconds}s`;
      }

      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;

      if (minutes < 60) {
        return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
      }

      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;

      if (remainingMinutes > 0) {
        return `${hours}h ${remainingMinutes}m`;
      }
      return `${hours}h`;
    };

    it('formats seconds correctly', () => {
      expect(formatDuration(30)).toBe('30s');
      expect(formatDuration(59)).toBe('59s');
    });

    it('formats minutes correctly', () => {
      expect(formatDuration(60)).toBe('1m');
      expect(formatDuration(90)).toBe('1m 30s');
      expect(formatDuration(120)).toBe('2m');
      expect(formatDuration(3599)).toBe('59m 59s');
    });

    it('formats hours correctly', () => {
      expect(formatDuration(3600)).toBe('1h');
      expect(formatDuration(3660)).toBe('1h 1m');
      expect(formatDuration(7200)).toBe('2h');
      expect(formatDuration(7320)).toBe('2h 2m');
    });

    it('handles zero duration', () => {
      expect(formatDuration(0)).toBe('0s');
    });
  });

  describe('calculateTotalActiveTime', () => {
    interface GameSession {
      id?: string;
      game_name: string;
      process_name: string;
      start_time: string;
      end_time?: string;
      duration_seconds?: number;
      is_social_session: boolean;
      is_concurrent: boolean;
      concurrent_session_ids: string[];
    }

    const calculateTotalActiveTime = (sessions: GameSession[]): number => {
      if (sessions.length === 0) return 0;

      const periods = sessions
        .filter(session => session.end_time && session.duration_seconds)
        .map(session => ({
          start: new Date(session.start_time),
          end: new Date(session.end_time ?? ''),
          duration: session.duration_seconds,
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      let totalSeconds = 0;
      let currentEnd: Date | null = null;

      for (const period of periods) {
        if (!currentEnd) {
          if (typeof period.duration === 'number') {
            totalSeconds += period.duration;
          }
          currentEnd = period.end;
        } else if (period.start >= currentEnd) {
          if (typeof period.duration === 'number') {
            totalSeconds += period.duration;
          }
          currentEnd = period.end;
        } else if (period.end > currentEnd) {
          totalSeconds += (period.end.getTime() - currentEnd.getTime()) / 1000;
          currentEnd = period.end;
        }
      }

      return Math.floor(totalSeconds);
    };

    it('calculates total time for non-overlapping sessions', () => {
      const sessions: GameSession[] = [
        {
          game_name: 'Game 1',
          process_name: 'game1.exe',
          start_time: '2023-10-15T10:00:00Z',
          end_time: '2023-10-15T11:00:00Z',
          duration_seconds: 3600,
          is_social_session: false,
          is_concurrent: false,
          concurrent_session_ids: [],
        },
        {
          game_name: 'Game 2',
          process_name: 'game2.exe',
          start_time: '2023-10-15T12:00:00Z',
          end_time: '2023-10-15T13:00:00Z',
          duration_seconds: 3600,
          is_social_session: false,
          is_concurrent: false,
          concurrent_session_ids: [],
        },
      ];

      expect(calculateTotalActiveTime(sessions)).toBe(7200);
    });

    it('handles overlapping sessions correctly', () => {
      const sessions: GameSession[] = [
        {
          game_name: 'Game 1',
          process_name: 'game1.exe',
          start_time: '2023-10-15T10:00:00Z',
          end_time: '2023-10-15T11:00:00Z',
          duration_seconds: 3600,
          is_social_session: false,
          is_concurrent: false,
          concurrent_session_ids: [],
        },
        {
          game_name: 'Game 2',
          process_name: 'game2.exe',
          start_time: '2023-10-15T10:30:00Z',
          end_time: '2023-10-15T11:30:00Z',
          duration_seconds: 3600,
          is_social_session: false,
          is_concurrent: true,
          concurrent_session_ids: ['1'],
        },
      ];

      expect(calculateTotalActiveTime(sessions)).toBe(5400);
    });

    it('returns 0 for empty sessions', () => {
      expect(calculateTotalActiveTime([])).toBe(0);
    });

    it('ignores sessions without end_time', () => {
      const sessions: GameSession[] = [
        {
          game_name: 'Active Game',
          process_name: 'active.exe',
          start_time: '2023-10-15T10:00:00Z',
          is_social_session: false,
          is_concurrent: false,
          concurrent_session_ids: [],
        },
      ];

      expect(calculateTotalActiveTime(sessions)).toBe(0);
    });
  });

  describe('budgetCalculations', () => {
    interface BudgetStatus {
      daily_allowance_minutes: number;
      used_today_minutes: number;
      remaining_today_minutes: number;
      rollover_minutes: number;
      earned_minutes: number;
      total_available_minutes: number;
    }

    const calculateBudgetPercentage = (budget: BudgetStatus): number => {
      if (budget.total_available_minutes === 0) return 0;
      return Math.round((budget.used_today_minutes / budget.total_available_minutes) * 100);
    };

    const getBudgetStatus = (budget: BudgetStatus): 'safe' | 'warning' | 'critical' | 'exceeded' => {
      const percentage = calculateBudgetPercentage(budget);

      if (percentage >= 100) return 'exceeded';
      if (percentage >= 90) return 'critical';
      if (percentage >= 75) return 'warning';
      return 'safe';
    };

    it('calculates budget percentage correctly', () => {
      const budget: BudgetStatus = {
        daily_allowance_minutes: 120,
        used_today_minutes: 60,
        remaining_today_minutes: 60,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      };

      expect(calculateBudgetPercentage(budget)).toBe(50);
    });

    it('handles zero total available minutes', () => {
      const budget: BudgetStatus = {
        daily_allowance_minutes: 0,
        used_today_minutes: 0,
        remaining_today_minutes: 0,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 0,
      };

      expect(calculateBudgetPercentage(budget)).toBe(0);
    });

    it('determines budget status correctly', () => {
      const safeBudget: BudgetStatus = {
        daily_allowance_minutes: 120,
        used_today_minutes: 60,
        remaining_today_minutes: 60,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      };

      const warningBudget: BudgetStatus = {
        daily_allowance_minutes: 120,
        used_today_minutes: 90,
        remaining_today_minutes: 30,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      };

      const criticalBudget: BudgetStatus = {
        daily_allowance_minutes: 120,
        used_today_minutes: 110,
        remaining_today_minutes: 10,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      };

      const exceededBudget: BudgetStatus = {
        daily_allowance_minutes: 120,
        used_today_minutes: 130,
        remaining_today_minutes: -10,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      };

      expect(getBudgetStatus(safeBudget)).toBe('safe');
      expect(getBudgetStatus(warningBudget)).toBe('warning');
      expect(getBudgetStatus(criticalBudget)).toBe('critical');
      expect(getBudgetStatus(exceededBudget)).toBe('exceeded');
    });
  });

  describe('learningActivityCalculations', () => {
    const calculateEarnedMinutes = (activityType: string, durationMinutes: number): number => {
      switch (activityType.toLowerCase()) {
        case 'coding':
          return Math.floor(durationMinutes / 4);
        case 'reading':
          return Math.floor(durationMinutes / 6);
        case 'course':
          return Math.floor(durationMinutes / 4);
        case 'exercise':
          return Math.floor(durationMinutes / 3);
        default:
          return Math.floor(durationMinutes / 5);
      }
    };

    it('calculates earned minutes for different activity types', () => {
      expect(calculateEarnedMinutes('coding', 60)).toBe(15);
      expect(calculateEarnedMinutes('reading', 60)).toBe(10);
      expect(calculateEarnedMinutes('course', 60)).toBe(15);
      expect(calculateEarnedMinutes('exercise', 60)).toBe(20);
      expect(calculateEarnedMinutes('other', 60)).toBe(12);
    });

    it('handles partial minutes correctly', () => {
      expect(calculateEarnedMinutes('coding', 30)).toBe(7);
      expect(calculateEarnedMinutes('reading', 45)).toBe(7);
    });

    it('handles zero duration', () => {
      expect(calculateEarnedMinutes('coding', 0)).toBe(0);
      expect(calculateEarnedMinutes('reading', 0)).toBe(0);
    });
  });
});