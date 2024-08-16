import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Vpc, Peer, Port, SecurityGroup, UserData, InstanceType, InstanceClass, InstanceSize, MachineImage, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Role, ServicePrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { ApplicationProtocol, ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as path from 'path';
import {
  createDefaultVpc, STAGES, createDefaultSecurityGroup, createIAMRole,
  attachManagedPolicyToRole, MANAGED_POLICIES, createPolicyStatement,
  attachCustomPolicyStatementsToRole, createS3Bucket,
  createLoadBalancerWithTargets, createDefaultAutoScalingGroup
} from '@genflowly/cdk-commons';

export class AuthServiceCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const PORT = 5000;

    const vpc = createDefaultVpc('AuthServiceVpc', 'AuthServiceVPC', 2, this, STAGES.BETA, true);

    const securityGroup = createDefaultSecurityGroup(
      'AuthServiceSecurityGroup',
      vpc,
      'Security group for AuthService',
      STAGES.BETA,
      this,
    );

    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'Allow HTTP traffic');
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(PORT), 'Allow Flask app traffic');
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22), 'Allow SSH access');

    const role = createIAMRole(
      'AuthServiceEC2Role',
      new ServicePrincipal('ec2.amazonaws.com'),
      STAGES.BETA,
      this
    );
    
    attachManagedPolicyToRole(role, MANAGED_POLICIES.SSM_MANAGED_INSTANCE_CORE);
    role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
    role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'));

    const authServiceBucket = createS3Bucket(this, {
      bucketName: `auth-service-${STAGES.BETA}`,
      removalPolicy: RemovalPolicy.DESTROY,
      stage: STAGES.BETA,
      autoDeleteObjects: true
    });
    authServiceBucket.grantRead(role);

    const s3PolicyStatement = createPolicyStatement(
      ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      [authServiceBucket.bucketArn, `${authServiceBucket.bucketArn}/*`]
    );
    attachCustomPolicyStatementsToRole(role, [s3PolicyStatement]);

    new BucketDeployment(this, 'DeployAuthServiceFiles', {
      sources: [Source.asset(path.join(__dirname, '..', '..', 'src'))],
      destinationBucket: authServiceBucket,
      destinationKeyPrefix: 'app',
    });

    new BucketDeployment(this, 'DeployRequirements', {
      sources: [Source.asset(path.join(__dirname, '..', '..'))],
      destinationBucket: authServiceBucket,
      destinationKeyPrefix: 'requirements',
      exclude: ['*', '!requirements.txt'],
    });

    new BucketDeployment(this, 'DeployWheels', {
      sources: [Source.asset(path.join(__dirname, '..', '..', 'src', 'wheels'))],
      destinationBucket: authServiceBucket,
      destinationKeyPrefix: 'wheels',
    });

    const userData = UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      'yum update -y',
      'yum install -y python3 python3-pip awscli',
      'mkdir -p /home/ec2-user/auth-service',
      'cd /home/ec2-user/auth-service',
      `aws s3 cp s3://${authServiceBucket.bucketName}/app/ . --recursive`,
      `aws s3 cp s3://${authServiceBucket.bucketName}/requirements/requirements.txt .`,
      `aws s3 cp s3://${authServiceBucket.bucketName}/wheels/ ./wheels/ --recursive`,
      'pip3 install -r requirements.txt',
      'pip3 install wheels/*.whl',
      `export APP_PORT=${PORT}`,
      `nohup gunicorn --workers 3 --bind 0.0.0.0:${PORT} app:app > /dev/null 2>&1 &`
    );

    const autoScalingGroup = createDefaultAutoScalingGroup(this, {
      asgName: 'AuthServiceASG',
      vpc,
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      machineImage: MachineImage.latestAmazonLinux2(),
      userData,
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      subnetType: SubnetType.PUBLIC,
      stage: STAGES.BETA,
      keyName: 'authService',
      securityGroup,
      role
    });

    const { loadBalancer } = createLoadBalancerWithTargets(this, {
      lbName: 'AuthServiceALB',
      vpc,
      stage: STAGES.BETA,
      internetFacing: true,
      listenerPort: 80,
      targetGroups: [{
        name: 'AuthServiceTarget',
        port: PORT,
        targets: [autoScalingGroup],
        healthCheckPath: '/metrics',
        protocol: ApplicationProtocol.HTTP,
      }]
    });

    new CfnOutput(this, 'AuthLoadBalancerDNS', {
      value: loadBalancer.loadBalancerDnsName
    });
  }
}
