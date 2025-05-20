import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { createPipeline } from "./lib/pipeline";
import { registerAutoTags } from "./lib/autotag";
import { appName, awsRegion, environment } from "./lib/config";
import { name } from "./lib/utils/naming";

const config = new pulumi.Config();
// Aplica tags automáticos
registerAutoTags({
  "user:Project": "Data Lake House",
  "user:Application": appName,
  "user:Environment": environment,
  "user:Region": awsRegion,
  "user:Cost Center": "none",
  "user:Compliance": "none",
  "user:OrganizationalUnit": "sandbox",
  "user:Team": "strata-analytics-team",
});

// 👉 Stack destinado a desplegar el pipeline
// Recurso para almacenar el estado de Pulumi en un bucket S3
const pulumiState = new aws.s3.Bucket("pulumi-state", {
  bucket: "my-pulumi-state-storage",
  acl: "private",
  tags: {
    Name: "PulumiStateStorage",
    Environment: "Dev",
  },
});

const pulumiTokenSecret = new aws.secretsmanager.Secret(name("pulumi-token"), {
  name: "PULUMI_ACCESS_TOKEN",
});

new aws.secretsmanager.SecretVersion(name("pulumi-token-version"), {
  secretId: pulumiTokenSecret.id,
  secretString: config.requireSecret("PULUMI_ACCESS_TOKEN"),
});

createPipeline({
  fullRepositoryId: config.require("fullRepositoryId"),
  branch: config.require("branch"),
  providerType: config.require("providerType"),
  stages: [
    {
      name: "pulumi-dev",
      manualApproval: false,
      build: {
        buildspec: "buildspec.yml",
        environmentVariables: [
          {
            name: "PULUMI_ACCESS_TOKEN",
            value: "PULUMI_ACCESS_TOKEN",
            type: "SECRETS_MANAGER",
          },
          {
            name: "PULUMI_STACK",
            value: "dev",
          },
        ],
      },
    },
    {
      name: "pulumi-prod",
      manualApproval: true,
      build: {
        buildspec: "buildspec.yml",
        environmentVariables: [
          {
            name: "PULUMI_ACCESS_TOKEN",
            value: "PULUMI_ACCESS_TOKEN",
            type: "SECRETS_MANAGER",
          },
          {
            name: "PULUMI_STACK",
            value: "prod",
          },
        ],
      },
    },
  ],
});

export const pulumiBucketName = pulumiState.bucket;
