import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();

export const appName = "demo";
export const environment = pulumi.getStack();
export const awsAccountId = aws.getCallerIdentity();
export const awsRegion = aws.config.region ?? "us-east-1";
// export const snowflakeExternalId = config.require("snowflakeExternalId") ?? "EXTERNAL_ID_GENERADO_POR_SNOWFLAKE";