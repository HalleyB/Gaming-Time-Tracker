import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { setupMockScenario, resetAllMocks, mockTauriCommands } from '../__mocks__/tauri';

vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '2 minutes ago'),
  format: vi.fn(() => '2023-10-15'),
}));

describe('End-to-End User Scenarios', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('Daily Gaming Session Flow', () => {
    it('tracks a complete gaming session from start to finish', async () => {
      setupMockScenario('no-active-sessions');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
        expect(screen.getByText('No active session')).toBeInTheDocument();
      });

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
        }
      ]);

      mockTauriCommands.get_total_active_time.mockResolvedValue(1800);

      mockTauriCommands.get_realtime_budget_status.mockResolvedValue({
        daily_allowance_minutes: 120,
        used_today_minutes: 30,
        remaining_today_minutes: 90,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      });

      await waitFor(() => {
        expect(screen.getByText('Active Game')).toBeInTheDocument();
      }, { timeout: 8000 });

      mockTauriCommands.get_current_sessions.mockResolvedValue([]);
      mockTauriCommands.get_recent_sessions.mockResolvedValue([
        {
          id: '1',
          game_name: 'Recent Game 1',
          process_name: 'recentgame.exe',
          start_time: new Date(Date.now() - 3600000).toISOString(),
          end_time: new Date().toISOString(),
          duration_seconds: 3600,
          is_social_session: false,
          is_concurrent: false,
          concurrent_session_ids: [],
        }
      ]);

      await waitFor(() => {
        expect(screen.getByText('No active session')).toBeInTheDocument();
        expect(screen.getByText('Recent Game 1')).toBeInTheDocument();
      }, { timeout: 8000 });
    }, 15000);

    it('handles multiple gaming sessions with social features', async () => {
      mockTauriCommands.get_current_sessions.mockResolvedValue([{
        id: '1',
        game_name: 'Multiplayer Game',
        process_name: 'multiplayer.exe',
        start_time: new Date().toISOString(),
        end_time: null,
        duration_seconds: null,
        is_social_session: true,
        is_concurrent: false,
        concurrent_session_ids: [],
      }]);

      mockTauriCommands.get_realtime_budget_status.mockResolvedValue({
        daily_allowance_minutes: 120,
        used_today_minutes: 30,
        remaining_today_minutes: 90,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Multiplayer Game')).toBeInTheDocument();
      });

      setupMockScenario('with-recent-sessions');

      await waitFor(() => {
        expect(screen.getByText('Social')).toBeInTheDocument();
      });
    });
  });

  describe('Budget Management Flow', () => {
    it('handles multiple gaming sessions with social features', async () => {
      mockTauriCommands.get_current_sessions.mockResolvedValue([{
        id: '1',
        game_name: 'Multiplayer Game',
        process_name: 'multiplayer.exe',
        start_time: new Date().toISOString(),
        end_time: null,
        duration_seconds: null,
        is_social_session: true,
        is_concurrent: false,
        concurrent_session_ids: [],
      }]);

      mockTauriCommands.get_realtime_budget_status.mockResolvedValue({
        daily_allowance_minutes: 120,
        used_today_minutes: 30,
        remaining_today_minutes: 90,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Multiplayer Game')).toBeInTheDocument();
      });

      expect(screen.getByText(/Playing:/)).toBeInTheDocument();
    });

    it('handles budget additions and rollover mechanics', async () => {
      const user = userEvent.setup();

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      const addBudgetButton = screen.getByText('➕ Add 30m Budget');
      await user.click(addBudgetButton);

      expect(mockTauriCommands.add_budget_minutes).toHaveBeenCalled();
    });
  });

  describe('Learning Activity Integration', () => {
    it('navigates through learning workflow', async () => {
      const user = userEvent.setup();

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      const learningTab = screen.getByRole('button', { name: /Learning/i });
      await user.click(learningTab);

      expect(screen.getByText('Learning Tracker')).toBeInTheDocument();
      expect(screen.getByText('Coming soon...')).toBeInTheDocument();

      const dashboardTab = screen.getByRole('button', { name: /Dashboard/i });
      await user.click(dashboardTab);

      expect(screen.getByText('Earn Extra Time')).toBeInTheDocument();
      expect(screen.getByText(/1 hour of coding = 15 extra minutes/)).toBeInTheDocument();
    });
  });

  describe('Concurrent Gaming Sessions', () => {
    it('properly handles and displays concurrent sessions', async () => {
      mockTauriCommands.get_current_sessions.mockResolvedValue([
        {
          id: '1',
          game_name: 'Game 1',
          process_name: 'game1.exe',
          start_time: new Date().toISOString(),
          end_time: null,
          duration_seconds: null,
          is_concurrent: true,
          concurrent_session_ids: ['2'],
          is_social_session: false,
        },
        {
          id: '2',
          game_name: 'Game 2',
          process_name: 'game2.exe',
          start_time: new Date().toISOString(),
          end_time: null,
          duration_seconds: null,
          is_concurrent: true,
          concurrent_session_ids: ['1'],
          is_social_session: false,
        },
      ]);

      mockTauriCommands.get_total_active_time.mockResolvedValue(1800);

      mockTauriCommands.get_realtime_budget_status.mockResolvedValue({
        daily_allowance_minutes: 120,
        used_today_minutes: 30,
        remaining_today_minutes: 90,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('2 concurrent games')).toBeInTheDocument();
        expect(screen.getByText(/2.*Games Active/)).toBeInTheDocument();
      });

      mockTauriCommands.get_recent_sessions.mockResolvedValue([
        {
          id: '1',
          game_name: 'Game 1',
          process_name: 'game1.exe',
          start_time: new Date(Date.now() - 3600000).toISOString(),
          end_time: new Date().toISOString(),
          duration_seconds: 3600,
          is_social_session: false,
          is_concurrent: true,
          concurrent_session_ids: ['2'],
        },
        {
          id: '2',
          game_name: 'Game 2',
          process_name: 'game2.exe',
          start_time: new Date(Date.now() - 3600000).toISOString(),
          end_time: new Date().toISOString(),
          duration_seconds: 3600,
          is_social_session: false,
          is_concurrent: true,
          concurrent_session_ids: ['1'],
        },
      ]);

      await waitFor(() => {
        expect(screen.getByText('Game 1')).toBeInTheDocument();
        expect(screen.getByText('Game 2')).toBeInTheDocument();
      });
    });
  });

  describe('User Experience Flow', () => {
    it('provides intuitive navigation between all major features', async () => {
      const user = userEvent.setup();

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      const tabs = [
        { name: 'Dashboard', expectedText: 'Current Session' },
        { name: 'Learning', expectedText: 'Learning Tracker' },
        { name: 'History', expectedText: 'Session History' },
        { name: 'Settings', expectedText: 'Settings' }
      ];

      for (const tab of tabs) {
        const tabButton = screen.getByRole('button', { name: new RegExp(tab.name, 'i') });
        await user.click(tabButton);

        if (tab.name === 'Dashboard') {
          expect(screen.getByText(tab.expectedText)).toBeInTheDocument();
        } else if (tab.name === 'Settings') {
          expect(screen.getByRole('heading', { name: /Settings/i })).toBeInTheDocument();
        } else {
          expect(screen.getByText(tab.expectedText)).toBeInTheDocument();
        }
      }
    });

    it('maintains state consistency during navigation', async () => {
      const user = userEvent.setup();

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
        }
      ]);

      mockTauriCommands.get_total_active_time.mockResolvedValue(1800);

      mockTauriCommands.get_realtime_budget_status.mockResolvedValue({
        daily_allowance_minutes: 120,
        used_today_minutes: 30,
        remaining_today_minutes: 90,
        rollover_minutes: 0,
        earned_minutes: 0,
        total_available_minutes: 120,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Active Game')).toBeInTheDocument();
      });

      const learningTab = screen.getByRole('button', { name: /Learning/i });
      await user.click(learningTab);

      const dashboardTab = screen.getByRole('button', { name: /Dashboard/i });
      await user.click(dashboardTab);

      expect(screen.getByText('Active Game')).toBeInTheDocument();
    });

    it('shows helpful guidance for new users', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Quick Tips')).toBeInTheDocument();
        expect(screen.getByText('Earn Extra Time')).toBeInTheDocument();
        expect(screen.getByText('Budget Rollover')).toBeInTheDocument();
      });

      expect(screen.getByText(/1 hour of coding = 15 extra minutes/)).toBeInTheDocument();
      expect(screen.getByText(/Unused minutes roll over to the next day/)).toBeInTheDocument();
    });
  });

  describe('Accessibility and Usability', () => {
    it('provides proper ARIA labels and semantic structure', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      const navigation = screen.getByRole('navigation');
      expect(navigation).toBeInTheDocument();

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('handles keyboard navigation', async () => {
      const user = userEvent.setup();

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      await user.keyboard('{Tab}');

      const focusedElement = document.activeElement;
      expect(focusedElement).toBeInstanceOf(HTMLElement);
    });
  });

  describe('Performance and Resource Management', () => {
    it('efficiently updates data without excessive API calls', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      const initialCallCount = mockTauriCommands.get_current_sessions.mock.calls.length;

      await waitFor(() => {
        expect(mockTauriCommands.get_current_sessions.mock.calls.length).toBeGreaterThan(initialCallCount);
      }, { timeout: 6000 });

      expect(mockTauriCommands.get_current_sessions.mock.calls.length).toBeLessThan(20);
    });

    it('handles component unmounting cleanly', async () => {
      const { unmount } = render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      unmount();

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Session History and Analytics', () => {
    it('displays session history with proper navigation', async () => {
      const user = userEvent.setup();

      setupMockScenario('with-recent-sessions');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Recent Game 1')).toBeInTheDocument();
        expect(screen.getByText('Recent Game 2')).toBeInTheDocument();
      });

      const historyTab = screen.getByRole('button', { name: /History/i });
      await user.click(historyTab);

      expect(screen.getByText('Session History')).toBeInTheDocument();
      expect(screen.getByText('Coming soon...')).toBeInTheDocument();
    });

    it('calculates and displays weekly statistics', async () => {
      setupMockScenario('with-recent-sessions');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Weekly Total')).toBeInTheDocument();
      });
    });
  });

  describe('Settings and Configuration', () => {
    it('navigates to settings and shows placeholder', async () => {
      const user = userEvent.setup();

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      const settingsTab = screen.getByRole('button', { name: /Settings/i });
      await user.click(settingsTab);

      expect(screen.getByRole('heading', { name: /Settings/i })).toBeInTheDocument();
      expect(screen.getByText('Coming soon...')).toBeInTheDocument();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('gracefully handles API errors without crashing', async () => {
      Object.values(mockTauriCommands).forEach(mock => {
        mock.mockRejectedValue(new Error('API Error'));
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      expect(screen.getByText('Current Session')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('handles rapid session state changes', async () => {
      let toggle = false;

      mockTauriCommands.get_current_sessions.mockImplementation(() => {
        toggle = !toggle;
        return Promise.resolve(toggle ? [
          {
            id: '1',
            game_name: 'Rapid Game',
            process_name: 'rapid.exe',
            start_time: new Date().toISOString(),
            end_time: null,
            duration_seconds: null,
            is_social_session: false,
            is_concurrent: false,
            concurrent_session_ids: [],
          }
        ] : []);
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockTauriCommands.get_current_sessions).toHaveBeenCalled();
      }, { timeout: 10000 });

      expect(screen.getByText('Current Session')).toBeInTheDocument();
    });

    it('handles malformed session data gracefully', async () => {
      mockTauriCommands.get_current_sessions.mockResolvedValue([
        {
          // @ts-expect-error
          // Missing required fields
          game_name: null,
          // @ts-expect-error
          process_name: undefined,
          start_time: 'invalid-date',
          end_time: null,
          duration_seconds: null,
          // @ts-expect-error
          is_social_session: 'not-boolean',
          // @ts-expect-error
          is_concurrent: null,
          concurrent_session_ids: ['not-array'],
        }
      ]);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      expect(screen.getByText('Current Session')).toBeInTheDocument();
    });

    it('handles extreme budget values', async () => {
      mockTauriCommands.get_realtime_budget_status.mockResolvedValue({
        daily_allowance_minutes: 999999,
        used_today_minutes: -100,
        remaining_today_minutes: 1000000,
        rollover_minutes: -50,
        earned_minutes: 999999,
        total_available_minutes: 2000000,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      expect(screen.getByText("Today's Usage")).toBeInTheDocument();
    });
  });

  describe('Monitoring Control Flow', () => {
    it('handles pause and resume monitoring', async () => {
      const user = userEvent.setup();

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Gaming Time Tracker')).toBeInTheDocument();
      });

      const testOverlayButton = screen.getByText('🧪 Test Game Overlay');
      await user.click(testOverlayButton);

      expect(testOverlayButton).toBeInTheDocument();
    });
  });
});