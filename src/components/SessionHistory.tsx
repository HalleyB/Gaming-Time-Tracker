import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import {
  Calendar,
  Clock,
  Filter,
  Search,
  Users,
  Gamepad2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';

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

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60); // Remove decimals

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

type ViewMode = 'list' | 'daily' | 'weekly';
type FilterType = 'all' | 'social' | 'solo' | 'concurrent';
type DateRange = 'today' | 'week' | 'month' | 'all';

// Helper function to format dates without date-fns
const formatDate = (date: Date, format: string) => {
  if (format === 'yyyy-MM-dd') {
    return date.toISOString().split('T')[0];
  }
  if (format === 'MMM d, yyyy • h:mm a') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ' • ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
  if (format === 'h:mm a') {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
  if (format === 'EEEE, MMM d, yyyy') {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
  return date.toLocaleDateString();
};

// Helper function to get start/end of periods without date-fns
const getDateBounds = (timeframe: string) => {
  const now = new Date();
  let startDate: Date;

  switch (timeframe) {
    case 'day':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      return { startDate: new Date(0), endDate: new Date() };
  }

  return { startDate, endDate: now };
};

// Helper function to check if date is within interval
const isDateWithinInterval = (date: Date, start: Date, end: Date) => {
  return date >= start && date <= end;
};

interface SessionHistoryProps {
  recentSessions: GameSession[];
  formatDuration?: (seconds: number) => string; // Make optional since we define our own
}

const SessionHistory: React.FC<SessionHistoryProps> = ({
  recentSessions = []
}) => {
  const [allSessions, setAllSessions] = useState<GameSession[]>(recentSessions);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showBudgetTime, setShowBudgetTime] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const sessionsPerPage = 10;

  // Use provided sessions directly, no additional API calls
  useEffect(() => {
    setAllSessions(recentSessions);
  }, [recentSessions]);

  // Filter sessions based on current filters
  const filteredSessions = allSessions.filter(session => {
    // Date range filter
    const sessionDate = new Date(session.start_time);

    let dateMatch = true;
    if (dateRange !== 'all') {
      const { startDate, endDate } = getDateBounds(dateRange);
      dateMatch = isDateWithinInterval(sessionDate, startDate, endDate);
    }

    // Filter type
    let typeMatch = true;
    switch (filterType) {
      case 'social':
        typeMatch = session.is_social_session;
        break;
      case 'solo':
        typeMatch = !session.is_social_session;
        break;
      case 'concurrent':
        typeMatch = session.is_concurrent;
        break;
      case 'all':
        typeMatch = true;
        break;
    }

    // Search filter
    const searchMatch = searchTerm === '' ||
      session.game_name.toLowerCase().includes(searchTerm.toLowerCase());

    return dateMatch && typeMatch && searchMatch && session.duration_seconds;
  });

  // Calculate total time for filtered sessions
  const calculateTotalTime = (sessions: GameSession[]) => {
    if (showBudgetTime) {
      // Calculate unique time periods (handling concurrent sessions)
      return calculateUniqueTimePeriods(sessions);
    } else {
      // Sum all individual session durations
      return sessions.reduce((total, session) => total + (session.duration_seconds || 0), 0);
    }
  };

  const calculateUniqueTimePeriods = (sessions: GameSession[]) => {
    if (sessions.length === 0) return 0;

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
        totalSeconds += (period.end.getTime() - period.start.getTime()) / 1000;
        currentEnd = period.end;
      } else if (period.start >= currentEnd) {
        totalSeconds += (period.end.getTime() - period.start.getTime()) / 1000;
        currentEnd = period.end;
      } else if (period.end > currentEnd) {
        totalSeconds += (period.end.getTime() - currentEnd.getTime()) / 1000;
        currentEnd = period.end;
      }
    }

    return Math.floor(totalSeconds);
  };

  // Group sessions by date for daily view
  const sessionsByDate = filteredSessions.reduce((acc, session) => {
    const date = formatDate(new Date(session.start_time), 'yyyy-MM-dd');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(session);
    return acc;
  }, {} as Record<string, GameSession[]>);

  // Pagination
  const totalPages = Math.ceil(filteredSessions.length / sessionsPerPage);
  const startIndex = (currentPage - 1) * sessionsPerPage;
  const paginatedSessions = filteredSessions.slice(startIndex, startIndex + sessionsPerPage);

  // Enhanced stats calculation state
  const [statsTimeframe, setStatsTimeframe] = useState<'day' | 'week' | 'month' | 'all'>('week');
  const [avgType, setAvgType] = useState<'session' | 'day'>('session');

  // Get sessions for the selected stats timeframe
  const getStatsTimeframeSessions = () => {
    if (statsTimeframe === 'all') {
      return allSessions.filter(s => s.duration_seconds);
    }

    const { startDate } = getDateBounds(statsTimeframe);

    return allSessions.filter(session => {
      const sessionDate = new Date(session.start_time);
      return sessionDate >= startDate && session.duration_seconds;
    });
  };

  const statsTimeframeSessions = getStatsTimeframeSessions();

  // Calculate stats for the selected timeframe
  const statsData = {
    totalTime: calculateTotalTime(statsTimeframeSessions),
    totalSessions: statsTimeframeSessions.length,
    socialSessions: statsTimeframeSessions.filter(s => s.is_social_session).length,
  };

  // Calculate average based on type
  const calculateAverage = () => {
    if (avgType === 'session') {
      // Average per session
      return statsData.totalSessions > 0 ? Math.floor(statsData.totalTime / statsData.totalSessions) : 0;
    } else {
      // Average per day
      const sessionsByDate = statsTimeframeSessions.reduce((acc, session) => {
        const date = formatDate(new Date(session.start_time), 'yyyy-MM-dd');
        if (!acc[date]) acc[date] = [];
        acc[date].push(session);
        return acc;
      }, {} as Record<string, GameSession[]>);

      const days = Object.keys(sessionsByDate);
      if (days.length === 0) return 0;

      const totalTime = Object.values(sessionsByDate)
        .reduce((total, daySessions) => total + calculateTotalTime(daySessions), 0);

      return Math.floor(totalTime / days.length);
    }
  };

  const getTimeframeLabel = () => {
    const timeframeLabels = {
      day: 'today',
      week: 'this week',
      month: 'this month',
      all: 'all time'
    };

    return timeframeLabels[statsTimeframe];
  };

  const getAverageLabel = () => {
    const typeLabel = avgType === 'session' ? 'per session' : 'per day';
    return `${typeLabel} (${getTimeframeLabel()})`;
  };

  // Stats
  const totalTime = calculateTotalTime(filteredSessions);
  const totalSessions = filteredSessions.length;
  const socialSessions = filteredSessions.filter(s => s.is_social_session).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Session History</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBudgetTime(!showBudgetTime)}
            className="flex items-center gap-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
            title={showBudgetTime ? "Switch to Total Playtime" : "Switch to Budget Time"}
          >
            {showBudgetTime ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showBudgetTime ? "Budget Time" : "Total Time"}
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Stats Overview</h3>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            Showing data for {getTimeframeLabel()}
          </div>
        </div>

        {/* Timeframe Controls */}
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="flex bg-gray-700 rounded p-1">
            {(['day', 'week', 'month', 'all'] as const).map((timeframe) => (
              <button
                key={timeframe}
                onClick={() => setStatsTimeframe(timeframe)}
                className={`px-3 py-1 text-sm rounded transition-colors ${statsTimeframe === timeframe
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white'
                  }`}
              >
                {timeframe === 'day' ? 'Today' :
                  timeframe === 'week' ? 'This Week' :
                    timeframe === 'month' ? 'This Month' : 'All Time'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <h4 className="font-semibold text-white">Total Time</h4>
            </div>
            <p className="text-2xl font-bold text-blue-400">{formatDuration(statsData.totalTime)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {showBudgetTime ? "Budget usage" : "Total playtime"} ({getTimeframeLabel()})
            </p>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gamepad2 className="w-5 h-5 text-green-400" />
              <h4 className="font-semibold text-white">Sessions</h4>
            </div>
            <p className="text-2xl font-bold text-green-400">{statsData.totalSessions}</p>
            <p className="text-xs text-gray-400 mt-1">Total sessions ({getTimeframeLabel()})</p>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-purple-400" />
              <h4 className="font-semibold text-white">Social</h4>
            </div>
            <p className="text-2xl font-bold text-purple-400">{statsData.socialSessions}</p>
            <p className="text-xs text-gray-400 mt-1">
              {statsData.totalSessions > 0 ? `${Math.round((statsData.socialSessions / statsData.totalSessions) * 100)}%` : '0%'} of sessions ({getTimeframeLabel()})
            </p>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-orange-400" />
              <h4 className="font-semibold text-white">Average</h4>
            </div>
            <p className="text-2xl font-bold text-orange-400">{formatDuration(calculateAverage())}</p>
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-2">{getAverageLabel()}</p>

              {/* Average Type Toggle */}
              <div className="flex bg-gray-600 rounded p-1">
                {(['session', 'day'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setAvgType(type)}
                    className={`px-2 py-1 text-xs rounded transition-colors flex-1 ${avgType === type
                      ? 'bg-orange-600 text-white'
                      : 'text-gray-300 hover:text-white'
                      }`}
                  >
                    Per {type === 'session' ? 'Session' : 'Day'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search games..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm min-w-0 flex-1 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => {
              setDateRange(e.target.value as DateRange);
              setCurrentPage(1);
            }}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>

          {/* Filter Type */}
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as FilterType);
              setCurrentPage(1);
            }}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Sessions</option>
            <option value="social">Social Only</option>
            <option value="solo">Solo Only</option>
            <option value="concurrent">Concurrent Only</option>
          </select>

          {/* View Mode */}
          <div className="flex bg-gray-700 rounded-lg p-1">
            {(['list', 'daily'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-sm rounded transition-colors ${viewMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white'
                  }`}
              >
                {mode === 'list' ? 'List' : 'Daily'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sessions Display */}
      {viewMode === 'list' ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          {paginatedSessions.length > 0 ? (
            <>
              <div className="divide-y divide-gray-700">
                {paginatedSessions.map((session, index) => (
                  <div key={session.id || index} className="p-4 hover:bg-gray-750 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <div className={`w-3 h-3 rounded-full ${session.is_social_session ? 'bg-purple-400' : 'bg-gray-400'
                            }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-white">{session.game_name}</h4>
                            {session.is_concurrent && (
                              <span className="px-2 py-0.5 bg-blue-900 text-blue-300 text-xs rounded">
                                Concurrent
                              </span>
                            )}
                            {session.is_social_session && (
                              <span className="px-2 py-0.5 bg-purple-900 text-purple-300 text-xs rounded">
                                Social
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-400">
                            {formatDate(new Date(session.start_time), 'MMM d, yyyy • h:mm a')}
                            {session.end_time && ` - ${formatDate(new Date(session.end_time), 'h:mm a')}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-white">
                          {formatDuration(session.duration_seconds || 0)}
                        </p>
                        {session.is_concurrent && session.concurrent_session_ids.length > 0 && (
                          <p className="text-xs text-blue-400">
                            +{session.concurrent_session_ids.length} concurrent
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-gray-700">
                  <p className="text-sm text-gray-400">
                    Showing {startIndex + 1}-{Math.min(startIndex + sessionsPerPage, filteredSessions.length)} of {filteredSessions.length} sessions
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center">
              <Gamepad2 className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-400 mb-2">No sessions found</h3>
              <p className="text-gray-500">
                {searchTerm || filterType !== 'all' || dateRange !== 'all'
                  ? 'Try adjusting your filters or search terms'
                  : 'Start gaming to see your session history here'}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Daily View */
        <div className="space-y-4">
          {Object.entries(sessionsByDate)
            .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
            .slice(startIndex, startIndex + sessionsPerPage)
            .map(([date, sessions]) => {
              const dayTotal = calculateTotalTime(sessions);
              return (
                <div key={date} className="bg-gray-800 rounded-lg border border-gray-700">
                  <div className="p-4 border-b border-gray-700">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-white">
                        {formatDate(new Date(date), 'EEEE, MMM d, yyyy')}
                      </h3>
                      <div className="text-sm text-gray-400">
                        <span className="font-semibold text-blue-400">{formatDuration(dayTotal)}</span>
                        {' • '}
                        {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-700">
                    {sessions.map((session, index) => (
                      <div key={session.id || index} className="p-3 hover:bg-gray-750 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${session.is_social_session ? 'bg-purple-400' : 'bg-gray-400'
                              }`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{session.game_name}</span>
                                {session.is_concurrent && (
                                  <span className="px-1.5 py-0.5 bg-blue-900 text-blue-300 text-xs rounded">
                                    Concurrent
                                  </span>
                                )}
                                {session.is_social_session && (
                                  <span className="px-1.5 py-0.5 bg-purple-900 text-purple-300 text-xs rounded">
                                    Social
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">
                                {formatDate(new Date(session.start_time), 'h:mm a')}
                                {session.end_time && ` - ${formatDate(new Date(session.end_time), 'h:mm a')}`}
                              </p>
                            </div>
                          </div>
                          <span className="font-medium text-white">
                            {formatDuration(session.duration_seconds || 0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

          {Object.keys(sessionsByDate).length === 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
              <Calendar className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-400 mb-2">No sessions found</h3>
              <p className="text-gray-500">
                {searchTerm || filterType !== 'all' || dateRange !== 'all'
                  ? 'Try adjusting your filters or search terms'
                  : 'Start gaming to see your session history here'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionHistory;