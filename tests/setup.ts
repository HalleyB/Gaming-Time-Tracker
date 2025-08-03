// Add this to your tests/setup.ts file (update the existing one)

import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import { mockTauriCommands } from './__mocks__/tauri';

// Global date-fns mock using vi.importActual to prevent conflicts
vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns');
  return {
    ...(actual as object),
    format: vi.fn((date, formatStr) => {
      if (formatStr === 'yyyy-MM-dd') return '2023-10-15';
      if (formatStr === 'MMM d, yyyy • h:mm a') return 'Oct 15, 2023 • 2:00 PM';
      if (formatStr === 'h:mm a') return '2:00 PM';
      if (formatStr === 'EEEE, MMM d, yyyy') return 'Sunday, Oct 15, 2023';
      return '2023-10-15';
    }),
    parseISO: vi.fn((dateString) => new Date(dateString)),
    startOfWeek: vi.fn(() => new Date('2023-10-08')),
    endOfWeek: vi.fn(() => new Date('2023-10-14')),
    startOfDay: vi.fn(() => new Date('2023-10-15T00:00:00Z')),
    endOfDay: vi.fn(() => new Date('2023-10-15T23:59:59Z')),
    isWithinInterval: vi.fn(() => true),
    formatDistanceToNow: vi.fn(() => '2 minutes ago'),
  };
});

// Mock invoke function that delegates to scenario-based mocks
const mockInvoke = vi.fn((command: string, args?: any) => {
  const handler = mockTauriCommands[command as keyof typeof mockTauriCommands];
  if (handler) {
    return handler();
  }
  console.warn(`Unhandled Tauri command: ${command}`);
  return Promise.resolve();
});

const mockSendNotification = vi.fn();
const mockIsPermissionGranted = vi.fn().mockResolvedValue(true);
const mockRequestPermission = vi.fn().mockResolvedValue('granted');

// Mock the Tauri APIs
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/notification', () => ({
  sendNotification: mockSendNotification,
  isPermissionGranted: mockIsPermissionGranted,
  requestPermission: mockRequestPermission,
}));

vi.mock('@tauri-apps/api/window', () => ({
  WebviewWindow: vi.fn(),
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
}));

// Global test utilities
global.mockInvoke = mockInvoke;
global.mockSendNotification = mockSendNotification;
global.mockIsPermissionGranted = mockIsPermissionGranted;
global.mockRequestPermission = mockRequestPermission;

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Reset individual mock commands but keep the delegating structure
  Object.values(mockTauriCommands).forEach(mock => mock.mockReset());
});