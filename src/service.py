from datetime import datetime
import json
from typing import Any
import logging
from flask import jsonify

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from utils.jwt_utils import extract_name, extract_profile
from utils.aws_dynamodb_utils import read_from_dynamodb
from utils.aws_secrets_utils import get_secret
from utils.hashing_utils import encrypt_message
from utils.aws_dynamodb_utils import save_to_dynamodb

from src.constants import (
    GOOGLE_AUTH_URI,
    GOOGLE_TOKEN_URI,
    GOOGLE_PROFILE_INFO_SCOPE,
    GOOGLE_OPENID_SCOPE,
    GOOGLE_EMAIL_SCOPE,
    AUTHENTICATION_DDB_TABLE,
    AWS_DEFAULT_REGION,
    AUTHENTICATION_SECRET_NAME,
)
from src.local_utils import create_cookie

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def authorize_with_google(authorization_code) -> Any:
    client_id, client_secret, redirect_uri = _fetch_sign_with_google_secrets_from_aws()
    try:
        flow: Flow = Flow.from_client_config(
            client_config={
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uris": [redirect_uri],
                    "auth_uri": GOOGLE_AUTH_URI,
                    "token_uri": GOOGLE_TOKEN_URI,
                }
            },
            scopes=[GOOGLE_PROFILE_INFO_SCOPE, GOOGLE_OPENID_SCOPE, GOOGLE_EMAIL_SCOPE],
            redirect_uri=redirect_uri,
        )
        flow.fetch_token(code=authorization_code)
        credentials: Credentials = flow.credentials
        access_token = credentials.token
        refresh_token = credentials.refresh_token
        id_token = credentials.id_token
        return access_token, refresh_token, id_token
    except Exception as e:
        logger.error(f"Error fetching tokens from Google: {e}")


def is_user_exists(user_email) -> bool:
    try:
        response = read_from_dynamodb(
            AUTHENTICATION_DDB_TABLE, {"email": user_email}, AWS_DEFAULT_REGION
        )
        if response["status"] == 200:
            return True
        elif response["status"] == 404:
            return False
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in the event body: {e}")
    except Exception as e:
        logging.error(f"Unexpected error: {str(e)}")


def create_user(user_email, id_token, access_token, refresh_token):
    try:
        user_full_name = _extract_name_from_token(id_token)
        user_google_profile = _extract_profile_from_token(id_token)

        authentication_secrets: dict = get_secret(AUTHENTICATION_SECRET_NAME)
        encryption_secret_key: str = authentication_secrets["encryption_secret_key"]
        access_token_encrypted = encrypt_message(
            access_token, encryption_secret_key
        ).decode("utf-8")
        refresh_token_encrypted = encrypt_message(
            refresh_token, encryption_secret_key
        ).decode("utf-8")

        created_at = datetime.utcnow().isoformat()
        data = {
            "email": user_email,
            "profile": user_google_profile,
            "access_token": access_token_encrypted,
            "refresh_token": refresh_token_encrypted,
            "name": user_full_name,
            "created_at": created_at,
            "oidc_provider": "google-oauth2",
        }

        response = save_to_dynamodb(AUTHENTICATION_DDB_TABLE, data, AWS_DEFAULT_REGION)

        if response["status"] == 200:
            return True
        else:
            logging.error("User Creation save to DDB failed", response)
            return False
    except json.JSONDecodeError as e:
        logging.error(f"JSONDecodeError: {str(e)}")
        return False
    except Exception as e:
        logging.error(f"Unexpected error: {str(e)}")
        return False


def authenticate_user(user_email):
    try:
        authentication_secrets: dict = get_secret(AUTHENTICATION_SECRET_NAME)
        authentication_secrets_map = json.loads(authentication_secrets["response"])
        if not all([authentication_secrets_map["encryption_secret_key"]]):
            raise KeyError("AUTHENTICATION_SECRET_NAME not present in AWS Secrets")
        encryption_secret_key: str = authentication_secrets_map["encryption_secret_key"]
        response = create_cookie(user_email, encryption_secret_key)
        return response
    except KeyError as ke:
        logger.error(f"KeyError: {ke}")
        return jsonify({"error": str(ke)}), 400
    except Exception as e:
        logger.error(f"Unexpected error 2: {e}")
        return jsonify({"error": "An unexpected error occurred"}), 500


def _extract_name_from_token(id_token):
    return extract_name(id_token)


def _extract_profile_from_token(id_token):
    return extract_profile(id_token)


def _fetch_sign_with_google_secrets_from_aws() -> Any:
    try:
        authentication_secrets = get_secret(AUTHENTICATION_SECRET_NAME)
        authentication_secrets_map = json.loads(authentication_secrets["response"])

        if not all(
                [
                    authentication_secrets_map["client_id"],
                    authentication_secrets_map["client_secret"],
                    authentication_secrets_map["redirect_uri"],
                ]
        ):
            raise KeyError("Error extracting client_id OR client_secret OR redirect_uri from AWS "
                           "secrets")

        client_id: str = authentication_secrets_map["client_id"]
        client_secret: str = authentication_secrets_map["client_secret"]
        redirect_uri: str = authentication_secrets_map["redirect_uri"]
        return client_id, client_secret, redirect_uri
    except KeyError as e:
        logger.error(f"KeyError: {e}")
    except Exception as e:
        logger.error(f"Unexpected error in _fetch_sign_with_google_secrets_from_aws: {e}")
