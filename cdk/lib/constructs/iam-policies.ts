import { Construct } from 'constructs';
import { PolicyStatement, Effect, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Instance } from 'aws-cdk-lib/aws-ec2';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { createPolicyStatement } from '@genflowly/cdk-commons';

export interface AuthServiceIamPoliciesProps {
  ec2Instance: Instance;
  dynamoDbTable: ITable;
  s3Bucket: IBucket;
}

export class AuthServiceIamPolicies extends Construct {
  constructor(scope: Construct, id: string, props: AuthServiceIamPoliciesProps) {
    super(scope, id);

    const s3ListBucketPolicy = createPolicyStatement(
      ['s3:ListBucket'],
      [props.s3Bucket.bucketArn]
    );

    const s3GetObjectPolicy = createPolicyStatement(
      ['s3:GetObject'],
      [`${props.s3Bucket.bucketArn}/*`]
    );

    const secretsManagerPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      resources: ['*']  
    });

    props.ec2Instance.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
    props.ec2Instance.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'));
    props.ec2Instance.role.addToPrincipalPolicy(s3ListBucketPolicy);
    props.ec2Instance.role.addToPrincipalPolicy(s3GetObjectPolicy);
    props.ec2Instance.role.addToPrincipalPolicy(secretsManagerPolicy);

    const dynamoDbPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [props.dynamoDbTable.tableArn]
    });

    props.ec2Instance.role.addToPrincipalPolicy(dynamoDbPolicy);
  }
}