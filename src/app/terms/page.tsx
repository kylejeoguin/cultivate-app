import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service · Cultivate',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <main className="max-w-2xl mx-auto px-8 py-16">
        <div className="mb-10">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← cultivate</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2 tracking-tight">Terms of Service</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: June 13, 2026</p>

        <div className="prose prose-gray max-w-none space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Agreement</h2>
            <p className="text-gray-600">
              By creating an account or using Cultivate (&ldquo;the Service&rdquo;), you agree to these Terms of Service.
              Cultivate is operated by Kyle O&apos;Guin (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
              If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">The Service</h2>
            <p className="text-gray-600">
              Cultivate is a web-based platform that helps families track homeschool activities, homestead work, and
              home maintenance. The Service includes daily logging, attendance tracking, subject coverage reporting,
              AI-assisted subject tagging, photo attachments, and PDF transcript and report generation. Family plans
              allow multiple members to share one account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Subscription and billing</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li><strong className="text-gray-800">Free trial:</strong> New accounts receive a 7-day free trial. A valid payment method is required to start a trial. You are not charged during the trial. Unless you cancel before the trial ends, the subscription automatically begins and the payment method on file is charged the plan rate shown at checkout.</li>
              <li><strong className="text-gray-800">Paid subscription:</strong> After the trial, continued access requires a paid subscription. Current plans are <strong className="text-gray-800">Individual</strong> ($5/month or $50/year) and <strong className="text-gray-800">Family</strong> ($8/month or $80/year). The rate displayed at checkout always governs.</li>
              <li><strong className="text-gray-800">Billing:</strong> Subscriptions are billed monthly or annually (depending on the plan you choose) through Stripe. You authorize us to charge the payment method on file each billing cycle until you cancel.</li>
              <li><strong className="text-gray-800">Cancellation:</strong> You may cancel at any time from your account settings. Cancellation takes effect at the end of the current billing period. We do not offer prorated refunds for partial months.</li>
              <li><strong className="text-gray-800">Price changes:</strong> We will give 30 days&apos; notice of any price increase to active subscribers.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Acceptable use</h2>
            <p className="text-gray-600 mb-3">You agree to use Cultivate only for lawful purposes. You may not:</p>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li>Use the Service to store data that violates any applicable law.</li>
              <li>Attempt to reverse-engineer, scrape, or resell the Service.</li>
              <li>Share your account credentials with others.</li>
              <li>Submit false or fabricated educational records.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Educational records disclaimer</h2>
            <p className="text-gray-600">
              Cultivate is a record-keeping tool, not a legal compliance service. State homeschool requirements vary
              and change over time. The state requirement data displayed in the app is provided for reference only and
              may not reflect current law. You are responsible for ensuring your homeschool program meets all applicable
              legal requirements in your jurisdiction. We strongly recommend verifying requirements at{' '}
              <a href="https://hslda.org/legal" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">hslda.org/legal</a>{' '}
              or your state education department.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Your data</h2>
            <p className="text-gray-600">
              You own the data you enter into Cultivate. We do not claim any ownership over your educational records,
              family logs, or other content. By using the Service, you grant us a limited license to store and process
              your data solely to provide the Service to you. See our{' '}
              <a href="/privacy" className="text-green-700 underline">Privacy Policy</a> for details on how we handle your data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Service availability</h2>
            <p className="text-gray-600">
              We aim for high availability but do not guarantee uninterrupted access. We may perform maintenance that
              temporarily interrupts the Service. We are not liable for losses resulting from downtime.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Limitation of liability</h2>
            <p className="text-gray-600">
              To the maximum extent permitted by law, Cultivate and its operators are not liable for any indirect,
              incidental, or consequential damages arising from your use of the Service, including but not limited to
              data loss or legal non-compliance with homeschool regulations. Our total liability to you for any claim
              shall not exceed the amount you paid for the Service in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Termination</h2>
            <p className="text-gray-600">
              You may cancel at any time. If you cancel, we keep your records in your account so you can pick up where
              you left off if you return, and you can export everything whenever you like — we delete your data only
              when you ask us to. You may also request permanent deletion of your account and all associated data at
              any time; see our Privacy Policy for how that works. We reserve the right to suspend or terminate accounts
              that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Governing law</h2>
            <p className="text-gray-600">
              These Terms are governed by the laws of the State of Missouri, without regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-600">
              Questions? Email{' '}
              <a href="mailto:hello@mycultivate.app" className="text-green-700 underline">hello@mycultivate.app</a>.
            </p>
          </section>

        </div>
      </main>
    </div>
  )
}
