export interface PipelineArgs {
  fullRepositoryId: string;
  branch: string;
  providerType:
    | "Bitbucket"
    | "GitHub"
    | "GitHubEnterpriseServer"
    | "GitLab"
    | "GitLabSelfManaged";
}
