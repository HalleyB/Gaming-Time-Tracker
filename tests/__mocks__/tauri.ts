import { vi } from 'vitest';

// Mock Tauri commands with realistic responses

export const mockTauriCommands = {
  get_active_sessions: vi.fn<[], Promise<MockGameSession[]>>(() => Promise.resolve([])),
  get_current_sessions: vi.fn<[], Promise<MockGameSession[]>>(() => Promise.resolve([])), // Add this alias
  get_total_active_time: vi.fn<[], Promise<number>>(() => Promise.resolve(0)),
  get_budget_status: vi.fn<[], Promise<{
    daily_allowance_minutes: number;
    used_today_minutes: number;
    remaining_today_minutes: number;
    rollover_minutes: number;
    earned_minutes: number;
    total_available_minutes: number;
  }>>(() => Promise.resolve({
    daily_allowance_minutes: 120,
    used_today_minutes: 0,
    remaining_today_minutes: 120,
    rollover_minutes: 0,
    earned_minutes: 0,
    total_available_minutes: 120,
  })),
  get_realtime_budget_status: vi.fn<[], Promise<{
    daily_allowance_minutes: number;
    used_today_minutes: number;
    remaining_today_minutes: number;
    rollover_minutes: number;
    earned_minutes: number;
    total_available_minutes: number;
  }>>(() => Promise.resolve({
    daily_allowance_minutes: 120,
    used_today_minutes: 0,
    remaining_today_minutes: 120,
    rollover_minutes: 0,
    earned_minutes: 0,
    total_available_minutes: 120,
  })),
  get_recent_sessions: vi.fn<[], Promise<MockGameSession[]>>(() => Promise.resolve([])),
  add_budget_minutes: vi.fn<[], Promise<void>>(() => Promise.resolve()),
  pause_monitoring: vi.fn<[], Promise<void>>(() => Promise.resolve()),
  resume_monitoring: vi.fn<[], Promise<void>>(() => Promise.resolve()),
  add_learning_activity: vi.fn<[], Promise<void>>(() => Promise.resolve()),
  get_detected_games: vi.fn<[], Promise<string[]>>(() => Promise.resolve(['game1.exe', 'game2.exe'])),
};

// Mock invoke function
export const mockInvoke = vi.fn((command: string, args?: any) => {
  const handler = mockTauriCommands[command as keyof typeof mockTauriCommands];
  if (handler) {
    return handler();
  }
  console.warn(`Unhandled Tauri command: ${command}`);
  return Promise.resolve();
});

// Mock notification API
export const mockNotificationApi = {
  sendNotification: vi.fn(() => Promise.resolve()),
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve('granted')),
};

// Mock window API
export const mockWindowApi = {
  WebviewWindow: vi.fn().mockImplementation(() => ({
    listen: vi.fn(),
    emit: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setDecorations: vi.fn(),
    setResizable: vi.fn(),
    center: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  })),
  appWindow: {
    listen: vi.fn(),
    emit: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setDecorations: vi.fn(),
    setResizable: vi.fn(),
    center: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  },
};

// Test data factories
export interface MockGameSession {
  id: string;
  game_name: string;
  process_name: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  is_social_session: boolean;
  is_concurrent: boolean;
  concurrent_session_ids: string[];
  [key: string]: any;
}

export const createMockGameSession = (overrides: Partial<MockGameSession> = {}): MockGameSession => ({
  id: 'test-session-1',
  game_name: 'Test Game',
  process_name: 'testgame.exe',
  start_time: new Date().toISOString(),
  end_time: null,
  duration_seconds: null,
  is_social_session: false,
  is_concurrent: false,
  concurrent_session_ids: [],
  ...overrides,
});

export const createMockBudgetStatus = (overrides = {}) => ({
  daily_allowance_minutes: 120,
  used_today_minutes: 60,
  remaining_today_minutes: 60,
  rollover_minutes: 0,
  earned_minutes: 0,
  total_available_minutes: 120,
  ...overrides,
});

export const createMockLearningActivity = (overrides = {}) => ({
  id: 'learning-1',
  activity_type: 'coding',
  description: 'React development',
  duration_minutes: 60,
  earned_gaming_minutes: 15,
  ...overrides,
});

// Helper to set up specific test scenarios
export const setupMockScenario = (scenario: string) => {
  switch (scenario) {
    case 'no-active-sessions':
      mockTauriCommands.get_active_sessions.mockResolvedValue([]);
      mockTauriCommands.get_total_active_time.mockResolvedValue(0);
      break;

    case 'single-active-session':
      mockTauriCommands.get_active_sessions.mockResolvedValue([
        createMockGameSession({ game_name: 'Active Game' })
      ] as MockGameSession[]);
      mockTauriCommands.get_total_active_time.mockResolvedValue(1800);
      break;

    case 'concurrent-sessions':
      mockTauriCommands.get_active_sessions.mockResolvedValue([
        createMockGameSession({
          id: '1',
          game_name: 'Game 1',
          is_concurrent: true,
          concurrent_session_ids: ['2']
        }),
        createMockGameSession({
          id: '2',
          game_name: 'Game 2',
          is_concurrent: true,
          concurrent_session_ids: ['1']
        }),
      ]);
      mockTauriCommands.get_total_active_time.mockResolvedValue(1800);
      break;

    case 'budget-warning':
      mockTauriCommands.get_budget_status.mockResolvedValue(
        createMockBudgetStatus({
          used_today_minutes: 100,
          remaining_today_minutes: 20
        })
      );
      break;

    case 'budget-exceeded':
      mockTauriCommands.get_budget_status.mockResolvedValue(
        createMockBudgetStatus({
          used_today_minutes: 150,
          remaining_today_minutes: -30
        })
      );
      break;

    case 'with-recent-sessions':
      mockTauriCommands.get_recent_sessions.mockResolvedValue([
        createMockGameSession({
          game_name: 'Recent Game 1',
          end_time: new Date(Date.now() - 3600000).toISOString(),
          duration_seconds: 3600,
        }),
        createMockGameSession({
          id: '2',
          game_name: 'Recent Game 2',
          end_time: new Date(Date.now() - 7200000).toISOString(),
          duration_seconds: 1800,
          is_social_session: true,
        }),
      ]);
      break;

    default:
      // Reset to defaults
      Object.values(mockTauriCommands).forEach(mock => mock.mockReset());
      setupMockScenario('no-active-sessions');
  }

  // IMPORTANT: Update global.mockInvoke to use the updated mocks
  global.mockInvoke = vi.fn((command: string, args?: any) => {
    const handler = mockTauriCommands[command as keyof typeof mockTauriCommands];
    if (handler) {
      return handler();
    }
    console.warn(`Unhandled Tauri command: ${command}`);
    return Promise.resolve();
  });
};

// Reset all mocks
export const resetAllMocks = () => {
  Object.values(mockTauriCommands).forEach(mock => mock.mockReset());
  Object.values(mockNotificationApi).forEach(mock => mock.mockReset());
  setupMockScenario('no-active-sessions');
};