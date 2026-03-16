import { Construct } from "constructs";
import { ApiObject, Chart, ChartProps } from "cdk8s";
import { GitHubTriggerBase } from "@pfenerty/tekton-pipelines";

export interface OcidexChartProps extends ChartProps {
    namespace: string;
    /** Name of the pipeline to run on push events (default: 'ocidex-push'). */
    pushPipelineRef?: string;
    /** Name of the pipeline to run on pull_request events (default: 'ocidex-pull-request'). */
    pullRequestPipelineRef?: string;
    /** Size of the PVC created per PipelineRun (default: '1Gi'). */
    workspaceStorageSize?: string;
    /**
     * Create the ServiceAccount and RBAC resources (default: true).
     * Set to false if TektonInfraChart is also deployed and already manages them.
     */
    createServiceAccount?: boolean;
}

/**
 * Chart that provisions Tekton infrastructure for the ocidex repo:
 *   - ServiceAccount (tekton-triggers) + RBAC (when createServiceAccount is true)
 *   - Push TriggerBinding + TriggerTemplate
 *   - Pull-request TriggerBinding + TriggerTemplate
 *   - EventListener wiring both triggers
 */
export class OcidexChart extends Chart {
    constructor(scope: Construct, id: string, props: OcidexChartProps) {
        super(scope, id, props);

        const namespace = props.namespace;
        const serviceAccountName = "tekton-triggers";
        const createServiceAccount = props.createServiceAccount ?? true;

        // ── RBAC ─────────────────────────────────────────────────────────────────

        if (createServiceAccount) {
            new ApiObject(this, "service-account", {
                apiVersion: "v1",
                kind: "ServiceAccount",
                metadata: { name: serviceAccountName, namespace },
            });

            new ApiObject(this, "role-binding", {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "RoleBinding",
                metadata: {
                    name: "tekton-triggers-eventlistener-ocidex",
                    namespace,
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: "tekton-triggers-eventlistener-roles",
                },
                subjects: [
                    {
                        kind: "ServiceAccount",
                        name: serviceAccountName,
                        namespace,
                    },
                ],
            });

            new ApiObject(this, "cluster-role-binding", {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "ClusterRoleBinding",
                metadata: { name: "tekton-triggers-eventlistener-ocidex" },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: "tekton-triggers-eventlistener-clusterroles",
                },
                subjects: [
                    {
                        kind: "ServiceAccount",
                        name: serviceAccountName,
                        namespace,
                    },
                ],
            });
        }

        // ── Triggers ──────────────────────────────────────────────────────────────

        const pushTrigger = new GitHubTriggerBase(
            this,
            "ocidex-push-trigger",
            {
                namespace,
                pipelineRef: props.pushPipelineRef ?? "ocidex-push",
                workspaceStorageSize: props.workspaceStorageSize,
                serviceAccountName,
            },
            {
                bindingName: "ocidex-push",
                templateName: "ocidex-push-trigger-template",
                pipelineRunGenerateName: "ocidex-push-pipeline-run-",
                gitRevisionValue: "$(body.head_commit.id)",
            },
        );

        const prTrigger = new GitHubTriggerBase(
            this,
            "ocidex-pr-trigger",
            {
                namespace,
                pipelineRef:
                    props.pullRequestPipelineRef ?? "ocidex-pull-request",
                workspaceStorageSize: props.workspaceStorageSize,
                serviceAccountName,
            },
            {
                bindingName: "ocidex-pull-request",
                templateName: "ocidex-pull-request-trigger-template",
                pipelineRunGenerateName: "ocidex-pull-request-pipeline-run-",
                gitRevisionValue: "$(body.pull_request.head.sha)",
            },
        );

        // ── EventListener ─────────────────────────────────────────────────────────

        new ApiObject(this, "event-listener", {
            apiVersion: "triggers.tekton.dev/v1beta1",
            kind: "EventListener",
            metadata: { name: "ocidex-listener", namespace },
            spec: {
                serviceAccountName,
                triggers: [
                    {
                        bindings: [
                            {
                                kind: "TriggerBinding",
                                ref: pushTrigger.bindingRef,
                            },
                        ],
                        interceptors: [
                            {
                                ref: {
                                    kind: "ClusterInterceptor",
                                    name: "github",
                                },
                                params: [
                                    { name: "eventTypes", value: ["push"] },
                                    {
                                        name: "secretRef",
                                        value: {
                                            secretName: "github-webhook-secret",
                                            secretKey: "secretToken",
                                        },
                                    },
                                ],
                            },
                        ],
                        template: { ref: pushTrigger.templateRef },
                    },
                    {
                        bindings: [
                            {
                                kind: "TriggerBinding",
                                ref: prTrigger.bindingRef,
                            },
                        ],
                        interceptors: [
                            {
                                ref: {
                                    kind: "ClusterInterceptor",
                                    name: "github",
                                },
                                params: [
                                    {
                                        name: "eventTypes",
                                        value: ["pull_request"],
                                    },
                                    {
                                        name: "secretRef",
                                        value: {
                                            secretName: "github-webhook-secret",
                                            secretKey: "secretToken",
                                        },
                                    },
                                ],
                            },
                        ],
                        template: { ref: prTrigger.templateRef },
                    },
                ],
            },
        });
    }
}
