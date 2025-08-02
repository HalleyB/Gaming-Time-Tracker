use rusqlite::{Connection, params, Result as SqlResult};
use chrono::{DateTime, Utc, Local};
use std::path::PathBuf;
use log::{info, error};

use crate::models::{GameSession, BudgetStatus, LearningActivity, AppSettings};

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> SqlResult<Self> {
        let db_path = Self::get_db_path();
        let conn = Connection::open(&db_path)?;

        info!("Database opened at: {:?}", db_path);

        let db = Database { conn };
        db.create_tables()?;
        db.insert_default_settings()?;

        Ok(db)
    }

    fn get_db_path() -> PathBuf {
        let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("GamingTimeTracker");
        std::fs::create_dir_all(&path).unwrap_or_else(|e| {
            error!("Failed to create data directory: {}", e);
        });
        path.push("gaming_tracker.db");
        path
    }

    fn create_tables(&self) -> SqlResult<()> {
        // Game sessions table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                game_name TEXT NOT NULL,
                process_name TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration_seconds INTEGER,
                is_social_session BOOLEAN DEFAULT FALSE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Add new columns if they don't exist (migration)
        let _ = self.conn.execute(
            "ALTER TABLE sessions ADD COLUMN is_concurrent BOOLEAN DEFAULT FALSE",
            [],
        );
        let _ = self.conn.execute(
            "ALTER TABLE sessions ADD COLUMN concurrent_session_ids TEXT DEFAULT '[]'",
            [],
        );

        // Learning activities table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS learning_activities (
                id TEXT PRIMARY KEY,
                activity_type TEXT NOT NULL,
                description TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL,
                earned_gaming_minutes INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Settings table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Budget rollover table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS budget_rollover (
                date TEXT PRIMARY KEY,
                unused_minutes INTEGER NOT NULL,
                expires_at TEXT NOT NULL
            )",
            [],
        )?;

        info!("Database tables created successfully");
        Ok(())
    }

    fn insert_default_settings(&self) -> SqlResult<()> {
        // Insert default settings if they don't exist
        self.conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES
             ('daily_allowance_minutes', '120'),
             ('rollover_days', '3'),
             ('notifications_enabled', 'true'),
             ('warning_threshold_minutes', '15')",
            [],
        )?;
        Ok(())
    }

    pub fn save_session(&self, session: &GameSession) -> SqlResult<()> {
        let end_time_str = session.end_time.map(|dt| dt.to_rfc3339());
        let concurrent_ids_json = serde_json::to_string(&session.concurrent_session_ids)
            .unwrap_or_else(|_| "[]".to_string());

        self.conn.execute(
            "INSERT INTO sessions (id, game_name, process_name, start_time, end_time, duration_seconds, is_social_session, is_concurrent, concurrent_session_ids)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                session.id,
                session.game_name,
                session.process_name,
                session.start_time.to_rfc3339(),
                end_time_str,
                session.duration_seconds,
                session.is_social_session,
                session.is_concurrent,
                concurrent_ids_json
            ],
        )?;

        info!("Session saved: {}{}", session.game_name,
              if session.is_concurrent { " [CONCURRENT]" } else { "" });
        Ok(())
    }

    pub fn get_recent_sessions(&self, limit: usize) -> SqlResult<Vec<GameSession>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, game_name, process_name, start_time, end_time, duration_seconds, is_social_session, is_concurrent, concurrent_session_ids
             FROM sessions
             ORDER BY start_time DESC
             LIMIT ?1"
        )?;

        let session_iter = stmt.query_map([limit], |row| {
            let start_time_str: String = row.get(3)?;
            let end_time_str: Option<String> = row.get(4)?;
            let concurrent_ids_json: String = row.get(8).unwrap_or_else(|_| "[]".to_string());
            let concurrent_session_ids: Vec<String> = serde_json::from_str(&concurrent_ids_json)
                .unwrap_or_else(|_| Vec::new());

            Ok(GameSession {
                id: row.get(0)?,
                game_name: row.get(1)?,
                process_name: row.get(2)?,
                start_time: DateTime::parse_from_rfc3339(&start_time_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(3, "start_time".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
                end_time: end_time_str.and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc)),
                duration_seconds: row.get(5)?,
                is_social_session: row.get(6)?,
                is_concurrent: row.get(7).unwrap_or(false),
                concurrent_session_ids,
            })
        })?;

        let mut sessions = Vec::new();
        for session in session_iter {
            sessions.push(session?);
        }

        Ok(sessions)
    }

    pub fn get_today_usage_minutes(&self) -> SqlResult<i32> {
        let today_start = Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap()
            .and_local_timezone(Local).single().unwrap()
            .with_timezone(&Utc);

        // For concurrent sessions, we need to calculate overlapping time periods
        // instead of just summing durations
        let mut stmt = self.conn.prepare(
            "SELECT start_time, end_time, duration_seconds, is_concurrent, concurrent_session_ids
             FROM sessions
             WHERE start_time >= ?1 AND duration_seconds IS NOT NULL
             ORDER BY start_time"
        )?;

        let sessions_iter = stmt.query_map([today_start.to_rfc3339()], |row| {
            let start_time_str: String = row.get(0)?;
            let end_time_str: Option<String> = row.get(1)?;
            let duration_seconds: i64 = row.get(2)?;
            let is_concurrent: bool = row.get(3).unwrap_or(false);

            Ok((
                DateTime::parse_from_rfc3339(&start_time_str).unwrap().with_timezone(&Utc),
                end_time_str.and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc)),
                duration_seconds,
                is_concurrent
            ))
        })?;

        let mut time_periods = Vec::new();
          for session_result in sessions_iter {
              let (start_time, end_time, _duration_seconds, is_concurrent) = session_result?;
              if let Some(end_time) = end_time {
                  time_periods.push((start_time, end_time, is_concurrent));
              }
          }

        // Calculate total unique time (handling overlaps for concurrent sessions)
        let total_seconds = self.calculate_unique_time_periods(&time_periods);
        Ok((total_seconds / 60) as i32)
    }

    // Helper method to calculate unique time periods, handling concurrent sessions
    fn calculate_unique_time_periods(&self, periods: &[(DateTime<Utc>, DateTime<Utc>, bool)]) -> i64 {
        if periods.is_empty() {
            return 0;
        }

        // Sort periods by start time
        let mut sorted_periods = periods.to_vec();
        sorted_periods.sort_by_key(|(start, _, _)| *start);

        let mut total_seconds = 0i64;
        let mut current_end: Option<DateTime<Utc>> = None;

        for (start, end, _is_concurrent) in sorted_periods {
            match current_end {
                None => {
                    // First period
                    total_seconds += (end - start).num_seconds();
                    current_end = Some(end);
                }
                Some(prev_end) => {
                    if start >= prev_end {
                        // No overlap, add full duration
                        total_seconds += (end - start).num_seconds();
                        current_end = Some(end);
                    } else if end > prev_end {
                        // Partial overlap, add only the non-overlapping part
                        total_seconds += (end - prev_end).num_seconds();
                        current_end = Some(end);
                    }
                    // If end <= prev_end, this period is completely contained, add nothing
                }
            }
        }

        total_seconds
    }

    pub fn get_budget_status(&self) -> SqlResult<BudgetStatus> {
        let settings = self.get_settings()?;
        let used_today = self.get_today_usage_minutes()?;
        let rollover = self.get_rollover_minutes()?;
        let earned = self.get_earned_minutes_today()?;

        let mut budget = BudgetStatus::new(settings.daily_allowance_minutes);
        budget.rollover_minutes = rollover;
        budget.earned_minutes = earned;
        budget.update_usage(used_today);

        Ok(budget)
    }

    pub fn add_learning_activity(&self, activity: &LearningActivity) -> SqlResult<()> {
        self.conn.execute(
            "INSERT INTO learning_activities (id, activity_type, description, duration_minutes, earned_gaming_minutes, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                activity.id,
                activity.activity_type,
                activity.description,
                activity.duration_minutes,
                activity.earned_gaming_minutes,
                activity.timestamp.to_rfc3339()
            ],
        )?;

        info!("Learning activity added: {} minutes of {}", activity.duration_minutes, activity.activity_type);
        Ok(())
    }

    fn get_earned_minutes_today(&self) -> SqlResult<i32> {
        let today_start = Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap()
            .and_local_timezone(Local).single().unwrap()
            .with_timezone(&Utc);

        let mut stmt = self.conn.prepare(
            "SELECT COALESCE(SUM(earned_gaming_minutes), 0) FROM learning_activities
             WHERE timestamp >= ?1"
        )?;

        stmt.query_row([today_start.to_rfc3339()], |row| row.get(0))
    }

    fn get_rollover_minutes(&self) -> SqlResult<i32> {
        let now = Utc::now();

        // Clean up expired rollover entries
        self.conn.execute(
            "DELETE FROM budget_rollover WHERE expires_at < ?1",
            [now.to_rfc3339()],
        )?;

        // Sum remaining rollover minutes
        let mut stmt = self.conn.prepare(
            "SELECT COALESCE(SUM(unused_minutes), 0) FROM budget_rollover
             WHERE expires_at >= ?1"
        )?;

        stmt.query_row([now.to_rfc3339()], |row| row.get(0))
    }

    pub fn add_rollover(&self, date: &str, unused_minutes: i32, expires_at: DateTime<Utc>) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO budget_rollover (date, unused_minutes, expires_at)
             VALUES (?1, ?2, ?3)",
            params![date, unused_minutes, expires_at.to_rfc3339()],
        )?;
        Ok(())
    }

    fn get_settings(&self) -> SqlResult<AppSettings> {
        let mut stmt = self.conn.prepare(
            "SELECT key, value FROM settings"
        )?;

        let mut settings = AppSettings {
            daily_allowance_minutes: 120,
            rollover_days: 3,
            notifications_enabled: true,
            warning_threshold_minutes: 15,
        };

        let settings_iter = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for setting in settings_iter {
            let (key, value) = setting?;
            match key.as_str() {
                "daily_allowance_minutes" => {
                    settings.daily_allowance_minutes = value.parse().unwrap_or(120);
                },
                "rollover_days" => {
                    settings.rollover_days = value.parse().unwrap_or(3);
                },
                "notifications_enabled" => {
                    settings.notifications_enabled = value == "true";
                },
                "warning_threshold_minutes" => {
                    settings.warning_threshold_minutes = value.parse().unwrap_or(15);
                },
                _ => {}
            }
        }

        Ok(settings)
    }

    pub fn update_setting(&self, key: &str, value: &str) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at)
             VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            params![key, value],
        )?;
        Ok(())
    }

    // Debug/Development helpers
    pub fn reset_today_sessions(&self) -> SqlResult<()> {
        let today_start = Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap()
            .and_local_timezone(Local).single().unwrap()
            .with_timezone(&Utc);

        self.conn.execute(
            "DELETE FROM sessions WHERE start_time >= ?1",
            [today_start.to_rfc3339()],
        )?;

        info!("Reset all sessions for today");
        Ok(())
    }

    pub fn add_debug_earned_minutes(&self, minutes: i32) -> SqlResult<()> {
        // Add a fake learning activity to give bonus minutes (or remove if negative)
        let activity = LearningActivity {
            id: Some(uuid::Uuid::new_v4().to_string()),
            activity_type: "debug".to_string(),
            description: if minutes > 0 {
                format!("Debug: Added {} minutes to budget", minutes)
            } else {
                format!("Debug: Removed {} minutes from budget", minutes.abs())
            },
            duration_minutes: minutes.abs() * 4, // Fake duration
            earned_gaming_minutes: minutes,
            timestamp: Utc::now(),
        };

        self.add_learning_activity(&activity)?;
        info!("Added {} debug minutes to budget", minutes);
        Ok(())
    }

    pub fn add_fake_gaming_session(&self, minutes: i32) -> SqlResult<()> {
        let now = Utc::now();
        let start_time = now - chrono::Duration::minutes(minutes as i64);

        let session = GameSession {
            id: Some(uuid::Uuid::new_v4().to_string()),
            game_name: "Debug Fake Game".to_string(),
            process_name: "debug.exe".to_string(),
            start_time,
            end_time: Some(now),
            duration_seconds: Some(minutes as i64 * 60),
            is_social_session: false,
            is_concurrent: false,
            concurrent_session_ids: Vec::new(),
        };

        self.save_session(&session)?;
        info!("Added {} minutes of fake gaming session", minutes);
        Ok(())
    }
}