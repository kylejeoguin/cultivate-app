import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy · Cultivate',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <main className="max-w-2xl mx-auto px-8 py-16">
        <div className="mb-10">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← cultivate</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2 tracking-tight">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: June 13, 2026</p>

        {/* Plain-language summary — most families read this and nothing else, so it has to
            stand on its own. The full legal detail follows below. */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-10">
          <h2 className="text-base font-bold text-gray-900 mb-3">The short version</h2>
          <p className="text-gray-600 text-sm mb-4">Here&apos;s the whole thing in plain English. The full details are below.</p>
          <ul className="space-y-2.5 text-sm text-gray-700">
            <li className="flex gap-2"><span className="text-green-700 shrink-0">✓</span><span><strong>Your records are yours.</strong> Download everything you&apos;ve entered, anytime, with one click. We&apos;ll never hold your data hostage.</span></li>
            <li className="flex gap-2"><span className="text-green-700 shrink-0">✓</span><span><strong>We never sell your data.</strong> Not to anyone, ever.</span></li>
            <li className="flex gap-2"><span className="text-green-700 shrink-0">✓</span><span><strong>Your kids never log in.</strong> Only you, the parent, have an account — and you can review, correct, or delete anything about your children at any time.</span></li>
            <li className="flex gap-2"><span className="text-green-700 shrink-0">✓</span><span><strong>We never see your card.</strong> Payments are handled entirely by Stripe.</span></li>
            <li className="flex gap-2"><span className="text-green-700 shrink-0">✓</span><span><strong>You control your email.</strong> We send setup tips and occasional updates — unsubscribe anytime in one click.</span></li>
            <li className="flex gap-2"><span className="text-green-700 shrink-0">✓</span><span><strong>Your data is encrypted</strong> on the way to us and while we store it, and only you can see your records.</span></li>
          </ul>
        </div>

        <div className="prose prose-gray max-w-none space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Who we are</h2>
            <p className="text-gray-600">
              Cultivate is a family management platform for homeschool and homestead families, operated by Kyle O&apos;Guin
              (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). You can reach us at{' '}
              <a href="mailto:hello@mycultivate.app" className="text-green-700 underline">hello@mycultivate.app</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">What data we collect</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li><strong className="text-gray-800">Account information:</strong> Your email address and password (stored securely via Supabase Auth).</li>
              <li><strong className="text-gray-800">Educational records:</strong> Children&apos;s names, grade levels, school year dates, daily log entries, attendance records, subjects, grades, and hours you choose to enter.</li>
              <li><strong className="text-gray-800">Homestead and home records:</strong> Livestock, garden, food preservation, and home maintenance logs you create.</li>
              <li><strong className="text-gray-800">Photos:</strong> Images you choose to attach to log entries — for example, a photo of a school project, a garden, or your children and their work. Photos are stored in our secure storage (Supabase) and are shown only within your own account, reports, and yearbook. They are never sent to our AI provider, and never shared or sold.</li>
              <li><strong className="text-gray-800">Payment information:</strong> Handled entirely by Stripe. We never see or store your card number.</li>
              <li><strong className="text-gray-800">Email address for communications:</strong> If you sign up for Cultivate, your email is added to our mailing list (managed via MailerLite) so we can send you onboarding guidance and product updates. You can unsubscribe at any time.</li>
              <li><strong className="text-gray-800">Usage data:</strong> Standard server logs (pages visited, timestamps). We do not use third-party analytics trackers.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">How we use your data</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li>To provide and operate the Cultivate service.</li>
              <li>To generate your reports, transcripts, and compliance summaries.</li>
              <li>To send transactional emails (account confirmation, password reset, subscription receipts).</li>
              <li>To send onboarding and product update emails via MailerLite. You can unsubscribe at any time using the link in any email we send.</li>
              <li>To improve the product based on aggregate usage patterns.</li>
            </ul>
            <p className="text-gray-600 mt-3">We do not sell your data to any third party, ever.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">AI subject tagging and log routing</h2>
            <p className="text-gray-600">
              When you use the daily log, the text you enter is sent to Anthropic&apos;s API to identify relevant
              subjects, route your entry to the correct modules (homeschool, homestead, home maintenance), and
              pre-fill a confirmation card for your review. This text is not stored by Anthropic beyond the duration
              of the request, per{' '}
              <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">Anthropic&apos;s privacy policy</a>.
              Nothing is written to your records until you explicitly confirm the pre-filled card. You can edit or
              override any AI suggestion before confirming.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Your data export</h2>
            <p className="text-gray-600">
              You can download a complete export of every record you&apos;ve ever entered in Cultivate — homeschool logs,
              homestead records, home maintenance history, and account information — at any time from your Account page.
              The export is a human-readable JSON file. Your data is yours. We will never hold it hostage.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Third-party services</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li><strong className="text-gray-800">Supabase</strong> — database and authentication, hosted on AWS. All data is stored in the US.</li>
              <li><strong className="text-gray-800">Vercel</strong> — web hosting and edge delivery.</li>
              <li><strong className="text-gray-800">Stripe</strong> — payment processing. Stripe&apos;s privacy policy governs all payment data. We never see or store your card number.</li>
              <li><strong className="text-gray-800">Anthropic</strong> — AI log routing and subject tagging. Log text is sent to Anthropic only during the routing step and is not stored beyond the request. Photos are never sent to Anthropic.</li>
              <li><strong className="text-gray-800">Resend</strong> — transactional email delivery (account confirmation, password reset, subscription receipts, and critical service notices). Resend processes the email address and message contents needed to deliver these messages. Resend&apos;s privacy policy governs their handling of that data.</li>
              <li><strong className="text-gray-800">MailerLite</strong> — marketing email communications. Your email address is stored in MailerLite so we can send onboarding and product update emails. You can unsubscribe at any time. MailerLite&apos;s privacy policy governs their handling of your email address.</li>
            </ul>
            <p className="text-gray-600 mt-3">We do not sell your data to any third party, ever.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Children&apos;s data (COPPA)</h2>
            <p className="text-gray-600 mb-3">
              Cultivate is designed exclusively for parents and legal guardians to manage their family&apos;s educational
              and homestead records. Children do not create accounts, log in, or directly submit data to Cultivate.
              All data about minors is entered by the parent or guardian account holder.
            </p>
            <p className="text-gray-600 mb-3">
              We do not knowingly collect personal information directly from children under 13. Children&apos;s names,
              educational records, and any photos a parent chooses to attach are stored solely to provide the service
              to that parent — they are never used for advertising, profiling, facial recognition, or AI training, and
              are never shared with or sold to any third party.
            </p>
            <p className="text-gray-600">
              As the parent or guardian, you have the right to review, correct, or request deletion of any information
              about your children stored in Cultivate. To exercise this right, email{' '}
              <a href="mailto:hello@mycultivate.app" className="text-green-700 underline">hello@mycultivate.app</a>.
              If you believe a child under 13 has submitted data without parental consent, contact us and we will
              delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Your rights</h2>
            <p className="text-gray-600 mb-3">You have the following rights over your data:</p>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li><strong className="text-gray-800">Access:</strong> Download a complete export of all your data at any time from your Account page.</li>
              <li><strong className="text-gray-800">Correction:</strong> Edit any record you&apos;ve entered directly in the app, or email us.</li>
              <li><strong className="text-gray-800">Deletion:</strong> Request deletion of your account and all associated data at any time. We will process deletion requests within 30 days.</li>
              <li><strong className="text-gray-800">Unsubscribe:</strong> Opt out of all marketing email at any time using the unsubscribe link in any email we send, or by emailing us.</li>
              <li><strong className="text-gray-800">Children&apos;s records:</strong> As the parent or guardian, review, correct, or delete any records about your children at any time.</li>
            </ul>
            <p className="text-gray-600 mt-3">
              To exercise any of these rights, email{' '}
              <a href="mailto:hello@mycultivate.app" className="text-green-700 underline">hello@mycultivate.app</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Data retention and deletion</h2>
            <p className="text-gray-600">
              We keep your records for as long as you have an account with us — including after a subscription ends —
              so you can always return to your history or export it. We do not automatically delete your data when you
              cancel. You may request permanent deletion of your account and all associated data at any time by emailing{' '}
              <a href="mailto:hello@mycultivate.app" className="text-green-700 underline">hello@mycultivate.app</a>.
              We will process deletion requests within 30 days. Backups may retain data for up to 90 days after
              deletion — no backup data is used for any purpose after a deletion request is processed.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Security</h2>
            <p className="text-gray-600">
              Your data is encrypted both in transit (every connection uses HTTPS) and at rest (encrypted on our
              servers). Passwords are never stored in plaintext. Row-level security in Supabase ensures you can only
              access your own data — no other user can read your records. We rely on
              Supabase&apos;s enterprise-grade security infrastructure including encrypted storage and automated daily backups.
              No system is 100% secure — if you discover a vulnerability, please report it to{' '}
              <a href="mailto:hello@mycultivate.app" className="text-green-700 underline">hello@mycultivate.app</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">State compliance disclaimer</h2>
            <p className="text-gray-600">
              Cultivate tracks homeschool hours and subjects based on publicly available state requirement data.
              This information is provided for reference only. Homeschool laws change — always verify your
              state&apos;s current requirements at{' '}
              <a href="https://hslda.org/legal" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">hslda.org/legal</a>{' '}
              or your state education department. Cultivate is not a law firm and does not provide legal advice.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Changes to this policy</h2>
            <p className="text-gray-600">
              We may update this policy as the product evolves. Material changes will be communicated by email to
              active subscribers at least 14 days before taking effect. The current version is always available at
              mycultivate.app/privacy. Continued use of Cultivate after changes take effect constitutes acceptance
              of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-600">
              Questions about this policy?{' '}
              <a href="mailto:hello@mycultivate.app" className="text-green-700 underline">hello@mycultivate.app</a>
            </p>
          </section>

        </div>
      </main>
    </div>
  )
}
