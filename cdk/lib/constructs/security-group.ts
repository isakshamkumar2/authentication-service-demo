import { Construct } from 'constructs';
import { SecurityGroup, Vpc, Port } from 'aws-cdk-lib/aws-ec2';
import { createDefaultSecurityGroup, addIngressRule, STAGES, ALLOWED_HTTP_PORT } from '@genflowly/cdk-commons';
import { AUTHENTICATION_SERVICE_NAME, DELMITER } from '../constants';

export class AuthenticationServiceSecurityGroup extends Construct {
  public readonly securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: { vpc: Vpc }) {
    super(scope, id);

    const stage = STAGES.BETA;
    this.securityGroup = createDefaultSecurityGroup(
      `${AUTHENTICATION_SERVICE_NAME}${DELMITER}SecurityGroup`,
      props.vpc,
      `${AUTHENTICATION_SERVICE_NAME}${DELMITER}SecurityGroup`,
      stage,
      this
    );

    addIngressRule(this.securityGroup, Port.tcp(ALLOWED_HTTP_PORT), 'Allow HTTP traffic');
    }
}