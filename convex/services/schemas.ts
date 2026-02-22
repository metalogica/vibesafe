import { z } from 'zod';

export const VulnerabilitySchema = z.object({
  category: z.string(),
  level: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  description: z.string(),
  filePath: z.string().optional(),
  fix: z.string().optional(),
});

export const ClaudeAnalysisResponseSchema = z.object({
  vulnerabilities: z.array(VulnerabilitySchema),
});

export type Vulnerability = z.infer<typeof VulnerabilitySchema>;
