import unittest
from unittest.mock import patch, MagicMock
from flask import json

from src.app import app

class FlaskAppTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    @patch('src.app.authorize_with_google')
    @patch('src.app.extract_email_from_token')
    @patch('src.app.is_user_exists')
    @patch('src.app.create_user')
    @patch('src.app.authenticate_user')
    def test_signin_with_google_success_new_user(self, mock_authenticate, mock_create, mock_exists, 
                                                 mock_extract_email, mock_authorize):
        mock_authorize.return_value = ('access_token', 'refresh_token', 'id_token')
        mock_extract_email.return_value = 'new_user@example.com'
        mock_exists.return_value = False
        mock_create.return_value = True
        mock_authenticate.return_value = ({'status': 'success', 'token': 'auth_token'}, 200)

        response = self.app.post('/api/v1/signinWithGoogle', 
                                 data=json.dumps({'authorization_code': 'test_code'}),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data, {'status': 'success', 'token': 'auth_token'})
        mock_create.assert_called_once()

    @patch('src.app.authorize_with_google')
    @patch('src.app.extract_email_from_token')
    @patch('src.app.is_user_exists')
    @patch('src.app.create_user')
    @patch('src.app.authenticate_user')
    def test_signin_with_google_success_existing_user(self, mock_authenticate, mock_create, mock_exists, 
                                                      mock_extract_email, mock_authorize):
        mock_authorize.return_value = ('access_token', 'refresh_token', 'id_token')
        mock_extract_email.return_value = 'existing_user@example.com'
        mock_exists.return_value = True
        mock_authenticate.return_value = ({'status': 'success', 'token': 'auth_token'}, 200)

        response = self.app.post('/api/v1/signinWithGoogle', 
                                 data=json.dumps({'authorization_code': 'test_code'}),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data, {'status': 'success', 'token': 'auth_token'})
        mock_create.assert_not_called()

    def test_signin_with_google_missing_code(self):
        response = self.app.post('/api/v1/signinWithGoogle', 
                                 data=json.dumps({}),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertEqual(data, {'error': "'Authorization code is required in parameters'"})

    @patch('src.app.authorize_with_google')
    def test_signin_with_google_authorization_failure(self, mock_authorize):
        mock_authorize.side_effect = Exception("Authorization failed")

        response = self.app.post('/api/v1/signinWithGoogle', 
                                 data=json.dumps({'authorization_code': 'test_code'}),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 500)
        data = json.loads(response.data)
        self.assertEqual(data, {'error': 'Exception occurred during authorization with Google'})

    @patch('src.app.authorize_with_google')
    @patch('src.app.extract_email_from_token')
    @patch('src.app.is_user_exists')
    def test_signin_with_google_user_verification_failure(self, mock_exists, mock_extract_email, mock_authorize):
        mock_authorize.return_value = ('access_token', 'refresh_token', 'id_token')
        mock_extract_email.return_value = 'test@example.com'
        mock_exists.side_effect = Exception("Database error")

        response = self.app.post('/api/v1/signinWithGoogle', 
                                 data=json.dumps({'authorization_code': 'test_code'}),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 500)
        data = json.loads(response.data)
        self.assertEqual(data, {'error': 'Exception occurred during customer verification'})

    @patch('src.app.authorize_with_google')
    @patch('src.app.extract_email_from_token')
    @patch('src.app.is_user_exists')
    @patch('src.app.create_user')
    def test_signin_with_google_user_creation_failure(self, mock_create, mock_exists, mock_extract_email, mock_authorize):
        mock_authorize.return_value = ('access_token', 'refresh_token', 'id_token')
        mock_extract_email.return_value = 'test@example.com'
        mock_exists.return_value = False
        mock_create.return_value = False

        response = self.app.post('/api/v1/signinWithGoogle', 
                                 data=json.dumps({'authorization_code': 'test_code'}),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 500)
        data = json.loads(response.data)
        self.assertEqual(data, {'error': 'Exception occurred during customer signup'})

    @patch('src.app.authorize_with_google')
    @patch('src.app.extract_email_from_token')
    @patch('src.app.is_user_exists')
    @patch('src.app.create_user')
    @patch('src.app.authenticate_user')
    def test_signin_with_google_authentication_failure(self, mock_authenticate, mock_create, mock_exists, 
                                                       mock_extract_email, mock_authorize):
        mock_authorize.return_value = ('access_token', 'refresh_token', 'id_token')
        mock_extract_email.return_value = 'test@example.com'
        mock_exists.return_value = True
        mock_authenticate.side_effect = Exception("Authentication failed")

        response = self.app.post('/api/v1/signinWithGoogle', 
                                 data=json.dumps({'authorization_code': 'test_code'}),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 500)
        data = json.loads(response.data)
        self.assertEqual(data, {'error': 'Exception occurred during customer authentication'})

if __name__ == '__main__':
    unittest.main()