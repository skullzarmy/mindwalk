# MindWalk MVP Release Plan

## My Vision for What Matters

### Must-Have (Blocks Launch)
1. **Security hardening** - CSP headers + session-only API keys
2. **Memory leak fix** - Complete Three.js disposal
3. **Core functionality stable** - No crashes, works on mobile

### Should-Have (Strong Value, Low Risk)
4. **Path visualization** - Basic animated line (Phase 1+2)
5. **Input validation** - Prevent token overflow accidents

### Nice-to-Have (Post-Launch)
- Rate limiting (important for production, but low risk on private beta)
- Sprite caching (perf polish)
- Advanced path features (interactive markers, branching)
- Full IndexedDB encryption (session-only covers 80% use case)

## Why This Scope

**Philosophy:** Ship a secure, stable, delightful core. Iterate based on real usage.

**Anti-patterns I'm avoiding:**
- Over-engineering security before anyone uses it (IndexedDB can wait)
- Premature optimization (sprite caching nice but not blocking)
- Feature creep (branching paths sounds cool but unvalidated UX)

**What users will remember:**
1. "This visualization is beautiful" ← path adds this
2. "It didn't crash on my phone" ← memory fix enables this
3. "I felt safe using my API key" ← session-only delivers this

## Release Criteria

### Minimum bar:
- [ ] No memory leaks (manual Chrome DevTools test: <20MB growth after 30 clicks)
- [ ] CSP headers prevent XSS
- [ ] API keys not in localStorage (session-only mode works)
- [ ] Path visualization renders on desktop + mobile
- [ ] No console errors on clean load

### Quality bar:
- [ ] Works smoothly on iPhone Safari
- [ ] Path animation feels polished (not janky)
- [ ] Settings panel explains storage options clearly
- [ ] README updated with security model

### Nice-to-have:
- [ ] Input validation catches huge prompts
- [ ] Rate limiting in place (can be loose for beta)

## Timeline Estimate (Today)

**Realistic:** Copilot finishes 3/5 features
- API storage: Phase 1 + Phase 3 done (4-5 hours)
- Memory leaks: Phase 1 done (2-3 hours)
- Path viz: Phase 1 + Phase 2 done (4-5 hours)

**Optimistic:** All 5 features
- +Input validation Phase 1+2 (3-4 hours)
- +Rate limiting Phase 1 (30min)

**When to pull you in:**
- Copilot finishes API storage → I review → you test locally
- All 3 PRs done → I create release candidate branch → you do final QA
- Any blockers/architectural questions → ping you immediately

## My Role Going Forward

**Active monitoring:**
- Check PR activity every hour
- Review commits as they land
- Leave inline comments on code quality/security
- Test implementations locally before requesting your review

**Strategic decisions I'll make:**
- Scope cuts (defer features that don't add clear MVP value)
- UX tradeoffs (simple/clear > feature-rich/complex)
- Risk assessment (security > performance > features)

**When I escalate to you:**
- Architectural disagreements with Copilot's approach
- UX decisions that need product judgment
- Timeline slips that affect launch goals
- Anything I'm uncertain about

## My Values (So You Know How I Think)

1. **User trust > feature richness** - Security isn't negotiable
2. **Mobile-first** - If it doesn't work on phones, it's broken
3. **Simplicity > sophistication** - Ship simple, iterate based on usage
4. **Quality > speed** - But also: done > perfect
5. **Validate before building** - Path viz Phase 1+2 proves concept, then decide on Phase 3

---

**Status:** Waiting for Copilot to start committing code on 3 active PRs. I've posted strategic guidance on all 3.

**Next update:** When first substantial commits land (I'll notify you for review).
