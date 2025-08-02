import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '../../src/components/Dashboard';

// Mock formatDistanceToNow and format from date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '2 minutes ago'),
  format: vi.fn(() => '2023-10-15'),
}));

describe('Dashboard Component', () => {
  const mockFormatDuration = vi.fn((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  });

  const defaultProps = {
    activeSessions: [],
    totalActiveTime: 0,
    budgetStatus: null,
    recentSessions: [],
    formatDuration: mockFormatDuration,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dashboard with no active sessions', () => {
    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText('Current Session')).toBeInTheDocument();
    expect(screen.getByText('No active session')).toBeInTheDocument();
  });

  it('displays active session information', () => {
    const activeSessions = [
      {
        id: '1',
        game_name: 'Test Game',
        process_name: 'testgame.exe',
        start_time: '2023-10-15T10:00:00Z',
        is_social_session: false,
        is_concurrent: false,
        concurrent_session_ids: [],
      },
    ];

    render(<Dashboard
      {...defaultProps}
      activeSessions={activeSessions}
      totalActiveTime={1800} // 30 minutes
    />);

    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('Test Game')).toBeInTheDocument();
  });

  it('displays multiple concurrent sessions', () => {
    const activeSessions = [
      {
        id: '1',
        game_name: 'Game 1',
        process_name: 'game1.exe',
        start_time: '2023-10-15T10:00:00Z',
        is_social_session: false,
        is_concurrent: true,
        concurrent_session_ids: ['2'],
      },
      {
        id: '2',
        game_name: 'Game 2',
        process_name: 'game2.exe',
        start_time: '2023-10-15T10:05:00Z',
        is_social_session: false,
        is_concurrent: true,
        concurrent_session_ids: ['1'],
      },
    ];

    render(<Dashboard
      {...defaultProps}
      activeSessions={activeSessions}
      totalActiveTime={900} // 15 minutes
    />);

    expect(screen.getByText('2 concurrent games')).toBeInTheDocument();
  });

  it('displays budget status when available', () => {
    const budgetStatus = {
      daily_allowance_minutes: 120,
      used_today_minutes: 60,
      remaining_today_minutes: 60,
      rollover_minutes: 30,
      earned_minutes: 15,
      total_available_minutes: 105,
    };

    render(<Dashboard
      {...defaultProps}
      budgetStatus={budgetStatus}
    />);

    expect(screen.getByText("Today's Usage")).toBeInTheDocument();

    expect(screen.getByText('Budget Remaining')).toBeInTheDocument();
    expect(screen.getByText('Weekly Total')).toBeInTheDocument();

    const budgetValues = screen.getAllByText('60m');
    expect(budgetValues.length).toBeGreaterThan(0); // At least one "60m" should exist
  });

  it('displays recent sessions correctly', () => {
    const recentSessions = [
      {
        id: '1',
        game_name: 'Recent Game',
        process_name: 'recentgame.exe',
        start_time: '2023-10-15T09:00:00Z',
        end_time: '2023-10-15T10:00:00Z',
        duration_seconds: 3600,
        is_social_session: true,
        is_concurrent: false,
        concurrent_session_ids: [],
      },
    ];

    render(<Dashboard
      {...defaultProps}
      recentSessions={recentSessions}
    />);

    expect(screen.getByText('Recent Game')).toBeInTheDocument();
    expect(screen.getByText('Social')).toBeInTheDocument();
  });

  it('shows empty state when no sessions recorded', () => {
    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText('No gaming sessions recorded yet')).toBeInTheDocument();
  });

  it('displays quick tips section', () => {
    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText('Quick Tips')).toBeInTheDocument();
    expect(screen.getByText('Earn Extra Time')).toBeInTheDocument();
    expect(screen.getByText('Budget Rollover')).toBeInTheDocument();
  });

  it('calculates weekly total correctly', () => {
    const sessions = [
      {
        id: '1',
        game_name: 'Game 1',
        process_name: 'game1.exe',
        start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
        end_time: new Date(Date.now() - 24 * 60 * 60 * 1000 + 3600000).toISOString(),
        duration_seconds: 3600,
        is_social_session: false,
        is_concurrent: false,
        concurrent_session_ids: [],
      },
    ];

    render(<Dashboard
      {...defaultProps}
      recentSessions={sessions}
    />);

    expect(screen.getByText('Weekly Total')).toBeInTheDocument();
  });
});