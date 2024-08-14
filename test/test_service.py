import unittest
from unittest.mock import patch, MagicMock
import json
from flask import Flask, jsonify

from src.service import (
    authorize_with_google,
    is_user_exists,
    create_user,
    authenticate_user,
    _extract_name_from_token,
    _extract_profile_from_token,
    _fetch_sign_with_google_secrets_from_aws
)

class TestService(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)

    @patch('src.service._fetch_sign_with_google_secrets_from_aws')
    @patch('src.service.Flow')
    def test_authorize_with_google_success(self, mock_flow, mock_fetch_secrets):
        mock_fetch_secrets.return_value = ('client_id', 'client_secret', 'redirect_uri')
        mock_credentials = MagicMock()
        mock_credentials.token = 'access_token'
        mock_credentials.refresh_token = 'refresh_token'
        mock_credentials.id_token = 'id_token'
        mock_flow.from_client_config.return_value.credentials = mock_credentials

        result = authorize_with_google('auth_code')
        self.assertEqual(result, ('access_token', 'refresh_token', 'id_token'))

    @patch('src.service._fetch_sign_with_google_secrets_from_aws')
    @patch('src.service.Flow')
    def test_authorize_with_google_failure(self, mock_flow, mock_fetch_secrets):
        mock_fetch_secrets.return_value = ('client_id', 'client_secret', 'redirect_uri')
        mock_flow.from_client_config.side_effect = Exception("Auth failed")

        result = authorize_with_google('auth_code')
        self.assertIsNone(result)

    @patch('src.service.read_from_dynamodb')
    def test_is_user_exists_true(self, mock_read):
        mock_read.return_value = {"status": 200}
        self.assertTrue(is_user_exists('user@example.com'))

    @patch('src.service.read_from_dynamodb')
    def test_is_user_exists_false(self, mock_read):
        mock_read.return_value = {"status": 404}
        self.assertFalse(is_user_exists('user@example.com'))

    @patch('src.service.read_from_dynamodb')
    def test_is_user_exists_error(self, mock_read):
        mock_read.side_effect = Exception("DB error")
        self.assertIsNone(is_user_exists('user@example.com'))

    @patch('src.service._extract_name_from_token')
    @patch('src.service._extract_profile_from_token')
    @patch('src.service.get_secret')
    @patch('src.service.encrypt_message')
    @patch('src.service.save_to_dynamodb')
    def test_create_user_success(self, mock_save, mock_encrypt, mock_get_secret, mock_profile, mock_name):
        mock_name.return_value = "Test User"
        mock_profile.return_value = {"profile": "data"}
        mock_get_secret.return_value = {"encryption_secret_key": "secret"}
        mock_encrypt.return_value = b"encrypted"
        mock_save.return_value = {"status": 200}

        result = create_user("user@example.com", "id_token", "access_token", "refresh_token")
        self.assertTrue(result)

    @patch('src.service._extract_name_from_token')
    @patch('src.service._extract_profile_from_token')
    @patch('src.service.get_secret')
    @patch('src.service.encrypt_message')
    @patch('src.service.save_to_dynamodb')
    def test_create_user_failure(self, mock_save, mock_encrypt, mock_get_secret, mock_profile, mock_name):
        mock_name.return_value = "Test User"
        mock_profile.return_value = {"profile": "data"}
        mock_get_secret.return_value = {"encryption_secret_key": "secret"}
        mock_encrypt.return_value = b"encrypted"
        mock_save.return_value = {"status": 500}

        result = create_user("user@example.com", "id_token", "access_token", "refresh_token")
        self.assertFalse(result)

    @patch('src.service.get_secret')
    @patch('src.service.create_cookie')
    def test_authenticate_user_success(self, mock_create_cookie, mock_get_secret):
        mock_get_secret.return_value = {"response": json.dumps({"encryption_secret_key": "secret"})}
        mock_create_cookie.return_value = ({"status": "success"}, 200)

        with self.app.app_context():
            result = authenticate_user("user@example.com")
        self.assertEqual(result, ({"status": "success"}, 200))

    @patch('src.service.get_secret')
    def test_authenticate_user_missing_key(self, mock_get_secret):
        mock_get_secret.return_value = {"response": json.dumps({})}

        with self.app.app_context():
            result = authenticate_user("user@example.com")
        self.assertEqual(result[1], 400)  
        self.assertIn("error", json.loads(result[0].get_data(as_text=True)))

    @patch('src.service.get_secret')
    def test_authenticate_user_invalid_json(self, mock_get_secret):
        mock_get_secret.return_value = {"response": "invalid json"}

        with self.app.app_context():
            result = authenticate_user("user@example.com")
        self.assertEqual(result[1], 500)  
        self.assertIn("error", json.loads(result[0].get_data(as_text=True)))

    @patch('src.service.extract_name')
    def test_extract_name_from_token(self, mock_extract):
        mock_extract.return_value = "Test User"
        result = _extract_name_from_token("id_token")
        self.assertEqual(result, "Test User")

    @patch('src.service.extract_profile')
    def test_extract_profile_from_token(self, mock_extract):
        mock_extract.return_value = {"profile": "data"}
        result = _extract_profile_from_token("id_token")
        self.assertEqual(result, {"profile": "data"})

    @patch('src.service.get_secret')
    def test_fetch_sign_with_google_secrets_success(self, mock_get_secret):
        mock_get_secret.return_value = {
            "response": json.dumps({
                "client_id": "id",
                "client_secret": "secret",
                "redirect_uri": "uri"
            })
        }
        result = _fetch_sign_with_google_secrets_from_aws()
        self.assertEqual(result, ("id", "secret", "uri"))

    @patch('src.service.get_secret')
    def test_fetch_sign_with_google_secrets_missing_key(self, mock_get_secret):
        mock_get_secret.return_value = {
            "response": json.dumps({
                "client_id": "id",
                "client_secret": "secret"
            })
        }
        result = _fetch_sign_with_google_secrets_from_aws()
        self.assertIsNone(result)

if __name__ == '__main__':
    unittest.main()