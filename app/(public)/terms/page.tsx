import { type Metadata } from "next";

import { LegalPage } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | SchoolSphere",
  description:
    "The terms and conditions that govern your use of the SchoolSphere learning platform.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="The terms and conditions that govern your use of the SchoolSphere learning platform. Please read them carefully before using our services."
      lastUpdated="August 17, 2026"
      effectiveDate="August 17, 2026"
    >
      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using SchoolSphere (the &ldquo;Service&rdquo;), you agree
        to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do
        not agree to these Terms, you must not access or use the Service. We may
        update these Terms from time to time, and your continued use of the
        Service following any changes constitutes acceptance of the new Terms.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 13 years old to use SchoolSphere. By using the
        Service, you represent and warrant that you meet this eligibility
        requirement and that you have the legal capacity to enter into these
        Terms. If you are using the Service on behalf of an organization, you
        represent that you have the authority to bind that organization to
        these Terms.
      </p>

      <h2>3. Account Registration</h2>
      <p>
        To access most features of the Service, you must create an account.
        When registering, you agree to provide accurate, current, and complete
        information and to keep your account information updated. You are
        responsible for safeguarding your password and for all activity that
        occurs under your account. Please notify us immediately if you suspect
        any unauthorized access to your account.
      </p>

      <h2>4. Course Enrollment and Access</h2>
      <p>
        Course enrollment grants you a personal, non-exclusive,
        non-transferable, and revocable license to access the course content
        for your own educational purposes. Enrollment is for individual use
        unless a team or enterprise plan is explicitly purchased. You may not
        share your account credentials, redistribute course materials, or
        permit others to access courses through your account.
      </p>

      <h2>5. Payments and Refunds</h2>
      <p>
        Paid courses and subscriptions are billed through our third-party
        payment processors. Prices are displayed in your local currency where
        available and may change without prior notice. We offer a 30-day
        money-back guarantee on course purchases; if you are not satisfied,
        contact our support team within 30 days of purchase for a full refund.
        Subscription fees are non-refundable except as required by law.
      </p>

      <h2>6. Intellectual Property</h2>
      <p>
        All content available through the Service — including videos, lesson
        text, images, code samples, quizzes, and course materials — is owned by
        SchoolSphere or its licensors and is protected by copyright, trademark,
        and other intellectual property laws. You may not reproduce, distribute,
        modify, publicly display, or create derivative works from any course
        content without our prior written consent.
      </p>

      <h2>7. User Conduct</h2>
      <p>
        You agree not to use the Service to engage in any unlawful, harmful,
        or abusive activity. This includes, but is not limited to: harassing
        other users, posting offensive content, attempting to gain unauthorized
        access to the Service or its systems, scraping or harvesting data,
        reverse engineering the platform, or using the Service to compete
        with SchoolSphere. We reserve the right to investigate and take
        appropriate action against any suspected violation.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate your account at any time, with or without
        notice, if we reasonably believe you have violated these Terms or if
        continued provision of the Service to you is no longer commercially
        viable. You may stop using the Service and close your account at any
        time. Upon termination, your right to access paid course content will
        cease, except where otherwise required by applicable law.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; basis without warranties of any kind, either express
        or implied, including without limitation warranties of
        merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that the Service will be
        uninterrupted, error-free, or free of harmful components, nor do we
        warrant the accuracy or completeness of any course content.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by applicable law, SchoolSphere and its
        affiliates, officers, employees, and instructors shall not be liable
        for any indirect, incidental, special, consequential, or punitive
        damages arising out of or related to your use of the Service. Our
        total cumulative liability for any claim relating to the Service shall
        not exceed the amount you paid us, if any, during the twelve (12)
        months preceding the claim.
      </p>

      <h2>11. Changes to Terms</h2>
      <p>
        We may update these Terms from time to time to reflect changes in our
        practices, the Service, or for legal, operational, or regulatory
        reasons. When we make material changes, we will update the
        &ldquo;Last updated&rdquo; date at the top of this page and, where
        appropriate, notify you through the Service or by email. Your
        continued use of the Service after any change indicates your
        acceptance of the updated Terms.
      </p>

      <h2>12. Governing Law</h2>
      <p>
        These Terms are governed by and construed in accordance with the laws
        of the State of Delaware, United States of America, without regard
        to its conflict of law principles. Any disputes arising from or
        related to these Terms or the Service shall be resolved exclusively in
        the state or federal courts located in Delaware, and you consent to
        the personal jurisdiction of such courts.
      </p>

      <h2>13. Contact</h2>
      <p>
        If you have any questions about these Terms, please contact us at{" "}
        <a href="mailto:legal@knowsphere.app">legal@knowsphere.app</a> or
        through our{" "}
        <a href="/contact">contact page</a>. We aim to respond to all
        inquiries within a reasonable timeframe.
      </p>
    </LegalPage>
  );
}
