import React, { useState, useRef, useEffect } from "react";
import {
  Zap, Camera, Search, Send, AlertTriangle, ExternalLink, Loader2, Wrench,
  MessageSquare, Sun, Moon, BookMarked, Table2, ClipboardList, Trash2, Plus, ChevronDown, ChevronRight,
  Image as ImageIcon
} from "lucide-react";

const THEMES = {
  dark: {
    bg: "#1C1D1F", panel: "#242527", border: "#3A3B3D", text: "#F0F0EB",
    subtext: "#8B93A0", placeholder: "#5C5D60", accent: "#E8622C", accentText: "#1C1D1F",
    warnBg: "#3A2620", warn: "#F0B429", rowAlt: "#1F2022",
  },
  light: {
    bg: "#F5F3EE", panel: "#FFFFFF", border: "#DCD8CE", text: "#211F1C",
    subtext: "#6B6560", placeholder: "#A39D93", accent: "#D9531E", accentText: "#FFFFFF",
    warnBg: "#FBEBD9", warn: "#95590A", rowAlt: "#F8F6F1",
  },
};

const SYSTEM_PROMPT = `You are an expert electrical fault-finding assistant for professional electricians and technicians (residential and commercial).
Give practical, specific, trade-level diagnostic guidance: likely causes ordered by probability, what to test/measure, typical tools needed.
Always include a brief safety line when the fault involves live circuits, high current, or anything requiring lockout/tagout - remind the user to isolate power and verify de-energization before physical testing, and that this is guidance, not a substitute for site-specific judgment or local code compliance.
Be concise and use the technician's own terminology. Do not pad with generic disclaimers beyond the safety line above.`;

const MANUAL_LOOKUP_PROMPT = `You are helping a technician identify an electrical device and find its manual.
Given either an image of the device or a typed model number/description, identify: manufacturer, model number, and device type.
Then use web search to find a link to the official manual/datasheet (prefer manufacturer's own site or a reputable distributor).
Respond ONLY in this exact JSON format, nothing else, no markdown fences:
{"manufacturer": "...", "model": "...", "device_type": "...", "manual_url": "...", "notes": "..."}
If you cannot confidently identify the device, set manufacturer/model to "unknown" and notes to a short explanation of what more info is needed.`;

// Talks to our own backend (server/index.js), which holds the real Anthropic
// API key and forwards the request. Never call api.anthropic.com directly
// from the browser — that would mean shipping your API key to every visitor.
const API_BASE = import.meta.env.VITE_API_BASE || "";

function callClaude({ messages, tools, system }) {
  return fetch(`${API_BASE}/api/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, ...(tools ? { tools } : {}) }),
  }).then((r) => r.json());
}

function extractText(data) {
  if (!data?.content) return "";
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// Thin wrapper around localStorage so the rest of the app can stay written
// as if it were talking to an async store (it's not, but this keeps the
// calling code — and the shape of persistSavedManuals/persistJobs below —
// unchanged from the original component).
const storage = {
  async get(key) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? null : { value };
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // best-effort — e.g. private browsing mode with storage disabled
    }
  },
};

// ---- Reference data (indicative only - see disclaimer in UI) ----
const STANDARDS = {
  au: {
    label: "Australia (AS/NZS 3000)",
    codeRef: "AS/NZS 3000 / AS/NZS 3008 / AS/NZS 3017",
    cableTable: [
      { csa: "1.5", enclosed: "18", clipped: "23", note: "Lighting / small power" },
      { csa: "2.5", enclosed: "24", clipped: "32", note: "General power circuits (GPO radials)" },
      { csa: "4", enclosed: "32", clipped: "42", note: "Radial power, small cooktops" },
      { csa: "6", enclosed: "41", clipped: "54", note: "Ovens, hot water, sub-mains" },
      { csa: "10", enclosed: "57", clipped: "75", note: "Sub-mains, larger appliances" },
      { csa: "16", enclosed: "76", clipped: "100", note: "Sub-mains, small supplies" },
      { csa: "25", enclosed: "101", clipped: "133", note: "Sub-mains, larger supplies" },
    ],
    cableCols: ["Enclosed in wall/conduit (A)", "Clipped direct (A)"],
    zsTable: [
      { device: "Type B 6A", zs04: "7.28", zs5: "10.9" },
      { device: "Type B 10A", zs04: "4.37", zs5: "6.55" },
      { device: "Type B 16A", zs04: "2.73", zs5: "4.09" },
      { device: "Type B 20A", zs04: "2.19", zs5: "3.28" },
      { device: "Type B 32A", zs04: "1.37", zs5: "2.05" },
      { device: "Type C 6A", zs04: "3.64", zs5: "5.46" },
      { device: "Type C 10A", zs04: "2.19", zs5: "3.28" },
      { device: "Type C 16A", zs04: "1.37", zs5: "2.05" },
      { device: "Type C 20A", zs04: "1.09", zs5: "1.64" },
      { device: "Type C 32A", zs04: "0.68", zs5: "1.02" },
    ],
    testing: [
      {
        title: "Dead testing (before energizing) — AS/NZS 3017",
        steps: [
          "Safe isolation: isolate supply, prove test instrument on known live source, test circuit is dead, prove instrument again",
          "Continuity of protective (earthing) conductors",
          "Continuity of active/neutral conductors for ring or radial circuits as applicable",
          "Insulation resistance: active-active, active-earth, neutral-earth (min 1MΩ typical for 230V circuits; disconnect sensitive electronics first)",
          "Polarity check (verify via continuity while dead)",
          "Verify correct terminations at accessories before re-energizing",
        ],
      },
      {
        title: "Live testing (after re-energizing)",
        steps: [
          "Polarity confirmation (live test)",
          "Earth fault loop impedance (Zs) at the furthest point of each circuit",
          "Prospective fault current at the main switchboard",
          "RCD operation test: 1x and 5x rated residual current, per AS/NZS 3017 trip-time limits",
          "Functional testing of switchgear, RCDs (test button), and any interlocks",
        ],
      },
      {
        title: "General fault-finding sequence",
        steps: [
          "Establish symptom: nuisance tripping, no supply, intermittent fault, overheating",
          "Visual inspection before any testing — burning, damage, loose terminations",
          "Isolate and test for dead short (continuity) before re-energizing anything that tripped on overcurrent",
          "Segment the circuit (disconnect loads) to localize the fault",
          "Re-test in stages rather than restoring everything at once",
        ],
      },
    ],
  },
  uk: {
    label: "United Kingdom (BS 7671)",
    codeRef: "BS 7671 (IET Wiring Regulations)",
    cableTable: [
      { csa: "1.0", enclosed: "11", clipped: "15.5", note: "Lighting circuits typically" },
      { csa: "1.5", enclosed: "14.5", clipped: "19.5", note: "Lighting / small power" },
      { csa: "2.5", enclosed: "19.5", clipped: "27", note: "Ring final / radial socket circuits" },
      { csa: "4", enclosed: "26", clipped: "36", note: "Radial socket circuits, cookers (small)" },
      { csa: "6", enclosed: "34", clipped: "46", note: "Showers, cookers" },
      { csa: "10", enclosed: "46", clipped: "63", note: "Cookers, sub-mains" },
      { csa: "16", enclosed: "61", clipped: "85", note: "Sub-mains, small supplies" },
      { csa: "25", enclosed: "80", clipped: "112", note: "Sub-mains, larger supplies" },
    ],
    cableCols: ["Method A (A)", "Method C (A)"],
    zsTable: [
      { device: "Type B 6A", zs04: "7.28", zs5: "10.9" },
      { device: "Type B 10A", zs04: "4.37", zs5: "6.55" },
      { device: "Type B 16A", zs04: "2.73", zs5: "4.09" },
      { device: "Type B 20A", zs04: "2.19", zs5: "3.28" },
      { device: "Type B 32A", zs04: "1.37", zs5: "2.05" },
      { device: "Type C 6A", zs04: "3.64", zs5: "5.46" },
      { device: "Type C 10A", zs04: "2.19", zs5: "3.28" },
      { device: "Type C 16A", zs04: "1.37", zs5: "2.05" },
      { device: "Type C 20A", zs04: "1.09", zs5: "1.64" },
      { device: "Type C 32A", zs04: "0.68", zs5: "1.02" },
    ],
    testing: [
      {
        title: "Dead testing (before energizing)",
        steps: [
          "Safe isolation: isolate supply, prove test lamp/meter on known live source, test circuit is dead, prove test unit again",
          "Continuity of protective conductors (R1+R2, or R2 for ring finals)",
          "Continuity of ring final circuit conductors (r1, rn, r2 legs)",
          "Insulation resistance: live-live, live-earth (min 1MΩ typical for 230V circuits, disconnect sensitive electronics first)",
          "Polarity check (verify via continuity while dead)",
          "Verify correct connections at accessories before re-energizing",
        ],
      },
      {
        title: "Live testing (after re-energizing)",
        steps: [
          "Polarity confirmation (live test)",
          "Earth fault loop impedance (Zs) at the furthest point of each circuit",
          "Prospective fault current (PFC / PSCC) at origin",
          "RCD operation test: 1x and 5x rated residual current, both polarities where applicable",
          "Functional testing of switchgear, RCDs (test button), and any interlocks",
        ],
      },
      {
        title: "General fault-finding sequence",
        steps: [
          "Establish symptom: nuisance tripping, no supply, intermittent fault, overheating",
          "Visual inspection before any testing - burning, damage, loose connections",
          "Isolate and test for dead short (continuity) before re-energizing anything that tripped on overcurrent",
          "Segment the circuit (disconnect loads) to localize the fault",
          "Re-test in stages rather than restoring everything at once",
        ],
      },
    ],
  },
};

const TAB_LIST = [
  { id: "faults", label: "Fault Finder", icon: MessageSquare },
  { id: "manual", label: "Manual Lookup", icon: Wrench },
  { id: "saved", label: "Saved Manuals", icon: BookMarked },
  { id: "tables", label: "Reference Tables", icon: Table2 },
  { id: "joblog", label: "Job Log", icon: ClipboardList },
];

export default function SparkFixApp() {
  const [themeName, setThemeName] = useState("dark");
  const t = THEMES[themeName];
  const [tab, setTab] = useState("faults");

  // Fault finder
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Manual lookup
  const [modelInput, setModelInput] = useState("");
  const [imageData, setImageData] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Saved manuals (persisted)
  const [savedManuals, setSavedManuals] = useState([]);
  const [savedLoading, setSavedLoading] = useState(true);

  // Job log (persisted)
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobTitle, setJobTitle] = useState("");
  const [jobNotes, setJobNotes] = useState("");

  // Reference tables accordion
  const [openProcedure, setOpenProcedure] = useState(0);
  const [standard, setStandard] = useState("au");
  const std = STANDARDS[standard];

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("saved-manuals");
        if (res?.value) setSavedManuals(JSON.parse(res.value));
      } catch (e) { /* no saved manuals yet */ }
      setSavedLoading(false);
      try {
        const res = await storage.get("job-log");
        if (res?.value) setJobs(JSON.parse(res.value));
      } catch (e) { /* no jobs yet */ }
      setJobsLoading(false);
    })();
  }, []);

  async function persistSavedManuals(list) {
    setSavedManuals(list);
    await storage.set("saved-manuals", JSON.stringify(list));
  }

  async function persistJobs(list) {
    setJobs(list);
    await storage.set("job-log", JSON.stringify(list));
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const data = await callClaude({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        system: SYSTEM_PROMPT,
      });
      const text = extractText(data) || "Sorry, I couldn't generate a response.";
      setMessages([...newMessages, { role: "assistant", content: text }]);
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: "Error reaching the assistant. Please try again." }]);
    }
    setLoading(false);
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      setImageData({ base64, mediaType: file.type });
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function runLookup() {
    if (!modelInput.trim() && !imageData) return;
    setLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);
    try {
      const content = [];
      if (imageData) {
        content.push({ type: "image", source: { type: "base64", media_type: imageData.mediaType, data: imageData.base64 } });
      }
      content.push({
        type: "text",
        text: modelInput.trim() ? `Model number / description provided: ${modelInput.trim()}` : "Identify the device from the photo.",
      });

      const data = await callClaude({
        messages: [{ role: "user", content }],
        system: MANUAL_LOOKUP_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });

      const text = extractText(data);
      const cleaned = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setLookupResult(parsed);
        if (parsed.manufacturer && parsed.manufacturer !== "unknown") {
          const entry = { ...parsed, id: Date.now(), savedAt: new Date().toISOString() };
          persistSavedManuals([entry, ...savedManuals]);
        }
      } else {
        setLookupError("Couldn't parse a result. Try a clearer photo or a more specific model number.");
      }
    } catch (e) {
      setLookupError("Something went wrong during lookup. Please try again.");
    }
    setLookupLoading(false);
  }

  function removeSavedManual(id) {
    persistSavedManuals(savedManuals.filter((m) => m.id !== id));
  }

  function addJob() {
    if (!jobTitle.trim()) return;
    const entry = { id: Date.now(), title: jobTitle.trim(), notes: jobNotes.trim(), date: new Date().toISOString().slice(0, 10) };
    persistJobs([entry, ...jobs]);
    setJobTitle("");
    setJobNotes("");
  }

  function removeJob(id) {
    persistJobs(jobs.filter((j) => j.id !== id));
  }

  const inputStyle = { backgroundColor: t.bg, borderColor: t.border, color: t.text };
  const panelStyle = { backgroundColor: t.panel, borderColor: t.border };

  return (
    <div className="min-h-screen font-sans transition-colors" style={{ backgroundColor: t.bg, color: t.text }}>
      {/* Header */}
      <header className="border-b px-6 py-5" style={{ borderColor: t.border }}>
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.accent }}>
            <Zap size={22} strokeWidth={2.5} style={{ color: t.accentText }} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">SparkFix</h1>
            <p className="text-xs tracking-wide uppercase" style={{ color: t.subtext }}>Fault-finding, manuals &amp; reference</p>
          </div>
          <button
            onClick={() => setThemeName(themeName === "dark" ? "light" : "dark")}
            className="w-9 h-9 rounded-lg flex items-center justify-center border transition-colors"
            style={{ borderColor: t.border, color: t.subtext }}
            aria-label="Toggle light/dark mode"
          >
            {themeName === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-6 pt-5">
        <div className="flex gap-1 p-1 rounded-lg w-fit flex-wrap" style={{ backgroundColor: t.panel }}>
          {TAB_LIST.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
              style={tab === id ? { backgroundColor: t.accent, color: t.accentText } : { color: t.subtext }}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Fault Finder Tab */}
      {tab === "faults" && (
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col" style={{ minHeight: "60vh" }}>
          <div className="flex-1 space-y-4 mb-4">
            {messages.length === 0 && (
              <div className="text-sm rounded-lg p-4 border" style={{ ...panelStyle, color: t.subtext }}>
                Describe the fault — equipment type, symptoms, any error codes — and get a prioritized diagnostic checklist.
                <div className="flex items-start gap-2 mt-3 text-xs" style={{ color: t.warn }}>
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>Always isolate and verify de-energization before physical testing. This tool supports judgment, it doesn't replace it.</span>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap border"
                  style={m.role === "user" ? { backgroundColor: t.accent, color: t.accentText, borderColor: t.accent } : panelStyle}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: t.subtext }}>
                <Loader2 size={16} className="animate-spin" /> Thinking through the fault...
              </div>
            )}
          </div>

          <div className="flex gap-2 sticky bottom-6">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="e.g. 3-phase motor trips on start, RCD holds..."
              className="flex-1 border rounded-lg px-4 py-3 text-sm focus:outline-none"
              style={inputStyle}
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="rounded-lg px-4 py-3 font-medium disabled:opacity-50 flex items-center gap-2"
              style={{ backgroundColor: t.accent, color: t.accentText }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Manual Lookup Tab */}
      {tab === "manual" && (
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="rounded-lg p-5 space-y-4 border" style={panelStyle}>
            <div>
              <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: t.subtext }}>Model number or description</label>
              <input
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder="e.g. Schneider iC60N C20"
                className="w-full border rounded-lg px-4 py-3 text-sm font-mono focus:outline-none"
                style={inputStyle}
              />
            </div>

            <div className="flex items-center gap-3 text-xs" style={{ color: t.placeholder }}>
              <div className="flex-1 h-px" style={{ backgroundColor: t.border }} /> OR <div className="flex-1 h-px" style={{ backgroundColor: t.border }} />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: t.subtext }}>Photo of the device</label>
              {/* Camera input: capture="environment" opens the rear camera directly on mobile */}
              <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleImageUpload} className="hidden" />
              {/* Library input: no capture attr, opens the normal file/photo picker */}
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

              {imagePreview ? (
                <div className="border border-dashed rounded-lg p-3 flex flex-col items-center gap-3" style={{ borderColor: t.border }}>
                  <img src={imagePreview} alt="preview" className="max-h-40 rounded" />
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 text-xs rounded-lg py-2 border flex items-center justify-center gap-1"
                      style={{ borderColor: t.border, color: t.subtext }}
                    >
                      <Camera size={14} /> Retake
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 text-xs rounded-lg py-2 border flex items-center justify-center gap-1"
                      style={{ borderColor: t.border, color: t.subtext }}
                    >
                      Choose different
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="border border-dashed rounded-lg py-6 flex flex-col items-center gap-2 transition-colors"
                    style={{ borderColor: t.border, color: t.subtext }}
                  >
                    <Camera size={22} />
                    <span className="text-sm">Take photo</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed rounded-lg py-6 flex flex-col items-center gap-2 transition-colors"
                    style={{ borderColor: t.border, color: t.subtext }}
                  >
                    <ImageIcon size={22} />
                    <span className="text-sm">Upload photo</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={runLookup}
              disabled={lookupLoading || (!modelInput.trim() && !imageData)}
              className="w-full rounded-lg py-3 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: t.accent, color: t.accentText }}
            >
              {lookupLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {lookupLoading ? "Searching..." : "Find Manual"}
            </button>
          </div>

          {lookupError && (
            <div className="mt-4 rounded-lg p-4 text-sm border" style={{ backgroundColor: t.warnBg, borderColor: t.accent, color: t.warn }}>
              {lookupError}
            </div>
          )}

          {lookupResult && (
            <div className="mt-4 rounded-lg p-5 border" style={panelStyle}>
              {lookupResult.manufacturer === "unknown" ? (
                <p className="text-sm" style={{ color: t.subtext }}>{lookupResult.notes}</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between mb-1">
                    <h3 className="font-bold text-lg">{lookupResult.manufacturer}</h3>
                    <span className="font-mono text-sm" style={{ color: t.accent }}>{lookupResult.model}</span>
                  </div>
                  <p className="text-sm mb-4" style={{ color: t.subtext }}>{lookupResult.device_type}</p>
                  {lookupResult.notes && <p className="text-sm mb-4">{lookupResult.notes}</p>}
                  {lookupResult.manual_url && lookupResult.manual_url !== "unknown" && (
                    <a
                      href={lookupResult.manual_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                      style={{ backgroundColor: t.accent, color: t.accentText }}
                    >
                      Open Manual <ExternalLink size={14} />
                    </a>
                  )}
                  <p className="text-xs mt-3" style={{ color: t.subtext }}>Saved to your Saved Manuals tab automatically.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Saved Manuals Tab */}
      {tab === "saved" && (
        <div className="max-w-4xl mx-auto px-6 py-6">
          {savedLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: t.subtext }}>
              <Loader2 size={16} className="animate-spin" /> Loading saved manuals...
            </div>
          ) : savedManuals.length === 0 ? (
            <div className="text-sm rounded-lg p-4 border" style={{ ...panelStyle, color: t.subtext }}>
              No manuals saved yet. Look one up in the Manual Lookup tab and it'll show up here automatically.
            </div>
          ) : (
            <div className="space-y-3">
              {savedManuals.map((m) => (
                <div key={m.id} className="rounded-lg p-4 border flex items-start justify-between gap-3" style={panelStyle}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="font-bold">{m.manufacturer}</h3>
                      <span className="font-mono text-sm" style={{ color: t.accent }}>{m.model}</span>
                    </div>
                    <p className="text-sm" style={{ color: t.subtext }}>{m.device_type}</p>
                    {m.manual_url && m.manual_url !== "unknown" && (
                      <a href={m.manual_url} target="_blank" rel="noopener noreferrer" className="text-sm inline-flex items-center gap-1 mt-2" style={{ color: t.accent }}>
                        Open Manual <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <button onClick={() => removeSavedManual(m.id)} className="flex-shrink-0 p-2 rounded-lg" style={{ color: t.subtext }} aria-label="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reference Tables Tab */}
      {tab === "tables" && (
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {/* Region selector */}
          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: t.panel }}>
            {Object.entries(STANDARDS).map(([key, s]) => (
              <button
                key={key}
                onClick={() => setStandard(key)}
                className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                style={standard === key ? { backgroundColor: t.accent, color: t.accentText } : { color: t.subtext }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-start gap-2 text-xs rounded-lg p-3 border" style={{ backgroundColor: t.warnBg, borderColor: t.accent, color: t.warn }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Reference values only, indicative and simplified for common cable/installation types. Always verify against the current edition of {std.codeRef} and manufacturer data before use on site — derating factors (ambient temp, grouping, insulation) are not included here.</span>
          </div>

          {/* Cable sizing table */}
          <div className="rounded-lg border overflow-hidden" style={panelStyle}>
            <div className="px-4 py-3 border-b font-bold text-sm" style={{ borderColor: t.border }}>Cable Size &amp; Current Carrying Capacity</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: t.subtext }}>
                    <th className="text-left px-4 py-2 font-medium">CSA (mm²)</th>
                    <th className="text-left px-4 py-2 font-medium">{std.cableCols[0]}</th>
                    <th className="text-left px-4 py-2 font-medium">{std.cableCols[1]}</th>
                    <th className="text-left px-4 py-2 font-medium">Typical use</th>
                  </tr>
                </thead>
                <tbody>
                  {std.cableTable.map((row, i) => (
                    <tr key={row.csa} style={{ backgroundColor: i % 2 ? t.rowAlt : "transparent" }}>
                      <td className="px-4 py-2 font-mono">{row.csa}</td>
                      <td className="px-4 py-2 font-mono">{row.enclosed}</td>
                      <td className="px-4 py-2 font-mono">{row.clipped}</td>
                      <td className="px-4 py-2" style={{ color: t.subtext }}>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Zs table */}
          <div className="rounded-lg border overflow-hidden" style={panelStyle}>
            <div className="px-4 py-3 border-b font-bold text-sm" style={{ borderColor: t.border }}>Max Earth Fault Loop Impedance (Zs) — Ω</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: t.subtext }}>
                    <th className="text-left px-4 py-2 font-medium">Device</th>
                    <th className="text-left px-4 py-2 font-medium">0.4s disconnection</th>
                    <th className="text-left px-4 py-2 font-medium">5s disconnection</th>
                  </tr>
                </thead>
                <tbody>
                  {std.zsTable.map((row, i) => (
                    <tr key={row.device} style={{ backgroundColor: i % 2 ? t.rowAlt : "transparent" }}>
                      <td className="px-4 py-2">{row.device}</td>
                      <td className="px-4 py-2 font-mono">{row.zs04}</td>
                      <td className="px-4 py-2 font-mono">{row.zs5}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Testing procedures */}
          <div className="rounded-lg border overflow-hidden" style={panelStyle}>
            <div className="px-4 py-3 border-b font-bold text-sm" style={{ borderColor: t.border }}>Testing Procedures</div>
            {std.testing.map((proc, i) => (
              <div key={proc.title} style={{ borderTop: i > 0 ? `1px solid ${t.border}` : "none" }}>
                <button
                  onClick={() => setOpenProcedure(openProcedure === i ? -1 : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
                >
                  {proc.title}
                  {openProcedure === i ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {openProcedure === i && (
                  <ol className="px-4 pb-4 space-y-2 text-sm" style={{ color: t.subtext }}>
                    {proc.steps.map((s, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="font-mono flex-shrink-0" style={{ color: t.accent }}>{j + 1}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Job Log Tab */}
      {tab === "joblog" && (
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="rounded-lg p-5 border space-y-3 mb-6" style={panelStyle}>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Job / site title"
              className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none"
              style={inputStyle}
            />
            <textarea
              value={jobNotes}
              onChange={(e) => setJobNotes(e.target.value)}
              placeholder="Notes — fault found, parts used, follow-up needed..."
              rows={3}
              className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none resize-none"
              style={inputStyle}
            />
            <button
              onClick={addJob}
              disabled={!jobTitle.trim()}
              className="rounded-lg px-4 py-2 font-medium disabled:opacity-50 flex items-center gap-2 text-sm"
              style={{ backgroundColor: t.accent, color: t.accentText }}
            >
              <Plus size={16} /> Add entry
            </button>
          </div>

          {jobsLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: t.subtext }}>
              <Loader2 size={16} className="animate-spin" /> Loading job log...
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-sm rounded-lg p-4 border" style={{ ...panelStyle, color: t.subtext }}>
              No entries yet. Log a job above to start building your history.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((j) => (
                <div key={j.id} className="rounded-lg p-4 border flex items-start justify-between gap-3" style={panelStyle}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="font-bold">{j.title}</h3>
                      <span className="text-xs" style={{ color: t.subtext }}>{j.date}</span>
                    </div>
                    {j.notes && <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: t.subtext }}>{j.notes}</p>}
                  </div>
                  <button onClick={() => removeJob(j.id)} className="flex-shrink-0 p-2 rounded-lg" style={{ color: t.subtext }} aria-label="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
