use std::sync::Arc;
use std::time::Duration;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_notification::NotificationExt;

mod backend;
use backend::Backend;

const MAIN: &str = "main";

/// Zeigt das Fenster oder legt es an. Das Fenster lädt die Oberfläche direkt vom lokalen Backend.
fn show_main(app: &AppHandle, backend: &Backend) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let Ok(url) = backend.url().parse() else { return };
    let built = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::External(url))
        .title("Save Your Documents")
        .inner_size(1280.0, 860.0)
        .min_inner_size(800.0, 600.0)
        .build();
    if let Ok(w) = built {
        let _ = w.set_focus();
    }
}

fn german_date(iso: &str) -> String {
    let p: Vec<&str> = iso.split('-').collect();
    if p.len() == 3 {
        format!("{}.{}.{}", p[2], p[1], p[0])
    } else {
        iso.to_string()
    }
}

/// Holt jede Minute neue Erinnerungen vom Backend und zeigt sie als Benachrichtigung.
/// Ist das Archiv gesperrt, antwortet das Backend mit 423, dann wird später erneut gefragt.
fn spawn_reminder_loop(app: AppHandle, backend: Arc<Backend>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60));
        let Ok((200, body)) = backend.request("GET", "/api/reminders/notifications") else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) else { continue };
        for item in v["items"].as_array().cloned().unwrap_or_default() {
            let firma = item["company_name"].as_str().unwrap_or("Dokument");
            let art = item["type"].as_str().unwrap_or("Frist");
            let due = german_date(item["due_date"].as_str().unwrap_or(""));
            let _ = app
                .notification()
                .builder()
                .title(format!("Erinnerung: {firma}"))
                .body(format!("{art} am {due}"))
                .show();
        }
    });
}

fn setup_tray(app: &AppHandle, backend: Arc<Backend>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Save Your Documents öffnen", true, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let auto = CheckMenuItem::with_id(app, "autostart", "Mit Windows starten", true, autostart_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &auto, &PredefinedMenuItem::separator(app)?, &quit])?;

    let click_backend = backend.clone();
    let menu_backend = backend.clone();
    let mut builder = TrayIconBuilder::with_id("tray")
        .tooltip("Save Your Documents: empfängt Dokumente und erinnert an Fristen")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle(), &click_backend);
            }
        })
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => show_main(app, &menu_backend),
            "autostart" => {
                let launch = app.autolaunch();
                let _ = if launch.is_enabled().unwrap_or(false) { launch.disable() } else { launch.enable() };
            }
            "quit" => {
                menu_backend.shutdown();
                app.exit(0);
            }
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn run() {
    let started_minimized = std::env::args().any(|a| a == "--minimized");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Zweiter Start: nur das vorhandene Fenster zeigen, kein zweiter Backend-Prozess
            if let Some(b) = app.try_state::<Arc<Backend>>() {
                show_main(app, &b);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            // Fenster schließen = in den Tray, das Programm läuft weiter
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            let resource_dir = app.path().resource_dir()?;
            let backend = match Backend::start(&resource_dir) {
                Ok(b) => Arc::new(b),
                Err(msg) => {
                    eprintln!("{msg}");
                    return Err(msg.into());
                }
            };
            app.manage(backend.clone());
            setup_tray(app.handle(), backend.clone())?;
            spawn_reminder_loop(app.handle().clone(), backend.clone());

            // Beim allerersten Start Autostart einschalten (Dauerbetrieb ist Teil des Konzepts)
            if let Ok(dir) = app.path().app_data_dir() {
                let marker = dir.join("autostart-eingerichtet");
                if !marker.exists() {
                    let _ = std::fs::create_dir_all(&dir);
                    let _ = app.autolaunch().enable();
                    let _ = std::fs::write(marker, b"1");
                }
            }
            if !started_minimized {
                show_main(app.handle(), &backend);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Save Your Documents konnte nicht gestartet werden");

    app.run(|handle, event| match event {
        // Läuft nur noch im Tray weiter, wenn alle Fenster zu sind
        RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(),
        RunEvent::Exit => {
            if let Some(b) = handle.try_state::<Arc<Backend>>() {
                b.shutdown();
            }
        }
        _ => {}
    });
}
