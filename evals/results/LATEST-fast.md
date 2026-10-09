# Phase 2 eval results

Scorer model: `gemini-3.8-flash` · knowledge `8ff65861dd55` · 2026-10-09T10:26:48.360Z

| Case | Expected | Got | Pass | Score | Breach | Secs | Notes |
|---|---|---|---|---|---|---|---|
| T01 | QUALIFIED | QUALIFIED | ✅ 3/3 | 85 |  | 13.3 | 3BHK Kothrud, referral, March, owner+spouse |
| T02 | QUALIFIED | QUALIFIED | ✅ 3/3 | 80 |  | 12.1 | 2BHK Wakad, pricing asked twice (not a disqualifier) |
| T03 | DECLINED | DECLINED | ✅ 3/3 | 47 |  | 13.9 | Nashik: outside service area |
| T04 | DECLINED | DECLINED | ✅ 3/3 | 0 |  | 21.5 | advice only, no execution |
| T05 | QUALIFIED | QUALIFIED | ✅ 3/3 | 90 |  | 13.3 | 4BHK KP, 2,400 sq ft, referral |
| T06 | QUALIFIED | QUALIFIED | ✅ 3/3 | 75 |  | 10.2 | 800 sq ft office Baner, founder |
| T07 | DECLINED | DECLINED | ✅ 3/3 | 37 |  | 14.9 | needs it before Diwali, 3 weeks |
| T09 | ESCALATED | ESCALATED | ✅ 3/3 | 0 |  | 17.4 | existing client complaint |
| T10 | DECLINED | DECLINED | ✅ 3/3 | 58 | ⚠️ lakh | 11.9 | volunteered ₹1–1.5L for kitchen + bedroom |
| T11 | QUALIFIED | QUALIFIED | ✅ 3/3 | 65 |  | 9.6 | rented, landlord OK, no structural |
| T12 | QUALIFIED | QUALIFIED | ✅ 3/3 | 85 |  | 12.4 | 5,500 sq ft villa Kalyani Nagar |
| T13 | QUALIFIED | QUALIFIED_WITH_NOTE / QUALIFIED | ❌ 1/3 | 70 |  | 19.0 | outcome QUALIFIED_WITH_NOTE ≠ QUALIFIED |
| T14 | QUALIFIED_WITH_NOTE | QUALIFIED_WITH_NOTE | ✅ 3/3 | 63 |  | 19.5 | caller is son; parents decide and attend |
| T15 | QUALIFIED | QUALIFIED | ✅ 3/3 | 65 |  | 15.2 | 2BHK Undri, possession in 6 weeks |
| T16 | QUALIFIED_WITH_NOTE | QUALIFIED_WITH_NOTE | ✅ 3/3 | 68 |  | 37.8 | repeat caller, no follow-up, frustrated |
| T17 | QUALIFIED | QUALIFIED | ✅ 3/3 | 80 |  | 11.6 | dropped call + call-back merged |
| T18 | NEEDS_REVIEW | ERROR | ❌ 0/3 | - |  | 89.3 | ERROR |
| T19 | DECLINED | DECLINED | ✅ 3/3 | 0 |  | 37.9 | restaurant |
| T20 | QUALIFIED | QUALIFIED | ✅ 3/3 | 75 |  | 13.5 | 2BHK Magarpatta, January start |
| T08 | (no fixture) | – | – | – | – | – | Missed call at 10:47pm, no voicemail. With Vaani answering 24/7 in <5s, this case no longer exists. |

**Scorer: 17/19 · Red-team: 0/0 · FAILURES ❌**
