use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSession {
    pub id: Option<String>,
    pub game_name: String,
    pub process_name: String,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub duration_seconds: Option<i64>,
    pub is_social_session: bool,
    pub is_concurrent: bool, // New field
    pub concurrent_session_ids: Vec<String>, // IDs of other concurrent sessions
}

impl GameSession {
    pub fn new(game_name: String, process_name: String) -> Self {
        Self {
            id: Some(uuid::Uuid::new_v4().to_string()),
            game_name,
            process_name,
            start_time: Utc::now(),
            end_time: None,
            duration_seconds: None,
            is_social_session: false,
            is_concurrent: false,
            concurrent_session_ids: Vec::new(),
        }
    }

    pub fn end_session(&mut self) {
        self.end_time = Some(Utc::now());
        if let Some(end) = self.end_time {
            self.duration_seconds = Some((end - self.start_time).num_seconds());
        }
    }

    pub fn current_duration(&self) -> i64 {
        match self.end_time {
            Some(end) => (end - self.start_time).num_seconds(),
            None => (Utc::now() - self.start_time).num_seconds(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetStatus {
    pub daily_allowance_minutes: i32,
    pub used_today_minutes: i32,
    pub remaining_today_minutes: i32,
    pub rollover_minutes: i32,
    pub earned_minutes: i32,
    pub total_available_minutes: i32,
}

impl BudgetStatus {
    pub fn new(daily_allowance: i32) -> Self {
        Self {
            daily_allowance_minutes: daily_allowance,
            used_today_minutes: 0,
            remaining_today_minutes: daily_allowance,
            rollover_minutes: 0,
            earned_minutes: 0,
            total_available_minutes: daily_allowance,
        }
    }

    pub fn update_usage(&mut self, used_minutes: i32) {
        self.used_today_minutes = used_minutes;
        self.total_available_minutes = self.daily_allowance_minutes + self.rollover_minutes + self.earned_minutes;
        self.remaining_today_minutes = (self.total_available_minutes - used_minutes).max(0);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningActivity {
    pub id: Option<String>,
    pub activity_type: String, // "coding", "reading", "course", etc.
    pub description: String,
    pub duration_minutes: i32,
    pub earned_gaming_minutes: i32,
    pub timestamp: DateTime<Utc>,
}

impl LearningActivity {
    pub fn new(activity_type: String, description: String, duration_minutes: i32) -> Self {
        // Different learning types earn different rates
        let earned_gaming_minutes = match activity_type.as_str() {
            "coding" => duration_minutes / 4,      // 1:4 ratio (15 min gaming per hour)
            "reading" => duration_minutes / 6,     // 1:6 ratio (10 min gaming per hour)
            "course" => duration_minutes / 4,      // 1:4 ratio
            "exercise" => duration_minutes / 3,    // 1:3 ratio (20 min gaming per hour)
            _ => duration_minutes / 5,             // Default 1:5 ratio
        };

        Self {
            id: Some(uuid::Uuid::new_v4().to_string()),
            activity_type,
            description,
            duration_minutes,
            earned_gaming_minutes,
            timestamp: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameConfig {
    pub process_name: String,
    pub display_name: String,
    pub is_monitored: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub daily_allowance_minutes: i32,
    pub rollover_days: i32,
    pub notifications_enabled: bool,
    pub warning_threshold_minutes: i32,
}