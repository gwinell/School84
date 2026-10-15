"use server";

import { revalidatePath } from "next/cache";

import arcjet, { fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import { issueCertificateIfEligible } from "@/lib/certificates/issue-certificate-if-eligible";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import { type tApiResponse } from "@/types/api";
import { requireUser } from "@/app/data/user/require-user";
import { getCourseLearnerAccess } from "@/app/data/user/course-learner-access";

const aj = arcjet.withRule(
  fixedWindow({
    mode: "LIVE",
    window: "1m",
    max: 10,
  }),
);

type ClaimCertificateData = {
  issued: boolean;
  verificationCode: string | null;
};

export async function claimCertificateAction({
  courseId,
}: {
  courseId: string;
}): Promise<tApiResponse<ClaimCertificateData>> {
  const session = await requireUser();

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return errorResponse("Too many requests. Please try again later.", {
        issued: false,
        verificationCode: null,
      });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { organizationId: true } });
    if (!course) return errorResponse("Курс не найден", { issued: false, verificationCode: null });
    const enrollment = await getCourseLearnerAccess({ userId: session.user.id, userRole: session.user.role, courseId, organizationId: course.organizationId });
    if (!enrollment) {
      return errorResponse("You are not enrolled in this course", {
        issued: false,
        verificationCode: null,
      });
    }

    const result = await issueCertificateIfEligible({
      userId: session.user.id,
      courseId,
    });

    if (!result.issued) {
      if (result.reason === "not-complete") {
        return errorResponse("You have not completed this course yet", {
          issued: false,
          verificationCode: null,
        });
      }
      if (result.reason === "no-lessons") {
        return errorResponse("This course has no lessons yet", {
          issued: false,
          verificationCode: null,
        });
      }
      if (result.reason === "private-course") {
        return errorResponse("Certificates are unavailable for courses in a personal library", {
          issued: false,
          verificationCode: null,
        });
      }
      // already-exists: surface the existing code
      const existing = await prisma.certificate.findUnique({
        where: { userId_courseId: { userId: session.user.id, courseId } },
        select: { verificationCode: true },
      });
      return successResponse("Certificate already issued", {
        issued: false,
        verificationCode: existing?.verificationCode ?? null,
      });
    }

    revalidatePath("/dashboard/certificates");
    revalidatePath(`/dashboard/courses`);

    return successResponse("Certificate issued", {
      issued: true,
      verificationCode: result.verificationCode,
    });
  } catch {
    return errorResponse("Failed to claim certificate", {
      issued: false,
      verificationCode: null,
    });
  }
}
