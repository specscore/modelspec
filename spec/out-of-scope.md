# Out Of Scope

ModelSpec defines the logical application data model.

It intentionally does not define:

- RBAC
- permission grants
- OAuth
- user identity
- feature specifications
- workflows
- deployment
- UI
- audit log policy
- encryption policy
- storage provider trust
- synchronization conflict resolution

These concerns are important, but they belong in adjacent specifications and systems.

## Examples

ModelSpec can say:

```text
User.email is a required unique string with email format.
```

ModelSpec should not say:

```text
Only admins may read User.email.
```

ModelSpec can say:

```text
Order.user is a required relationship to User.
```

ModelSpec should not say:

```text
The checkout workflow must create an Order after payment authorization.
```

Keeping these boundaries clear allows ModelSpec to remain storage-neutral,
language-neutral, and backend-neutral.
