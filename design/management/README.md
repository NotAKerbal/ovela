# Management direction

These Image Gen studies extend the approved home design. All users, addresses, and membership counts in the images are illustrative. Management and backend features are not implemented yet.

## Screens

- `01-people.png`: invite people, find a person, and see account role, assigned apps, and invitation state.
- `02-person-access.png`: edit a person's app access with simple on/off controls and an explicit Save action.
- `03-applications.png`: manage the app catalog, destinations, and access membership.

Keep the current warm stone background and muted application colors. Use flatter surfaces for management data, fine dividers, restrained glass on key controls, and one global header. Any section navigation belongs to the management content rather than another global header. Keep motion brief and respect reduced-motion preferences.

## Confirmed stack

- Actual Next.js with TypeScript and the App Router.
- A local Convex instance for the backend. Do not provision a managed cloud backend by default.
- Better Auth for identity and sessions.
- Private GitHub repository while the project takes shape; eventual open-source configurability remains a goal.

## Proposed first implementation

Start with administrator setup, sign-in, people/invitation management, application records, and per-person application grants. Use server-side checks for every privileged query and mutation. Hiding an app in the launcher is not access enforcement for an external service; migrate actual app integrations individually.

The mockups propose Member and Admin account roles, with no granular role editor. Explicitly review account suspension, existing-session revocation, invitation delivery, and last-administrator protection before implementing them. Sample counts and the claim that an assigned user can open an app must be backed by the actual integration, not copied as assumed behavior.

The current static export is only the visual prototype. Revisit the export configuration when adding Next.js server-side authentication. Keep the private Sites demo independent of local backend availability; do not expose the local backend simply to make the existing demo work.

## Implementation references

- [Better Auth's Convex integration](https://better-auth.com/docs/integrations/convex)
- [Self-hosted Convex development and deployment](https://stack.convex.dev/self-hosted-develop-and-deploy)

These record the intended direction, not a completed or tested integration. Full generation prompts are in `prompts.md`.
