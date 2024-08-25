import { Construct } from 'constructs';
import { Instance, InstanceType, InstanceClass, InstanceSize, Vpc, SecurityGroup, UserData, MachineImage } from 'aws-cdk-lib/aws-ec2';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { createUserData, createDefaultEc2Instance, attachSSMPolicyToEC2Instance, STAGES, createAndAssignDefaultElasticIp } from '@genflowly/cdk-commons';
import { AUTHENTICATION_SERVICE_NAME, DELMITER, PACKAGE_DEPLOYMENT_BUCKET_ID, PACKAGE_DEPLOYMENT_BUCKET_BETA_NAME } from '../constants';

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
    const wheelBucket = Bucket.fromBucketName(this, PACKAGE_DEPLOYMENT_BUCKET_ID, PACKAGE_DEPLOYMENT_BUCKET_BETA_NAME);
    const userDataCommands = [
      'sudo apt update',
      'sudo apt install -y nginx python3-pip python3-venv awscli certbot python3-certbot-nginx',
      'mkdir -p /home/ubuntu/auth-service/src',
      'python3 -m venv /home/ubuntu/auth-service/venv',
      'source /home/ubuntu/auth-service/venv/bin/activate',
      'pip install --upgrade pip',
      'pip install flask-cors gunicorn',
      `aws s3 sync s3://${wheelBucket.bucketName}/wheelhouse /home/ubuntu/auth-service/src/wheels`,
      `aws s3 cp s3://${wheelBucket.bucketName}/requirements.txt /home/ubuntu/auth-service/`,
      `aws s3 sync s3://${wheelBucket.bucketName}/src /home/ubuntu/auth-service/src`,
      'pip install --no-index --find-links=/home/ubuntu/auth-service/src/wheels -r /home/ubuntu/auth-service/requirements.txt',
      'sudo systemctl start nginx',
      'sudo systemctl enable nginx',
      'echo "server { \
          listen 80; \
          server_name genflowly.com; \
          location / { \
              proxy_pass http://127.0.0.1:8000; \
              proxy_set_header Host \\$host; \
              proxy_set_header X-Real-IP \\$remote_addr; \
              proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for; \
              proxy_set_header X-Forwarded-Proto \\$scheme; \
          } \
      }" | sudo tee /etc/nginx/sites-available/auth-service',
      'sudo ln -sf /etc/nginx/sites-available/auth-service /etc/nginx/sites-enabled/',
      'sudo rm -f /etc/nginx/sites-enabled/default',
      'sudo nginx -t && sudo systemctl reload nginx',
      'echo "export AWS_DEFAULT_REGION=us-east-1" >> /home/ubuntu/.bashrc',
      'echo "export AWS_DEFAULT_REGION=us-east-1" | sudo tee -a /etc/environment',
      `sed -i 's/AUTHENTICATION_DDB_TABLE = "user_authentication"/AUTHENTICATION_DDB_TABLE = "${props.dynamoDbTable.tableName}"/g' /home/ubuntu/auth-service/src/constants.py`,
      'cd /home/ubuntu/auth-service && /home/ubuntu/auth-service/venv/bin/gunicorn --bind 127.0.0.1:8000 src.app:app -D --chdir /home/ubuntu/auth-service',
      'echo "#!/bin/bash\n\
    if sudo certbot certonly --nginx -d genflowly.com --non-interactive --agree-tos --email authentication-beta@genflowly.com; then\n\
        echo \\"server { \
            listen 80; \
            server_name genflowly.com; \
            return 301 https://\\$server_name\\$request_uri; \
        } \
        server { \
            listen 443 ssl; \
            server_name genflowly.com; \
            ssl_certificate /etc/letsencrypt/live/genflowly.com/fullchain.pem; \
            ssl_certificate_key /etc/letsencrypt/live/genflowly.com/privkey.pem; \
            location / { \
                proxy_pass http://127.0.0.1:8000; \
                proxy_set_header Host \\$host; \
                proxy_set_header X-Real-IP \\$remote_addr; \
                proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for; \
                proxy_set_header X-Forwarded-Proto \\$scheme; \
            } \
        }\\" | sudo tee /etc/nginx/sites-available/auth-service\n\
        sudo nginx -t && sudo systemctl reload nginx\n\
        echo \\"HTTPS configuration complete\\" >> /home/ubuntu/https_setup.log\n\
    else\n\
        echo \\"Certificate generation failed. Run this script again after DNS propagation is complete.\\" >> /home/ubuntu/https_setup.log\n\
    fi" | tee /home/ubuntu/setup_https.sh',
      'chmod +x /home/ubuntu/setup_https.sh',
      '/home/ubuntu/setup_https.sh'
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
    createAndAssignDefaultElasticIp(
      `${AUTHENTICATION_SERVICE_NAME}${DELMITER}EIP`,
      this.instance,
      stage,
      this
    );
  }
}