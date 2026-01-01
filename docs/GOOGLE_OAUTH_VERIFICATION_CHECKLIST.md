# Google OAuth Sensitive Scope Verification Checklist

**App Name:** Luframe
**Purpose:** AI-Powered Meeting Intelligence Platform
**Date:** January 2026

---

## Domain Structure

| Domain | Purpose | Notes |
|--------|---------|-------|
| `luframe.com` | Landing page (public) | Hosts Privacy Policy `/privacy`, Terms `/terms` |
| `app.luframe.com` | Main application | OAuth callbacks, authenticated users |

**Important:** Both domains should be verified in Google Search Console.

---

## Executive Summary

Your app **requires Google OAuth sensitive scope verification** because you use the following sensitive scopes:

| Scope | Classification | Used For |
|-------|---------------|----------|
| `calendar.events` | **SENSITIVE** | Creating/updating meeting events |
| `calendar.readonly` | **SENSITIVE** | Reading calendar for scheduling |
| `gmail.send` | **SENSITIVE** | Sending email follow-ups from meetings |
| `userinfo.email` | Non-sensitive | User identification |
| Google Sign-In (openid, profile, email) | Non-sensitive | Authentication |

**Verification Timeline:** 3-5 business days (can extend to 2-8 weeks depending on remediation)

---

## Scope Justification (Copy for Verification Form)

When submitting for verification, Google will ask why you need each scope. Use these justifications:

### calendar.events (Sensitive)

**Scope:** `https://www.googleapis.com/auth/calendar.events`

**Why we need it:**
> Luframe is an AI-powered meeting platform. When users schedule meetings through Luframe, we create calendar events in their Google Calendar so meetings appear alongside their other appointments. This scope allows us to:
>
> 1. **Create calendar events** with Luframe meeting links when users schedule new meetings
> 2. **Update events** when meeting details change (time, title, participants)
> 3. **Delete events** when meetings are cancelled
>
> Without this scope, users would need to manually copy meeting links and create calendar events themselves, defeating the purpose of an integrated meeting platform.

**User-facing feature:** Meeting scheduling with automatic Google Calendar sync

**Data handling:** We only create/modify events that Luframe generates. We do not read, store, or analyze the content of users' other calendar events.

---

### calendar.readonly (Sensitive)

**Scope:** `https://www.googleapis.com/auth/calendar.readonly`

**Why we need it:**
> Luframe displays users' upcoming meetings and helps them avoid scheduling conflicts. This scope allows us to:
>
> 1. **Show upcoming meetings** in the Luframe dashboard so users see all their appointments in one place
> 2. **Check availability** when scheduling new meetings to prevent double-booking
> 3. **Display meeting context** so users know what's coming up before joining a Luframe meeting
>
> We use read-only access because we only need to display calendar information, not modify existing events created outside Luframe.

**User-facing feature:** Dashboard calendar view and availability checking

**Data handling:** Calendar data is displayed in real-time and not permanently stored. We only cache event times for availability checking.

---

### gmail.send (Sensitive)

**Scope:** `https://www.googleapis.com/auth/gmail.send`

**Why we need it:**
> Luframe uses AI to detect action items during meetings (e.g., "Send the proposal to John by Friday"). When an action item involves sending an email, users can send follow-up emails directly from Luframe using their Gmail account. This scope allows us to:
>
> 1. **Send meeting follow-up emails** based on action items detected during meetings
> 2. **Send meeting invitations** to participants
> 3. **Share meeting summaries** via email after meetings conclude
>
> We specifically use `gmail.send` (not broader Gmail scopes) because we only need to send emails on behalf of users — we never read their inbox or access existing emails.

**User-facing feature:** One-click email sending for meeting action items and follow-ups

**Data handling:**
- We do NOT read users' inbox or existing emails
- We do NOT store email content after sending
- Users explicitly approve each email before it's sent
- Users can disconnect Gmail integration at any time

**Why not a less permissive scope?**
> There is no "send-only" scope more restrictive than `gmail.send`. This is already the minimum scope required to send emails via the Gmail API.

---

### userinfo.email (Non-sensitive)

**Scope:** `https://www.googleapis.com/auth/userinfo.email`

**Why we need it:**
> We use this to identify which Google account the user is connecting, so we can display their email address in the integrations settings and associate the correct tokens with their Luframe account.

---

## Scope Summary Table

| Scope | Type | User Feature | Why Minimum Necessary |
|-------|------|--------------|----------------------|
| `calendar.events` | Sensitive | Create/sync meeting events | Need write access for scheduling |
| `calendar.readonly` | Sensitive | Show availability & upcoming meetings | Only need to read, not modify other events |
| `gmail.send` | Sensitive | Send follow-up emails from meetings | Send-only, never reads inbox |
| `userinfo.email` | Non-sensitive | Identify connected account | Standard for any Google integration |

---

## Current Status Summary

| Category | Status | Notes |
|----------|--------|-------|
| Privacy Policy | **READY** | Excellent - includes Google API section with Limited Use |
| Terms of Service | **READY** | Comprehensive |
| Homepage with policy links | **READY** | Footer links to `/privacy` and `/terms` |
| Demo Video | **REQUIRED** | Must create for sensitive scopes |
| Domain Verification | **TODO** | Verify both domains in Search Console |
| OAuth Consent Screen | **TODO** | Configure in Google Cloud Console |

---

## Demo Video Requirement - CONFIRMED

**Yes, demo video IS required for sensitive scopes**, not just restricted scopes.

From Google's official documentation:
> "Submitting your app for verification involves... providing detailed justification and a **video demonstration for sensitive scopes**."

> "For OAuth verification, you must submit a demo video demonstrating the journey or flow that explains the use of the requested scopes."

The difference between sensitive and restricted:
- **Sensitive scopes**: Demo video + justification required
- **Restricted scopes**: Demo video + justification + **CASA security assessment** (paid third-party audit)

Your scopes are **sensitive only** (not restricted), so you need the video but NOT the security assessment.

---

## Verification Requirements Checklist

### 1. Privacy Policy - READY

| Requirement | Status | Location |
|-------------|--------|----------|
| Privacy Policy page exists | [x] | `landing/app/privacy/page.tsx` |
| Hosted on homepage domain | [x] | `luframe.com/privacy` |
| Linked from homepage footer | [x] | `landing/components/Footer.tsx:17` |
| **Google API Services section** | [x] | Section 4 "Google API Services User Data" |
| **Limited Use disclosure** | [x] | Section 4.3 references Google API Services User Data Policy |
| Calendar data usage explained | [x] | Section 4.1 |
| Gmail data usage explained | [x] | Section 4.2 |
| Data deletion instructions | [x] | Section 10 "Your Privacy Rights" |
| Contact information | [x] | Section 15 with email and address |

**Your Privacy Policy is excellent and compliant with Google's requirements.**

### 2. Terms of Service - READY

| Requirement | Status | Location |
|-------------|--------|----------|
| Terms of Service page exists | [x] | `landing/app/terms/page.tsx` |
| Linked from homepage footer | [x] | `landing/components/Footer.tsx:18` |
| Third-party services disclosed | [x] | Section 11 mentions Google Calendar/Gmail |

### 3. Homepage Requirements - READY

| Requirement | Status | Notes |
|-------------|--------|-------|
| Homepage exists | [x] | `luframe.com` |
| Describes app functionality | [x] | Landing page with features |
| Privacy Policy link | [x] | Footer links to `/privacy` |
| Terms of Service link | [x] | Footer links to `/terms` |

### 4. Domain Verification - TODO

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| `luframe.com` verified in Search Console | [x] | Add and verify |
| `app.luframe.com` verified in Search Console | [x] | Add and verify (for OAuth callbacks) |

**How to verify:**
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add `luframe.com` as a property
3. Verify using DNS TXT record (recommended for domain-level verification)
4. Repeat for `app.luframe.com` or verify the parent domain

### 5. OAuth Consent Screen Configuration - TODO

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| App name: "Luframe" | [x] | Already configured |
| User support email | [x] | Already configured |
| App logo (120x120 PNG) | [x] | Already uploaded |
| Application homepage | [ ] | Set to `https://luframe.com` |
| Application privacy policy link | [ ] | Set to `https://luframe.com/privacy` |
| Application terms of service link | [ ] | Set to `https://luframe.com/terms` |
| Authorized domains | [x] | Add `luframe.com` and `app.luframe.com` |
| Scopes selected | [ ] | Verify calendar + gmail scopes match code |

### 6. Demo Video - TODO (REQUIRED)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Demo video created | [ ] | **Required for sensitive scopes** |
| Video is Unlisted on YouTube | [ ] | Not private, not public |
| Video is in English | [ ] | UI and any narration |
| Shows OAuth consent screen | [ ] | Full consent flow visible |
| Shows app name "Luframe" on consent | [ ] | Must be clearly visible |
| Shows browser address bar | [ ] | URL visible during OAuth |
| Demonstrates Calendar scope usage | [ ] | Show creating/syncing a calendar event |
| Demonstrates Gmail scope usage | [ ] | Show sending an email via the integration |

### 7. App Frontend - DONE

| Requirement | Status | Location |
|-------------|--------|----------|
| Sign-in page links to policies | [x] | `frontend/app/(auth)/sign-in/page.tsx:335-354` |
| Sign-up page links to policies | [x] | `frontend/app/(auth)/sign-up/page.tsx:288-307` |

---

## Action Items

### HIGH PRIORITY (Before Verification)

#### 1. Verify Domains in Google Search Console
**Effort:** ~30 minutes

1. Go to https://search.google.com/search-console
2. Add `luframe.com` → Verify via DNS TXT record
3. Add `app.luframe.com` → Verify (or parent domain covers it)
4. Wait for verification (usually instant with DNS, up to 24h)

#### 2. Configure OAuth Consent Screen
**Effort:** ~15 minutes

In Google Cloud Console > APIs & Services > OAuth consent screen:

1. Set User Type: "External"
2. App information:
   - App name: `Luframe`
   - User support email: `admin@luframe.com`
   - App logo: Your 120x120 PNG
3. App domain:
   - Homepage: `https://luframe.com`
   - Privacy Policy: `https://luframe.com/privacy`
   - Terms of Service: `https://luframe.com/terms`
4. Authorized domains:
   - `luframe.com`
   - `app.luframe.com`
5. Developer contact: Your email

#### 3. Create Demo Video
**Effort:** ~2-3 hours
**Tools:** Loom, OBS, or QuickTime

**Demo Video Script:**

```
[0:00-0:15] Introduction
"This video demonstrates Luframe, an AI-powered meeting platform
that integrates with Google Calendar and Gmail."

[0:15-1:00] Google Calendar Integration
1. Navigate to app.luframe.com/dashboard/integrations
2. Click "Connect Google Calendar"
3. Show OAuth consent screen (ensure "Luframe" and scopes are visible)
4. Show browser address bar (accounts.google.com visible)
5. Grant permission
6. Demonstrate: Schedule a meeting → Show it synced to Google Calendar

[1:00-1:45] Gmail Integration
1. Click "Connect Gmail"
2. Show OAuth consent screen (gmail.send scope visible)
3. Grant permission
4. Demonstrate: During/after a meeting, show action item detected
5. Show email draft being sent via Gmail integration

[1:45-2:00] Wrap-up
"Luframe uses Google Calendar to sync meetings and Gmail to
send follow-up emails from meeting insights. Users can disconnect
these integrations at any time from Settings."
```

**Upload:** YouTube → Set visibility to "Unlisted"

#### 4. Submit for Verification
**Effort:** ~30 minutes

1. Go to Google Cloud Console > OAuth consent screen
2. Click "Prepare for verification" or "Submit for verification"
3. Fill in the questionnaire:
   - Explain why you need each scope
   - Provide YouTube demo video URL
4. Submit

---

## Your OAuth Endpoints

| Integration | Connect | Callback | Disconnect |
|-------------|---------|----------|------------|
| Google Sign-In | Better Auth handles | `app.luframe.com/api/auth/callback/google` | N/A |
| Calendar | `/api/calendar/connect` | `app.luframe.com/api/calendar/callback` | `/api/calendar/disconnect` |
| Gmail | `/api/gmail/connect` | `app.luframe.com/api/gmail/callback` | `/api/gmail/disconnect` |

**Ensure these callback URLs are registered in Google Cloud Console:**
- `https://app.luframe.com/api/auth/callback/google`
- `https://app.luframe.com/api/calendar/callback`
- `https://app.luframe.com/api/gmail/callback`

---

## Verification Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| Preparation | 1-2 days | Domain verification, video creation |
| Submission | 30 mins | Submit in Google Cloud Console |
| Initial Review | 3-5 business days | Google reviews your submission |
| Remediation (if needed) | 1-4 weeks | Fix any issues Google identifies |
| Approval | 1-2 business days | Final approval |

**Total Expected:** 1-3 weeks (assuming no major issues)

---

## Common Rejection Reasons

1. **Demo video doesn't show consent screen clearly** - Pause/zoom on consent screen
2. **Scopes not justified** - Explain why you need each scope in submission
3. **Domain not verified** - Must verify in Search Console first
4. **Policy URLs don't match** - Consent screen and homepage must link to same URLs
5. **Video doesn't show actual scope usage** - Must demonstrate the feature, not just consent

---

## Post-Verification

After approval:
- Monitor for policy compliance
- Update privacy policy if you add new scopes
- Re-verification required if you add **restricted** scopes
- **No annual re-verification** for sensitive-only scopes (unlike restricted)

---

## Resources

- [Sensitive Scope Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Demo Video Requirements](https://support.google.com/cloud/answer/13804565)
- [OAuth Verification Help Center](https://support.google.com/cloud/answer/13463073)
- [Verification Requirements](https://support.google.com/cloud/answer/13464321)
- [Google OAuth Scopes List](https://developers.google.com/identity/protocols/oauth2/scopes)
- [OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)

---

*Last Updated: January 2026*
