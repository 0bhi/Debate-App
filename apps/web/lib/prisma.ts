import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __web_prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__web_prisma || new PrismaClient();

if (process.env.NODE_ENV === "development") {
  global.__web_prisma = prisma;
}
