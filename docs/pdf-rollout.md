# PDF Queue Worker Rollout

## Feature Flags

- `PDF_QUEUE_BACKEND=memory|redis`
- `PDF_QUEUE_CANARY_TENANT_IDS=<uuid1,uuid2,...>`
- `PDF_WORKER_ENABLED=true|false` (operational marker; run worker with true)
- `PDF_ARTIFACT_MODE=buffer|signed_url`
- `PDF_ARTIFACT_SIGNED_URL_TTL_SEC=300`

## Suggested Rollout Order

1. **Baseline**
   - Keep `PDF_QUEUE_BACKEND=memory`.
   - Enable `PDF_METRICS_ENABLED=true`.
   - Verify `GET /api/quotation/pdf/status`.
2. **Worker deployment**
   - Deploy worker container/process with:
     - `PDF_QUEUE_BACKEND=redis`
     - `REDIS_URL=...`
     - `PDF_WORKER_ENABLED=true`
3. **Canary**
   - On API set:
     - `PDF_QUEUE_BACKEND=redis`
     - `PDF_QUEUE_CANARY_TENANT_IDS=<one-tenant-id>`
   - Watch queue depth, error rate, memory.
4. **Ramp**
   - Expand canary tenant list.
   - Remove `PDF_QUEUE_CANARY_TENANT_IDS` for full rollout.
5. **Artifact mode switch (optional)**
   - Keep `PDF_ARTIFACT_MODE=buffer` during canary.
   - Switch to `signed_url` only after validation.

## Rollback

- Immediate rollback: set `PDF_QUEUE_BACKEND=memory` in API.
- Keep worker running; no code rollback required.
- If needed, set `PDF_ARTIFACT_MODE=buffer`.

## Validation Checklist

- `GET /api/quotation/pdf/status` returns expected queue backend.
- No API restarts during concurrent quotation PDF load.
- Template image update invalidates cached PDFs for same tenant.
- PDF parity script passes for golden samples.

