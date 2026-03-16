import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import {
  GitClonePipelineTask,
  GitLogPipelineTask,
  TEKTON_API_V1,
  WS_WORKSPACE,
  PARAM_GIT_URL,
  PARAM_GIT_REVISION,
  PARAM_PROJECT_NAME,
  PARAM_APP_ROOT,
  PARAM_BUILD_PATH,
} from '@pfenerty/tekton-pipelines';

export interface OcidexPullRequestPipelineProps {
  namespace: string;
  name?: string;
}

/**
 * Pipeline triggered on pull_request events for the ocidex repo: clones the
 * repo and runs git-log to display commit state.
 *
 * Tasks:
 *   clone         - git-clone (Tekton catalog resolver)
 *   log-git-state - git-log task
 *
 * Params exposed at runtime:
 *   git-url      - repository URL
 *   git-revision - commit SHA / branch
 *   project-name - repository name
 *   app-root     - unused by git-log; declared to satisfy TriggerTemplate
 *   build-path   - unused by git-log; declared to satisfy TriggerTemplate
 */
export class OcidexPullRequestPipeline extends Construct {
  public readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: OcidexPullRequestPipelineProps) {
    super(scope, id);
    this.pipelineName = props.name ?? 'ocidex-pull-request';

    const clone = new GitClonePipelineTask();
    const log = new GitLogPipelineTask({ runAfter: clone });

    new ApiObject(this, 'resource', {
      apiVersion: TEKTON_API_V1,
      kind: 'Pipeline',
      metadata: {
        name: this.pipelineName,
        namespace: props.namespace,
      },
      spec: {
        params: [
          { name: PARAM_GIT_URL, type: 'string' },
          { name: PARAM_GIT_REVISION, type: 'string' },
          { name: PARAM_PROJECT_NAME, type: 'string' },
          { name: PARAM_APP_ROOT, type: 'string' },
          { name: PARAM_BUILD_PATH, type: 'string' },
        ],
        workspaces: [{ name: WS_WORKSPACE }],
        tasks: [clone, log].map(t => t.toSpec()),
      },
    });
  }
}
