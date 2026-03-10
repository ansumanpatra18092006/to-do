import os

SECRET_KEY = os.environ.get('SECRET_KEY', 'taskflow-secret-2024')
DATABASE = os.path.join(os.path.dirname(__file__), 'instance', 'database.db')
DEBUG = True