use sysinfo::{System, SystemExt, ProcessExt};
use std::collections::HashMap;
use log::info;

use crate::models::GameSession;

pub struct GameMonitor {
    system: System,
    active_sessions: Vec<GameSession>, // Changed from single session to multiple
    completed_sessions: Vec<GameSession>, // Queue of completed sessions
    known_games: HashMap<String, String>, // process_name -> display_name
    blacklisted_processes: Vec<String>, // Processes to ignore
    is_paused: bool,
}

impl GameMonitor {
    pub fn new() -> Self {
        let mut monitor = Self {
            system: System::new_all(),
            active_sessions: Vec::new(),
            completed_sessions: Vec::new(),
            known_games: HashMap::new(),
            blacklisted_processes: Vec::new(),
            is_paused: false,
        };

        // Initialize with common gaming processes
        monitor.add_known_games();
        monitor.add_blacklisted_processes();
        monitor
    }

    fn add_known_games(&mut self) {
        // Steam games
        self.known_games.insert("steam.exe".to_string(), "Steam".to_string());

        // Popular games and launchers
        let games = vec![
            ("League of Legends.exe", "League of Legends"),
            ("RiotClientServices.exe", "Riot Games"),
            ("Valorant.exe", "Valorant"),
            ("csgo.exe", "Counter-Strike: Global Offensive"),
            ("dota2.exe", "Dota 2"),
            ("RocketLeague.exe", "Rocket League"),
            ("destiny2.exe", "Destiny 2"),
            ("overwatch.exe", "Overwatch"),
            ("wow.exe", "World of Warcraft"),
            ("minecraft.exe", "Minecraft"),
            ("epicgameslauncher.exe", "Epic Games Launcher"),
            ("battle.net.exe", "Battle.net"),
            ("origin.exe", "EA Origin"),
            ("uplay.exe", "Ubisoft Connect"),
        ];

        for (process, display) in games {
            self.known_games.insert(process.to_string(), display.to_string());
        }
    }

    fn add_blacklisted_processes(&mut self) {
        // Steam software/tools that aren't games
        let blacklist = vec![
            "wallpaper32.exe",
            "wallpaper64.exe",
            "steamwebhelper.exe",
            "steamerrorreporter.exe",
            "crashhandler.exe",
            "steam.exe", // Steam client itself
        ];

        for process in blacklist {
            self.blacklisted_processes.push(process.to_string());
        }
    }

    pub fn update(&mut self) {
        if self.is_paused {
            return;
        }

        // Refresh system info to get current processes
        self.system.refresh_processes();

        let detected_games = self.find_all_gaming_processes();
        info!("Update cycle - Found {} games", detected_games.len());

        // Get currently running process names
        let running_processes: Vec<String> = detected_games.iter()
            .map(|(process_name, _)| process_name.clone())
            .collect();

        // End sessions for games that are no longer running
        let mut sessions_to_end = Vec::new();
        for (index, session) in self.active_sessions.iter().enumerate() {
            if !running_processes.contains(&session.process_name) {
                sessions_to_end.push(index);
            }
        }

        // End sessions in reverse order to maintain indices
        for &index in sessions_to_end.iter().rev() {
            let mut session = self.active_sessions.remove(index);
            session.end_session();

            // Mark as concurrent if there were other active sessions
            if self.active_sessions.len() > 0 || sessions_to_end.len() > 1 {
                session.is_concurrent = true;
                session.concurrent_session_ids = self.get_concurrent_session_ids(&session);
            }

            info!("Game session ended: {} ({}m {}s){}",
                  session.game_name,
                  session.duration_seconds.unwrap_or(0) / 60,
                  session.duration_seconds.unwrap_or(0) % 60,
                  if session.is_concurrent { " [CONCURRENT]" } else { "" });

            self.completed_sessions.push(session);
        }

        // Start new sessions for newly detected games
        for (process_name, display_name) in detected_games {
            let already_tracking = self.active_sessions.iter()
                .any(|session| session.process_name == process_name);

            if !already_tracking {
                info!("New game detected and started: {}{}", display_name,
                      if self.active_sessions.len() > 0 { " [CONCURRENT]" } else { "" });

                let mut new_session = GameSession::new(display_name, process_name);

                // Mark as concurrent if other sessions are active
                if !self.active_sessions.is_empty() {
                    new_session.is_concurrent = true;
                    new_session.concurrent_session_ids = self.get_active_session_ids();

                    // Update existing sessions to mark them as concurrent too
                    for session in &mut self.active_sessions {
                        session.is_concurrent = true;
                        session.concurrent_session_ids.push(new_session.id.as_ref().unwrap().clone());
                    }
                }

                self.active_sessions.push(new_session);
            }
        }
    }

    fn find_all_gaming_processes(&self) -> Vec<(String, String)> {
        let mut gaming_processes = Vec::new();

        for (_pid, process) in self.system.processes() {
            let process_name = process.name();

            // Skip blacklisted processes
            if self.blacklisted_processes.contains(&process_name.to_string()) {
                continue;
            }

            // Check if it's a known gaming process
            if let Some(display_name) = self.known_games.get(process_name) {
                gaming_processes.push((process_name.to_string(), display_name.clone()));
            }
            // Check for Steam games (they often have random exe names)
            else if self.is_likely_steam_game(process) {
                let display_name = self.get_steam_game_name(process_name);
                gaming_processes.push((process_name.to_string(), display_name));
            }
        }

        info!("Found {} gaming processes: {:?}", gaming_processes.len(),
              gaming_processes.iter().map(|(_, name)| name).collect::<Vec<_>>());

        gaming_processes
    }

    fn get_active_session_ids(&self) -> Vec<String> {
        self.active_sessions.iter()
            .filter_map(|session| session.id.clone())
            .collect()
    }

    fn get_concurrent_session_ids(&self, current_session: &GameSession) -> Vec<String> {
        self.active_sessions.iter()
            .filter_map(|session| {
                if session.id != current_session.id {
                    session.id.clone()
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn get_active_sessions(&self) -> Vec<GameSession> {
        self.active_sessions.clone()
    }

    pub fn get_completed_sessions(&mut self) -> Vec<GameSession> {
        let completed = self.completed_sessions.clone();
        self.completed_sessions.clear();
        completed
    }

    pub fn get_total_active_time(&self) -> i64 {
        if self.active_sessions.is_empty() {
            return 0;
        }

        // Find the session that started earliest (this determines total concurrent time)
        let earliest_start = self.active_sessions.iter()
            .map(|session| session.start_time)
            .min()
            .unwrap_or(chrono::Utc::now());

        (chrono::Utc::now() - earliest_start).num_seconds()
    }

    fn is_likely_steam_game(&self, process: &sysinfo::Process) -> bool {
        // Check if process is running from Steam directory
        let exe_path = process.exe();
        if let Some(path_str) = exe_path.to_str() {
            return path_str.contains("steamapps") ||
                   path_str.contains("Steam\\steamapps") ||
                   path_str.contains("Steam/steamapps");
        }
        false
    }

    fn get_steam_game_name(&self, process_name: &str) -> String {
        // Try to extract a readable name from the process
        let name = process_name
            .trim_end_matches(".exe")
            .replace("_", " ")
            .replace("-", " ");

        // Capitalize words
        name.split_whitespace()
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    pub fn get_detected_games(&self) -> Vec<String> {
        self.known_games.values().cloned().collect()
    }

    pub fn pause(&mut self) {
        self.is_paused = true;
        info!("Game monitoring paused");
    }

    pub fn resume(&mut self) {
        self.is_paused = false;
        info!("Game monitoring resumed");
    }

    pub fn add_game(&mut self, process_name: String, display_name: String) {
        self.known_games.insert(process_name, display_name);
    }

    pub fn close_detected_games(&self) -> Vec<String> {
        let mut closed_games = Vec::new();

        for (_pid, process) in self.system.processes() {
            let process_name = process.name();

            // Skip blacklisted processes
            if self.blacklisted_processes.contains(&process_name.to_string()) {
                continue;
            }

            // Check if it's a gaming process we should close
            let should_close = self.known_games.contains_key(process_name) ||
                               self.is_likely_steam_game(process);

            if should_close {
                let display_name = self.known_games.get(process_name)
                    .cloned()
                    .unwrap_or_else(|| self.get_steam_game_name(process_name));

                // Attempt to close the process
                if process.kill() {
                    info!("Closed game: {}", display_name);
                    closed_games.push(display_name);
                } else {
                    info!("Failed to close game: {}", display_name);
                }
            }
        }

        closed_games
    }
}