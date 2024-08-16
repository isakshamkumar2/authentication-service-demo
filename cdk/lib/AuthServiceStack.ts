import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import {
  createDefaultVpc, STAGES, createDefaultSecurityGroup, createIAMRole,
  attachManagedPolicyToRole, MANAGED_POLICIES, createPolicyStatement,
  attachCustomPolicyStatementsToRole, createS3Bucket, deployToS3Bucket,
  createLoadBalancerWithTargets, createDefaultAutoScalingGroup
} from '@genflowly/cdk-commons';

export class AuthServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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

    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(PORT), 'Allow Flask app traffic');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access');

    const role = createIAMRole(
      'AuthServiceEC2Role',
      new iam.ServicePrincipal('ec2.amazonaws.com'),
      STAGES.BETA,
      this
    );
    
    attachManagedPolicyToRole(role, MANAGED_POLICIES.SSM_MANAGED_INSTANCE_CORE);
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'));

    const wheelsBucket = createS3Bucket(this, {
      bucketName: `auth-service-wheels-${STAGES.BETA}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stage: STAGES.BETA,
      autoDeleteObjects: true
    });

    const s3PolicyStatement = createPolicyStatement(
      ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      [wheelsBucket.bucketArn, `${wheelsBucket.bucketArn}/*`]
    );
    attachCustomPolicyStatementsToRole(role, [s3PolicyStatement]);

    const s3Deployment = deployToS3Bucket(this, {
      deploymentName: 'DeployAuthServiceWheels',
      destinationBucket: wheelsBucket,
      sourcePath: path.join(__dirname, '..', '..', 'src', 'wheels'),
      stage: STAGES.BETA,
      destinationKeyPrefix: 'wheels'
    });

    const authAppPath = path.join(__dirname, '..', '..', 'src');
    const appPyContent = fs.readFileSync(path.join(authAppPath, 'app.py'), 'utf8');
    const servicePyContent = fs.readFileSync(path.join(authAppPath, 'service.py'), 'utf8');
    const constantsPyContent = fs.readFileSync(path.join(authAppPath, 'constants.py'), 'utf8');
    const localUtilsPyContent = fs.readFileSync(path.join(authAppPath, 'local_utils.py'), 'utf8');
    const authorizeWithGooglePyContent = fs.readFileSync(path.join(authAppPath, 'authorize_with_google.py'), 'utf8');
    const requirementsTxtContent = fs.readFileSync(path.join(__dirname, '..', '..', 'requirements.txt'), 'utf8');

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      'yum update -y',
      'yum install -y python3 python3-pip awscli',
      'mkdir -p /home/ec2-user/auth-service',
      `echo '${appPyContent.replace(/'/g, "'\\''")}' > /home/ec2-user/auth-service/app.py`,
      `echo '${servicePyContent.replace(/'/g, "'\\''")}' > /home/ec2-user/auth-service/service.py`,
      `echo '${constantsPyContent.replace(/'/g, "'\\''")}' > /home/ec2-user/auth-service/constants.py`,
      `echo '${localUtilsPyContent.replace(/'/g, "'\\''")}' > /home/ec2-user/auth-service/local_utils.py`,
      `echo '${authorizeWithGooglePyContent.replace(/'/g, "'\\''")}' > /home/ec2-user/auth-service/authorize_with_google.py`,
      `echo '${requirementsTxtContent.replace(/'/g, "'\\''")}' > /home/ec2-user/auth-service/requirements.txt`,
      `aws s3 cp s3://${wheelsBucket.bucketName}/wheels/ /home/ec2-user/auth-service/wheels/ --recursive`,
      'cd /home/ec2-user/auth-service',
      'pip3 install -r requirements.txt',
      'pip3 install wheels/*.whl',
      `export APP_PORT=${PORT}`,
      `nohup gunicorn --workers 3 --bind 0.0.0.0:${PORT} app:app > /dev/null 2>&1 &`
    );

    const autoScalingGroup = createDefaultAutoScalingGroup(this, {
      asgName: 'AuthServiceASG',
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      userData,
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      subnetType: ec2.SubnetType.PUBLIC,
      stage: STAGES.BETA,
      keyName: 'authService',
      securityGroup,
      role
    });

    autoScalingGroup.node.addDependency(s3Deployment);

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
        protocol: elbv2.ApplicationProtocol.HTTP,
      }]
    });

    new cdk.CfnOutput(this, 'AuthLoadBalancerDNS', {
      value: loadBalancer.loadBalancerDnsName
    });
  }
}