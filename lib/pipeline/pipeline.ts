import * as aws from "@pulumi/aws";
import { name } from "../utils/naming";
import { appName } from "../config";
import { PipelineArgs } from "./types";

export function createPipeline(args: PipelineArgs): aws.codepipeline.Pipeline {
  const codestarconnection = new aws.codestarconnections.Connection(
    name("conn"),
    {
      name: `${appName}-connection`,
      providerType: args.providerType,
    }
  );

  // Bucket de artefactos
  const artifactBucket = new aws.s3.Bucket(name("artifact-bucket"));

  // Role para CodeBuild
  const codeBuildRole = new aws.iam.Role(name("codebuild-role"), {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "codebuild.amazonaws.com",
    }),
  });

  new aws.iam.RolePolicyAttachment(name("codebuild-admin"), {
    role: codeBuildRole.name,
    policyArn: aws.iam.ManagedPolicies.AdministratorAccess, // Puedes restringirlo
  });

  const buildProjects: Record<string, aws.codebuild.Project> = {};
  for (const stage of args.stages) {
    buildProjects[stage.name] = new aws.codebuild.Project(
      name(`build-${stage.name}`),
      {
        source: {
          type: "CODEPIPELINE",
          buildspec: stage.build.buildspec,
        },
        artifacts: {
          type: "CODEPIPELINE",
        },
        environment: {
          computeType: "BUILD_GENERAL1_SMALL",
          image: "aws/codebuild/standard:7.0",
          type: "LINUX_CONTAINER",
          environmentVariables: stage.build.environmentVariables.map((env) => ({
            name: env.name,
            value: env.value,
            type: env.type ?? "PLAINTEXT",
          })),
        },
        serviceRole: codeBuildRole.arn,
      }
    );
  }

  // Pipeline Role
  const pipelineRole = new aws.iam.Role(name("pipeline-role"), {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: "codepipeline.amazonaws.com",
    }),
  });

  new aws.iam.RolePolicyAttachment(name("pipeline-admin"), {
    role: pipelineRole,
    policyArn: aws.iam.ManagedPolicies.AdministratorAccess,
  });

  const stages: aws.types.input.codepipeline.PipelineStage[] = [
    {
      name: "Source",
      actions: [
        {
          name: "Source",
          category: "Source",
          owner: "AWS",
          provider: "CodeStarSourceConnection",
          version: "1",
          outputArtifacts: ["source_output"],
          configuration: {
            ConnectionArn: codestarconnection.arn,
            FullRepositoryId: args.fullRepositoryId,
            BranchName: args.branch,
            DetectChanges: "true",
          },
        },
      ],
    },
  ];

  for (const stage of args.stages) {
    let runOrder = 1;
    const actions = [];
    if (stage.manualApproval) {
      actions.push({
        name: `ManualApproval-${stage.name}`,
        category: "Approval",
        owner: "AWS",
        provider: "Manual",
        version: "1",
        configuration: {
          CustomData: `Approve deployment to ${stage.name}`,
        },
        runOrder: runOrder++,
      });
    }
    actions.push({
      name: `Build-${stage.name}`,
      category: "Build",
      owner: "AWS",
      provider: "CodeBuild",
      inputArtifacts: ["source_output"],
      version: "1",
      configuration: {
        ProjectName: buildProjects[stage.name].name,
      },
      runOrder: runOrder++,
      outputArtifacts: [`build_output_${stage.name}`],
    });
    stages.push({
      name: `Deploy-${stage.name}`,
      actions,
    });
  }

  return new aws.codepipeline.Pipeline(name("pipeline"), {
    roleArn: pipelineRole.arn,
    artifactStores: [
      {
        location: artifactBucket.bucket,
        type: "S3",
      },
    ],
    stages,
  });
}
