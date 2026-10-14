import { type Metadata } from "next";

import { LegalPage } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "License Agreement | SchoolSphere",
  description:
    "The license terms that govern your use of course content and materials on SchoolSphere.",
};

export default function LicensePage() {
  return (
    <LegalPage
      title="License Agreement"
      description="The license terms that govern your use of course content, materials, and resources available on SchoolSphere."
      lastUpdated="August 17, 2026"
      effectiveDate="August 17, 2026"
    >
      <h2>1. License Grant</h2>
      <p>
        Subject to your continued compliance with this License Agreement and
        our Terms of Service, SchoolSphere grants you a limited, personal,
        non-exclusive, non-transferable, non-sublicensable, and revocable
        license to access and use the course content and materials made
        available to you through the Service. This license is solely for your
        personal, non-commercial educational use unless you have entered into
        a separate written agreement with us.
      </p>

      <h2>2. Permitted Use</h2>
      <p>
        You may view, download, and stream course materials for your own
        educational purposes. You may take notes, complete assignments, and
        participate in course discussions as designed. You may access
        courses through the platform on any device you own, and you may
        download any resources explicitly marked as downloadable for offline
        personal use.
      </p>

      <h2>3. Restrictions</h2>
      <p>
        Unless you have our prior written consent, you may not: reproduce,
        redistribute, republish, retransmit, or publicly display any course
        content; modify, translate, adapt, or create derivative works based
        on any course content; remove or alter any copyright, trademark, or
        other proprietary notices; sell, license, lease, or otherwise
        commercialize access to any course content; or use any course content
        to train or develop artificial intelligence models. You may not
        share your account credentials with others or permit them to access
        courses through your account.
      </p>

      <h2>4. Intellectual Property Ownership</h2>
      <p>
        All course content, including without limitation videos, audio
        recordings, written text, images, diagrams, code samples, slide
        decks, quizzes, and downloadable resources, is the intellectual
        property of SchoolSphere or its licensors (including instructors and
        partner organizations). No ownership rights are transferred to you
        under this License. Nothing in this License constitutes a waiver of
        any of our intellectual property rights.
      </p>

      <h2>5. User Content</h2>
      <p>
        You retain ownership of any content you submit to the platform,
        including assignments, discussion posts, project submissions, and
        profile information. By submitting user content, you grant
        SchoolSphere a worldwide, non-exclusive, royalty-free, transferable
        license to host, store, reproduce, modify (for formatting purposes),
        publish, and display such content in connection with operating and
        improving the Service. You represent that you have all rights
        necessary to grant this license and that your user content does not
        violate any third-party rights.
      </p>

      <h2>6. Third-Party Content</h2>
      <p>
        Some courses may include third-party content, such as open-source
        libraries, public datasets, or materials licensed from partner
        organizations. Such content remains the property of its respective
        owners and may be subject to additional terms provided alongside
        the content. Nothing in this License limits your rights under the
        original license terms applicable to third-party content.
      </p>

      <h2>7. No Warranty</h2>
      <p>
        The course content is provided for educational and informational
        purposes only. While we strive to deliver accurate, up-to-date, and
        high-quality content, we make no warranty as to the completeness,
        accuracy, reliability, or suitability of any course content for any
        particular purpose. Any reliance you place on course content is at
        your own risk, and we disclaim all liability arising from such
        reliance to the maximum extent permitted by law.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by applicable law, SchoolSphere and
        its instructors, affiliates, officers, and employees shall not be
        liable for any indirect, incidental, special, consequential, or
        punitive damages arising out of or in connection with your use of
        the course content, including but not limited to loss of profits,
        data, business, or goodwill. Our total cumulative liability for any
        claim relating to this License or the course content shall not
        exceed the amount you paid us, if any, for access to the relevant
        course during the twelve (12) months preceding the claim.
      </p>

      <h2>9. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless SchoolSphere and its
        affiliates, officers, directors, employees, and instructors from any
        claim, demand, loss, liability, damage, or expense (including
        reasonable attorneys&rsquo; fees) arising out of or related to your
        use of the Service, your user content, or your violation of this
        License Agreement or the Terms of Service.
      </p>

      <h2>10. Termination</h2>
      <p>
        This License terminates automatically upon the earlier of: your
        cancellation of your account, our termination of your access in
        accordance with the Terms of Service, or your material breach of
        this License Agreement. Upon termination, all rights granted to you
        under this License shall immediately cease, and you must stop using
        and destroy any copies of the course content in your possession,
        except as required to be retained by applicable law.
      </p>

      <h2>11. Modifications</h2>
      <p>
        We may update this License Agreement from time to time. When we make
        material changes, we will update the &ldquo;Last updated&rdquo; date
        at the top of this page and, where appropriate, notify you through
        the Service or by email. Your continued use of the course content
        after any change indicates your acceptance of the updated License
        Agreement.
      </p>

      <h2>12. Contact</h2>
      <p>
        If you have any questions about this License Agreement or your rights
        and obligations under it, please contact us at{" "}
        <a href="mailto:legal@knowsphere.app">legal@knowsphere.app</a> or
        through our <a href="/contact">contact page</a>. We are happy to
        clarify any of the terms above.
      </p>
    </LegalPage>
  );
}
