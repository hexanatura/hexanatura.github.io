# Security Audit Report

## Scope and assessment

This follow-up reviewed the existing security findings and the local hardening changes in this repository. It covers the static site/client code, Firebase Cloud Functions, Firestore and Storage rules, payment integration, admin flows, dependency manifests, and locally available configuration. Production Firebase, payment-gateway, hosting, IAM, and backup environments were not accessed.

**Overall assessment: NOT READY FOR PRODUCTION.** A credential-bearing Functions environment file remains in local ignored storage, and its contents were present in repository history. Production credential rotation, history cleanup, deployment, and infrastructure checks remain outstanding. Local emulator coverage and dependency checks passed, but they do not establish production configuration or end-to-end payment security.

## Technologies and architecture inspected

- Static HTML/CSS/JavaScript storefront and administration pages.
- Firebase Authentication, Cloud Firestore, Cloud Functions, and Cloud Storage.
- Node.js 22 Firebase Functions; functions are configured for `asia-south1`.
- Razorpay payment order creation and webhook handling; Nodemailer-backed contact/review notifications.
- Firebase Emulator Suite for local Firestore and Storage rules tests.
- Firebase Hosting and deployed Firebase configuration could not be inspected from this local environment.

## 27-point checklist

| # | Checklist item | Status | Evidence / limitation |
|---|---|---|---|
| 1 | No sensitive API keys or credentials exposed in frontend code | PASS | Frontend Firebase configuration includes a public client API identifier; it is not a server credential. Privileged payment and mail secrets are not used in client code. |
| 2 | Sensitive credentials are server-side | PASS | Privileged integrations use server-side Functions configuration. Deployed secret provisioning and values were not verified. |
| 3 | Scan repository for exposed keys, passwords, and tokens | FAIL | Gitleaks detected the ignored local Functions environment file. Finding values were not printed. |
| 4 | Check Git history for previously committed secrets and recommend rotation | FAIL | The credential-bearing Functions environment file is present in three historical revisions. No credentials were rotated and shared history was not rewritten. |
| 5 | Verify database permissions and access controls | NOT VERIFIED | Rules were tested locally; production project IAM and database access configuration were not available. |
| 6 | Users can access only their own data | PASS | Firestore owner isolation and cross-user denial cases passed in the emulator suite. |
| 7 | Implement and verify Firestore Row Level Security/rules | PASS | Firestore rules were exercised with authenticated, anonymous, owner, non-owner, and admin contexts in the emulator. |
| 8 | Prevent unauthorized queries and IDOR | PASS | Rules enforce ownership/admin access for private records; cross-user read and write tests passed. |
| 9 | Verify database backup security and access restrictions | NOT VERIFIED | Backup configuration and access controls require production-console/project access. |
| 10 | Enforce HTTPS throughout the application | NOT VERIFIED | Hosting and custom-domain runtime configuration were not accessible. |
| 11 | Configure HTTP-to-HTTPS redirection | NOT VERIFIED | Deployed Firebase Hosting or edge configuration was not inspected. |
| 12 | Configure Secure, HttpOnly, SameSite cookies where applicable | NOT VERIFIED | No production cookie/session configuration was available to verify. |
| 13 | Configure strict CORS policies | PASS | Server-side callable/API CORS configuration uses configured trusted origins; deployed origin values were not verified. |
| 14 | Server-side validation for every form and API input | NOT VERIFIED | Sensitive checkout, contact, and review flows have server-side validation and rate limits. A complete runtime test of every endpoint and form was not performed. |
| 15 | Prevent SQL injection with parameterized queries/safe access | PASS | No SQL database or SQL query path was identified; data access uses Firestore SDK APIs. |
| 16 | Prevent XSS through safe output handling | PASS | Review/user-provided display values in the inspected storefront and admin review surfaces are escaped. No full-site dynamic-output test was run. |
| 17 | Secure file uploads by type, size, and content | PASS | Career upload code applies size/type/content checks; Storage rules deny direct client access. Emulator verified client Storage access denial; upload-function integration was not exercised. |
| 18 | CSRF protection wherever applicable | NOT VERIFIED | Callable APIs and Firebase authentication are used for sensitive flows, but a full CSRF assessment of all deployed routes and browser contexts was not performed. |
| 19 | Protect admin routes and privileged operations | PASS | Admin checks are enforced in privileged Functions and Firestore rules; emulator tests verify admin-only access. Production claims/admin records were not inspected. |
| 20 | Implement and verify RBAC | PASS | Admin role is checked through the Firestore admin record and callable authorization; emulator admin/non-admin cases passed. |
| 21 | Rate-limit login, registration, password reset, and sensitive APIs | NOT VERIFIED | Server-side limits exist for sensitive checkout/contact/review/payment verification paths. Authentication-provider limits and end-to-end throttling were not tested. |
| 22 | Verify secure password hashing (Argon2id/bcrypt) | NOT VERIFIED | Password storage is delegated to Firebase Authentication; provider-side implementation/policy was not independently verified. |
| 23 | Identify and update outdated/vulnerable dependencies | NOT VERIFIED | Compatible direct/transitive dependency updates were applied. `npm outdated` reports a newer major Firebase test SDK release, deferred because it requires Node 24 while Functions use Node 22. |
| 24 | Run dependency vulnerability scan and resolve findings | PASS | `npm audit` reported zero vulnerabilities after updates. |
| 25 | Scan Git history for leaked secrets | FAIL | Historical revisions contain the credential-bearing Functions environment file; Gitleaks also reported the public Firebase web API-key pattern. Secret values were not disclosed. |
| 26 | Disable production debug mode and prevent sensitive errors | NOT VERIFIED | Local code/config was inspected, but deployed production debug and error-reporting settings could not be confirmed. |
| 27 | Comprehensive authorized penetration/API/auth/OWASP testing | NOT VERIFIED | Local rules tests and static checks were run. No production or staging penetration test, full API authorization matrix, or end-to-end OWASP assessment was performed. |

## Findings and remediation

### Remaining findings

1. **HIGH — Previously exposed credentials remain actionable until rotated.** The Functions environment file is present in Git history and an ignored local copy remains. The live validity and scope of each credential are unknown; treat them as compromised. Values are intentionally omitted from this report.
   - Evidence: Gitleaks working-tree scan detected the local ignored file; repository history inspection found it in three revisions.
   - Required action: Rotate/revoke affected credentials in the owning providers and provision replacements through the approved secret store. Coordinate any history cleanup with repository owners. Neither action was performed.
2. **HIGH — Production authorization and deployment configuration are unverified.** Local Firestore/Storage rules tests do not prove that the hardened rules or Functions are deployed to the intended production project.
   - Required action: Verify project identity, deployed rules/functions, IAM, secret provisioning, Hosting HTTPS redirects, Auth settings, and backups using authorized production access.
3. **HIGH — Payment flow has not been validated end-to-end.** Server-side checkout and webhook checks were hardened, but no authorized Razorpay test account/project or webhook delivery was available.
   - Required action: Run test-mode payment creation, success/failure/duplicate/mismatched webhook scenarios in an authorized staging project before production use.
4. **MEDIUM — Full API and abuse-control coverage remains incomplete.** Rate-limit logic and validation were reviewed in code, but every endpoint, authentication-provider limit, and deployment-specific CORS origin was not exercised.
   - Required action: Run a staging endpoint/authentication/authorization/throttling matrix with test accounts.

### Issues fixed locally

- Restricted private Firestore records to their owners/admins and prevented clients from writing paid order state.
- Moved checkout order creation and sensitive contact/review submissions to validated, rate-limited server callables; server-side checkout computes prices.
- Added admin authorization to privileged operations and restricted pending reviews to authorized users; public review reads are limited to approved records.
- Added Storage rules denying client reads/writes; intended privileged uploads/downloads use the Admin SDK.
- Escaped user-provided review data in storefront and administration rendering to prevent stored XSS.
- Hardened payment webhook association checks and transactional state handling to prevent mismatched payment updates and paid-order downgrade.
- Corrected owner-field update rules to account for added/removed fields.
- Updated admin bootstrap to use an environment-supplied UID and Application Default Credentials and to create the admin record expected by rules. The bootstrap was not run.
- Corrected client Functions region usage for affected call sites.
- Removed direct client writes that could trigger unbounded contact/review email notifications; added server-side validation and throttling.
- Restricted activity-log creation to admins; no client-side activity writers were found, and public event creation would allow unauthenticated log spam.
- Updated compatible dependencies and added Firestore/Storage emulator rules tests.
- Removed JavaScript string interpolation from review action handlers; review document IDs now travel in escaped data attributes and dispatch through a click listener.
- Added transactional promo-use reservations before gateway-order creation. The reservation increments usage atomically against the configured cap; payment finalization does not double-increment it, and incomplete-payment/expiry cleanup releases unpaid reservations.
- Migrated Functions and the admin bootstrap from removed Firebase Admin v14 root namespaces to modular Firestore, Storage, Auth, and app APIs after validation exposed the incompatibility.

## Verification performed

- Firestore, Storage, and promo reservation emulator suite: **9 passed, 0 failed**. Coverage includes anonymous private-data denial, owner isolation, cross-user read/write denial, authorized admin access, forged paid-order denial, restricted contact/review/activity writes, client Storage denial, concurrent promo-cap enforcement, and one-time reservation release.
- The first emulator invocation could not locate Java because the JDK was not on the process `PATH`; rerunning with the installed JDK 21 path succeeded as reported above.
- Initial promo-test attempts also exposed Admin SDK v14's removal of the legacy root Firestore namespace; the code and tests were migrated to modular APIs, after which all nine tests passed.
- The final emulator run emitted a Firebase Admin metadata-lookup warning because application-default credentials are unavailable locally; the emulator-backed assertions completed successfully. Production credentials were not accessed.
- `npm audit`: **0 vulnerabilities**.
- `npm outdated`: only the Firebase test SDK has a newer major available; upgrade deferred due to Node 24 requirement versus the project's Node 22 Functions runtime.
- Gitleaks working-tree scan: detected the ignored local Functions environment file; no secret values were printed. Historical review confirmed the file in three revisions; the scanner also matched the public Firebase client API-key pattern.
- JavaScript syntax checks, Firebase configuration JSON validation, Functions export loading, dashboard/reviews inline-script compilation, and `git diff --check`: passed.
- No production credentials were read or printed, no production tests or changes were made, no deployment occurred, no admin bootstrap was executed, and no Git history was rewritten.

## Dependencies updated

Compatible direct/transitive dependency versions and lockfile entries were updated, including `cors`, `firebase-admin`, `nodemailer`, and `razorpay`. The Functions and admin bootstrap code use Firebase Admin v14 modular APIs. `npm audit` is clean. The newer major Firebase test SDK was not adopted because it requires a newer Node version than the configured Functions runtime.

## Actions requiring authorization

- Rotate/revoke the potentially exposed mail, payment, and webhook credentials with their respective providers; provision replacements securely.
- Approve and coordinate any shared Git-history cleanup after rotation.
- Provide authorized access to verify production Firebase project identity, deployed Functions/rules/Storage rules, IAM, Auth, Hosting HTTPS behavior, secret provisioning, and backups.
- Approve a staging Razorpay/Firebase project and test credentials for end-to-end payment and webhook testing.
- Approve deployment of reviewed Functions and Firestore/Storage rules after staging verification.
- Review/approve any admin UID before running the updated admin bootstrap.

## Production recommendation

**NOT READY FOR PRODUCTION.** Do not treat the local test results as proof of production security. Resolve the exposed-credential risk, verify and deploy the hardened controls through an authorized release process, and complete staging payment/API testing and production configuration checks before reconsidering readiness.
