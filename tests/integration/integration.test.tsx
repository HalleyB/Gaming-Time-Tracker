import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import App from '../../src/App';
import { mockTauriCommands } from '../__mocks__/tauri';

vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '2 minutes ago'),
  format: vi.fn(() => '2023-10-15'),
}));

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.values(mockTauriCommands).forEach(mock => mock.mockReset());

    const defaultBudgetStatus = {
      daily_allowance_minutes: 120,
      used_today_minutes: 30,
      remaining_today_minutes: 90,
      rollover_minutes: 15,
      earned_minutes: 10,
      total_available_minutes: 145,
    };

    mockTauriCommands.get_active_sessions.mockResolvedValue([]);
    mockTauriCommands.get_current_sessions.mockResolvedValue([]);
    mockTauriCommands.get_total_active_time.mockResolvedValue(0);
    mockTauriCommands.get_budget_status.mockResolvedValue(defaultBudgetStatus);
    mockTauriCommands.get_realtime_budget_status.mockResolvedValue(defaultBudgetStatus);
    mockTauriCommands.get_recent_sessions.mockResolvedValue([
      {
        id: '1',
        game_name: 'Test Game',
        process_name: 'testgame.exe',
        start_time: '2023-10-15T10:00:00Z',
        end_time: '2023-10-15T11:00:00Z',
        duration_seconds: 3600,
        is_social_session: false,
        is_concurrent: false,
        concurrent_session_ids: [],
      },
    ]);
    mockTauriCommands.add_budget_minutes.mockResolvedValue(undefined);
    mockTauriCommands.pause_monitoring.mockResolvedValue(undefined);
    mockTauriCommands.resume_monitoring.mockResolvedValue(undefined);
    mockTauriCommands.add_learning_activity.mockResolvedValue(undefined);
  });

  it('displays complete dashboard with real data flow', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('30m')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Test Game')).toBeInTheDocument();
    });

    expect(mockTauriCommands.get_current_sessions).toHaveBeenCalled();
    expect(mockTauriCommands.get_realtime_budget_status).toHaveBeenCalled();
    expect(mockTauriCommands.get_recent_sessions).toHaveBeenCalled();
  });

  it('handles gaming session lifecycle', async () => {
    mockTauriCommands.get_current_sessions.mockResolvedValue([
      {
        id: '1',
        game_name: 'Active Game',
        process_name: 'activegame.exe',
        start_time: new Date().toISOString(),
        end_time: null,
        duration_seconds: null,
        is_social_session: false,
        is_concurrent: false,
        concurrent_session_ids: [],
      },
    ]);
    mockTauriCommands.get_total_active_time.mockResolvedValue(1800);

    const budgetStatus = {
      daily_allowance_minutes: 120,
      used_today_minutes: 60,
      remaining_today_minutes: 60,
      rollover_minutes: 0,
      earned_minutes: 0,
      total_available_minutes: 120,
    };
    mockTauriCommands.get_realtime_budget_status.mockResolvedValue(budgetStatus);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Active Game')).toBeInTheDocument();
      expect(screen.getByText('30m')).toBeInTheDocument();
    });
  });

  it('handles budget warnings and notifications', async () => {
    const warningBudgetStatus = {
      daily_allowance_minutes: 120,
      used_today_minutes: 100,
      remaining_today_minutes: 20,
      rollover_minutes: 0,
      earned_minutes: 0,
      total_available_minutes: 120,
    };

    mockTauriCommands.get_realtime_budget_status.mockResolvedValue(warningBudgetStatus);
    mockTauriCommands.get_current_sessions.mockResolvedValue([]);
    mockTauriCommands.get_recent_sessions.mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('100m')).toBeInTheDocument();
    });

    expect(global.mockIsPermissionGranted).toHaveBeenCalled();
  });

  it('handles budget exceeded state', async () => {
    const exceededBudgetStatus = {
      daily_allowance_minutes: 120,
      used_today_minutes: 150,
      remaining_today_minutes: -30,
      rollover_minutes: 0,
      earned_minutes: 0,
      total_available_minutes: 120,
    };

    mockTauriCommands.get_realtime_budget_status.mockResolvedValue(exceededBudgetStatus);
    mockTauriCommands.get_current_sessions.mockResolvedValue([]);
    mockTauriCommands.get_recent_sessions.mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('150m')).toBeInTheDocument();
    });
  });

  it('handles concurrent gaming sessions', async () => {
    mockTauriCommands.get_current_sessions.mockResolvedValue([
      {
        id: '1',
        game_name: 'Game One',
        process_name: 'game1.exe',
        start_time: new Date().toISOString(),
        end_time: null,
        duration_seconds: null,
        is_social_session: false,
        is_concurrent: true,
        concurrent_session_ids: ['2'],
      },
      {
        id: '2',
        game_name: 'Game Two',
        process_name: 'game2.exe',
        start_time: new Date().toISOString(),
        end_time: null,
        duration_seconds: null,
        is_social_session: true,
        is_concurrent: true,
        concurrent_session_ids: ['1'],
      },
    ]);
    mockTauriCommands.get_total_active_time.mockResolvedValue(900);

    const budgetStatus = {
      daily_allowance_minutes: 120,
      used_today_minutes: 30,
      remaining_today_minutes: 90,
      rollover_minutes: 0,
      earned_minutes: 0,
      total_available_minutes: 120,
    };
    mockTauriCommands.get_realtime_budget_status.mockResolvedValue(budgetStatus);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('2 concurrent games')).toBeInTheDocument();
      expect(screen.getByText(/2.*Games Active/)).toBeInTheDocument();
      expect(screen.getByText(/Total:.*15m/)).toBeInTheDocument();
    });
  });

  it('handles learning activity integration', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    const learningTab = screen.getByRole('button', { name: /Learning/i });
    await user.click(learningTab);

    expect(screen.getByText('Learning Tracker')).toBeInTheDocument();
  });

  it('persists tab selection during data updates', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    const historyTab = screen.getByRole('button', { name: /History/i });
    await user.click(historyTab);

    expect(screen.getByText('Session History')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Session History')).toBeInTheDocument();
    }, { timeout: 6000 });
  });

  it('handles error states gracefully', async () => {
    Object.values(mockTauriCommands).forEach(mock => {
      mock.mockRejectedValue(new Error('API Error'));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    expect(screen.getByText('Current Session')).toBeInTheDocument();
  });

  it('handles rapid session changes', async () => {
    let sessionCount = 0;

    const sessionMockFn = () => {
      sessionCount++;
      if (sessionCount % 2 === 0) {
        return Promise.resolve([]);
      } else {
        return Promise.resolve([
          {
            id: `session_${sessionCount}`,
            game_name: `Game ${sessionCount}`,
            process_name: `game${sessionCount}.exe`,
            start_time: new Date().toISOString(),
            end_time: null,
            duration_seconds: null,
            is_social_session: false,
            is_concurrent: false,
            concurrent_session_ids: [],
          },
        ]);
      }
    };

    mockTauriCommands.get_current_sessions.mockImplementation(sessionMockFn);
    mockTauriCommands.get_active_sessions.mockImplementation(sessionMockFn);

    const budgetStatus = {
      daily_allowance_minutes: 120,
      used_today_minutes: 30,
      remaining_today_minutes: 90,
      rollover_minutes: 0,
      earned_minutes: 0,
      total_available_minutes: 120,
    };
    mockTauriCommands.get_realtime_budget_status.mockResolvedValue(budgetStatus);

    render(<App />);

    await waitFor(() => {
      expect(mockTauriCommands.get_current_sessions).toHaveBeenCalled();
    });

    expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
  });

  it('validates data consistency across components', async () => {
    const mockBudgetStatus = {
      daily_allowance_minutes: 120,
      used_today_minutes: 75,
      remaining_today_minutes: 45,
      rollover_minutes: 15,
      earned_minutes: 5,
      total_available_minutes: 140,
    };

    mockTauriCommands.get_budget_status.mockResolvedValue(mockBudgetStatus);
    mockTauriCommands.get_realtime_budget_status.mockResolvedValue(mockBudgetStatus);
    mockTauriCommands.get_current_sessions.mockResolvedValue([]);
    mockTauriCommands.get_recent_sessions.mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('75m')).toBeInTheDocument();
    });

    expect(screen.getByText("Today's Usage")).toBeInTheDocument();
  });
});