import { z } from "zod";
import { artKeySchema, descriptionSchema, displayNameSchema, slugSchema } from "./common";

export const speciesSchema = z.object({
  slug: slugSchema,
  name: displayNameSchema,
  description: descriptionSchema,
  artKey: artKeySchema,
});

export type SpeciesContent = z.infer<typeof speciesSchema>;
