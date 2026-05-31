import { z } from "zod";
import { PRIVATE_IP_PATTERNS } from "./constants";

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isPrivateIp(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname));
}

const urlSchema = z
  .string()
  .min(1, "L'URL est requise")
  .transform(normalizeUrl)
  .pipe(
    z.string().refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return (
            (parsed.protocol === "https:" || parsed.protocol === "http:") &&
            !isPrivateIp(parsed.hostname)
          );
        } catch {
          return false;
        }
      },
      {
        message:
          "URL invalide ou adresse privée non autorisée. Utilisez une URL publique.",
      }
    )
  );

export const auditInputSchema = z.object({
  url: urlSchema,
  competitorUrl: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() ? normalizeUrl(val.trim()) : undefined))
    .pipe(
      z
        .string()
        .refine(
          (url) => {
            if (!url) return true;
            try {
              const parsed = new URL(url);
              return (
                (parsed.protocol === "https:" || parsed.protocol === "http:") &&
                !isPrivateIp(parsed.hostname)
              );
            } catch {
              return false;
            }
          },
          { message: "URL concurrent invalide ou adresse privée." }
        )
        .optional()
    ),
});

export type AuditInput = z.infer<typeof auditInputSchema>;
