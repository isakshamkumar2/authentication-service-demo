import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { createDefaultVpc, STAGES } from '@genflowly/cdk-commons';
import { AUTHENTICATION_SERVICE_NAME, AUTHENTICATION_SERVICE_VPC_AZ_COUNT, DELMITER } from '../constants';

export class AuthenticationServiceVpc extends Construct {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stage = STAGES.BETA;
    this.vpc = createDefaultVpc(`${AUTHENTICATION_SERVICE_NAME}${DELMITER}VPC`, `${AUTHENTICATION_SERVICE_NAME}${DELMITER}VPC`, AUTHENTICATION_SERVICE_VPC_AZ_COUNT, this, stage);
  }
}