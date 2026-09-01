# Microsoft 365 storage setup

> **Status:** setup and acceptance guide for the optional Microsoft 365 connector
>
> **Permission boundary:** delegated `Files.ReadWrite` only
>
> **Last reviewed:** 2026-08-23

## Purpose and boundary

Skriv can keep a linked copy of a document in a location the signed-in user can
write to in Microsoft 365. A Teams channel's files are stored in SharePoint:
standard channels use folders in the team's parent site, while private and
shared channels have separate sites. See Microsoft's
[Teams and SharePoint integration](https://learn.microsoft.com/en-us/sharepoint/teams-connected-sites).

The connector is deliberately narrower than a general Teams integration:

- Skriv still saves the working document locally in IndexedDB first.
- The browser talks directly to Microsoft identity and Microsoft Graph. There
  is no Papertek document or token server in this flow.
- Authentication is delegated and interactive. The connector never has access
  when no user is signed in.
- The app registration has only delegated `Files.ReadWrite`. Do not add
  application permissions, directory permissions, Teams permissions, or
  `Files.ReadWrite.All`.
- Skriv uses a folder link chosen by the user. It does not enumerate the
  tenant's teams or channels.
- The deployment pins one bare global-cloud SharePoint host. Skriv accepts only
  that exact tenant host and its derived tenant-`-my` companion, both before
  and after Graph resolution.
- A linked Skriv document is not live Word co-authoring, a Teams tab, or a
  Teams Assignments submission.
- Skriv does not add per-file privacy on top of Microsoft permissions. Everyone
  who can read or edit the selected folder can potentially read or edit its
  `.skriv` files.

Microsoft lists delegated `Files.ReadWrite` as the least-privileged permission
for uploading or replacing a drive item. See
[Upload or replace drive-item content](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content)
and the
[Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference).

The OAuth grant itself is **not folder-scoped**: it permits the signed-in app
to work with that user's files. Skriv's code deliberately limits its own
operations to the selected folder, but school consent, governance, and DPIA
must assess the actual broader delegated grant rather than describe the
permission as access to only one folder.

## Test setup: mock tenant only

Use a mock or developer tenant with fictitious users and documents. Never test
this integration with real pupils, real assignments, or other production school
data. A Microsoft 365 developer sandbox, when available to an eligible account,
is intended only for development and can be short-lived; see
[Set up a Microsoft 365 developer sandbox](https://learn.microsoft.com/en-us/office/developer-program/microsoft-365-developer-program-get-started).

### 1. Prepare test identities and a Teams folder

Create or select these licensed, fictitious accounts:

| Account | Minimum role in the test | Purpose |
| --- | --- | --- |
| Tenant administrator | Entra/Microsoft 365 administrator | App registration and optional consent |
| Test student | Member of the test Team | Normal Skriv workflow |
| Test teacher | Owner of the test Team | Verify that the linked file is visible to the teacher |

Then create:

1. A Team named `Skriv testklasse`.
2. A **standard** channel named `Norsk`.
3. A folder in that channel named `Skriv-testing`.
4. Add the test student as a Team member and the test teacher as a Team owner.

Start with a standard channel. Private and shared channels use separate
SharePoint sites and belong in the expanded test matrix, not the minimum smoke
test. This standard-channel folder is appropriate only because the mock data is
fictitious: ordinary Team members can normally see its files. For a production
drafting workflow, use a school-managed per-pupil OneDrive folder or another
teacher/pupil folder whose Microsoft permissions match the school's intended
visibility. Skriv does not turn a shared channel folder into private storage.

### 2. Register the localhost SPA

In the [Microsoft Entra admin center](https://entra.microsoft.com/):

1. Go to **Identity > Applications > App registrations > New registration**.
2. Name it `Papertek Skriv Test`.
3. Select **Accounts in this organizational directory only**.
4. Register the application and record:
   - **Application (client) ID**
   - **Directory (tenant) ID**
5. Under **Authentication**, add a **Single-page application** platform.
6. Add this exact redirect URI:

   ```text
   http://localhost:4173/microsoft-auth-redirect.html
   ```

7. Do not enable the implicit grant. MSAL Browser uses the authorization-code
   flow with PKCE for SPAs.
8. Do not create a client secret or certificate. A browser SPA cannot keep one
   confidential.

The redirect URI is security-sensitive and must match the dedicated response
page exactly. Use
`http://localhost:4173/microsoft-auth-redirect.html`, not the app root and not
`http://127.0.0.1:4173/microsoft-auth-redirect.html`; `localhost` and
`127.0.0.1` are different origins with separate browser storage. Hash routes
are not part of the registered redirect URI. Microsoft documents SPA
registration and localhost redirects in
[Configure a single-page application](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-configuration)
and
[Redirect URI best practices and limitations](https://learn.microsoft.com/en-in/entra/identity-platform/reply-url).

Start the repository's localhost server from the project root:

```sh
node scripts/serve-local.mjs
```

Then open `http://localhost:4173/` exactly. This server binds locally, serves
the app without a build step, gives both MSAL response resources
`Cache-Control: no-store`, and intentionally sends no
`Cross-Origin-Opener-Policy` header. Do not use the generic Python static
server for an authenticated mock-tenant test.

MSAL 5 relays the popup response through that page and
`/vendor/msal-redirect-bridge-5.17.3.min.js`. The local web server must return
both URLs directly, not the SPA fallback, with these response rules:

- `Cache-Control: no-store`
- **no** `Cross-Origin-Opener-Policy` response header

Skriv's service worker explicitly bypasses both resources, but that does not
replace correct HTTP response headers. The redirect HTML also contains cache
meta directives as defense-in-depth. Verify the local server before sign-in,
for example with `curl -I` against both URLs; neither response may contain a
COOP header or a cacheable `Cache-Control` value.

### 3. Configure exactly one Graph permission

Under **API permissions**:

1. Remove any API permission that was added by default, including `User.Read`.
2. Select **Add a permission > Microsoft Graph > Delegated permissions**.
3. Add only `Files.ReadWrite`.
4. Confirm that there are no **Application permissions**.

OpenID Connect sign-in scopes managed by MSAL are not additional Graph data
permissions. Do not add `Files.ReadWrite.All`, `Sites.ReadWrite.All`,
`ChannelSettings.Read.All`, roster permissions, or directory permissions to
make folder discovery more convenient.

`Files.ReadWrite` does not inherently require administrator consent, but a
school tenant can disable user consent. If the test student receives
**Approval required**, the tenant administrator can review and grant consent
for this test enterprise application. Do not loosen tenant-wide consent policy
just to make the test pass. See Microsoft's
[overview of user and admin consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview)
and
[admin consent workflow](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-admin-consent-workflow).

### 4. Configure the local app

The client ID, tenant ID, and bare SharePoint host are public deployment
configuration, not credentials. Test credentials, passwords, MFA codes, access
tokens, and refresh tokens are secrets and must never be placed in source
control, screenshots, issue text, or chat. **Never send a password or MFA code
to Papertek, Codex, support staff, or another person.** The test student
completes sign-in and MFA only inside the Microsoft popup; nobody else needs or
should ask for those values.

For localhost development, open `http://localhost:4173/`, choose the
**Microsoft 365** button, and enter the application/client ID and
directory/tenant ID plus the mock tenant's bare SharePoint host in the
development form. Skriv validates the IDs as GUIDs and the host as one bare
global-cloud hostname such as `contoso.sharepoint.com`. Do not enter a scheme,
path, port, wildcard, IP address, or `contoso-my.sharepoint.com`; Skriv derives
the matching `contoso-my.sharepoint.com` OneDrive companion itself.

The form stores these exact session keys:

- `skriv.microsoft.clientId`
- `skriv.microsoft.tenantId`
- `skriv.microsoft.sharePointHost`

The override record is scoped to the current browser tab/session, is accepted
only on localhost, and is not backed up as a setting. A linked document does
carry its tenant ID and canonical SharePoint target as bounded remote metadata;
it never carries the client ID, pasted link, raw MSAL account identifier,
email, or token. Use **Clear configuration** in the same dialog after testing.
Closing the browser tab also ends this development configuration and the MSAL
session cache.

### 5. Copy the test folder link

Use the folder's normal Microsoft 365 link; do not copy a browser address for a
different channel or create an anonymous sharing link.

1. Sign in to Teams as the test student.
2. Open `Skriv testklasse` > `Norsk` > the channel's files/shared view.
3. Find the `Skriv-testing` folder.
4. Open the folder's **More options (`…`)** menu and choose **Copy link**.
5. If that action is not available, choose **Open in SharePoint**, select the
   folder there, and choose **Copy link**.
6. Prefer **People with existing access** when Microsoft asks for a link type.
   Do not widen the folder's permissions for Skriv.
7. Copy the complete URL, including its query string, into Skriv's folder-link
   field.

The student must already have write access through Team membership. A folder
link is a locator, not a way to bypass Microsoft 365 permissions. Skriv clears
the pasted link immediately after reading it. Only the tenant-bound resolved
drive/folder target is kept for this tab under
`skriv.microsoft.target.v1`; the sharing URL is not stored in IndexedDB or a
backup. Skriv validates the pasted URL before Graph resolution and Graph's
canonical `webUrl` afterward. The URL must use HTTPS, contain no embedded
credentials or explicit port, and have exactly the configured
`<tenant>.sharepoint.com` hostname or the derived
`<tenant>-my.sharepoint.com` companion. Lookalike suffixes, arbitrary
subdomains, other tenants, and non-global SharePoint clouds are rejected by
this first version.

## Test acceptance checklist

Run the acceptance suite with only fictitious content. Use a second browser
profile or private window when two simultaneous sessions are required.

### Configuration and authentication

- [ ] With a missing/invalid client ID, tenant ID, or SharePoint host, Skriv
  remains fully usable locally and does not attempt Microsoft authentication.
- [ ] `http://localhost:4173/` signs in successfully using the registered
  `http://localhost:4173/microsoft-auth-redirect.html`; neither the app root nor
  the `127.0.0.1` origin is registered for this test.
- [ ] The redirect page and bridge return `Cache-Control: no-store`, return no
  `Cross-Origin-Opener-Policy` header, bypass the service worker, and still
  complete/cancel a popup without stranding the main window.
- [ ] The Microsoft consent surface requests delegated `Files.ReadWrite` and no
  broader Graph permission.
- [ ] The school reviewer understands that `Files.ReadWrite` itself is broader
  than one folder even though Skriv constrains its own operations to the
  selected folder.
- [ ] The test student can connect; an account outside the mock tenant cannot.
- [ ] If two test accounts become cached in one tab/session, Skriv does not pick
  an arbitrary account; it requires explicit account selection.
- [ ] Canceling the sign-in popup leaves local writing undisturbed.
- [ ] No token or document content appears in the browser console, URL, or
  application logs.
- [ ] IndexedDB and a whole-library backup contain no email, username,
  home-account ID, access token, or pasted folder link; a linked document has
  only the pseudonymous SHA-256 account binding and bounded remote metadata.

### Folder and document behavior

- [ ] A valid `Skriv-testing` folder link resolves and its human-readable
  location is shown before the first upload.
- [ ] Connecting and choosing a folder do not upload any existing local-only
  document; the pupil must explicitly link a document first.
- [ ] A malformed link, a link from another tenant, and a link to a folder the
  student cannot write to all fail safely without losing the local document.
- [ ] Lookalike domains, arbitrary SharePoint subdomains, ports, embedded URL
  credentials, and non-global-cloud hosts are rejected before Graph is called.
- [ ] Only the exact configured `<tenant>.sharepoint.com` and derived
  `<tenant>-my.sharepoint.com` hosts pass, and a Graph result whose canonical
  `webUrl` leaves that boundary is rejected before the target is stored.
- [ ] Creating a linked document produces one file in `Skriv-testing`.
- [ ] Subsequent syncs update that drive item instead of creating duplicates.
- [ ] Moving the linked file to another folder or renaming it away from
  `.skriv` makes update/import fail closed before any upload starts.
- [ ] An unchanged linked document does not upload again merely because the
  dialog was opened or local sync metadata changed.
- [ ] The test teacher can see the file through the Team and SharePoint.
- [ ] A title with `æ`, `ø`, `å`, spaces, punctuation, or an empty title results
  in a valid, predictable filename.
- [ ] Opening or downloading remote content applies Skriv's schema, size, and
  HTML-safety validation before it can enter the editor.
- [ ] A file at/above 60 MiB is rejected from upload/import. Import rejects an
  oversized `driveItem.size`, `Content-Length`, or accumulated stream even when
  one of the other size signals is missing or false.
- [ ] A folder beyond five Graph pages or 200 `.skriv` files shows the localized
  “choose a smaller folder” error instead of rendering an unbounded list.
- [ ] Importing a valid remote document creates a local copy in **Uten mappe**
  in the pupil's current school year, clears any legacy subject shortcut, and
  therefore enters the normal cleanup flow even when the remote file came from
  an older school year.
- [ ] Importing the same active remote item twice opens the existing local
  document; if that identity is in Skriv trash, the UI asks for restore instead
  of creating a second linked alias.
- [ ] Invalid UTF-8, including a broken multi-byte character split across
  response chunks, is rejected rather than silently changed.

### Local-first, offline, and conflicts

- [ ] Disconnecting the network never interrupts local autosave or typing.
- [ ] Offline edits show that the text is safe on the device and waiting for
  Microsoft 365; the next available manual or scheduled sync completes after
  connectivity returns.
- [ ] Closing or navigating away waits for the local save, not for a slow Graph
  request.
- [ ] Editing the same linked document in two browser profiles causes an ETag
  `412` conflict and never silently overwrites either version.
- [ ] The eTag stored with the local hash is the upload acknowledgement's eTag.
  If a follow-up metadata read already has a different eTag, Skriv reports a
  conflict instead of claiming that the remote copy is current.
- [ ] If the upload succeeds but the metadata enrichment request fails, Skriv
  accepts the authoritative upload acknowledgement and does not retry a
  committed create/update into a `409` or `412`.
- [ ] A `409` filename collision during first create also becomes a conflict
  and never overwrites the existing file.
- [ ] The conflict flow offers **Keep both** as the recommended choice and
  creates a clearly named second copy.
- [ ] Editing again while an upload is in flight queues a follow-up pass; the
  final acknowledged hash represents the newer local content.
- [ ] A late acknowledgement cannot overwrite a newer local edit, unlink, or
  move-to-trash transition; the atomic compare-and-swap resolves it as
  superseded instead.
- [ ] Deleting the remote file does not delete the local document.
- [ ] Moving the local document to Skriv trash does not silently delete the
  Microsoft 365 copy.

### Revocation and account switching

- [ ] Switching from the student to the teacher pauses links owned by the
  student account instead of syncing with the wrong identity.
- [ ] Removing the student from the Team produces an access error while the
  local document remains editable and recoverable.
- [ ] Revoking consent or disabling the enterprise application requires a new
  authorization; it never removes local writing.
- [ ] `Stop syncing this document` keeps both the local and Microsoft copies.
- [ ] `Stop syncing this document` remains available without valid deployment
  configuration, sign-in, or a selected session folder.
- [ ] An expired token offers **Reconnect** from the user click and then retries
  the document sync; it does not loop on silent token acquisition.
- [ ] `Stop syncing this document` still wins when another tab has an upload or
  autosync timer in flight; stale background work cannot recreate the link.
- [ ] `Disconnect Microsoft account` clears every account/token in this Skriv
  app's MSAL session cache; neither the local nor Microsoft copy is deleted.
- [ ] On localhost, **Clear test setup** remains visible after configuration is
  valid and first disconnects/clears the current session before reload.
- [ ] There is no remote-delete action in Skriv. Unlinking, local trash/delete,
  and Microsoft disconnect leave the Microsoft 365 file untouched.

### Shared-device sign-out

On a shared school device, verify this student procedure:

1. Wait for **Synced with Microsoft 365**, or download a Skriv backup if sync
   cannot complete.
2. Choose **Disconnect Microsoft account** in Skriv.
3. Close all Skriv and Microsoft 365 tabs.
4. Sign out of the managed browser or operating-system school session when the
   device is being handed to another pupil.

MSAL uses session-scoped browser storage for the connector. Skriv sign-out must
clear its local MSAL account/token cache, but it cannot promise to end every
Microsoft single-sign-on session already active elsewhere in the browser. Do
not add a custom **Remember me** option. See
[MSAL Browser cache behavior](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching).

## Production setup: school-approved deployment

The mock registration and test data must not be promoted to production. Create
a separate app registration and complete the school's governance process.

### 1. Governance before activation

The school owner, normally the municipality or county authority, decides the
purpose and legal basis for processing pupils' work. The pupil's connect click
is a product choice; it is not, by itself, the school's GDPR legal basis.

Before enabling the connector, the school owner must at least:

- document the complete data flow between the pupil's browser, Microsoft
  identity, Graph, OneDrive/SharePoint, and local browser storage;
- perform and approve a privacy and information-security risk assessment;
- determine whether a DPIA is required and complete it when applicable;
- document controller/processor roles and ensure the necessary data-processing
  agreements cover the actual flow;
- define access control, retention, deletion, incident response, and support
  procedures;
- choose Microsoft folder permissions deliberately: a standard Team channel is
  shared with its members, so private pupil drafts require a per-pupil or
  otherwise appropriately restricted folder;
- give pupils and guardians age-appropriate information in Bokmål and Nynorsk;
- verify Microsoft 365 storage region, transfer, retention, sensitivity-label,
  and DLP requirements for the school;
- limit the initial enterprise application assignment to an approved pilot
  group where possible.

Udir states that school owners are responsible for risk assessment and
processor agreements for learning and cloud services:

- [Barnehage- og skoleeiers personvernansvar](https://www.udir.no/regelverk-og-tilsyn/personvern-for-barnehage-og-skole/barnehage--og-skoleeiers-ansvar/)
- [Personvern i skytjenester](https://www.udir.no/regelverk-og-tilsyn/personvern-for-barnehage-og-skole/veiledere/personvern-i-skytjenester/)

Datatilsynet notes that consent is often an unsuitable legal basis in the
school context and that school tools still require central assessment:

- [Samtykke fra mindreårige](https://www.datatilsynet.no/personvern-pa-ulike-omrader/skole-barn-unge/samtykkje-fra-mindrearige/)
- [Funn fra tilsyn med personvernet i skolen](https://www.datatilsynet.no/aktuelt/aktuelle-nyheter-2025/funn-fra-tilsyn-med-personvernet-i-skolen/)

This guide is an engineering checklist, not a completed legal assessment for a
school owner.

### 2. Register the production SPA

Create a new single-tenant registration owned and reviewed by the production
organization:

1. Select **Accounts in this organizational directory only**.
2. Add the dedicated response page on the exact canonical HTTPS Skriv origin
   as a **Single-page application** redirect, for example:

   ```text
   https://skriv.example-school.no/microsoft-auth-redirect.html
   ```

3. Register only delegated Microsoft Graph `Files.ReadWrite`.
4. Remove default `User.Read` and confirm there are no application permissions.
5. Do not create a client secret.
6. Do not add the localhost redirect to the production registration.
7. Have the school administrator review the consent text and, if school policy
   requires it, grant admin consent and restrict user assignment to the
   approved group.

Production must use HTTPS. The origin, path, and case must match the deployed
redirect page exactly; do not register the app root. Hash routes such as
`#/doc/...` are not registered separately.

### 3. Supply production configuration through meta tags

Configure the deployed `public/index.html` with these exact tags:

```html
<meta name="skriv:microsoft-client-id" content="APPLICATION-CLIENT-ID">
<meta name="skriv:microsoft-tenant-id" content="DIRECTORY-TENANT-ID">
<meta name="skriv:microsoft-sharepoint-host" content="SCHOOL-TENANT.sharepoint.com">
```

Place them in `<head>` before the application scripts. Use the production
registration's IDs and the school tenant's bare global-cloud SharePoint host,
not the mock tenant's values. Do not include `https://`, a path, port, wildcard,
or the `-my` variant. These are public configuration values, but deployment
changes must still be reviewed because they decide which Entra tenant,
enterprise application, and SharePoint host boundary Skriv accepts.

Do not use the localhost `sessionStorage` override keys in production. Do not
put a secret, token, test account, folder URL, or pupil identifier in a meta
tag. A deployment with any missing or invalid value remains local-only and
hides the Microsoft button; the localhost development form is never exposed to
pupils on a production hostname. Deployment validation and monitoring must
surface such configuration errors to administrators outside the pupil UI.

### 4. Serve the redirect page and bridge network-only

Configure the hosting/CDN layer with a path-specific exception for both:

```text
/microsoft-auth-redirect.html
/vendor/msal-redirect-bridge-5.17.3.min.js
```

Each HTTP response must contain `Cache-Control: no-store` and must omit the
`Cross-Origin-Opener-Policy` header entirely. Do not rely on HTML meta tags,
normal static-asset cache rules, or the service worker. A site-wide COOP policy
needs an explicit exception for these two paths because the MSAL popup bridge
must communicate with its opener. Skriv's `skriv-v80` worker deliberately does
not precache or intercept either resource.

Verify both the headers and behavior on the canonical production URL before
enabling the enterprise application. A cached bridge, a redirect page served
as the SPA shell, or a COOP header is a deployment failure even if the rest of
Skriv works.

### 5. Production readiness checks

Repeat the complete acceptance checklist on the canonical HTTPS origin, then
also confirm:

- [ ] The only production redirect is the exact canonical
  `https://…/microsoft-auth-redirect.html`, with no app-root, wildcard,
  abandoned-domain, or localhost entry.
- [ ] Both redirect resources return `Cache-Control: no-store`, omit
  `Cross-Origin-Opener-Policy`, bypass `skriv-v80`, and are never rewritten to
  the SPA shell.
- [ ] Only the approved tenant can sign in.
- [ ] The configured bare SharePoint host is the approved global-cloud school
  tenant; exact tenant and derived tenant-`-my` links pass while all other
  hosts fail both before and after Graph resolution.
- [ ] Only delegated `Files.ReadWrite` appears in the enterprise application.
- [ ] Microsoft auth and Graph responses are never cached by Skriv's service
  worker.
- [ ] Content Security Policy and network allowlists permit only the required
  Microsoft identity/Graph endpoints, approved SharePoint hosts, and
  short-lived Graph-provided transfer URLs in addition to Skriv's own origin.
- [ ] School Conditional Access and MFA work without an exemption that weakens
  other applications.
- [ ] Sensitivity labels, DLP, retention, and revoked Team membership fail
  closed while preserving the local working copy.
- [ ] Shared-device sign-out has been tested on the actual managed browser and
  operating-system configuration used by pupils.
- [ ] Support staff know how to distinguish local save, queued/follow-up sync,
  permission failure, conflict, and a missing remote file.
- [ ] The school's privacy notice, processing record, risk assessment, and DPIA
  decision match the released implementation and requested permission.

Any future move to multi-tenant sign-in, Teams/channel enumeration, assignments,
Word round-tripping, background application access, or broader Graph scopes is
a new security and privacy change. It requires a separate design, consent and
governance review rather than an incremental permission added to this app
registration.
