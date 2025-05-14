import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { name } from "./utils/naming";
import { appName } from "./config";

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

export function createPipeline(args: PipelineArgs): aws.codepipeline.Pipeline {
  const codestarconnection = new aws.codestarconnections.Connection(
    name("connection"),
    {
      name: `${appName}-connection`,
      providerType: args.providerType,
    }
  );

  const codepipelineBucket = new aws.s3.BucketV2(name("bucket"));

  const assumeRole = aws.iam.getPolicyDocument({
    statements: [
      {
        effect: "Allow",
        principals: [
          {
            type: "Service",
            identifiers: ["codepipeline.amazonaws.com"],
          },
        ],
        actions: ["sts:AssumeRole"],
      },
    ],
  });

  const role = new aws.iam.Role(name("role"), {
    assumeRolePolicy: assumeRole.then((doc) => doc.json),
  });

  const policy = aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        effect: "Allow",
        actions: [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:GetBucketVersioning",
          "s3:PutObject",
          "s3:PutObjectAcl",
        ],
        resources: [
          codepipelineBucket.arn,
          pulumi.interpolate`${codepipelineBucket.arn}/*`,
        ],
      },
      {
        effect: "Allow",
        actions: ["codestar-connections:UseConnection"],
        resources: [codestarconnection.arn],
      },
      {
        effect: "Allow",
        actions: ["codebuild:StartBuild", "codebuild:BatchGetBuilds"],
        resources: ["*"], // Puedes restringir por nombre si querés
      },
    ],
  });

  new aws.iam.RolePolicy(name("policy"), {
    role: role.id,
    policy: policy.apply((p) => p.json),
  });

  new aws.s3.BucketPublicAccessBlock(name("bucket-pab"), {
    bucket: codepipelineBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });

  return new aws.codepipeline.Pipeline(name("pipeline"), {
    roleArn: role.arn,
    artifactStores: [
      {
        location: codepipelineBucket.bucket,
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
            },
          },
        ],
      },
      {
        name: "Build",
        actions: [
          {
            name: "Build",
            category: "Build",
            owner: "AWS",
            provider: "CodeBuild",
            inputArtifacts: ["source_output"],
            outputArtifacts: ["build_output"],
            version: "1",
            configuration: {
              ProjectName: name("build"),
            },
          },
        ],
      },
      {
        name: "DeployDev",
        actions: [
          {
            name: "DeployDev",
            category: "Build",
            owner: "AWS",
            provider: "CodeBuild",
            inputArtifacts: ["build_output"],
            version: "1",
            configuration: {
              ProjectName: name("dev"),
              EnvironmentVariables: JSON.stringify([
                {
                  name: "PULUMI_STACK",
                  value: "dev",
                  type: "PLAINTEXT",
                },
              ]),
            },
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
            inputArtifacts: ["build_output"],
            version: "1",
            runOrder: 2,
            configuration: {
              ProjectName: name("prod"),
              EnvironmentVariables: JSON.stringify([
                {
                  name: "PULUMI_STACK",
                  value: "prod",
                  type: "PLAINTEXT",
                },
              ]),
            },
          },
        ],
      },
    ],
  });
}
