# Resume Screener

**Intelligent Resume Screening & Ranking System with Typed AI Models (Jev / System One)**

> Курсовий проєкт «Система інтелектуального скринінгу та ранжування резюме з використанням типізованих AI-моделей»
> MVP development: 14 Sep 2026 – 30 Nov 2026 (12 weeks)

## Overview

Resume Screener is an MVP web service that automates the first stage of recruitment. It ingests unstructured resume files (PDF/DOCX), matches each candidate's profile against a job posting's requirements using a **typed fast-decision AI model (System One, "Jev")**, and returns a structured, numeric assessment — a ranked list of candidates with a transparent match index.

Unlike naive "paste a resume into a chatbot" approaches, the system relies on a **typed data contract** (stack of technologies, years of commercial experience, risk flags, match index) instead of free-form generation. This makes scoring deterministic, cheap, fast, resistant to prompt-injection attacks, and compliant with high-risk-system requirements of the EU AI Act.

## Key Features

- **Job postings with screening filters** — required/desired skills, minimum years of experience, minimum match index threshold
- **Bulk resume upload** — PDF/DOCX up to 10 MB each, via button, drag-and-drop, or API
- **Asynchronous processing** — durable task queue (one resume = one job), live progress counters (processed / queued / failed) without page reloads
- **Text extraction & preprocessing** — automatic text extraction from PDF/DOCX; removal of PII (name, email, phone, address, photo) before anything is sent to the AI model
- **Prompt-injection protection** — detection of hidden text (white / tiny font) and AI-targeted instructions; such text is excluded from scoring and the candidate is flagged
- **Typed AI verdicts** — the Jev model returns a separate verdict with a confidence level (0–1) for every job requirement; low confidence on mandatory requirements marks a candidate as *Needs manual review*
- **Transparent scoring** — the final match index is computed by the system's own scoring module via a weighted formula over requirement verdicts (not by the model); contribution of each requirement is stored and visible to the recruiter
- **Candidate table & cards** — sorting, filtering by skills/experience/index/warnings, statuses (Approved / Rejected / Pending), original file access via short-lived links
- **Export** — CSV export of the current filtered list and a printable job report
- **REST API `/api/v1`** — versioned, documented with OpenAPI; API keys are stored hashed and revocable
- **Multi-tenancy & security** — per-company data isolation (403 on foreign data), HTTPS-only, Google SSO login (no passwords stored), rate limiting (default 200 req/min per key → 429)
- **Data retention** — hard deletion of all candidate data within 24 h after removal; automatic deletion 1 year after a job is closed or deleted; daily DB backups

## Architecture

Client–server system: the web client talks to the backend exclusively through the REST API. Resumes are processed asynchronously by workers; files live in object storage while the relational DB keeps only metadata, scores, and configuration.

| # | Subsystem | Purpose |
|---|-----------|---------|
| 1 | Web Interface | Recruiter workspace: jobs, upload, candidate table & card, export |
| 2 | REST API (`/api/v1`) | Handles UI and external-system requests, OpenAPI docs |
| 3 | Authentication | Google SSO login, hashed & revocable API keys, 30-min session timeout |
| 4 | Text Extraction Module | Extracts text from PDF/DOCX (≤ 10 MB); flags scans as unreadable |
| 5 | Preprocessing Module | PII stripping, hidden-text & prompt-injection detection |
| 6 | Task Queue & Workers | Durable background processing with retries and backoff |
| 7 | AI Model Integration | Swappable adapter for the typed Jev model; per-job versioned evaluation configs |
| 8 | Scoring Module | Transparent weighted match-index formula; ≤ 5% result variance |
| 9 | Export Module | CSV and printable report generation |
| 10 | Relational Database | Jobs, candidates, scores, configs; daily backups; tenant isolation |
| 11 | Object Storage | Encrypted resume files, short-lived access links only |
| 12 | Data Retention Module | Scheduled/deferred deletion of candidate data |

## Non-Functional Requirements (highlights)

- UI pages, sorting, and filtering respond in ≤ 1 s; API responds in ≤ 200 ms for 95% of requests
- 99% monthly availability; failure of one component (e.g., export) never blocks other features
- Horizontal & vertical scaling of workers — extra instances or more parallel jobs, zero code changes
- Model calls throttled to the Jev API limits; on outage — retry with growing interval, then `Processing failed` status with manual/requeued restart
- Deterministic scoring: same inputs → ≤ 5% divergence in results
- No name, photo, age, gender, or nationality is used in evaluation
- Everything runs in Docker containers with a single command; secrets only via environment variables; CI/CD runs tests on every change

## Project Plan (Wrike)

Managed in Wrike ("Jev Screening Team" space, project **Jev Resume Screening MVP**): 36 tasks, 5 milestones, ~394 person-hours across 5 stages:

| Stage | Dates | Result |
|-------|-------|--------|
| 1. Preparation | 14.09 – 20.09 | Approved project description (ПР1) |
| 2. Planning | 21.09 – 04.10 | Requirements (ПР2–ПР4), architecture, DB schema, typed data contract, CI/CD |
| 3. Development | 05.10 – 20.11 | All modules implemented, end-to-end integration |
| 4. Testing | 26.10 – 22.11 | Test plan, functional & security testing, optimization, code freeze |
| 5. Launch | 23.11 – 30.11 | Docker Compose, cloud test deployment, load check, MVP demo |

## Team

| Member | Role | Responsibility |
|--------|------|----------------|
| Maksym Semeniuk | Team Lead / Systems Architect | Coordination, architecture, API, authentication, preprocessing |
| Ivan Hushchin | Backend & AI Engineer | PDF/DOCX parsing, Jev integration, scoring, task queue, optimization |
| Myroslav Verstiuk | Frontend / UI Engineer | Web interface, candidate table & card, upload, export |
| Andriy Chernenko | QA & DevOps Engineer | Wrike, Git, CI/CD, testing, Docker, deployment |

## Status

Course reports ПР1–ПР5 (project description, user & functional requirements, non-functional requirements, system requirements, Wrike project plan) are completed. Development stage is in progress; see the roadmap above for planned deliverables:

- Working web-service prototype deployed locally or in a test cloud environment
- REST API with endpoints for job posting, resume batch upload, and typed match reports
- Text extraction & normalization module for PDF/DOCX
