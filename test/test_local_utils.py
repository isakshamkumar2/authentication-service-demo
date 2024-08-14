import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
from flask import Flask
from http.cookies import SimpleCookie

from src.local_utils import extract_email_from_token, create_cookie
from src.constants import COOKIE_DAYS_TO_EXPIRE, AUTHENTICATION_DDB_TABLE

class TestLocalUtils(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)

    @patch('src.local_utils.extract_email')
    def test_extract_email_from_token(self, mock_extract_email):
        mock_extract_email.return_value = 'test@example.com'
        result = extract_email_from_token('dummy_token')
        self.assertEqual(result, 'test@example.com')
        mock_extract_email.assert_called_once_with('dummy_token')

    @patch('src.local_utils.datetime')
    @patch('src.local_utils.create_jwt')
    @patch('src.local_utils.update_to_dynamodb')
    def test_create_cookie_success(self, mock_update, mock_create_jwt, mock_datetime):
        mock_now = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.now.return_value = mock_now
        mock_create_jwt.return_value = 'dummy_jwt_token'
        mock_update.return_value = {'status': 200}

        with self.app.test_request_context():
            result = create_cookie('test@example.com', 'secret_key')

        self.assertIsNotNone(result)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data, b'Cookie is set using SimpleCookie!')

        self.assertIn('Set-Cookie', result.headers)
        cookie = SimpleCookie()
        cookie.load(result.headers.get('Set-Cookie'))
        self.assertIn('session', cookie)
        self.assertEqual(cookie['session'].value, 'dummy_jwt_token')
        self.assertTrue(cookie['session']['httponly'])
        self.assertTrue(cookie['session']['secure'])

        expected_payload = {
            "email": 'test@example.com',
            "iat": mock_now,
            "exp": mock_now + timedelta(days=COOKIE_DAYS_TO_EXPIRE),
        }
        mock_create_jwt.assert_called_once_with(expected_payload, 'secret_key')

        mock_update.assert_called_once_with(
            AUTHENTICATION_DDB_TABLE,
            {"email": 'test@example.com'},
            {":sst": str(mock_now), ":jwt": 'dummy_jwt_token'},
            "SET session_start_time = :sst, jwt = :jwt",
        )

    @patch('src.local_utils.datetime')
    @patch('src.local_utils.create_jwt')
    @patch('src.local_utils.update_to_dynamodb')
    def test_create_cookie_update_failure(self, mock_update, mock_create_jwt, mock_datetime):
        mock_now = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.now.return_value = mock_now
        mock_create_jwt.return_value = 'dummy_jwt_token'
        mock_update.return_value = {'status': 500}

        with self.app.test_request_context():
            result = create_cookie('test@example.com', 'secret_key')

        self.assertIsNone(result)

    @patch('src.local_utils.datetime')
    @patch('src.local_utils.create_jwt')
    def test_create_cookie_exception(self, mock_create_jwt, mock_datetime):
        mock_create_jwt.side_effect = Exception("JWT creation failed")

        with self.app.test_request_context():
            with self.assertLogs(level='ERROR') as log:
                result = create_cookie('test@example.com', 'secret_key')

        self.assertIsNone(result)
        self.assertIn('ERROR:root:ValueError: JWT creation failed', log.output[0])

if __name__ == '__main__':
    unittest.main()