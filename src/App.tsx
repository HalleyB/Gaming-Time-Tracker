import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/api/notification';
import { WebviewWindow, appWindow } from '@tauri-apps/api/window';
import {
  Clock,
  Play,
  Pause,
  BookOpen,
  Trophy,
  Settings,
  Gamepad2,
  Calendar,
  Plus
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

import Dashboard from './components/Dashboard';
// import LearningTracker from './components/LearningTracker';
// import SessionHistory from './components/SessionHistory';
// import SettingsPanel from './components/SettingsPanel';

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

interface BudgetStatus {
  daily_allowance_minutes: number;
  used_today_minutes: number;
  remaining_today_minutes: number;
  rollover_minutes: number;
  earned_minutes: number;
  total_available_minutes: number;
}

interface LearningActivity {
  id?: string;
  activity_type: string;
  description: string;
  duration_minutes: number;
  earned_gaming_minutes: number;
  timestamp: string;
}

type TabType = 'dashboard' | 'learning' | 'history' | 'settings';

function App() {
  const [activeSessions, setActiveSessions] = useState<GameSession[]>([]);
  const [totalActiveTime, setTotalActiveTime] = useState<number>(0);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [recentSessions, setRecentSessions] = useState<GameSession[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Custom notification state (fallback only)
  const [showCustomNotification, setShowCustomNotification] = useState(false);
  const [notificationData, setNotificationData] = useState<{
    title: string;
    message: string;
    type: 'warning' | 'critical' | 'exceeded';
    remainingMinutes?: number;
  } | null>(null);

  // Track if we've already shown the warnings
  const fiveMinuteWarningShown = useRef(false);
  const oneMinuteWarningShown = useRef(false);
  const exceededWarningShown = useRef(false);

  // Track current overlay state
  const currentOverlayType = useRef<'none' | 'warning' | 'critical' | 'exceeded'>('none');

  const isOverBudget = budgetStatus && budgetStatus.remaining_today_minutes <= 0;
  const isLowBudget = budgetStatus && budgetStatus.remaining_today_minutes <= 5 && budgetStatus.remaining_today_minutes > 0;

  // Custom notification actions (fallback only)
  const handleNotificationAction = async (action: 'close_games' | 'acknowledge' | 'dismiss') => {
    setShowCustomNotification(false);
    setNotificationData(null);

    if (action === 'close_games') {
      await closeAllGames();
    }
    // For 'acknowledge' and 'dismiss', we just close the notification
  };

  const showGameDisruptiveOverlay = async (data: {
    title: string;
    message: string;
    type: 'warning' | 'critical' | 'exceeded';
    remainingMinutes?: number;
  }) => {
    console.log('Showing game overlay notification:', data);

    // Check if we should show this overlay based on current state
    if (currentOverlayType.current === data.type) {
      console.log(`${data.type} overlay already showing, skipping duplicate`);
      return;
    }

    // For escalation: only show if it's a higher priority
    const priorityOrder = { 'warning': 1, 'critical': 2, 'exceeded': 3 };
    const currentPriority = priorityOrder[currentOverlayType.current] || 0;
    const newPriority = priorityOrder[data.type];

    if (currentPriority >= newPriority) {
      console.log(`Current overlay (${currentOverlayType.current}) is same or higher priority than ${data.type}, not replacing`);
      return;
    }

    // Update the current overlay type
    currentOverlayType.current = data.type;
    console.log(`Setting overlay type to: ${data.type}`);

    try {
      // Try the simpler overlay first
      await invoke('show_simple_overlay', {
        title: data.title,
        message: data.message,
        notificationType: data.type
      });

      console.log('Simple overlay created successfully');
    } catch (error) {
      console.error('Simple overlay failed, trying native dialog:', error);

      try {
        // Fallback to the native dialog
        await invoke('show_game_overlay', {
          title: data.title,
          message: data.message,
          notificationType: data.type,
          remainingMinutes: data.remainingMinutes || null
        });

        console.log('Native dialog shown successfully');
      } catch (dialogError) {
        console.error('Native dialog also failed:', dialogError);

        // Final fallback to in-app notification
        console.log('Falling back to in-app notification');
        setNotificationData(data);
        setShowCustomNotification(true);
      }
    }
  };

  // Fetch all data
  const fetchData = async () => {
    try {
      const [sessions, activeTime, budget, recent] = await Promise.all([
        invoke<GameSession[]>('get_current_sessions'),
        invoke<number>('get_total_active_time'),
        invoke<BudgetStatus>('get_realtime_budget_status'),
        invoke<GameSession[]>('get_recent_sessions')
      ]);

      setActiveSessions(sessions);
      setTotalActiveTime(activeTime);
      setBudgetStatus(budget);
      setRecentSessions(recent);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  // Check for warnings and send notifications
  const checkWarnings = async (budget: BudgetStatus) => {
    const remaining = budget.remaining_today_minutes;

    // 5-minute warning
    if (remaining <= 5 && remaining > 1 && !fiveMinuteWarningShown.current) {
      fiveMinuteWarningShown.current = true;

      const notificationData = {
        title: "⚠️ Gaming Time Warning",
        message: `You have ${remaining} minutes left in your gaming budget today. Consider wrapping up your current session soon!`,
        type: 'warning' as const,
        remainingMinutes: remaining
      };

      // Try system notification first
      try {
        await invoke('show_system_notification', {
          title: notificationData.title,
          message: notificationData.message,
          urgency: notificationData.type
        });
      } catch (error) {
        console.error('Failed to send system notification:', error);
      }

      // Show game overlay
      await showGameDisruptiveOverlay(notificationData);
    }

    // 1-minute warning
    if (remaining <= 1 && remaining > 0 && !oneMinuteWarningShown.current) {
      oneMinuteWarningShown.current = true;

      const notificationData = {
        title: "🚨 Final Warning",
        message: `Only ${remaining} minute${remaining === 1 ? '' : 's'} remaining! Please save your progress and prepare to close your games.`,
        type: 'critical' as const,
        remainingMinutes: remaining
      };

      // Try system notification first
      try {
        await invoke('show_system_notification', {
          title: notificationData.title,
          message: notificationData.message,
          urgency: notificationData.type
        });
      } catch (error) {
        console.error('Failed to send system notification:', error);
      }

      // Show game overlay
      await showGameDisruptiveOverlay(notificationData);
    }

    // Budget exceeded - automatically close games
    if (remaining <= 0 && !exceededWarningShown.current) {
      exceededWarningShown.current = true;

      const notificationData = {
        title: "❌ Gaming Time Exceeded",
        message: "Your gaming time budget has been exceeded. Games will be closed automatically in 5 seconds.",
        type: 'exceeded' as const,
        remainingMinutes: 0
      };

      // Try system notification first
      try {
        await invoke('show_system_notification', {
          title: notificationData.title,
          message: notificationData.message,
          urgency: notificationData.type
        });
      } catch (error) {
        console.error('Failed to send system notification:', error);
      }

      // Show game overlay
      await showGameDisruptiveOverlay(notificationData);

      // Automatically close games after a shorter 5-second delay
      console.log('Budget exceeded - closing games in 5 seconds...');
      setTimeout(async () => {
        try {
          console.log('Time expired - attempting to close all games now...');
          const closedGames = await invoke<string[]>('close_all_games');
          if (closedGames.length > 0) {
            console.log(`Automatically closed games: ${closedGames.join(', ')}`);
            // Show a success notification
            try {
              await invoke('show_system_notification', {
                title: "🎮 Games Closed Automatically",
                message: `Time expired. Closed: ${closedGames.join(', ')}`,
                urgency: 'info'
              });
            } catch (error) {
              console.error('Failed to send game closed notification:', error);
            }
          } else {
            console.log('No games were running to close');
            try {
              await invoke('show_system_notification', {
                title: "🎮 No Games to Close",
                message: "Time expired, but no games were detected running.",
                urgency: 'info'
              });
            } catch (error) {
              console.error('Failed to send no games notification:', error);
            }
          }
        } catch (error) {
          console.error('Failed to automatically close games:', error);
          try {
            await invoke('show_system_notification', {
              title: "❌ Auto-Close Failed",
              message: "Could not automatically close games. Please close them manually.",
              urgency: 'error'
            });
          } catch (notifError) {
            console.error('Failed to send error notification:', notifError);
          }
        }
      }, 5000); // 5-second delay
    }
  };

  // Reset warning flags when budget increases (e.g., learning activities)
  useEffect(() => {
    if (budgetStatus) {
      if (budgetStatus.remaining_today_minutes > 5) {
        fiveMinuteWarningShown.current = false;
        if (currentOverlayType.current === 'warning') {
          currentOverlayType.current = 'none';
          console.log('Budget increased above 5 minutes, clearing warning overlay state');
        }
      }
      if (budgetStatus.remaining_today_minutes > 1) {
        oneMinuteWarningShown.current = false;
        if (currentOverlayType.current === 'critical') {
          currentOverlayType.current = 'none';
          console.log('Budget increased above 1 minute, clearing critical overlay state');
        }
      }
      if (budgetStatus.remaining_today_minutes > 0) {
        exceededWarningShown.current = false;
        if (currentOverlayType.current === 'exceeded') {
          currentOverlayType.current = 'none';
          console.log('Budget increased above 0, clearing exceeded overlay state');
        }
      }
    }
  }, [budgetStatus?.remaining_today_minutes]);

  // Check for warnings when budget changes
  useEffect(() => {
    if (budgetStatus && activeSessions && activeSessions.length > 0) {
      checkWarnings(budgetStatus);
    }
  }, [budgetStatus, activeSessions]);

  // Initial data fetch and periodic updates
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000); // Update every second
    return () => clearInterval(interval);
  }, []);

  // Initialize notification permissions
  useEffect(() => {
    const initNotifications = async () => {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
      console.log('Notification permission:', permissionGranted);
    };
    initNotifications();
  }, []);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Debug functions
  const resetTodaySessions = async () => {
    try {
      await invoke('reset_today_sessions');
      await fetchData(); // Refresh data
      alert('✅ Today\'s sessions cleared!');
    } catch (error) {
      console.error('Failed to reset sessions:', error);
      alert('❌ Failed to reset sessions');
    }
  };

  const addBudgetMinutes = async (minutes: number) => {
    try {
      await invoke('add_budget_minutes', { minutes });
      await fetchData(); // Refresh data
      alert(`✅ Added ${minutes} minutes to budget!`);
    } catch (error) {
      console.error('Failed to add budget minutes:', error);
      alert('❌ Failed to add budget minutes');
    }
  };

  const removeBudgetMinutes = async (minutes: number) => {
    try {
      await invoke('remove_budget_minutes', { minutes });
      await fetchData(); // Refresh data
      alert(`✅ Removed ${minutes} minutes from budget!`);
    } catch (error) {
      console.error('Failed to remove budget minutes:', error);
      alert('❌ Failed to remove budget minutes');
    }
  };

  const addFakePlaytime = async (minutes: number) => {
    try {
      await invoke('add_fake_playtime', { minutes });
      await fetchData(); // Refresh data
      alert(`✅ Added ${minutes} minutes of fake playtime!`);
    } catch (error) {
      console.error('Failed to add fake playtime:', error);
      alert('❌ Failed to add fake playtime');
    }
  };

  const closeAllGames = async () => {
    try {
      const closedGames = await invoke<string[]>('close_all_games');
      await fetchData(); // Refresh data
      if (closedGames.length > 0) {
        alert(`✅ Closed games: ${closedGames.join(', ')}`);
      } else {
        alert('ℹ️ No games were running to close');
      }
    } catch (error) {
      console.error('Failed to close games:', error);
      alert('❌ Failed to close games');
    }
  };

  // Test overlay function for debugging
  const testOverlay = async () => {
    // Reset overlay state for testing
    currentOverlayType.current = 'none';

    await showGameDisruptiveOverlay({
      title: "🧪 Test Overlay",
      message: "This is a test of the intrusive game overlay system. It should appear full-screen over any running games!",
      type: 'warning',
      remainingMinutes: 3
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Fallback In-App Notification Overlay (only if game overlay fails) */}
      {showCustomNotification && notificationData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className={`max-w-md w-full mx-4 rounded-lg border shadow-2xl animate-pulse ${notificationData.type === 'warning' ? 'bg-purple-900 border-purple-500' :
            notificationData.type === 'critical' ? 'bg-orange-900 border-orange-500' :
              'bg-red-900 border-red-500'
            }`}>
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl mr-4 ${notificationData.type === 'warning' ? 'bg-purple-600' :
                  notificationData.type === 'critical' ? 'bg-orange-600' :
                    'bg-red-600'
                  }`}>
                  {notificationData.type === 'warning' ? '⚠️' :
                    notificationData.type === 'critical' ? '🚨' : '❌'}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{notificationData.title}</h3>
                  {notificationData.remainingMinutes !== undefined && notificationData.remainingMinutes > 0 && (
                    <p className="text-yellow-300 font-medium">
                      {notificationData.remainingMinutes} minute{notificationData.remainingMinutes === 1 ? '' : 's'} remaining
                    </p>
                  )}
                </div>
              </div>

              <p className="text-white mb-6 text-lg">{notificationData.message}</p>

              <div className="flex space-x-3">
                {notificationData.type === 'exceeded' ? (
                  <>
                    <button
                      onClick={() => handleNotificationAction('close_games')}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      🎮 Close My Games
                    </button>
                    <button
                      onClick={() => handleNotificationAction('acknowledge')}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      ✋ I Understand
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleNotificationAction('close_games')}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      🎮 Close Games Now
                    </button>
                    <button
                      onClick={() => handleNotificationAction('acknowledge')}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      👍 Got It
                    </button>
                  </>
                )}
              </div>

              {notificationData.type !== 'exceeded' && (
                <button
                  onClick={() => handleNotificationAction('dismiss')}
                  className="w-full mt-3 bg-transparent hover:bg-gray-800 text-gray-400 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  ✕ Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Gamepad2 className="w-8 h-8 text-purple-400" />
            <h1 className="text-2xl font-bold">Gaming Time Tracker</h1>
          </div>

          <div className="flex items-center space-x-4">
            {/* Current Session Indicator */}
            {activeSessions && activeSessions.length > 0 && (
              <div className="flex items-center space-x-2 bg-green-900/50 px-3 py-2 rounded-lg border border-green-700">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <div className="flex flex-col">
                  {activeSessions.length === 1 ? (
                    <>
                      <span className="text-sm text-green-300 font-medium">
                        Playing: {activeSessions[0].game_name}
                      </span>
                      <span className="text-xs text-green-400">
                        {formatTime(totalActiveTime)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-green-300 font-medium">
                        {activeSessions.length} Games Active
                      </span>
                      <span className="text-xs text-green-400">
                        Total: {formatTime(totalActiveTime)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Budget Status */}
            {budgetStatus && (
              <div className={`px-3 py-2 rounded-lg border ${isOverBudget
                ? 'bg-red-900/50 border-red-700 text-red-300'
                : isLowBudget
                  ? 'bg-yellow-900/50 border-yellow-700 text-yellow-300'
                  : 'bg-blue-900/50 border-blue-700 text-blue-300'
                }`}>
                <div className="text-sm font-medium">
                  {isOverBudget
                    ? `Over by ${Math.abs(budgetStatus.remaining_today_minutes)}m`
                    : `${budgetStatus.remaining_today_minutes}m left`
                  }
                </div>
                <div className="text-xs opacity-75">
                  Total: {budgetStatus.total_available_minutes}m
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <div className="flex space-x-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Gamepad2 },
            { id: 'learning', label: 'Learning', icon: BookOpen },
            { id: 'history', label: 'History', icon: Calendar },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as TabType)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${activeTab === id
                ? 'bg-purple-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            activeSessions={activeSessions}
            totalActiveTime={totalActiveTime}
            budgetStatus={budgetStatus}
            recentSessions={recentSessions}
            formatDuration={formatDuration}
          />
        )}
        {activeTab === 'learning' && (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-400 mb-2">Learning Tracker</h2>
            <p className="text-gray-500">Coming soon...</p>
          </div>
        )}
        {activeTab === 'history' && (
          <div className="text-center py-20">
            <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-400 mb-2">Session History</h2>
            <p className="text-gray-500">Coming soon...</p>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="text-center py-20">
            <Settings className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-400 mb-2">Settings</h2>
            <p className="text-gray-500">Coming soon...</p>
          </div>
        )}
      </main>

      {/* Debug Panel - Remove in production */}
      <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-600 rounded-lg p-4 max-w-sm">
        <h3 className="text-sm font-bold mb-3 text-purple-400">🔧 Debug Panel</h3>
        <div className="space-y-2">
          <button
            onClick={testOverlay}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            🧪 Test Game Overlay
          </button>
          <button
            onClick={() => addBudgetMinutes(30)}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            ➕ Add 30m Budget
          </button>
          <button
            onClick={() => removeBudgetMinutes(30)}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            ➖ Remove 30m Budget
          </button>
          <button
            onClick={() => addFakePlaytime(10)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            🎮 Add 10m Playtime
          </button>
          <button
            onClick={closeAllGames}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            ❌ Close All Games
          </button>
          <button
            onClick={resetTodaySessions}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            🔄 Reset Today
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;