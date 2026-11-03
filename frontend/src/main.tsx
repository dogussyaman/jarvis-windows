import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, AudioLines, Battery, Bot, Check, ChevronDown, CircleAlert, CloudSun, Cpu, HardDrive,
  History, KeyRound, MessageSquare, Mic, MicOff, Pause, Play,
  Radio, SendHorizontal, Settings2, Sparkles, Volume2, X,
} from "lucide-react";
import "./styles.css";

type LogEntry = { id: number; role: "user" | "assistant" | "system" | "error"; text: string; time: string };
type DebugEntry = { level: string; text: string; time: string };
type JarvisState = {
  state: string;
  muted: boolean;
  paused: boolean;
  apiReady: boolean;
  voice: string;
  voices: string[];
  effectsEnabled: boolean;
  volume: number;
  uptime: number;
  stats: { cpu: number; ram: number; disk: number; battery: number | null };
  weather: { city: string; temperature: string; details: string[] };
  focusPanel: string;
  userActive: boolean;
  logs: LogEntry[];
  debugEntries: DebugEntry[];
};

type JarvisApi = {
  get_state: () => Promise<JarvisState>;
  send_text: (text: string) => Promise<{ ok: boolean; error?: string }>;
  toggle_mute: () => Promise<boolean>;
  toggle_pause: () => Promise<boolean>;
  set_voice: (voice: string) => Promise<{ ok: boolean; error?: string }>;
  toggle_effects: () => Promise<boolean>;
  set_volume: (value: number) => Promise<{ ok: boolean; error?: string }>;
  save_api_settings: (gemini: string, youtube: string, handle: string) => Promise<{ ok: boolean; error?: string }>;
};

declare global {
  interface Window { pywebview?: { api: JarvisApi } }
}

const bridge = () => window.pywebview?.api;

const statusLabels: Record<string, string> = {
  INITIALISING: "Bağlanıyor",
  THINKING: "Düşünüyor",
  LISTENING: "Dinliyor",
  SPEAKING: "Konuşuyor",
  PAUSED: "Duraklatıldı",
  ERROR: "Bağlantı bekleniyor",
};

function formatUptime(total: number) {
  const h = Math.floor(total / 3600).toString().padStart(2, "0");
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function App() {
  const [state, setState] = useState<JarvisState | null>(null);
  const [message, setMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [toast, setToast] = useState("");
  const logEnd = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const current = await bridge()?.get_state();
      if (current) setState(current);
    } catch { /* The bridge becomes available after pywebviewready. */ }
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      void refresh();
      timer = window.setInterval(() => void refresh(), 800);
    };
    if (window.pywebview) start();
    else window.addEventListener("pywebviewready", start, { once: true });
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      window.removeEventListener("pywebviewready", start);
    };
  }, [refresh]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state?.logs, showLogs]);

  const status = state?.state ?? "INITIALISING";
  const statusLabel = statusLabels[status] ?? status;
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("tr-TR", {
    weekday: "long", day: "numeric", month: "long",
  }).format(new Date()), []);

  const tell = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2800);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;
    setMessage("");
    const result = await bridge()?.send_text(value);
    if (result && !result.ok) tell(result.error ?? "Komut gönderilemedi.");
  };

  if (!state) return <div className="boot-screen"><div className="boot-mark"><Bot size={24} /></div><span>Jarvis başlatılıyor…</span></div>;

  const displayedLogs = showLogs ? state.debugEntries.map((entry, index) => ({
    id: index + 1, role: entry.level === "ERROR" ? "error" as const : "system" as const,
    text: entry.text, time: entry.time,
  })) : state.logs;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-emblem"><Bot size={22} strokeWidth={1.8} /></div>
        <div><div className="brand-name">J.A.R.V.I.S</div><div className="brand-caption">PERSONAL AI</div></div>
      </div>

      <div className="side-section-label">ÇALIŞMA ALANI</div>
      <button className={`nav-item ${!showLogs ? "active" : ""}`} onClick={() => setShowLogs(false)}>
        <MessageSquare size={17} /><span>Asistan</span><span className="nav-live" />
      </button>
      <button className={`nav-item ${showLogs ? "active" : ""}`} onClick={() => setShowLogs(true)}>
        <History size={17} /><span>Tanılama kayıtları</span>
      </button>

      <div className="sidebar-spacer" />
      <div className="connection-card">
        <div className="connection-top"><span className={`connection-dot ${state.apiReady ? "online" : "offline"}`} />
          <span>{state.apiReady ? "Gemini bağlantısı hazır" : "API anahtarı gerekli"}</span>
        </div>
        <div className="connection-caption">Sesli asistan · Windows</div>
        {!state.apiReady && <button className="connection-action" onClick={() => setSettingsOpen(true)}>Kurulumu tamamla <ChevronDown size={14} /></button>}
      </div>
      <div className="profile-row">
        <div className="avatar">D</div>
        <div className="profile-copy"><strong>Doğuş</strong><span>Bu bilgisayar</span></div>
        <button className="icon-button profile-settings" aria-label="Ayarları aç" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button>
      </div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>Jarvis</span><span className="crumb-divider">/</span><strong>{showLogs ? "Tanılama kayıtları" : "Asistan"}</strong></div>
        <div className="topbar-right"><span className="date-label">{dateLabel}</span><span className={`time-label ${state?.focusPanel === "time" ? "focus-time" : ""}`}>{new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className={`status-pill ${status.toLowerCase()}`}><i />{statusLabel}</span>
        </div>
      </header>

      {showLogs ? <section className="logs-page">
        <div className="page-heading"><div><div className="eyebrow">SİSTEM İZLEME</div><h1>Tanılama kayıtları</h1><p>Jarvis’in çalışma durumu ve hata kayıtları.</p></div><span className="log-count">{state.debugEntries.length} kayıt</span></div>
        <div className="log-table">{state.debugEntries.length ? state.debugEntries.slice().reverse().map((entry, i) => <div className="debug-row" key={`${entry.time}-${i}`}>
          <span className="debug-time">{entry.time}</span><span className={`debug-level ${entry.level.toLowerCase()}`}>{entry.level}</span><span>{entry.text}</span>
        </div>) : <div className="empty-state"><Activity size={24} /><strong>Henüz kayıt yok</strong><span>Önemli sistem olayları burada görünür.</span></div>}</div>
      </section> : <section className="dashboard">
        <div className="page-heading"><div><div className="eyebrow">KİŞİSEL ASİSTANIN</div><h1>Merhaba Doğuş<span className="heading-period">.</span></h1><p>Bugün senin için ne yapabilirim?</p></div>
          <div className="heading-actions"><div className={`weather-chip ${state.focusPanel === "weather" ? "focus-active" : ""}`}><span className="weather-icon"><CloudSun size={17} /></span><strong>{state.weather.temperature}</strong><span className="weather-copy"><b>{state.weather.city}</b><small>{state.weather.details[0] ?? "Güncel hava"}</small></span></div>
            <button className="settings-button" onClick={() => setSettingsOpen(true)}><Settings2 size={16} />Ayarlar</button></div>
        </div>

        <div className={`dashboard-grid ${state.focusPanel === "system" ? "focus-system" : ""}`}>
          <div className="primary-column">
            <section className={`core-card state-${status.toLowerCase()} ${state.userActive ? "user-active" : ""}`}>
              <div className="core-card-head"><div className="core-title"><span className="core-title-icon"><Sparkles size={15} /></span><span>JARVIS ÇEKİRDEĞİ</span></div>
                <span className="core-model"><span className="model-dot" /> GEMINI LIVE</span></div>
              <div className="orb-stage" aria-label={`Asistan durumu: ${statusLabel}`}>
                <div className="orb-halo halo-one" /><div className="orb-halo halo-two" /><div className="orb-ring ring-one" /><div className="orb-ring ring-two" />
                <div className="orb-core"><div className="orb-core-glow" /><AudioLines size={36} strokeWidth={1.35} /></div>
                <span className="orb-satellite satellite-one" /><span className="orb-satellite satellite-two" />
              </div>
              <div className="core-status"><span className="core-status-dot" />{statusLabel}</div>
              <div className="core-hint">Konuşabilir ya da aşağıya bir mesaj yazabilirsin</div>
              <div className="core-actions">
                <button className={`round-action ${state.muted ? "selected danger" : "selected"}`} onClick={() => void bridge()?.toggle_mute()}>
                  {state.muted ? <MicOff size={16} /> : <Mic size={16} />}<span>{state.muted ? "Mikrofon kapalı" : "Mikrofon açık"}</span>
                </button>
                <button className="round-action secondary" onClick={() => void bridge()?.toggle_pause()}>
                  {state.paused ? <Play size={16} /> : <Pause size={16} />}<span>{state.paused ? "Devam et" : "Duraklat"}</span>
                </button>
              </div>
            </section>

            <div className="metrics-grid">
              <MetricCard icon={<Cpu size={16} />} label="İşlemci" value={state.stats.cpu} color="cyan" />
              <MetricCard icon={<Activity size={16} />} label="Bellek" value={state.stats.ram} color="violet" />
              <MetricCard icon={<HardDrive size={16} />} label="Disk" value={state.stats.disk} color="blue" />
              <MetricCard icon={<Battery size={16} />} label="Pil" value={state.stats.battery} color="green" />
              <div className="metric-card uptime-card"><div className="metric-icon amber"><Radio size={16} /></div><div className="metric-info"><span>Çalışma süresi</span><strong>{formatUptime(state.uptime)}<small> saat</small></strong></div><div className="uptime-wave"><i /><i /><i /><i /><i /><i /><i /></div></div>
            </div>
          </div>

          <section className="conversation-card">
            <div className="conversation-header"><div className="conversation-title"><span className="conversation-icon"><MessageSquare size={16} /></span><div><strong>{showLogs ? "Tanılama kayıtları" : "Sohbet"}</strong><span>Jarvis ile konuşman</span></div></div>
              <button className="icon-button" aria-label="Ayarlar" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button></div>
            <div className="conversation-content">
              {displayedLogs.length ? displayedLogs.map((entry) => <ChatBubble key={entry.id} entry={entry} />) : <div className="conversation-empty">
                <div className="empty-orb"><Bot size={24} /></div><strong>Yeni bir sohbet başlat</strong><span>Bir şey sorabilir veya Jarvis’ten bilgisayarında bir işlem yapmasını isteyebilirsin.</span>
                <div className="suggestions"><button onClick={() => setMessage("Sistem bilgilerimi göster")}>Sistem durumumu göster <span>↗</span></button><button onClick={() => setMessage("Bugün hava nasıl? ")}>Hava durumunu sor <span>↗</span></button></div>
              </div>}
              <div ref={logEnd} />
            </div>
            <form className="composer" onSubmit={submit}>
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Jarvis’e bir şey sor…" aria-label="Jarvis'e mesaj yaz" />
              <button className="send-button" type="submit" disabled={!message.trim()} aria-label="Mesajı gönder"><SendHorizontal size={17} /></button>
              <div className="composer-foot"><span><span className="keyboard-key">Enter</span> gönder</span><span className="composer-mic"><Mic size={13} /> Sesli giriş açık</span></div>
            </form>
          </section>
        </div>
      </section>}
    </main>

    <footer className="app-footer"><span><span className="footer-dot" />JARVIS DESKTOP</span><span>Yerel oturum <b>·</b> {state.voice} <b>·</b> {state.effectsEnabled ? "Ses efektleri açık" : "Sessiz mod"}</span></footer>

    {settingsOpen && <SettingsModal state={state} onClose={() => setSettingsOpen(false)} onToast={tell} />}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | null; color: string }) {
  const safe = Math.max(0, Math.min(100, value ?? 0));
  return <div className="metric-card"><div className={`metric-icon ${color}`}>{icon}</div><div className="metric-info"><span>{label}</span><strong>{value === null ? "—" : <>{Math.round(safe)}<small>%</small></>}</strong></div>
    {value !== null && <div className="metric-track"><i className={color} style={{ width: `${safe}%` }} /></div>}
  </div>;
}

function ChatBubble({ entry }: { entry: LogEntry }) {
  if (entry.role === "system") return <div className="system-message"><span />{entry.text.replace(/^SYS:\s*/i, "")}</div>;
  const isUser = entry.role === "user";
  return <div className={`message-row ${isUser ? "from-user" : "from-assistant"}`}>
    {!isUser && <div className={`message-avatar ${entry.role === "error" ? "error" : ""}`}>{entry.role === "error" ? <CircleAlert size={15} /> : <Bot size={16} />}</div>}
    <div className="message-body"><div className="message-author">{isUser ? "Sen" : entry.role === "error" ? "Uyarı" : "Jarvis"}<time>{entry.time}</time></div><div className={`message-bubble ${entry.role === "error" ? "error" : ""}`}>{entry.text.replace(/^(Siz|Jarvis|JARVIS|ERR):\s*/i, "")}</div></div>
    {isUser && <div className="message-avatar user-avatar">D</div>}
  </div>;
}

function SettingsModal({ state, onClose, onToast }: { state: JarvisState; onClose: () => void; onToast: (text: string) => void }) {
  const [gemini, setGemini] = useState("");
  const [youtube, setYoutube] = useState("");
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await bridge()?.save_api_settings(gemini, youtube, handle);
      if (result?.ok) {
        onToast("Ayarlar kaydedildi");
        onClose();
      } else setError(result?.error ?? "Ayarlar kaydedilemedi.");
    } catch { setError("Python bağlantısı kurulamadı. Uygulamayı yeniden başlat."); }
    finally { setSaving(false); }
  };

  const setVoice = async (voice: string) => {
    const result = await bridge()?.set_voice(voice);
    if (result && !result.ok) onToast(result.error ?? "Ses profili değiştirilemedi.");
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && state.apiReady) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="modal-header"><div><div className="eyebrow">KİŞİSELLEŞTİR</div><h2 id="settings-title">Ayarlar</h2></div><button className="icon-button" onClick={onClose} aria-label="Ayarları kapat" disabled={!state.apiReady}><X size={18} /></button></header>
      <div className="modal-scroll">
        <div className="settings-section"><div className="settings-section-title"><KeyRound size={16} /><div><strong>Bağlantılar</strong><span>API anahtarların bilgisayarında saklanır.</span></div></div>
          <form className="settings-form" onSubmit={save}>
            <label>Gemini API anahtarı <span className={`field-state ${state.apiReady ? "ready" : "needed"}`}>{state.apiReady ? "Bağlı" : "Gerekli"}</span>
              <input type="password" value={gemini} onChange={(e) => setGemini(e.target.value)} placeholder={state.apiReady ? "Değiştirmek için yeni anahtar gir" : "AIza…"} autoComplete="new-password" />
            </label>
            <label>YouTube API anahtarı <span className="optional-label">İsteğe bağlı</span>
              <input type="password" value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="YouTube Data API anahtarı" autoComplete="new-password" />
            </label>
            <label>YouTube kanal adı <span className="optional-label">İsteğe bağlı</span>
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@kanal-adı" />
            </label>
            {error && <div className="form-error"><CircleAlert size={15} />{error}</div>}
            <button className="save-settings" type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Bağlantıları kaydet"}</button>
          </form>
        </div>
        <div className="settings-section"><div className="settings-section-title"><AudioLines size={16} /><div><strong>Ses profili</strong><span>Jarvis’in yanıt verirken kullanacağı ses.</span></div></div>
          <div className="voice-select-wrap"><select value={state.voice} onChange={(event) => void setVoice(event.target.value)} aria-label="Ses profili">
            {state.voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
          </select><ChevronDown size={15} /></div>
        </div>
        <div className="settings-section effects-section"><div className="settings-section-title"><Volume2 size={16} /><div><strong>Ses efektleri</strong><span>Arka plan ve etkileşim sesleri.</span></div></div>
          <button className={`toggle-switch ${state.effectsEnabled ? "on" : ""}`} aria-label="Ses efektlerini aç veya kapat" onClick={() => void bridge()?.toggle_effects()}><i /></button>
          <div className="volume-row"><span>Düzey</span><input type="range" min="0" max="100" value={Math.round(state.volume * 100)} onChange={(event) => void bridge()?.set_volume(Number(event.target.value) / 100)} /><strong>{Math.round(state.volume * 100)}%</strong></div>
        </div>
      </div>
      <footer className="modal-footer"><span><Check size={14} /> Değişiklikler bu cihaza kaydedilir</span><button onClick={onClose} disabled={!state.apiReady}>Tamam</button></footer>
    </section>
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
