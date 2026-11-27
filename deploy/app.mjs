// Hosts the Studio (website + API) at https://www.tpdocgenai.com/benchmarkingStudio, on TAIGA's existing load balancer
// and ECS cluster (taiga-dev, ap-south-1). Its own stack: deploying or removing it changes nothing of TAIGA's except
// one rule on the HTTPS listener and one outbound rule on the load balancer's security group, both owned here.
//   cd deploy; npx cdk diff; npx cdk deploy          (AWS_PROFILE=taiga)
// The image is pushed to ECR repository bm-studio first (see docs/aws-hosting.md).
//
// Choices, and why:
// - HTTPS listener only, priority 900, target group "bm-studio-dev": TAIGA's deploy mirrors HTTP rules onto its
//   hand-made HTTPS listener by priority and deletes HTTPS rules whose target group starts with "taiga-dev-"; this
//   rule matches neither, and 900 stays clear of TAIGA's own numbers.
// - One task on FARGATE (not Spot), SQLite on EFS, one-at-a-time deploys: SQLite has a single writer.
// - EXPORTS_ON_RUNNER=1 (set in the image): no TP Catalyst export file is stored on AWS.
import { App, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';

const T = {
  account: '600627321277', region: 'ap-south-1', env: 'dev',
  vpcId: 'vpc-083387e8baa675529', cluster: 'taiga-dev',
  httpsListener: 'arn:aws:elasticloadbalancing:ap-south-1:600627321277:listener/app/taiga-dev-alb/7fc6ae9c976152dc/81d5dcfbb7cc459e',
  albSecurityGroup: 'sg-01a196ac2c95283e6',
  host: 'www.tpdocgenai.com', path: '/benchmarkingStudio', priority: 900,
};
const PORT = 3000;
const imageTag = process.env.IMAGE_TAG ?? 'latest';

const app = new App();
const stack = new Stack(app, `bm-studio-${T.env}`, { env: { account: T.account, region: T.region }, description: 'SBC Benchmarking Studio at www.tpdocgenai.com/benchmarkingStudio' });

const vpc = ec2.Vpc.fromLookup(stack, 'Vpc', { vpcId: T.vpcId });
const cluster = ecs.Cluster.fromClusterAttributes(stack, 'Cluster', { clusterName: T.cluster, vpc, securityGroups: [] });
const albSg = ec2.SecurityGroup.fromSecurityGroupId(stack, 'AlbSg', T.albSecurityGroup, { allowAllOutbound: false });
const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(stack, 'Https', { listenerArn: T.httpsListener, securityGroup: albSg });

// Studio password and runner token, generated here. Read them with: aws secretsmanager get-secret-value --secret-id bm-studio/dev/...
const password = new sm.Secret(stack, 'Password', { secretName: `bm-studio/${T.env}/studio-password`, generateSecretString: { passwordLength: 20, excludePunctuation: true } });
const runnerToken = new sm.Secret(stack, 'RunnerToken', { secretName: `bm-studio/${T.env}/runner-token`, generateSecretString: { passwordLength: 40, excludePunctuation: true } });
// The planner's Claude key: the Studio's own secret (TAIGA's key denies other roles by policy). Created with a
// placeholder; put the real key in with: aws secretsmanager put-secret-value --secret-id bm-studio/dev/anthropic-api-key
// --secret-string <key>, then restart the service. Until then the Studio runs but planning fails with the model's error.
const anthropic = new sm.Secret(stack, 'Anthropic', { secretName: `bm-studio/${T.env}/anthropic-api-key`, generateSecretString: { passwordLength: 16, excludePunctuation: true } });

const fileSystem = new efs.FileSystem(stack, 'Data', {
  vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, encrypted: true,
  throughputMode: efs.ThroughputMode.BURSTING, removalPolicy: RemovalPolicy.RETAIN, // the searches list survives a teardown
});
const accessPoint = fileSystem.addAccessPoint('Ap', { path: '/studio', createAcl: { ownerUid: '1000', ownerGid: '1000', permissions: '750' }, posixUser: { uid: '1000', gid: '1000' } });

const task = new ecs.FargateTaskDefinition(stack, 'Task', { cpu: 256, memoryLimitMiB: 512, runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX } });
task.addVolume({ name: 'data', efsVolumeConfiguration: { fileSystemId: fileSystem.fileSystemId, transitEncryption: 'ENABLED', authorizationConfig: { accessPointId: accessPoint.accessPointId, iam: 'ENABLED' } } });
fileSystem.grant(task.taskRole, 'elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite');
const container = task.addContainer('studio', {
  image: ecs.ContainerImage.fromEcrRepository(ecr.Repository.fromRepositoryName(stack, 'Repo', 'bm-studio'), imageTag),
  logging: ecs.LogDrivers.awsLogs({ logGroup: new logs.LogGroup(stack, 'Logs', { logGroupName: `/bm-studio/${T.env}`, retention: logs.RetentionDays.THREE_MONTHS, removalPolicy: RemovalPolicy.DESTROY }), streamPrefix: 'studio' }),
  portMappings: [{ containerPort: PORT }],
  environment: { PORT: String(PORT), HOST: '0.0.0.0', BASE_PATH: T.path, EXPORTS_ON_RUNNER: '1', LOG_LEVEL: 'info' },
  secrets: {
    STUDIO_PASSWORD: ecs.Secret.fromSecretsManager(password),
    RUNNER_TOKEN: ecs.Secret.fromSecretsManager(runnerToken),
    ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(anthropic),
  },
});
container.addMountPoints({ containerPath: '/app/studio/data', sourceVolume: 'data', readOnly: false });

const service = new ecs.FargateService(stack, 'Service', {
  serviceName: `bm-studio-${T.env}`, cluster, taskDefinition: task, desiredCount: 1, minHealthyPercent: 0, maxHealthyPercent: 100,
  assignPublicIp: false, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  circuitBreaker: { enable: true, rollback: true }, capacityProviderStrategies: [{ capacityProvider: 'FARGATE', weight: 1, base: 1 }],
});
fileSystem.connections.allowDefaultPortFrom(service);

const targetGroup = new elbv2.ApplicationTargetGroup(stack, 'Tg', {
  targetGroupName: `bm-studio-${T.env}`, vpc, port: PORT, protocol: elbv2.ApplicationProtocol.HTTP, targets: [service],
  healthCheck: { path: `${T.path}/api/health`, interval: Duration.seconds(30), healthyThresholdCount: 2, unhealthyThresholdCount: 3, timeout: Duration.seconds(5) },
  deregistrationDelay: Duration.seconds(10),
});
listener.addTargetGroups('Route', {
  targetGroups: [targetGroup], priority: T.priority,
  conditions: [elbv2.ListenerCondition.hostHeaders([T.host]), elbv2.ListenerCondition.pathPatterns([T.path, `${T.path}/*`])],
});
// The load balancer only sends traffic to security groups it is told about: one outbound rule, owned by this stack.
service.connections.allowFrom(albSg, ec2.Port.tcp(PORT), 'TAIGA load balancer to the Studio');
albSg.addEgressRule(service.connections.securityGroups[0], ec2.Port.tcp(PORT), 'to the Benchmarking Studio');
