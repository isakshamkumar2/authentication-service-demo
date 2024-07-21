from src.constants import (
    COOKIE_DAYS_TO_EXPIRE,
    AUTHENTICATION_DDB_TABLE,
)
from flask import make_response
from utils.jwt_utils import extract_email
from http.cookies import SimpleCookie
from datetime import datetime, timedelta
from utils.jwt_utils import create_jwt
from utils.aws_dynamodb_utils import update_to_dynamodb

import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def extract_email_from_token(id_token):
    return extract_email(id_token)


def create_cookie(user_email, encryption_secret_key):
    try:
        session_start_time = datetime.now()
        jwt_payload = {
            "email": user_email,
            "iat": session_start_time,
            "exp": session_start_time + timedelta(days=COOKIE_DAYS_TO_EXPIRE),
        }
        cookie_output = make_response("Cookie is set using SimpleCookie!")
        token = create_jwt(jwt_payload, encryption_secret_key)
        cookie: SimpleCookie = SimpleCookie()
        cookie["session"] = token
        cookie["session"]["httponly"] = True
        cookie["session"]["secure"] = True
        cookie["session"]["secure"] = True
        for key, morsel in cookie.items():
            cookie_output.headers.add('Set-Cookie', morsel.OutputString())


        response = update_to_dynamodb(
            AUTHENTICATION_DDB_TABLE,
            {"email": user_email},
            {":sst": str(session_start_time), ":jwt": token},
            "SET session_start_time = :sst, jwt = :jwt",
        )

        if response["status"] == 200:
            return cookie_output
        else:
            raise ValueError("Unable to create session")
    except Exception as e:
        logging.error(f"ValueError: {str(e)}")
