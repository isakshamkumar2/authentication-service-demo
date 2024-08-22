import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { createDefaultVpc, STAGES } from '@genflowly/cdk-commons';

export class AuthServiceVpc extends Construct {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stage = STAGES.BETA;
    this.vpc = createDefaultVpc('AuthServiceVPC', 'AuthServiceVPC', 2, this, stage);
  }
}