# SevaLog

SevaLog is a static, mobile-first caregiving MVP for Indian family care coordination. The in-home caregiver can log medicines, meals, vitals, appointments, and notes, then share a clean daily digest to WhatsApp for remote family members.

## Why this scope

This is intentionally not a full MediFamily or Caring Village competitor. It tests one focused behavior: will a primary caregiver keep a low-friction daily log if the payoff is an easy WhatsApp update for the family?

## What works

- Quick log buttons for common care updates
- Manual log form for medicine, meals, vitals, appointments, and notes
- Local timeline stored in the browser
- Daily digest preview
- WhatsApp share link
- Copy digest action
- JSON export and import for backup

## What is not in v1

- Shared real-time database
- Login or accounts
- WhatsApp bot input
- Multiple elders
- Prescription or document vault

## Run locally

Any static file server works. For example:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploy on Vercel

Import this folder as a Vercel project. It is a static site, so no build command is required.
