import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export function deployProjectInfrastructure(stack: string) {
    const bucket = new aws.s3.Bucket(`project-bucket-${stack}`, {
        tags: {
            Environment: stack,
        },
    });

    // Acá podés agregar más recursos específicos por stack si querés
    if (stack === "prod") {
        // Recursos adicionales o más restrictivos
    }

    return {
        bucketName: bucket.bucket,
    };
}
