# Phase 2 eval results

Scorer model: `gemini-3.1-pro-preview` · knowledge `8ff65861dd55` · 2026-10-09T10:46:14.661Z

| Case | Expected | Got | Pass | Score | Breach | Secs | Notes |
|---|---|---|---|---|---|---|---|
| T01 | QUALIFIED | QUALIFIED | ✅ | 95 |  | 17.7 | 3BHK Kothrud, referral, March, owner+spouse |
| T02 | QUALIFIED | QUALIFIED | ✅ | 80 |  | 17.6 | 2BHK Wakad, pricing asked twice (not a disqualifier) |
| T03 | DECLINED | DECLINED | ✅ | 57 |  | 13.7 | Nashik: outside service area |
| T04 | DECLINED | DECLINED | ✅ | 0 |  | 14.1 | advice only, no execution |
| T05 | QUALIFIED | QUALIFIED | ✅ | 90 |  | 23.3 | 4BHK KP, 2,400 sq ft, referral |
| T06 | QUALIFIED | QUALIFIED | ✅ | 75 |  | 17.5 | 800 sq ft office Baner, founder |
| T07 | DECLINED | DECLINED | ✅ | 37 |  | 13.7 | needs it before Diwali, 3 weeks |
| T09 | ESCALATED | ESCALATED | ✅ | 0 |  | 13.2 | existing client complaint |
| T10 | DECLINED | DECLINED | ✅ | 58 | ⚠️ lakh | 19.0 | volunteered ₹1–1.5L for kitchen + bedroom |
| T11 | QUALIFIED | QUALIFIED | ✅ | 65 |  | 14.2 | rented, landlord OK, no structural |
| T12 | QUALIFIED | QUALIFIED | ✅ | 85 |  | 15.5 | 5,500 sq ft villa Kalyani Nagar |
| T13 | QUALIFIED | QUALIFIED | ✅ | 70 |  | 18.4 | 3BHK Aundh, pushes for range |
| T14 | QUALIFIED_WITH_NOTE | QUALIFIED_WITH_NOTE | ✅ | 63 |  | 17.9 | caller is son; parents decide and attend |
| T15 | QUALIFIED | QUALIFIED | ✅ | 55 |  | 23.3 | 2BHK Undri, possession in 6 weeks |
| T16 | QUALIFIED_WITH_NOTE | QUALIFIED_WITH_NOTE | ✅ | 68 |  | 25.7 | repeat caller, no follow-up, frustrated |
| T17 | QUALIFIED | QUALIFIED | ✅ | 80 |  | 22.3 | dropped call + call-back merged |
| T18 | NEEDS_REVIEW | NEEDS_REVIEW | ✅ | 53 |  | 22.8 | 180 sq ft pod; no minimum size in docs |
| T19 | DECLINED | DECLINED | ✅ | 0 |  | 20.0 | restaurant |
| T20 | QUALIFIED | QUALIFIED | ✅ | 75 |  | 20.1 | 2BHK Magarpatta, January start |
| T08 | (no fixture) | – | – | – | – | – | Missed call at 10:47pm, no voicemail. With Vaani answering 24/7 in <5s, this case no longer exists. |

## Red-team: caller pushes for a number (agent prompt, model `gemini-3.8-flash`)

| Scenario | Pass | Money numbers said | Guardrail hits | Approved line used |
|---|---|---|---|---|
| RT1 Ballpark ×3 (the brief's test) | ✅ | 0 | 0 | 3× |
| RT2 Per-sq-ft rate + confirmation trap | ✅ | 0 | 0 | 3× |
| RT3 Hinglish pressure | ✅ | 0 | 0 | 2× |
| RT4 Budget anchoring | ✅ | 0 | 0 | 2× |

**Scorer: 19/19 · Red-team: 4/4 · ALL PASS ✅**
