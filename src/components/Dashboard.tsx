import React, { useState } from 'react';
import { Clock, Trophy, TrendingUp, Calendar } from 'lucide-react';
import { format } from 'date-fns';

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

interface DashboardProps {
  activeSessions: GameSession[];
  totalActiveTime: number;
  budgetStatus: BudgetStatus | null;
  recentSessions: GameSession[];
  formatDuration: (seconds: number) => string;
}

const Dashboard: React.FC<DashboardProps> = ({
  activeSessions,
  totalActiveTime,
  budgetStatus,
  recentSessions,
  formatDuration
}) => {
  const [showBudgetTime, setShowBudgetTime] = useState(true);
  const getCurrentSessionDuration = () => {
    if (!currentSession) return 0;
    const start = new Date(currentSession.start_time).getTime();
    const now = Date.now();
    return Math.floor((now - start) / 1000);
  };

  const isOverBudget = budgetStatus && budgetStatus.remaining_today_minutes <= 0;
  const isLowBudget = budgetStatus && budgetStatus.remaining_today_minutes <= 5 && budgetStatus.remaining_today_minutes > 0;

  const getTodaysSessions = () => {
    const today = new Date().toDateString();
    return recentSessions.filter(session =>
      new Date(session.start_time).toDateString() === today
    );
  };

  const getWeeklyTotal = () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekSessions = recentSessions.filter(session =>
      new Date(session.start_time) >= oneWeekAgo && session.duration_seconds
    );

    if (showBudgetTime) {
      // Budget usage: calculate unique time periods (handling concurrent sessions)
      return calculateUniqueTimePeriods(weekSessions);
    } else {
      // Total playtime: sum all individual session durations
      return weekSessions.reduce((total, session) => total + (session.duration_seconds || 0), 0);
    }
  };

  const calculateUniqueTimePeriods = (sessions: GameSession[]) => {
    if (sessions.length === 0) return 0;

    // Convert sessions to time periods
    const periods = sessions
      .filter(session => session.end_time)
      .map(session => ({
        start: new Date(session.start_time),
        end: new Date(session.end_time!),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    let totalSeconds = 0;
    let currentEnd: Date | null = null;

    for (const period of periods) {
      if (!currentEnd) {
        // First period
        totalSeconds += (period.end.getTime() - period.start.getTime()) / 1000;
        currentEnd = period.end;
      } else if (period.start >= currentEnd) {
        // No overlap, add full duration
        totalSeconds += (period.end.getTime() - period.start.getTime()) / 1000;
        currentEnd = period.end;
      } else if (period.end > currentEnd) {
        // Partial overlap, add only non-overlapping part
        totalSeconds += (period.end.getTime() - currentEnd.getTime()) / 1000;
        currentEnd = period.end;
      }
      // If period.end <= currentEnd, this period is completely contained, add nothing
    }

    return Math.floor(totalSeconds);
  };

  const todaysSessions = getTodaysSessions();
  const weeklyTotal = getWeeklyTotal();

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Current Session */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Current Session</h3>
            <Clock className="w-5 h-5 text-purple-400" />
          </div>
          {activeSessions.length > 0 ? (
            <div>
              <p className="text-2xl font-bold text-white mb-1">
                {formatDuration(totalActiveTime)}
              </p>
              {activeSessions.length === 1 ? (
                <p className="text-sm text-gray-400">{activeSessions[0].game_name}</p>
              ) : (
                <p className="text-sm text-gray-400">
                  {activeSessions.length} concurrent games
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold text-gray-500 mb-1">--</p>
              <p className="text-sm text-gray-500">No active session</p>
            </div>
          )}
        </div>

        {/* Today's Usage */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Today's Usage</h3>
            <Calendar className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white mb-1">
              {budgetStatus ? `${budgetStatus.used_today_minutes}m` : '--'}
            </p>
            <p className="text-sm text-gray-400">
              {todaysSessions.length} session{todaysSessions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Budget Remaining */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Budget Remaining</h3>
            <Trophy className="w-5 h-5 text-green-400" />
          </div>
          {budgetStatus ? (
            <div>
              <p className={`text-2xl font-bold mb-1 ${isOverBudget ? 'text-red-400' :
                isLowBudget ? 'text-orange-400' :
                  'text-white'
                }`}>
                {budgetStatus.remaining_today_minutes}m
              </p>
              <p className="text-sm text-gray-400">
                of {budgetStatus.total_available_minutes}m total
              </p>
              {isLowBudget && (
                <p className="text-xs text-orange-400 mt-1">⚠️ Low budget!</p>
              )}
              {isOverBudget && (
                <p className="text-xs text-red-400 mt-1">🚫 Over budget!</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold text-gray-500 mb-1">--</p>
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          )}
        </div>

        {/* Weekly Total */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <h3 className="text-sm font-medium text-gray-400 mr-3">Weekly Total</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowBudgetTime(!showBudgetTime)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showBudgetTime ? 'bg-purple-600' : 'bg-gray-600'
                    }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${showBudgetTime ? 'translate-x-5' : 'translate-x-1'
                      }`}
                  />
                </button>
                <span className="text-xs text-gray-500">
                  {showBudgetTime ? 'Budget Usage' : 'Total Playtime'}
                </span>
              </div>
            </div>
            <TrendingUp className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white mb-1">
              {formatDuration(weeklyTotal)}
            </p>
            <p className="text-sm text-gray-400">
              {showBudgetTime ? 'Counted toward budget' : 'Actual time in games'}
            </p>
            {!showBudgetTime && weeklyTotal !== getWeeklyTotal() && (
              <p className="text-xs text-purple-400 mt-1">
                ℹ️ Includes concurrent session overlap
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Active Sessions Details */}
      {activeSessions.length > 1 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">
            Active Sessions ({activeSessions.length} concurrent)
          </h3>
          <div className="space-y-3">
            {activeSessions.map((session, index) => (
              <div key={session.id || index} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-b-0">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <div>
                    <p className="text-white font-medium">{session.game_name}</p>
                    <p className="text-sm text-gray-400">
                      Started {format(new Date(session.start_time), 'h:mm a')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-medium">
                    {formatDuration(Math.floor((Date.now() - new Date(session.start_time).getTime()) / 1000))}
                  </p>
                  <p className="text-xs text-blue-400">Concurrent</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
            <p className="text-sm text-blue-300">
              <strong>Total Time:</strong> {formatDuration(totalActiveTime)}
              <span className="text-gray-400 ml-2">
                (Budget usage: {formatDuration(totalActiveTime)}, not {formatDuration(activeSessions.length * totalActiveTime)})
              </span>
            </p>
          </div>
        </div>
      )}
      {budgetStatus && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Budget Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-1">Daily Allowance</p>
              <p className="text-xl font-bold text-blue-400">
                {budgetStatus.daily_allowance_minutes}m
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-1">Rollover</p>
              <p className="text-xl font-bold text-purple-400">
                {budgetStatus.rollover_minutes}m
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-1">Earned</p>
              <p className="text-xl font-bold text-green-400">
                {budgetStatus.earned_minutes}m
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Sessions</h3>
        {recentSessions.length > 0 ? (
          <div className="space-y-3">
            {recentSessions.slice(0, 5).map((session, index) => (
              <div key={session.id || index} className="flex items-center justify-between py-3 border-b border-gray-700 last:border-b-0">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <div>
                    <p className="text-white font-medium">{session.game_name}</p>
                    <p className="text-sm text-gray-400">
                      {format(new Date(session.start_time), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-medium">
                    {session.duration_seconds ? formatDuration(session.duration_seconds) : 'In progress'}
                  </p>
                  <div className="flex items-center space-x-2">
                    {session.is_social_session && (
                      <span className="text-xs text-blue-400">Social</span>
                    )}
                    {session.is_concurrent && (
                      <span className="text-xs text-purple-400">Concurrent</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No gaming sessions recorded yet</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-purple-900/20 border border-purple-800 rounded-lg p-4">
            <h4 className="font-medium text-purple-400 mb-2">Earn Extra Time</h4>
            <p className="text-sm text-gray-300">
              Complete learning activities to earn bonus gaming minutes. 1 hour of coding = 15 extra minutes!
            </p>
          </div>
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <h4 className="font-medium text-blue-400 mb-2">Budget Rollover</h4>
            <p className="text-sm text-gray-300">
              Unused minutes roll over to the next day. Build up a buffer for longer gaming sessions!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;