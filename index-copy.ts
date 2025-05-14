import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { name } from "./lib/utils/naming";

const example = new aws.codestarconnections.Connection(name("bitbu"), {
  providerType: "Bitbucket",
});
const codepipelineBucket = new aws.s3.BucketV2(name("codepipeline_bucket"));

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
const codepipelineRole = new aws.iam.Role("codepipeline_role", {
  name: "test-role",
  assumeRolePolicy: assumeRole.then((assumeRole) => assumeRole.json),
});
// const s3kmskey = aws.kms.getAlias({
//     name: "alias/myKmsKey",
// });
const codepipeline = new aws.codepipeline.Pipeline("codepipeline", {
  name: "tf-test-pipeline",
  roleArn: codepipelineRole.arn,
  artifactStores: [
    {
      location: codepipelineBucket.bucket,
      type: "S3",
      // encryptionKey: {
      //     id: s3kmskey.then(s3kmskey => s3kmskey.arn),
      //     type: "KMS",
      // },
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
            ConnectionArn: example.arn,
            FullRepositoryId: "ccarrascom/pipeline-demo",
            BranchName: "main",
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
            ProjectName: "test",
          },
        },
      ],
    },
    {
      name: "Deploy",
      actions: [
        {
          name: "Deploy",
          category: "Deploy",
          owner: "AWS",
          provider: "CloudFormation",
          inputArtifacts: ["build_output"],
          version: "1",
          configuration: {
            ActionMode: "REPLACE_ON_FAILURE",
            Capabilities: "CAPABILITY_AUTO_EXPAND,CAPABILITY_IAM",
            OutputFileName: "CreateStackOutput.json",
            StackName: "MyStack",
            TemplatePath: "build_output::sam-templated.yaml",
          },
        },
      ],
    },
  ],
});
const codepipelineBucketPab = new aws.s3.BucketPublicAccessBlock(
  "codepipeline_bucket_pab",
  {
    bucket: codepipelineBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  }
);
const codepipelinePolicy = aws.iam.getPolicyDocumentOutput({
  statements: [
    {
      effect: "Allow",
      actions: [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetBucketVersioning",
        "s3:PutObjectAcl",
        "s3:PutObject",
      ],
      resources: [
        codepipelineBucket.arn,
        pulumi.interpolate`${codepipelineBucket.arn}/*`,
      ],
    },
    {
      effect: "Allow",
      actions: ["codestar-connections:UseConnection"],
      resources: [example.arn],
    },
    {
      effect: "Allow",
      actions: ["codebuild:BatchGetBuilds", "codebuild:StartBuild"],
      resources: ["*"],
    },
  ],
});
const codepipelinePolicyRolePolicy = new aws.iam.RolePolicy(
  "codepipeline_policy",
  {
    name: "codepipeline_policy",
    role: codepipelineRole.id,
    policy: codepipelinePolicy.apply(
      (codepipelinePolicy) => codepipelinePolicy.json
    ),
  }
);
