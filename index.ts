import * as pulumi from "@pulumi/pulumi";
import { createPipeline } from "./lib/pipeline";
import { registerAutoTags } from "./lib/autotag";
import { appName, awsRegion, environment } from "./lib/config";
import { deployProjectInfrastructure } from "./lib/projectInfra";
import("./lib/projectInfra");
// Obtener nombre del stack actual (ej: "dev", "prod", "pipeline")
const stack = pulumi.getStack();
// Aplica tags automáticos
registerAutoTags({
  "user:Project": appName,
  "user:Environment": environment,
  "user:Cost Center": "none",
  "user:Region": awsRegion,
  "user:Compliance": "none",
  "user:OrganizationalUnit": "sandbox",
  "user:Team": "strata-analytics-team",
});

if (stack === "pipeline") {
  // 👉 Stack destinado a desplegar el pipeline
  const config = new pulumi.Config();

  createPipeline({
    fullRepositoryId: config.require("fullRepositoryId"),
    branch: config.require("branch"),
    providerType: config.require("providerType"),
    stages: [
      {
        name: "pulumi-dev",
        manualApproval: false,
        build: {
          buildspec: "buildspec-dev.yml",
          environmentVariables: [
            {
              name: "PULUMI_ACCESS_TOKEN",
              value: "PULUMI_ACCESS_TOKEN", // nombre del secreto en Secrets Manager
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
          buildspec: "buildspec-prod.yml",
          environmentVariables: [
            {
              name: "PULUMI_ACCESS_TOKEN",
              value: "PULUMI_ACCESS_TOKEN", // nombre del secreto en Secrets Manager
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
