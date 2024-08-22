import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Table, AttributeType, BillingMode, ITable } from 'aws-cdk-lib/aws-dynamodb';

export class AuthServiceDynamoDb extends Construct {
  public readonly table: ITable;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Check for existing DynamoDB Table or create a new one
    try {
      this.table = Table.fromTableName(this, 'ExistingAuthTable', 'user_authentication');
      console.log('Existing DynamoDB table found and imported.');
    } catch (error) {
      console.log('Existing table not found. Creating a new DynamoDB table.');
      this.table = new Table(this, 'AuthenticationTable', {
        tableName: 'user_authentication',
        partitionKey: { name: 'email', type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.RETAIN,
      });
    }
  }
}