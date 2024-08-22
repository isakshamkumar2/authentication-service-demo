import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { AuthServiceVpc } from './constructs/vpc';
import { AuthServiceSecurityGroup } from './constructs/security-group';
import { AuthServiceDynamoDb } from './constructs/dynamodb';
import { AuthServiceEc2Instance } from './constructs/ec2-instance';
import { AuthServiceIamPolicies } from './constructs/iam-policies';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export class AuthServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new AuthServiceVpc(this, 'AuthServiceVpc');
    const securityGroup = new AuthServiceSecurityGroup(this, 'AuthServiceSecurityGroup', { vpc: vpc.vpc });
    const dynamoDb = new AuthServiceDynamoDb(this, 'AuthServiceDynamoDb');
    const ec2Instance = new AuthServiceEc2Instance(this, 'AuthServiceEc2Instance', {
      vpc: vpc.vpc,
      securityGroup: securityGroup.securityGroup,
      dynamoDbTable: dynamoDb.table,
    });

    const wheelBucket = Bucket.fromBucketName(this, 'ExistingBucket', 'package-deployment-bucket-beta');
    new AuthServiceIamPolicies(this, 'AuthServiceIamPolicies', {
      ec2Instance: ec2Instance.instance,
      dynamoDbTable: dynamoDb.table,
      s3Bucket: wheelBucket,
    });

    new CfnOutput(this, 'InstancePublicIp', {
      value: ec2Instance.instance.instancePublicIp,
      description: 'Public IP address of the EC2 instance',
    });
  }
}