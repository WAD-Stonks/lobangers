# Lobangers web application

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users and purpose
Visitors discover food deals. Authorised operators manage deal content, canonical merchants and outlets, moderation, ingestion evidence/recovery, audit investigation and platform accounts.

## Operating context
The admin workspace has seven destinations: Overview, Deals, Catalogue, Moderation, Accounts, Ingestion and Audit. Public discovery and admin operations are different usage contexts.

## Capabilities and constraints
- Existing Vue/Vue Router application, Bootstrap and shared Bootstrap Vue components.
- The user approved a shadcn-inspired sidebar/navigation adaptation using Vue and scoped CSS, without Tailwind. This is locally maintained source, not an unchanged shadcn-vue installation.
- Rework the complete admin shell, including navigation, sidebar, top bar and task composition. The previous long stacked-form presentation is rejected by the user.
- Preserve existing APIs, permissions, native authentication, version/CAS evidence, explicit confirmation and fresh-primary-sign-in policy. Native identifiers remain UX hints, never authority.
- Keep the native session observer mounted even when navigation/account menus close. Preserve unresolved-operation handling, no automatic replay, denial redaction and late-response fences.
- Public map/landing pages and their visual identity must not be restyled by this change. No new dependencies, schema changes, source activation or production access are required.

## Brand commitments
Keep the Lobangers identity and assets. Use the inspected shadcn sidebar and Medusa operational references as structural inspiration, not third-party branding or fake business content.

## Evidence on hand
The existing application, typed clients, permanent regression suites and disposable browser fixtures supply real product behaviour. UI preview datasets are synthetic and must be labelled as such.

## Product principles
- Put the current operational task ahead of decoration.
- Show relevant records first and reveal editing/security controls contextually.
- Make navigation consistent across all admin routes and usable on mobile and keyboard.
- Keep safety and recovery behaviour independent of presentation visibility.
