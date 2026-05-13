"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import type { SearchResult } from "@/lib/qdrant-client";

interface SOAPNotes {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface PrescriptionItem {
  drug: string;
  dosage: string;
  frequency: string;
  duration: string;
}

interface Props {
  records: SearchResult[];
  doctorEmail: string;
}

interface EditData {
  summary: string;
  soap: SOAPNotes;
  prescriptions: PrescriptionItem[];
}

export default function DashboardClient({ records, doctorEmail }: Props) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [localRecords, setLocalRecords] = useState<SearchResult[]>(records);
  const [, startTransition] = useTransition();

  // Deduplicate records that share the same patient+date+summary fingerprint.
  // This cleans up any historical duplicates already stored in Qdrant.
  const uniqueRecords = useMemo(() => {
    const seen = new Set<string>();
    return localRecords.filter((r) => {
      const fingerprint = `${r.patientName}|${r.date?.slice(0, 10)}|${r.summary?.slice(0, 80)}`;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
  }, [localRecords]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return uniqueRecords;
    return uniqueRecords.filter(
      (r) =>
        r.patientName.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [search, uniqueRecords]);

  function parseSOAP(raw: string): SOAPNotes | null {
    try { return JSON.parse(raw); } catch { return null; }
  }

  function parsePrescriptions(raw: string): PrescriptionItem[] {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("en-IN", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch { return iso; }
  }

  function formatDateLong(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("en-IN", {
        year: "numeric", month: "long", day: "numeric",
      });
    } catch { return iso; }
  }

  // ── Reprint: Full Clinical Report ─────────────────────────────
  function reprintReport(record: SearchResult) {
    const soap = parseSOAP(record.soapNotes);
    const prescriptions = parsePrescriptions(record.prescriptions);
    const date = formatDateLong(record.date);
    const time = (() => { try { return new Date(record.date).toLocaleTimeString("en-IN"); } catch { return ""; } })();

    const rxRows = prescriptions.map((rx, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="drug">${rx.drug}</td>
        <td>${rx.dosage}</td>
        <td>${rx.frequency}</td>
        <td>${rx.duration}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<title>Clinical Report — ${record.patientName} — notER</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  @page { size: A4; margin: 25mm 25mm 28mm 25mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; font-size: 11pt; color: #1a1a2e; line-height: 1.6; background: #fff; padding: 0; }
  .page-wrap { padding: 8mm 6mm; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid #E11D48; padding-bottom:12px; margin-bottom:18px; }
  .header-left h1 { font-size:22pt; font-weight:700; color:#E11D48; letter-spacing:-0.5px; }
  .header-left p { font-size:9pt; color:#666; margin-top:2px; }
  .header-right { text-align:right; font-size:9pt; color:#555; line-height:1.8; }
  .header-right strong { color:#1a1a2e; font-size:10pt; }
  .reprint-badge { display:inline-block; background:#fef2f2; color:#E11D48; font-size:8pt; font-weight:700; padding:2px 8px; border-radius:3px; border:1px solid #fecdd3; margin-top:4px; }
  .summary-box { background:#fef2f2; border-left:4px solid #E11D48; padding:10px 14px; border-radius:4px; margin-bottom:20px; font-size:10pt; }
  .summary-box strong { color:#E11D48; }
  .section-title { font-size:11pt; font-weight:700; color:#1a1a2e; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1.5px solid #e5e7eb; padding-bottom:5px; margin-bottom:14px; margin-top:22px; }
  .soap-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:6px; }
  .soap-item { background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; padding:10px 14px; }
  .soap-label { font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:5px; }
  .soap-item:nth-child(1) .soap-label { color:#2563EB; }
  .soap-item:nth-child(2) .soap-label { color:#059669; }
  .soap-item:nth-child(3) .soap-label { color:#D97706; }
  .soap-item:nth-child(4) .soap-label { color:#7C3AED; }
  .soap-content { font-size:10pt; color:#374151; line-height:1.55; }
  .rx-symbol { font-family:serif; font-size:24pt; color:#E11D48; display:inline-block; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; font-size:10pt; margin-top:8px; }
  thead tr { background:#1a1a2e; }
  th { padding:8px 12px; text-align:left; color:#fff; font-size:8.5pt; font-weight:600; text-transform:uppercase; letter-spacing:0.07em; }
  td { padding:9px 12px; border-bottom:1px solid #e5e7eb; vertical-align:top; }
  td.drug { font-weight:600; color:#1a1a2e; } td.num { color:#E11D48; font-weight:700; width:30px; }
  tr:last-child td { border-bottom:none; } tr:nth-child(even) { background:#f9fafb; }
  .empty { font-size:10pt; color:#6b7280; font-style:italic; padding:8px 0; }
  .footer { margin-top:30px; padding-top:14px; border-top:1.5px solid #e5e7eb; display:flex; justify-content:space-between; align-items:flex-end; }
  .footer-note { font-size:8pt; color:#9ca3af; }
  .signature { text-align:right; }
  .signature-line { width:180px; border-top:1px solid #374151; margin-top:36px; padding-top:6px; font-size:9pt; color:#555; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body>
  <div class="page-wrap">
  <div class="header">
    <div class="header-left">
      <h1>notER</h1>
      <p>AI Clinical Copilot — Cardiology</p>
    </div>
    <div class="header-right">
      <strong>Clinical Report</strong><br/>
      Patient: ${record.patientName || "Unknown"}<br/>
      Date: ${date}<br/>
      <span class="reprint-badge">📋 REPRINT</span>
    </div>
  </div>
  <div class="summary-box"><strong>Summary:</strong> ${record.summary || "No summary available"}</div>
  <div class="section-title">🧾 Clinical Notes (SOAP)</div>
  <div class="soap-grid">
    <div class="soap-item"><div class="soap-label">S — Subjective</div><div class="soap-content">${soap?.subjective || "Not recorded"}</div></div>
    <div class="soap-item"><div class="soap-label">O — Objective</div><div class="soap-content">${soap?.objective || "Not recorded"}</div></div>
    <div class="soap-item"><div class="soap-label">A — Assessment</div><div class="soap-content">${soap?.assessment || "Not recorded"}</div></div>
    <div class="soap-item"><div class="soap-label">P — Plan</div><div class="soap-content">${soap?.plan || "Not recorded"}</div></div>
  </div>
  <div class="section-title">💊 Prescription</div>
  <div class="rx-symbol">℞</div>
  ${prescriptions.length > 0
    ? `<table><thead><tr><th>#</th><th>Drug</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr></thead><tbody>${rxRows}</tbody></table>`
    : `<p class="empty">No prescriptions were recorded for this consultation.</p>`}
  <div class="footer">
    <div class="footer-note">Reprinted from notER — AI Clinical Copilot<br/>Original: ${date} ${time}<br/>Reprinted: ${new Date().toLocaleString("en-IN")}</div>
    <div class="signature"><div class="signature-line">Doctor's Signature</div></div>
  </div>
  </div>
  <script>window.onload=function(){document.title="notER-reprint-${record.id}.pdf";window.print();}<\/script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("Please allow popups to print the report."); return; }
    w.document.write(html);
    w.document.close();
  }

  // ── Reprint: Prescription Only ─────────────────────────────────
  function reprintPrescription(record: SearchResult) {
    const prescriptions = parsePrescriptions(record.prescriptions);
    if (prescriptions.length === 0) {
      alert("No prescriptions found for this consultation.");
      return;
    }
    const date = formatDateLong(record.date);

    const rxRows = prescriptions.map((rx, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="drug">${rx.drug}</td>
        <td>${rx.dosage}</td>
        <td>${rx.frequency}</td>
        <td>${rx.duration}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html><head><title>Prescription — ${record.patientName} — notER</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  @page { size: A5; margin: 20mm; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Inter',sans-serif; color:#1a1a2e; font-size:10pt; }
  .page-wrap { padding: 6mm 4mm; }
  .rx-header { text-align:center; border-bottom:3px double #E11D48; padding-bottom:12px; margin-bottom:14px; }
  .rx-header h1 { font-size:18pt; color:#E11D48; font-weight:700; }
  .rx-header p { font-size:9pt; color:#666; margin-top:3px; }
  .reprint-badge { display:inline-block; background:#fef2f2; color:#E11D48; font-size:7.5pt; font-weight:700; padding:2px 7px; border-radius:3px; border:1px solid #fecdd3; margin-top:6px; }
  .meta { display:flex; justify-content:space-between; font-size:9pt; padding:8px 0; border-bottom:1px solid #ddd; margin-bottom:12px; }
  .rx-symbol { font-family:serif; font-size:28pt; color:#E11D48; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; font-size:9.5pt; }
  th { background:#1a1a2e; color:#fff; padding:7px 10px; text-align:left; font-size:8pt; text-transform:uppercase; }
  td { padding:8px 10px; border-bottom:1px solid #eee; }
  td:first-child { color:#E11D48; font-weight:700; width:25px; }
  td.drug { font-weight:600; }
  .sig-line { margin-top:35px; display:flex; justify-content:flex-end; }
  .sig { width:160px; border-top:1px solid #333; padding-top:5px; font-size:8pt; color:#666; text-align:center; }
  .footer { margin-top:20px; font-size:7.5pt; color:#aaa; text-align:center; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body>
  <div class="page-wrap">
  <div class="rx-header">
    <h1>notER</h1>
    <p>AI Clinical Copilot — Cardiology</p>
    <span class="reprint-badge">📋 REPRINT</span>
  </div>
  <div class="meta">
    <span><strong>Patient:</strong> ${record.patientName || "Unknown"}</span>
    <span><strong>Date:</strong> ${date}</span>
  </div>
  <div class="rx-symbol">℞</div>
  <table>
    <thead><tr><th>#</th><th>Drug</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr></thead>
    <tbody>${rxRows}</tbody>
  </table>
  <div class="sig-line"><div class="sig">Doctor's Signature</div></div>
  <div class="footer">Reprinted from notER — AI Clinical Copilot &mdash; Original: ${date}</div>
  </div>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("Please allow popups to print the prescription."); return; }
    w.document.write(html);
    w.document.close();
  }

  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "var(--font-sans)", color: "var(--text-primary)" }}>

      {/* ── Navigation ─────────────────────────── */}
      <nav className="header">
        <div className="header__brand">
          <div className="header__logo">🫀</div>
          <div>
            <div className="header__title">
              not<span>ER</span>
            </div>
            <div className="header__subtitle">Patient Records</div>
          </div>
        </div>

        <div className="header__status">
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "var(--text-secondary)",
            padding: "4px 10px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
          }}>
            <span>👨‍⚕️</span> {doctorEmail}
          </div>

          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px",
            background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
            borderRadius: "var(--radius-md)",
            color: "#fff", fontSize: 13, fontWeight: 600,
            textDecoration: "none", boxShadow: "0 2px 10px rgba(225,29,72,0.3)",
          }}>
            ＋ New Consultation
          </Link>

          <form action={logoutAction}>
            <button type="submit" className="btn btn--ghost" style={{ fontSize: 12 }}>
              Sign Out
            </button>
          </form>
        </div>
      </nav>

      {/* ── Content ─────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 40px" }}>

        {/* Stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16, marginBottom: 32,
        }}>
          {[
            { label: "Total Consultations", value: uniqueRecords.length, icon: "📋", color: "var(--accent)" },
            { label: "Patients This Month",
              value: uniqueRecords.filter(r => (r.date || "").startsWith(thisMonth)).length,
              icon: "📅", color: "var(--info)" },
            { label: "Search Results", value: filtered.length, icon: "🔍", color: "var(--success)" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{s.icon}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: s.color, letterSpacing: "-0.04em" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Page heading */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            Consultation History
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Click any record to view SOAP notes and prescriptions
          </p>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 24 }}>
          <span style={{
            position: "absolute", left: 14, top: "50%",
            transform: "translateY(-50%)", fontSize: 14, color: "var(--text-tertiary)",
          }}>🔍</span>
          <input
            id="search-records"
            type="text"
            placeholder="Search by patient name, symptom, drug, or keyword…"
            value={search}
            onChange={(e) => startTransition(() => setSearch(e.target.value))}
            style={{
              width: "100%", padding: "12px 14px 12px 40px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-lg)",
              color: "var(--text-primary)", fontSize: 14,
              outline: "none", transition: "border-color 0.2s",
              fontFamily: "var(--font-sans)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-strong)")}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: 12, top: "50%",
              transform: "translateY(-50%)",
              background: "none", border: "none",
              color: "var(--text-tertiary)", cursor: "pointer", fontSize: 18,
            }}>×</button>
          )}
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "72px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>
              {uniqueRecords.length === 0 ? "📋" : "🔍"}
            </div>
            <div style={{ fontSize: 17, color: "var(--text-secondary)", marginBottom: 6, fontWeight: 600 }}>
              {uniqueRecords.length === 0 ? "No patient records yet" : `No results for "${search}"`}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              {uniqueRecords.length === 0
                ? "Complete a consultation and it will appear here"
                : "Try a different search term"}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((record) => {
              const isExpanded = expandedId === record.id;
              const soap = parseSOAP(record.soapNotes);
              const prescriptions = parsePrescriptions(record.prescriptions);

              return (
                <div key={record.id} className="card" style={{
                  borderColor: isExpanded ? "var(--accent-border)" : "var(--border)",
                  transition: "border-color 0.2s",
                }}>
                  {/* Header row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "16px 20px",
                      background: "none", border: "none",
                      cursor: "pointer", color: "inherit",
                      display: "flex", alignItems: "flex-start",
                      justifyContent: "space-between", gap: 16,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: "flex", alignItems: "center",
                        gap: 10, marginBottom: 6, flexWrap: "wrap",
                      }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                          👤 {record.patientName}
                        </span>
                        <span style={{
                          fontSize: 11, color: "var(--text-tertiary)",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          padding: "2px 8px", borderRadius: "var(--radius-full)",
                        }}>
                          📅 {formatDate(record.date)}
                        </span>
                        {prescriptions.length > 0 && (
                          <span style={{
                            fontSize: 11, color: "var(--success)",
                            background: "var(--success-subtle)",
                            border: "1px solid var(--success-border)",
                            padding: "2px 8px", borderRadius: "var(--radius-full)",
                          }}>
                            💊 {prescriptions.length} Rx
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 8px" }}>
                        {record.summary}
                      </p>
                      {record.keywords.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {record.keywords.slice(0, 6).map((kw) => (
                            <span key={kw} className="keyword-tag keyword-tag--condition">
                              {kw}
                            </span>
                          ))}
                          {record.keywords.length > 6 && (
                            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                              +{record.keywords.length - 6}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span style={{
                      color: "var(--text-tertiary)", fontSize: 16, flexShrink: 0,
                      transition: "transform 0.2s",
                      transform: isExpanded ? "rotate(180deg)" : "none",
                    }}>▾</span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{
                      borderTop: "1px solid var(--border)",
                      padding: "24px 28px",
                      animation: "fadeIn 0.25s ease-out forwards",
                    }}>
                      {/* ── Edit Mode ──────────────────────── */}
                      {editingId === record.id && editData ? (
                        <>
                          {/* Summary */}
                          <div className="card__title" style={{ marginBottom: 10 }}>✏️ Edit Summary</div>
                          <textarea
                            value={editData.summary}
                            onChange={(e) => setEditData({ ...editData, summary: e.target.value })}
                            rows={3}
                            style={{
                              width: "100%", padding: "10px 14px",
                              background: "var(--surface)", border: "1.5px solid var(--accent)",
                              borderRadius: 8, color: "var(--text-primary)",
                              fontSize: 13, fontFamily: "inherit", resize: "vertical",
                              outline: "none", marginBottom: 20,
                            }}
                          />

                          {/* SOAP */}
                          <div className="card__title" style={{ marginBottom: 12 }}>🧾 SOAP Notes</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 24 }}>
                            {(["subjective", "objective", "assessment", "plan"] as (keyof SOAPNotes)[]).map((field) => (
                              <div key={field}>
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 5, letterSpacing: "0.06em" }}>
                                  {field.charAt(0).toUpperCase() + field.slice(1)}
                                </div>
                                <textarea
                                  value={editData.soap[field]}
                                  onChange={(e) => setEditData({ ...editData, soap: { ...editData.soap, [field]: e.target.value } })}
                                  rows={4}
                                  style={{
                                    width: "100%", padding: "8px 12px",
                                    background: "var(--surface)", border: "1px solid var(--border-strong)",
                                    borderRadius: 8, color: "var(--text-primary)",
                                    fontSize: 13, fontFamily: "inherit", resize: "vertical",
                                    outline: "none", transition: "border-color 0.2s",
                                  }}
                                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                                  onBlur={(e) => (e.target.style.borderColor = "var(--border-strong)")}
                                />
                              </div>
                            ))}
                          </div>

                          {/* Prescriptions */}
                          <div className="card__title" style={{ marginBottom: 12 }}>💊 Prescriptions</div>
                          <table className="rx-table" style={{ marginBottom: 8 }}>
                            <thead>
                              <tr>{["#", "Drug", "Dosage", "Frequency", "Duration", ""].map((h) => <th key={h}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {editData.prescriptions.map((rx, i) => (
                                <tr key={i}>
                                  <td className="rx-num">{i + 1}</td>
                                  {(["drug", "dosage", "frequency", "duration"] as (keyof PrescriptionItem)[]).map((f) => (
                                    <td key={f}>
                                      <input
                                        value={rx[f]}
                                        onChange={(e) => {
                                          const updated = editData.prescriptions.map((p, j) => j === i ? { ...p, [f]: e.target.value } : p);
                                          setEditData({ ...editData, prescriptions: updated });
                                        }}
                                        style={{
                                          width: "100%", padding: "4px 8px",
                                          background: "var(--surface)", border: "1px solid var(--border)",
                                          borderRadius: 6, color: "var(--text-primary)",
                                          fontSize: 13, fontFamily: "inherit", outline: "none",
                                        }}
                                        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                                        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                                      />
                                    </td>
                                  ))}
                                  <td>
                                    <button
                                      onClick={() => setEditData({ ...editData, prescriptions: editData.prescriptions.filter((_, j) => j !== i) })}
                                      style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 16, padding: "0 4px" }}
                                    >×</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button
                            onClick={() => setEditData({ ...editData, prescriptions: [...editData.prescriptions, { drug: "", dosage: "", frequency: "", duration: "" }] })}
                            style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "1px dashed var(--accent-border)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", marginBottom: 20 }}
                          >+ Add Row</button>

                          {/* Save / Cancel */}
                          <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)", alignItems: "center" }}>
                            <button
                              disabled={isSaving}
                              onClick={async () => {
                                if (!editData || !editingId) return;
                                setIsSaving(true);
                                try {
                                  const res = await fetch(`/api/records/${editingId}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      summary: editData.summary,
                                      soapNotes: JSON.stringify(editData.soap),
                                      prescriptions: JSON.stringify(editData.prescriptions),
                                    }),
                                  });
                                  if (!res.ok) {
                                    const err = await res.json().catch(() => ({}));
                                    throw new Error(err.error || `Server error ${res.status}`);
                                  }
                                  // Optimistically update local list so UI reflects changes without reload
                                  setLocalRecords((prev) =>
                                    prev.map((r) =>
                                      r.id === editingId
                                        ? {
                                            ...r,
                                            summary: editData.summary,
                                            soapNotes: JSON.stringify(editData.soap),
                                            prescriptions: JSON.stringify(editData.prescriptions),
                                          }
                                        : r
                                    )
                                  );
                                  setEditingId(null);
                                  setEditData(null);
                                } catch (err) {
                                  alert(`❌ Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
                                } finally {
                                  setIsSaving(false);
                                }
                              }}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px",
                                background: isSaving ? "var(--bg-elevated)" : "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                                border: "none", borderRadius: "var(--radius-md)",
                                color: isSaving ? "var(--text-tertiary)" : "#fff",
                                fontSize: 13, fontWeight: 600,
                                cursor: isSaving ? "not-allowed" : "pointer",
                                opacity: isSaving ? 0.7 : 1,
                                transition: "all 0.2s",
                              }}
                            >{isSaving ? "⏳ Saving…" : "✅ Save Changes"}</button>
                            <button
                              onClick={() => { setEditingId(null); setEditData(null); }}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                                background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
                                borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                                fontSize: 13, fontWeight: 600, cursor: "pointer",
                              }}
                            >Cancel</button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* SOAP — view mode */}
                          {soap && (
                            <>
                              <div className="card__title" style={{ marginBottom: 14 }}>🧾 SOAP Notes</div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 24 }}>
                                {([
                                  { key: "s", label: "S — Subjective", value: soap.subjective },
                                  { key: "o", label: "O — Objective",  value: soap.objective },
                                  { key: "a", label: "A — Assessment", value: soap.assessment },
                                  { key: "p", label: "P — Plan",       value: soap.plan },
                                ] as { key: string; label: string; value: string }[]).map((s) => (
                                  <div key={s.key} className={`soap-card soap-card--${s.key}`}>
                                    <div className="soap-card__label">{s.label}</div>
                                    <div className="soap-card__text">{s.value || "Not recorded"}</div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Prescriptions — view mode */}
                          <div className="card__title" style={{ marginBottom: 12 }}>💊 Prescriptions</div>
                          {prescriptions.length > 0 ? (
                            <table className="rx-table">
                              <thead>
                                <tr>{["#", "Drug", "Dosage", "Frequency", "Duration"].map((h) => <th key={h}>{h}</th>)}</tr>
                              </thead>
                              <tbody>
                                {prescriptions.map((rx, i) => (
                                  <tr key={i}>
                                    <td className="rx-num">{i + 1}</td>
                                    <td className="rx-drug">{rx.drug}</td>
                                    <td>{rx.dosage}</td>
                                    <td>{rx.frequency}</td>
                                    <td>{rx.duration}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ fontSize: 13, color: "var(--text-tertiary)", fontStyle: "italic" }}>
                              No prescriptions recorded for this consultation.
                            </p>
                          )}

                          {/* ── Action Bar ─────────────── */}
                          <div style={{ display: "flex", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                            {/* Edit button */}
                            <button
                              id={`edit-record-${record.id}`}
                              onClick={() => {
                                setEditingId(record.id);
                                setEditData({
                                  summary: record.summary,
                                  soap: soap ?? { subjective: "", objective: "", assessment: "", plan: "" },
                                  prescriptions: prescriptions,
                                });
                              }}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                                background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
                                borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                                fontSize: 13, fontWeight: 600, cursor: "pointer",
                                transition: "background 0.15s, border-color 0.15s",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#60a5fa"; e.currentTarget.style.background = "var(--bg-card)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.background = "var(--bg-elevated)"; }}
                            >✏️ Edit</button>

                            <button
                              id={`reprint-report-${record.id}`}
                              onClick={() => reprintReport(record)}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                                background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                                border: "none", borderRadius: "var(--radius-md)",
                                color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                                boxShadow: "0 2px 10px rgba(225,29,72,0.25)", transition: "transform 0.15s, box-shadow 0.15s",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(225,29,72,0.35)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(225,29,72,0.25)"; }}
                            >📄 Reprint Full Report</button>

                            {prescriptions.length > 0 && (
                              <button
                                id={`reprint-rx-${record.id}`}
                                onClick={() => reprintPrescription(record)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                                  background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
                                  borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                                  transition: "background 0.15s, border-color 0.15s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-card)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.background = "var(--bg-elevated)"; }}
                              >💊 Reprint Prescription</button>
                            )}

                            {/* Delete button — pushed to far right */}
                            <button
                              id={`delete-record-${record.id}`}
                              disabled={isDeleting === record.id}
                              onClick={async () => {
                                if (!confirm(`Delete the consultation record for ${record.patientName}? This cannot be undone.`)) return;
                                setIsDeleting(record.id);
                                try {
                                  const res = await fetch(`/api/records/${record.id}`, { method: "DELETE" });
                                  if (!res.ok) {
                                    const err = await res.json().catch(() => ({}));
                                    throw new Error(err.error || `Server error ${res.status}`);
                                  }
                                  setLocalRecords((prev) => prev.filter((r) => r.id !== record.id));
                                  setExpandedId(null);
                                } catch (err) {
                                  alert(`❌ Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
                                } finally {
                                  setIsDeleting(null);
                                }
                              }}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                                marginLeft: "auto",
                                background: "transparent",
                                border: "1px solid #f87171",
                                borderRadius: "var(--radius-md)",
                                color: "#f87171",
                                fontSize: 13, fontWeight: 600,
                                cursor: isDeleting === record.id ? "not-allowed" : "pointer",
                                opacity: isDeleting === record.id ? 0.6 : 1,
                                transition: "background 0.15s, color 0.15s",
                              }}
                              onMouseEnter={(e) => { if (isDeleting !== record.id) { e.currentTarget.style.background = "#f87171"; e.currentTarget.style.color = "#fff"; } }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#f87171"; }}
                            >{isDeleting === record.id ? "🗑️ Deleting…" : "🗑️ Delete"}</button>
                          </div>

                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
