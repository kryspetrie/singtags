# Architecture checklist (ARCH9)

Use on PRs that touch `domain/`, `application/`, `ports/`, or `adapters/`.

- [ ] Domain has no Vue / Pinia / DOM / `localStorage` / Web Audio imports  
- [ ] New I/O goes through a **port**; adapter + fake covered by tests  
- [ ] Business rules not added to Pinia or Vue SFCs  
- [ ] No new god modules (see `architecture/godFiles.test.ts` budgets)  
- [ ] Lints/fixes include education lesson ids when user-facing  
- [ ] Headless tests pass (`npm test`); typecheck clean  
- [ ] Status row updated in `docs/implementation-plan.md` and/or `docs/headless-backend-plan.md`  

Headless engine work: [`headless-backend-plan.md`](headless-backend-plan.md).
