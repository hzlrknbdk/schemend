import { z } from "zod";

// Only the fields the adapter actually reads - not a full mirror of GitLab's merge request schema.
export const MergeRequestSchema = z.object({
  web_url: z.string(),
  iid: z.number(),
});
export type MergeRequestResponse = z.infer<typeof MergeRequestSchema>;

export const MergeRequestListSchema = z.array(MergeRequestSchema);

export const ProjectSchema = z.object({
  default_branch: z.string(),
});
