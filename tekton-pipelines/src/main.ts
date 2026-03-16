import { App, Chart } from 'cdk8s';
import { GitCloneTask, GitLogTask } from '@pfenerty/tekton-pipelines';
import { OcidexPushPipeline } from './ocidex-push.pipeline';
import { OcidexPullRequestPipeline } from './ocidex-pull-request.pipeline';
import { OcidexChart } from './ocidex.chart';

const NAMESPACE = 'tekton-pipelines';

const app = new App();

const gitCloneChart = new Chart(app, 'ocidex-task-git-clone');
new GitCloneTask(gitCloneChart, 'task', { namespace: NAMESPACE });

const gitLogChart = new Chart(app, 'ocidex-task-git-log');
new GitLogTask(gitLogChart, 'task', { namespace: NAMESPACE });

const pushChart = new Chart(app, 'ocidex-pipeline-push');
new OcidexPushPipeline(pushChart, 'pipeline', { namespace: NAMESPACE });

const prChart = new Chart(app, 'ocidex-pipeline-pull-request');
new OcidexPullRequestPipeline(prChart, 'pipeline', { namespace: NAMESPACE });

new OcidexChart(app, 'ocidex-infra', {
  namespace: NAMESPACE,
  pushPipelineRef: 'ocidex-push',
  pullRequestPipelineRef: 'ocidex-pull-request',
});

void gitCloneChart, gitLogChart, pushChart, prChart;

app.synth();
