# Submission checklist

**Deadline: 20 October 2026, 23:59 Beijing time (UTC+8)** = 22:59 Vietnam time. Registration and submission share the deadline. You can resubmit until then; the latest version counts.

| # | Required item | What to submit | Source in this repo | Status |
|---|---|---|---|---|
| 01 | Technical documentation (architecture, core algorithms, security design) | PDF export of `docs/TECHNICAL.md` | `docs/TECHNICAL.md` | ✅ draft — add team names |
| 02 | Presentation deck (≤ 10 min) | Slides built from the outline | `docs/PITCH_DECK.md` | ⬜ build slides |
| 03 | Demo video (optional, ≤ 5 min) | MP4 / YouTube unlisted link | `docs/DEMO_VIDEO_SCRIPT.md` | ⬜ record |
| 04 | Source code (README, GitHub link, deployment instructions, test cases) | Public GitHub repo URL | `README.md`, `contracts/test`, `app/tests`, `app/redteam` | ✅ — push to GitHub |
| 05 | Security self-assessment (permission tiers, known-risk list) | PDF export | `docs/SECURITY_SELF_ASSESSMENT.md` | ✅ draft |
| 06 | Execution evidence (on-chain topic: real transaction hashes) | PDF export + Basescan links | `docs/EXECUTION_EVIDENCE.md` (regenerate on Base Sepolia!) | ⬜ run on testnet |

## Before submitting

- [ ] Every team member has registered at fintechathon.g-ican.com (2–5 students, ≥ 60 % non-Chinese nationals, all at universities outside Mainland China/HK/Macao/Taiwan)
- [ ] Deploy to Base Sepolia → `npm run evidence` → commit the regenerated `EXECUTION_EVIDENCE.md`
- [ ] (Optional) verify the contract on Basescan (`BASESCAN_API_KEY`)
- [ ] `forge test`, `npm test`, `npm run redteam` all green; commit the fresh `REDTEAM_REPORT.md`
- [ ] Repo is public, `.env.local` is **not** committed (it is gitignored), no private keys anywhere
- [ ] Team names and universities filled in (TECHNICAL.md header, deck title slide)
- [ ] Markdown exported to PDF (e.g., VS Code "Markdown PDF" or `pandoc`)
- [ ] Video ≤ 5 min, deck talk ≤ 10 min (rehearse with a timer)
- [ ] At least one member can travel to Shenzhen on 21–23 November if selected (passport/visa)
