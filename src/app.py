from flask import Flask, request, jsonify
from prometheus_flask_exporter import PrometheusMetrics
from typing import Any, Dict
import logging
from flask_cors import CORS

from src.constants import API_PREFIX, API_VERSION
from src.service import (
    authorize_with_google,
    is_user_exists,
    create_user,
    authenticate_user,
)
from src.local_utils import extract_email_from_token

app = Flask(__name__)
CORS(app)
metrics = PrometheusMetrics(app)

# static information as metric
metrics.info("authorization_service", "Metrics for Sign in with Google and Apple", version="1.0.0")

metrics.register_default(
    metrics.counter(
        'by_path_counter', 'Request count by request paths',
        labels={'path': lambda: request.path}
    )
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.route(f"/{API_PREFIX}/{API_VERSION}/signinWithGoogle", methods=["POST"])
@metrics.gauge('in_progress', 'Long running requests in progress')
def signin_with_google() -> Any:
    try:
        data: Dict[str, Any] = request.get_json()
        if data is None:
            raise ValueError("POST parameters empty")
        if "authorization_code" not in data:
            raise KeyError("Authorization code is required in parameters")
    except ValueError as e:
        logger.error(f"ValueError: {e}")
        return jsonify({"error": str(e)}), 400
    except KeyError as e:
        logger.error(f"KeyError: {e}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error 3: {e}")
        return jsonify({"error": "An unexpected error occurred"}), 500
    # Step 1 - Get Authorization code from request
    authorization_code: str = data["authorization_code"]
    # Step 2 - Request authorization with Google
    try:
        access_token, refresh_token, id_token = authorize_with_google(authorization_code)
    except Exception:
        return jsonify({"error": "Exception occurred during authorization with Google"}), 500
    user_email = extract_email_from_token(id_token)
    # Step 3 - Check if customer exists
    try:
        user_exists: bool = is_user_exists(user_email)
    except Exception:
        return jsonify({"error": "Exception occurred during customer verification"}), 500

    # Step 4 - Create customer if not exists
    if not user_exists:
        user_create_success = create_user(user_email, id_token, access_token, refresh_token)
        if not user_create_success:
            return jsonify({"error": "Exception occurred during customer signup"}), 500

    # Step 5 - Authenticate Customer
    try:
        response = authenticate_user(user_email)
    except Exception:
        return jsonify({"error": "Exception occurred during customer authentication"}), 500

    return response


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200

if __name__ == "__main__":
    app.run()
