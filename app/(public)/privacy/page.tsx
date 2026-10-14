import { type Metadata } from "next";

import { LegalPage } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | SchoolSphere",
  description:
    "How SchoolSphere collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How SchoolSphere collects, uses, and protects your personal information. We believe transparency is the foundation of trust."
      lastUpdated="August 17, 2026"
      effectiveDate="August 17, 2026"
    >
      <h2>1. Information We Collect</h2>
      <p>
        We collect information you provide directly when you create an
        account, enroll in courses, contact support, or otherwise interact
        with the Service. This may include your name, email address, profile
        photo, billing information, and any content you choose to submit. We
        also automatically collect certain technical information when you use
        the Service, such as your IP address, browser type, device
        information, operating system, and activity on the platform.
      </p>

      <h2>2. How We Use Your Information</h2>
      <p>
        We use the information we collect to provide, maintain, and improve
        the Service; to process transactions and deliver course content; to
        personalize your learning experience; to communicate with you about
        updates, security alerts, and promotional offers; to detect and
        prevent fraud or abuse; and to comply with our legal obligations. We
        process your information only for the purposes described in this
        Privacy Policy or as otherwise communicated to you at the time of
        collection.
      </p>

      <h2>3. Cookies and Tracking</h2>
      <p>
        We use cookies, local storage, and similar technologies to remember
        your preferences, keep you signed in, and understand how you interact
        with the Service. You can control cookies through your browser
        settings, but disabling certain cookies may affect the functionality
        of the Service. We also use third-party analytics services that set
        their own cookies to help us measure traffic and usage patterns.
      </p>

      <h2>4. Third-Party Services</h2>
      <p>
        We rely on trusted third-party service providers to operate the
        Service. These include email delivery providers (such as Resend),
        cloud hosting providers (such as AWS), authentication providers
        (such as GitHub), and analytics
        platforms. Each provider receives only the information necessary to
        perform their services and is contractually obligated to protect your
        data in accordance with industry standards.
      </p>

      <h2>5. Data Sharing</h2>
      <p>
        We do not sell your personal information to third parties. We may
        share information with service providers who help us operate the
        Service, with instructors for the courses in which you are enrolled,
        with legal authorities when required by law, or with a successor
        entity in the event of a merger or acquisition. We may also share
        aggregated, non-identifiable information for analytical or marketing
        purposes.
      </p>

      <h2>6. Data Security</h2>
      <p>
        We take the security of your information seriously and implement
        industry-standard technical and organizational safeguards to protect
        it. These include encryption in transit and at rest, regular security
        audits, access controls, and continuous monitoring for suspicious
        activity. While we strive to protect your information, no method of
        transmission or storage is completely secure, and we cannot guarantee
        absolute security.
      </p>

      <h2>7. Your Rights</h2>
      <p>
        You have the right to access, correct, update, or delete the personal
        information we hold about you. You may also request a copy of your
        data in a portable format or object to certain processing activities.
        You can exercise most of these rights directly from your account
        settings. For requests that cannot be completed through your account,
        please contact us at <a href="mailto:privacy@knowsphere.app">privacy@knowsphere.app</a>.
      </p>

      <h2>8. Children&rsquo;s Privacy</h2>
      <p>
        SchoolSphere is not intended for children under the age of 13, and we
        do not knowingly collect personal information from children under
        13. If we learn that we have inadvertently collected information
        from a child under 13, we will take steps to delete it as soon as
        possible. If you believe we have collected information from a child
        under 13, please contact us immediately.
      </p>

      <h2>9. International Data Transfers</h2>
      <p>
        SchoolSphere is operated from the United States, and your information
        may be transferred to, stored in, and processed in the United States
        or other countries where our service providers operate. By using the
        Service, you consent to the transfer of your information outside of
        your country of residence, including to countries that may not
        provide the same level of data protection as your home jurisdiction.
        We take appropriate safeguards to ensure your data remains protected.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we make
        material changes, we will update the &ldquo;Last updated&rdquo; date
        at the top of this page and, where appropriate, notify you through
        the Service or by email. We encourage you to review this Policy
        periodically to stay informed about how we protect your information.
      </p>

      <h2>11. Contact</h2>
      <p>
        If you have any questions about this Privacy Policy or our data
        practices, please contact our privacy team at{" "}
        <a href="mailto:privacy@knowsphere.app">privacy@knowsphere.app</a> or
        through our <a href="/contact">contact page</a>. We will respond to
        all privacy-related inquiries promptly.
      </p>
    </LegalPage>
  );
}
