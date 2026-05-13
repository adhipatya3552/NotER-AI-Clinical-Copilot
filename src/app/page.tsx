"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  extractKeywords,
  DetectedKeyword,
  KeywordCategory,
  getCategoryLabel,
  getCategoryIcon,
} from "@/lib/medical-keywords";
import type { GeneratedReport, PrescriptionItem, SOAPNotes } from "@/lib/llm-client";

// ── Types ──────────────────────────────────────────────────────
type ConsultationStatus = "idle" | "listening" | "processing" | "completed";
type SpeakerRole = "doctor" | "patient" | "transcript";

interface TranscriptEntry {
  id: string;
  speaker: SpeakerRole;
  text: string;
  timestamp: string;
  isPartial?: boolean;
}

// ── Main Page Component ────────────────────────────────────────
export default function HomePage() {
  const [status, setStatus] = useState<ConsultationStatus>("idle");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [keywords, setKeywords] = useState<Map<string, DetectedKeyword>>(new Map());
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [timer, setTimer] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [patientHistory, setPatientHistory] = useState<Array<{ date: string; summary: string }>>([]); 
  const [isEditing, setIsEditing] = useState(false);
  const [editedReport, setEditedReport] = useState<GeneratedReport | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const vapiRef = useRef<ReturnType<typeof Object> | null>(null);
  // Keep a ref to always have the latest transcript entries in async functions
  const transcriptEntriesRef = useRef<TranscriptEntry[]>([]);
  // Preloaded Vapi module — populated on mount so the first click is instant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vapiModuleRef = useRef<any>(null);
  // Guard: prevent endConsultation from firing twice (user click + Vapi call-end)
  const endingRef = useRef(false);
  // Guard: prevent duplicate memory stores (fire-and-forget could retrigger)
  const savedConsultationIdRef = useRef<string | null>(null);


  // ── Preload Vapi SDK on mount ──────────────────────────────
  // Eliminates the ~500 ms dynamic-import stall on first button click.
  useEffect(() => {
    import("@vapi-ai/web").then((mod) => {
      vapiModuleRef.current = mod.default ?? mod;
    }).catch(() => { /* silently ignore — will fall back to on-click import */ });
  }, []);

  // ── Timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "listening") {
      timerRef.current = setInterval(() => {
        setTimer((t) => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ── Auto-scroll transcript ───────────────────────────────────
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [transcriptEntries]);

  // ── Keyword extraction on new transcript ─────────────────────
  const processTranscript = useCallback(
    (text: string) => {
      setKeywords((prev) => extractKeywords(text, prev));
    },
    []
  );

  // ── Add transcript entry ─────────────────────────────────────
  const addTranscriptEntry = useCallback(
    (text: string, speaker: SpeakerRole, isPartial: boolean = false) => {
      if (!text || text.trim().length === 0) return;

      const entry: TranscriptEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        speaker,
        text: text.trim(),
        timestamp: formatTime(timer),
        isPartial,
      };

      setTranscriptEntries((prev) => {
        // Replace last partial entry
        let next: TranscriptEntry[];
        if (isPartial && prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.isPartial) {
            next = [...prev.slice(0, -1), entry];
          } else {
            next = [...prev, entry];
          }
        } else {
          next = [...prev, entry];
        }
        // Keep ref in sync so endConsultation always sees latest entries
        transcriptEntriesRef.current = next;
        return next;
      });

      if (!isPartial) {
        processTranscript(text);
      }
    },
    [timer, processTranscript]
  );

  // ── Start Consultation with Vapi ─────────────────────────────
  const startConsultation = async () => {
    setStatus("listening");
    setTranscriptEntries([]);
    setKeywords(new Map());
    setReport(null);
    setTimer(0);
    setPatientHistory([]);

    try {
      // Use the preloaded module (populated on mount); fall back to on-demand import
      // if the preload hasn't finished yet (e.g. very fast click).
      const VapiModule = vapiModuleRef.current
        ? { default: vapiModuleRef.current }
        : await import("@vapi-ai/web");
      const Vapi = VapiModule.default;

      const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

      if (!publicKey || publicKey === "your_vapi_public_key_here") {
        console.error("Vapi Public Key is missing.");
        setStatus("idle");
        alert("Please configure NEXT_PUBLIC_VAPI_PUBLIC_KEY in .env.local");
        return;
      }

      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      // Listen for transcript events
      // IMPORTANT: Vapi is a voice agent — it captures user speech and generates
      // AI assistant responses. For medical transcription we only need the USER's
      // speech (the real conversation picked up by the microphone). We skip
      // the "assistant" messages because those are Vapi's AI echoes, not the doctor.
      vapi.on("message", (message: Record<string, unknown>) => {
        if (message.type === "transcript") {
          const transcript = message as unknown as {
            transcript: string;
            transcriptType: string;
            role?: string;
          };

          // Only capture USER role (real microphone input)
          // Skip "assistant" role (Vapi's AI responses — not the real doctor)
          if (transcript.role === "assistant") return;

          const isPartial = transcript.transcriptType === "partial";
          addTranscriptEntry(transcript.transcript, "transcript", isPartial);
        }
      });

      vapi.on("call-end", () => {
        endConsultation();
      });

      // Mute the assistant's audio output as soon as the call connects
      vapi.on("call-start", () => {
        vapi.send({ type: "control", control: "mute-assistant" });
      });

      vapi.on("error", (error: unknown) => {
        console.error("Vapi error:", error);
        setStatus("idle");
        alert("Vapi encountered an error. Check console for details.");
      });

      // Start the Vapi call using the pre-configured NOTER assistant
      // (transcriber: nova-3, language: multi (Hindi/English/Hinglish), bgDenoise: off, silenceTimeout: 1800s)
      const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
      if (!assistantId || assistantId === "your_vapi_assistant_id_here") {
        console.error("Vapi Assistant ID is missing."); 
        setStatus("idle");
        alert("Please configure NEXT_PUBLIC_VAPI_ASSISTANT_ID in .env");
        return;
      }
      await vapi.start(assistantId);
    } catch (error) {
      console.error("Failed to start Vapi:", error);
      setStatus("idle");
      alert("Failed to initialize Vapi. Check console for details.");
    }
  };

  // ── End Consultation ─────────────────────────────────────────
  const endConsultation = async () => {
    // Guard: prevent double execution (user click + Vapi call-end event)
    if (endingRef.current) return;
    endingRef.current = true;

    // Stop Vapi if running
    if (vapiRef.current) {
      try {
        (vapiRef.current as { stop: () => void }).stop();
      } catch {
        // ignore
      }
      vapiRef.current = null;
    }

    // Use ref to get latest entries (avoids stale closure bug)
    const finalEntries = transcriptEntriesRef.current.filter((e) => !e.isPartial);

    // Guard: don't process empty transcript
    if (finalEntries.length === 0) {
      setStatus("idle");
      endingRef.current = false;
      return;
    }

    setStatus("processing");
    setIsGenerating(true);

    // Build full transcript text
    // For Vapi ("transcript" speaker), we send raw text and let the LLM
    // figure out who is doctor and who is patient from context.
    // For demo mode, we use the explicit doctor/patient labels.
    const fullTranscript = finalEntries
      .map((e) => {
        if (e.speaker === "transcript") return e.text;
        return `${e.speaker === "doctor" ? "Doctor" : "Patient"}: ${e.text}`;
      })
      .join("\n");

    try {
      // ── Run generate-notes and memory search IN PARALLEL ─────
      // Both are independent — no reason to wait for notes before searching.
      const notesPromise = fetch("/api/generate-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: fullTranscript }),
      });

      const historyPromise = fetch(
        `/api/memory?q=${encodeURIComponent(fullTranscript.slice(0, 500))}&limit=3`
      ).then((r) => r.json()).catch(() => ({ results: [] }));

      const [response, historyData] = await Promise.all([
        notesPromise,
        historyPromise,
      ]);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      // Validate the response has the expected structure before setting
      if (!data?.soap?.subjective || !Array.isArray(data?.prescriptions)) {
        throw new Error("Invalid report structure from server");
      }

      setReport(data as GeneratedReport);

      // Apply history results (already resolved above)
      if (historyData.results && historyData.results.length > 0) {
        setPatientHistory(
          historyData.results.map((r: { date: string; summary: string }) => ({
            date: r.date,
            summary: r.summary,
          }))
        );
      }

      // ── Fire-and-forget memory store ──────────────────────────
      // Use a proper UUID — Qdrant only accepts UUID or integer point IDs.
      const consultationId = crypto.randomUUID();

      // Guard: don't store if we already saved this consultation
      if (savedConsultationIdRef.current !== consultationId) {
        savedConsultationIdRef.current = consultationId;
        fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: consultationId,
            patientName: patientName.trim() || "Unknown Patient",
            date: new Date().toISOString(),
            summary: (data as GeneratedReport).summary || "",
            keywords: Array.from(keywords.values()).map((k) => k.term),
            transcript: fullTranscript,
            soapNotes: JSON.stringify((data as GeneratedReport).soap),
            prescriptions: JSON.stringify((data as GeneratedReport).prescriptions),
          }),
        }).then((r) => {
          if (!r.ok) console.error("[Memory] Store failed:", r.status);
        }).catch((err) => console.error("[Memory] Store error:", err));
      }
    } catch (error) {
      console.error("Failed to generate report:", error);
      setIsGenerating(false);
      setStatus("idle");
      alert("Failed to generate clinical report. Please check your Gemini API key in .env.local and try again.");
      return;
    }

    setIsGenerating(false);
    setStatus("completed");
    endingRef.current = false;
  };

  // ── New Consultation ─────────────────────────────────────────
  const newConsultation = () => {
    setStatus("idle");
    setPatientName("");
    setPatientAge("");
    setPatientGender("");
    setTranscriptEntries([]);
    transcriptEntriesRef.current = [];
    setKeywords(new Map());
    setReport(null);
    setTimer(0);
    setPatientHistory([]);
    setIsEditing(false);
    setEditedReport(null);
    endingRef.current = false;
    savedConsultationIdRef.current = null;
  };

  // ── Edit Mode Handlers ──────────────────────────────────────
  const startEditing = () => {
    if (!report) return;
    setEditedReport(JSON.parse(JSON.stringify(report)));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedReport(null);
  };

  const saveEdits = () => {
    if (!editedReport) return;
    setReport(editedReport);
    setIsEditing(false);
    setEditedReport(null);
  };

  const updateEditedSOAP = (field: keyof SOAPNotes, value: string) => {
    if (!editedReport) return;
    setEditedReport({
      ...editedReport,
      soap: { ...editedReport.soap, [field]: value },
    });
  };

  const updateEditedSummary = (value: string) => {
    if (!editedReport) return;
    setEditedReport({ ...editedReport, summary: value });
  };

  const updateEditedPrescription = (
    index: number,
    field: keyof PrescriptionItem,
    value: string
  ) => {
    if (!editedReport) return;
    const updated = [...editedReport.prescriptions];
    updated[index] = { ...updated[index], [field]: value };
    setEditedReport({ ...editedReport, prescriptions: updated });
  };

  const addPrescriptionRow = () => {
    if (!editedReport) return;
    setEditedReport({
      ...editedReport,
      prescriptions: [
        ...editedReport.prescriptions,
        { drug: "", dosage: "", frequency: "", duration: "" },
      ],
    });
  };

  const removePrescriptionRow = (index: number) => {
    if (!editedReport) return;
    const updated = editedReport.prescriptions.filter((_, i) => i !== index);
    setEditedReport({ ...editedReport, prescriptions: updated });
  };

  // ── Copy to clipboard ───────────────────────────────────────
  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopyFeedback(`${label} copied!`);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  // ── Export PDF ──────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (!report) return;
    const { exportToPDF } = await import("@/lib/pdf-export");
    exportToPDF(report, patientName.trim() || "Unknown Patient", patientAge.trim(), patientGender);
  };

  // ── Print Prescription ──────────────────────────────────────
  const handlePrint = async () => {
    if (!report) return;
    const { printPrescription } = await import("@/lib/pdf-export");
    printPrescription(report, patientName.trim() || "Unknown Patient", patientAge.trim(), patientGender);
  };

  // ── Group keywords by category ──────────────────────────────
  const groupedKeywords = Array.from(keywords.values()).reduce(
    (acc, kw) => {
      if (!acc[kw.category]) acc[kw.category] = [];
      acc[kw.category].push(kw);
      return acc;
    },
    {} as Record<KeywordCategory, DetectedKeyword[]>
  );

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header__brand">
          <div className="header__logo">♥</div>
          <div>
            <div className="header__title">notER</div>
            <div className="header__subtitle">AI Clinical Copilot</div>
          </div>
        </div>
        <div className="header__status">
          <StatusIndicator status={status} />
          <div className="header__connection">
            <div className="header__connection-dot" />
            System Ready
          </div>
          <a
            href="/dashboard"
            style={{
              padding: "6px 14px",
              background: "rgba(225, 29, 72, 0.15)",
              border: "1px solid rgba(225, 29, 72, 0.3)",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "12px",
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "0.02em",
            }}
          >
            📋 Dashboard
          </a>
        </div>
      </header>

      {/* Control Bar */}
      <div className="main-content">
        <div className="control-bar no-print">
          <button
            className="control-bar__btn control-bar__btn--start"
            onClick={startConsultation}
            disabled={
              status === "listening" ||
              status === "processing" ||
              patientName.trim() === "" ||
              !patientAge || Number(patientAge) < 1 || Number(patientAge) > 150 ||
              patientGender === ""
            }
            title={
              patientName.trim() === "" || !patientAge || Number(patientAge) < 1 || Number(patientAge) > 150 || patientGender === ""
                ? "Enter patient name, valid age, and gender first"
                : "Start consultation"
            }
            id="btn-start"
          >
            🎙️ Start Consultation
          </button>
          <button
            className="control-bar__btn control-bar__btn--end"
            onClick={endConsultation}
            disabled={status !== "listening"}
            id="btn-end"
          >
            ⏹️ End Consultation
          </button>

          <div className="control-bar__separator" />

          <div className="control-bar__timer">{formatTime(timer)}</div>

          {status === "listening" && (
            <div className="control-bar__waveform">
              <div className="control-bar__waveform-bar" />
              <div className="control-bar__waveform-bar" />
              <div className="control-bar__waveform-bar" />
              <div className="control-bar__waveform-bar" />
              <div className="control-bar__waveform-bar" />
            </div>
          )}
        </div>

        {/* Main Layout */}
        {status === "idle" && (
          <div className="idle-state">
            <div className="idle-state__icon">🫀</div>
            <div className="idle-state__title">Ready for Consultation</div>
            <div className="idle-state__subtitle">
              Enter the patient&apos;s details, then click &quot;Start Consultation&quot; to begin
              recording. notER will transcribe, analyze, and generate structured
              clinical notes in real-time.
            </div>
            {/* Patient details input */}
            <div style={{
              marginTop: 24,
              width: "100%",
              maxWidth: 420,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}>
              {/* Patient Name */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  htmlFor="patient-name-input"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    textAlign: "left",
                  }}
                >
                  👤 Patient Name <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  id="patient-name-input"
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  autoComplete="off"
                  style={{
                    padding: "12px 16px",
                    background: "var(--surface)",
                    border: "1.5px solid var(--border)",
                    borderRadius: 10,
                    color: "var(--text-primary)",
                    fontSize: 15,
                    outline: "none",
                    width: "100%",
                    transition: "border-color 0.2s",
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
              </div>
              {/* Age + Gender row */}
              <div style={{ display: "flex", gap: 12 }}>
                {/* Patient Age */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  <label
                    htmlFor="patient-age-input"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textAlign: "left",
                    }}
                  >
                    🎂 Age <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <input
                    id="patient-age-input"
                    type="number"
                    min={1}
                    max={150}
                    placeholder="e.g. 45"
                    value={patientAge}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || (/^\d{1,3}$/.test(v) && Number(v) <= 150)) {
                        setPatientAge(v);
                      }
                    }}
                    autoComplete="off"
                    style={{
                      padding: "12px 16px",
                      background: "var(--surface)",
                      border: "1.5px solid var(--border)",
                      borderRadius: 10,
                      color: "var(--text-primary)",
                      fontSize: 15,
                      outline: "none",
                      width: "100%",
                      transition: "border-color 0.2s",
                      fontFamily: "inherit",
                      MozAppearance: "textfield",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                  />
                  {patientAge !== "" && (Number(patientAge) < 1 || Number(patientAge) > 150) && (
                    <p style={{ fontSize: 11, color: "var(--accent)", margin: 0 }}>
                      Age must be between 1 and 150
                    </p>
                  )}
                </div>
                {/* Patient Gender */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  <label
                    htmlFor="patient-gender-select"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textAlign: "left",
                    }}
                  >
                    ⚕️ Gender <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <select
                    id="patient-gender-select"
                    value={patientGender}
                    onChange={(e) => setPatientGender(e.target.value)}
                    style={{
                      padding: "12px 16px",
                      background: "var(--surface)",
                      border: "1.5px solid var(--border)",
                      borderRadius: 10,
                      color: patientGender ? "var(--text-primary)" : "var(--text-tertiary)",
                      fontSize: 15,
                      outline: "none",
                      width: "100%",
                      transition: "border-color 0.2s",
                      fontFamily: "inherit",
                      cursor: "pointer",
                      appearance: "none",
                      WebkitAppearance: "none",
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 14px center",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                  >
                    <option value="" disabled>Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              {(patientName.trim() === "" || !patientAge || Number(patientAge) < 1 || Number(patientAge) > 150 || patientGender === "") && (
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
                  All fields are required before starting the consultation
                </p>
              )}
            </div>
          </div>
        )}

        {(status === "listening" || status === "processing") && (
          <div className="consultation-layout">
            {/* Left Panel — Transcription */}
            <div className="card transcription-panel">
              <div className="card__header">
                <div className="card__title">
                  🎙️ Live Transcription
                </div>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {transcriptEntries.filter((e) => !e.isPartial).length} segments
                </span>
              </div>
              <div className="transcription__feed" ref={feedRef}>
                {transcriptEntries.length === 0 ? (
                  <div className="transcription__empty">
                    <div className="transcription__empty-icon">🎧</div>
                    <div className="transcription__empty-text">
                      {status === "listening"
                        ? "Listening for conversation... Speak to begin transcription."
                        : "Processing transcript..."}
                    </div>
                    {status === "listening" && (
                      <div className="loading-dots">
                        <div className="loading-dots__dot" />
                        <div className="loading-dots__dot" />
                        <div className="loading-dots__dot" />
                      </div>
                    )}
                  </div>
                ) : (
                  transcriptEntries.map((entry) => (
                    <div key={entry.id} className="transcript-line">
                      <span
                        className={`transcript-line__speaker transcript-line__speaker--${entry.speaker}`}
                      >
                        {entry.speaker === "doctor"
                          ? "DR"
                          : entry.speaker === "patient"
                          ? "PT"
                          : "🎙"}
                      </span>
                      <span
                        className={`transcript-line__text ${entry.isPartial ? "transcript-line__text--partial" : ""
                          }`}
                      >
                        {entry.text}
                      </span>
                      <span className="transcript-line__time">
                        {entry.timestamp}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Panel — Analysis */}
            <div className="card analysis-panel">
              <div className="card__header">
                <div className="card__title">⚡ AI Analysis</div>
                <StatusIndicator status={status} />
              </div>
              <div className="analysis-panel__body">
                {/* Keywords */}
                <div className="keyword-panel">
                  {Object.keys(groupedKeywords).length === 0 ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "var(--space-6)",
                        color: "var(--text-tertiary)",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>🔍</div>
                      Medical keywords will appear here as the conversation progresses
                    </div>
                  ) : (
                    (Object.entries(groupedKeywords) as [KeywordCategory, DetectedKeyword[]][]).map(
                      ([category, kws]) => (
                        <div key={category} className="keyword-section">
                          <div className="keyword-section__title">
                            {getCategoryIcon(category)} {getCategoryLabel(category)}
                          </div>
                          <div className="keyword-tags">
                            {kws.map((kw) => (
                              <span
                                key={`${kw.category}-${kw.term}`}
                                className={`keyword-tag keyword-tag--${kw.category}`}
                              >
                                {kw.term}
                                {kw.count > 1 && (
                                  <span className="keyword-tag__count">{kw.count}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    )
                  )}
                </div>

                {/* Patient History */}
                <div className="patient-history">
                  <div className="patient-history__title">
                    📋 Previous History
                  </div>
                  {patientHistory.length > 0 ? (
                    patientHistory.map((h, i) => (
                      <div key={i} className="patient-history__item">
                        <strong>{h.date}</strong>: {h.summary}
                      </div>
                    ))
                  ) : (
                    <div className="patient-history__empty">
                      No previous history found in memory
                    </div>
                  )}
                </div>

                {/* Processing indicator */}
                {isGenerating && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "var(--space-6)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div className="status-indicator status-indicator--processing">
                      <div className="status-indicator__dot" />
                      Generating clinical notes...
                    </div>
                    <div className="loading-dots">
                      <div className="loading-dots__dot" />
                      <div className="loading-dots__dot" />
                      <div className="loading-dots__dot" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Final Report View */}
        {status === "completed" && report && (
          <div className="report-view" id="report-content">
            {/* Patient + Date header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
              padding: "12px 16px",
              background: "var(--surface)",
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>👤</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                    {patientName || "Unknown Patient"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px",
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.2)",
                borderRadius: 6, color: "#34d399",
              }}>✅ Completed</span>
            </div>
            {/* Summary */}
            <div className="report-summary">
              <span className="report-summary__icon">📝</span>
              <div className="report-summary__text" style={{ flex: 1 }}>
                <strong>Summary:</strong>{" "}
                {isEditing ? (
                  <textarea
                    className="edit-textarea edit-textarea--summary"
                    value={editedReport?.summary ?? ""}
                    onChange={(e) => updateEditedSummary(e.target.value)}
                    rows={2}
                    id="edit-summary"
                  />
                ) : (
                  report.summary
                )}
              </div>
            </div>

            <div className="report-grid">
              {/* SOAP Notes */}
              <div className="card">
                <div className="card__header">
                  <div className="card__title">🧾 Clinical Notes (SOAP)</div>
                  {!isEditing && (
                    <button
                      className="btn btn--icon"
                      onClick={() =>
                        copyToClipboard(
                          formatSOAPText(report.soap),
                          "Clinical notes"
                        )
                      }
                      title="Copy Notes"
                    >
                      📋
                    </button>
                  )}
                </div>
                <div className="card__body">
                  <div className="soap-notes">
                    {(
                      [
                        { key: "subjective" as const, label: "S — Subjective", modifier: "subjective" },
                        { key: "objective" as const, label: "O — Objective", modifier: "objective" },
                        { key: "assessment" as const, label: "A — Assessment", modifier: "assessment" },
                        { key: "plan" as const, label: "P — Plan", modifier: "plan" },
                      ] as const
                    ).map((section) => (
                      <div
                        key={section.key}
                        className={`soap-section soap-section--${section.modifier}`}
                      >
                        <div className="soap-section__title">{section.label}</div>
                        <div className="soap-section__content">
                          {isEditing ? (
                            <textarea
                              className="edit-textarea"
                              value={editedReport?.soap[section.key] ?? ""}
                              onChange={(e) =>
                                updateEditedSOAP(section.key, e.target.value)
                              }
                              rows={3}
                              id={`edit-soap-${section.key}`}
                            />
                          ) : (
                            report.soap[section.key]
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Prescription */}
              <div className="card">
                <div className="card__header">
                  <div className="card__title">💊 Prescription</div>
                  {!isEditing && (
                    <button
                      className="btn btn--icon"
                      onClick={() =>
                        copyToClipboard(
                          formatPrescriptionText(report.prescriptions),
                          "Prescription"
                        )
                      }
                      title="Copy Prescription"
                    >
                      📋
                    </button>
                  )}
                </div>
                <div className="card__body" style={{ padding: 0 }}>
                  <div id="prescription-printable">
                    <div className="prescription-card">
                      <div className="prescription-header">
                        <div>
                          <div className="prescription-header__doctor">
                            Dr. [Physician Name]
                          </div>
                          <div className="prescription-header__speciality">
                            Consultant Cardiologist
                          </div>
                        </div>
                        <div className="prescription-header__date">
                          Date: {new Date().toLocaleDateString("en-IN")}
                        </div>
                      </div>
                      <div className="prescription-patient">
                        <span>
                          <strong>Patient:</strong> {patientName || "Unknown Patient"}
                        </span>
                        <span>
                          <strong>Age:</strong> {patientAge ? `${patientAge} yrs` : "—"}
                        </span>
                        <span>
                          <strong>Gender:</strong> {patientGender || "—"}
                        </span>
                      </div>
                      <div className="prescription-rx">℞</div>

                      {isEditing ? (
                        /* ── Editable Prescription Table ──────────── */
                        <div className="edit-prescription">
                          <table className="prescription-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Drug</th>
                                <th>Dosage</th>
                                <th>Frequency</th>
                                <th>Duration</th>
                                <th style={{ width: 40 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(editedReport?.prescriptions ?? []).map(
                                (rx: PrescriptionItem, i: number) => (
                                  <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td>
                                      <input
                                        className="edit-input"
                                        value={rx.drug}
                                        onChange={(e) =>
                                          updateEditedPrescription(i, "drug", e.target.value)
                                        }
                                        placeholder="Drug name"
                                        id={`edit-rx-drug-${i}`}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        className="edit-input"
                                        value={rx.dosage}
                                        onChange={(e) =>
                                          updateEditedPrescription(i, "dosage", e.target.value)
                                        }
                                        placeholder="Dosage"
                                      />
                                    </td>
                                    <td>
                                      <input
                                        className="edit-input"
                                        value={rx.frequency}
                                        onChange={(e) =>
                                          updateEditedPrescription(i, "frequency", e.target.value)
                                        }
                                        placeholder="Frequency"
                                      />
                                    </td>
                                    <td>
                                      <input
                                        className="edit-input"
                                        value={rx.duration}
                                        onChange={(e) =>
                                          updateEditedPrescription(i, "duration", e.target.value)
                                        }
                                        placeholder="Duration"
                                      />
                                    </td>
                                    <td>
                                      <button
                                        className="edit-remove-btn"
                                        onClick={() => removePrescriptionRow(i)}
                                        title="Remove row"
                                        id={`edit-rx-remove-${i}`}
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                          <button
                            className="edit-add-row-btn"
                            onClick={addPrescriptionRow}
                            id="edit-rx-add"
                          >
                            ＋ Add Medication
                          </button>
                        </div>
                      ) : report.prescriptions.length > 0 ? (
                        /* ── Read-only Prescription Table ────────── */
                        <table className="prescription-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Drug</th>
                              <th>Dosage</th>
                              <th>Frequency</th>
                              <th>Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.prescriptions.map(
                              (rx: PrescriptionItem, i: number) => (
                                <tr key={i}>
                                  <td>{i + 1}</td>
                                  <td className="prescription-table__drug">
                                    {rx.drug}
                                  </td>
                                  <td>{rx.dosage}</td>
                                  <td>{rx.frequency}</td>
                                  <td>{rx.duration}</td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <div
                          style={{
                            padding: "24px",
                            textAlign: "center",
                            color: "var(--text-tertiary)",
                            fontSize: 14,
                          }}
                        >
                          No prescriptions were explicitly mentioned in the
                          consultation
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="report-actions no-print">
              {isEditing ? (
                <>
                  <button className="btn btn--primary" onClick={saveEdits} id="btn-save-edits">
                    💾 Save Changes
                  </button>
                  <button className="btn btn--ghost" onClick={cancelEditing} id="btn-cancel-edit">
                    ✕ Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn--edit" onClick={startEditing} id="btn-edit-notes">
                    ✏️ Edit Notes
                  </button>
                  <button className="btn btn--primary" onClick={handleExportPDF}>
                    📄 Download PDF
                  </button>
                  <button className="btn" onClick={handlePrint}>
                    🖨️ Print Prescription
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      copyToClipboard(
                        `${formatSOAPText(report.soap)}\n\n${formatPrescriptionText(
                          report.prescriptions
                        )}\n\nSummary: ${report.summary}`,
                        "Full report"
                      )
                    }
                  >
                    📋 Copy All
                  </button>
                  <button className="btn btn--success" onClick={newConsultation}>
                    🔄 New Consultation
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Copy Feedback Toast */}
      {copyFeedback && <div className="copy-feedback">{copyFeedback}</div>}
    </div>
  );
}

// ── Status Indicator Component ──────────────────────────────
function StatusIndicator({ status }: { status: ConsultationStatus }) {
  const labels: Record<ConsultationStatus, string> = {
    idle: "Ready",
    listening: "Listening",
    processing: "Processing",
    completed: "Completed",
  };

  return (
    <div className={`status-indicator status-indicator--${status}`}>
      <div className="status-indicator__dot" />
      {labels[status]}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────
function formatSOAPText(soap: SOAPNotes): string {
  return `CLINICAL NOTES (SOAP)\n${"─".repeat(40)}\n\nSUBJECTIVE:\n${soap.subjective}\n\nOBJECTIVE:\n${soap.objective}\n\nASSESSMENT:\n${soap.assessment}\n\nPLAN:\n${soap.plan}`;
}

function formatPrescriptionText(prescriptions: PrescriptionItem[]): string {
  if (prescriptions.length === 0) return "No prescriptions.";
  return `PRESCRIPTION\n${"─".repeat(40)}\n${prescriptions
    .map(
      (rx, i) =>
        `${i + 1}. ${rx.drug}\n   Dosage: ${rx.dosage}\n   Frequency: ${rx.frequency}\n   Duration: ${rx.duration}`
    )
    .join("\n\n")}`;
}

