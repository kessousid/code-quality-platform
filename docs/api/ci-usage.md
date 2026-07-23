# Using the API from CI

See `docs/adr/0016-ci-usage-contract.md` for why this is a REST API call
and not a bespoke webhook/receiver: there is no published GitHub
Action/GitLab CI template yet, and no inbound webhook contract — a CI job
calls the same endpoints a human or script would, using an `ApiToken`
(`docs/adr/0014-auth-model.md`) stored as a CI secret.

## 1. Get a token

Run the operator bootstrap script once, out of band (there is no public
signup/token endpoint — see ADR-0014):

```
pnpm --filter @cqp/api run bootstrap "Acme Corp" "ci-pipeline"
# Org created: cl_xxx (acme-corp)
# API token (shown once, store it now): cqp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Store the printed token as `CQP_API_TOKEN` in your CI provider's secrets.

## 2. Register the repo once

```bash
curl -s -X POST "$CQP_API_URL/repos" \
  -H "Authorization: Bearer $CQP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-service", "provider": "github", "remoteUrl": "https://github.com/acme/my-service"}'
# {"id": "repo_xxx", ...}
```

## 3. Trigger a scan and poll until it completes

```bash
SCAN_ID=$(curl -s -X POST "$CQP_API_URL/scans" \
  -H "Authorization: Bearer $CQP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoId": "repo_xxx", "ref": "'"$GIT_SHA"'", "mode": "full"}' \
  | jq -r '.id')

until [ "$(curl -s "$CQP_API_URL/scans/$SCAN_ID" -H "Authorization: Bearer $CQP_API_TOKEN" | jq -r '.status')" != "running" ]; do
  sleep 5
done

STATUS=$(curl -s "$CQP_API_URL/scans/$SCAN_ID" -H "Authorization: Bearer $CQP_API_TOKEN" | jq -r '.status')
if [ "$STATUS" != "completed" ]; then
  echo "Scan failed: $STATUS"
  exit 1
fi
```

## 4. Fetch results

```bash
curl -s "$CQP_API_URL/findings?repoId=repo_xxx&severity=critical" \
  -H "Authorization: Bearer $CQP_API_TOKEN"

curl -s "$CQP_API_URL/scans/$SCAN_ID/reports" \
  -H "Authorization: Bearer $CQP_API_TOKEN"
```

## What this does not do (yet)

- No PR status check appears on the pull request itself — a CI job can
  fail the build based on the poll result above, but nothing posts back to
  GitHub/GitLab's PR UI. That requires the deferred GitHub/GitLab App
  (ADR-0003).
- No published GitHub Action / GitLab CI template — the snippets above are
  the reference implementation; wiring them into your specific CI syntax is
  currently on you.
- Report _content_ (the actual SARIF/HTML/PDF payload) is Phase 9 work —
  `GET /scans/{id}/reports` currently returns report metadata
  (`storageKey`, `format`) once Phase 7/9 land, not before.
