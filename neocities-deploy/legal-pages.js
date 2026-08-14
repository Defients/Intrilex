// ═══════════════════════════════════════════════════════════════
// legal-pages.js — Privacy Policy and Terms of Service renderers
//
// Renders two production legal pages with Intrilex-native UX:
//   /privacy — Privacy Policy
//   /terms   — Terms of Service
//
// Both pages use the same reading layout as the rulebook (sticky TOC
// sidebar + scrollable serif content) for visual consistency.
// Content is authored as semantic HTML strings so it is selectable,
// accessible, and offline-capable (bundled into the app, no fetch).
// ═══════════════════════════════════════════════════════════════

import { esc } from './state.js?v=73b458295383';

const EFFECTIVE_DATE = 'August 11, 2026';
const LAST_UPDATED = 'August 11, 2026';
const CONTACT_EMAIL = 'a1deffy@gmail.com';
const OPERATOR = 'Intrilex, operated by Deffy Pyah Urz';

// ── Shared layout helpers ───────────────────────────────────────

/**
 * Build a sticky-TOC + scrollable-content reading layout.
 * @param {{ title: string, eyebrow: string, meta: string, toc: {slug:string,text:string}[], bodyHtml: string }} opts
 * @returns {string} HTML string for the page
 */
function readingLayout({ title, eyebrow, meta, toc, bodyHtml }) {
  const tocHtml = toc.map(item =>
    `<li><a href="#${esc(item.slug)}">${esc(item.text)}</a></li>`
  ).join('');

  return `
    <div class="reading-progress" aria-hidden="true"></div>
    <div class="legal-page">
      <aside class="legal-toc" aria-label="${esc(title)} table of contents">
        <div class="legal-toc-header">
          <p class="eyebrow">${esc(eyebrow)}</p>
          <h2>${esc(title)}</h2>
          <p class="legal-toc-meta">${esc(meta)}</p>
        </div>
        <nav class="legal-toc-nav">
          <ul>${tocHtml}</ul>
        </nav>
        <div class="legal-toc-footer">
          <a href="#/" class="legal-back-home">&larr; Back to Intrilex</a>
        </div>
      </aside>
      <main class="legal-content" id="legal-content" tabindex="-1">
        ${bodyHtml}
      </main>
    </div>`;
}

/**
 * Wire up smooth-scroll for TOC anchor links, reading-progress bar,
 * and active-section tracking. Call after the layout is in the DOM.
 * @param {HTMLElement} container
 */
function wireLegalPageInteractions(container) {
  // Smooth-scroll for TOC links
  container.querySelectorAll('.legal-toc-nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const slug = link.getAttribute('href').slice(1);
      const target = container.querySelector(`#${CSS.escape(slug)}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          const y = target.getBoundingClientRect().top + window.scrollY - 16;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }, 50);
      }
    });
  });

  // Reading progress indicator + active section tracking
  const progressEl = container.querySelector('.reading-progress');
  const tocLinks = container.querySelectorAll('.legal-toc-nav a[href^="#"]');
  const updateProgress = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    if (progressEl) progressEl.style.width = `${pct}%`;
    let activeSlug = null;
    for (const link of tocLinks) {
      const slug = link.getAttribute('href').slice(1);
      const el = container.querySelector(`#${CSS.escape(slug)}`);
      if (el && el.getBoundingClientRect().top <= 80) activeSlug = slug;
    }
    tocLinks.forEach(link => {
      const slug = link.getAttribute('href').slice(1);
      link.classList.toggle('active', slug === activeSlug);
    });
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
}

// ── Privacy Policy content ──────────────────────────────────────

const PRIVACY_TOC = [
  { slug: 'introduction', text: '1. Introduction' },
  { slug: 'information-we-collect', text: '2. Information We Collect' },
  { slug: 'how-we-use-information', text: '3. How We Use Information' },
  { slug: 'public-information', text: '4. Public Information' },
  { slug: 'aggregated-de-identified', text: '5. Aggregated and De-Identified Information' },
  { slug: 'service-providers', text: '6. Service Providers and Disclosures' },
  { slug: 'legal-safety-disclosures', text: '7. Legal, Safety, and Security Disclosures' },
  { slug: 'cookies-local-storage', text: '8. Cookies and Local Storage' },
  { slug: 'retention', text: '9. Retention' },
  { slug: 'account-data-deletion', text: '10. Account and Data Deletion' },
  { slug: 'privacy-rights', text: '11. Your Privacy Rights' },
  { slug: 'childrens-privacy', text: '12. Children\u2019s Privacy' },
  { slug: 'security', text: '13. Security' },
  { slug: 'email-communications', text: '14. Email Communications' },
  { slug: 'international-users', text: '15. International Users' },
  { slug: 'changes-to-policy', text: '16. Changes to This Policy' },
  { slug: 'contact', text: '17. Contact' },
];

function privacyBodyHtml() {
  return `
    <header class="legal-header">
      <p class="eyebrow">PRIVACY POLICY</p>
      <h1>Privacy Policy</h1>
      <p class="legal-dates">
        <strong>Effective Date:</strong> ${EFFECTIVE_DATE}<br />
        <strong>Last Updated:</strong> ${LAST_UPDATED}
      </p>
    </header>

    <section id="introduction">
      <h2>1. Introduction</h2>
      <p>This Privacy Policy describes how ${esc(OPERATOR)} (\u201cIntrilex,\u201d \u201cwe,\u201d \u201cus\u201d) handles personal information in connection with the Intrilex tactical card game and related services (the \u201cService\u201d). By accessing or using Intrilex, you acknowledge this Privacy Policy.</p>
      <p>Intrilex is currently in an early pre-Alpha stage and is intended for preview purposes. Features, mechanics, and systems are under active development and may change.</p>
    </section>

    <section id="information-we-collect">
      <h2>2. Information We Collect</h2>

      <h3>2.1 Account Information</h3>
      <p>If you create an account, we may collect or derive:</p>
      <ul>
        <li><strong>Email address</strong> \u2014 provided by Discord or Google when you sign in with that provider, and associated with your account by our authentication provider.</li>
        <li><strong>Username / display name</strong> \u2014 the name shown to you and other players.</li>
        <li><strong>Avatar</strong> \u2014 your profile image, which may be sourced from your Discord or Google account.</li>
        <li><strong>Account and provider identifiers</strong> \u2014 internal identifiers used to authenticate you and link your account.</li>
      </ul>

      <h3>2.2 Authentication Information</h3>
      <p>Intrilex uses <strong>Discord OAuth</strong>, <strong>Google OAuth</strong>, and <strong>anonymous (guest) sign-in</strong> through Supabase, our authentication provider. Intrilex itself does not handle, receive, or store your Discord or Google password. When you sign in with Discord or Google, you are redirected to that provider\u2019s own consent screen, and the provider sends back a limited set of account information authorized by you. Guest accounts are anonymous sessions with limited capabilities.</p>

      <h3>2.3 Player and Gameplay Information</h3>
      <p>We collect and derive gameplay information, including:</p>
      <ul>
        <li>Ratings, rankings, and leaderboard placement;</li>
        <li>Badges and achievements;</li>
        <li>Match results and match history summaries;</li>
        <li>Game actions, command history, and detailed match records where retained (primarily for online matches);</li>
        <li>Replay data where generated or retained.</li>
      </ul>
      <p>Local matches played against AI are stored in your browser\u2019s local storage and IndexedDB on your device. Online matches involve server-side processing and storage as described below.</p>

      <h3>2.4 Technical and Security Information</h3>
      <p>When you connect to Intrilex\u2014particularly for online play\u2014we may process:</p>
      <ul>
        <li>IP address (used for rate limiting, abuse prevention, and security);</li>
        <li>Browser and device information derived from network requests;</li>
        <li>Connection timestamps and session/security data;</li>
        <li>Diagnostic and error information (for example, server logs written for operational and debugging purposes).</li>
      </ul>

      <h3>2.5 User-Provided Communications and Content</h3>
      <p>If you contact us for support, to report a problem, or to request account changes, we may receive and retain the content of your communication. In online matches, in-game chat messages you send are transmitted to other match participants and may be retained as described in this policy.</p>
    </section>

    <section id="how-we-use-information">
      <h2>3. How We Use Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, operate, and maintain Intrilex;</li>
        <li>Authenticate users and manage accounts;</li>
        <li>Operate matches, including server-authoritative online play;</li>
        <li>Maintain rankings, leaderboards, badges, and achievements;</li>
        <li>Protect the security of the Service and prevent fraud, cheating, and abuse;</li>
        <li>Debug, investigate, and resolve disputes;</li>
        <li>Provide player support;</li>
        <li>Comply with legal obligations;</li>
        <li>Perform analytics, game balancing, and product improvement;</li>
        <li>Communicate with you about your account, security, and important service notices.</li>
      </ul>
    </section>

    <section id="public-information">
      <h2>4. Public Information</h2>
      <p>Certain player information is intentionally public and may be visible to other players, including where implemented:</p>
      <ul>
        <li>Username / display name;</li>
        <li>Avatar;</li>
        <li>Rating and rank;</li>
        <li>Badges and achievements;</li>
        <li>Leaderboard placement;</li>
        <li>Public match history summaries and results.</li>
      </ul>
      <p><strong>Detailed private match records and replays are not public by default.</strong> They may be retained for legitimate purposes such as moderation, cheat detection, dispute review, competitive integrity, debugging, and game improvement, but they are not generally displayed to other users without your involvement.</p>
    </section>

    <section id="aggregated-de-identified">
      <h2>5. Aggregated and De-Identified Information</h2>
      <p>We may use aggregated or de-identified information for statistics, game balancing, research, reliability, security, and product improvement. We do not claim that pseudonymous data is necessarily anonymous. Where information remains reasonably linkable to an identifiable player, we treat it as personal information for the purposes of this policy.</p>
    </section>

    <section id="service-providers">
      <h2>6. Service Providers and Disclosures</h2>
      <p>We use third-party service providers to operate Intrilex. These may include providers of:</p>
      <ul>
        <li>Authentication (Supabase);</li>
        <li>Hosting and infrastructure;</li>
        <li>Database and data storage;</li>
        <li>Security and monitoring.</li>
      </ul>
      <p>These providers process information on our behalf as necessary to operate the Service, and are bound by their own terms and practices. When you sign in with Discord or Google, that provider\u2019s own privacy policy and terms also apply to the information the provider handles.</p>
      <p><strong>Intrilex does not sell users\u2019 personal information.</strong> This is an explicit product commitment.</p>
      <p><strong>Intrilex does not use personal information for behavioral or targeted advertising.</strong></p>
    </section>

    <section id="legal-safety-disclosures">
      <h2>7. Legal, Safety, and Security Disclosures</h2>
      <p>We may disclose information where we believe disclosure is reasonably necessary to:</p>
      <ul>
        <li>Comply with applicable law or legal process;</li>
        <li>Respond to lawful requests from authorities;</li>
        <li>Prevent, investigate, or address fraud, abuse, or security issues;</li>
        <li>Enforce our Terms of Service;</li>
        <li>Protect Intrilex, our users, or the rights, safety, and security of others.</li>
      </ul>
      <p>We do not claim unlimited authority to disclose your information. Disclosures are limited to what is reasonably necessary for the purposes described above, subject to applicable law.</p>
    </section>

    <section id="cookies-local-storage">
      <h2>8. Cookies and Local Storage</h2>
      <p>Intrilex does not use advertising cookies or cross-site tracking cookies. We rely primarily on browser <strong>local storage</strong> and <strong>IndexedDB</strong> for client-side persistence, including:</p>
      <ul>
        <li><strong>Authentication sessions</strong> \u2014 your sign-in session is persisted in your browser so you remain signed in across visits;</li>
        <li><strong>Local player profile</strong> \u2014 your local rating, badges, and match statistics from games played against AI;</li>
        <li><strong>Match saves and replays</strong> \u2014 stored locally in IndexedDB so you can resume and review matches;</li>
        <li><strong>Display and accessibility preferences</strong> \u2014 such as reduced motion and visual settings;</li>
        <li><strong>Network match reconnection data</strong> \u2014 a short-lived record (30-minute expiry) that helps you rejoin an online match after a disconnect;</li>
        <li><strong>Service worker cache</strong> \u2014 enables offline-first PWA behavior and is automatically refreshed on updates.</li>
      </ul>
      <p>We do not operate a consent-management platform for cookies because we do not use advertising or tracking cookies. You can clear local storage and IndexedDB at any time through your browser settings or the in-app Settings workspace.</p>
    </section>

    <section id="retention">
      <h2>9. Retention</h2>
      <p>We retain information only as long as reasonably necessary for the purposes described in this policy, including:</p>
      <ul>
        <li>Operating accounts and the Service;</li>
        <li>Security, fraud, and abuse prevention;</li>
        <li>Dispute resolution and competitive integrity;</li>
        <li>Legal obligations;</li>
        <li>Backup and data integrity.</li>
      </ul>
      <p>We do not commit to specific hard retention periods, as appropriate retention depends on the type of information and the purpose for which it is held. Some information (such as IP addresses used for rate limiting) is held only transiently in memory, while other information (such as account and match records) is retained for the operational lifetime of the account or Service, subject to applicable law.</p>
    </section>

    <section id="account-data-deletion">
      <h2>10. Account and Data Deletion</h2>
      <p>You may request deletion of your account or personal information by contacting us at <a href="mailto:${CONTACT_EMAIL}">${esc(CONTACT_EMAIL)}</a>.</p>
      <p>We will take reasonable steps to act on valid requests. However, some information may be retained where necessary for:</p>
      <ul>
        <li>Security;</li>
        <li>Fraud and abuse prevention;</li>
        <li>Legal obligations;</li>
        <li>Resolving disputes;</li>
        <li>Enforcing legitimate restrictions;</li>
        <li>Backup and data-integrity requirements.</li>
      </ul>
      <p>We do not promise immediate or complete destruction from every backup or log, as technical realities may require limited residual retention subject to applicable law. Local data stored in your browser (local storage, IndexedDB) can be cleared by you at any time through your browser settings or the in-app Settings workspace.</p>
    </section>

    <section id="privacy-rights">
      <h2>11. Your Privacy Rights</h2>
      <p>Depending on where you live and subject to applicable law, you may have certain rights regarding your personal information, which may include the right to:</p>
      <ul>
        <li>Access the personal information we hold about you;</li>
        <li>Correct inaccurate information;</li>
        <li>Request deletion of your personal information;</li>
        <li>Receive a portable copy of your information;</li>
        <li>Restrict or object to certain processing;</li>
        <li>Withdraw consent where processing is based on consent;</li>
        <li>Exercise applicable opt-out rights.</li>
      </ul>
      <p>Not every right listed above necessarily applies to every Intrilex user, as the availability of specific rights depends on applicable jurisdictional law. To exercise any available right, contact us at <a href="mailto:${CONTACT_EMAIL}">${esc(CONTACT_EMAIL)}</a>.</p>
    </section>

    <section id="childrens-privacy">
      <h2>12. Children\u2019s Privacy</h2>
      <p>Intrilex is intended for users aged <strong>13 or older</strong>. Children under 13 may not create or use an Intrilex account. Intrilex is not intentionally designed to collect personal information from children under 13.</p>
      <p>If we learn that we have collected personal information from a child under 13, we will take reasonable steps to remove it. If you believe this has happened, please contact us at <a href="mailto:${CONTACT_EMAIL}">${esc(CONTACT_EMAIL)}</a>.</p>
      <p>Some jurisdictions may require a higher minimum age or additional consent. Where local law requires a higher minimum age, that higher age applies.</p>
    </section>

    <section id="security">
      <h2>13. Security</h2>
      <p>We take reasonable technical and organizational measures to protect personal information, including using an established authentication provider, server-authoritative online play with hidden-information controls, and rate limiting to mitigate abuse.</p>
      <p>However, no system is perfectly secure. We cannot guarantee zero risk or complete protection from every possible breach. You can help protect your account by keeping your Discord or Google account secure and by signing out when using shared devices.</p>
    </section>

    <section id="email-communications">
      <h2>14. Email Communications</h2>
      <h3>14.1 Operational Email</h3>
      <p>We may send you emails that are necessary for operating the Service, including authentication, security notices, account notices, support responses, and important product or legal/policy changes.</p>
      <h3>14.2 Optional Promotional Email</h3>
      <p>We may in the future offer optional Intrilex news or product-update email. If we do, it will include appropriate unsubscribe or opt-out functionality. We do not currently operate a newsletter or marketing-email system.</p>
    </section>

    <section id="international-users">
      <h2>15. International Users</h2>
      <p>Intrilex is operated from the United States. If you access Intrilex from outside the United States, your information may be processed in the United States or where our service providers operate. Depending on where you live, you may have rights under applicable local privacy law. We do not claim global compliance certifications. Where applicable law provides you with rights, we will endeavor to honor them as described in this policy.</p>
    </section>

    <section id="changes-to-policy">
      <h2>16. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. The <strong>Last Updated</strong> date above indicates when it was last revised. Where we make material changes, we will provide reasonable notice through the Service or by other appropriate means. Changes become effective according to the stated notice or update mechanism and applicable law.</p>
    </section>

    <section id="contact">
      <h2>17. Contact</h2>
      <p>If you have questions about this Privacy Policy or your personal information, please contact us at:</p>
      <p><a href="mailto:${CONTACT_EMAIL}">${esc(CONTACT_EMAIL)}</a></p>
    </section>
  `;
}

// ── Terms of Service content ────────────────────────────────────

const TERMS_TOC = [
  { slug: 'agreement', text: '1. Agreement to the Terms' },
  { slug: 'eligibility', text: '2. Eligibility' },
  { slug: 'accounts', text: '3. Accounts and Account Security' },
  { slug: 'multiple-accounts', text: '4. Multiple Accounts' },
  { slug: 'license', text: '5. License to Use Intrilex' },
  { slug: 'intrilex-ip', text: '6. Intrilex Intellectual Property' },
  { slug: 'creator-content', text: '7. Creator-Friendly Gameplay Content' },
  { slug: 'user-content', text: '8. User Content' },
  { slug: 'public-content-promotion', text: '9. Public Content and Promotion' },
  { slug: 'feedback', text: '10. Feedback' },
  { slug: 'acceptable-use', text: '11. Acceptable Use' },
  { slug: 'competitive-integrity', text: '12. Competitive Integrity and Cheating' },
  { slug: 'security-research', text: '13. Good-Faith Security Research' },
  { slug: 'moderation', text: '14. Moderation and Enforcement' },
  { slug: 'game-rules', text: '15. Game Rules and Competitive Systems' },
  { slug: 'service-evolution', text: '16. Game and Service Evolution' },
  { slug: 'availability', text: '17. Availability' },
  { slug: 'third-party-services', text: '18. Third-Party Services' },
  { slug: 'no-paid-goods', text: '19. No Current Paid Goods' },
  { slug: 'suspension-termination', text: '20. Suspension and Termination' },
  { slug: 'disclaimers', text: '21. Disclaimers' },
  { slug: 'liability', text: '22. Limitation of Liability' },
  { slug: 'indemnification', text: '23. Indemnification' },
  { slug: 'governing-law', text: '24. Governing Law' },
  { slug: 'courts-venue', text: '25. Courts and Venue' },
  { slug: 'no-arbitration', text: '26. No Mandatory Arbitration' },
  { slug: 'changes-to-terms', text: '27. Changes to the Terms' },
  { slug: 'severability', text: '28. Severability' },
  { slug: 'waiver', text: '29. Waiver' },
  { slug: 'assignment', text: '30. Assignment' },
  { slug: 'entire-agreement', text: '31. Entire Agreement' },
  { slug: 'contact', text: '32. Contact' },
];

function termsBodyHtml() {
  return `
    <header class="legal-header">
      <p class="eyebrow">TERMS OF SERVICE</p>
      <h1>Terms of Service</h1>
      <p class="legal-dates">
        <strong>Effective Date:</strong> ${EFFECTIVE_DATE}<br />
        <strong>Last Updated:</strong> ${LAST_UPDATED}
      </p>
    </header>

    <section id="agreement">
      <h2>1. Agreement to the Terms</h2>
      <p>These Terms of Service (\u201cTerms\u201d) govern your access to and use of Intrilex, operated by Deffy Pyah Urz (\u201cIntrilex,\u201d \u201cwe,\u201d \u201cus\u201d). By creating an account, signing in, or otherwise accessing or using Intrilex, you agree to these Terms. If you do not agree, you may not use Intrilex.</p>
      <p>You acknowledge that you have read these Terms and the Privacy Policy. You can review both at any time at <a href="#/privacy">Privacy Policy</a> and <a href="#/terms">Terms of Service</a>.</p>
    </section>

    <section id="eligibility">
      <h2>2. Eligibility</h2>
      <p>You must be at least <strong>13 years of age</strong> to create an account or use Intrilex. If local law requires a higher minimum age, that higher age applies. By using Intrilex, you represent that you meet these requirements and have any legal capacity or authorization necessary to agree to these Terms.</p>
    </section>

    <section id="accounts">
      <h2>3. Accounts and Account Security</h2>
      <p>You are responsible for activity that occurs through your account, except for activity that is genuinely unauthorized and outside your reasonable control. To help keep your account secure, you should:</p>
      <ul>
        <li>Provide accurate information when creating or updating your account;</li>
        <li>Keep your Discord or Google account and any linked credentials secure;</li>
        <li>Sign out when using shared or public devices;</li>
        <li>Notify us at <a href="mailto:${CONTACT_EMAIL}">${esc(CONTACT_EMAIL)}</a> if you believe your account has been compromised or used without authorization.</li>
      </ul>
      <p>You may not impersonate another person or entity, or misrepresent your affiliation. We are not liable for losses arising from unauthorized access that you failed to reasonably prevent.</p>
    </section>

    <section id="multiple-accounts">
      <h2>4. Multiple Accounts</h2>
      <p>Multiple accounts (\u201calts\u201d) are allowed. However, you may not use alternative accounts for:</p>
      <ul>
        <li>Cheating;</li>
        <li>Collusion;</li>
        <li>Rating or ranking manipulation;</li>
        <li>Win trading;</li>
        <li>Matchmaking manipulation;</li>
        <li>Ban evasion;</li>
        <li>Impersonation or abuse;</li>
        <li>Circumventing restrictions or obtaining an unfair competitive advantage.</li>
      </ul>
    </section>

    <section id="license">
      <h2>5. License to Use Intrilex</h2>
      <p>Subject to these Terms, we grant you a limited, personal, non-exclusive, non-transferable, revocable license to access and use Intrilex for your personal, non-commercial entertainment. This license does not include any right to resell, sublicense, or commercially exploit Intrilex except as expressly described in these Terms.</p>
    </section>

    <section id="intrilex-ip">
      <h2>6. Intrilex Intellectual Property</h2>
      <p>Intrilex\u2014including its name, logos, branding, code, artwork, interfaces, card visual assets, audiovisual work, written material, and the expression of its rulebook\u2014is protected by applicable intellectual property laws. We retain all rights not expressly granted to you in these Terms.</p>
      <p>Nothing in these Terms asserts ownership over abstract game mechanics or ideas beyond the rights actually recognized by applicable law. We respect the distinction between protectable expression and unprotectable ideas.</p>
    </section>

    <section id="creator-content">
      <h2>7. Creator-Friendly Gameplay Content</h2>
      <p>We support player creation. You may generally:</p>
      <ul>
        <li>Stream Intrilex gameplay;</li>
        <li>Record and publish gameplay videos;</li>
        <li>Publish screenshots;</li>
        <li>Create guides, tutorials, commentary, and reviews;</li>
        <li>Monetize ordinary creator content through normal platform monetization (for example, ad revenue, subscriptions, or tips on the platform where you publish).</li>
      </ul>
      <p>Uses that require our prior approval include:</p>
      <ul>
        <li>Commercial merchandise that substantially uses Intrilex branding or assets;</li>
        <li>Implying official sponsorship or affiliation where none exists;</li>
        <li>Representing unofficial products or services as official Intrilex offerings;</li>
        <li>Substantial standalone commercial exploitation of protected Intrilex branding or assets outside ordinary creator content.</li>
      </ul>
      <p>Nothing in these Terms is intended to prevent fair criticism, commentary, review, or ordinary creator activity.</p>
    </section>

    <section id="user-content">
      <h2>8. User Content</h2>
      <p>You retain ownership of original content you create and submit to Intrilex, such as usernames, display names, avatars, profile information, and in-game chat messages. By submitting content to Intrilex, you grant us the limited license reasonably necessary to:</p>
      <ul>
        <li>Host, store, reproduce technically, transmit, display, format, and distribute the content within the Service;</li>
        <li>Moderate the content and operate features;</li>
        <li>Protect the Service and fulfill the purposes for which the content was submitted.</li>
      </ul>
      <p>We do not claim ownership of your original content. You represent that you have the rights necessary to submit your content and that your content does not infringe the rights of any third party.</p>
    </section>

    <section id="public-content-promotion">
      <h2>9. Public Content and Promotion</h2>
      <p>For content you intentionally make public through Intrilex\u2014such as public usernames, public avatars, public leaderboard appearances, public match results, and (when community systems launch) public community posts\u2014you grant us a reasonable license to reuse that public material for Intrilex promotional and marketing purposes.</p>
      <p>This promotional license does <strong>not</strong> include private messages, email addresses, authentication information, private match records, security logs, private reports, or other non-public personal information.</p>
      <p>If your relevant content or account is later deleted, or if you reasonably request that we stop new promotional use, we will stop new promotional use going forward where reasonably practical. We are not required to recall, destroy, or retroactively remove every piece of promotional material lawfully published before your deletion or request.</p>
    </section>

    <section id="feedback">
      <h2>10. Feedback</h2>
      <p>You may voluntarily submit ideas, suggestions, feature requests, balance feedback, or bug reports. We may use and act on feedback without any obligation to compensate you or to implement your suggestion. Submitting feedback does not transfer ownership of any unrelated creation to us.</p>
    </section>

    <section id="acceptable-use">
      <h2>11. Acceptable Use</h2>
      <p>You may not use Intrilex to:</p>
      <ul>
        <li>Harass, threaten, or abuse others;</li>
        <li>Post hateful, defamatory, or degrading content;</li>
        <li>Doxx or share others\u2019 private information without consent;</li>
        <li>Impersonate another person or entity;</li>
        <li>Commit fraud;</li>
        <li>Send spam or unsolicited communications;</li>
        <li>Distribute malware or harmful code;</li>
        <li>Engage in unlawful conduct;</li>
        <li>Access or attempt to access unauthorized information or systems;</li>
        <li>Disrupt or attempt to disrupt Intrilex\u2019s operation;</li>
        <li>Intentionally infringe the rights of others.</li>
      </ul>
    </section>

    <section id="competitive-integrity">
      <h2>12. Competitive Integrity and Cheating</h2>
      <p>To protect fair play, you may not:</p>
      <ul>
        <li>Use unauthorized gameplay bots or automation to gain an unfair advantage;</li>
        <li>Use unauthorized modified clients to gain an unfair advantage;</li>
        <li>Abuse exploits or maliciously exploit bugs;</li>
        <li>Collude, win-trade, or manipulate ratings, rankings, or matchmaking;</li>
        <li>Abuse accounts, evade bans, or circumvent restrictions;</li>
        <li>Tamper with network traffic or attempt unauthorized access.</li>
      </ul>
      <p>Ordinary accessibility tools are not prohibited unless they create an unfair prohibited advantage.</p>
    </section>

    <section id="security-research">
      <h2>13. Good-Faith Security Research</h2>
      <p>We welcome good-faith security research that is limited, non-destructive, privacy-respecting, does not access other users\u2019 information unnecessarily, and is responsibly reported. If you believe you have found a vulnerability, please report it to <a href="mailto:${CONTACT_EMAIL}">${esc(CONTACT_EMAIL)}</a>.</p>
      <p>The following conduct is prohibited and is not protected by this policy:</p>
      <ul>
        <li>Exploiting vulnerabilities for gameplay advantage;</li>
        <li>Stealing or accessing unauthorized information;</li>
        <li>Persisting after being asked to stop;</li>
        <li>Destroying data or disrupting the Service;</li>
        <li>Extortion or denial-of-service;</li>
        <li>Publicly weaponizing an unpatched vulnerability in a manner that creates unreasonable risk.</li>
      </ul>
    </section>

    <section id="moderation">
      <h2>14. Moderation and Enforcement</h2>
      <p>We may investigate and take action regarding conduct we believe violates these Terms or harms Intrilex or its users. Action we may take includes, where reasonably applicable:</p>
      <ul>
        <li>Warnings;</li>
        <li>Restrictions;</li>
        <li>Muting (where muting functionality exists);</li>
        <li>Removing prohibited content (where removal functionality exists);</li>
        <li>Suspending or terminating accounts.</li>
      </ul>
      <p>Reasons for action may include cheating, harassment, malicious abuse, security threats, fraud, ban evasion, unlawful activity, or serious or repeated Terms violations. We do not currently operate a formal appeals process. We may add one in the future. We do not claim the right to punish users for arbitrary reasons.</p>
    </section>

    <section id="game-rules">
      <h2>15. Game Rules and Competitive Systems</h2>
      <p>The official rules and current software implementation govern gameplay. Software may contain bugs. Rankings, ratings, leaderboard positions, badges, achievements, and game mechanics may change, be corrected, or be removed. Leaderboard positions are not property, and badges, achievements, and rankings are not guaranteed permanent entitlements. We do not warrant that the software implementation will never differ from documentation.</p>
    </section>

    <section id="service-evolution">
      <h2>16. Game and Service Evolution</h2>
      <p>We may update, rebalance, modify, add, remove, or redesign cards, game mechanics, rankings, matchmaking, interfaces, modes, features, rules, and systems. When reasonably practical, we will announce major competitive changes. We do not promise that any particular card, rating, ranking, badge, mechanic, feature, or game mode will exist forever.</p>
    </section>

    <section id="availability">
      <h2>17. Availability</h2>
      <p>We do not guarantee uninterrupted uptime, permanent availability, freedom from bugs, zero data loss, or preservation of every feature forever. You acknowledge that the Service is provided on a reasonable-efforts basis and may be modified, suspended, or discontinued at any time.</p>
    </section>

    <section id="third-party-services">
      <h2>18. Third-Party Services</h2>
      <p>Intrilex integrates with third-party services for authentication (Discord, Google, Supabase) and infrastructure. These services are governed by their own terms and privacy practices. We are not responsible for the practices of third-party providers, and your use of those services is subject to their terms.</p>
    </section>

    <section id="no-paid-goods">
      <h2>19. No Current Paid Goods</h2>
      <p>Intrilex currently does not offer paid virtual goods, subscriptions, or in-app purchases through the application. If we introduce purchases in the future, additional payment terms and any applicable refund policy will be provided at that time.</p>
    </section>

    <section id="suspension-termination">
      <h2>20. Suspension and Termination</h2>
      <p>You may stop using Intrilex at any time. You may request account or data deletion by contacting <a href="mailto:${CONTACT_EMAIL}">${esc(CONTACT_EMAIL)}</a>. We may restrict, suspend, or terminate access for legitimate reasons, including serious or repeated violations of these Terms, abuse, cheating, fraud, security threats, or unlawful conduct. Provisions that by their nature are intended to survive termination (such as intellectual property, disclaimers, liability, indemnity, and governing-law provisions) remain in effect after termination. Because Intrilex currently has no purchases, no refunds are owed.</p>
    </section>

    <section id="disclaimers">
      <h2>21. Disclaimers</h2>
      <p>To the maximum extent permitted by applicable law, Intrilex is provided on an <strong>\u201cas is\u201d</strong> and <strong>\u201cas available\u201d</strong> basis. We disclaim all implied warranties, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement, except to the extent that applicable law does not permit these disclaimers. We do not warrant that the Service will meet your requirements, be error-free, or be available at all times.</p>
    </section>

    <section id="liability">
      <h2>22. Limitation of Liability</h2>
      <p>To the maximum extent permitted by applicable law, and subject to liabilities that cannot legally be excluded or limited, our aggregate liability for any claim arising out of or relating to these Terms or Intrilex shall be limited to the greater of:</p>
      <ul>
        <li><strong>US $100</strong>; or</li>
        <li>The amount you paid directly to Intrilex during the 12 months preceding the event giving rise to the claim.</li>
      </ul>
      <p>To the maximum extent permitted by applicable law, we shall not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill, arising out of or relating to the Service. These limitations do not apply to liabilities that cannot legally be excluded or limited under applicable law.</p>
    </section>

    <section id="indemnification">
      <h2>23. Indemnification</h2>
      <p>To the maximum extent permitted by applicable law, you agree to indemnify and hold us harmless from third-party claims, damages, and reasonable costs arising out of:</p>
      <ul>
        <li>Your unlawful conduct;</li>
        <li>Your fraud or malicious abuse;</li>
        <li>Infringement through user-supplied content you submit;</li>
        <li>Material violation of these Terms by you; or</li>
        <li>Your intentional violation of another person\u2019s rights.</li>
      </ul>
      <p>This indemnity is narrow and does not require you to indemnify us for our own unrelated misconduct.</p>
    </section>

    <section id="governing-law">
      <h2>24. Governing Law</h2>
      <p>These Terms and any dispute arising out of or relating to them or to Intrilex shall be governed by the laws of the State of New Hampshire, United States, without regard to its conflict-of-law principles, to the extent permitted by applicable law. Mandatory rights that cannot legally be contracted away are preserved.</p>
    </section>

    <section id="courts-venue">
      <h2>25. Courts and Venue</h2>
      <p>Subject to applicable jurisdictional requirements, disputes should generally be brought in an appropriate New Hampshire state court or federal court with jurisdiction in New Hampshire. You and we submit to the personal jurisdiction of such courts for disputes arising out of or relating to Intrilex, to the extent permitted by applicable law.</p>
    </section>

    <section id="no-arbitration">
      <h2>26. No Mandatory Arbitration</h2>
      <p>These Terms do not include a mandatory arbitration agreement. Nothing in these Terms requires you or us to resolve disputes through private arbitration, waive a jury trial, or waive participation in a class action, except as otherwise required by applicable law or agreed by you in a separate future agreement.</p>
    </section>

    <section id="changes-to-terms">
      <h2>27. Changes to the Terms</h2>
      <p>We may update these Terms from time to time. The <strong>Last Updated</strong> date above indicates when they were last revised. Where we make material changes, we will provide reasonable notice through the Service or by other appropriate means. We do not retroactively claim your acceptance of changes you never saw. Continued use of Intrilex after changes become effective constitutes acceptance of the revised Terms, to the extent permitted by applicable law.</p>
    </section>

    <section id="severability">
      <h2>28. Severability</h2>
      <p>If any provision of these Terms is found to be unenforceable, the remaining provisions continue in effect to the maximum extent legally possible. The unenforceable provision will be modified only to the extent necessary to make it enforceable while preserving its original intent as closely as possible.</p>
    </section>

    <section id="waiver">
      <h2>29. Waiver</h2>
      <p>Our failure to enforce a provision on one occasion does not waive our right to enforce it in the future. No waiver is effective unless it is in writing.</p>
    </section>

    <section id="assignment">
      <h2>30. Assignment</h2>
      <p>We may transfer or assign these Terms and our rights and obligations under them in connection with a legitimate future restructuring, acquisition, or transfer of the Service. You may not transfer or assign these Terms or your account without our prior written consent. These Terms are binding on permitted successors and assigns.</p>
    </section>

    <section id="entire-agreement">
      <h2>31. Entire Agreement</h2>
      <p>These Terms, together with the Privacy Policy and any other policies expressly incorporated by reference, constitute the entire agreement between you and us concerning Intrilex, and supersede any prior agreements on that subject.</p>
    </section>

    <section id="contact">
      <h2>32. Contact</h2>
      <p>If you have questions about these Terms, please contact us at:</p>
      <p><a href="mailto:${CONTACT_EMAIL}">${esc(CONTACT_EMAIL)}</a></p>
    </section>
  `;
}

// ── Public renderers ────────────────────────────────────────────

/**
 * Render the Privacy Policy into a container.
 * @param {HTMLElement} container
 */
export function renderPrivacyPage(container) {
  container.innerHTML = readingLayout({
    title: 'Privacy Policy',
    eyebrow: 'LEGAL',
    meta: `Effective ${EFFECTIVE_DATE} \u00b7 Last updated ${LAST_UPDATED}`,
    toc: PRIVACY_TOC,
    bodyHtml: privacyBodyHtml(),
  });
  wireLegalPageInteractions(container);
}

/**
 * Render the Terms of Service into a container.
 * @param {HTMLElement} container
 */
export function renderTermsPage(container) {
  container.innerHTML = readingLayout({
    title: 'Terms of Service',
    eyebrow: 'LEGAL',
    meta: `Effective ${EFFECTIVE_DATE} \u00b7 Last updated ${LAST_UPDATED}`,
    toc: TERMS_TOC,
    bodyHtml: termsBodyHtml(),
  });
  wireLegalPageInteractions(container);
}

/**
 * Returns the shared acknowledgment line for signup/auth surfaces.
 * @returns {string} HTML string
 */
export function legalAcknowledgmentHtml() {
  return `<p class="legal-ack">By creating an account or signing in, you agree to the <a href="#/terms">Terms of Service</a> and acknowledge the <a href="#/privacy">Privacy Policy</a>.</p>`;
}
