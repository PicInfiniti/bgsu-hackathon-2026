# Organizer references

Reviewed November 21, 2026. These references define the event requirements; they are not runtime app data.

| File | Contents and use |
|---|---|
| [Project briefs](2026_BGSU_Hackathon_Project_Briefs.pdf) | Project A core and optional levels (page 2), shared requirements/schedule (page 1), judging rubric and submission checklist (page 3). |
| [Aivana API guide](2026_BGSU_Hackathon_Aivana_API_Guide.pdf) | Backend-only key handling, JSON Schema, streaming, image attachments, output limits and error contracts. The app uses backend HTTP calls rather than requiring the example SDK. |
| [Email 1](email-1.md) | Initial event, repository-sharing and Aivana instructions. |
| [Email 2](email-2.md) | Project selection instructions and November 21, 5 PM project deadline. |
| [Email 3](email-3.md) | Latest submission instructions: one repository email to all judges by 2 PM with all participating members CCed; appropriate GitHub access; no changes after 5 PM; a Teams freeze acknowledgment at or before 5 PM; about a three-minute presentation. Includes judge contacts. |

Email 3 supplies the latest submission and presentation details. The brief's detailed schedule takes precedence over generic event headings on participant rosters. The README maps these requirements to the current implementation and provides a rehearsal plan. This inventory does not establish that repository access, the submission email or the Teams acknowledgment have been completed.

The original and updated team-roster PDFs present locally are **hackathon participant lists** containing real names and email addresses. They are excluded by `.gitignore`; never import them as player data or commit them with the app. Keep the user-confirmed team: **picInfiniti — Siavash and Salma**.

No organizer Project A synthetic player roster or sample meeting-note pack is present in this folder as of this review. The project owner has accepted `data/synthetic/` as this project's working dataset: 25 fictional football players, 19 scenarios and 86 author-written reference records. It is team-authored, not organizer-provided or organizer-endorsed. The brief describes a shared organizer pack for Project A; validation against that pack is not claimed. See the [dataset guide](../data/synthetic/README.md) for provenance and limits.

If an organizer pack is later supplied, update its roster and notes together, preserve player IDs/history or explicitly migrate them, regenerate `data/demo.json`, restart the backend and repeat the core checks. Keep participant contacts separate from application fixtures.
