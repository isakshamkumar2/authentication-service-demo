import { Construct } from 'constructs';
import { ITable, AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { 
  createDefaultDynamoDbTable, 
  getExistingDynamoDbTable,
  CreateTableProps
} from '@genflowly/cdk-commons';
import { USER_AUTHENTICATION_TABLE_NAME } from '../constants';

export class AuthenticationServiceDynamoDb extends Construct {
  public readonly table: ITable;

  constructor(scope: Construct, id: string) {
    super(scope, id);
 
    try {
      this.table = getExistingDynamoDbTable(this, USER_AUTHENTICATION_TABLE_NAME);
      console.log('Existing DynamoDB table found and imported.');
    } catch (error) {
      console.log('Existing table not found. Creating a new DynamoDB table.');
      const tableProps: CreateTableProps = {
        tableName: USER_AUTHENTICATION_TABLE_NAME,
        partitionKey: { name: 'email', type: AttributeType.STRING },
      };
      this.table = createDefaultDynamoDbTable(this, tableProps);
    }
  }
}