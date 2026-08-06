import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Dev-database maintenance for browser tests. The full suite signs up
 * more throwaway accounts inside one five-minute window than the
 * anti-abuse sign-up limit allows from a single origin, so each spec
 * file clears rate-limit windows before it starts. This mirrors what a
 * human tester waiting five minutes would experience — the production
 * limit itself is never changed.
 */
export async function clearRateLimitWindows(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.rateLimitWindow.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}
