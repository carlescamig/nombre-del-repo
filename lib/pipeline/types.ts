export interface EnvironmentVariable {
  name: string;
  value: string;
  type?: "PLAINTEXT" | "PARAMETER_STORE" | "SECRETS_MANAGER";
}

export interface BuildStage {
  name: string;
  manualApproval?: boolean;
  build: {
    buildspec: string;
    environmentVariables: EnvironmentVariable[];
  };
}

export interface PipelineArgs {
  fullRepositoryId: string; // ej. "org/repo"
  branch: string;           // ej. "main"
  providerType: "GitHub" | "Bitbucket" | "GitHubEnterpriseServer";
  stages: BuildStage[];
}
