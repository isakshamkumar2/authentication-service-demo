import { Construct } from 'constructs';
import { Instance } from 'aws-cdk-lib/aws-ec2';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import {
  createPolicyStatement,
  attachManagedPolicyToRole,
  attachCustomPolicyStatementsToPrincipalPolicy,
  MANAGED_POLICIES
} from '@genflowly/cdk-commons';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';

export interface AuthenticationServiceIamPoliciesProps {
  ec2Instance: Instance;
  dynamoDbTable: ITable;
  s3Bucket: IBucket;
}

export class AuthenticationServiceIamPolicies extends Construct {
  constructor(scope: Construct, id: string, props: AuthenticationServiceIamPoliciesProps) {
    super(scope, id);

    const s3ListBucketPolicy = createPolicyStatement(
      ['s3:ListBucket'],
      [props.s3Bucket.bucketArn]
    );

    const s3GetObjectPolicy = createPolicyStatement(
      ['s3:GetObject'],
      [`${props.s3Bucket.bucketArn}/*`]
    );

    const secretsManagerPolicy = createPolicyStatement(
      [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      ['*']
    );

    const dynamoDbPolicy = createPolicyStatement(
      [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      [props.dynamoDbTable.tableArn]
    );

    attachManagedPolicyToRole(props.ec2Instance.role, MANAGED_POLICIES.AmazonDynamoDBFullAccess);
    attachManagedPolicyToRole(props.ec2Instance.role, MANAGED_POLICIES.SecretsManagerReadWrite);
    // attachManagedPolicyToRole(props.ec2Instance.role, "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore");
    // attachManagedPolicyToRole(props.ec2Instance.role, MANAGED_POLICIES.AmazonSSMFullAccess);
    props.ec2Instance.role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );
    props.ec2Instance.role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess') // Optional, based on your use case
    );
    attachCustomPolicyStatementsToPrincipalPolicy(props.ec2Instance.role, [
      s3ListBucketPolicy,
      s3GetObjectPolicy,
      secretsManagerPolicy,
      dynamoDbPolicy
    ]);
  }
} 
