import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { createPipeline } from "./lib/pipeline";
import { registerAutoTags } from "./lib/autotag";
import { appName, awsRegion, environment } from "./lib/config";
import { deployProjectInfrastructure } from "./lib/projectInfra";
import { name } from "./lib/utils/naming";
import("./lib/projectInfra");
// Obtener nombre del stack actual (ej: "dev", "prod", "pipeline")
const stack = pulumi.getStack();
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

if (stack === "pipeline") {
  // 👉 Stack destinado a desplegar el pipeline
    const pulumiTokenSecret = new aws.secretsmanager.Secret(
      name("pulumi-token"),
      {
        name: "PULUMI_ACCESS_TOKEN",
      }
    );
  
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
} else {
  // 👉 Stack de infraestructura del proyecto real (dev/prod/etc)
  deployProjectInfrastructure(stack);
}
