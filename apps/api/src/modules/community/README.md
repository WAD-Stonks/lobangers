# Community

Implemented deal-wide voting, recent-evidence summaries, comments, author-only soft deletion and abuse reports. Named handlers live under `rest/routers/community`; `data.ts` and `writes.ts` own transactional visibility, persistence and contribution limits. Native cookie identity, trusted Origin and current public-review state remain mandatory.

The approved policy is 3 positive users, at least 80% positive votes, in 24 hours. Expiry and moderation remain separate. See [the community contract](../../../../../docs/community.md) for configuration, routes, concurrency, report limitations and disposable-database tests.
