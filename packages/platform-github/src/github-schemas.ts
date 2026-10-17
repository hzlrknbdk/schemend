import { z } from "zod";

// Only the fields the adapter actually reads - not a full mirror of GitHub's pull request schema.
export const PullRequestSchema = z.object({
  html_url: z.string(),
  number: z.number(),
});
export type PullRequestResponse = z.infer<typeof PullRequestSchema>;

export const PullRequestListSchema = z.array(PullRequestSchema);

export const RepositorySchema = z.object({
  default_branch: z.string(),
});
