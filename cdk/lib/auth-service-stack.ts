import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { AuthenticationServiceVpc } from './constructs/vpc';
import { AuthenticationServiceSecurityGroup } from './constructs/security-group';
import { AuthenticationServiceDynamoDb } from './constructs/dynamodb';
import { AuthenticationServiceEc2Instance } from './constructs/ec2-instance';
import { AuthenticationServiceIamPolicies } from './constructs/iam-policies';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { AUTHENTICATION_SERVICE_NAME, DELMITER, EC2_INSTANCE_PUBLIC_IP_OUTPUT, EXISTING_PACKAGE_DEPLOYMENT_BUCKET_ID, PACKAGE_DEPLOYMENT_BUCKET_BETA_NAME } from './constants';

export class AuthenticationService extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new AuthenticationServiceVpc(this,  `${AUTHENTICATION_SERVICE_NAME}${DELMITER}VPC`);
    const securityGroup = new AuthenticationServiceSecurityGroup(this,  `${AUTHENTICATION_SERVICE_NAME}${DELMITER}SecurityGroup`, { vpc: vpc.vpc });
    const dynamoDb = new AuthenticationServiceDynamoDb(this,  `${AUTHENTICATION_SERVICE_NAME}${DELMITER}DDB`);
    const ec2Instance = new AuthenticationServiceEc2Instance(this,  `${AUTHENTICATION_SERVICE_NAME}${DELMITER}EC2Instance`, {
      vpc: vpc.vpc,
      securityGroup: securityGroup.securityGroup,
      dynamoDbTable: dynamoDb.table,
    });

    const wheelBucket = Bucket.fromBucketName(this, EXISTING_PACKAGE_DEPLOYMENT_BUCKET_ID, PACKAGE_DEPLOYMENT_BUCKET_BETA_NAME);
    new AuthenticationServiceIamPolicies(this,  `${AUTHENTICATION_SERVICE_NAME}${DELMITER}IAMPolicies`, {
      ec2Instance: ec2Instance.instance,
      dynamoDbTable: dynamoDb.table,
      s3Bucket: wheelBucket,
    });

    new CfnOutput(this, EC2_INSTANCE_PUBLIC_IP_OUTPUT, {
      value: ec2Instance.instance.instancePublicIp,
      description: `Public IP address of the ${AUTHENTICATION_SERVICE_NAME} EC2 instance`,
    });
  }
}