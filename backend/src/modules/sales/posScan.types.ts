import { z } from "zod";

export const createScanSchema = z.object({
  barcode: z.string().min(1),
});
export type CreateScanInput = z.infer<typeof createScanSchema>;
