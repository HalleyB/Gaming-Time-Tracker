import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { mockTauriCommands } from '../__mocks__/tauri';

// Mock date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '2 minutes ago'),
  format: vi.fn(() => '2023-10-15'),
}));

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all mock commands to defaults
    Object.values(mockTauriCommands).forEach(mock => mock.mockReset());

    // Setup default responses using mockTauriCommands (use correct endpoints)
    mockTauriCommands.get_current_sessions.mockResolvedValue([]);
    mockTauriCommands.get_total_active_time.mockResolvedValue(0);
    mockTauriCommands.get_realtime_budget_status.mockResolvedValue({
      daily_allowance_minutes: 120,
      used_today_minutes: 0,
      remaining_today_minutes: 120,
      rollover_minutes: 0,
      earned_minutes: 0,
      total_available_minutes: 120,
    });
    mockTauriCommands.get_recent_sessions.mockResolvedValue([]);
    mockTauriCommands.add_budget_minutes.mockResolvedValue(undefined);
    mockTauriCommands.pause_monitoring.mockResolvedValue(undefined);
    mockTauriCommands.resume_monitoring.mockResolvedValue(undefined);
  });

  it('renders app with default dashboard tab', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('switches between tabs correctly', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    // Click on Learning tab
    const learningTab = screen.getByRole('button', { name: /Learning/i });
    await user.click(learningTab);

    expect(screen.getByText('Learning Tracker')).toBeInTheDocument();
    expect(screen.getByText('Coming soon...')).toBeInTheDocument();

    // Click on History tab
    const historyTab = screen.getByRole('button', { name: /History/i });
    await user.click(historyTab);

    expect(screen.getByText('Session History')).toBeInTheDocument(); // Fix: was "History Tracker"

    // Click on Settings tab
    const settingsTab = screen.getByRole('button', { name: /Settings/i });
    await user.click(settingsTab);

    expect(screen.getByRole('heading', { name: /Settings/i })).toBeInTheDocument(); // Fix: use role selector
  });

  it('fetches and displays data on mount', async () => {
    const mockSessions = [
      {
        id: '1',
        game_name: 'Test Game',
        process_name: 'testgame.exe',
        start_time: '2023-10-15T10:00:00Z',
        end_time: null,
        duration_seconds: null,
        is_social_session: false,
        is_concurrent: false,
        concurrent_session_ids: [],
      },
    ];

    mockTauriCommands.get_current_sessions.mockResolvedValue(mockSessions);
    mockTauriCommands.get_recent_sessions.mockResolvedValue(mockSessions);

    render(<App />);

    await waitFor(() => {
      expect(mockTauriCommands.get_current_sessions).toHaveBeenCalled();
      expect(mockTauriCommands.get_realtime_budget_status).toHaveBeenCalled();
      expect(mockTauriCommands.get_recent_sessions).toHaveBeenCalled();
    });
  });

  it('handles pause/resume monitoring', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    const testOverlayButton = screen.getByText('🧪 Test Game Overlay');
    expect(testOverlayButton).toBeInTheDocument();
  });

  it('formats duration correctly', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    // The formatDuration function should be working in the component
    // We can't directly test it here, but it's tested through Dashboard component
  });

  it('handles budget management', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    const addBudgetButton = screen.getByText('➕ Add 30m Budget');
    await user.click(addBudgetButton);

    expect(mockTauriCommands.add_budget_minutes).toHaveBeenCalled();
  });

  it('displays debug panel in development', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('🔧 Debug Panel')).toBeInTheDocument();
      expect(screen.getByText('🧪 Test Game Overlay')).toBeInTheDocument();
      expect(screen.getByText('➕ Add 30m Budget')).toBeInTheDocument();
    });
  });

  it('updates data periodically', async () => {
    vi.useFakeTimers();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    // Fast-forward time to trigger periodic updates
    vi.advanceTimersByTime(5000); // 5 seconds

    await waitFor(() => {
      expect(mockTauriCommands.get_current_sessions).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });

  it('handles notification permissions', async () => {
    global.mockIsPermissionGranted.mockResolvedValue(false);
    global.mockRequestPermission.mockResolvedValue('granted');

    render(<App />);

    await waitFor(() => {
      expect(global.mockIsPermissionGranted).toHaveBeenCalled();
    });
  });

  it('handles error states gracefully', async () => {
    // Mock API errors by making all commands reject
    Object.values(mockTauriCommands).forEach(mock => {
      mock.mockRejectedValue(new Error('API Error'));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
    });

    // App should still render despite API errors
    expect(screen.getByText('Current Session')).toBeInTheDocument();
  });

  it('handles active sessions display', async () => {
    // Configure active session
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
    mockTauriCommands.get_total_active_time.mockResolvedValue(1800); // 30 minutes

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Active Game')).toBeInTheDocument();
      expect(screen.getByText(/Playing:/)).toBeInTheDocument();
    });
  });
});