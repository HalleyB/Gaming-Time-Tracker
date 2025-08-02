import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import { mockTauriCommands } from './__mocks__/tauri';

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