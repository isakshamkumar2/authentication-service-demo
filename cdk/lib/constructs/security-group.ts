import { Construct } from 'constructs';
import { SecurityGroup, Vpc, Port } from 'aws-cdk-lib/aws-ec2';
import { createDefaultSecurityGroup, addIngressRule, STAGES, ALLOWED_HTTP_PORT } from '@genflowly/cdk-commons';

export class AuthServiceSecurityGroup extends Construct {
  public readonly securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: { vpc: Vpc }) {
    super(scope, id);

    const stage = STAGES.BETA;
    this.securityGroup = createDefaultSecurityGroup(
      'AuthServiceSG',
      props.vpc,
      'Allow HTTP and SSH traffic',
      stage,
      this
    );

    addIngressRule(this.securityGroup, Port.tcp(ALLOWED_HTTP_PORT), 'Allow HTTP traffic');
    addIngressRule(this.securityGroup, Port.tcp(22), 'Allow SSH access');
  }
}