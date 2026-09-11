# ASR fixtures

Recorded `TranscriptResult` payloads replayed by `adapters/fixture.py`.

**These are hand-written test fixtures, not transcriptions of real artisan recordings.**
They exist so the backend and frontend can build against the speech contract before any
provider credential exists, and so the low-confidence path is testable on demand.

`kn_low_confidence_material` and `kn_code_mixed` are the important ones: each carries an
uncertain span on a word that would become a published claim (a finish, a labour-hour
count). Those are the cases the confirmation screen exists for.

No `adapter` block appears in these files. `FixtureASRAdapter` stamps
`AdapterInfo(provider="fixture")` at load time so a fixture cannot claim to be a live
provider even if the JSON is edited.
