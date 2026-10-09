# Aangan Lead Desk

Inbound phone enquiry system for **Aangan Studio**, an interior design studio in Pune (founder: Nikhil Deshpande, 14 designers).

Every call is answered within 5 seconds, day or night. Each call is qualified against Nikhil's rubric, and qualified leads reach a designer on Telegram within 60 seconds of hang-up with the full brief. Nikhil gets one dashboard covering what the system generates and what it costs.

> **Status:** Phase 0 (scaffold + schema). See [Phases](#phases).

---

## Architecture

```mermaid
flowchart LR
  subgraph Caller
    C[Inbound call]
  end

  subgraph Vaani["Vaani AI (telephony + live agent)"]
    V1[Voice agent answers &lt;5s]
    V2[Transcript + call metadata]
  end

  subgraph Knowledge["/knowledge (single source of truth)"]
    K1[services.md]
    K2[qualified.md]
    K3[pricing.md]
  end

  subgraph App["Next.js on Vercel"]
    B[Build step: generate agent system prompt<br/>+ knowledge_version hash]
    W[/api/webhooks/vaani<br/>verify signature · dedupe · merge 30-min/]
    G[Pricing guardrail<br/>scan AGENT turns]
    S[Claude scorer<br/>strict JSON · zod · retry once]
    R{Outcome router}
    D[/dashboard · /health/]
    CR[Vercel Cron<br/>SLA re-alert · 8pm digest · no-webhook alert]
  end

  subgraph Neon["Neon Postgres (Drizzle)"]
    DB[(callers · calls · enquiries ·<br/>qualification_results · bookings ·<br/>notifications · designers · cost_events ·<br/>config · dead_letters · webhook_receipts)]
  end

  subgraph Out["Handoff"]
    T1[Telegram: hot-lead brief<br/>I'll take it · Reassign · rate 1–5]
    T2[Telegram + email: URGENT to Nikhil]
    T3[Telegram: PRICING_BREACH alert]
    CAL[Calendly: 2 slots / single-use link]
    E[Email: 8pm digest to Nikhil]
  end

  K1 & K2 & K3 --> B --> V1
  C --> V1 --> V2 --> W
  W --> G --> S --> R
  W --> DB
  S --> DB
  R -- QUALIFIED / WITH_NOTE --> T1
  R -- ESCALATED --> T2
  R -- NEEDS_REVIEW --> D
  G -- hit --> T3
  V1 -. qualified caller .-> CAL
  CR --> T1 & E
  DB --> D
```

### Request path (post-call)

1. Vaani POSTs the finished call to `/api/webhooks/vaani`.
2. The route verifies the signature (method confirmed in Phase 3) and logs a `webhook_receipts` row. Unsigned or invalid requests are rejected and logged.
3. **Idempotency:** `calls.vaani_call_id` is unique, so a replayed webhook is a no-op.
4. **Merge:** if the same `from_number` called within `merge_window_minutes` (default 30), the call attaches to the existing enquiry. This covers dropped calls (T17).
5. **Pricing guardrail** runs on the agent's turns only. A hit sets `calls.pricing_breach`, sends a Telegram alert, and shows up on the dashboard.
6. **Claude scorer** returns strict JSON, validated with zod and retried once on parse failure. If it still fails, the call goes to `dead_letters` and the enquiry goes to `NEEDS_REVIEW`.
7. **Router** by outcome:
   - QUALIFIED: brief to the designer.
   - ESCALATED: urgent alert to Nikhil.
   - DECLINED: logged with its reason.
   - NEEDS_REVIEW: dashboard queue.
8. Cost events are written for Vaani minutes, Claude tokens and messages, using rate cards from `config` that Nikhil enters.

### Knowledge → agent

The files in `/knowledge` are the only source of policy. At build time, `scripts/build-prompt` (Phase 1) does three things:
- Concatenates the files into the voice agent's system prompt and the scorer's rubric.
- Writes a SHA-256 `knowledge_version` hash. That hash is stored on every `calls` and `qualification_results` row.
- Pushes the prompt to Vaani, if its API allows it (Phase 3).

Editing a markdown file and redeploying therefore changes the agent's behaviour, and every call can be traced to the policy version it ran under.

---

## Data model

| Table | Purpose |
|---|---|
| `callers` | One row per phone number (E.164) |
| `calls` | Raw Vaani payload, normalised transcript, timing, `in_hours`, `knowledge_version`, `pricing_breach` |
| `enquiries` | The lead. All captured fields, status, **owner** (designer / nikhil / system; NULL shows red), and every funnel timestamp |
| `qualification_results` | Claude's JSON verdict per scoring run, plus model, tokens and attempts |
| `bookings` | Calendly event or single-use link, slot, site-visit flag, status |
| `notifications` | Every Telegram/email/SMS sent, with delivered flag, claimed_at and claimant |
| `designers` | name, telegram_chat_id, calendly_user, email, active |
| `cost_events` | Per-call vendor cost: vendor, unit, qty, unit_cost_inr, total_inr |
| `config` | min_weeks_runway, SLA minutes, merge window, avg project value, baseline, **rate cards (NULL until Nikhil enters them)** |
| `dead_letters` | Anything that failed after retries |
| `webhook_receipts` | Every inbound webhook, for /health and the no-webhook alert |

Migrations live in `/drizzle` and are generated with `npm run db:generate`.

---

## Local setup

```bash
cp .env.example .env.local      # fill in values (never commit)
npm install
npm run db:migrate              # apply migrations to Neon
npm run db:seed                 # non-price config defaults; rate cards left NULL
npm run dev
```

---

## Open policy questions for Nikhil

These are conflicts or gaps in the source documents. The system makes each one **configurable or routes it to a human**. None of them is resolved silently.

1. **Timeline runway: 6 weeks or 8–10 weeks?** `services.md` says execution can't start on a project needed in under **6 weeks**. `qualified.md` says the site must be available for execution within **8–10 weeks** of consultation. These measure different things, and they contradict each other at the margin. `config.min_weeks_runway` defaults to **8**. Nikhil to confirm.
2. **Minimum project size.** Neither document defines one. A 180 sq ft pod (T18) can't be decided from the docs, so it routes to **NEEDS_REVIEW**. Should there be a minimum carpet area?
3. **One failed criterion vs two.** The `qualified.md` intro says: "If it fails one, close gracefully." The boundary section says: "Two or more criteria fail → decline." Current implementation:
   - A clear **fail on criterion 1, 2 or 3** declines on its own. This matches T03 (Nashik), T04 (advice only) and T07 (3-week timeline).
   - Criteria 4 and 5 only decline on a clear, volunteered fail.
   - Two or more fails always decline.
4. **The Cut: quoting per-sq-ft pricing.** Nikhil asked for the agent to "quote our standard per-square-foot pricing". `pricing.md` says no number may ever be quoted, because pricing is indicative and varies by site. **We are not building price quoting.** The agent uses only the approved deflection line, and a guardrail alerts on any slip. This is Check 07 (judgment protected).
5. **"Clearly below scope" budget.** The scorer may use `pricing.md` *internally* to judge a volunteered figure (e.g. ₹1–1.5L for a full flat). It never speaks those figures. Should the rule instead be a fixed table Nikhil signs off?
6. **Research on behalf of others.** "Research for my in-laws" is "not sufficient on its own", but "unclear on 5" means qualified with a note. The current reading:
   - The caller explicitly says they are not authorised: fail.
   - Authority is ambiguous: QUALIFIED_WITH_NOTE.
7. **Designer assignment.** Options are round-robin, by locality, by project type, or by load. The default is round-robin across active designers, pending Nikhil's preference.
8. **Calendar source.** The component map shows Google Calendar. The build brief specifies Calendly. We're building **Calendly**.
9. **CRM.** The component map shows HubSpot. The build brief makes **Neon the system of record**. HubSpot sync is not in scope. Do we need it later?
10. **Call recording & consent.** Under the DPDP Act 2023, the agent should disclose that calls are recorded and transcribed. Nikhil to approve the disclosure wording.
11. **Commercial projects over ~3,000 sq ft.** `services.md` says "up to approximately 3,000 sq ft". Should these decline, or go to NEEDS_REVIEW? The default is NEEDS_REVIEW.
12. **Senior callback SLA for escalations.** How fast must Nikhil or a senior call back an existing client?

---

## Phases

| # | Scope | Needs from Nikhil |
|---|---|---|
| 0 | Repo, Next.js scaffold, Neon schema + migrations, `.env.example`, this README | GitHub repo, Neon connection string, Vercel project |
| 1 | Knowledge loader, prompt generator, Claude scorer (zod) | Anthropic key, model IDs |
| 2 | Evals: 19 September transcripts + red-team pricing tests | Transcript PDF (provided) |
| 3 | Vaani webhook, signature, agent config push | Vaani docs, keys, rate card, language support |
| 4 | Calendly availability + booking/link flow | Calendly token, designer mapping, SMS/WhatsApp sender |
| 5 | Telegram bot (brief, claim, reassign, rating, SLA) + email digest | Bot token, chat IDs, email provider + key |
| 6 | Dashboard, /health, cost tracking | Rate cards, dashboard auth choice |
| 7 | Deploy, 5 end-to-end test calls, launch checklist | — |

## The nine checks → features

| Check | Feature |
|---|---|
| 01 Problem real | Dashboard "Response time" tile: baseline (48% unanswered at 48h) vs live |
| 02 Workflow repeated | Qualification rules are read from `qualified.md` via the knowledge loader, with one rubric module |
| 03 Input available | `/health`: last Vaani webhook, Calendly, Telegram, Neon, Claude |
| 04 Output valuable | Brief fields are never blank (they read "unknown"); designers rate it 1–5 in Telegram |
| 05 Impact measurable | Every funnel timestamp is stored on `enquiries`; the dashboard computes from them only |
| 06 Failure risk OK | Pricing guardrail, escalation, signature check, idempotency, retries → `dead_letters`, no-webhook alert |
| 07 Judgment protected | No price quoting, no aesthetic judgment, NEEDS_REVIEW queue, humans own callbacks |
| 08 ROI worth it | Cost per qualified lead and pipeline-vs-spend from day one |
| 09 Owner clear | `enquiries.owner_type`; unowned shows red |

---

## Future channels (documented, not built)

The pipeline after "transcript received" doesn't depend on the channel. Adding a channel means adding an adapter that produces the same `{ caller, transcript_or_fields, channel }` input.

- **WhatsApp (Business API).** A WhatsApp Business webhook goes to `/api/webhooks/whatsapp`. Messages are grouped into a conversation per number, using the same 30-minute merge window. The thread is normalised into the same transcript format and passed to the **same Claude scorer**. A qualified lead gets the **same Telegram brief**. `enquiries.channel = 'whatsapp'`. The same pricing guardrail scans outbound auto-replies, if any are added. The dashboard filters by channel.
- **Website form.** The form POSTs to `/api/intake/form`. Most fields arrive pre-filled (locality, BHK, scope, timeline), so the scorer gets structured fields plus any free-text message. It mainly fills gaps and lists `open_questions`. `enquiries.channel = 'web_form'`. Same routing, brief, SLA and dashboard.

Because every channel writes to the same `enquiries` table with the same funnel timestamps, Nikhil's monthly summary covers all three channels without any changes to the dashboard.
