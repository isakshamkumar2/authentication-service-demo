#!/bin/bash
set -ex

# Variables
BUCKET_NAME=$1
PORT=$2

# Update system and install dependencies
sudo yum update -y
sudo yum install -y gcc openssl-devel bzip2-devel libffi-devel zlib-devel wget

# Download and install Python 3.11
PYTHON_VERSION="3.11.8"
PYTHON_SRC_DIR="/opt/Python-$PYTHON_VERSION"

if ! [ -d "$PYTHON_SRC_DIR" ]; then
  cd /opt
  sudo wget "https://www.python.org/ftp/python/$PYTHON_VERSION/Python-$PYTHON_VERSION.tgz"
  sudo tar xzf "Python-$PYTHON_VERSION.tgz"
  cd "Python-$PYTHON_VERSION"
  sudo ./configure --enable-optimizations
  sudo make altinstall
  sudo rm -f "/opt/Python-$PYTHON_VERSION.tgz"
fi

# Create symlinks
sudo ln -sf /usr/local/bin/python3.11 /usr/bin/python3
sudo ln -sf /usr/local/bin/pip3.11 /usr/bin/pip3

# Verify Python version
python3 --version

# Create and activate a virtual environment
if ! [ -d "/home/ec2-user/venv" ]; then
  python3 -m venv /home/ec2-user/venv
fi
source /home/ec2-user/venv/bin/activate

# Upgrade pip and install wheel
pip install --upgrade pip wheel setuptools

# Create application directory
mkdir -p /home/ec2-user/auth-service
cd /home/ec2-user/auth-service

# Download application files from S3
aws s3 cp "s3://${BUCKET_NAME}/src/" . --recursive

# Download and unzip wheels from S3
aws s3 cp "s3://${BUCKET_NAME}/wheels/wheels.zip" ./wheels.zip
unzip -o wheels.zip -d ./wheels/
rm wheels.zip

# Install dependencies from wheels
pip install wheels/*.whl

# Create Gunicorn service file
sudo tee /etc/systemd/system/auth-service.service << EOF
[Unit]
Description=Gunicorn instance to serve auth service
After=network.target

[Service]
User=ec2-user
Group=ec2-user
WorkingDirectory=/home/ec2-user/auth-service
Environment="PATH=/home/ec2-user/venv/bin"
ExecStart=/home/ec2-user/venv/bin/gunicorn --workers 3 --bind 0.0.0.0:${PORT} app:app --log-level debug --error-logfile /home/ec2-user/auth-service/gunicorn-error.log --access-logfile /home/ec2-user/auth-service/gunicorn-access.log

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd, start and enable the Gunicorn service
sudo systemctl daemon-reload
sudo systemctl start auth-service
sudo systemctl enable auth-service

echo "Setup script completed"
