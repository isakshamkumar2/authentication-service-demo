1. `pip freeze > requirements.in`
2. `pip install pip-tools`
3. `touch requirements.in dev-requirements.in`
4. `pip-compile`
5. `pip-sync`
6. `brew install ruff`
7. `ruff check`
8. `ruff format`
9. `ruff check --fix`