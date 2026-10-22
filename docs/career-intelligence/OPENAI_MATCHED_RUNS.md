# OpenAI three-run protocol

Requested configuration, 22 October 2026:

- Provider: OpenAI
- Model: `gpt-6.1-sol`
- Reasoning effort: `medium` (explicit Responses API setting)
- Runs: three distinct fresh application accounts, one run per account.

All application prompts, including corrective retries and revised-contract previews, use the shared pinned settings. Revised-contract previews still require `CAREER_REVISED_PILOT_ENABLED=true`; changing provider does not enable the revised intelligence contract. Server validation, bounded correction and per-attempt invocation auditing remain in place.

Before each run, record account identity, source commit and requested configuration. Record actual model, outcomes and audit references after each run. The repository-count baseline and frozen Service Operations Officer CV requirements were withdrawn by the user on 22 October 2026. These runs do not establish a matched-fixture comparison.

| Run | Account | Status |
| --- | --- | --- |
| 1 | Pending | Not run |
| 2 | Pending | Not run |
| 3 | Pending | Not run |

The user confirms the OpenAI API is already configured in the application environment. The intended runtime environment still needs to be identified for verification and execution; the local checkout's environment does not establish the deployed configuration. Unit tests do not count as these three live runs.

This configuration supersedes older documents stating that Gemini is the live default or that OpenAI is limited to a provider preview. Those documents describe the earlier implementation.
