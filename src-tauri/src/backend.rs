//! Startet das Python-Backend (Sidecar) und spricht mit ihm über 127.0.0.1.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct Backend {
    pub port: u16,
    pub token: String,
    child: Mutex<Option<Child>>,
}

fn random_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Entwicklung: SYD_BACKEND_CMD="python -m syd.main" (Wörter durch Leerzeichen getrennt).
/// Auslieferung: <Ressourcen>/backend/syd-backend(.exe).
fn command(resource_dir: &Path) -> Result<Command, String> {
    if let Ok(cmd) = std::env::var("SYD_BACKEND_CMD") {
        let mut parts = cmd.split_whitespace();
        let program = parts.next().ok_or("SYD_BACKEND_CMD ist leer")?;
        let mut c = Command::new(program);
        c.args(parts);
        return Ok(c);
    }
    let name = if cfg!(windows) { "syd-backend.exe" } else { "syd-backend" };
    let exe = resource_dir.join("backend").join(name);
    if !exe.exists() {
        return Err(format!("Das Backend wurde nicht gefunden: {}", exe.display()));
    }
    Ok(Command::new(exe))
}

impl Backend {
    pub fn start(resource_dir: &Path) -> Result<Backend, String> {
        let token = random_token();
        let mut cmd = command(resource_dir)?;
        cmd.arg("--no-browser")
            .arg("--parent-pid")
            .arg(std::process::id().to_string())
            .env("SYD_TOKEN", &token)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Das Backend konnte nicht gestartet werden: {e}"))?;
        let stdout = child.stdout.take().ok_or("Keine Ausgabe vom Backend")?;

        let (tx, rx) = mpsc::channel::<u16>();
        std::thread::spawn(move || {
            let mut sent = false;
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if !sent {
                    if let Some(json) = line.strip_prefix("SYD_READY ") {
                        let port = serde_json::from_str::<serde_json::Value>(json)
                            .ok()
                            .and_then(|v| v["port"].as_u64());
                        if let Some(p) = port {
                            let _ = tx.send(p as u16);
                            sent = true;
                        }
                    }
                }
                // weiterlesen, damit der Pipe-Puffer nie volläuft
            }
        });

        match rx.recv_timeout(Duration::from_secs(90)) {
            Ok(port) => Ok(Backend {
                port,
                token,
                child: Mutex::new(Some(child)),
            }),
            Err(_) => {
                let _ = child.kill();
                Err("Das Backend ist nicht rechtzeitig gestartet.".into())
            }
        }
    }

    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/#token={}", self.port, self.token)
    }

    /// Minimaler HTTP/1.1-Aufruf; mehr braucht die Hülle nicht (nur lokal, nur kleine JSON-Antworten).
    pub fn request(&self, method: &str, path: &str) -> Result<(u16, String), String> {
        let addr: SocketAddr = ([127, 0, 0, 1], self.port).into();
        let mut s = TcpStream::connect_timeout(&addr, Duration::from_secs(3)).map_err(|e| e.to_string())?;
        s.set_read_timeout(Some(Duration::from_secs(10))).ok();
        s.set_write_timeout(Some(Duration::from_secs(5))).ok();
        let req = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nX-SYD-Token: {}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}",
            self.port, self.token
        );
        s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
        let mut raw = Vec::new();
        s.read_to_end(&mut raw).map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&raw).into_owned();
        let (head, body) = text.split_once("\r\n\r\n").ok_or("Ungültige Antwort")?;
        let status = head
            .split_whitespace()
            .nth(1)
            .and_then(|s| s.parse::<u16>().ok())
            .ok_or("Ungültiger Status")?;
        Ok((status, body.to_string()))
    }

    /// Beendet das Backend zuerst sauber (Datei schließen, Sperrdateien freigeben), dann hart.
    pub fn shutdown(&self) {
        let _ = self.request("POST", "/api/shutdown");
        let Some(mut child) = self.child.lock().ok().and_then(|mut g| g.take()) else {
            return;
        };
        let deadline = Instant::now() + Duration::from_secs(8);
        while Instant::now() < deadline {
            match child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}
