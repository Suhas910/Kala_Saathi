"""
CraftLink AI modules.

Two independently-written implementations currently live side by side in this package,
because `featai` and `backend_branch` both created `app/ai/` without knowing about the
other. They are NOT interchangeable and the difference matters:

  * `service.py` + `gemini_client.py` (from `backend_branch`) drive the live HTTP
    endpoints in `app/routers/ai.py`. They return fixed demo content when
    `GEMINI_API_KEY` is unset, which is the state of every machine on the team today.

  * `vision/`, `pricing/`, `taxonomy/`, `linkage/`, `adapters/`, `contracts.py` (from
    `featai`) are the deterministic, tested modules -- 71 tests, no API key, no network.
    They are not yet wired to any route.

Reconciling the two is a decision the team has to make, not a merge conflict to
resolve. See `AI_MERGE_NOTES.md` at the repo root for what each one actually does and
where they disagree on facts.

Deliberately empty of imports: `app.ai.vision` needs OpenCV and `app.ai.adapters` can
pull in speech dependencies. Neither should be a cost paid by anything that merely
touches `app.ai.pricing`. Import the submodule you need.
"""
