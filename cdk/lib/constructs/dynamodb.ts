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
    let existingTable= getExistingDynamoDbTable(this, USER_AUTHENTICATION_TABLE_NAME);
    if(existingTable){
      this.table = existingTable;
      console.log('Existing DynamoDB table found and imported.');
    } else{
      console.log('Existing table not found. Creating a new DynamoDB table.');
      const tableProps: CreateTableProps = {
        tableName: USER_AUTHENTICATION_TABLE_NAME,
        partitionKey: { name: 'email', type: AttributeType.STRING },
      };
      this.table = createDefaultDynamoDbTable(this, tableProps);
    }
  }
}
