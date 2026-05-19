# NotER — AI Clinical Copilot for Cardiologists

<div align="center">

![NotER Logo](https://img.shields.io/badge/NotER-AI%20Clinical%20Copilot-red?style=for-the-badge&logo=heart&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Vapi](https://img.shields.io/badge/Vapi-Voice%20AI-purple?style=for-the-badge)
![Gemini](https://img.shields.io/badge/Gemini%203.1%20Pro-AI%20Backend-orange?style=for-the-badge&logo=google)
![JWT](https://img.shields.io/badge/JWT-Auth-green?style=for-the-badge&logo=jsonwebtokens)

**A passive, real-time AI scribe that listens to doctor-patient conversations and generates structured clinical notes, SOAP documentation, and prescriptions — automatically.**

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Authentication System](#-authentication-system)
- [How It Works](#-how-it-works)
- [Patient Records Dashboard](#-patient-records-dashboard)
- [API Reference](#-api-reference)
- [Vapi Dashboard Setup](#-vapi-dashboard-setup)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Known Issues & Limitations](#-known-issues--limitations)
- [Roadmap](#-roadmap)

---

## 🏥 Overview

**NotER** is an AI-powered clinical copilot designed specifically for cardiologists. It passively listens to a live doctor-patient consultation using voice AI (Vapi + Deepgram), transcribes the conversation in real-time, detects cardiology-specific medical keywords, and at the end of the session — automatically generates:

- 📋 **SOAP Notes** (Subjective / Objective / Assessment / Plan)
- 💊 **Structured Prescription** (Drug, Dosage, Frequency, Duration)
- 📝 **1–2 line consultation summary**
- 📄 **High-quality PDF export** (vector-based, print-ready)
- 🔐 **Secure doctor authentication** with JWT access + refresh tokens
- 📊 **Patient records dashboard** with full search & history

The doctor never touches a keyboard during the consultation. The AI silently takes notes in the background.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎙️ **Real-time Voice Transcription** | Vapi + Deepgram Nova-2 captures and transcribes the consultation live |
| 🤫 **Passive Listening Mode** | AI is completely silent — does not interrupt the consultation |
| 🧠 **AI Medical Scribe** | Google Gemini 3.1 Pro generates professional SOAP notes from raw transcript |
| 💊 **Prescription Extraction** | Automatically extracts all prescribed medications from conversation |
| 🔍 **Medical Keyword Detection** | 200+ cardiology terms detected and color-coded in real-time |
| 👤 **Patient Name Tracking** | Doctor enters patient name before each consultation — records are personalized |
| 📋 **Patient History Memory** | Consultations stored in Qdrant vector DB and recalled via semantic search |
| 🔐 **AES-256-GCM Encryption** | Patient records encrypted at field level before storage |
| 🌐 **Translation Support** | Auto-translates Hindi/Hinglish transcripts to English via Gemini |
| 📊 **Patient Records Dashboard** | Searchable dashboard with expandable SOAP notes & prescription tables |
| 🔐 **JWT Authentication** | Production-grade auth with 15-min access tokens + 7-day refresh tokens |
| 📄 **Vector PDF Export** | Browser print-based PDF — crisp text, no blurry screenshots |
| 🖨️ **Print Prescription** | Print-optimized prescription layout for direct patient handout |
| 📋 **Copy to Clipboard** | Copy SOAP notes, prescription, or full report to clipboard |
| 🌐 **Localtunnel Support** | Works locally with Vapi webhook via localtunnel |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DOCTOR'S BROWSER                              │
│                                                                      │
│  ┌───────────┐  ┌──────────────────────────────────────────────────┐│
│  │ /login    │──▶│       JWT Authentication (jose)                 ││
│  └───────────┘  │  Access Token (15 min) + Refresh Token (7 day)  ││
│                  └──────────────────────────────────────────────────┘│
│  ┌───────────┐  ┌──────────────────────────────────────────────────┐│
│  │ /         │──▶│       Consultation Page                         ││
│  │           │  │  Patient Name → Live Transcript → SOAP + Rx     ││
│  └───────────┘  └──────────────────────────────────────────────────┘│
│  ┌───────────┐  ┌──────────────────────────────────────────────────┐│
│  │/dashboard │──▶│       Patient Records Dashboard                 ││
│  │           │  │  Search → Expand → View SOAP + Prescriptions    ││
│  └───────────┘  └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────┐           ┌──────────────────────┐
│   VAPI Platform  │           │  Next.js API Routes  │
│                  │           │                      │
│  Deepgram        │───Webhook─▶  /api/vapi/webhook   │
│  Nova-2 STT      │           │           │          │
│                  │           │           ▼          │
│  Silent LLM      │           │  /api/generate-notes │
│  (no output)     │           │           │          │
└─────────────────┘           │           ▼          │
                               │  KodeKloud Gemini    │
                               │  3.1 Pro (LLM)       │
                               │           │          │
                               │           ▼          │
                               │  Qdrant Vector DB    │
                               │  (Patient Memory)    │
                               └──────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------| 
| **Frontend** | Next.js 16 (App Router) + TypeScript | React web application |
| **Styling** | Custom CSS — Unified Dark Medical Theme | Premium hospital-grade UI |
| **Voice AI** | Vapi Web SDK | Real-time microphone capture + WebSocket |
| **Transcription** | Deepgram Nova-2 | Speech-to-text with multi-language support |
| **LLM** | Google Gemini 3.1 Pro (via KodeKloud AI) | SOAP note + prescription generation |
| **Vector DB** | Qdrant (cloud) | Patient history semantic search memory |
| **Authentication** | JWT (jose) — Access + Refresh tokens | Secure doctor login with auto-refresh |
| **PDF Export** | Browser Print CSS (vector rendering) | Crisp, professional clinical reports |
| **Tunnel** | localtunnel | Expose localhost to Vapi webhooks during dev |

---

## 📁 Project Structure

```
<<<<<<< HEAD
NotER/
=======
NotER-AI-Clinical-Copilot/
>>>>>>> 4a2fe9c8acc5468abfd840cac43fe58eff1bdce8
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate-notes/
│   │   │   │   └── route.ts           # POST — LLM report generation
│   │   │   ├── vapi/
│   │   │   │   └── webhook/
│   │   │   │       └── route.ts       # POST — Vapi event handler
│   │   │   ├── memory/
│   │   │   │   └── route.ts           # GET/POST — Qdrant operations
│   │   │   ├── records/
│   │   │   │   ├── route.ts           # GET — Dashboard record listing + search
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts       # PATCH/DELETE — Update or delete a record
│   │   │   └── translate/
│   │   │       └── route.ts           # POST — Hindi/Hinglish → English translation
│   │   ├── actions/
│   │   │   └── auth.ts                # Server Actions: login + logout
│   │   ├── dashboard/
│   │   │   ├── page.tsx               # Dashboard server component
│   │   │   └── DashboardClient.tsx    # Dashboard client UI (search, expand, SOAP)
│   │   ├── login/
│   │   │   └── page.tsx               # Doctor login page
│   │   ├── globals.css                # Unified dark medical design system
│   │   ├── layout.tsx                 # Root layout with SEO meta tags
│   │   └── page.tsx                   # Main consultation page
│   ├── lib/
│   │   ├── llm-client.ts             # Gemini API client via KodeKloud (OpenAI SDK)
│   │   ├── encryption.ts             # AES-256-GCM field-level encryption for records
│   │   ├── medical-keywords.ts       # 200+ cardiology keyword regex engine
│   │   ├── qdrant-client.ts           # Vector DB client (store + search + scroll + update + delete)
│   │   ├── pdf-export.ts             # Print-CSS PDF + prescription utilities
│   │   ├── session.ts                # JWT auth: access + refresh token management
│   │   └── middleware-session.ts     # Edge-compatible JWT helpers for middleware
│   └── middleware.ts                  # Route protection + auto token refresh
├── .env                               # Environment variables
├── next.config.ts                     # Next.js config (CORS for localtunnel)
├── test-runner.mjs                    # Automated backend test suite (16 tests)
├── test-encryption.mjs                # Encryption module test suite
├── test-qdrant-encryption.mjs         # Qdrant + encryption integration tests
├── test-session-jwe.mjs               # JWT/JWE session test suite
├── test.md                            # Full 60-iteration test documentation
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+
- **npm** v9+
- A **Vapi** account → [vapi.ai](https://vapi.ai)
- A **KodeKloud AI** API key → [ai.kodekloud.com](https://ai.kodekloud.com) *(OpenAI-compatible, powers Gemini)*
- A **Qdrant** cloud account → [cloud.qdrant.io](https://cloud.qdrant.io) *(optional)*

### 1. Clone & Install

```bash
git clone https://github.com/adhipatya3552/NotER-AI-Clinical-Copilot.git
<<<<<<< HEAD
cd NotER--Clincial-Transcription-AI
=======
cd NotER-AI-Clinical-Copilot
>>>>>>> 4a2fe9c8acc5468abfd840cac43fe58eff1bdce8
npm install
```

### 2. Configure Environment Variables

Create a `.env` file (see [Environment Variables](#-environment-variables) below).

### 3. Start Development Server

```bash
npm run dev
```

App runs at → **http://localhost:3000**

### 4. Start Localtunnel (for Vapi webhook)

Open a **second terminal**:

```bash
npx localtunnel --port 3000 --subdomain my-noter-app
```

Your full webhook URL: **`https://my-noter-app.loca.lt/api/vapi/webhook`**

### 5. Login

Navigate to `http://localhost:3000` → you'll be redirected to `/login`.

**Default credentials:**
```
Email:    12341234@gmail.com
Password: 12341234
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | ✅ Yes | Vapi public key from [dashboard.vapi.ai](https://dashboard.vapi.ai) |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | ✅ Yes | Vapi Assistant ID — the pre-configured silent assistant |
| `NEXT_PRIVATE_VAPI_PRIVATE_KEY` | Optional | Vapi private/server key (for server-side API calls) |
| `GEMINI_API_KEY` | ✅ Yes | KodeKloud AI API key (starts with `sk-`). Powers Gemini via OpenAI-compatible endpoint |
| `QDRANT_URL` | Optional | Qdrant cloud cluster URL (e.g. `https://xxx.aws.cloud.qdrant.io`) |
| `QDRANT_API_KEY` | Optional | Qdrant JWT API key for authentication |
| `DOCTOR_EMAIL` | ✅ Yes | Login email for the doctor account |
| `DOCTOR_PASSWORD` | ✅ Yes | Login password for the doctor account |
| `SESSION_SECRET` | ✅ Yes | 64-char hex secret for signing access JWTs |
| `SESSION_REFRESH_SECRET` | ✅ Yes | 64-char hex secret for signing refresh JWTs (must differ from `SESSION_SECRET`) |
| `RECORD_ENCRYPTION_SECRET` | ✅ Yes | 64-char hex key (32 bytes) for AES-256-GCM patient record encryption |
| `NEXT_PUBLIC_DEFAULT_EMAIL` | Optional | Pre-fills the email field on the login page (convenience for dev) |

> If `QDRANT_URL` is not set, the memory/dashboard features silently skip. All other features still work.
>
> Generate hex secrets with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 🔐 Authentication System

NotER uses a production-grade JWT authentication system with the following architecture:

### Token Strategy

| Token | Lifetime | Purpose | Storage |
|-------|----------|---------|---------|
| **Access Token** | 15 minutes | Authorizes every request | `noter_access` HttpOnly cookie |
| **Refresh Token** | 7 days | Silently renews access tokens | `noter_refresh` HttpOnly cookie |

### How It Works

1. **Login** → Doctor submits email + password → server validates against `.env` credentials
2. **Token Issuance** → Two JWTs are generated (access + refresh) and set as HttpOnly cookies
3. **Request Authorization** → Middleware checks the access token on every route
4. **Silent Refresh** → If access token expires, middleware uses the refresh token to issue a new one — **no re-login needed for 7 days**
5. **Logout** → Both cookies are deleted, doctor is redirected to `/login`

### Security Best Practices

- ✅ **HttpOnly cookies** — immune to XSS attacks (JavaScript cannot read the tokens)
- ✅ **SameSite=lax** — protects against CSRF attacks
- ✅ **Separate signing keys** — access and refresh tokens use different secrets
- ✅ **Short-lived access tokens** — limits damage window if compromised
- ✅ **Edge middleware** — route protection runs before page rendering
- ✅ **Secure flag** — cookies are HTTPS-only in production

### Protected Routes

| Route | Access |
|-------|--------|
| `/login` | Public |
| `/api/vapi/webhook` | Public (Vapi needs access) |
| `/` (consultation) | 🔒 Auth required |
| `/dashboard` | 🔒 Auth required |
| All other routes | 🔒 Auth required |

---

## ⚙️ How It Works

### Step 1 — Login & Patient Name
Doctor logs in with credentials. On the consultation page, they enter the **patient's name** (required before starting).

### Step 2 — Consultation Starts
Doctor clicks **"Start Consultation"**. The Vapi Web SDK opens a WebSocket to Vapi's servers. Deepgram Nova-2 starts listening to the microphone.

### Step 3 — Live Transcription
As doctor and patient speak, Deepgram transcribes in real-time. Text chunks appear live on the doctor's screen. The AI model on Vapi is set to **complete silence** and never speaks.

### Step 4 — Keyword Detection
Each new transcript segment is scanned against a 200+ term cardiology regex engine. Detected terms (symptoms, drugs, tests, diagnoses) are color-coded in the **AI Analysis** panel.

### Step 5 — Consultation Ends
Doctor clicks **"End Consultation"**. Vapi stops. The full transcript is compiled and sent to `/api/generate-notes`.

### Step 6 — Report Generation
The backend sends the raw transcript to **Gemini 3.1 Pro** via KodeKloud's OpenAI-compatible API. The model extracts SOAP notes, prescriptions, and a summary — all returned as structured JSON.

### Step 7 — Encryption & Memory Storage
All sensitive fields (SOAP notes, prescriptions, transcript, summary) are **encrypted with AES-256-GCM** before being stored in **Qdrant**. Each encryption uses a unique random IV, preventing pattern analysis. Data is decrypted on-the-fly when retrieved for the dashboard.

### Step 8 — PDF Export
Doctor can download the clinical report as a **crisp vector PDF** or print the prescription directly — both use browser-native rendering for professional quality.

---

## 📊 Patient Records Dashboard

The dashboard (`/dashboard`) provides a comprehensive view of all stored consultations:

- **Stats Cards** — Total consultations, this month's count, search results
- **Semantic Search** — Filter records by patient name, symptom, drug, or keyword
- **Expandable Records** — Click any record to view full SOAP notes and prescription table
- **Navigation** — Quick links between consultation page and dashboard
- **Sign Out** — Securely ends the session

Each record stores:
| Field | Content |
|-------|---------|
| Patient Name | Entered by doctor before consultation |
| Date | Auto-captured consultation date |
| Summary | AI-generated 1-2 line summary |
| Keywords | Detected medical terms |
| SOAP Notes | Full Subjective/Objective/Assessment/Plan |
| Prescriptions | Drug, dosage, frequency, duration table |
| Transcript | Raw conversation text |

---

## 📡 API Reference

### `POST /api/generate-notes`
Generates a structured clinical report from a raw transcript.

**Request:**
```json
{ "transcript": "Doctor: Good morning. Patient: I have chest pain..." }
```

**Response:**
```json
{
  "soap": {
    "subjective": "Patient reports 2 weeks of exertional chest pain...",
    "objective": "BP 150/90, HR 82...",
    "assessment": "Suspected unstable angina...",
    "plan": "Start Aspirin, Atorvastatin, repeat ECG..."
  },
  "prescriptions": [
    { "drug": "Aspirin", "dosage": "150mg", "frequency": "Once daily", "duration": "Ongoing" }
  ],
  "summary": "45-year-old with exertional chest pain and hypertension."
}
```

### `POST /api/vapi/webhook`
Receives real-time events from Vapi.

| `message.type` | Action |
|----------------|--------|
| `assistant-request` | Returns silent assistant config |
| `transcript` | Logs transcript chunk to console |
| `end-of-call-report` | Receives full transcript + summary |
| `status-update` | Logs call status |

### `GET /api/memory?q={query}&limit={n}`
Searches Qdrant for similar past consultations.

### `POST /api/memory`
Stores a consultation record in Qdrant with patient name, SOAP notes, prescriptions, and transcript.

### `GET /api/records?search={query}`
Fetches all consultation records for the dashboard. Supports optional semantic search filtering.

### `PATCH /api/records/{id}`
Updates an existing consultation record's editable fields (summary, SOAP notes, prescriptions, keywords). Re-encrypts updated content before storing.

**Request:**
```json
{
  "summary": "Updated summary...",
  "soapNotes": "Updated SOAP text...",
  "prescriptions": "Updated prescriptions text...",
  "keywords": ["hypertension", "aspirin"]
}
```

### `DELETE /api/records/{id}`
Permanently deletes a consultation record from Qdrant.

### `POST /api/translate`
Translates Hindi/Hinglish medical text to English using Gemini.

**Request:**
```json
{ "text": "Mujhe seene mein dard ho raha hai" }
```

**Response:**
```json
{ "translated": "I am having chest pain" }
```

---

## 🎙️ Vapi Dashboard Setup

1. Log in to [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Create a new **Assistant**
3. **Model tab:**
   - Provider: `OpenAI`, Model: `gpt-4o-mini`
   - System Prompt:
     ```
     You are a completely silent observer. You must NEVER speak, NEVER respond,
     and NEVER acknowledge anything. Output an empty response and remain completely silent.
     ```
4. **Transcriber tab:**
   - Provider: `Deepgram`, Model: `Nova-2`, Language: `multi`
   - Leave **Keyterms empty**
5. **Advanced → Server URL:**
   - URL: `https://my-noter-app.loca.lt/api/vapi/webhook`
   - Header: `bypass-tunnel-reminder: true`

---

## 🧪 Testing

### Run Automated Tests (16 backend tests)

```bash
node test-runner.mjs
```

**Latest result: 16/16 PASS ✅**

Tests cover: app connectivity, generate-notes API, Vapi webhook events, memory API, and KodeKloud API direct connection.

### Full Test Documentation

See [`test.md`](./test.md) — a 60-iteration test plan covering infrastructure, all API routes, frontend UI states, and report output.

---

## 🌐 Deployment

> **Production requires HTTPS** — browsers block microphone access on plain HTTP.

### Deploy to Vercel

```bash
npx vercel
```

Set **all** environment variables in **Vercel Dashboard → Settings → Environment Variables** (including `GEMINI_API_KEY`, `DOCTOR_EMAIL`, `DOCTOR_PASSWORD`, `SESSION_SECRET`, `SESSION_REFRESH_SECRET`, and `RECORD_ENCRYPTION_SECRET`).

After deploying, update the **Vapi Server URL** from your localtunnel URL to:
```
https://your-app.vercel.app/api/vapi/webhook
```

---

## ⚠️ Known Issues & Limitations

| Issue | Status | Workaround |
|-------|--------|-----------|
| Localtunnel shows "Click to Continue" for bots | Active | Add `bypass-tunnel-reminder: true` header in Vapi |
| Localtunnel URL changes on every restart | Active | Use a paid Ngrok plan for a persistent URL |
| Vapi free tier has monthly minute limits | Active | Upgrade Vapi plan for production |
| Microphone blocked if another app is using it | Active | Close other apps using mic before starting |
| Speaker labels not automatically separated | Partial | All Vapi audio shows 🎙 badge; LLM infers context |
| Single doctor account (via .env) | Active | Extend to database-backed multi-user for production |

---

## 🗺️ Roadmap

- [x] Real-time voice transcription (Vapi + Deepgram)
- [x] SOAP note generation (Gemini 3 Flash via KodeKloud)
- [x] AES-256-GCM field-level encryption for patient records
- [x] Hindi/Hinglish → English medical translation
- [x] Prescription extraction
- [x] Medical keyword highlighting (200+ terms)
- [x] PDF export and print prescription (vector quality)
- [x] Qdrant patient history memory
- [x] JWT authentication (access + refresh tokens)
- [x] Patient records dashboard with search
- [x] Per-patient name tracking
- [x] Unified dark medical UI theme
- [x] Localtunnel with bypass header support
- [x] Full 60-iteration test plan
- [ ] Speaker diarization (auto-label Doctor vs Patient)
- [ ] Multi-doctor accounts with database-backed auth
- [ ] EHR integration (HL7 / FHIR export)
- [ ] Hindi / regional language transcription
- [ ] Mobile-responsive layout
- [ ] Auto-save on tab close

---

<div align="center">

Built with ❤️ for doctors who deserve to focus on patients, not paperwork.

</div>
