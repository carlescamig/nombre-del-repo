import * as pulumi from "@pulumi/pulumi";
import { createPipeline } from "./lib/pipeline";
import { registerAutoTags } from "./lib/autotag";
import { appName, environment } from "./lib/config";

// Obtener nombre del stack actual (ej: "dev", "prod", "pipeline")
const stack = pulumi.getStack();
// Aplica tags automáticos
registerAutoTags({
  "user:Project": appName,
  "user:Stack": environment,
  "user:Cost Center": "",
});

if (stack === "pipeline") {
  // 👉 Stack destinado a desplegar el pipeline
  const config = new pulumi.Config();

  createPipeline({
    fullRepositoryId: config.require("fullRepositoryId"),
    branch: config.require("branch"),
    providerType: config.require("providerType")
  });
} else {
  // 👉 Stack de infraestructura del proyecto real (dev/prod/etc)
  import("./lib/projectInfra").then((mod) => {
    mod.deployProjectInfrastructure(stack);
  });
}
