import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma";
import { env } from "./env";
import { resend } from "./resend";
import { admin } from "better-auth/plugins";

// Auth is GitHub OAuth + email OTP only. There is intentionally no
// email/password provider, so there is no password-reset flow to build.
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  plugins: [
    admin(),
    emailOTP({
      // A fixed one-click demo OTP is available only in the explicitly enabled
      // local console profile and only for the two seeded demo accounts.
      generateOTP({ email }) {
        if (
          env.DEMO_LOGIN_ENABLED === "true" &&
          env.AUTH_EMAIL_MODE === "console" &&
          ["admin@school84.local", "student@school84.local"].includes(email.toLowerCase())
        ) {
          return "840084";
        }
        return undefined;
      },
      async sendVerificationOTP({ email, otp }) {
        if (env.AUTH_EMAIL_MODE === "console") {
          console.info(`[School 84 local OTP] ${email}: ${otp}`);
          return;
        }

        try {
          const { error } = await resend.emails.send({
            from: env.EMAIL_FROM,
            to: [email],
            subject: "Your OTP Code",
            html: `<p>Your OTP code is: <strong>${otp}</strong></p>`,
          });

          if (error) {
            console.error("Failed to send OTP email:", error);
          }
        } catch (error) {
          console.error("Failed to send OTP email:", error);
        }
      },
    }),
  ],
});
