import { Construct } from 'constructs';
import { Stack, CfnOutput, StackProps } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Port, InstanceType, InstanceClass, InstanceSize,MachineImage } from 'aws-cdk-lib/aws-ec2';
import {
  createDefaultVpc,
  createDefaultSecurityGroup,
  addIngressRule,
  createUserData,
  createDefaultEc2Instance,
  attachSSMPolicyToEC2Instance,
  STAGES,
  ALLOWED_HTTP_PORT,
} from '@genflowly/cdk-commons';

export class AuthServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const stage = STAGES.BETA;

    const vpc = createDefaultVpc('AuthServiceVPC', 'AuthServiceVPC', 2, this, stage);

    const securityGroup = createDefaultSecurityGroup(
      'AuthServiceSG',
      vpc,
      'Allow HTTP and SSH traffic',
      stage,
      this
    );

    addIngressRule(securityGroup, Port.tcp(ALLOWED_HTTP_PORT), 'Allow HTTP traffic');
    addIngressRule(securityGroup, Port.tcp(22), 'Allow SSH access');

    const wheelBucket = Bucket.fromBucketName(this, 'ExistingBucket', 'package-deployment-bucket-beta');

    const userDataCommands = [
      'sudo yum update -y',
      'sudo yum install -y nginx',
      'sudo amazon-linux-extras enable python3.10',
      'sudo yum install -y python3.10',
      'sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1',
      'sudo update-alternatives --set python3 /usr/bin/python3.10',
      'python3 -m ensurepip --upgrade',
      'python3 -m pip install --upgrade pip',
      'python3 -m pip install gunicorn',
      'mkdir -p /home/ec2-user/auth-service',
      `aws s3 sync s3://${wheelBucket.bucketName}/wheelhouse /home/ec2-user/auth-service/wheelhouse`,
      `aws s3 cp s3://${wheelBucket.bucketName}/requirements.txt /home/ec2-user/auth-service/`,
      `aws s3 sync s3://${wheelBucket.bucketName}/src /home/ec2-user/auth-service/src`,
      'sudo python3 -m pip install --no-index --find-links=/home/ec2-user/auth-service/wheelhouse -r /home/ec2-user/auth-service/requirements.txt',
      'sudo systemctl start nginx',
      'sudo systemctl enable nginx',
      'echo "server { listen 80; location / { proxy_pass http://127.0.0.1:8000; } }" | sudo tee /etc/nginx/conf.d/auth-service.conf',
      'sudo nginx -s reload',
      'gunicorn --bind 127.0.0.1:8000 src.app:app -D --chdir /home/ec2-user/auth-service'
    ];
    const userData = createUserData(userDataCommands);

    const instance = createDefaultEc2Instance(
      'AuthServiceInstance',
      InstanceType.of(InstanceClass.T3, InstanceSize.MICRO).toString(),
      MachineImage.latestAmazonLinux2().getImage(this).imageId,
      vpc,
      securityGroup,
      userData.render(),
      this.region,
      stage,
      this
    );

    wheelBucket.grantRead(instance.role);

    attachSSMPolicyToEC2Instance(instance);

    new CfnOutput(this, 'InstancePublicIp', {
      value: instance.instancePublicIp,
      description: 'Public IP address of the EC2 instance',
    });
  }
}