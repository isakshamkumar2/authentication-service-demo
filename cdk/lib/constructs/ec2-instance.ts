import { Construct } from 'constructs';
import { Instance, InstanceType, InstanceClass, InstanceSize, Vpc, SecurityGroup, UserData, MachineImage } from 'aws-cdk-lib/aws-ec2';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { createUserData, createDefaultEc2Instance, attachSSMPolicyToEC2Instance, STAGES } from '@genflowly/cdk-commons';
import { AUTHENTICATION_SERVICE_NAME, DELMITER, EXISTING_PACKAGE_DEPLOYMENT_BUCKET_ID, PACKAGE_DEPLOYMENT_BUCKET_BETA_NAME } from '../constants';

export interface AuthenticationServiceEc2InstanceProps {
  vpc: Vpc;
  securityGroup: SecurityGroup;
  dynamoDbTable: ITable;
}

export class AuthenticationServiceEc2Instance extends Construct {
  public readonly instance: Instance;

  constructor(scope: Construct, id: string, props: AuthenticationServiceEc2InstanceProps) {
    super(scope, id);

    const stage = STAGES.BETA;
    const wheelBucket = Bucket.fromBucketName(this, EXISTING_PACKAGE_DEPLOYMENT_BUCKET_ID, PACKAGE_DEPLOYMENT_BUCKET_BETA_NAME);

    const userDataCommands = [
      'sudo apt update',
      'sudo apt install -y nginx python3-pip python3-venv awscli',
      'mkdir -p /home/ubuntu/auth-service/src',
      'python3 -m venv /home/ubuntu/auth-service/venv',
      'source /home/ubuntu/auth-service/venv/bin/activate',
      'pip install --upgrade pip',
      'pip install flask-cors',
      'pip install gunicorn',
      `aws s3 sync s3://${wheelBucket.bucketName}/wheelhouse /home/ubuntu/auth-service/src/wheels`,
      `aws s3 cp s3://${wheelBucket.bucketName}/requirements.txt /home/ubuntu/auth-service/`,
      `aws s3 sync s3://${wheelBucket.bucketName}/src /home/ubuntu/auth-service/src`,
      'pip install --no-index --find-links=/home/ubuntu/auth-service/src/wheels -r /home/ubuntu/auth-service/requirements.txt',
      'sudo systemctl start nginx',
      'sudo systemctl enable nginx',
      'echo "server { listen 80; location / { proxy_pass http://127.0.0.1:8000; } }" | sudo tee /etc/nginx/sites-available/auth-service',
      'sudo ln -s /etc/nginx/sites-available/auth-service /etc/nginx/sites-enabled/',
      'sudo rm /etc/nginx/sites-enabled/default',
      'sudo nginx -s reload',
      'echo "export AWS_DEFAULT_REGION=ap-south-1" >> /home/ubuntu/.bashrc',
      'echo "export AWS_DEFAULT_REGION=ap-south-1" >> /etc/environment',
      `sed -i 's/AUTHENTICATION_DDB_TABLE = "user_authentication"/AUTHENTICATION_DDB_TABLE = "${props.dynamoDbTable.tableName}"/g' /home/ubuntu/auth-service/src/constants.py`,
      'cd /home/ubuntu/auth-service && /home/ubuntu/auth-service/venv/bin/gunicorn --bind 127.0.0.1:8000 src.app:app -D --chdir /home/ubuntu/auth-service'
    ];
    const userData = createUserData(userDataCommands);
    this.instance = createDefaultEc2Instance(
      `${AUTHENTICATION_SERVICE_NAME}${DELMITER}EC2Instance`,
      InstanceType.of(InstanceClass.T2, InstanceSize.NANO).toString(),
      props.vpc,
      props.securityGroup,
      userData.render(),
      stage,
      this
    );

    wheelBucket.grantRead(this.instance.role);
    props.dynamoDbTable.grantReadWriteData(this.instance.role);

    attachSSMPolicyToEC2Instance(this.instance);
  }
}