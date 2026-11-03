"""React desktop shell with a compatibility interface for the Jarvis engine."""

from __future__ import annotations

import threading
import time
import os
from collections import deque
from pathlib import Path

import psutil
import webview

from app_config import has_gemini_api_key, load_app_config, save_app_config
from actions.weather import get_weather_summary
from ui import SoundManager, VOICES


BASE_DIR = Path(__file__).resolve().parent
FRONTEND_FILE = BASE_DIR / "ui_assets" / "dist" / "index.html"


class _WindowHost:
    """Keep the root.mainloop() contract used by main.py."""

    def __init__(self, owner: "JarvisUI"):
        self.owner = owner

    def mainloop(self):
        dev_url = os.environ.get("JARVIS_UI_DEV_URL", "").strip()
        if not dev_url and not FRONTEND_FILE.is_file():
            raise FileNotFoundError(
                "React arayüzü bulunamadı. Kurulum paketindeki ui_assets/dist klasörünü kontrol edin."
            )
        self.owner.window = webview.create_window(
            title="J.A.R.V.I.S",
            url=dev_url or str(FRONTEND_FILE.relative_to(BASE_DIR)),
            js_api=self.owner,
            width=1440,
            height=920,
            min_size=(980, 660),
            background_color="#07111f",
            text_select=True,
        )
        webview.start(gui="edgechromium")

    def after(self, delay_ms: int, callback, *args):
        timer = threading.Timer(max(0, delay_ms) / 1000, callback, args=args)
        timer.daemon = True
        timer.start()
        return timer


class JarvisUI:
    """Expose the old JarvisUI methods while React owns all presentation."""

    def __init__(self):
        config = load_app_config()
        self.root = _WindowHost(self)
        self.window = None
        self.sound = SoundManager()
        self.muted = False
        self.paused = False
        self._state = "INITIALISING"
        self._state_lock = threading.RLock()
        self._api_key_ready = has_gemini_api_key()
        self._api_key_event = threading.Event()
        if self._api_key_ready:
            self._api_key_event.set()
        self._started_at = time.time()
        self._current_voice = str(config.get("voice", "Charon") or "Charon")
        if self._current_voice not in VOICES:
            self._current_voice = VOICES[0]
        self._sfx_on = False
        self._volume = self.sound.get_volume()
        self._focus_panel = ""
        self._focus_until = 0.0
        self._user_active_until = 0.0
        self._logs = deque(maxlen=160)
        self._debug_entries = deque(maxlen=160)
        self._weather = {"city": "İstanbul", "temperature": "--", "details": ["Hava durumu yükleniyor"]}
        self._log_id = 0
        self._effects_active = None
        self._closing = False
        threading.Thread(target=self._refresh_weather, daemon=True, name="JarvisWeather").start()

        self.on_text_command = None
        self.on_pause_toggle = None
        self.on_stop_command = None
        self.on_voice_change = None
        self.on_effects_state_change = None

    # ---------- State consumed by React ----------
    def get_state(self):
        with self._state_lock:
            now = time.time()
            try:
                stats = {
                    "cpu": psutil.cpu_percent(),
                    "ram": psutil.virtual_memory().percent,
                    "disk": psutil.disk_usage("C:\\").percent,
                }
                battery = psutil.sensors_battery()
                stats["battery"] = battery.percent if battery else None
            except Exception:
                stats = {"cpu": 0, "ram": 0, "disk": 0, "battery": None}

            return {
                "state": "PAUSED" if self.paused else self._state,
                "muted": self.muted,
                "paused": self.paused,
                "apiReady": self._api_key_ready,
                "youtubeReady": bool(str(load_app_config().get("youtube_api_key", "") or "").strip()),
                "voice": self._current_voice,
                "voices": list(VOICES),
                "effectsEnabled": self._sfx_on,
                "volume": self._volume,
                "uptime": max(0, int(now - self._started_at)),
                "stats": stats,
                "weather": dict(self._weather),
                "focusPanel": self._focus_panel if self._focus_until > now else "",
                "userActive": self._user_active_until > now,
                "logs": list(self._logs),
                "debugEntries": list(self._debug_entries),
                "capabilities": dict(load_app_config().get("capabilities", {}) or {}),
                "uiPreferences": dict(load_app_config().get("ui_preferences", {}) or {}),
            }

    # ---------- React actions ----------
    def send_text(self, text: str):
        clean = str(text or "").strip()
        if not clean:
            return {"ok": False, "error": "Mesaj boş olamaz."}
        if self.paused:
            self.write_log("SYS: Jarvis duraklatılmış durumda. Önce devam et.")
            return {"ok": False, "error": "Jarvis duraklatıldı."}
        if self.on_text_command:
            threading.Thread(target=self.on_text_command, args=(clean,), daemon=True).start()
            return {"ok": True}
        return {"ok": False, "error": "Jarvis henüz hazır değil."}

    def toggle_mute(self):
        self.muted = not self.muted
        self.write_log("SYS: Mikrofon kapatıldı." if self.muted else "SYS: Mikrofon açıldı.")
        self._sync_sound_state()
        return self.muted

    def toggle_pause(self):
        self.paused = not self.paused
        if self.paused:
            self.set_state("PAUSED")
            self.write_log("SYS: Jarvis duraklatıldı.")
        else:
            self.set_state("THINKING")
            self.write_log("SYS: Jarvis devam ediyor.")
        self._sync_sound_state()
        if self.on_pause_toggle:
            threading.Thread(target=self.on_pause_toggle, args=(self.paused,), daemon=True).start()
        return self.paused

    def set_voice(self, voice: str):
        if voice not in VOICES:
            return {"ok": False, "error": "Geçersiz ses profili."}
        self._current_voice = voice
        save_app_config({"voice": voice})
        if self.on_voice_change:
            threading.Thread(target=self.on_voice_change, args=(voice,), daemon=True).start()
        return {"ok": True, "voice": voice}

    def toggle_effects(self):
        self._sfx_on = not self._sfx_on
        self._sync_sound_state()
        return self._sfx_on

    def set_volume(self, value):
        try:
            self._volume = max(0.0, min(1.0, float(value)))
        except (TypeError, ValueError):
            return {"ok": False, "error": "Ses düzeyi geçersiz."}
        self.sound.set_volume(self._volume)
        return {"ok": True, "volume": self._volume}

    def save_api_settings(self, gemini_key: str, youtube_key: str = "", youtube_handle: str = ""):
        key = str(gemini_key or "").strip()
        if not key:
            key = str(load_app_config().get("gemini_api_key", "") or "").strip()
        if not key:
            return {"ok": False, "error": "Gemini API anahtarını gir."}
        updates = {
            "gemini_api_key": key,
            "voice": self._current_voice,
        }
        if str(youtube_key or "").strip():
            updates["youtube_api_key"] = str(youtube_key).strip()
        if str(youtube_handle or "").strip():
            updates["youtube_channel_handle"] = str(youtube_handle).strip()
        save_app_config(updates)
        was_ready = self._api_key_ready
        self._api_key_ready = True
        self._api_key_event.set()
        self.write_log("SYS: API ayarları güncellendi." if was_ready else "SYS: Jarvis hazır. Dinliyorum...")
        if not was_ready:
            self.set_state("LISTENING")
        return {"ok": True}

    def save_capabilities(self, capabilities: dict):
        allowed = {
            "system", "browser", "weather", "calendar", "reminders", "whatsapp",
            "media", "screen", "youtube", "memory",
        }
        current = dict(load_app_config().get("capabilities", {}) or {})
        for name, enabled in (capabilities or {}).items():
            if name in allowed and isinstance(enabled, bool):
                current[name] = enabled
        save_app_config({"capabilities": current})
        return {"ok": True, "capabilities": current}

    def save_ui_preferences(self, theme: str, motion: str):
        themes = {"stark", "graphite", "arc"}
        motions = {"full", "reduced", "off"}
        if theme not in themes or motion not in motions:
            return {"ok": False, "error": "Görünüm ayarları geçersiz."}
        preferences = {"theme": theme, "motion": motion}
        save_app_config({"ui_preferences": preferences})
        return {"ok": True, "preferences": preferences}

    def set_settings_open(self, is_open: bool):
        return bool(is_open)

    # ---------- Compatibility methods called by JarvisLive ----------
    def wait_for_api_key(self):
        self._api_key_event.wait()

    def set_state(self, state: str):
        previous = self._state
        self._state = str(state or "LISTENING")
        if self._state == "THINKING":
            self.sound.start_thinking()
        elif previous == "THINKING":
            self.sound.stop_thinking()
        if self._state == "ERROR" and previous != "ERROR":
            self.sound.play_error()

    def mark_user_activity(self, active: bool = True):
        self._user_active_until = time.time() + (0.9 if active else 0)

    def write_log(self, text: str):
        message = str(text or "").strip()
        if not message:
            return
        lower = message.lower()
        if lower.startswith(("siz:", "you:")):
            self.mark_user_activity(True)
            self.set_state("THINKING")
        elif lower.startswith(("err:",)) or "error" in lower:
            self.set_state("ERROR")
            self.write_debug(message, level="ERROR")

        if lower.startswith(("siz:", "you:")):
            role = "user"
        elif lower.startswith(("jarvis:", "ai:")):
            role = "assistant"
        elif lower.startswith(("err:",)) or "error" in lower:
            role = "error"
        else:
            role = "system"

        with self._state_lock:
            self._log_id += 1
            self._logs.append({"id": self._log_id, "role": role, "text": message, "time": time.strftime("%H:%M")})

    def write_debug(self, text: str, level: str = "INFO"):
        clean = " ".join(str(text or "").split())
        if not clean:
            return
        with self._state_lock:
            self._debug_entries.append({
                "level": (level or "INFO").upper(),
                "text": clean,
                "time": time.strftime("%H:%M:%S"),
            })

    def play_success_sfx(self):
        self.sound.play_success()

    def play_error_sfx(self):
        self.sound.play_error()

    def focus_panel(self, section: str, duration_ms: int = 4200):
        self._focus_panel = (section or "").strip().lower()
        self._focus_until = time.time() + max(0.8, duration_ms / 1000)

    def wake_up(self):
        if self.window:
            try:
                self.window.show()
                self.window.restore()
            except Exception:
                pass

    def effects_enabled(self) -> bool:
        return self._sfx_on and not self.paused

    def get_effects_volume(self) -> float:
        return self._volume

    def _sync_sound_state(self):
        enabled = self._sfx_on and not self.paused
        self.sound.set_enabled(enabled)
        if enabled != self._effects_active:
            self._effects_active = enabled
            if self.on_effects_state_change:
                threading.Thread(
                    target=self.on_effects_state_change,
                    args=(enabled,),
                    daemon=True,
                ).start()

    def _refresh_weather(self):
        try:
            raw = get_weather_summary("Istanbul")
            if " için hava durumu:" in raw:
                city, body = raw.split(" için hava durumu:", 1)
                details = [part.strip(" .") for part in body.split(",") if part.strip(" .")]
                temperature = details[0].replace(" derece", "°C") if details else "--"
                self._weather = {
                    "city": city.strip().title(),
                    "temperature": temperature,
                    "details": details[1:] or ["Anlık veri hazır"],
                }
            else:
                self._weather = {"city": "İstanbul", "temperature": "--", "details": ["Hava durumu alınamadı"]}
        except Exception:
            self._weather = {"city": "İstanbul", "temperature": "--", "details": ["Hava durumu alınamadı"]}

    def shutdown(self):
        if self._closing:
            return
        self._closing = True
        self.sound.stop_all()
        if self.window:
            try:
                self.window.destroy()
            except Exception:
                pass
