import "server-only";

import arcjet, {
  detectBot,
  fixedWindow,
  protectSignup,
  sensitiveInfo,
  shield,
  slidingWindow,
} from "@arcjet/next";
import { env } from "./env";

// Re-export the rules to simplify imports inside handlers
export {
  detectBot,
  fixedWindow,
  protectSignup,
  sensitiveInfo,
  shield,
  slidingWindow,
};

// Create a base Arcjet instance for use by each handler
const liveArcjet = arcjet({
  key: env.ARCJET_KEY,
  characteristics: ["fingerprint"],
  // base rules applied to all handlers
  rules: [
    shield({ mode: "LIVE" }), // protect against common attacks
    detectBot({
      mode: "LIVE",
      allow: [
        "CATEGORY:SEARCH_ENGINE",
        "CATEGORY:MONITOR",
        "CATEGORY:PREVIEW",
      ],
    }), // detect and block bots
  ],
});

// The local Docker profile has no external Arcjet credentials. Keep every
// existing guard call compatible while allowing requests in that profile.
const localDecision = {
  isDenied: () => false,
  reason: {
    isRateLimit: () => false,
    isEmail: () => false,
    emailTypes: [] as string[],
  },
};

const localArcjet = {
  withRule: () => localArcjet,
  protect: async () => localDecision,
} as unknown as typeof liveArcjet;

export default (env.ARCJET_ENABLED === "true" ? liveArcjet : localArcjet) as typeof liveArcjet;
