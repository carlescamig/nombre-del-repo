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

  // CodeBuild Projects
  function createBuildProject(
    name: string,
    buildspec: string
  ): aws.codebuild.Project {
    return new aws.codebuild.Project(name, {
      source: {
        type: "CODEPIPELINE", // Fuente desde CodePipeline
        buildspec,
      },
      artifacts: {
        type: "CODEPIPELINE", // Salida para CodePipeline
      },
      environment: {
        computeType: "BUILD_GENERAL1_SMALL",
        image: "aws/codebuild/standard:7.0",
        type: "LINUX_CONTAINER",
        environmentVariables: [
          {
            name: "PULUMI_ACCESS_TOKEN",
            value: "PULUMI_ACCESS_TOKEN", // nombre del secreto en Secrets Manager
            type: "SECRETS_MANAGER",
          },
          {
            name: "PULUMI_STACK",
            value: name,
          },
        ],
      },
      serviceRole: codeBuildRole.arn,
    });
  }
  const devBuild = createBuildProject(
    "pulumi-dev",
    "codebuild-dev-buildspec.yml"
  );
  const prodBuild = createBuildProject(
    "pulumi-prod",
    "codebuild-prod-buildspec.yml"
  );

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

  return new aws.codepipeline.Pipeline(name("pipeline"), {
    roleArn: pipelineRole.arn,
    artifactStores: [
      {
        location: artifactBucket.bucket,
        type: "S3",
      },
    ],
    stages: [
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
      {
        name: "DeployDev",
        actions: [
          {
            name: "DeployToDev",
            category: "Build",
            owner: "AWS",
            provider: "CodeBuild",
            inputArtifacts: ["source_output"],
            version: "1",
            configuration: {
              ProjectName: devBuild.name,
            },
            outputArtifacts: ["dev_output"],
          },
        ],
      },
      {
        name: "DeployProd",
        actions: [
          {
            name: "ManualApproval",
            category: "Approval",
            owner: "AWS",
            provider: "Manual",
            version: "1",
            configuration: {
              CustomData: "¿Ejecutar despliegue a producción?",
            },
            runOrder: 1,
          },
          {
            name: "DeployProd",
            category: "Build",
            owner: "AWS",
            provider: "CodeBuild",
            inputArtifacts: ["source_output"],
            version: "1",
            runOrder: 2,
            configuration: {
              ProjectName: prodBuild.name,
              // EnvironmentVariables: JSON.stringify([
              //   {
              //     name: "PULUMI_STACK",
              //     value: "prod",
              //     type: "PLAINTEXT",
              //   },
              // ]),
            },
          },
        ],
      },
    ],
  });
}
