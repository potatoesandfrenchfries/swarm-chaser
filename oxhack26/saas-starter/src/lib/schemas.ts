import { z } from "zod";

// Route files may only export HTTP handlers, so shared request schemas live here.
export const projectInput = z.object({
  name: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(5000).nullish(),
});
