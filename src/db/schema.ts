import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const intentEnum = pgEnum("intent", [
  "NEW_ENQUIRY",
  "EXISTING_CLIENT",
  "OUT_OF_SCOPE",
  "UNKNOWN",
]);

export const outcomeEnum = pgEnum("outcome", [
  "QUALIFIED",
  "QUALIFIED_WITH_NOTE",
  "DECLINED",
  "ESCALATED",
  "NEEDS_REVIEW",
]);

// Enquiry lifecycle. OPEN = scored but not yet routed; PRICING_BREACH is a flag on calls, not a status.
export const enquiryStatusEnum = pgEnum("enquiry_status", [
  "OPEN",
  "QUALIFIED",
  "QUALIFIED_WITH_NOTE",
  "DECLINED",
  "ESCALATED",
  "NEEDS_REVIEW",
  "CLAIMED",
  "BOOKED",
  "CONSULTATION_HELD",
  "CLOSED",
]);

export const ownerTypeEnum = pgEnum("owner_type", ["designer", "nikhil", "system"]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "telegram",
  "email",
  "sms",
  "whatsapp",
]);

export const notificationKindEnum = pgEnum("notification_kind", [
  "hot_lead",
  "urgent_escalation",
  "pricing_breach",
  "sla_realert",
  "sla_escalation",
  "no_webhook_alert",
  "daily_digest",
  "scheduling_link",
]);

// ---------- Tables ----------

export const designers = pgTable("designers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  telegramChatId: text("telegram_chat_id"),
  calendlyUser: text("calendly_user"), // Calendly user URI (https://api.calendly.com/users/…)
  calendlyEventTypeUri: text("calendly_event_type_uri"), // the consultation event type to book
  phone: text("phone"),
  email: text("email"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const callers = pgTable(
  "callers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(), // E.164 from caller ID
    name: text("name"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("callers_phone_uq").on(t.phone)],
);

export const enquiries = pgTable(
  "enquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callerId: uuid("caller_id").references(() => callers.id),
    channel: text("channel").notNull().default("phone"), // phone | whatsapp | web_form (future)
    status: enquiryStatusEnum("status").notNull().default("OPEN"),
    intent: intentEnum("intent"),
    declineReason: text("decline_reason"),

    // Check 09: every enquiry has an owner. NULL owner_type = unowned -> red on dashboard.
    ownerType: ownerTypeEnum("owner_type"),
    ownerDesignerId: uuid("owner_designer_id").references(() => designers.id),
    assignedDesignerId: uuid("assigned_designer_id").references(() => designers.id),

    // Captured fields (null = unknown; brief renders "unknown" explicitly)
    callerName: text("caller_name"),
    phoneConfirmed: boolean("phone_confirmed"),
    callerEmail: text("caller_email"), // spelled out + read back on the call; booking link is emailed here
    locality: text("locality"),
    propertyType: text("property_type"),
    bhk: text("bhk"),
    carpetAreaSqft: integer("carpet_area_sqft"),
    scope: text("scope"),
    currentState: text("current_state"),
    timelineText: text("timeline_text"),
    timelineWeeks: integer("timeline_weeks"),
    ownership: text("ownership"), // owned | rented | unknown
    decisionMakerStatus: text("decision_maker_status"),
    referralSource: text("referral_source"),
    language: text("language"),
    siteVisitRequested: boolean("site_visit_requested"),
    // Existing-client escalation fields
    existingDesignerName: text("existing_designer_name"),
    projectLocation: text("project_location"),
    issue: text("issue"),

    // Check 05: funnel timestamps, all stored, nothing estimated
    firstCallAt: timestamp("first_call_at", { withTimezone: true }),
    lastCallAt: timestamp("last_call_at", { withTimezone: true }),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    briefSentAt: timestamp("brief_sent_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    consultationHeldAt: timestamp("consultation_held_at", { withTimezone: true }), // manual mark
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }), // NEEDS_REVIEW resolved by human
    reviewedBy: text("reviewed_by"),

    briefRating: integer("brief_rating"), // Check 04: 1-5 from Telegram
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("enquiries_status_idx").on(t.status),
    index("enquiries_caller_idx").on(t.callerId),
    index("enquiries_first_call_idx").on(t.firstCallAt),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaaniCallId: text("vaani_call_id").notNull(), // idempotency key
    callerId: uuid("caller_id").references(() => callers.id),
    enquiryId: uuid("enquiry_id").references(() => enquiries.id),
    fromNumber: text("from_number"),
    ringStartedAt: timestamp("ring_started_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
    inHours: boolean("in_hours"), // 10:00-19:00 IST
    rawTranscript: jsonb("raw_transcript"), // exact payload from Vaani
    transcriptText: text("transcript_text"), // normalised "AGENT: ... / CALLER: ..." lines
    recordingUrl: text("recording_url"),
    language: text("language"),
    knowledgeVersion: text("knowledge_version").notNull(),
    pricingBreach: boolean("pricing_breach").notNull().default(false),
    pricingBreachHits: jsonb("pricing_breach_hits"),
    processingStatus: text("processing_status").notNull().default("received"), // received | processing | scored | failed | no_transcript
    endReason: text("end_reason"), // from Vaani call_ended / call_postprocessing: who/what ended the call
    processingAttempts: integer("processing_attempts").notNull().default(0),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("calls_vaani_call_id_uq").on(t.vaaniCallId),
    index("calls_enquiry_idx").on(t.enquiryId),
    index("calls_from_number_ended_idx").on(t.fromNumber, t.endedAt),
  ],
);

export const qualificationResults = pgTable(
  "qualification_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enquiryId: uuid("enquiry_id").references(() => enquiries.id),
    callId: uuid("call_id").references(() => calls.id),
    model: text("model").notNull(),
    knowledgeVersion: text("knowledge_version").notNull(),
    intent: intentEnum("intent").notNull(),
    criteria: jsonb("criteria").notNull(), // {real_project:{status,evidence_quote},...}
    outcome: outcomeEnum("outcome").notNull(),
    score: integer("score").notNull(),
    summary3Lines: text("summary_3_lines").notNull(),
    briefForDesigner: text("brief_for_designer").notNull(),
    openQuestions: jsonb("open_questions").notNull(),
    callerSentiment: text("caller_sentiment"),
    frustrationFlag: boolean("frustration_flag").notNull().default(false),
    rawJson: jsonb("raw_json").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    attempts: integer("attempts").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("qr_enquiry_idx").on(t.enquiryId)],
);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  enquiryId: uuid("enquiry_id").notNull().references(() => enquiries.id),
  designerId: uuid("designer_id").references(() => designers.id),
  calendlyEventUri: text("calendly_event_uri"),
  calendlyInviteeUri: text("calendly_invitee_uri"),
  calendlyEventTypeUri: text("calendly_event_type_uri"),
  schedulingLink: text("scheduling_link"),
  offeredSlots: jsonb("offered_slots"), // next available start times (UTC) at link creation
  linkSentAt: timestamp("link_sent_at", { withTimezone: true }),
  error: text("error"),
  slotStart: timestamp("slot_start", { withTimezone: true }),
  slotEnd: timestamp("slot_end", { withTimezone: true }),
  siteVisitRequested: boolean("site_visit_requested"),
  status: text("status").notNull().default("pending"), // pending | link_sent | booked | cancelled | held | no_show
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enquiryId: uuid("enquiry_id").references(() => enquiries.id),
    callId: uuid("call_id").references(() => calls.id),
    channel: notificationChannelEnum("channel").notNull(),
    kind: notificationKindEnum("kind").notNull(),
    recipient: text("recipient").notNull(),
    recipientDesignerId: uuid("recipient_designer_id").references(() => designers.id),
    payload: jsonb("payload"),
    externalMessageId: text("external_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    delivered: boolean("delivered").notNull().default(false),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedByDesignerId: uuid("claimed_by_designer_id").references(() => designers.id),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_enquiry_idx").on(t.enquiryId)],
);

export const costEvents = pgTable(
  "cost_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id").references(() => calls.id),
    vendor: text("vendor").notNull(), // vaani | anthropic | telegram | sms | vercel | neon | email
    unit: text("unit").notNull(), // minute | input_token | output_token | message | month
    qty: numeric("qty", { precision: 14, scale: 4 }).notNull(),
    unitCostInr: numeric("unit_cost_inr", { precision: 14, scale: 6 }).notNull(),
    totalInr: numeric("total_inr", { precision: 14, scale: 4 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cost_events_occurred_idx").on(t.occurredAt)],
);

// Key/value config. Rate cards are entered by Nikhil — never seeded with guessed prices.
export const config = pgTable("config", {
  key: text("key").primaryKey(),
  value: jsonb("value"), // NULL = not yet entered (e.g. rate cards)
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Check 06: failed processing lands here after retries.
export const deadLetters = pgTable("dead_letters", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(), // vaani_webhook | scorer | telegram | email | calendly
  externalId: text("external_id"),
  payload: jsonb("payload"),
  error: text("error").notNull(),
  attempts: integer("attempts").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// Check 03 + 06: every inbound webhook is logged (incl. rejected signatures) for /health and no-webhook alerts.
export const webhookReceipts = pgTable(
  "webhook_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // vaani | calendly | telegram
    externalId: text("external_id"),
    signatureValid: boolean("signature_valid").notNull(),
    duplicate: boolean("duplicate").notNull().default(false),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_receipts_source_received_idx").on(t.source, t.receivedAt)],
);

// Browser voice calls (WebRTC): one row per session started, used for abuse limits and traceability.
export const webSessions = pgTable(
  "web_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomName: text("room_name").notNull(),
    ipHash: text("ip_hash").notNull(), // sha256(ip + AUTH_SECRET): never the raw IP
    language: text("language").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_sessions_created_idx").on(t.createdAt), index("web_sessions_ip_idx").on(t.ipHash, t.createdAt)],
);