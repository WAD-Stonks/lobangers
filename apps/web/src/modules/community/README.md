# Community

`DealCommunity.vue` and `use-deal-community.ts` implement the live deal panel's voting, comments and report forms using the shared typed Axios client and native auth session. They handle rollback, ownership, duplicate-submit prevention, draft recovery, pagination and stale-response isolation. The illustrative landing hawker scene is separate.

See [the community contract](../../../../../docs/community.md). API/DB persistence tests are real and disposable; component/browser fixtures are explicitly synthetic.
