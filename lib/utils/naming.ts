import { appName, environment } from "../config";

export function name(resource: string): string {
    return `${appName}-${environment}-${resource}`;
}
