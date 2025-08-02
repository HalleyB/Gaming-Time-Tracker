// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod game_monitor;
mod models;

use std::sync::{Arc, Mutex};
use tauri::{State, Manager, Window};
use log::{info, error};
use notify_rust::Notification;

use crate::database::Database;
use crate::game_monitor::GameMonitor;
use crate::models::{GameSession, BudgetStatus, LearningActivity};

// Shared application state
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub monitor: Arc<Mutex<GameMonitor>>,
}

#[tauri::command]
async fn show_game_overlay(
    _window: Window,
    title: String,
    message: String,
    notification_type: String,
    remaining_minutes: Option<i32>,
) -> Result<(), String> {
    info!("Creating game overlay notification: {}", title);

    use tauri::api::dialog::{MessageDialogBuilder, MessageDialogKind};

    let dialog_kind = match notification_type.as_str() {
        "warning" => MessageDialogKind::Warning,
        "critical" | "exceeded" => MessageDialogKind::Error,
        _ => MessageDialogKind::Info,
    };

    let full_message = if let Some(minutes) = remaining_minutes {
        if minutes > 0 {
            format!("{}\n\n⏰ {} minute{} remaining", message, minutes, if minutes == 1 { "" } else { "s" })
        } else {
            message.clone()
        }
    } else {
        message.clone()
    };

    MessageDialogBuilder::new(&title, &full_message)
        .kind(dialog_kind)
        .show(|result| {
            info!("Dialog closed: {:?}", result);
        });

    if let Err(e) = show_system_notification(title.clone(), message, notification_type).await {
        error!("Failed to show system notification: {}", e);
    }

    Ok(())
}

#[tauri::command]
async fn show_simple_overlay(
    app_handle: tauri::AppHandle,
    title: String,
    message: String,
    notification_type: String,
) -> Result<(), String> {
    info!("Creating simple overlay: {}", title);

    let window_id = format!("overlay-{}", chrono::Utc::now().timestamp_millis());

    let html_content = format!(r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #2d3748 0%, #4a5568 100%);
            color: white;
            margin: 0;
            padding: 40px;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            box-sizing: border-box;
        }}

        .container {{
            background: rgba(0, 0, 0, 0.8);
            padding: 40px;
            border-radius: 15px;
            border: 3px solid {border_color};
            max-width: 500px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        }}

        .icon {{
            font-size: 60px;
            margin-bottom: 20px;
            animation: pulse 2s infinite;
        }}

        @keyframes pulse {{
            0%, 100% {{ transform: scale(1); }}
            50% {{ transform: scale(1.1); }}
        }}

        .title {{
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 15px;
            color: {text_color};
        }}

        .message {{
            font-size: 18px;
            margin-bottom: 30px;
            line-height: 1.4;
        }}

        .buttons {{
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }}

        .button {{
            padding: 15px 30px;
            font-size: 16px;
            font-weight: bold;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            color: white;
        }}

        .button:hover {{
            transform: translateY(-2px);
        }}

        .close-btn {{
            background: #dc2626;
        }}

        .close-btn:hover {{
            background: #b91c1c;
        }}

        .ok-btn {{
            background: #7c3aed;
        }}

        .ok-btn:hover {{
            background: #6d28d9;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">{icon}</div>
        <div class="title">{title_content}</div>
        <div class="message">{message}</div>
        <div class="buttons">
            <button class="button ok-btn" onclick="acknowledgeAndClose()">👍 Got It</button>
            <div style="margin-top: 15px; font-size: 14px; color: #ccc;">
                Games will be closed automatically when time expires
            </div>
        </div>
    </div>

    <script>
        console.log('Overlay loaded successfully!');

        function acknowledgeAndClose() {{
            console.log('Acknowledge button clicked - just hiding overlay');

            // Simple approach: just hide the overlay content
            // Don't try to close the window, just make it invisible
            document.body.innerHTML = '<div style="color: white; text-align: center; padding: 50px; font-family: Arial;">Overlay dismissed. You can close this window manually if needed.</div>';
            document.title = 'Gaming Time Warning - Dismissed';

            // Try to minimize the window so it's not in the way
            try {{
                window.moveTo(-1000, -1000);
                window.resizeTo(300, 100);
                window.blur();
            }} catch (e) {{
                console.log('Could not minimize window');
            }}
        }}

        document.addEventListener('keydown', function(e) {{
            if (e.key === 'Escape') {{
                acknowledgeAndClose();
            }}
        }});

        window.focus();
        console.log('Overlay ready - single button approach');
    </script>
</body>
</html>
    "#,
    title = title,
    border_color = match notification_type.as_str() {
        "warning" => "#fbbf24",
        "critical" => "#f97316",
        "exceeded" => "#dc2626",
        _ => "#6b7280",
    },
    text_color = match notification_type.as_str() {
        "warning" => "#fbbf24",
        "critical" => "#f97316",
        "exceeded" => "#dc2626",
        _ => "#6b7280",
    },
    icon = match notification_type.as_str() {
        "warning" => "⚠️",
        "critical" => "🚨",
        "exceeded" => "❌",
        _ => "ℹ️",
    },
    title_content = title,
    message = message
    );

    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(format!("{}.html", window_id));

    std::fs::write(&file_path, html_content).map_err(|e| format!("Failed to write HTML file: {}", e))?;

    let file_url = format!("file://{}", file_path.to_string_lossy());

    match tauri::WindowBuilder::new(
        &app_handle,
        &window_id,
        tauri::WindowUrl::External(file_url.parse().map_err(|e| format!("URL parse error: {}", e))?)
    )
    .title("🎮 Gaming Time Warning")
    .inner_size(600.0, 400.0)
    .center()
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(true)
    .decorations(true)
    .always_on_top(true)
    .skip_taskbar(false)
    .fullscreen(false)
    .focused(true)
    .visible(true)
    .build() {
        Ok(_window) => {
            info!("Overlay window created successfully: {}", window_id);

            let file_path_clone = file_path.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                let _ = std::fs::remove_file(file_path_clone);
            });

            Ok(())
        }
        Err(e) => {
            error!("Failed to create overlay window: {}", e);
            let _ = std::fs::remove_file(file_path);
            Err(format!("Failed to create overlay window: {}", e))
        }
    }
}

#[tauri::command]
async fn close_overlay_window(window: Window, window_id: String) -> Result<(), String> {
    if let Some(overlay_window) = window.app_handle().get_window(&window_id) {
        overlay_window.close().map_err(|e| e.to_string())?;
        info!("Closed overlay window: {}", window_id);
    }
    Ok(())
}

#[tauri::command]
async fn show_system_notification(
    title: String,
    message: String,
    urgency: String,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut notification = Notification::new();
        notification
            .summary(&title)
            .body(&message)
            .icon("gaming-time-tracker");

        match urgency.as_str() {
            "critical" | "exceeded" => {
                notification.timeout(0);
            }
            _ => {
                notification.timeout(5000);
            }
        }

        match notification.show() {
            Ok(_) => {
                info!("System notification sent: {}", title);
                Ok(())
            }
            Err(e) => {
                error!("Failed to send system notification: {}", e);
                Err(format!("Failed to send notification: {}", e))
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use notify_rust::Urgency;

        let urgency_level = match urgency.as_str() {
            "warning" => Urgency::Normal,
            "critical" => Urgency::Critical,
            "exceeded" => Urgency::Critical,
            _ => Urgency::Normal,
        };

        match Notification::new()
            .summary(&title)
            .body(&message)
            .urgency(urgency_level)
            .show()
        {
            Ok(_) => {
                info!("System notification sent: {}", title);
                Ok(())
            }
            Err(e) => {
                error!("Failed to send system notification: {}", e);
                Err(format!("Failed to send notification: {}", e))
            }
        }
    }
}

#[tauri::command]
async fn reset_today_sessions(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.reset_today_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_budget_minutes(state: State<'_, AppState>, minutes: i32) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_debug_earned_minutes(minutes).map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_budget_minutes(state: State<'_, AppState>, minutes: i32) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_debug_earned_minutes(-minutes).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_fake_playtime(state: State<'_, AppState>, minutes: i32) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_fake_gaming_session(minutes).map_err(|e| e.to_string())
}

#[tauri::command]
async fn close_all_games(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    Ok(monitor.close_detected_games())
}

#[tauri::command]
async fn get_current_sessions(state: State<'_, AppState>) -> Result<Vec<GameSession>, String> {
    let monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    Ok(monitor.get_active_sessions())
}

#[tauri::command]
async fn get_total_active_time(state: State<'_, AppState>) -> Result<i64, String> {
    let monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    Ok(monitor.get_total_active_time())
}

#[tauri::command]
async fn get_realtime_budget_status(state: State<'_, AppState>) -> Result<BudgetStatus, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let monitor = state.monitor.lock().map_err(|e| e.to_string())?;

    let mut budget = db.get_budget_status().map_err(|e| e.to_string())?;

    let active_time_minutes = (monitor.get_total_active_time() / 60) as i32;
    budget.update_usage(budget.used_today_minutes + active_time_minutes);

    Ok(budget)
}

#[tauri::command]
async fn get_budget_status(state: State<'_, AppState>) -> Result<BudgetStatus, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_budget_status().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_recent_sessions(state: State<'_, AppState>) -> Result<Vec<GameSession>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_recent_sessions(20).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_learning_activity(
    state: State<'_, AppState>,
    activity_type: String,
    description: String,
    duration_minutes: i32,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let activity = LearningActivity::new(activity_type, description, duration_minutes);

    db.add_learning_activity(&activity).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_detected_games(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    Ok(monitor.get_detected_games())
}

#[tauri::command]
async fn pause_monitoring(state: State<'_, AppState>) -> Result<(), String> {
    let mut monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    monitor.pause();
    Ok(())
}

#[tauri::command]
async fn resume_monitoring(state: State<'_, AppState>) -> Result<(), String> {
    let mut monitor = state.monitor.lock().map_err(|e| e.to_string())?;
    monitor.resume();
    Ok(())
}

fn main() {
    env_logger::init();

    let db = Arc::new(Mutex::new(
        Database::new().expect("Failed to initialize database")
    ));

    let monitor = Arc::new(Mutex::new(GameMonitor::new()));

    let app_state = AppState {
        db: db.clone(),
        monitor: monitor.clone(),
    };

    info!("Starting Gaming Time Tracker");

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_current_sessions,
            get_total_active_time,
            get_budget_status,
            get_realtime_budget_status,
            get_recent_sessions,
            add_learning_activity,
            get_detected_games,
            pause_monitoring,
            resume_monitoring,
            reset_today_sessions,
            add_budget_minutes,
            remove_budget_minutes,
            add_fake_playtime,
            close_all_games,
            show_system_notification,
            show_game_overlay,
            show_simple_overlay,
            close_overlay_window
        ])
        .setup(move |_app| {
            let db_clone = db.clone();
            let monitor_clone = monitor.clone();

            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));

                loop {
                    interval.tick().await;

                    if let Ok(mut monitor) = monitor_clone.try_lock() {
                        monitor.update();

                        let completed_sessions = monitor.get_completed_sessions();

                        if let Ok(db) = db_clone.try_lock() {
                            for session in completed_sessions {
                                if let Err(e) = db.save_session(&session) {
                                    error!("Failed to save session: {}", e);
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}